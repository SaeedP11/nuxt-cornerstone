import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import { ensureCornerstone, getLoadedCornerstone } from '../cornerstone'

export interface PrefetchOptions {
  /**
   * Images decoded at once. Default: `4`.
   *
   * Decoding happens in the web worker pool, so this is really a ceiling on
   * how much of that pool the prefetch is allowed to hold. Too high and the
   * slice the user just scrolled to queues behind twenty they have not asked
   * for yet.
   */
  concurrency?: number
  /**
   * Index to start from. Default: `0`.
   *
   * Pass the slice that is on screen: with the default `order`, loading fans
   * out from there, so scrolling either way finds images already decoded.
   */
  from?: number
  /**
   * - `'outward'` (default) alternates either side of {@link PrefetchOptions.from}.
   * - `'forward'` runs from `from` to the end of the stack, which is the order
   *   cine playback consumes them in.
   */
  order?: 'outward' | 'forward'
  /** Passed to Cornerstone's loader. Lower runs sooner. Default: `0`. */
  priority?: number
  /**
   * Passed to Cornerstone's loader, as `Enums.RequestType`. Default:
   * `'prefetch'`, which is the class the request pool serves after anything
   * the user is waiting on.
   */
  requestType?: string
  /** Called after each image settles. */
  onProgress?: (progress: PrefetchProgress) => void
}

export interface PrefetchProgress {
  /** Images in the cache — decoded by this run, or already there when it began. */
  loaded: number
  /** Images that could not be decoded. */
  failed: number
  /** Images this run was asked for. */
  total: number
}

export interface PrefetchResult extends PrefetchProgress {
  /** True when {@link useImagePrefetch.cancel} or a newer run stopped this one. */
  cancelled: boolean
  /**
   * True when the image cache ran out of room and the rest of the stack was
   * left alone. What was decoded stays decoded; raise the ceiling with
   * `cache.setMaxCacheSize()` if a whole study has to fit.
   */
  cacheFull: boolean
}

/** One `prepare()` call's worth of mutable bookkeeping. */
interface Run {
  cancelled: boolean
  cacheFull: boolean
  inFlight: Set<string>
}

const DEFAULT_CONCURRENCY = 4

/**
 * Decode a stack into Cornerstone's image cache ahead of time.
 *
 * A stack viewport loads each slice the moment it is shown, which is right for
 * scrolling and wrong for anything that moves on its own: at 15 frames a
 * second the decode never keeps up and playback stutters through whatever
 * happens to be cached. Preparing the stack first turns every later frame
 * change into a cache hit.
 *
 * State is per call, so a component that prepares two stacks tracks them with
 * two instances. One instance runs one prepare at a time: a second call cancels
 * the first, which is what you want when the user switches series mid-load.
 */
export function useImagePrefetch() {
  const loaded = ref(0)
  const failed = ref(0)
  const total = ref(0)
  const pending = ref(false)
  const cacheFull = ref(false)

  /** 0..1, and `1` when there is nothing to do, so a bar does not sit empty. */
  const progress = computed(() => {
    if (total.value === 0) return 1
    return (loaded.value + failed.value) / total.value
  })

  /** Every image has been through the loader, successfully or not. */
  const complete = computed(() => !pending.value && loaded.value + failed.value >= total.value)

  let run: Run | null = null

  /**
   * Decode `imageIds` into the cache.
   *
   * Images already in the cache are counted and skipped rather than reloaded,
   * so calling this again after adding to a stack only fetches the new slices.
   */
  async function prepare(imageIds: string[], options: PrefetchOptions = {}): Promise<PrefetchResult> {
    const {
      concurrency = DEFAULT_CONCURRENCY,
      from = 0,
      order = 'outward',
      priority = 0,
      onProgress,
    } = options

    cancel()

    const { core } = await ensureCornerstone()
    const { cache, imageLoader, Enums } = core
    const requestType = options.requestType ?? Enums.RequestType.Prefetch

    const current: Run = { cancelled: false, cacheFull: false, inFlight: new Set() }
    run = current

    const queue = orderImageIds(imageIds, from, order)
    loaded.value = 0
    failed.value = 0
    total.value = queue.length
    cacheFull.value = false
    pending.value = queue.length > 0

    function report(): void {
      onProgress?.({ loaded: loaded.value, failed: failed.value, total: total.value })
    }

    report()

    let cursor = 0

    async function worker(): Promise<void> {
      while (cursor < queue.length) {
        if (current.cancelled) return

        const imageId = queue[cursor++]!

        if (cache.isLoaded(imageId)) {
          loaded.value += 1
          report()
          continue
        }

        // Asking for an image the cache cannot hold makes Cornerstone evict
        // something else to make room, so a study larger than the cache would
        // thrash: each new slice would throw out one we had just decoded, and
        // the run would finish with nothing gained. Stop instead, and say so.
        // Checked after the cache hit above, so a stack that is already
        // decoded still reports itself as prepared on a full cache.
        if (cache.getBytesAvailable() <= 0) {
          current.cacheFull = true
          return
        }

        current.inFlight.add(imageId)
        try {
          await imageLoader.loadAndCacheImage(imageId, { priority, requestType })
          loaded.value += 1
        }
        catch {
          // A slice that will not decode is not a reason to abandon the rest;
          // it will simply be missing when playback reaches it.
          if (!current.cancelled) failed.value += 1
        }
        finally {
          current.inFlight.delete(imageId)
        }

        report()
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(Math.max(1, concurrency), queue.length) }, () => worker()),
    )

    if (run === current) {
      run = null
      pending.value = false
      cacheFull.value = current.cacheFull
    }

    return {
      loaded: loaded.value,
      failed: failed.value,
      total: total.value,
      cancelled: current.cancelled,
      cacheFull: current.cacheFull,
    }
  }

  /**
   * Stop the running prepare, and abandon the requests it has in flight.
   *
   * The counters keep their values: a half-prepared stack is still half
   * prepared, and the caller usually wants to say so.
   */
  function cancel(): void {
    const current = run
    if (!current) return

    current.cancelled = true
    run = null
    pending.value = false

    if (current.inFlight.size > 0) {
      getLoadedCornerstone()?.core.imageLoader.cancelLoadImages([...current.inFlight])
      current.inFlight.clear()
    }
  }

  /** Cancel, and forget what was prepared. For when the stack is replaced. */
  function reset(): void {
    cancel()
    loaded.value = 0
    failed.value = 0
    total.value = 0
    cacheFull.value = false
  }

  /**
   * Whether an image is decoded and in the cache, right now.
   *
   * Synchronous and never starts a load, so it is safe to call from a render.
   * Answers `false` until Cornerstone has finished initialising.
   */
  function isPrepared(imageId: string): boolean {
    return getLoadedCornerstone()?.core.cache.isLoaded(imageId) ?? false
  }

  // A component that unmounts mid-load has nothing left to show the images to.
  if (getCurrentScope()) onScopeDispose(cancel)

  return { loaded, failed, total, pending, progress, complete, cacheFull, prepare, cancel, reset, isPrepared }
}

/**
 * The order to fetch a stack in.
 *
 * `'outward'` interleaves the two directions — `k, k+1, k-1, k+2, k-2` — so
 * that the slices next to the one on screen arrive first whichever way the
 * user scrolls. Cine playback runs one way, so `'forward'` serves it better.
 */
function orderImageIds(imageIds: string[], from: number, order: 'outward' | 'forward'): string[] {
  const count = imageIds.length
  if (count === 0) return []

  const start = Math.min(Math.max(Math.trunc(from) || 0, 0), count - 1)

  if (order === 'forward') return imageIds.slice(start).concat(imageIds.slice(0, start))

  const queue: string[] = [imageIds[start]!]
  for (let step = 1; queue.length < count; step++) {
    const after = start + step
    const before = start - step
    if (after < count) queue.push(imageIds[after]!)
    if (before >= 0) queue.push(imageIds[before]!)
  }
  return queue
}

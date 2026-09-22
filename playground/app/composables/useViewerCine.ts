import type { Ref } from 'vue'

/**
 * The frame rates the footer offers.
 *
 * 15 is the default because it is fast enough to read as motion and slow
 * enough that a stack coming off the network can nearly keep up; the ones
 * either side cover walking a stack slowly and playing a short cardiac loop at
 * something close to its acquired rate.
 */
export const FRAME_RATES = [5, 10, 15, 24, 30] as const

/**
 * How much of the stack has to be decoded before play is offered.
 *
 * Waiting for all of it is more than playback needs: the film starts at the
 * first image and the prefetch runs the same way, so half a stack is already
 * a comfortable head start and the rest lands while the first half plays.
 * Waiting for none of it is the stutter the prefetch exists to avoid.
 */
export const PLAY_READY_RATIO = 0.5

/**
 * Cine playback for the stack on screen, and the prefetch that makes it watchable.
 *
 * The two belong together in the demo even though the module keeps them apart:
 * a stack viewport loads each slice as it is shown, so playing a stack nobody
 * has prepared runs at the speed of the decoder rather than at the frame rate
 * that was asked for. So preparing is not something the user has to think of
 * first — a stack starts preparing as soon as it is loaded, and pressing play
 * starts it too if for any reason it is not already done.
 */
export function useViewerCine(imageIds: Ref<string[]>, imageIndex: Ref<number>) {
  const { t } = useCornerstoneI18n()
  const prefetch = useImagePrefetch()
  const cine = useCinePlayer(imageIndex, () => imageIds.value.length, { frameRate: 15 })

  const percent = computed(() => Math.round(prefetch.progress.value * 100))

  /** Everything the stack holds is decoded and in the cache. */
  const prepared = computed(() =>
    prefetch.total.value > 0
    && !prefetch.pending.value
    && !prefetch.cacheFull.value
    && prefetch.loaded.value + prefetch.failed.value >= prefetch.total.value,
  )

  /**
   * Too little of the stack is decoded to play it yet.
   *
   * Only a prepare that is still running holds play back. One that has
   * stopped — finished, cancelled, or cut short by a full cache — releases it
   * whatever it managed, because waiting on a run that is not coming back
   * would leave the button spinning for ever.
   */
  const buffering = computed(() =>
    prefetch.pending.value && prefetch.progress.value < PLAY_READY_RATIO,
  )

  /**
   * How preparation is going, in one line, or `null` when there is nothing to
   * say. Built from state rather than stored as a finished string, so it
   * re-renders in the new language when the locale changes.
   */
  const statusText = computed(() => {
    if (prefetch.pending.value) return t('app.cine.preparing', { percent: percent.value })
    if (prefetch.total.value === 0) return null
    if (prefetch.cacheFull.value) return t('app.cine.cacheFull', { count: prefetch.loaded.value })
    if (prefetch.failed.value > 0) {
      return t('app.cine.preparedWithFailures', {
        count: prefetch.loaded.value,
        failed: prefetch.failed.value,
      })
    }
    if (prepared.value) return t('app.cine.prepared', { count: prefetch.loaded.value })
    return null
  })

  /**
   * Decode the whole stack, fanning out from the slice on screen.
   *
   * `'outward'` is the order for the button: someone who prepares by hand is
   * about to scroll, and scrolling goes both ways.
   */
  function prepare() {
    return prefetch.prepare(imageIds.value, { from: imageIndex.value, order: 'outward' })
  }

  function toggle() {
    // Pausing is always allowed; starting is not, until there is enough of the
    // stack to play. The button is in its loading state here, so this guard is
    // really for the `C` shortcut, which does not go through the button.
    if (!cine.playing.value && buffering.value) return

    // Normally the stack prepared itself when it loaded and there is nothing
    // to do here. This catches the cases where it did not finish — a run the
    // user interrupted by scrubbing to another series and back, or one the
    // image cache cut short. Already-cached slices are counted and skipped,
    // so the repeat costs nothing when it is not needed.
    if (!cine.playing.value && !prepared.value && !prefetch.pending.value) {
      prefetch.prepare(imageIds.value, { from: imageIndex.value, order: 'forward' })
    }
    cine.toggle()
  }

  /**
   * A stack that has just finished loading prepares itself.
   *
   * This watcher fires once the source — bundled samples, picked files, or a
   * series out of an archive — has produced its imageIds, which is after the
   * unpacking and header reading are done and therefore the first moment
   * there is anything to decode. By the time the user reaches for play, the
   * film is usually already in the cache.
   *
   * Playback order rather than outward, because that is what this is for. On
   * a freshly opened stack the two agree anyway: the index is back at 0, and
   * fanning out from the first image only has one direction to go.
   *
   * The other half of the job is the old stack's: a different stack is a
   * different film, so stop it and drop what was prepared for it. The images
   * themselves stay in Cornerstone's cache — this only forgets that we put
   * them there, and the cancelled run abandons whatever it had in flight so
   * the new stack is not queued behind a study nobody is looking at.
   */
  watch(imageIds, (ids) => {
    cine.pause()
    prefetch.reset()
    if (ids.length > 1) prefetch.prepare(ids, { from: imageIndex.value, order: 'forward' })
  })

  return {
    playing: cine.playing,
    canPlay: cine.canPlay,
    frameRate: cine.frameRate,
    loop: cine.loop,
    preparing: prefetch.pending,
    prepared,
    buffering,
    percent,
    statusText,
    play: cine.play,
    pause: cine.pause,
    toggle,
    prepare,
  }
}

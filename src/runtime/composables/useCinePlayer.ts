import { computed, getCurrentScope, onScopeDispose, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'

export interface CinePlayerOptions {
  /** Frames per second. Default: `15`, and clamped to {@link FRAME_RATE_RANGE}. */
  frameRate?: number
  /** Start again from the other end instead of stopping. Default: `true`. */
  loop?: boolean
  /**
   * Reverse at each end rather than jumping back. Default: `false`.
   *
   * This is what a cardiac cine wants — a short loop read back and forth reads
   * as motion, where the jump from last frame to first reads as a glitch.
   */
  bounce?: boolean
  /** `1` plays towards the last image, `-1` towards the first. Default: `1`. */
  direction?: 1 | -1
}

/** What {@link useCinePlayer} will accept as a frame rate. */
export const FRAME_RATE_RANGE = { min: 1, max: 60 } as const

const DEFAULT_FRAME_RATE = 15

/**
 * Play a stack as a film.
 *
 * The player owns no images and no viewport: it advances the index ref it is
 * given, on a wall-clock schedule, and whatever is bound to that index follows.
 * That keeps it usable with `<CornerstoneViewport v-model>`-style bindings, a
 * scrubber, keyboard stepping and anything else, all moving the same value.
 *
 * Frames are paced with `requestAnimationFrame` rather than `setInterval`,
 * which buys two things: the schedule is measured against the clock so it does
 * not drift, and a backgrounded tab stops advancing instead of spending the
 * battery on frames nobody is watching.
 *
 * Nothing here waits for an image to decode. A frame the loader has not caught
 * up with is simply shown late, so a stack played straight off the network
 * stutters — run {@link useImagePrefetch} over it first and playback is a
 * sequence of cache hits.
 */
export function useCinePlayer(
  index: Ref<number>,
  frameCount: MaybeRefOrGetter<number>,
  options: CinePlayerOptions = {},
) {
  const rate = ref(clampFrameRate(options.frameRate ?? DEFAULT_FRAME_RATE))
  const loop = ref(options.loop ?? true)
  const bounce = ref(options.bounce ?? false)
  const direction = ref<1 | -1>(options.direction ?? 1)
  const playing = ref(false)

  const count = computed(() => Math.max(0, Math.trunc(toValue(frameCount)) || 0))
  /**
   * There is a film to play — a single image is a picture, not a film.
   *
   * This is what a transport should be drawn from, not merely disabled by: a
   * play button on a series of one has nothing to do whichever state it is
   * in, and leaving it out says so more clearly than greying it out.
   */
  const canPlay = computed(() => count.value > 1)

  let frame = 0
  /** Timestamp the next frame is due at, on the `requestAnimationFrame` clock. */
  let dueAt = 0

  function tick(now: number): void {
    if (!playing.value) return

    if (now >= dueAt) {
      const interval = 1000 / rate.value
      advance()
      // Catching up is pointless — the frames in between are already gone, and
      // running them back to back would only make the stack sprint. Schedule
      // from the clock when we are on time, and from now when we are behind,
      // which also absorbs the gap left by a tab that was in the background.
      dueAt = now - dueAt > interval ? now + interval : dueAt + interval
    }

    frame = requestAnimationFrame(tick)
  }

  /** Move one frame, and decide what the end of the stack means. */
  function advance(): void {
    const last = count.value - 1
    if (last < 1) return

    let next = index.value + direction.value

    if (next > last || next < 0) {
      if (bounce.value) {
        direction.value = direction.value === 1 ? -1 : 1
        next = index.value + direction.value
      }
      else if (loop.value) {
        next = direction.value === 1 ? 0 : last
      }
      else {
        pause()
        return
      }
    }

    index.value = Math.min(Math.max(next, 0), last)
  }

  function play(): void {
    // `requestAnimationFrame` is browser-only, and there is nothing on a server
    // for a film to play to.
    if (!import.meta.client || playing.value || !canPlay.value) return

    // Pressing play while sitting on the last frame should replay the stack,
    // not stop on the spot. With `bounce` it already reverses, so leave it be.
    const last = count.value - 1
    if (!bounce.value) {
      if (direction.value === 1 && index.value >= last) index.value = 0
      if (direction.value === -1 && index.value <= 0) index.value = last
    }

    playing.value = true
    dueAt = performance.now() + 1000 / rate.value
    frame = requestAnimationFrame(tick)
  }

  function pause(): void {
    if (!playing.value) return
    playing.value = false
    cancelAnimationFrame(frame)
    frame = 0
  }

  function toggle(): void {
    if (playing.value) pause()
    else play()
  }

  /** Change the rate while playing without restarting the film. */
  function setFrameRate(value: number): void {
    const clamped = clampFrameRate(value)
    if (clamped === rate.value) return
    rate.value = clamped
    // The frame already scheduled was due at the old rate; bring it forward or
    // push it out now, so a slider drag is felt at once rather than a second later.
    if (playing.value) dueAt = performance.now() + 1000 / clamped
  }

  /**
   * Writable, so a control can `v-model` it, and clamped on the way in — a
   * `<Slider>` bound straight to a raw ref could otherwise ask for 0 fps, which
   * is an infinite interval rather than a pause.
   */
  const frameRate = computed<number>({
    get: () => rate.value,
    set: setFrameRate,
  })

  /** Play towards the last image (`1`) or the first (`-1`). */
  function setDirection(value: 1 | -1): void {
    direction.value = value
  }

  // The stack was replaced, or emptied. Whatever was playing is not this.
  watch(canPlay, (value) => {
    if (!value) pause()
  })

  if (getCurrentScope()) onScopeDispose(pause)

  return {
    playing,
    frameRate,
    loop,
    bounce,
    direction,
    canPlay,
    play,
    pause,
    toggle,
    setFrameRate,
    setDirection,
  }
}

function clampFrameRate(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FRAME_RATE
  return Math.min(Math.max(value, FRAME_RATE_RANGE.min), FRAME_RATE_RANGE.max)
}

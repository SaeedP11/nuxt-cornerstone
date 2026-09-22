/**
 * Drop focus from a button that was clicked with a pointer.
 *
 * A clicked button keeps focus afterwards, and a focused button owns the
 * spacebar — the browser activates it rather than letting the key through. So
 * picking a tool from the rail with the mouse and then pressing Space appears
 * to do nothing at all: the key is quietly re-pressing the tool button that is
 * still focused, and never reaches the viewer's play/pause binding.
 *
 * `event.detail` is the click count, and it is `0` for a click the browser
 * synthesised from Enter or Space on a focused control. Blurring only when it
 * is non-zero therefore drops focus for mouse and touch, where nobody is
 * following it, and leaves it exactly where it was for anyone driving the page
 * from the keyboard — who needs it to tab onwards from.
 *
 * Attach it once to a toolbar's root and let the clicks bubble to it.
 */
export function releaseFocus(event: MouseEvent) {
  if (event.detail === 0) return
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  target.closest('button')?.blur()
}

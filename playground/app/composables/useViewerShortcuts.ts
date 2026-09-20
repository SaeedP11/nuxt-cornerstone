export interface ViewerShortcutHandlers {
  /** False while nothing is loaded, so the keys stay inert on an empty demo. */
  isEnabled: () => boolean
  /** Reading direction, for mapping the horizontal arrows. */
  isRtl: () => boolean
  step: (delta: number) => void
  first: () => void
  last: () => void
  /** Zero-based position in `TOOLS`. */
  selectToolAt: (position: number) => void
  resetCamera: () => void
  toggleHelp: () => void
}

/** How far PageUp/PageDown move through a stack. */
const PAGE = 10

/**
 * A typing target. PrimeVue's Select and SelectButton are focusable and drive
 * themselves with the arrow keys, so a viewer shortcut must not also fire while
 * one of them has focus.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Keyboard control for the viewer.
 *
 * Vertical arrows and the page keys are direction-neutral and mean the same
 * thing in every locale. The horizontal pair is not: in Farsi the chrome reads
 * right to left, so `ArrowRight` has to mean *backwards* or it disagrees with
 * the direction the rest of the page runs in.
 */
export function useViewerShortcuts(handlers: ViewerShortcutHandlers) {
  function onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (isTyping(event.target)) return

    // `?` is Shift+/ on most layouts, so it is the one binding that may carry a
    // modifier. Everything below it is unmodified.
    if (event.key === '?') {
      handlers.toggleHelp()
      event.preventDefault()
      return
    }

    if (!handlers.isEnabled()) return

    const forward = handlers.isRtl() ? 'ArrowLeft' : 'ArrowRight'
    const back = handlers.isRtl() ? 'ArrowRight' : 'ArrowLeft'

    switch (event.key) {
      case 'ArrowDown':
      case forward:
        handlers.step(1)
        break
      case 'ArrowUp':
      case back:
        handlers.step(-1)
        break
      case 'PageDown':
        handlers.step(PAGE)
        break
      case 'PageUp':
        handlers.step(-PAGE)
        break
      case 'Home':
        handlers.first()
        break
      case 'End':
        handlers.last()
        break
      case 'r':
      case 'R':
        handlers.resetCamera()
        break
      default: {
        // '1'..'7' pick a tool by its position on the rail.
        const position = Number(event.key)
        if (!Number.isInteger(position) || position < 1 || position > TOOLS.length) return
        handlers.selectToolAt(position - 1)
      }
    }

    event.preventDefault()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))
}

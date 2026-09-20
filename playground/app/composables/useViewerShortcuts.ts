export interface ViewerShortcutHandlers {
  /** False while nothing is loaded, so the keys stay inert on an empty demo. */
  isEnabled: () => boolean
  /** Move through the stack, positive forwards. */
  step: (delta: number) => void
  first: () => void
  last: () => void
  /** Move through the archive's series, positive forwards. */
  stepSeries: (delta: number) => void
  setTool: (className: string) => void
  resetViewport: () => void
  toggleHelp: () => void
}

/**
 * A typing target. PrimeVue's Listbox and SelectButton are focusable and drive
 * themselves with the arrow keys, so a viewer shortcut must not also fire while
 * one of them has focus.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Something Space or Enter already activates. Stealing Space from a focused
 * button would make the rail unusable from the keyboard.
 */
function isActivatable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.closest('button, a, [role="button"], [role="option"]') !== null
}

/**
 * Keyboard control for the viewer, following the OHIF viewer's default keymap
 * — the closest thing this corner of the world has to a standard, and the one
 * anyone arriving from a PACS will try first.
 *
 * The horizontal arrows are deliberately unbound: OHIF gives them to moving
 * between viewports, and this demo has one. That also sidesteps the question
 * of which arrow means "forward" when the chrome is right-to-left.
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

    switch (event.key) {
      case 'ArrowDown':
        handlers.step(1)
        break
      case 'ArrowUp':
        handlers.step(-1)
        break
      case 'PageDown':
        handlers.stepSeries(1)
        break
      case 'PageUp':
        handlers.stepSeries(-1)
        break
      case 'Home':
        handlers.first()
        break
      case 'End':
        handlers.last()
        break
      case ' ':
        if (isActivatable(event.target)) return
        handlers.resetViewport()
        break
      default: {
        const tool = TOOLS.find(entry => entry.shortcut === event.key.toLowerCase())
        if (!tool) return
        handlers.setTool(tool.className)
      }
    }

    event.preventDefault()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))
}

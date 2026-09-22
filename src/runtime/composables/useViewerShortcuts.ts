import { onMounted, onUnmounted } from 'vue'

/** A tool the keyboard can select, by its `@cornerstonejs/tools` class name. */
export interface ToolShortcut {
  className: string
  /** A single letter, matched at its QWERTY position — see below. */
  shortcut: string
}

/**
 * The letter bindings, following the OHIF viewer's defaults where it has them:
 * `w`, `p` and `z` for window/level, pan and zoom. OHIF binds no keys for
 * annotation tools, so the rest are conventional rather than specified — `m`
 * for measure because `l` is rotate-left in OHIF, and `b` for the box because
 * `r` is rotate-right.
 *
 * Pass your own list to {@link useViewerShortcuts} when your toolbar offers a
 * different set; a toolbar and its keymap should read from one table, so that
 * the key a button advertises is the key that works.
 */
export const DEFAULT_TOOL_SHORTCUTS: ToolShortcut[] = [
  { className: 'WindowLevelTool', shortcut: 'w' },
  { className: 'PanTool', shortcut: 'p' },
  { className: 'ZoomTool', shortcut: 'z' },
  { className: 'LengthTool', shortcut: 'm' },
  { className: 'RectangleROITool', shortcut: 'b' },
  { className: 'EllipticalROITool', shortcut: 'e' },
  { className: 'ProbeTool', shortcut: 't' },
]

export interface ViewerShortcutHandlers {
  /** False while nothing is loaded, so the keys stay inert on an empty viewer. */
  isEnabled: () => boolean
  /** Move through the stack, positive forwards. */
  step: (delta: number) => void
  first: () => void
  last: () => void
  /** Move through the archive's series, positive forwards. */
  stepSeries: (delta: number) => void
  setTool: (className: string) => void
  resetViewport: () => void
  /** Start or stop cine playback. */
  togglePlay: () => void
  /** Show the application's own list of these bindings. */
  toggleHelp: () => void
}

export interface ViewerShortcutOptions {
  /** Defaults to {@link DEFAULT_TOOL_SHORTCUTS}. */
  tools?: ToolShortcut[]
}

/**
 * Widgets that read the keyboard themselves, and must be left to it.
 *
 * Tag names alone are not enough. Component libraries build their select and
 * listbox widgets out of focusable `div`s carrying ARIA roles, not `<select>`
 * elements, and their type-ahead — press `w` to jump to the first option
 * starting with w — does not call `preventDefault()`. So a letter pressed on a
 * frame-rate select or a series list would search the list and switch the
 * viewer's tool at the same time. Matching on the role is what actually
 * catches them.
 *
 * `[role="slider"]` is deliberately absent. A scrubber that handles the
 * arrows, Home, End and the page keys itself marks each one handled, which the
 * `defaultPrevented` check below already respects; excluding the whole widget
 * would instead make Space dead whenever the scrubber happens to have focus.
 */
const OWNS_KEYBOARD = [
  'input',
  'textarea',
  'select',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
  '[role="textbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
].join(', ')

function ownsKeyboard(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.closest(OWNS_KEYBOARD) !== null
}

/** Inside an open modal. Its own keys work; the viewer's stay out of its way. */
function isInDialog(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.closest('[role="dialog"], [role="alertdialog"]') !== null
}

/**
 * Something Space or Enter already activates. Stealing Space from a focused
 * button would make a toolbar unusable from the keyboard.
 */
function isActivatable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.closest('button, a, [role="button"], [role="option"]') !== null
}

/** The `KeyboardEvent.code` for a letter key, as `'w'` → `'KeyW'`. */
function codeForLetter(letter: string): string {
  return `Key${letter.toUpperCase()}`
}

/**
 * Keyboard control for a viewer, following the OHIF viewer's default keymap
 * — the closest thing this corner of the world has to a standard, and the one
 * anyone arriving from a PACS will try first.
 *
 * Bindings are matched on `event.code`, the physical key, rather than
 * `event.key`, the character it produces. This is not a detail: `event.key`
 * depends on the operating system's keyboard layout, so on a Persian layout
 * the W key reports `'ش'` and on a Russian one `'ц'`, and every letter binding
 * silently stops working — which is exactly the kind of "sometimes it works"
 * that is hard to pin down, because it follows the layout rather than the app.
 * `event.code` names the key's position instead, so `W` is the key marked W on
 * the keyboard whatever it types, and the letters in the tooltips stay true.
 * The trade-off is Dvorak and other remapped layouts, where the keys keep
 * their QWERTY positions; component libraries make the same choice.
 *
 * The horizontal arrows are deliberately unbound: OHIF gives them to moving
 * between viewports, and a single-viewport layout has nowhere to go. That also
 * sidesteps the question of which arrow means "forward" when the chrome is
 * right-to-left.
 *
 * Space is the one place this parts company with OHIF, which resets the
 * viewport with it. Space means play/pause everywhere a person has ever used
 * a media player, and a stack has a film to play, so it goes to cine and the
 * reset moves to `R`. `R` is free here — it is rotate-right in OHIF, and there
 * is no rotate tool in this module's default set.
 */
export function useViewerShortcuts(
  handlers: ViewerShortcutHandlers,
  options: ViewerShortcutOptions = {},
) {
  const tools = options.tools ?? DEFAULT_TOOL_SHORTCUTS

  function onKeydown(event: KeyboardEvent) {
    // The listener is on `window`, so it runs after the focused element's own
    // handler has bubbled past: anything a widget has already dealt with
    // arrives here marked, and is left alone.
    if (event.defaultPrevented) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (ownsKeyboard(event.target)) return

    // `?` is Shift+/ on a Latin layout, so it is the one binding that may
    // carry a modifier, and the one place a character still has to be read:
    // the question mark is not on the same physical key everywhere. The code
    // is checked as well, so the binding survives a layout that reports
    // something else for that key.
    if (event.key === '?' || (event.shiftKey && event.code === 'Slash')) {
      handlers.toggleHelp()
      event.preventDefault()
      return
    }

    // A help dialog traps focus, so everything below would otherwise be
    // driving the stack behind an open modal.
    if (isInDialog(event.target)) return

    if (!handlers.isEnabled()) return

    switch (event.code) {
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
      case 'Space':
        // Space still activates whatever the user has tabbed to: taking it
        // from a focused button would make a toolbar unusable from the
        // keyboard.
        if (isActivatable(event.target)) return
        handlers.togglePlay()
        break
      // `C` for cine, kept alongside Space for the same reason a media player
      // has both a spacebar and a labelled button.
      case 'KeyC':
        handlers.togglePlay()
        break
      case 'KeyR':
        handlers.resetViewport()
        break
      default: {
        const tool = tools.find(entry => codeForLetter(entry.shortcut) === event.code)
        if (!tool) return
        handlers.setTool(tool.className)
      }
    }

    event.preventDefault()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))
}

/**
 * Drop focus from a button that was clicked with a pointer.
 *
 * A clicked button keeps focus afterwards, and a focused button owns the
 * spacebar — the browser activates it rather than letting the key through. So
 * picking a tool from a toolbar with the mouse and then pressing Space appears
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

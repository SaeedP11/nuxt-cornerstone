/**
 * The tools the demo puts on the rail, in rail order.
 *
 * Shared rather than local to the rail component because the keyboard
 * shortcuts select by tool, and the rail advertises each tool's key in its
 * tooltip — both have to read the same table.
 *
 * `shortcut` follows the OHIF viewer's defaults where it has them: `w`, `p`
 * and `z` for window/level, pan and zoom. OHIF binds no keys for annotation
 * tools, so the rest are conventional rather than specified — `m` for measure
 * because `l` is rotate-left in OHIF, and `b` for the box because `r` is
 * rotate-right.
 *
 * `icon` is a primeicons class. There is no ruler or crosshair in the set, so
 * length borrows the plain line and probe the map marker; the tooltip carries
 * the real name.
 */
export interface ToolSpec {
  /** Class name as `@cornerstonejs/tools` exports it. */
  className: string
  /** Key in the demo's own catalogue. */
  key: string
  icon: string
  /** Single lower-case character, matched against `event.key`. */
  shortcut: string
}

export const TOOLS: ToolSpec[] = [
  { className: 'WindowLevelTool', key: 'app.tool.windowLevel', icon: 'pi pi-sun', shortcut: 'w' },
  { className: 'PanTool', key: 'app.tool.pan', icon: 'pi pi-arrows-alt', shortcut: 'p' },
  { className: 'ZoomTool', key: 'app.tool.zoom', icon: 'pi pi-search', shortcut: 'z' },
  { className: 'LengthTool', key: 'app.tool.length', icon: 'pi pi-minus', shortcut: 'm' },
  { className: 'RectangleROITool', key: 'app.tool.rectangle', icon: 'pi pi-stop', shortcut: 'b' },
  { className: 'EllipticalROITool', key: 'app.tool.ellipse', icon: 'pi pi-circle', shortcut: 'e' },
  { className: 'ProbeTool', key: 'app.tool.probe', icon: 'pi pi-map-marker', shortcut: 't' },
]

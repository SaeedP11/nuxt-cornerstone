/**
 * The tools the demo puts on the rail, in rail order.
 *
 * Shared rather than local to the rail component because the keyboard
 * shortcuts select by position — `3` is the third button — so both have to
 * agree on what that order is.
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
}

export const TOOLS: ToolSpec[] = [
  { className: 'WindowLevelTool', key: 'app.tool.windowLevel', icon: 'pi pi-sun' },
  { className: 'PanTool', key: 'app.tool.pan', icon: 'pi pi-arrows-alt' },
  { className: 'ZoomTool', key: 'app.tool.zoom', icon: 'pi pi-search' },
  { className: 'LengthTool', key: 'app.tool.length', icon: 'pi pi-minus' },
  { className: 'RectangleROITool', key: 'app.tool.rectangle', icon: 'pi pi-stop' },
  { className: 'EllipticalROITool', key: 'app.tool.ellipse', icon: 'pi pi-circle' },
  { className: 'ProbeTool', key: 'app.tool.probe', icon: 'pi pi-map-marker' },
]

import { getCurrentScope, onScopeDispose, ref, toValue } from 'vue'
import { readAnnotationJson } from '../annotation-json'
import { ensureCornerstone } from '../cornerstone'
import { imageIdForSopInstanceUid } from '../dicom-instances'
import { t } from '../i18n'
import type { ReadAnnotationsOptions, ReadAnnotationsResult } from '../annotation-json'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { CornerstoneLibs, StackViewport } from '../types'
import type { Types as ToolsTypes } from '@cornerstonejs/tools'

/**
 * A rectangle in image pixel coordinates — the space a detector or a report
 * works in. `(x1, y1)` and `(x2, y2)` are opposite corners in either order.
 */
export interface PixelBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** One box to draw, on the slice its SOPInstanceUID names. */
export interface DicomBox {
  /** SOPInstanceUID (0008,0018) of the slice this box was drawn on. */
  sopInstanceUid: string
  box: PixelBox
  /** Drawn beside the rectangle. Nothing is drawn when it is absent. */
  label?: string
  /**
   * A stable id of your own. Supply one when boxes arrive more than once —
   * re-adding a box with the same id replaces it rather than stacking a second
   * rectangle on the first. Left out, one is generated.
   */
  uid?: string
}

export interface AddBoxesOptions {
  /**
   * Stroke colour, as any CSS colour. Applies to every box this composable
   * draws, not to the user's own measurements. Default: Cornerstone's colour
   * for locked annotations.
   */
  color?: string
  /**
   * Lock the boxes so they cannot be dragged, resized or deleted. Default:
   * `true` — these came from somewhere else and editing them here would
   * silently diverge from the source.
   */
  locked?: boolean
}

export interface AddJsonOptions extends AddBoxesOptions, ReadAnnotationsOptions {}

/** What {@link useDicomAnnotations.addJson} drew, and what it read to draw it. */
export interface AddJsonResult extends AddBoxesResult {
  /** The reader's own account of the file. See {@link ReadAnnotationsResult}. */
  report: ReadAnnotationsResult
}

export interface AddBoxesResult {
  /** Boxes drawn straight away, because their slice was already loaded. */
  drawn: number
  /** Boxes held until their slice is shown. See {@link useDicomAnnotations}. */
  deferred: number
  /** SOPInstanceUIDs that match nothing currently loaded. */
  unresolved: string[]
}

/** A box that has been matched to a slice and is waiting to be drawn. */
interface PreparedBox {
  imageId: string
  box: PixelBox
  label?: string
  uid?: string
}

/**
 * The tool the imported boxes are drawn with.
 *
 * It is a RectangleROI instance under another name rather than RectangleROI
 * itself, for two reasons. The user's own rectangles stay separately
 * selectable and separately styled, and this instance carries its own
 * `getTextLines`, so an imported box shows the label it arrived with instead of
 * the area and mean a measurement would show.
 */
const OVERLAY_TOOL_NAME = 'DicomBoxOverlay'

const PARENT_TOOL_CLASS = 'RectangleROITool'

/** A tool class by its export name, or `null` when the build does not have it. */
type ToolClass = Parameters<CornerstoneLibs['tools']['addTool']>[0] & { toolName: string }

function resolveToolClass(tools: CornerstoneLibs['tools'], name: string): ToolClass | null {
  const exported = (tools as unknown as Record<string, unknown>)[name]
  return typeof exported === 'function' ? (exported as ToolClass) : null
}

export function useDicomAnnotations(
  source: MaybeRefOrGetter<StackViewport | null | undefined>,
) {
  /** Boxes whose slice has not been displayed yet, keyed by imageId. */
  const waiting = new Map<string, PreparedBox[]>()
  /** Every annotation this composable has put into the state manager. */
  const owned = new Set<string>()

  /** Boxes currently in the annotation state. */
  const drawn: Ref<number> = ref(0)
  /** Boxes waiting for their slice to be shown. */
  const pending: Ref<number> = ref(0)
  /** Whether the boxes are being shown. Follows {@link setVisible}. */
  const visible: Ref<boolean> = ref(true)

  let libs: CornerstoneLibs | null = null
  let listening: HTMLDivElement | null = null
  let locked = true

  function requireViewport(): StackViewport {
    const viewport = toValue(source)
    if (!viewport) throw new Error(`[nuxt-cornerstone] ${t('error.annotationViewport')}`)
    return viewport
  }

  /**
   * Make sure the overlay tool exists, is in the viewport's tool group, and is
   * in a mode that draws.
   *
   * A tool sitting in a group is *Disabled* until something sets its mode, and
   * a disabled tool renders nothing — so annotations added without this step
   * are in the state manager and invisible. `Enabled` draws them without
   * giving them any mouse bindings, which is exactly what read-only wants.
   */
  async function ensureOverlayTool(viewport: StackViewport, color?: string): Promise<void> {
    const { tools } = libs!

    const group = tools.ToolGroupManager.getToolGroupForViewport(
      viewport.id,
      viewport.renderingEngineId,
    )
    if (!group) {
      throw new Error(`[nuxt-cornerstone] ${t('error.annotationToolGroup')}`)
    }

    if (!group.hasTool(OVERLAY_TOOL_NAME)) {
      const ParentTool = resolveToolClass(tools, PARENT_TOOL_CLASS)
      if (!ParentTool) {
        throw new Error(`[nuxt-cornerstone] ${t('error.annotationTool')}`)
      }

      // The parent has to be in the global registry before an instance of it
      // can be derived, and it is not when the app set `tools.register: false`.
      try {
        tools.addTool(ParentTool)
      }
      catch {
        // Already registered, by our own init or by the app.
      }

      group.addToolInstance(OVERLAY_TOOL_NAME, ParentTool.toolName)
      // An imported box carries its own caption. Returning no lines for a box
      // without a label leaves the rectangle bare rather than drawing an empty
      // text box beside it.
      group.setToolConfiguration(OVERLAY_TOOL_NAME, {
        getTextLines: (data: { label?: string }) => (data.label ? [data.label] : []),
      })
    }

    const mode = group.getToolInstance(OVERLAY_TOOL_NAME)?.mode
    if (mode !== tools.Enums.ToolModes.Enabled) group.setToolEnabled(OVERLAY_TOOL_NAME)

    if (color) {
      // Style keys are looked up most-specific first, and Cornerstone ships a
      // default `colorLocked`. Setting only `color` would leave locked boxes
      // the stock yellow, so both are set.
      tools.annotation.config.style.setToolGroupToolStyles(group.id, {
        [OVERLAY_TOOL_NAME]: { color, colorLocked: color, colorAutoGenerated: color },
      })
    }
  }

  /**
   * Draw one box, or report that its slice is not ready.
   *
   * Pixel coordinates become world coordinates through the slice's own image
   * plane, which the metadata provider only holds once that slice has been
   * loaded. Until then there is no geometry to place the rectangle in, and
   * `imageToWorldCoords` throws — which is the signal to wait.
   */
  function draw(prepared: PreparedBox, viewport: StackViewport): boolean {
    const { core, tools } = libs!
    const { imageId } = prepared

    let points: [number, number, number][]
    try {
      const toWorld = (x: number, y: number) =>
        core.utilities.imageToWorldCoords(imageId, [x, y]) as [number, number, number]

      const left = Math.min(prepared.box.x1, prepared.box.x2)
      const right = Math.max(prepared.box.x1, prepared.box.x2)
      const top = Math.min(prepared.box.y1, prepared.box.y2)
      const bottom = Math.max(prepared.box.y1, prepared.box.y2)

      // The four corners go in as top-left, top-right, bottom-left,
      // bottom-right: the renderer takes the first pair as one horizontal edge
      // and the first and third as one vertical edge, and measures the
      // rectangle from those. Image rows run downwards, so the smaller y is
      // the top.
      points = [
        toWorld(left, top),
        toWorld(right, top),
        toWorld(left, bottom),
        toWorld(right, bottom),
      ]
    }
    catch {
      return false
    }

    const camera = viewport.getCamera()
    const annotation: ToolsTypes.Annotation = {
      annotationUID: prepared.uid,
      highlighted: false,
      invalidated: true,
      isLocked: locked,
      isVisible: visible.value,
      autoGenerated: true,
      metadata: {
        toolName: OVERLAY_TOOL_NAME,
        // referencedImageId is what pins the box to one slice: a stack
        // viewport shows an annotation only while that image is the one on
        // screen.
        referencedImageId: imageId,
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        viewPlaneNormal: camera.viewPlaneNormal ? [...camera.viewPlaneNormal] : undefined,
        viewUp: camera.viewUp ? [...camera.viewUp] : undefined,
      },
      data: {
        label: prepared.label ?? '',
        handles: {
          points,
          activeHandleIndex: null,
          textBox: { hasMoved: false },
        },
        cachedStats: {},
      },
    }

    const uid = tools.annotation.state.addAnnotation(
      annotation,
      viewport.element as HTMLDivElement,
    )
    owned.add(uid)

    // Locking is kept in a registry of its own, and that registry — not the
    // flag on the annotation — is what the renderer and the tools consult.
    if (locked) tools.annotation.locking.setAnnotationLocked(uid, true)
    if (!visible.value) tools.annotation.visibility.setAnnotationVisibility(uid, false)

    return true
  }

  function queue(prepared: PreparedBox): void {
    const queued = waiting.get(prepared.imageId)
    if (queued) queued.push(prepared)
    else waiting.set(prepared.imageId, [prepared])
  }

  function countWaiting(): number {
    let total = 0
    for (const queued of waiting.values()) total += queued.length
    return total
  }

  /**
   * Draw whatever was waiting for the slice now on screen.
   *
   * A slice that has been displayed and still cannot be converted has no image
   * plane at all — a secondary capture, say — so its boxes are dropped instead
   * of being retried on every scroll.
   */
  function flush(viewport: StackViewport): void {
    const imageId = viewport.getCurrentImageId()
    if (!imageId) return

    const queued = waiting.get(imageId)
    if (!queued) return
    waiting.delete(imageId)

    let added = 0
    for (const prepared of queued) {
      if (draw(prepared, viewport)) added += 1
    }

    drawn.value = owned.size
    pending.value = countWaiting()
    if (added) render(viewport)
    if (waiting.size === 0) stopWatching()
  }

  function onStackNewImage(): void {
    const viewport = toValue(source)
    if (viewport) flush(viewport)
  }

  function watchViewport(viewport: StackViewport): void {
    const element = viewport.element as HTMLDivElement
    if (listening === element) return
    stopWatching()
    element.addEventListener(libs!.core.Enums.Events.STACK_NEW_IMAGE, onStackNewImage)
    listening = element
  }

  function stopWatching(): void {
    if (!listening || !libs) return
    listening.removeEventListener(libs.core.Enums.Events.STACK_NEW_IMAGE, onStackNewImage)
    listening = null
  }

  /**
   * Annotations are drawn onto an SVG layer by a renderer of their own, which
   * a plain `viewport.render()` does not drive.
   */
  function render(viewport: StackViewport): void {
    libs?.tools.utilities.triggerAnnotationRenderForViewportIds([viewport.id])
  }

  /**
   * Draw boxes that came from somewhere else.
   *
   * Each box is matched to a slice by SOPInstanceUID, which means the slice has
   * to have been indexed first — `useDicomFiles()` does that while it reads
   * headers, so `addFiles()` or `addZip()` must have run, and must have been
   * left on their header-reading defaults. Boxes naming a slice that is not
   * loaded come back in `unresolved` rather than throwing, because a study and
   * a report disagreeing about which slices exist is a normal thing to report
   * to the user.
   *
   * A box is drawn as soon as its slice's image plane is known, and held until
   * the slice is first displayed when it is not. Loading 500 slices up front to
   * place boxes the user may never scroll to would cost more than it saves.
   */
  async function addBoxes(
    boxes: DicomBox[],
    options: AddBoxesOptions = {},
  ): Promise<AddBoxesResult> {
    libs = await ensureCornerstone()
    const viewport = requireViewport()

    locked = options.locked ?? true
    await ensureOverlayTool(viewport, options.color)

    const unresolved: string[] = []
    let immediate = 0
    let deferred = 0

    for (const entry of boxes) {
      const imageId = imageIdForSopInstanceUid(entry.sopInstanceUid)
      if (!imageId) {
        unresolved.push(entry.sopInstanceUid)
        continue
      }

      // Adding a box that is already on screen would stack a second rectangle
      // exactly on the first, so the old one goes first.
      if (entry.uid && owned.has(entry.uid)) remove(entry.uid)

      const prepared: PreparedBox = {
        imageId,
        box: entry.box,
        label: entry.label,
        uid: entry.uid,
      }

      if (draw(prepared, viewport)) immediate += 1
      else {
        queue(prepared)
        deferred += 1
      }
    }

    if (deferred > 0) watchViewport(viewport)

    drawn.value = owned.size
    pending.value = countWaiting()
    if (immediate > 0) render(viewport)

    return { drawn: immediate, deferred, unresolved }
  }

  /**
   * Read a JSON annotation file and draw what is in it.
   *
   * The file is picked, dropped or fetched by the application; everything
   * {@link readAnnotationJson} accepts is accepted here. This is the ordinary
   * way in — the DICOM files are opened first, so the SOPInstanceUID index they
   * build is there for the report to match against, and then the report is
   * opened on top of them.
   *
   * The reader's report comes back alongside the draw counts, because a file
   * that parsed cleanly and placed nothing is the case worth telling the user
   * about: it usually means the report belongs to a different series, which
   * `report.seriesInstanceUid` names.
   */
  async function addJson(
    input: File | Blob | string | unknown,
    options: AddJsonOptions = {},
  ): Promise<AddJsonResult> {
    const report = await readAnnotationJson(input, options)
    const result = await addBoxes(report.boxes, options)
    return { ...result, report }
  }

  function remove(uid: string): void {
    libs?.tools.annotation.state.removeAnnotation(uid)
    owned.delete(uid)
  }

  /** Remove every box this composable drew, leaving the user's own alone. */
  function clear(): void {
    for (const uid of owned) libs?.tools.annotation.state.removeAnnotation(uid)
    owned.clear()
    waiting.clear()
    stopWatching()

    drawn.value = 0
    pending.value = 0

    const viewport = toValue(source)
    if (viewport) render(viewport)
  }

  /**
   * Show or hide the boxes without discarding them. Boxes still waiting for
   * their slice adopt this when they are drawn.
   */
  function setVisible(next: boolean): void {
    visible.value = next
    const tools = libs?.tools
    if (tools) {
      for (const uid of owned) tools.annotation.visibility.setAnnotationVisibility(uid, next)
    }

    const viewport = toValue(source)
    if (viewport) render(viewport)
  }

  // The listener is on an element Cornerstone owns and outlives this
  // composable, so it has to come off when the caller goes away.
  if (getCurrentScope()) onScopeDispose(stopWatching)

  return { addBoxes, addJson, clear, setVisible, drawn, pending, visible, toolName: OVERLAY_TOOL_NAME }
}

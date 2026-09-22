import { getCurrentScope, onScopeDispose, ref, toValue, watch } from 'vue'
import { getLoadedCornerstone } from '../cornerstone'
import { OVERLAY_TOOL_NAME } from './useDicomAnnotations'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { CornerstoneLibs, StackViewport } from '../types'

/** One measurement the user drew, as the delete controls see it. */
export interface Measurement {
  uid: string
  /** The `toolName` that drew it — `'Length'`, `'RectangleROI'`, and so on. */
  toolName: string
  /** The slice it is pinned to, or `null` when it is not pinned to one. */
  imageId: string | null
  selected: boolean
}

export interface MeasurementsOptions {
  /**
   * Tool names whose annotations are left alone, neither counted nor deleted.
   *
   * The overlay tool that {@link useDicomAnnotations} draws imported boxes
   * with is always in this set: those boxes belong to a report rather than to
   * the reader, and `useAnnotationReport().reset()` is what takes them away.
   * Locked annotations are skipped for the same reason, whatever drew them.
   */
  keep?: string[]
}

/**
 * Deleting the measurements the user drew.
 *
 * Cornerstone gives every annotation tool a way to *draw* and no way to
 * un-draw: a stray Length or a mis-clicked Probe stays on the slice for as
 * long as the study is open. This is the other half — the counts a toolbar
 * needs to decide what to offer, and the three removals worth offering:
 * whatever is selected, everything on the slice on screen, and everything in
 * the stack.
 *
 * Only the reader's own work is in scope. Boxes that came out of a report are
 * excluded by tool name and anything locked is excluded outright, so a viewer
 * can put a delete button next to an imported overlay without the button being
 * able to erase it.
 *
 * Counts follow the annotation state rather than being recomputed by the
 * caller: they move when the user draws, deletes, selects or scrolls.
 */
export function useMeasurements(
  source: MaybeRefOrGetter<StackViewport | null | undefined>,
  options: MeasurementsOptions = {},
) {
  const kept = new Set([OVERLAY_TOOL_NAME, ...(options.keep ?? [])])

  /** Measurements on the stack on screen. */
  const total: Ref<number> = ref(0)
  /** Of those, the ones on the slice being shown. */
  const onSlice: Ref<number> = ref(0)
  /** Of those, the ones the user has selected. */
  const selected: Ref<number> = ref(0)

  let libs: CornerstoneLibs | null = null
  let listening: HTMLDivElement | null = null
  let subscribed = false

  /**
   * Annotation events are global — they are raised on Cornerstone's own
   * `eventTarget`, not on the viewport's element — because an annotation
   * belongs to a frame of reference rather than to one viewport.
   */
  function annotationEvents(): string[] {
    const { Events } = libs!.tools.Enums
    return [
      Events.ANNOTATION_ADDED,
      Events.ANNOTATION_REMOVED,
      Events.ANNOTATION_SELECTION_CHANGE,
      Events.ANNOTATION_LOCK_CHANGE,
    ]
  }

  /**
   * Every measurement of the user's own that belongs to the stack on screen.
   *
   * Membership is decided by the slice an annotation names, because the
   * annotation state manager outlives a study: measurements drawn on a series
   * that has since been closed are still in it, and counting those would offer
   * to delete things nobody can see. An annotation with no slice of its own
   * falls back to the frame of reference, which is what a tool that is not
   * stack-bound would carry.
   */
  function list(): Measurement[] {
    const viewport = toValue(source)
    if (!libs || !viewport) return []

    const { tools } = libs
    const imageIds = new Set(viewport.getImageIds())
    const frameOfReferenceUid = viewport.getFrameOfReferenceUID()
    const found: Measurement[] = []

    for (const annotation of tools.annotation.state.getAllAnnotations()) {
      const uid = annotation.annotationUID
      const metadata = annotation.metadata
      const toolName = metadata?.toolName
      if (!uid || !toolName || kept.has(toolName)) continue
      if (tools.annotation.locking.isAnnotationLocked(uid)) continue

      const imageId = metadata.referencedImageId ?? null
      const belongs = imageId
        ? imageIds.has(imageId)
        : metadata.FrameOfReferenceUID === frameOfReferenceUid
      if (!belongs) continue

      found.push({
        uid,
        toolName,
        imageId,
        selected: tools.annotation.selection.isAnnotationSelected(uid),
      })
    }

    return found
  }

  function refresh(): void {
    const measurements = list()
    const current = toValue(source)?.getCurrentImageId() ?? null

    total.value = measurements.length
    onSlice.value = current ? measurements.filter(entry => entry.imageId === current).length : 0
    selected.value = measurements.filter(entry => entry.selected).length
  }

  /**
   * Annotations are drawn onto an SVG layer by a renderer of their own, which
   * a plain `viewport.render()` does not drive.
   */
  function render(): void {
    const viewport = toValue(source)
    if (viewport) libs?.tools.utilities.triggerAnnotationRenderForViewportIds([viewport.id])
  }

  function removeMany(uids: string[]): number {
    if (!libs || uids.length === 0) return 0
    const { tools } = libs

    for (const uid of uids) {
      // Selection is a registry of its own, and deselecting reads the
      // annotation back out of the state manager — so a UID that is removed
      // while still selected leaves a dangling entry behind, and the next
      // click, which deselects everything before selecting, throws on it.
      if (tools.annotation.selection.isAnnotationSelected(uid)) {
        tools.annotation.selection.deselectAnnotation(uid)
      }
      tools.annotation.state.removeAnnotation(uid)
    }

    refresh()
    render()
    return uids.length
  }

  /** Delete one measurement by UID. Returns `false` if it is not ours to delete. */
  function remove(uid: string): boolean {
    return removeMany(list().filter(entry => entry.uid === uid).map(entry => entry.uid)) > 0
  }

  /** Delete the selected measurements. Returns how many went. */
  function deleteSelected(): number {
    return removeMany(list().filter(entry => entry.selected).map(entry => entry.uid))
  }

  /** Delete the measurements on the slice being shown. Returns how many went. */
  function deleteOnSlice(): number {
    const current = toValue(source)?.getCurrentImageId()
    if (!current) return 0
    return removeMany(list().filter(entry => entry.imageId === current).map(entry => entry.uid))
  }

  /** Delete every measurement on this stack. Returns how many went. */
  function deleteAll(): number {
    return removeMany(list().map(entry => entry.uid))
  }

  function subscribe(): void {
    if (subscribed || !libs) return
    for (const event of annotationEvents()) {
      libs.core.eventTarget.addEventListener(event, refresh)
    }
    subscribed = true
  }

  function unsubscribe(): void {
    if (!subscribed || !libs) return
    for (const event of annotationEvents()) {
      libs.core.eventTarget.removeEventListener(event, refresh)
    }
    subscribed = false
  }

  /** The slice count only moves when the slice does. */
  function watchElement(viewport: StackViewport): void {
    const element = viewport.element as HTMLDivElement
    if (listening === element) return
    stopWatching()
    element.addEventListener(libs!.core.Enums.Events.STACK_NEW_IMAGE, refresh)
    listening = element
  }

  function stopWatching(): void {
    if (!listening || !libs) return
    listening.removeEventListener(libs.core.Enums.Events.STACK_NEW_IMAGE, refresh)
    listening = null
  }

  // A viewport only ever exists in the browser, and Cornerstone is loaded
  // before one can be created — so this is also where the libraries become
  // reachable, without a second initialisation path of this composable's own.
  watch(() => toValue(source), (viewport) => {
    libs ??= getLoadedCornerstone()
    if (!libs || !viewport) {
      stopWatching()
      refresh()
      return
    }
    subscribe()
    watchElement(viewport)
    refresh()
  }, { immediate: true })

  // Both targets outlive this composable: one is Cornerstone's global event
  // target, the other an element Cornerstone owns.
  if (getCurrentScope()) {
    onScopeDispose(() => {
      unsubscribe()
      stopWatching()
    })
  }

  return {
    list,
    refresh,
    remove,
    deleteSelected,
    deleteOnSlice,
    deleteAll,
    total,
    onSlice,
    selected,
  }
}

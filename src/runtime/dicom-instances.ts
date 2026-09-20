/**
 * Where a SOPInstanceUID can be found in this session.
 *
 * Annotations produced somewhere else — by a reporting system, or by a model
 * running server-side — identify the slice they belong to by its
 * SOPInstanceUID (0008,0018), because that is the only identifier that
 * survives leaving the viewer. An imageId does not: `dicomfile:` ids are
 * handed out by the loader as files are registered, so the same study opened
 * twice has a different set of them.
 *
 * `useDicomFiles()` fills this in as it reads headers, and
 * `useDicomAnnotations()` reads it to place incoming boxes. It lives here
 * rather than inside either composable so that neither has to import the
 * other.
 *
 * Nothing writes to it on the server: both writers go through
 * `ensureCornerstone()`, which rejects during SSR. So the module-scoped map
 * that would otherwise be shared between in-flight requests only ever holds
 * one browser session's files.
 */

interface InstanceIndexState {
  imageIds?: Map<string, string>
}

// Parked on `import.meta.hot.data` for the same reason the Cornerstone state
// is: replacing this module in dev must not lose the index under a viewport
// that is already showing annotations placed from it.
const hot = import.meta.hot
const state: InstanceIndexState = hot
  ? ((hot.data.cornerstoneInstances ??= {}) as InstanceIndexState)
  : {}
state.imageIds ??= new Map<string, string>()

/**
 * Remember where a slice lives.
 *
 * A later registration wins. Reopening a study registers the same UIDs against
 * fresh imageIds, and the fresh ones are the ones that still resolve.
 */
export function registerInstance(sopInstanceUid: string, imageId: string): void {
  state.imageIds!.set(sopInstanceUid, imageId)
}

/** The imageId for a SOPInstanceUID, or `null` if that slice is not loaded. */
export function imageIdForSopInstanceUid(sopInstanceUid: string): string | null {
  return state.imageIds!.get(sopInstanceUid) ?? null
}

export function clearInstanceIndex(): void {
  state.imageIds!.clear()
}

/** How many slices can currently be found by UID. */
export function instanceIndexSize(): number {
  return state.imageIds!.size
}

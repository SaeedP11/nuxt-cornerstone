import { computed, shallowRef } from 'vue'
import {
  ensureCornerstone,
  getCornerstoneOptions,
  getLoadedCornerstone,
} from '../cornerstone'
import type { CornerstoneLibs, CornerstoneModuleOptions } from '../types'

/**
 * Access to the initialised Cornerstone3D libraries.
 *
 * Calling this on the client starts initialisation if it has not started
 * already; `ready` flips once `core`, the DICOM image loader and the tools are
 * all up. Initialisation itself is shared process-wide, so calling this from
 * ten components still initialises once.
 */
export function useCornerstone() {
  const libs = shallowRef<CornerstoneLibs | null>(getLoadedCornerstone())
  const error = shallowRef<Error | null>(null)
  const pending = shallowRef(false)
  const ready = computed(() => libs.value !== null)

  async function ensure(overrides?: CornerstoneModuleOptions): Promise<CornerstoneLibs> {
    pending.value = true
    try {
      libs.value = await ensureCornerstone(overrides)
      error.value = null
      return libs.value
    }
    catch (caught) {
      error.value = caught instanceof Error ? caught : new Error(String(caught))
      throw error.value
    }
    finally {
      pending.value = false
    }
  }

  if (import.meta.client && !libs.value) {
    // The rejection is recorded on `error`; nothing here should throw into the
    // caller's setup().
    ensure().catch(() => {})
  }

  return { libs, ready, error, pending, ensure, options: getCornerstoneOptions() }
}

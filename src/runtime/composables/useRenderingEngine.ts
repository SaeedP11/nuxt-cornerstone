import { ensureCornerstone, getCornerstoneOptions } from '../cornerstone'
import type { Types as CoreTypes } from '@cornerstonejs/core'

/**
 * Rendering engines are shared and reference counted.
 *
 * `core.init()` allocates a pool of WebGL contexts (7 by default), and each
 * RenderingEngine takes one. A page with four viewports should use one engine
 * with four viewports on it, not four engines — so viewports acquire a shared
 * engine by id and the last one to leave destroys it.
 */
interface EngineEntry {
  engine: CoreTypes.IRenderingEngine
  refs: number
  /** False when the engine was created by the app, so we must not destroy it. */
  owned: boolean
}

interface EngineState {
  engines?: Map<string, EngineEntry>
}

const hot = import.meta.hot
const state: EngineState = hot ? ((hot.data.cornerstoneEngines ??= {}) as EngineState) : {}
state.engines ??= new Map<string, EngineEntry>()

export function useRenderingEngine() {
  /** Get or create the engine for `id` and take a reference on it. */
  async function acquire(id?: string): Promise<CoreTypes.IRenderingEngine> {
    const { core } = await ensureCornerstone()
    const engineId = id ?? getCornerstoneOptions().renderingEngineId
    const engines = state.engines!

    let entry = engines.get(engineId)

    // A destroyed engine leaves our entry stale (HMR, or app-side teardown).
    if (entry && !core.getRenderingEngine(engineId)) {
      engines.delete(engineId)
      entry = undefined
    }

    if (!entry) {
      const existing = core.getRenderingEngine(engineId)
      entry = {
        engine: existing ?? new core.RenderingEngine(engineId),
        refs: 0,
        owned: !existing,
      }
      engines.set(engineId, entry)
    }

    entry.refs += 1
    return entry.engine
  }

  /** Drop a reference; destroys the engine when the last one goes. */
  function release(id?: string): void {
    const engineId = id ?? getCornerstoneOptions().renderingEngineId
    const engines = state.engines!
    const entry = engines.get(engineId)
    if (!entry) return

    entry.refs = Math.max(0, entry.refs - 1)
    if (entry.refs > 0) return

    engines.delete(engineId)
    if (!entry.owned) return
    try {
      entry.engine.destroy()
    }
    catch {
      // Already destroyed elsewhere.
    }
  }

  /** The live engine for `id`, or `null`. Never creates one. */
  function get(id?: string): CoreTypes.IRenderingEngine | null {
    const engineId = id ?? getCornerstoneOptions().renderingEngineId
    return state.engines!.get(engineId)?.engine ?? null
  }

  return { acquire, release, get }
}

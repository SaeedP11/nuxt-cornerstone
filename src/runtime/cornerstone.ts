import { DEFAULT_TOOLS } from './types'
import type {
  CornerstoneLibs,
  CornerstoneModuleOptions,
  CornerstoneToolClassName,
  CornerstoneTools,
  ResolvedCornerstoneOptions,
} from './types'

/**
 * Module-scoped state.
 *
 * Cornerstone's `dicomImageLoaderInit()` -> `registerLoaders()` begins with
 * `cache.purgeCache()`, `dataSetCacheManager.purge()` and
 * `wadorsMetaDataManager.purge()`. Initialising twice therefore throws away
 * every decoded image and all of the metadata that went with it, silently.
 *
 * So init is single-flight, and the flight is parked on `import.meta.hot.data`
 * so that a dev-server module replacement of *this* file cannot start a second
 * one underneath a viewport that is already rendering.
 */
interface CornerstoneState {
  libsPromise?: Promise<CornerstoneLibs> | null
  libs?: CornerstoneLibs | null
  options?: ResolvedCornerstoneOptions
  registeredTools?: Set<string>
}

const hot = import.meta.hot
const state: CornerstoneState = hot ? ((hot.data.cornerstone ??= {}) as CornerstoneState) : {}
state.registeredTools ??= new Set<string>()

const DEFAULT_OPTIONS: ResolvedCornerstoneOptions = {
  autoInit: true,
  core: {},
  dicomImageLoader: {},
  tools: { enabled: true, register: [...DEFAULT_TOOLS] },
  viteCommonjs: true,
  prefix: 'Cornerstone',
  renderingEngineId: 'nuxt-cornerstone',
  toolGroupId: 'nuxt-cornerstone-tools',
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Deep merge, right-biased. Arrays and functions replace rather than merge. */
function merge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T
  }
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    out[key] = isPlainObject(out[key]) && isPlainObject(value) ? merge(out[key], value) : value
  }
  return out as T
}

/**
 * Install the options resolved at build time. Called by the client plugin
 * before any component can mount, so `ensureCornerstone()` never has to reach
 * for a Nuxt context of its own.
 */
export function configureCornerstone(options: CornerstoneModuleOptions | undefined): void {
  state.options = merge(state.options ?? DEFAULT_OPTIONS, options)
}

/** Merge extra options in before init. Throws once init has started. */
export function setCornerstoneOptions(options: CornerstoneModuleOptions): void {
  if (state.libsPromise) {
    throw new Error(
      '[nuxt-cornerstone3d] Cornerstone3D is already initialising; options can no longer be changed. '
      + 'Set `cornerstone.autoInit: false` in nuxt.config and call `ensureCornerstone(options)` from your own plugin.',
    )
  }
  configureCornerstone(options)
}

export function getCornerstoneOptions(): ResolvedCornerstoneOptions {
  return state.options ?? DEFAULT_OPTIONS
}

/**
 * Initialise Cornerstone3D once, and hand back the three entry points.
 *
 * Init order is not a style choice: `dicomImageLoaderInit()` calls
 * `getWebWorkerManager()` from core, and core's `init()` is what creates that
 * manager. Core first, loader second, tools last.
 */
export function ensureCornerstone(options?: CornerstoneModuleOptions): Promise<CornerstoneLibs> {
  if (import.meta.server) {
    return Promise.reject(
      new Error(
        '[nuxt-cornerstone3d] Cornerstone3D is browser-only (WebGL, web workers, WASM) and cannot run during SSR. '
        + 'Call ensureCornerstone() from onMounted, or wrap the caller in <ClientOnly>.',
      ),
    )
  }
  if (options) setCornerstoneOptions(options)
  state.libsPromise ??= load()
  return state.libsPromise
}

async function load(): Promise<CornerstoneLibs> {
  const options = getCornerstoneOptions()

  const [core, dicomImageLoader, tools] = await Promise.all([
    import('@cornerstonejs/core'),
    import('@cornerstonejs/dicom-image-loader'),
    import('@cornerstonejs/tools'),
  ])

  // 1. core — creates the centralised web worker manager.
  core.init(options.core as Parameters<typeof core.init>[0])

  // 2. dicom image loader — registers the wadouri/wadors/dicomfile schemes and
  //    the decode worker, and needs the worker manager from step 1.
  dicomImageLoader.init(options.dicomImageLoader)

  // 3. tools — attaches the global mouse/keyboard listeners.
  if (options.tools.enabled) {
    tools.init()
    if (options.tools.register !== false) {
      registerTools(tools, options.tools.register)
    }
  }

  const libs: CornerstoneLibs = { core, tools, dicomImageLoader }
  state.libs = libs
  return libs
}

/**
 * `addTool` writes into a global registry keyed by each class's static
 * `toolName`, and throws when a name is already there, so repeats are skipped.
 */
function registerTools(tools: CornerstoneTools, names: CornerstoneToolClassName[]): void {
  const registered = state.registeredTools!
  for (const name of names) {
    if (registered.has(name)) continue
    const ToolClass = (tools as unknown as Record<string, unknown>)[name]
    if (typeof ToolClass !== 'function') {
      console.warn(
        `[nuxt-cornerstone3d] "${name}" is not an exported tool class of @cornerstonejs/tools; skipping.`,
      )
      continue
    }
    try {
      tools.addTool(ToolClass as Parameters<typeof tools.addTool>[0])
    }
    catch {
      // Already in the global registry (another init cycle, or the app added it).
    }
    registered.add(name)
  }
}

/** The libraries if init has completed, else `null`. Never triggers a load. */
export function getLoadedCornerstone(): CornerstoneLibs | null {
  return state.libs ?? null
}

export function isCornerstoneInitialised(): boolean {
  return Boolean(state.libs)
}

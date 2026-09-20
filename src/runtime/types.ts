import type { Types as CoreTypes } from '@cornerstonejs/core'
import type { Types as DicomLoaderTypes } from '@cornerstonejs/dicom-image-loader'

/**
 * Cornerstone3D is imported dynamically and only in the browser, so every
 * reference to it in this module is type-only. `typeof import(...)` is erased
 * at compile time and never produces a runtime import.
 */
export type CornerstoneCore = typeof import('@cornerstonejs/core')
export type CornerstoneTools = typeof import('@cornerstonejs/tools')
export type CornerstoneDicomImageLoader = typeof import('@cornerstonejs/dicom-image-loader')

export interface CornerstoneLibs {
  core: CornerstoneCore
  tools: CornerstoneTools
  dicomImageLoader: CornerstoneDicomImageLoader
}

/** Recursive Partial that leaves functions and arrays alone. */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

/**
 * Tools registered by default. Cornerstone's `addTool` is a global registry and
 * throws on a duplicate name, so registration is guarded (see `cornerstone.ts`).
 */
export const DEFAULT_TOOLS = [
  'WindowLevelTool',
  'PanTool',
  'ZoomTool',
  'StackScrollTool',
  'LengthTool',
  'RectangleROITool',
  'EllipticalROITool',
  'ProbeTool',
] as const

export type DefaultToolClassName = (typeof DEFAULT_TOOLS)[number]

/** Any exported tool class name from `@cornerstonejs/tools`. */
export type CornerstoneToolClassName = DefaultToolClassName | (string & {})

export interface CornerstoneToolsOptions {
  /** Run `csToolsInit()` and register the tool classes. Default: `true`. */
  enabled?: boolean
  /**
   * Tool classes to register globally, by their export name in
   * `@cornerstonejs/tools`. `false` registers none — do it yourself with
   * `addTool()`. Default: {@link DEFAULT_TOOLS}.
   */
  register?: CornerstoneToolClassName[] | false
}

export interface CornerstoneModuleOptions {
  /**
   * Initialise Cornerstone3D from the client plugin, as the app boots, rather
   * than lazily on first viewport mount. Default: `true`.
   *
   * Set to `false` when you need to pass non-serializable options (callbacks
   * such as `dicomImageLoader.beforeSend`, or `core.peerImport`): those cannot
   * travel through `runtimeConfig`, so pass them to `ensureCornerstone()` from
   * a plugin of your own instead.
   */
  autoInit?: boolean
  /** Passed to `coreInit()`. Deep-merged over Cornerstone's own defaults. */
  core?: DeepPartial<CoreTypes.Cornerstone3DConfig>
  /** Passed to `dicomImageLoaderInit()`. */
  dicomImageLoader?: DicomLoaderTypes.LoaderOptions
  tools?: CornerstoneToolsOptions
  /**
   * Register `@originjs/vite-plugin-commonjs` on the client build. Default:
   * `true`, and it is required for images to decode at all in dev.
   *
   * The DICOM image loader has to stay out of dependency prebundling (esbuild
   * cannot resolve its WASM specifiers), which means Vite serves its imports
   * raw — including the four Emscripten codec bundles, which are UMD/CommonJS.
   * Without this plugin those imports fail with "doesn't provide an export
   * named: 'default'". Only turn it off if you are supplying your own CommonJS
   * interop.
   */
  viteCommonjs?: boolean
  /** Component name prefix. Default: `'Cornerstone'` (→ `<CornerstoneViewport>`). */
  prefix?: string
  /** Default rendering engine id shared by viewports. */
  renderingEngineId?: string
  /** Default tool group id shared by viewports. */
  toolGroupId?: string
}

/** Module options after defaults are applied. */
export type ResolvedCornerstoneOptions = Required<
  Pick<
    CornerstoneModuleOptions,
    'autoInit' | 'core' | 'dicomImageLoader' | 'viteCommonjs' | 'prefix' | 'renderingEngineId' | 'toolGroupId'
  >
> & { tools: Required<CornerstoneToolsOptions> }

/** A mouse/keyboard binding for `setActive`, as `tools.Enums.MouseBindings`. */
export interface ToolBinding {
  mouseButton?: number
  modifierKey?: number
  numTouchPoints?: number
}

export type StackViewport = CoreTypes.IStackViewport

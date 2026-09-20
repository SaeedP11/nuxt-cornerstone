import type { MessageCatalog } from './i18n/messages'
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

/**
 * Where to read the host application's locale from.
 *
 * - `'i18n'` — `nuxtApp.$i18n.locale`, which is what `@nuxtjs/i18n` and
 *   vue-i18n expose. Duck-typed, so nothing is imported and nothing breaks
 *   when they are absent. Followed reactively.
 * - `'html'` — the `lang` attribute on `<html>`, watched for changes. Works
 *   with any i18n library, since they nearly all set it.
 * - `'navigator'` — the browser's preferred language, read once at startup.
 */
export type LocaleSource = 'i18n' | 'html' | 'navigator'

export interface CornerstoneI18nOptions {
  /**
   * Locale for the strings this module produces. Default: `'en'`.
   *
   * `en` and `fa` ship with the module; any other locale needs a catalogue of
   * its own in {@link CornerstoneI18nOptions.messages}.
   */
  locale?: string
  /** Used for keys the active locale is missing. Default: `'en'`. */
  fallbackLocale?: string
  /**
   * Catalogues merged over the built-in ones, keyed by locale. Use it to
   * override individual strings, add a locale, or register keys of your own —
   * `t()` resolves anything in here.
   *
   * These travel through `runtimeConfig`, so values must be plain strings (or
   * plural-form objects), not functions.
   */
  messages?: Record<string, MessageCatalog>
  /**
   * `'auto'` (default) lets each locale use its own digits, which means
   * Persian-Indic digits in Farsi. `'latn'` pins every locale to 0-9, for apps
   * whose users cross-reference slice numbers against other systems.
   */
  numberingSystem?: 'auto' | 'latn'
  /**
   * Follow the locale of the application that installed the module, instead of
   * the one pinned in {@link CornerstoneI18nOptions.locale}. Default: `false`.
   *
   * `true` tries each {@link LocaleSource} in order and stops at the first one
   * that answers; an array picks the sources and their order yourself.
   *
   * Only a locale the module has a catalogue for is adopted, so an app running
   * in a language nobody has translated keeps the configured locale rather than
   * silently flipping text direction under the viewer.
   *
   * Detection is client-side. The locale is module-scoped state, which on the
   * server is shared by every in-flight request, so following a per-request
   * locale there would let one request's language leak into another's. During
   * SSR the configured locale is used — see "Internationalisation" in the
   * README for the per-request case.
   */
  detect?: boolean | LocaleSource[]
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
   * Locale and message catalogues for the module's own strings — the errors it
   * throws and the series labels `useDicomFiles()` builds.
   *
   * `false` turns the catalogue off: the module stays on English and ignores
   * locale changes, which is what you want when the host app owns these
   * strings. Route them through its i18n with `setTranslator()` from
   * `useCornerstoneI18n()`.
   */
  i18n?: CornerstoneI18nOptions | false
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
> & {
  tools: Required<CornerstoneToolsOptions>
  i18n: Required<CornerstoneI18nOptions> | false
}

/** A mouse/keyboard binding for `setActive`, as `tools.Enums.MouseBindings`. */
export interface ToolBinding {
  mouseButton?: number
  modifierKey?: number
  numTouchPoints?: number
}

export type StackViewport = CoreTypes.IStackViewport

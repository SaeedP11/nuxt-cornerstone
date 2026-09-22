import { pathToFileURL } from 'node:url'
import {
  addComponent,
  addImportsDir,
  addPlugin,
  createResolver,
  defineNuxtModule,
  tryResolveModule,
  useLogger,
} from '@nuxt/kit'
import { defu } from 'defu'
import { DEFAULT_TOOLS } from './runtime/types'
import type { CornerstoneModuleOptions } from './runtime/types'

export type ModuleOptions = CornerstoneModuleOptions

export type {
  CornerstoneI18nOptions,
  CornerstoneModuleOptions,
  LocaleSource,
  ResolvedCornerstoneOptions,
} from './runtime/types'

export type {
  CornerstoneMessageKey,
  CornerstoneTranslator,
  MessageCatalog,
  MessageKey,
  MessageParams,
  MessageValue,
  PluralCategory,
} from './runtime/i18n'

export type {
  AddFilesOptions,
  AddZipOptions,
  AddZipResult,
  DicomSeries,
  IndexUrlsOptions,
  IndexUrlsResult,
  SkippedEntry,
  SkipReason,
  ZipProgress,
} from './runtime/composables/useDicomFiles'

export type {
  PrefetchOptions,
  PrefetchProgress,
  PrefetchResult,
} from './runtime/composables/useImagePrefetch'

export type {
  CinePlayerOptions,
} from './runtime/composables/useCinePlayer'

export type {
  OpenUrlsOptions,
  Problem,
  SourceInfo,
} from './runtime/composables/useDicomStudy'

export type {
  GuardResult,
  RejectedFile,
} from './runtime/composables/useDicomGuard'

export type {
  StackCineOptions,
} from './runtime/composables/useStackCine'

export type {
  AnnotationReportOptions,
} from './runtime/composables/useAnnotationReport'

export type {
  ToolShortcut,
  ViewerShortcutHandlers,
  ViewerShortcutOptions,
} from './runtime/composables/useViewerShortcuts'

export type {
  AddBoxesOptions,
  AddBoxesResult,
  AddJsonOptions,
  AddJsonResult,
  DicomBox,
  PixelBox,
} from './runtime/composables/useDicomAnnotations'

export type {
  AnnotationFormat,
  FindingLabelInfo,
  ReadAnnotationsOptions,
  ReadAnnotationsResult,
} from './runtime/annotation-json'

const MODULE_NAME = 'nuxt-cornerstone'

/**
 * Peer dependencies. `@cornerstonejs/metadata` and `@cornerstonejs/utils` were
 * split out of `core` in Cornerstone3D 5 and are exact-pinned peers of it, so a
 * tree without them does not work even though nothing imports them directly.
 */
const REQUIRED_PACKAGES = [
  '@cornerstonejs/core',
  '@cornerstonejs/tools',
  '@cornerstonejs/dicom-image-loader',
  '@cornerstonejs/metadata',
  '@cornerstonejs/utils',
  'dicom-parser',
] as const

/** Packages that must never be pulled into the Nitro/server bundle. */
const BROWSER_ONLY_PACKAGES = [
  '@cornerstonejs/core',
  '@cornerstonejs/tools',
  '@cornerstonejs/dicom-image-loader',
]

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: MODULE_NAME,
    configKey: 'cornerstone',
    compatibility: { nuxt: '>=4.0.0' },
  },
  defaults: {
    autoInit: true,
    core: {},
    dicomImageLoader: {},
    tools: { enabled: true, register: [...DEFAULT_TOOLS] },
    i18n: {
      locale: 'en',
      fallbackLocale: 'en',
      messages: {},
      numberingSystem: 'auto',
      detect: false,
    },
    viteCommonjs: true,
    prefix: 'Cornerstone',
    renderingEngineId: 'nuxt-cornerstone',
    toolGroupId: 'nuxt-cornerstone-tools',
  },
  async setup(options, nuxt) {
    const logger = useLogger(MODULE_NAME)
    const { resolve } = createResolver(import.meta.url)

    await assertPeerDependencies(nuxt.options.rootDir, logger)

    // Options reach the browser through runtimeConfig, which is serialized into
    // the payload — so callbacks cannot travel this way. Strip them, and say so.
    const { value: publicOptions, dropped } = stripFunctions(options)
    if (dropped.length > 0) {
      logger.warn(
        `These options are functions and cannot be serialized into runtimeConfig: ${dropped.join(', ')}. `
        + 'Set `cornerstone.autoInit: false` and pass them to `ensureCornerstone()` from your own plugin instead.',
      )
    }

    const runtimeConfig = nuxt.options.runtimeConfig.public as Record<string, unknown>
    runtimeConfig.cornerstone = defu(
      runtimeConfig.cornerstone as Record<string, unknown> | undefined,
      publicOptions,
    )

    /**
     * Vite configuration, client build only. This is the part a plain Nuxt
     * plugin could not do on a consuming app's behalf, and every item here is
     * load-bearing.
     */
    nuxt.hook('vite:extendConfig', async (viteConfig, { isClient }) => {
      if (!isClient) return

      // Vite types these fields readonly; the hook exists precisely to change
      // them, so narrow to what we write.
      const config = viteConfig as unknown as {
        optimizeDeps?: { exclude?: string[], include?: string[] }
        worker?: Record<string, unknown>
        assetsInclude?: string | string[]
        plugins?: unknown[]
      }

      config.optimizeDeps ??= {}

      // Each WASM decoder locates its binary with a bare `@cornerstonejs/codec-*`
      // specifier inside `new URL(..., import.meta.url)`. Rollup resolves that
      // and emits the binary; esbuild does not, and dev prebundling is esbuild.
      // Left in, the decoder requests a path that does not exist, the SPA
      // fallback answers with index.html, and WebAssembly.instantiate reports
      // "expected magic word 00 61 73 6d, found 3c 21 64 6f" (`<!do`).
      config.optimizeDeps.exclude = unique([
        ...(config.optimizeDeps.exclude ?? []),
        '@cornerstonejs/dicom-image-loader',
      ])

      // Prebundle the rest up front, for two reasons.
      //
      // 1. Vite would discover core and tools on the first dynamic import
      //    anyway, but discovering them *while the browser is importing them*
      //    re-bundles and changes the dep hash, invalidating the in-flight
      //    URLs: the import rejects with "error loading dynamically imported
      //    module" and the page only recovers through Vite's full reload.
      //
      // 2. metadata and utils are singletons — they hold the metadata provider
      //    registry and its caches. If they are only reached as transitive
      //    imports, the optimizer inlines one copy into core's chunk while the
      //    excluded image loader resolves a second raw copy, and the two no
      //    longer share a registry: the loader naturalizes an instance into one
      //    of them and core reads the other, so every wadouri load fails with
      //    "no pixel data in NATURALIZED". Naming them makes them shared
      //    chunks, which is what keeps them single instances.
      //
      // dicom-parser is CommonJS and also needs the conversion prebundling does.
      //
      // fflate is here for reason 1 as well. It is imported dynamically the
      // first time someone opens a ZIP, which is a click rather than a page
      // load — discovering it only then re-optimizes and forces a reload, out
      // from under the archive the user has just picked.
      config.optimizeDeps.include = unique([
        ...(config.optimizeDeps.include ?? []),
        'dicom-parser',
        'fflate',
        '@cornerstonejs/core',
        '@cornerstonejs/tools',
        '@cornerstonejs/metadata',
        '@cornerstonejs/utils',
      ])

      // The decode worker is spawned as `new Worker(url, { type: 'module' })`.
      config.worker = { ...config.worker, format: 'es' }

      config.assetsInclude = unique([...toArray(config.assetsInclude), '**/*.wasm'])

      if (options.viteCommonjs) {
        // The Emscripten codec bundles are UMD/CommonJS and are served raw,
        // because the loader that imports them is excluded from prebundling.
        const { viteCommonjs } = await import('@originjs/vite-plugin-commonjs')
        config.plugins ??= []
        config.plugins.push(viteCommonjs())
      }
    })

    // Belt and braces: even though nothing imports Cornerstone on the server,
    // keep Nitro from trying to inline these ESM-only, DOM-dependent packages.
    nuxt.options.nitro.externals = defu(nuxt.options.nitro.externals, {
      external: BROWSER_ONLY_PACKAGES,
    })

    // Universal: the locale has to be set during SSR as well, or the first
    // paint is English and <html lang dir> disagrees with the client.
    addPlugin({ src: resolve('./runtime/plugin.i18n') })

    addPlugin({ src: resolve('./runtime/plugin.client'), mode: 'client' })

    addImportsDir(resolve('./runtime/composables'))

    addComponent({
      name: `${options.prefix}Viewport`,
      filePath: resolve('./runtime/components/CornerstoneViewport.vue'),
      // Cornerstone needs a DOM, a WebGL context and web workers. Client-only
      // registration means consumers do not have to remember <ClientOnly>.
      mode: 'client',
    })
  },
})

type Logger = ReturnType<typeof useLogger>

async function assertPeerDependencies(rootDir: string, logger: Logger): Promise<void> {
  const from = [pathToFileURL(rootDir + '/').href, import.meta.url]
  const missing: string[] = []

  for (const name of REQUIRED_PACKAGES) {
    const resolved = await tryResolveModule(`${name}/package.json`, from)
    if (!resolved) missing.push(name)
  }

  if (missing.length === 0) return

  const install = missing.map(name => `${name}@^5.10.7`).join(' ')
  logger.error(`Missing peer dependencies: ${missing.join(', ')}`)
  throw new Error(
    `[${MODULE_NAME}] missing peer dependencies: ${missing.join(', ')}.\n`
    + `Install them with:\n  npm install ${install}\n`
    + 'All @cornerstonejs packages must be on the same version — they pin each other exactly.',
  )
}

/** Strip function values, reporting their dotted paths. */
function stripFunctions<T>(value: T, path: string[] = []): { value: T, dropped: string[] } {
  if (typeof value === 'function') {
    return { value: undefined as unknown as T, dropped: [path.join('.')] }
  }
  if (Array.isArray(value) || value === null || typeof value !== 'object') {
    return { value, dropped: [] }
  }

  const out: Record<string, unknown> = {}
  const dropped: string[] = []
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const result = stripFunctions(entry, [...path, key])
    dropped.push(...result.dropped)
    if (result.value !== undefined) out[key] = result.value
  }
  return { value: out as T, dropped }
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

import { defineNuxtPlugin, useRuntimeConfig } from '#imports'
import type { ObjectPlugin } from '#app'
import { t } from './i18n'
import {
  configureCornerstone,
  ensureCornerstone,
  getCornerstoneOptions,
  getLoadedCornerstone,
} from './cornerstone'
import type { CornerstoneLibs, CornerstoneModuleOptions } from './types'

/** What this plugin injects, reachable as `$cornerstone` / `useNuxtApp()`. */
export interface NuxtCornerstone {
  ensure: (overrides?: CornerstoneModuleOptions) => Promise<CornerstoneLibs>
  get: () => CornerstoneLibs | null
  options: typeof getCornerstoneOptions
}

// Annotated rather than inferred: the inferred type of an object plugin reaches
// into Nuxt's own `NuxtApp` declaration, which mkdist cannot name portably when
// it emits this file's declarations (TS2742), and the build fails on it.
const plugin: ObjectPlugin<{ cornerstone: NuxtCornerstone }> = defineNuxtPlugin({
  name: 'nuxt-cornerstone',
  enforce: 'pre',
  setup() {
    const options = useRuntimeConfig().public.cornerstone as CornerstoneModuleOptions | undefined

    // Always install the build-time options, even when autoInit is off, so a
    // later ensureCornerstone() picks them up.
    configureCornerstone(options)

    if (getCornerstoneOptions().autoInit) {
      // Not awaited: initialising costs a few dynamic imports and a WebGL
      // capability probe, and nothing in the app should wait on it. Consumers
      // await ensureCornerstone() at the point they actually need it.
      ensureCornerstone().catch((error) => {
        console.error(`[nuxt-cornerstone] ${t('error.initFailed')}`, error)
      })
    }

    return {
      provide: {
        cornerstone: {
          ensure: (overrides?: CornerstoneModuleOptions): Promise<CornerstoneLibs> =>
            ensureCornerstone(overrides),
          get: (): CornerstoneLibs | null => getLoadedCornerstone(),
          options: getCornerstoneOptions,
        },
      },
    }
  },
})

export default plugin

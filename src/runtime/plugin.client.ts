import { defineNuxtPlugin, useRuntimeConfig } from '#imports'
import {
  configureCornerstone,
  ensureCornerstone,
  getCornerstoneOptions,
  getLoadedCornerstone,
} from './cornerstone'
import type { CornerstoneLibs, CornerstoneModuleOptions } from './types'

export default defineNuxtPlugin({
  name: 'nuxt-cornerstone3d',
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
        console.error('[nuxt-cornerstone3d] initialisation failed', error)
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

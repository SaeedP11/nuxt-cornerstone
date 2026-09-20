import { defineNuxtPlugin, useRuntimeConfig } from '#imports'
import { configureI18n } from './i18n'
import { followHostLocale, sourcesOf } from './i18n/detect'
import type { CornerstoneModuleOptions } from './types'

/**
 * Install the locale on both server and client, and — when asked — keep it in
 * step with the application that installed the module.
 *
 * Cornerstone itself is client-only, but its strings are not: a series label or
 * an error rendered during SSR has to come back in the configured locale, and
 * `<html lang dir>` has to match what the client will hydrate to. Doing this in
 * the client plugin alone produces a first paint in English that then flips.
 */
export default defineNuxtPlugin({
  name: 'nuxt-cornerstone:i18n',
  enforce: 'pre',
  setup(nuxtApp) {
    const options = useRuntimeConfig().public.cornerstone as CornerstoneModuleOptions | undefined
    const i18n = options?.i18n
    configureI18n(i18n)

    // Detection is client-side on purpose. The locale is module-scoped state,
    // which on the server is shared by every in-flight request, so following a
    // per-request locale there would let one request's language leak into
    // another's. SSR renders the configured locale.
    if (import.meta.server || !i18n || !i18n.detect) return

    followHostLocale(nuxtApp, sourcesOf(i18n.detect))
  },
})

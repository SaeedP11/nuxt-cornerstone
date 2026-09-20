import { toValue, watch } from 'vue'
import { hasCornerstoneCatalog, setCornerstoneLocale } from './index'
import type { CornerstoneI18nOptions, LocaleSource } from '../types'

/**
 * Reading the locale from the application that installed the module.
 *
 * Kept out of the plugin so it depends on nothing Nuxt-specific — the plugin
 * hands it `nuxtApp` and it duck-types its way from there.
 */

export const ALL_SOURCES: LocaleSource[] = ['i18n', 'html', 'navigator']

export function sourcesOf(
  detect: NonNullable<CornerstoneI18nOptions['detect']>,
): LocaleSource[] {
  return Array.isArray(detect) ? detect : detect ? ALL_SOURCES : []
}

/**
 * Adopt a locale only if there is a catalogue for it.
 *
 * An app running in a language nobody has translated keeps the configured
 * locale, rather than flipping text direction under the viewer to go on showing
 * English anyway.
 */
export function adoptLocale(candidate: unknown): boolean {
  if (typeof candidate !== 'string' || !candidate) return false
  if (!hasCornerstoneCatalog(candidate)) return false
  setCornerstoneLocale(candidate)
  return true
}

/** Try each source in order; returns the one that answered, or `null`. */
export function followHostLocale(
  nuxtApp: unknown,
  sources: LocaleSource[],
): LocaleSource | null {
  for (const source of sources) {
    if (source === 'i18n' && followHostI18n(nuxtApp)) return source
    if (source === 'html' && followHtmlLang()) return source
    if (source === 'navigator' && adoptLocale(navigator.language)) return source
  }
  return null
}

/**
 * `@nuxtjs/i18n` and vue-i18n both put the active locale on `nuxtApp.$i18n`.
 * It is duck-typed rather than imported, so the module gains no dependency and
 * simply declines when neither is installed.
 *
 * `toValue` inside the getter covers both shapes: a `Ref` in Composition mode,
 * a reactive string property in legacy mode.
 */
export function followHostI18n(nuxtApp: unknown): boolean {
  const host = (nuxtApp as { $i18n?: { locale?: unknown } } | undefined)?.$i18n
  if (!host || host.locale === undefined) return false

  const read = () => toValue(host.locale)
  if (!adoptLocale(read())) return false

  // Only watch once the first read was usable, so a host running an
  // untranslated language leaves the module alone entirely.
  watch(read, adoptLocale)
  return true
}

/**
 * The `lang` attribute, watched so a switch at runtime is picked up. Nearly
 * every i18n library sets it, which makes this the generic path.
 *
 * Do not pair this source with setting `<html lang>` *from* this module's
 * locale — that is a cycle. It settles, because adopting the locale that is
 * already active changes nothing, but the app then has no source of truth.
 */
export function followHtmlLang(): boolean {
  const root = document.documentElement
  if (!adoptLocale(root.lang)) return false

  new MutationObserver(() => adoptLocale(root.lang)).observe(root, {
    attributes: true,
    attributeFilter: ['lang'],
  })
  return true
}

import { ref } from 'vue'
import type { Ref } from 'vue'
import { BUILTIN_MESSAGES } from './messages'
import type {
  MessageCatalog,
  MessageKey,
  MessageParams,
  MessageValue,
  PluralCategory,
} from './messages'
import type { CornerstoneI18nOptions } from '../types'

export type {
  CornerstoneMessageKey,
  MessageCatalog,
  MessageKey,
  MessageParams,
  MessageValue,
  PluralCategory,
} from './messages'
export { BUILTIN_MESSAGES, en, fa } from './messages'

/**
 * A translator supplied by the host app, to route this module's strings
 * through whatever i18n it already runs. Return `undefined` for any key it does
 * not know and the built-in catalogue answers instead, so an app can override
 * three strings without adopting the whole set.
 */
export type CornerstoneTranslator = (
  key: MessageKey,
  params: MessageParams | undefined,
  locale: string,
) => string | undefined

export const DEFAULT_LOCALE = 'en'

/**
 * Locales written right-to-left. Only the language subtag is compared, so
 * `fa-IR` and `fa` behave the same.
 */
const RTL_LANGUAGES = new Set([
  'ar', 'ckb', 'dv', 'fa', 'he', 'ku', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi',
])

interface I18nState {
  /** A ref, so every `t()` call made inside a computed or a render re-runs. */
  locale?: Ref<string>
  fallbackLocale?: string
  /** `false` when `cornerstone.i18n` is off: stay on English, ignore locale changes. */
  enabled?: boolean
  numberingSystem?: 'auto' | 'latn'
  catalogs?: Record<string, MessageCatalog>
  translator?: CornerstoneTranslator | null
}

// Parked on `import.meta.hot.data` for the same reason the Cornerstone state is:
// replacing this module in dev must not reset the locale under a mounted tree.
const hot = import.meta.hot
const state: I18nState = hot ? ((hot.data.cornerstoneI18n ??= {}) as I18nState) : {}

state.locale ??= ref<string>(DEFAULT_LOCALE)
state.fallbackLocale ??= DEFAULT_LOCALE
state.enabled ??= true
state.numberingSystem ??= 'auto'
state.catalogs ??= cloneCatalogs(BUILTIN_MESSAGES)
state.translator ??= null

function cloneCatalogs(source: Record<string, MessageCatalog>): Record<string, MessageCatalog> {
  const out: Record<string, MessageCatalog> = {}
  for (const [locale, catalog] of Object.entries(source)) out[locale] = { ...catalog }
  return out
}

/**
 * Apply the build-time `cornerstone.i18n` options.
 *
 * Called from `configureCornerstone()`, so it runs both for options that came
 * through `runtimeConfig` and for options handed to `ensureCornerstone()` by an
 * app's own plugin.
 */
export function configureI18n(options: CornerstoneI18nOptions | false | undefined): void {
  if (options === false) {
    state.enabled = false
    state.locale!.value = DEFAULT_LOCALE
    return
  }
  if (!options) return

  state.enabled = true

  if (options.messages) {
    for (const [locale, catalog] of Object.entries(options.messages)) {
      if (!catalog) continue
      state.catalogs![locale] = { ...state.catalogs![locale], ...catalog }
    }
  }
  if (options.fallbackLocale) state.fallbackLocale = options.fallbackLocale
  if (options.numberingSystem) state.numberingSystem = options.numberingSystem
  if (options.locale) state.locale!.value = options.locale
}

export function getCornerstoneLocale(): string {
  return state.locale!.value
}

/**
 * Switch locale at runtime. A no-op when `cornerstone.i18n` is `false` — an app
 * that turned the catalogue off is driving the strings from its own i18n, and
 * silently tracking a second locale here would only be confusing.
 */
export function setCornerstoneLocale(locale: string): void {
  if (!state.enabled) return
  state.locale!.value = locale
}

/** Every locale with a catalogue, built-in or registered through options. */
export function getCornerstoneLocales(): string[] {
  return Object.keys(state.catalogs!)
}

/**
 * Whether there is a catalogue for a locale, matching `fa-IR` against `fa`.
 * Locale detection uses this to ignore languages nobody has translated.
 */
export function hasCornerstoneCatalog(locale: string): boolean {
  const catalogs = state.catalogs!
  return locale in catalogs || locale.split(/[-_]/)[0]! in catalogs
}

/** Route this module's strings through the host app's i18n. `null` unsets it. */
export function setCornerstoneTranslator(translator: CornerstoneTranslator | null): void {
  state.translator = translator
}

/** Register or extend a catalogue at runtime, for locales not in the config. */
export function addCornerstoneMessages(locale: string, catalog: MessageCatalog): void {
  state.catalogs![locale] = { ...state.catalogs![locale], ...catalog }
}

/** Whether a locale is written right-to-left. */
export function isRtlLocale(locale: string = getCornerstoneLocale()): boolean {
  return RTL_LANGUAGES.has(locale.toLowerCase().split(/[-_]/)[0]!)
}

/** `'rtl'` or `'ltr'`, ready for a `dir` attribute. */
export function dirForLocale(locale: string = getCornerstoneLocale()): 'ltr' | 'rtl' {
  return isRtlLocale(locale) ? 'rtl' : 'ltr'
}

/**
 * Translate a key.
 *
 * Resolution order is translator, active locale, fallback locale, English, and
 * finally the key itself — a missing string shows up as `series.unnamed`
 * rather than as an empty label.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const locale = getCornerstoneLocale()

  const supplied = state.translator?.(key, params, locale)
  if (typeof supplied === 'string') return supplied

  const value = lookup(key, locale)
    ?? lookup(key, state.fallbackLocale!)
    ?? lookup(key, DEFAULT_LOCALE)
  if (value === undefined) return key

  return interpolate(selectPlural(value, params, locale), params, locale)
}

function lookup(key: MessageKey, locale: string): MessageValue | undefined {
  const catalogs = state.catalogs!
  // `fa-IR` should find the `fa` catalogue.
  const language = locale.split(/[-_]/)[0]!
  return catalogs[locale]?.[key] ?? catalogs[language]?.[key]
}

function selectPlural(
  value: MessageValue,
  params: MessageParams | undefined,
  locale: string,
): string {
  if (typeof value === 'string') return value

  const count = params?.count
  const category: PluralCategory = typeof count === 'number'
    ? pluralRules(locale).select(count) as PluralCategory
    : 'other'

  return value[category] ?? value.other ?? value.one ?? ''
}

/**
 * Numbers are formatted rather than concatenated, which is what gives Farsi
 * its Persian-Indic digits: `Intl.NumberFormat('fa')` defaults to `arabext`.
 */
function interpolate(
  template: string,
  params: MessageParams | undefined,
  locale: string,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    if (value === undefined) return match
    return typeof value === 'number' ? formatNumber(value, undefined, locale) : value
  })
}

/** Format a number in the active locale. */
export function n(value: number, options?: Intl.NumberFormatOptions): string {
  return formatNumber(value, options, getCornerstoneLocale())
}

function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions | undefined,
  locale: string,
): string {
  return numberFormat(locale, options).format(value)
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * Human-readable byte size in the active locale — `2 GB`, or «۲ گیگابایت».
 *
 * The number is formatted by `Intl` (Persian-Indic digits, Persian decimal
 * separator) but the unit comes from the catalogue. `Intl`'s own `style: 'unit'`
 * is not usable here: CLDR's short English name for `byte` is "byte", so a
 * 900-byte archive would read "900 byte".
 */
export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return t('bytes.value', {
    value: n(value, { maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0 }),
    unit: t(`bytes.unit.${BYTE_UNITS[unit]}`),
  })
}

/**
 * `Intl` constructors are expensive enough to be worth caching, and these are
 * called once per archive member in the worst case.
 */
const numberFormats = new Map<string, Intl.NumberFormat>()
const pluralRulesCache = new Map<string, Intl.PluralRules>()

function numberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const resolved = withNumberingSystem(locale)
  const key = `${resolved}|${options ? JSON.stringify(options) : ''}`
  let format = numberFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(resolved, options)
    numberFormats.set(key, format)
  }
  return format
}

function pluralRules(locale: string): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(locale)
    pluralRulesCache.set(locale, rules)
  }
  return rules
}

/**
 * `numberingSystem: 'latn'` pins digits to 0-9 even in Farsi, for apps whose
 * users cross-reference slice numbers and identifiers against other systems.
 */
function withNumberingSystem(locale: string): string {
  if (state.numberingSystem !== 'latn') return locale
  return locale.includes('-u-') ? `${locale}-nu-latn` : `${locale}-u-nu-latn`
}

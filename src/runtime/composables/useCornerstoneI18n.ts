import { computed } from 'vue'
import {
  addCornerstoneMessages,
  dirForLocale,
  formatBytes,
  getCornerstoneLocale,
  getCornerstoneLocales,
  isRtlLocale,
  n,
  setCornerstoneLocale,
  setCornerstoneTranslator,
  t,
} from '../i18n'

/**
 * Locale, translation and number formatting for this module's strings.
 *
 * The locale lives in a module-scoped ref, so every viewer in the app switches
 * together and `t()` re-runs inside any computed or render that read it.
 *
 * `dir` is for an app's own chrome. Do not apply it to the viewport: a DICOM
 * image must never be mirrored, because left and right are clinical facts about
 * the patient. `<CornerstoneViewport>` therefore pins itself to `dir="ltr"`.
 */
export function useCornerstoneI18n() {
  const locale = computed<string>({
    get: () => getCornerstoneLocale(),
    set: value => setCornerstoneLocale(value),
  })

  return {
    locale,
    setLocale: setCornerstoneLocale,
    availableLocales: computed(() => getCornerstoneLocales()),
    /** `'rtl'` or `'ltr'` for the active locale. */
    dir: computed(() => dirForLocale(locale.value)),
    isRtl: computed(() => isRtlLocale(locale.value)),
    t,
    n,
    formatBytes,
    addMessages: addCornerstoneMessages,
    setTranslator: setCornerstoneTranslator,
  }
}

import { computed, ref } from 'vue'
import { t } from '../i18n'
import { useDicomAnnotations } from './useDicomAnnotations'
import type { MaybeRefOrGetter } from 'vue'
import type { StackViewport } from '../types'

/** Amber: nothing on a greyscale image is close to it, and it is not alarm red. */
const DEFAULT_BOX_COLOR = 'rgb(251, 191, 36)'

export interface AnnotationReportOptions {
  /** CSS colour for the boxes. Default: amber. */
  color?: string
}

/**
 * Opening a JSON annotation report as a user action.
 *
 * {@link useDicomAnnotations} reads the file and draws the boxes; this adds the
 * part an application always ends up writing — which file is open, whether its
 * boxes are showing, and what to tell the reader afterwards. The interesting
 * case is a file that parsed perfectly and placed nothing, which normally means
 * the report was made from a different series rather than that anything went
 * wrong, and which a bare count would not explain.
 */
export function useAnnotationReport(
  viewport: MaybeRefOrGetter<StackViewport | null | undefined>,
  options: AnnotationReportOptions = {},
) {
  const { addJson, clear, setVisible, visible, drawn, pending } = useDicomAnnotations(viewport)

  const busy = ref(false)
  const loaded = ref(false)
  const fileName = ref<string | null>(null)
  const failure = ref<string | null>(null)

  /** Kept as numbers so the notice re-renders in the new language on a switch. */
  const stats = ref<{
    total: number
    placed: number
    malformed: number
    series: string | null
  } | null>(null)

  /**
   * Read one file and draw it, replacing whatever a previous file drew.
   *
   * Replacing rather than accumulating is the honest reading of "open this
   * file": two reports layered on one stack, with no way to tell which box came
   * from which, would be a worse picture than either alone.
   */
  async function open(file: File) {
    busy.value = true
    failure.value = null
    try {
      clear()
      const result = await addJson(file, { color: options.color ?? DEFAULT_BOX_COLOR })

      fileName.value = file.name
      loaded.value = true
      setVisible(true)
      stats.value = {
        total: result.report.boxes.length,
        placed: result.drawn + result.deferred,
        malformed: result.report.malformed,
        series: result.report.seriesInstanceUid,
      }
    }
    catch (caught) {
      reset()
      failure.value = t('report.failed', {
        file: file.name,
        message: caught instanceof Error ? caught.message : String(caught),
      })
    }
    finally {
      busy.value = false
    }
  }

  function toggle() {
    setVisible(!visible.value)
  }

  /** Call when the stack changes: boxes are keyed to the imageIds it had. */
  function reset() {
    clear()
    loaded.value = false
    fileName.value = null
    stats.value = null
    failure.value = null
  }

  const summaryText = computed(() => {
    const value = stats.value
    if (!value || !fileName.value) return null

    if (value.total === 0) return t('report.empty', { file: fileName.value })

    if (value.placed === 0) {
      return value.series
        ? t('report.unmatched', { total: value.total, series: value.series })
        : t('report.unmatchedNoSeries', { total: value.total })
    }

    const parts = [
      t('report.summary', {
        file: fileName.value,
        placed: value.placed,
        total: value.total,
      }),
    ]
    if (pending.value > 0) parts.push(t('report.waiting', { count: pending.value }))
    if (value.malformed > 0) parts.push(t('report.dropped', { count: value.malformed }))
    return parts.join(' ')
  })

  return { open, toggle, reset, busy, loaded, visible, summaryText, failure, drawn, pending }
}

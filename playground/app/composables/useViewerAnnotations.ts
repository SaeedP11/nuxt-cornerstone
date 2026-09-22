import type { MaybeRefOrGetter } from 'vue'
import type { Types as CoreTypes } from '@cornerstonejs/core'

/**
 * The demo's side of loading a JSON annotation file.
 *
 * The module reads the file and draws the boxes; what is left here is the part
 * an application always owns — which file the user picked, and what to tell
 * them about it afterwards. The interesting case is a file that parsed
 * perfectly and placed nothing, which normally means the report was made from a
 * different series rather than that anything went wrong.
 */

/** Amber: nothing on a greyscale image is close to it, and it is not alarm red. */
const BOX_COLOR = 'rgb(251, 191, 36)'

export function useViewerAnnotations(
  viewport: MaybeRefOrGetter<CoreTypes.IStackViewport | null>,
) {
  const { addJson, clear, setVisible, visible, drawn, pending } = useDicomAnnotations(viewport)
  const { t } = useCornerstoneI18n()

  const busy = ref(false)
  const loaded = ref(false)
  const fileName = ref<string | null>(null)
  const failure = ref<string | null>(null)

  /** Kept as numbers so the notice re-renders in the new language on a switch. */
  const stats = ref<{ total: number, placed: number, malformed: number, series: string | null } | null>(null)

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
      const result = await addJson(file, { color: BOX_COLOR })

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
      failure.value = t('app.annotations.failed', {
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

  /** Called when the stack changes: boxes are keyed to the imageIds it had. */
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

    if (value.total === 0) return t('app.annotations.empty', { file: fileName.value })

    if (value.placed === 0) {
      return value.series
        ? t('app.annotations.unmatched', { total: value.total, series: value.series })
        : t('app.annotations.unmatchedNoSeries', { total: value.total })
    }

    const parts = [
      t('app.annotations.summary', {
        file: fileName.value,
        placed: value.placed,
        total: value.total,
      }),
    ]
    if (pending.value > 0) parts.push(t('app.annotations.waiting', { count: pending.value }))
    if (value.malformed > 0) parts.push(t('app.annotations.dropped', { count: value.malformed }))
    return parts.join(' ')
  })

  return { open, toggle, reset, busy, loaded, visible, summaryText, failure, drawn, pending }
}

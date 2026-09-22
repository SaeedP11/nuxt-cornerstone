import { computed, ref, shallowRef } from 'vue'
import { t } from '../i18n'
import { useCornerstone } from './useCornerstone'
import { useDicomFiles } from './useDicomFiles'
import { guardDicomFiles } from './useDicomGuard'
import type { DicomSeries, ZipProgress } from './useDicomFiles'
import type { RejectedFile } from './useDicomGuard'
import type { SkipReason } from '../dicom-zip'

/** Why the guard turned a file away, as something a reader can act on. */
const SKIP_REASON_KEY: Record<SkipReason, string> = {
  'metadata': 'study.skip.metadata',
  'not-dicom-extension': 'study.skip.notDicomExtension',
  'not-dicom': 'study.skip.notDicom',
  'empty': 'study.skip.empty',
}

/** Files named individually before the rest become "and N more". */
const MAX_NAMED_REJECTS = 3

/**
 * What produced the current stack. Kept as data rather than as a finished
 * string, so a caption re-renders in the new language when the locale changes
 * instead of freezing whatever was picked at load time.
 */
export type SourceInfo =
  | { kind: 'urls', count: number }
  | { kind: 'files', count: number, skipped: number }
  | { kind: 'zip', file: string, images: number, series: number, skipped: number }

/**
 * A problem to show. Either a key to translate, or a message that already came
 * out of a thrown error — those are translated at the moment they are thrown,
 * so switching locale afterwards does not rewrite them.
 */
export type Problem =
  | { key: string, params?: Record<string, string | number> }
  | { message: string }

export interface OpenUrlsOptions {
  /**
   * Read each image's headers after the stack is on screen. Default: `true`.
   *
   * A `wadouri:` imageId is built without reading the file, so nothing would
   * know these slices' SOPInstanceUIDs and an annotation report could never be
   * matched to them. Indexing afterwards keeps the images showing straight
   * away and does not block them.
   */
  index?: boolean
  /**
   * A caption for {@link useDicomStudy.sourceLabel} in place of the built-in
   * count. Pass a getter rather than a string, so it re-runs on a locale
   * switch like every other label here.
   */
  label?: () => string
}

/**
 * Everything an application needs to know about the stack on screen: where it
 * came from, how loading it is going, and which series of an archive is
 * showing.
 *
 * This is the orchestration layer over {@link useDicomFiles} — the part every
 * viewer ends up writing, and the part that has nothing to do with how the
 * viewer looks. It produces state and already-translated captions; the
 * application supplies the buttons, the drop target and the series list.
 *
 * State is created per call rather than held at module scope. Module-scoped
 * state is shared by every in-flight request during SSR, which is the same
 * trap the README describes for the locale. Call this once, high up, and pass
 * what each component needs down as props.
 */
export function useDicomStudy() {
  const { ready, error: initError } = useCornerstone()
  const { addFiles, addZip, toImageId, indexUrls, purge } = useDicomFiles()

  const imageIds = ref<string[]>([])
  const imageIndex = ref(0)
  const source = ref<SourceInfo | null>(null)
  const busy = ref(false)
  const problem = ref<Problem | null>(null)

  /** Set by `openUrls({ label })`, and cleared by every other source. */
  const sourceLabelOverride = shallowRef<(() => string) | null>(null)

  // ZIP state. `series` stays empty for every other source, which is what a
  // series browser keys off.
  const series = shallowRef<DicomSeries[]>([])
  const activeSeriesUid = ref<string | null>(null)
  const progress = ref<ZipProgress | null>(null)

  /** What the guard turned away on the last open, for the notice below. */
  const rejected = ref<RejectedFile[]>([])

  const maxIndex = computed(() => Math.max(0, imageIds.value.length - 1))

  const problemText = computed(() => {
    if (initError.value) return initError.value.message
    const value = problem.value
    if (!value) return null
    return 'key' in value ? t(value.key, value.params) : value.message
  })

  /** Both file and archive sources report what they left behind the same way. */
  function withSkipped(summary: string, skipped: number): string {
    if (!skipped) return summary
    return summary + t('list.separator') + t('study.count.skipped', { count: skipped })
  }

  const sourceLabel = computed(() => {
    const value = source.value
    if (!value) return ''
    if (value.kind === 'urls') {
      return sourceLabelOverride.value?.() ?? t('study.source.urls', { count: value.count })
    }
    if (value.kind === 'files') {
      return withSkipped(t('study.source.files', { count: value.count }), value.skipped)
    }

    return withSkipped(
      t('study.source.zip', {
        file: value.file,
        images: t('series.images', { count: value.images }),
        series: t('study.count.series', { count: value.series }),
      }),
      value.skipped,
    )
  })

  /**
   * The guard's verdict in one line. A few files are named with their reason;
   * beyond that the names stop being useful and only the tally is kept.
   */
  const rejectedText = computed(() => {
    const list = rejected.value
    if (!list.length) return null

    const named = list
      .slice(0, MAX_NAMED_REJECTS)
      .map(entry => t('study.skipped.entry', {
        name: entry.name,
        reason: t(SKIP_REASON_KEY[entry.reason]),
      }))
      .join(t('list.separator'))

    const count = t('study.count.skipped', { count: list.length })
    const rest = list.length - Math.min(list.length, MAX_NAMED_REJECTS)
    return rest > 0
      ? t('study.skipped.more', { count, named, rest })
      : t('study.skipped.summary', { count, named })
  })

  const progressLabel = computed(() => {
    const value = progress.value
    if (!value) return ''
    if (value.phase === 'reading') return t('study.progress.reading')
    if (value.phase === 'extracting') return t('study.progress.extracting')
    return t('study.progress.indexing', { done: value.done, total: value.total })
  })

  /** Indeterminate until there is something countable to count. */
  const progressValue = computed(() => {
    const value = progress.value
    if (!value || value.phase !== 'indexing' || value.total === 0) return null
    return Math.round((value.done / value.total) * 100)
  })

  /**
   * Show a stack that is already served over HTTP, in the order given.
   *
   * This is the path for a study that comes from an application's own server
   * or a PACS proxy rather than from the user's disk. Nothing is fetched here:
   * each URL becomes a `wadouri:` imageId, and the viewport loads a slice when
   * it shows it.
   */
  function openUrls(urls: string[], options: OpenUrlsOptions = {}) {
    if (!urls.length) {
      problem.value = { key: 'study.error.noUrls' }
      return
    }

    problem.value = null
    rejected.value = []
    resetSeries()
    imageIndex.value = 0
    imageIds.value = urls.map(toImageId)
    source.value = { kind: 'urls', count: urls.length }
    sourceLabelOverride.value = options.label ?? null

    if (options.index !== false) indexUrls(urls)
  }

  async function openFiles(files: File[] | FileList | null) {
    if (!files) return
    const list = Array.from(files)
    if (!list.length) return

    busy.value = true
    problem.value = null
    rejected.value = []
    sourceLabelOverride.value = null
    try {
      const guard = await guardDicomFiles(list)
      rejected.value = guard.rejected

      // Nothing survived: say so rather than clearing the viewport, so a
      // mis-picked folder does not look like a viewer that broke.
      if (!guard.accepted.length) {
        problem.value = { key: 'study.error.noDicomFiles', params: { count: list.length } }
        return
      }

      const ids = await addFiles(guard.accepted)
      resetSeries()
      imageIndex.value = 0
      imageIds.value = ids
      source.value = { kind: 'files', count: ids.length, skipped: guard.rejected.length }
    }
    catch (caught) {
      problem.value = { message: caught instanceof Error ? caught.message : String(caught) }
    }
    finally {
      busy.value = false
    }
  }

  async function openZip(file: File) {
    busy.value = true
    problem.value = null
    progress.value = null
    sourceLabelOverride.value = null
    // The archive reports what it skipped through `source`, so the guard's
    // notice from a previous open must not linger next to it.
    rejected.value = []
    try {
      const result = await addZip(file, {
        onProgress: value => (progress.value = value),
      })

      if (!result.series.length) {
        resetSeries()
        imageIds.value = []
        source.value = null
        problem.value = { key: 'study.error.noDicomInZip', params: { file: file.name } }
        return
      }

      series.value = result.series
      selectSeries(result.series[0]!.seriesInstanceUid)

      source.value = {
        kind: 'zip',
        file: file.name,
        images: result.imageIds.length,
        series: result.series.length,
        skipped: result.skipped.length,
      }
    }
    catch (caught) {
      problem.value = { message: caught instanceof Error ? caught.message : String(caught) }
    }
    finally {
      busy.value = false
      progress.value = null
    }
  }

  function selectSeries(uid: string | null) {
    const chosen = series.value.find(entry => entry.seriesInstanceUid === uid)
    if (!chosen) return
    activeSeriesUid.value = chosen.seriesInstanceUid
    imageIndex.value = 0
    imageIds.value = chosen.imageIds
  }

  function resetSeries() {
    series.value = []
    activeSeriesUid.value = null
  }

  function isZip(file: File): boolean {
    return /\.zip$/i.test(file.name) || /zip/.test(file.type)
  }

  /**
   * One way in for everything the user hands over, whether picked from a
   * dialog or dropped on the viewport.
   *
   * An archive is unpacked; anything else goes through the plain file path,
   * where the guard vets it. Choosing a ZIP alongside loose files is
   * ambiguous, so the archive wins and the rest is ignored.
   */
  function openAny(files: File[]) {
    if (!files.length) return
    const archive = files.find(isZip)
    if (archive) openZip(archive)
    else openFiles(files)
  }

  /** Move `delta` images through the stack, stopping at either end. */
  function step(delta: number) {
    if (!imageIds.value.length) return
    imageIndex.value = Math.min(maxIndex.value, Math.max(0, imageIndex.value + delta))
  }

  /** Move `delta` series through the archive, stopping at either end. */
  function stepSeries(delta: number) {
    if (series.value.length < 2) return
    const current = series.value.findIndex(
      entry => entry.seriesInstanceUid === activeSeriesUid.value,
    )
    const next = Math.min(series.value.length - 1, Math.max(0, current + delta))
    if (next === current) return
    selectSeries(series.value[next]!.seriesInstanceUid)
  }

  /** Forget the stack and release everything it registered. */
  async function clear() {
    imageIds.value = []
    imageIndex.value = 0
    source.value = null
    sourceLabelOverride.value = null
    rejected.value = []
    problem.value = null
    resetSeries()
    await purge()
  }

  /** Report a problem of the application's own in the same place as ours. */
  function setProblem(value: Problem | null) {
    problem.value = value
  }

  return {
    ready,
    imageIds,
    imageIndex,
    maxIndex,
    source,
    busy,
    problemText,
    series,
    activeSeriesUid,
    progress,
    progressLabel,
    progressValue,
    sourceLabel,
    rejectedText,
    openUrls,
    openFiles,
    openZip,
    openAny,
    selectSeries,
    step,
    stepSeries,
    clear,
    setProblem,
  }
}

import type { DicomSeries, ZipProgress } from '../../../src/runtime/composables/useDicomFiles'
import type { SkipReason } from '../../../src/runtime/dicom-zip'
import type { RejectedFile } from './useDicomGuard'

/** Why the guard turned a file away, as something a reader can act on. */
const SKIP_REASON_KEY: Record<SkipReason, string> = {
  'metadata': 'app.skip.metadata',
  'not-dicom-extension': 'app.skip.notDicomExtension',
  'not-dicom': 'app.skip.notDicom',
  'empty': 'app.skip.empty',
}

/** Files named individually before the rest become "and N more". */
const MAX_NAMED_REJECTS = 3

interface SampleEntry {
  name: string
  label: string
  bytes: number
}

/**
 * What produced the current stack. Kept as data rather than as a finished
 * string, so the footer re-renders in the new language when the locale changes
 * instead of freezing whatever was picked at load time.
 */
export type SourceInfo =
  | { kind: 'samples', count: number }
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

/**
 * Everything the demo knows about the stack on screen: where it came from, how
 * loading it is going, and which series of an archive is showing.
 *
 * State is created per call rather than held at module scope. Module-scoped
 * state is shared by every in-flight request during SSR, which is the same trap
 * the module's README describes for the locale. The page calls this once and
 * passes what each component needs down as props.
 */
export function useViewerStudy() {
  const { ready, error: initError } = useCornerstone()
  const { addFiles, addZip, toImageId, purge } = useDicomFiles()
  const { t } = useCornerstoneI18n()

  const imageIds = ref<string[]>([])
  const imageIndex = ref(0)
  const source = ref<SourceInfo | null>(null)
  const busy = ref(false)
  const problem = ref<Problem | null>(null)

  // ZIP state. `series` stays empty for every other source, which is what the
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
    return summary + t('list.separator') + t('app.count.skipped', { count: skipped })
  }

  const sourceLabel = computed(() => {
    const value = source.value
    if (!value) return ''
    if (value.kind === 'samples') return t('app.source.samples', { count: value.count })
    if (value.kind === 'files') {
      return withSkipped(t('app.source.files', { count: value.count }), value.skipped)
    }

    return withSkipped(
      t('app.source.zip', {
        file: value.file,
        images: t('app.count.images', { count: value.images }),
        series: t('app.count.series', { count: value.series }),
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
      .map(entry => t('app.skipped.entry', {
        name: entry.name,
        reason: t(SKIP_REASON_KEY[entry.reason]),
      }))
      .join(t('list.separator'))

    const count = t('app.count.skipped', { count: list.length })
    const rest = list.length - Math.min(list.length, MAX_NAMED_REJECTS)
    return rest > 0
      ? t('app.skipped.more', { count, named, rest })
      : t('app.skipped.summary', { count, named })
  })

  const progressLabel = computed(() => {
    const value = progress.value
    if (!value) return ''
    if (value.phase === 'reading') return t('app.progress.reading')
    if (value.phase === 'extracting') return t('app.progress.extracting')
    return t('app.progress.indexing', { done: value.done, total: value.total })
  })

  /** Indeterminate until there is something countable to count. */
  const progressValue = computed(() => {
    const value = progress.value
    if (!value || value.phase !== 'indexing' || value.total === 0) return null
    return Math.round((value.done / value.total) * 100)
  })

  /**
   * The bundled stack. `pnpm samples` downloads it and it is gitignored, so it
   * exists in a checkout and not in a build — which is why the button that
   * calls this is development-only.
   */
  async function loadSamples() {
    busy.value = true
    problem.value = null
    try {
      const manifest = await $fetch<SampleEntry[]>('/samples/manifest.json')
      if (!manifest.length) throw new Error('manifest is empty')
      resetSeries()
      imageIndex.value = 0
      imageIds.value = manifest.map(entry => toImageId(`/samples/${entry.name}`))
      source.value = { kind: 'samples', count: manifest.length }
    }
    catch {
      problem.value = { key: 'app.error.noSamples' }
    }
    finally {
      busy.value = false
    }
  }

  async function open(files: File[] | FileList | null) {
    if (!files) return
    const list = Array.from(files)
    if (!list.length) return

    busy.value = true
    problem.value = null
    rejected.value = []
    try {
      const guard = await guardDicomFiles(list)
      rejected.value = guard.rejected

      // Nothing survived: say so rather than clearing the viewport, so a
      // mis-picked folder does not look like a viewer that broke.
      if (!guard.accepted.length) {
        problem.value = { key: 'app.error.noDicomFiles', params: { count: list.length } }
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
        problem.value = { key: 'app.error.noDicomInZip', params: { file: file.name } }
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
   * One way in for everything the user hands over, whether picked from the
   * dialog or dropped on the stage.
   *
   * An archive is unpacked; anything else goes through the plain file path,
   * where the guard vets it. Choosing a ZIP alongside loose files is
   * ambiguous, so the archive wins and the rest is ignored.
   */
  function openAny(files: File[]) {
    if (!files.length) return
    const archive = files.find(isZip)
    if (archive) openZip(archive)
    else open(files)
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

  async function clear() {
    imageIds.value = []
    imageIndex.value = 0
    source.value = null
    rejected.value = []
    resetSeries()
    await purge()
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
    loadSamples,
    openAny,
    selectSeries,
    step,
    stepSeries,
    clear,
  }
}

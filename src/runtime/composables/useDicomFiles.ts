import { ensureCornerstone } from '../cornerstone'
import { clearInstanceIndex, imageIdForSopInstanceUid, registerInstance } from '../dicom-instances'
import { t } from '../i18n'
import { unzipDicom } from '../dicom-zip'
import type { SkippedEntry, ZipEntry } from '../dicom-zip'

export type { SkippedEntry, SkipReason } from '../dicom-zip'

export interface AddFilesOptions {
  /**
   * How to order the resulting imageIds.
   *
   * - `'instanceNumber'` (default) reads DICOM tag (0020,0013) from each file
   *   and sorts on it, falling back to the filename for files that do not
   *   carry it. This is what a viewer needs: filename order and acquisition
   *   order disagree often enough to matter.
   * - `'name'` sorts by filename with a natural (numeric-aware) collator.
   * - `false` keeps the order the files came in.
   */
  sort?: 'instanceNumber' | 'name' | false
}

export interface AddZipOptions extends AddFilesOptions {
  /**
   * `'series'` (default) splits the archive by SeriesInstanceUID (0020,000E),
   * because a study ZIP normally holds several series and stacking a sagittal
   * T1 on top of an axial T2 is not a stack. `false` returns one group holding
   * everything, matching {@link useDicomFiles.addFiles}.
   */
  groupBy?: 'series' | false
  /** Ceiling on total uncompressed bytes. Default: 2 GiB. */
  maxBytes?: number
  /** Called as the archive moves through its phases. See {@link ZipProgress}. */
  onProgress?: (progress: ZipProgress) => void
}

export interface ZipProgress {
  /**
   * - `'reading'` — pulling the archive into memory.
   * - `'extracting'` — inflating; fflate reports nothing until it finishes, so
   *   `done`/`total` are both `0` here and a UI should show an indeterminate bar.
   * - `'indexing'` — reading DICOM headers, one file at a time and countable.
   */
  phase: 'reading' | 'extracting' | 'indexing'
  done: number
  total: number
}

/** One series' worth of images, ready to hand to a viewport. */
export interface DicomSeries {
  /** SeriesInstanceUID (0020,000E), or a path-derived id when the tag is absent. */
  seriesInstanceUid: string
  /** SeriesNumber (0020,0011). */
  seriesNumber: number | null
  /** SeriesDescription (0008,103E). */
  description: string | null
  /** Modality (0008,0060). */
  modality: string | null
  /** A human-readable label, already falling back when tags are missing. */
  label: string
  /** imageIds in display order. */
  imageIds: string[]
}

export interface AddZipResult {
  /** Series ordered by SeriesNumber, then description. */
  series: DicomSeries[]
  /** Every imageId, series order then display order within each series. */
  imageIds: string[]
  /** Archive members that were not loaded, and why. */
  skipped: SkippedEntry[]
}

interface DicomHeader {
  instanceNumber: number | null
  sopInstanceUid: string | null
  seriesInstanceUid: string | null
  seriesNumber: number | null
  seriesDescription: string | null
  modality: string | null
}

/** An added file with everything the sorter and grouper need. */
interface IndexedImage {
  /** Filename, or full archive path — whatever the fallback sort should use. */
  name: string
  imageId: string
  header: DicomHeader | null
}

const TAG = {
  sopInstanceUid: 'x00080018',
  modality: 'x00080060',
  seriesDescription: 'x0008103e',
  seriesInstanceUid: 'x0020000e',
  seriesNumber: 'x00200011',
  instanceNumber: 'x00200013',
} as const

/**
 * Elements are stored in ascending tag order, so stopping at InstanceNumber —
 * the highest tag we want — reads every tag in {@link TAG} in one pass.
 */
const UNTIL_TAG = TAG.instanceNumber

/** Header bytes read when looking for those tags before falling back. */
const HEADER_PROBE_BYTES = 256 * 1024

/** Files indexed between yields, so a large archive does not freeze the page. */
const INDEX_CHUNK = 32

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * Turn local DICOM Part 10 files into `dicomfile:` imageIds the viewport can
 * render, unpack ZIP archives of them, and build `wadouri:` imageIds for files
 * served over HTTP.
 */
export function useDicomFiles() {
  async function addFiles(
    input: File[] | FileList,
    options: AddFilesOptions = {},
  ): Promise<string[]> {
    const { sort = 'instanceNumber' } = options
    const files = Array.from(input)
    if (files.length === 0) return []

    const { dicomImageLoader } = await ensureCornerstone()

    const indexed: IndexedImage[] = files.map(file => ({
      name: file.name,
      imageId: dicomImageLoader.wadouri.fileManager.add(file),
      header: null,
    }))

    if (sort === false) return indexed.map(entry => entry.imageId)

    if (sort === 'instanceNumber') {
      await Promise.all(
        files.map(async (file, i) => {
          indexed[i]!.header = await readFileHeader(file)
        }),
      )
      indexInstances(indexed)
    }

    sortImages(indexed, sort)
    return indexed.map(entry => entry.imageId)
  }

  /**
   * Unpack a ZIP archive of DICOM files and register everything inside it.
   *
   * Archive members are filtered twice: by name and declared size before they
   * are inflated, then by their actual bytes. What survives is grouped into
   * series and sorted the same way {@link addFiles} sorts.
   */
  async function addZip(
    input: File | Blob | ArrayBuffer | Uint8Array,
    options: AddZipOptions = {},
  ): Promise<AddZipResult> {
    const { sort = 'instanceNumber', groupBy = 'series', maxBytes, onProgress } = options

    onProgress?.({ phase: 'reading', done: 0, total: 0 })
    const data = await toBytes(input)

    onProgress?.({ phase: 'extracting', done: 0, total: 0 })
    const { entries, skipped } = await unzipDicom(data, { maxBytes })

    if (entries.length === 0) {
      return { series: [], imageIds: [], skipped }
    }

    const { dicomImageLoader } = await ensureCornerstone()

    const indexed: IndexedImage[] = entries.map(entry => ({
      name: entry.path,
      imageId: dicomImageLoader.wadouri.fileManager.add(toFile(entry)),
      header: null,
    }))

    // Grouping needs SeriesInstanceUID, so headers are read whenever grouping
    // is on, regardless of the sort mode.
    if (groupBy === 'series' || sort === 'instanceNumber') {
      await indexHeaders(entries, indexed, onProgress)
      indexInstances(indexed)
    }

    const groups = groupBy === 'series'
      ? groupBySeries(indexed)
      : new Map([['', indexed]])

    const series: DicomSeries[] = []
    for (const [key, images] of groups) {
      if (sort !== false) sortImages(images, sort)
      series.push(toSeries(key, images))
    }

    series.sort(compareSeries)

    return {
      series,
      imageIds: series.flatMap(entry => entry.imageIds),
      skipped,
    }
  }

  /**
   * Build a `wadouri:` imageId for a Part 10 file served over HTTP — a file in
   * `public/`, or any URL your server exposes.
   */
  function toImageId(url: string): string {
    return url.startsWith('wadouri:') ? url : `wadouri:${url}`
  }

  /** Drop every registered file. imageIds handed out earlier stop resolving. */
  async function purge(): Promise<void> {
    const { dicomImageLoader } = await ensureCornerstone()
    dicomImageLoader.wadouri.fileManager.purge()
    clearInstanceIndex()
  }

  return { addFiles, addZip, toImageId, purge, imageIdForSopInstanceUid }
}

/**
 * Record where each slice ended up, so that annotations arriving from
 * elsewhere can find it by SOPInstanceUID.
 *
 * Only files whose header was read get an entry, which is every file on the
 * default settings. `sort: false` and `sort: 'name'` skip header reading
 * altogether, and a file that is not indexed cannot be found by UID.
 */
function indexInstances(images: IndexedImage[]): void {
  for (const image of images) {
    const uid = image.header?.sopInstanceUid
    if (uid) registerInstance(uid, image.imageId)
  }
}

function toFile(entry: ZipEntry): File {
  // The full archive path becomes the File name so that the filename fallback
  // sort still tells `SER1/IM1` apart from `SER2/IM1`. Passing the typed array
  // rather than its `.buffer` matters: Blob copies only the view's window, so
  // a member that is a view into a larger fflate output buffer stays its own
  // size instead of dragging the whole buffer along.
  return new File([entry.bytes], entry.path, { type: 'application/dicom' })
}

async function toBytes(input: File | Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  return new Uint8Array(await input.arrayBuffer())
}

/**
 * Read every entry's header, yielding to the event loop between chunks.
 *
 * Parsing is synchronous CPU work; without the yields a 500-slice study locks
 * the page for long enough that the progress bar never paints.
 */
async function indexHeaders(
  entries: ZipEntry[],
  indexed: IndexedImage[],
  onProgress?: (progress: ZipProgress) => void,
): Promise<void> {
  const total = entries.length
  const dicomParser = await loadDicomParser()
  onProgress?.({ phase: 'indexing', done: 0, total })

  for (let i = 0; i < total; i++) {
    indexed[i]!.header = parseHeader(dicomParser, entries[i]!.bytes)

    if ((i + 1) % INDEX_CHUNK === 0 || i + 1 === total) {
      onProgress?.({ phase: 'indexing', done: i + 1, total })
      await yieldToEventLoop()
    }
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * InstanceNumber, then a numeric-aware name compare for files without one.
 *
 * The mode has to be passed in rather than inferred from whether headers are
 * present: `addZip` reads headers to group by series even when the caller asked
 * for `sort: 'name'`, and those headers must not then decide the order.
 */
function sortImages(images: IndexedImage[], mode: 'instanceNumber' | 'name'): void {
  if (mode === 'name') {
    images.sort((a, b) => collator.compare(a.name, b.name))
    return
  }

  images.sort((a, b) => {
    const left = a.header?.instanceNumber ?? null
    const right = b.header?.instanceNumber ?? null
    if (left !== null && right !== null && left !== right) return left - right
    // Files without an InstanceNumber fall back to filename order, and sort
    // after the ones that have it.
    if (left !== null && right === null) return -1
    if (left === null && right !== null) return 1
    return collator.compare(a.name, b.name)
  })
}

/**
 * Group by SeriesInstanceUID, falling back to the containing directory.
 *
 * The directory fallback matters: a burned CD whose files lost their headers
 * still lays series out one folder each, so grouping on the folder keeps the
 * stacks apart instead of collapsing everything into one.
 */
function groupBySeries(images: IndexedImage[]): Map<string, IndexedImage[]> {
  const groups = new Map<string, IndexedImage[]>()
  for (const image of images) {
    const key = image.header?.seriesInstanceUid ?? directoryOf(image.name)
    const group = groups.get(key)
    if (group) group.push(image)
    else groups.set(key, [image])
  }
  return groups
}

function directoryOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

function toSeries(key: string, images: IndexedImage[]): DicomSeries {
  // Headers within a series agree; take them from the first file that has any.
  const header = images.find(image => image.header !== null)?.header ?? null
  const count = images.length

  const seriesNumber = header?.seriesNumber ?? null
  const description = header?.seriesDescription ?? null
  const modality = header?.modality ?? null

  const name = description
    ?? (key && !header?.seriesInstanceUid ? key : null)
    ?? (seriesNumber !== null
      ? t('series.numbered', { number: seriesNumber })
      : t('series.unnamed'))

  const details = [modality, t('series.images', { count })]
    .filter(Boolean)
    .join(t('list.separator'))

  return {
    seriesInstanceUid: header?.seriesInstanceUid ?? key,
    seriesNumber,
    description,
    modality,
    label: t('series.label', { name, details }),
    imageIds: images.map(image => image.imageId),
  }
}

function compareSeries(a: DicomSeries, b: DicomSeries): number {
  if (a.seriesNumber !== null && b.seriesNumber !== null && a.seriesNumber !== b.seriesNumber) {
    return a.seriesNumber - b.seriesNumber
  }
  if (a.seriesNumber !== null && b.seriesNumber === null) return -1
  if (a.seriesNumber === null && b.seriesNumber !== null) return 1
  return collator.compare(a.label, b.label)
}

/**
 * Read the identifying tags out of a file.
 *
 * `untilTag` makes dicom-parser stop as soon as the last one is read, so the
 * common case only touches the first slice of the file. A file whose header
 * runs past the probe window (long embedded sequences) is retried whole before
 * giving up.
 */
async function readFileHeader(file: File): Promise<DicomHeader | null> {
  const dicomParser = await loadDicomParser()

  const head = await file.slice(0, HEADER_PROBE_BYTES).arrayBuffer()
  const probed = parseHeader(dicomParser, new Uint8Array(head))
  if (probed !== null) return probed

  if (file.size <= HEADER_PROBE_BYTES) return null
  return parseHeader(dicomParser, new Uint8Array(await file.arrayBuffer()))
}

function parseHeader(dicomParser: DicomParser, bytes: Uint8Array): DicomHeader | null {
  try {
    const dataSet = dicomParser.parseDicom(bytes, { untilTag: UNTIL_TAG })
    return {
      instanceNumber: intOrNull(dataSet.intString(TAG.instanceNumber)),
      sopInstanceUid: textOrNull(dataSet.string(TAG.sopInstanceUid)),
      seriesInstanceUid: textOrNull(dataSet.string(TAG.seriesInstanceUid)),
      seriesNumber: intOrNull(dataSet.intString(TAG.seriesNumber)),
      seriesDescription: textOrNull(dataSet.string(TAG.seriesDescription)),
      modality: textOrNull(dataSet.string(TAG.modality)),
    }
  }
  catch {
    // Truncated probe, or not DICOM at all. Callers decide which.
    return null
  }
}

function intOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

type DicomParser = typeof import('dicom-parser')

let dicomParserPromise: Promise<DicomParser> | null = null

/** dicom-parser is CommonJS, hence the default-interop dance. */
function loadDicomParser(): Promise<DicomParser> {
  dicomParserPromise ??= import('dicom-parser').then((mod) => {
    const candidate = mod as unknown as { default?: DicomParser }
    return candidate.default ?? (mod as unknown as DicomParser)
  })
  return dicomParserPromise
}

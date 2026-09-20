import { ensureCornerstone } from '../cornerstone'

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

interface ParsedFile {
  file: File
  imageId: string
  instanceNumber: number | null
}

const INSTANCE_NUMBER_TAG = 'x00200013'
/** Header bytes read when looking for (0020,0013) before falling back. */
const HEADER_PROBE_BYTES = 256 * 1024

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * Turn local DICOM Part 10 files into `dicomfile:` imageIds the viewport can
 * render, and build `wadouri:` imageIds for files served over HTTP.
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

    const parsed: ParsedFile[] = files.map(file => ({
      file,
      imageId: dicomImageLoader.wadouri.fileManager.add(file),
      instanceNumber: null,
    }))

    if (sort === false) return parsed.map(entry => entry.imageId)

    if (sort === 'instanceNumber') {
      await Promise.all(
        parsed.map(async (entry) => {
          entry.instanceNumber = await readInstanceNumber(entry.file)
        }),
      )
    }

    parsed.sort((a, b) => {
      if (a.instanceNumber !== null && b.instanceNumber !== null) {
        return a.instanceNumber - b.instanceNumber
      }
      // Files without an InstanceNumber fall back to filename order, and sort
      // after the ones that have it.
      if (a.instanceNumber !== null) return -1
      if (b.instanceNumber !== null) return 1
      return collator.compare(a.file.name, b.file.name)
    })

    return parsed.map(entry => entry.imageId)
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
  }

  return { addFiles, toImageId, purge }
}

/**
 * Read (0020,0013) InstanceNumber.
 *
 * `untilTag` makes dicom-parser stop as soon as the tag is read, so the common
 * case only touches the first slice of the file. A file whose header runs past
 * the probe window (long embedded sequences) is retried whole before giving up.
 */
async function readInstanceNumber(file: File): Promise<number | null> {
  const dicomParser = await loadDicomParser()

  const attempt = (bytes: Uint8Array): number | null => {
    const dataSet = dicomParser.parseDicom(bytes, { untilTag: INSTANCE_NUMBER_TAG })
    const value = dataSet.intString(INSTANCE_NUMBER_TAG)
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  try {
    const head = await file.slice(0, HEADER_PROBE_BYTES).arrayBuffer()
    const value = attempt(new Uint8Array(head))
    if (value !== null) return value
  }
  catch {
    // Truncated probe — fall through to the whole file.
  }

  if (file.size <= HEADER_PROBE_BYTES) return null

  try {
    return attempt(new Uint8Array(await file.arrayBuffer()))
  }
  catch {
    return null
  }
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

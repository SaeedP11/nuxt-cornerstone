import { formatBytes, t } from './i18n'
import type { Unzipped, UnzipFileInfo } from 'fflate'

export { formatBytes } from './i18n'

/**
 * ZIP extraction for DICOM archives.
 *
 * `fflate` is imported dynamically: an app that never opens a ZIP should not
 * pay for a decompressor, and its async `unzip` inflates on a worker pool so a
 * 500-slice study does not block the frame the user is scrolling.
 */

/** A file pulled out of the archive, kept with the path it had inside it. */
export interface ZipEntry {
  /** Full path inside the archive, e.g. `STUDY/SER00002/IM000001`. */
  path: string
  /**
   * The backing buffer is pinned to `ArrayBuffer` rather than left as
   * `ArrayBufferLike`, because `BlobPart` rejects a possibly-shared buffer and
   * these bytes go straight into a `File`. fflate never allocates on a
   * `SharedArrayBuffer`, so narrowing it here is sound.
   */
  bytes: Uint8Array<ArrayBuffer>
}

export type SkipReason =
  /** Archive metadata: `__MACOSX/`, dotfiles, `DICOMDIR`. */
  | 'metadata'
  /** Ruled out by extension before inflating — .pdf, .jpg, .txt and friends. */
  | 'not-dicom-extension'
  /** Inflated, but neither the `DICM` magic nor a parseable dataset. */
  | 'not-dicom'
  /** Zero bytes. */
  | 'empty'

export interface SkippedEntry {
  path: string
  reason: SkipReason
}

export interface UnzipDicomResult {
  entries: ZipEntry[]
  skipped: SkippedEntry[]
}

/**
 * Default ceiling on total *uncompressed* bytes. A ZIP advertises the
 * uncompressed size of every member in its central directory, so this is
 * checked before anything is inflated — a 100 KB archive claiming 40 GB is
 * rejected without allocating for it.
 */
export const DEFAULT_MAX_BYTES = 2 * 1024 ** 3

export interface UnzipDicomOptions {
  /** Ceiling on total uncompressed bytes. Default: 2 GiB. */
  maxBytes?: number
}

/** Names that are archive housekeeping rather than content. */
function isMetadataPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return (
    path.startsWith('__MACOSX/')
    || path.includes('/__MACOSX/')
    || name.startsWith('.')
    || name === 'DICOMDIR'
    || name === 'Thumbs.db'
  )
}

/**
 * Extensions that are never DICOM. Checked to avoid inflating the report PDFs
 * and logo JPEGs that burned CDs ship alongside the images.
 *
 * Absence of an extension proves nothing in either direction: plenty of DICOM
 * files are named `IM000001` or `I10`, which is why there is no allowlist here.
 */
const NON_DICOM_EXTENSION
  = /\.(?:txt|pdf|jpe?g|png|gif|bmp|tiff?|svg|xml|html?|json|csv|tsv|md|rtf|docx?|xlsx?|pptx?|zip|gz|tgz|bz2|xz|rar|7z|exe|dll|so|dylib|bat|sh|ini|cfg|log|db|sqlite|mp4|avi|mov|wav|mp3)$/i

const DICM_MAGIC = [0x44, 0x49, 0x43, 0x4D] // 'DICM'
const DICM_MAGIC_OFFSET = 128 // after the Part 10 preamble

/** Part 10 files carry `DICM` at byte 128, right after the preamble. */
function hasDicmMagic(bytes: Uint8Array): boolean {
  if (bytes.length < DICM_MAGIC_OFFSET + DICM_MAGIC.length) return false
  return DICM_MAGIC.every((byte, i) => bytes[DICM_MAGIC_OFFSET + i] === byte)
}

/**
 * Inflate a ZIP and hand back the members that look like DICOM.
 *
 * Filtering happens in two passes. The cheap one runs inside fflate's `filter`
 * hook, which sees each member's name and uncompressed size *before* it is
 * inflated, so housekeeping files and obvious non-DICOM never cost anything.
 * The second pass looks at the actual bytes, because a file's name tells you
 * very little about whether it is DICOM.
 */
export async function unzipDicom(
  data: Uint8Array,
  options: UnzipDicomOptions = {},
): Promise<UnzipDicomResult> {
  const { maxBytes = DEFAULT_MAX_BYTES } = options
  const { unzip } = await import('fflate')

  const skipped: SkippedEntry[] = []
  let claimedBytes = 0

  const filter = (file: UnzipFileInfo): boolean => {
    // fflate reports directory members with a trailing slash and no content.
    if (file.name.endsWith('/')) return false

    if (isMetadataPath(file.name)) {
      skipped.push({ path: file.name, reason: 'metadata' })
      return false
    }
    if (NON_DICOM_EXTENSION.test(file.name)) {
      skipped.push({ path: file.name, reason: 'not-dicom-extension' })
      return false
    }
    if (file.originalSize === 0) {
      skipped.push({ path: file.name, reason: 'empty' })
      return false
    }

    claimedBytes += file.originalSize
    if (claimedBytes > maxBytes) {
      throw new Error(t('zip.tooLarge', { limit: formatBytes(maxBytes) }))
    }
    return true
  }

  const unzipped = await new Promise<Unzipped>((resolve, reject) => {
    unzip(data, { filter }, (err, result) => {
      if (err) reject(asZipError(err))
      else resolve(result)
    })
  })

  const entries: ZipEntry[] = []
  for (const [path, bytes] of Object.entries(unzipped) as [string, Uint8Array<ArrayBuffer>][]) {
    if (bytes.length === 0) {
      skipped.push({ path, reason: 'empty' })
      continue
    }
    // Files without a preamble (raw datasets, Implicit VR) have no magic to
    // check. They are kept and left for the header reader to accept or reject,
    // because rejecting them here would drop valid images.
    entries.push({ path, bytes })
  }

  // Once anything in the archive is unambiguously Part 10, treat the magic as
  // reliable for that archive and drop the members that lack it. A CD that
  // mixes Part 10 images with stray binaries is the common case; an archive of
  // preamble-less datasets is not, and it still works because this only
  // narrows when there is a positive signal to narrow on.
  const withMagic = entries.filter(entry => hasDicmMagic(entry.bytes))
  if (withMagic.length > 0 && withMagic.length < entries.length) {
    for (const entry of entries) {
      if (!hasDicmMagic(entry.bytes)) skipped.push({ path: entry.path, reason: 'not-dicom' })
    }
    return { entries: withMagic, skipped }
  }

  return { entries, skipped }
}

/** fflate's errors are terse and numbered; give them something readable. */
function asZipError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (/invalid zip|no central directory|end of central/i.test(message)) {
    return new Error(t('zip.notReadable'))
  }
  return new Error(t('zip.readFailed', { message }))
}

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

/**
 * Rule a file out by its name alone, and say why, or `null` to keep it.
 *
 * Exported because the same question is asked of files that never came from an
 * archive — a folder picked in a file dialog carries the same `.DS_Store` and
 * report PDFs a burned CD does — and one definition of "not DICOM" is better
 * than two that drift apart.
 */
export function nonDicomNameReason(path: string): 'metadata' | 'not-dicom-extension' | null {
  if (isMetadataPath(path)) return 'metadata'
  if (NON_DICOM_EXTENSION.test(path)) return 'not-dicom-extension'
  return null
}

const DICM_MAGIC = [0x44, 0x49, 0x43, 0x4D] // 'DICM'
const DICM_MAGIC_OFFSET = 128 // after the Part 10 preamble

/** Bytes needed before {@link hasDicmMagic} can answer. */
export const DICM_MAGIC_BYTES = DICM_MAGIC_OFFSET + DICM_MAGIC.length

/** Part 10 files carry `DICM` at byte 128, right after the preamble. */
export function hasDicmMagic(bytes: Uint8Array): boolean {
  if (bytes.length < DICM_MAGIC_OFFSET + DICM_MAGIC.length) return false
  return DICM_MAGIC.every((byte, i) => bytes[DICM_MAGIC_OFFSET + i] === byte)
}

/**
 * Enough bytes for {@link isDicomContent} to decide: the Part 10 preamble plus
 * room for the first few elements of a dataset that has no preamble.
 */
export const CONTENT_PROBE_BYTES = 16 * 1024

/**
 * Leading bytes of formats that are definitely not DICOM.
 *
 * A negative test is not sufficient on its own — renaming a PNG to `.dcm`
 * changes nothing about its bytes, but neither does renaming an arbitrary
 * binary — so this only short-circuits the common cases before the structural
 * probe below does the real work.
 */
const FOREIGN_SIGNATURES: number[][] = [
  [0x89, 0x50, 0x4E, 0x47], // PNG
  [0xFF, 0xD8, 0xFF], //       JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF8
  [0x42, 0x4D], //             BMP
  [0x25, 0x50, 0x44, 0x46], // %PDF
  [0x50, 0x4B, 0x03, 0x04], // ZIP
  [0x1F, 0x8B], //             gzip
  [0x52, 0x61, 0x72, 0x21], // Rar!
  [0x37, 0x7A, 0xBC, 0xAF], // 7z
  [0x49, 0x49, 0x2A, 0x00], // TIFF little-endian
  [0x4D, 0x4D, 0x00, 0x2A], // TIFF big-endian
  [0x52, 0x49, 0x46, 0x46], // RIFF (wav, avi, webp)
  [0x4F, 0x67, 0x67, 0x53], // OggS
  [0x7F, 0x45, 0x4C, 0x46], // ELF
  [0x4D, 0x5A], //             DOS/PE executable
  [0x49, 0x44, 0x33], //       ID3 (mp3)
  [0x3C, 0x3F, 0x78, 0x6D], // <?xm
  [0x3C, 0x21, 0x44, 0x4F], // <!DO
]

function hasForeignSignature(bytes: Uint8Array): boolean {
  return FOREIGN_SIGNATURES.some(
    signature => signature.every((byte, i) => bytes[i] === byte),
  )
}

/**
 * Groups a DICOM dataset can legitimately begin with: file meta, or the
 * identifying module that opens an image dataset. Elements are stored in
 * ascending tag order, so nothing else can come first.
 */
const OPENING_GROUPS = new Set([0x0002, 0x0008])

/** Elements read before the structure is taken as convincing. */
const PROBE_ELEMENTS = 4

const readU16 = (bytes: Uint8Array, at: number, littleEndian: boolean): number =>
  littleEndian
    ? bytes[at]! | (bytes[at + 1]! << 8)
    : (bytes[at]! << 8) | bytes[at + 1]!

/**
 * Does this look like DICOM from its content alone?
 *
 * An extension proves nothing in either direction — plenty of DICOM files are
 * named `IM000001`, and anything at all can be renamed to `.dcm` — so the
 * answer has to come from the bytes.
 *
 * Part 10 files say so outright with their magic. A dataset stored without a
 * preamble has nothing to declare, so its structure is read instead: the first
 * element must open a group a dataset may legitimately open with, and the
 * elements after it must parse and ascend. A PNG fails at the first tag, whose
 * group reads as 0x5089.
 *
 * This is a positive test. Anything that cannot show one of those two things
 * is rejected, which is the opposite of assuming a file is DICOM because
 * nothing proved otherwise.
 */
export async function isDicomContent(bytes: Uint8Array): Promise<boolean> {
  if (hasDicmMagic(bytes)) return true
  if (bytes.length < 8) return false
  if (hasForeignSignature(bytes)) return false

  // A raw big-endian dataset has no preamble and cannot be walked with the
  // little-endian reader below. It is rare enough that a plausible opening tag
  // is taken as answer enough, rather than carrying a second parser for it.
  if (OPENING_GROUPS.has(readU16(bytes, 0, false))) return true
  if (!OPENING_GROUPS.has(readU16(bytes, 0, true))) return false

  const dicomParser = await loadDicomParser()
  return walksAsDataset(dicomParser, bytes, false) || walksAsDataset(dicomParser, bytes, true)
}

/**
 * Read the first few elements and check they form an ascending, self-
 * consistent sequence. Reading is left to dicom-parser so that VR and length
 * encoding are handled the way the rest of the stack handles them; a length
 * that runs past the buffer makes it throw, which is the answer we want.
 */
function walksAsDataset(
  dicomParser: DicomParser,
  bytes: Uint8Array,
  explicitVr: boolean,
): boolean {
  try {
    const stream = new dicomParser.ByteStream(dicomParser.littleEndianByteArrayParser, bytes, 0)
    let previousTag = ''

    for (let read = 0; read < PROBE_ELEMENTS; read++) {
      if (stream.position + 8 > bytes.length) return read > 0
      const element = explicitVr
        ? dicomParser.readDicomElementExplicit(stream)
        : dicomParser.readDicomElementImplicit(stream)

      if (!/^x[0-9a-f]{8}$/.test(element.tag)) return false
      if (element.tag <= previousTag) return false
      previousTag = element.tag
    }
    return true
  }
  catch {
    // Ran off the end, or the lengths did not make sense for this encoding.
    return false
  }
}

export type DicomParser = typeof import('dicom-parser')

let dicomParserPromise: Promise<DicomParser> | null = null

/**
 * dicom-parser is CommonJS, hence the default-interop dance.
 *
 * `useDicomFiles` keeps its own copy of this rather than importing this one.
 * The duplication is deliberate and cheap — both resolve the same module, so
 * there is one parser either way — and it keeps the identification code here
 * from becoming something the composable depends on.
 */
function loadDicomParser(): Promise<DicomParser> {
  dicomParserPromise ??= import('dicom-parser').then((mod) => {
    const candidate = mod as unknown as { default?: DicomParser }
    return candidate.default ?? (mod as unknown as DicomParser)
  })
  return dicomParserPromise
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

    const nameReason = nonDicomNameReason(file.name)
    if (nameReason) {
      skipped.push({ path: file.name, reason: nameReason })
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

  // Every member has to show that it is DICOM. A file without a preamble has
  // no magic to show, so its structure is read instead — which is what keeps
  // raw datasets working without also waving through whatever else happens to
  // be in the archive.
  const entries: ZipEntry[] = []
  for (const [path, bytes] of Object.entries(unzipped) as [string, Uint8Array<ArrayBuffer>][]) {
    if (bytes.length === 0) {
      skipped.push({ path, reason: 'empty' })
      continue
    }
    if (!await isDicomContent(bytes)) {
      skipped.push({ path, reason: 'not-dicom' })
      continue
    }
    entries.push({ path, bytes })
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

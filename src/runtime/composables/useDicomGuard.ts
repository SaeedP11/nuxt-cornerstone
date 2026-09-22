import {
  CONTENT_PROBE_BYTES,
  isDicomContent,
  nonDicomNameReason,
} from '../dicom-zip'
import type { SkipReason } from '../dicom-zip'

export interface RejectedFile {
  name: string
  reason: SkipReason
}

export interface GuardResult {
  accepted: File[]
  rejected: RejectedFile[]
}

/**
 * Decide which of a picked or dropped selection are worth handing to
 * `addFiles()`.
 *
 * `addFiles()` registers whatever it is given, so a file that is not DICOM
 * becomes an imageId that fails later, at render, with an error pointing at
 * the viewport rather than at the file. Answering the question up front means
 * the failure names the file instead.
 *
 * Every file has to prove itself. A name is not evidence in either direction:
 * plenty of DICOM files are called `IM000001`, and a PNG renamed to `.dcm` is
 * still a PNG. The decision is made on content, by {@link isDicomContent},
 * which is the same test the archive reader applies.
 */
export async function guardDicomFiles(files: File[]): Promise<GuardResult> {
  const accepted: File[] = []
  const rejected: RejectedFile[] = []

  for (const file of files) {
    const nameReason = nonDicomNameReason(file.name)
    if (nameReason) {
      rejected.push({ name: file.name, reason: nameReason })
      continue
    }
    if (file.size === 0) {
      rejected.push({ name: file.name, reason: 'empty' })
      continue
    }
    if (!await isDicom(file)) {
      rejected.push({ name: file.name, reason: 'not-dicom' })
      continue
    }
    accepted.push(file)
  }

  return { accepted, rejected }
}

/** Only the head of the file is read; the pixel data is never touched. */
async function isDicom(file: File): Promise<boolean> {
  const head = await file.slice(0, CONTENT_PROBE_BYTES).arrayBuffer()
  return isDicomContent(new Uint8Array(head))
}

import { t } from './i18n'
import type { DicomBox } from './composables/useDicomAnnotations'

/**
 * Reading a JSON report into the boxes {@link useDicomAnnotations} draws.
 *
 * Two shapes are accepted, because the two that matter in practice are not the
 * same thing. One is this module's own: a flat list of boxes already keyed by
 * SOPInstanceUID, which is what an application produces when it has done its
 * own translation. The other is a detector's nested output — findings, each
 * holding the per-slice boxes it was seen on — which is what arrives when the
 * report comes straight off an inference service.
 *
 * Nothing here guesses at coordinates. A box is only read from fields that are
 * unambiguously in image pixel space; a finding-level bounding box in the
 * model's own resampled volume is ignored, since it does not describe the DICOM
 * images on screen.
 */

/** Which of the accepted layouts a file turned out to be. */
export type AnnotationFormat = 'boxes' | 'findings'

export interface ReadAnnotationsOptions {
  /**
   * Drop findings whose confidence is below this, 0..1. Only the nested
   * detector shape carries confidence; a flat box list is unaffected.
   * Default: `0` — keep everything the file lists.
   */
  minConfidence?: number
  /**
   * Build the caption for a box read from the detector shape. Default:
   * the finding's own `name`/`label`, followed by its confidence as a
   * percentage when it has one.
   */
  label?: (finding: FindingLabelInfo) => string | undefined
}

/** What {@link ReadAnnotationsOptions.label} is given about a finding. */
export interface FindingLabelInfo {
  /** 1-based position among the findings that survived the threshold. */
  index: number
  /** The finding's own name or numeric class, when it carries one. */
  name: string | null
  /** 0..1, or `null` when the report does not say. */
  confidence: number | null
  /** The slice this particular box sits on. */
  sopInstanceUid: string
}

export interface ReadAnnotationsResult {
  /** Boxes ready to hand to `addBoxes()`. */
  boxes: DicomBox[]
  /** Which layout the file used. */
  format: AnnotationFormat
  /** Findings read, before the confidence threshold. `0` for a flat list. */
  findings: number
  /** Findings dropped by {@link ReadAnnotationsOptions.minConfidence}. */
  filtered: number
  /**
   * Entries that were the right shape's wrong shape — a box missing its UID,
   * a coordinate that is not a number. They are counted rather than thrown on,
   * so one bad row does not discard a usable report.
   */
  malformed: number
  /**
   * SeriesInstanceUID the report names, when it names one. Worth showing when
   * no box matches anything loaded: it says which study to open.
   */
  seriesInstanceUid: string | null
}

/**
 * Read a JSON annotation file.
 *
 * Takes what a file picker, a drop target or `$fetch` hands over: a `File` or
 * `Blob`, the JSON text, or the already-parsed object. Throws when the bytes
 * are not JSON or the JSON is not one of the accepted layouts; a file that is
 * simply empty of boxes comes back with an empty list instead, since a report
 * finding nothing is a result, not a failure.
 */
export async function readAnnotationJson(
  input: File | Blob | string | unknown,
  options: ReadAnnotationsOptions = {},
): Promise<ReadAnnotationsResult> {
  return parseAnnotationJson(await toJson(input), options)
}

async function toJson(input: File | Blob | string | unknown): Promise<unknown> {
  const text = typeof input === 'string'
    ? input
    : input instanceof Blob
      ? await input.text()
      : null

  if (text === null) return input

  try {
    return JSON.parse(text)
  }
  catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    throw new Error(t('annotationJson.notJson', { message }), { cause: caught })
  }
}

/** The synchronous half, for callers that already hold the parsed value. */
export function parseAnnotationJson(
  value: unknown,
  options: ReadAnnotationsOptions = {},
): ReadAnnotationsResult {
  const boxList = findBoxList(value)
  if (boxList) return readBoxList(boxList, value)

  const findings = findFindingList(value)
  if (findings) return readFindings(findings, value, options)

  throw new Error(t('annotationJson.unknownShape'))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The first array under any of `keys`, at the top level or one step in. */
function arrayAt(value: unknown, keys: string[]): unknown[] | null {
  if (!isRecord(value)) return null
  for (const key of keys) {
    const found = value[key]
    if (Array.isArray(found)) return found
  }
  return null
}

/**
 * Locate a flat box list: the document itself, or an array under a name a
 * report plausibly uses for one.
 */
function findBoxList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return looksLikeBox(value[0]) ? value : null
  const found = arrayAt(value, ['boxes', 'annotations'])
  return found && looksLikeBox(found[0]) ? found : null
}

function looksLikeBox(entry: unknown): boolean {
  if (!isRecord(entry)) return false
  return 'box' in entry || 'sopInstanceUid' in entry || 'sop_instance_uid' in entry
}

/** Locate the detector shape's findings, wrapped in `predictions` or not. */
function findFindingList(value: unknown): unknown[] | null {
  const nested = isRecord(value) ? value.predictions : null
  return arrayAt(nested, ['findings']) ?? arrayAt(value, ['findings'])
}

function readBoxList(entries: unknown[], document: unknown): ReadAnnotationsResult {
  const boxes: DicomBox[] = []
  let malformed = 0

  for (const entry of entries) {
    const box = toBox(entry)
    if (box) boxes.push(box)
    else malformed += 1
  }

  return {
    boxes,
    format: 'boxes',
    findings: 0,
    filtered: 0,
    malformed,
    seriesInstanceUid: seriesUidOf(document),
  }
}

/**
 * Both spellings of every field are read.
 *
 * A file written by hand against this module's types is camelCase; the same
 * boxes coming out of a Python service are snake_case, and asking the
 * application to rename keys before it can open its own report would be the
 * only work this reader saves it.
 */
function toBox(entry: unknown): DicomBox | null {
  if (!isRecord(entry)) return null

  const sopInstanceUid = textOf(entry.sopInstanceUid ?? entry.sop_instance_uid)
  if (!sopInstanceUid) return null

  const corners = toCorners(entry.box ?? entry.bounding_box ?? entry.boundingBox ?? entry)
  if (!corners) return null

  const label = textOf(entry.label ?? entry.text ?? entry.name)
  const uid = textOf(entry.uid ?? entry.annotationUID ?? entry.id)

  return { sopInstanceUid, box: corners, ...(label ? { label } : {}), ...(uid ? { uid } : {}) }
}

/**
 * Corners from any of the three ways a box is normally written: two opposite
 * corners, a min/max pair, or an origin with a width and height.
 */
function toCorners(value: unknown): DicomBox['box'] | null {
  // `[x1, y1, x2, y2]`, as a report that writes its boxes as bare tuples does.
  if (Array.isArray(value) && value.length === 4) {
    const [x1 = Number.NaN, y1 = Number.NaN, x2 = Number.NaN, y2 = Number.NaN]
      = value.map(numberOf)
    return finite(x1, y1, x2, y2) ? { x1, y1, x2, y2 } : null
  }

  if (!isRecord(value)) return null

  const x1 = numberOf(value.x1 ?? value.upper_left_x ?? value.upperLeftX ?? value.xMin ?? value.x)
  const y1 = numberOf(value.y1 ?? value.upper_left_y ?? value.upperLeftY ?? value.yMin ?? value.y)
  if (!finite(x1, y1)) return null

  const x2 = numberOf(value.x2 ?? value.lower_right_x ?? value.lowerRightX ?? value.xMax)
  const y2 = numberOf(value.y2 ?? value.lower_right_y ?? value.lowerRightY ?? value.yMax)
  if (finite(x2, y2)) return { x1, y1, x2, y2 }

  const width = numberOf(value.width ?? value.w)
  const height = numberOf(value.height ?? value.h)
  if (finite(width, height)) return { x1, y1, x2: x1 + width, y2: y1 + height }

  return null
}

function readFindings(
  entries: unknown[],
  document: unknown,
  options: ReadAnnotationsOptions,
): ReadAnnotationsResult {
  const { minConfidence = 0, label = defaultLabel } = options

  const boxes: DicomBox[] = []
  let filtered = 0
  let malformed = 0
  let index = 0

  for (const entry of entries) {
    if (!isRecord(entry)) {
      malformed += 1
      continue
    }

    const confidence = numberOf(entry.confidence ?? entry.score ?? entry.probability)
    const hasConfidence = Number.isFinite(confidence)
    if (hasConfidence && confidence < minConfidence) {
      filtered += 1
      continue
    }

    // Only the per-slice boxes are in image pixel coordinates. A finding-level
    // `bounding_box` is in whatever volume the model ran on, so a finding
    // without slices contributes nothing rather than a box in the wrong space.
    const slices = arrayAt(entry, ['slice_findings', 'sliceFindings', 'slices', 'boxes'])
    if (!slices) {
      malformed += 1
      continue
    }

    index += 1
    const name = textOf(entry.name ?? entry.class_name ?? entry.className)
      ?? numberText(entry.label ?? entry.class ?? entry.category)

    for (const slice of slices) {
      const box = toBox(slice)
      if (!box) {
        malformed += 1
        continue
      }

      boxes.push({
        ...box,
        // A slice that captioned itself keeps its caption; the rest are
        // described by the finding they belong to.
        label: box.label ?? label({
          index,
          name,
          confidence: hasConfidence ? confidence : null,
          sopInstanceUid: box.sopInstanceUid,
        }),
        // A detector's boxes carry no id of their own, and adding the same
        // report twice must replace its boxes rather than stack a second set
        // on the first, so one is derived from what does identify a box: the
        // finding it belongs to and the slice it sits on.
        uid: box.uid ?? `finding-${index}-${box.sopInstanceUid}`,
      })
    }
  }

  return {
    boxes,
    format: 'findings',
    findings: entries.length,
    filtered,
    malformed,
    seriesInstanceUid: seriesUidOf(document),
  }
}

function defaultLabel(finding: FindingLabelInfo): string {
  const name = finding.name ?? t('annotationJson.finding', { index: finding.index })
  if (finding.confidence === null) return name
  return t('annotationJson.labelled', {
    name,
    confidence: Math.round(finding.confidence * 100),
  })
}

function seriesUidOf(document: unknown): string | null {
  if (!isRecord(document)) return null
  const scope = isRecord(document.predictions) ? document.predictions : document
  return textOf(scope.seriesInstanceUid ?? scope.series_instance_uid)
}

function numberOf(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value)
  return Number.NaN
}

function finite(...values: number[]): boolean {
  return values.every(value => Number.isFinite(value))
}

function textOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * A class id is often a bare number. It still names the finding, but a caption
 * reading "3 · 87%" says nothing, so it is named as the class it is.
 */
function numberText(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return t('annotationJson.class', { value })
}

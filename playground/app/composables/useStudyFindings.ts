import type { MaybeRefOrGetter } from 'vue'
import type { Types as CoreTypes } from '@cornerstonejs/core'
import type { DicomBox } from '../../../src/runtime/composables/useDicomAnnotations'

/**
 * The demo's adapter between one AI service's response and the viewer.
 *
 * This is the half of the feature that is nobody else's business: the module
 * takes boxes keyed by SOPInstanceUID in pixel coordinates, and every service
 * describes its findings differently. Translating one vendor's JSON into that
 * shape belongs in the application, which is why it lives here rather than in
 * `src/`.
 */

/** The detector's response, as `/api/findings` returns it. */
interface FindingsResponse {
  predictions: {
    patient_id: string
    study_instance_uid: string
    series_instance_uid: string
    findings: Finding[]
  }
}

interface Finding {
  /** 0..1 over the whole finding; the per-slice ones repeat it. */
  confidence: number
  label: number
  slice_findings: SliceFinding[]
}

interface SliceFinding {
  slice_index: number
  /** How a box finds its slice. Index order is the detector's, not ours. */
  sop_instance_uid: string
  bounding_box: {
    upper_left_x: number
    upper_left_y: number
    lower_right_x: number
    lower_right_y: number
  }
}

export interface FindingsSummary {
  /** Findings that cleared {@link MIN_CONFIDENCE}. */
  findings: number
  /** Boxes those findings cover, across every slice. */
  boxes: number
  /** Boxes matched to a loaded slice, whether drawn yet or not. */
  placed: number
  /** The series the report was produced from. */
  seriesInstanceUid: string
}

/**
 * Findings below this are not drawn.
 *
 * The detector reports everything it saw, down to 0.02, and this response
 * carries 46 findings — 537 boxes, up to 19 of them on a single slice. At 0.5
 * it is 3 findings and 39 boxes, which is a picture a radiologist can read.
 */
const MIN_CONFIDENCE = 0.5

/** Amber: nothing on a greyscale image is close to it, and it is not alarm red. */
const BOX_COLOR = 'rgb(251, 191, 36)'

export function useStudyFindings(
  viewport: MaybeRefOrGetter<CoreTypes.IStackViewport | null>,
) {
  const { addBoxes, clear, setVisible, visible, drawn, pending } = useDicomAnnotations(viewport)
  const { t } = useCornerstoneI18n()

  const busy = ref(false)
  const loaded = ref(false)
  const summary = ref<FindingsSummary | null>(null)
  const failure = ref<string | null>(null)

  /**
   * Flatten the report into one box per slice per finding.
   *
   * The finding's own `bounding_box` is deliberately ignored. It is in the
   * resampled volume the model ran on — its x runs to 551 where the per-slice
   * boxes run to 992 — so it does not describe the DICOM images we are
   * showing. Only `slice_findings` is in image pixel coordinates.
   */
  function toBoxes(response: FindingsResponse): { boxes: DicomBox[], findings: number } {
    const kept = response.predictions.findings.filter(
      finding => finding.confidence >= MIN_CONFIDENCE,
    )

    const boxes = kept.flatMap((finding, index) =>
      finding.slice_findings.map((slice): DicomBox => ({
        sopInstanceUid: slice.sop_instance_uid,
        box: {
          x1: slice.bounding_box.upper_left_x,
          y1: slice.bounding_box.upper_left_y,
          x2: slice.bounding_box.lower_right_x,
          y2: slice.bounding_box.lower_right_y,
        },
        label: t('app.findings.box', {
          index: index + 1,
          confidence: Math.round(finding.confidence * 100),
        }),
        // Stable, so loading the report twice replaces the boxes rather than
        // stacking a second set exactly on top of the first.
        uid: `finding-${index}-${slice.sop_instance_uid}`,
      })),
    )

    return { boxes, findings: kept.length }
  }

  async function load(): Promise<void> {
    busy.value = true
    failure.value = null
    try {
      // A real endpoint would take the study UID and an Authorization header.
      // Nothing else about this call would change.
      const response = await $fetch<FindingsResponse>('/api/findings')
      const { boxes, findings } = toBoxes(response)

      const result = await addBoxes(boxes, { color: BOX_COLOR })

      loaded.value = true
      summary.value = {
        findings,
        boxes: boxes.length,
        placed: result.drawn + result.deferred,
        seriesInstanceUid: response.predictions.series_instance_uid,
      }
    }
    catch (caught) {
      failure.value = caught instanceof Error ? caught.message : String(caught)
    }
    finally {
      busy.value = false
    }
  }

  /** The button: fetch on the first press, then show and hide. */
  async function toggle(): Promise<void> {
    if (!loaded.value) return load()
    setVisible(!visible.value)
  }

  /** Drop the boxes. Called when the stack underneath them changes. */
  function reset(): void {
    clear()
    loaded.value = false
    summary.value = null
    failure.value = null
  }

  /**
   * What the report did, in one line.
   *
   * A report whose series is not the one on screen is the case worth being
   * explicit about: every box resolves to nothing, and without saying why it
   * looks like the feature is broken rather than like the wrong study is open.
   */
  const summaryText = computed(() => {
    if (failure.value) return t('app.findings.failed', { message: failure.value })

    const value = summary.value
    if (!value) return null

    if (value.placed === 0) {
      return t('app.findings.unmatched', {
        boxes: value.boxes,
        series: value.seriesInstanceUid,
      })
    }

    return t('app.findings.summary', {
      findings: value.findings,
      placed: value.placed,
      boxes: value.boxes,
      threshold: Math.round(MIN_CONFIDENCE * 100),
    })
  })

  return { toggle, reset, busy, loaded, visible, summaryText, drawn, pending }
}

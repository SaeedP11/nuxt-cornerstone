<script setup lang="ts">
import type { Types as CoreTypes } from '@cornerstonejs/core'

const study = useViewerStudy()
const {
  ready,
  imageIds,
  imageIndex,
  maxIndex,
  series,
  activeSeriesUid,
  progress,
  progressLabel,
  progressValue,
  problemText,
  rejectedText,
  sourceLabel,
  busy,
} = study

const tools = useCornerstoneTools()
const { t } = useCornerstoneI18n()

const activeTool = ref('WindowLevelTool')
const viewport = shallowRef<CoreTypes.IStackViewport | null>(null)
const helpVisible = ref(false)

const annotations = useViewerAnnotations(viewport)
const cine = useViewerCine(imageIds, imageIndex)

/** Shown when a JSON file arrives before there is anything to draw it on. */
const annotationNotice = ref<string | null>(null)

function isAnnotationFile(file: File): boolean {
  return /\.json$/i.test(file.name) || file.type === 'application/json'
}

/**
 * Sort a picked or dropped selection into images and reports.
 *
 * Dropping a study and its report together is the natural gesture once both
 * exist, so the stage accepts either without asking the user which button to
 * use. A report on its own needs images to match against, which is a thing to
 * say rather than to silently ignore.
 */
function handleFiles(files: File[]) {
  const report = files.find(isAnnotationFile)
  const images = files.filter(file => !isAnnotationFile(file))

  annotationNotice.value = null
  if (images.length) study.openAny(images)

  if (!report) return
  if (!images.length && !imageIds.value.length) {
    annotationNotice.value = t('app.annotations.needImages')
    return
  }
  openAnnotations(report)
}

/**
 * Boxes are placed through the loaded slices' image planes, so a report
 * dropped alongside a study has to wait for that study to finish opening.
 */
async function openAnnotations(file: File) {
  annotationNotice.value = null
  await settled(busy)
  if (!imageIds.value.length) {
    annotationNotice.value = t('app.annotations.needImages')
    return
  }
  await annotations.open(file)
}

/** Resolve once `flag` is false, so a report can queue behind a study. */
function settled(flag: Ref<boolean>): Promise<void> {
  if (!flag.value) return Promise.resolve()
  return new Promise((resolve) => {
    const stop = watch(flag, (value) => {
      if (value) return
      stop()
      resolve()
    })
  })
}

/**
 * Boxes are keyed to the imageIds that were loaded when they were drawn, so a
 * new stack — another series, another study, or none — discards them.
 *
 * `flush: 'sync'` matters: a report dropped together with its study is drawn as
 * soon as the study finishes loading, and a watcher that ran on the next tick
 * would run after that and erase the boxes it was meant to precede.
 */
watch(imageIds, () => annotations.reset(), { flush: 'sync' })

async function selectTool(className: string) {
  activeTool.value = className
  await tools.setActive(className)
}

function resetCamera() {
  viewport.value?.resetCamera()
  viewport.value?.render()
}

/**
 * Moving through the stack by hand takes over from the player.
 *
 * Only the deliberate moves — the scrubber and the keyboard — go through here.
 * The viewport's own `imageIndexChange` must not, because cine advancing a
 * frame is exactly what raises it, and pausing on that would stop playback on
 * its first frame.
 */
function scrubTo(index: number) {
  cine.pause()
  imageIndex.value = index
}

useViewerShortcuts({
  isEnabled: () => imageIds.value.length > 0,
  step: (delta) => {
    cine.pause()
    study.step(delta)
  },
  first: () => scrubTo(0),
  last: () => scrubTo(maxIndex.value),
  stepSeries: study.stepSeries,
  setTool: selectTool,
  resetViewport: resetCamera,
  togglePlay: cine.toggle,
  toggleHelp: () => (helpVisible.value = !helpVisible.value),
})

// /?samples loads the bundled stack straight away, which makes the demo
// linkable and lets a headless browser drive it. Development-only for the
// same reason as the button: a build does not carry the samples.
onMounted(() => {
  if (import.meta.dev && useRoute().query.samples !== undefined) study.loadSamples()
})
</script>

<template>
  <div class="flex h-full flex-col bg-[var(--p-surface-950)] text-[var(--p-text-color)]">
    <ViewerHeader
      :ready="ready"
      :busy="busy"
      :has-images="imageIds.length > 0"
      :annotations-busy="annotations.busy.value"
      :annotations-loaded="annotations.loaded.value"
      :annotations-visible="annotations.visible.value"
      @load-samples="study.loadSamples"
      @open="handleFiles"
      @open-annotations="openAnnotations"
      @toggle-annotations="annotations.toggle"
      @clear="study.clear"
      @show-help="helpVisible = true"
    />

    <ViewerProgress
      v-if="progress"
      :label="progressLabel"
      :value="progressValue"
    />

    <Message
      v-if="problemText"
      severity="warn"
      :closable="false"
      class="m-0 rounded-none"
    >
      {{ problemText }}
    </Message>

    <!-- Why an annotation file could not be read, or could not be matched yet. -->
    <Message
      v-if="annotations.failure.value ?? annotationNotice"
      severity="warn"
      :closable="false"
      class="m-0 rounded-none"
    >
      {{ annotations.failure.value ?? annotationNotice }}
    </Message>

    <!-- What it held. Informational: the boxes are already on screen. -->
    <Message
      v-if="annotations.summaryText.value"
      severity="info"
      :closable="false"
      class="m-0 rounded-none"
    >
      {{ annotations.summaryText.value }}
    </Message>

    <!-- What the guard turned away. Not a problem: the rest still loaded. -->
    <Message
      v-if="rejectedText"
      severity="info"
      :closable="false"
      class="m-0 rounded-none"
    >
      {{ rejectedText }}
    </Message>

    <div class="flex min-h-0 flex-1">
      <ViewerToolRail
        v-if="imageIds.length"
        :active-tool="activeTool"
        @update:active-tool="selectTool"
        @reset-camera="resetCamera"
      />

      <ViewerSidebar
        v-if="series.length"
        :series="series"
        :active-series-uid="activeSeriesUid"
        @select="study.selectSeries"
      />

      <ViewerStage
        :image-ids="imageIds"
        :image-index="imageIndex"
        @ready="viewport = $event"
        @update:image-index="imageIndex = $event"
        @drop-files="handleFiles"
      />
    </div>

    <ViewerScrubber
      v-if="imageIds.length"
      v-model:frame-rate="cine.frameRate.value"
      v-model:loop="cine.loop.value"
      :image-index="imageIndex"
      :max-index="maxIndex"
      :count="imageIds.length"
      :source-label="sourceLabel"
      :playing="cine.playing.value"
      :can-play="cine.canPlay.value"
      :preparing="cine.preparing.value"
      :prepared="cine.prepared.value"
      :buffering="cine.buffering.value"
      :percent="cine.percent.value"
      :status-text="cine.statusText.value"
      @update:image-index="scrubTo"
      @toggle-play="cine.toggle"
      @prepare="cine.prepare"
    />

    <ViewerShortcutsDialog v-model:visible="helpVisible" />
  </div>
</template>

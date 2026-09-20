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

const activeTool = ref('WindowLevelTool')
const viewport = shallowRef<CoreTypes.IStackViewport | null>(null)
const helpVisible = ref(false)

async function selectTool(className: string) {
  activeTool.value = className
  await tools.setActive(className)
}

function resetCamera() {
  viewport.value?.resetCamera()
  viewport.value?.render()
}

useViewerShortcuts({
  isEnabled: () => imageIds.value.length > 0,
  step: study.step,
  first: () => (imageIndex.value = 0),
  last: () => (imageIndex.value = maxIndex.value),
  stepSeries: study.stepSeries,
  setTool: selectTool,
  resetViewport: resetCamera,
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
      @load-samples="study.loadSamples"
      @open="study.openAny"
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
        @drop-files="study.openAny"
      />
    </div>

    <ViewerScrubber
      v-if="imageIds.length"
      :image-index="imageIndex"
      :max-index="maxIndex"
      :count="imageIds.length"
      :source-label="sourceLabel"
      @update:image-index="imageIndex = $event"
    />

    <ViewerShortcutsDialog v-model:visible="helpVisible" />
  </div>
</template>

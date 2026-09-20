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
  sourceLabel,
  busy,
} = study

const tools = useCornerstoneTools()
const { isRtl } = useCornerstoneI18n()

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
  isRtl: () => isRtl.value,
  step: study.step,
  first: () => (imageIndex.value = 0),
  last: () => (imageIndex.value = maxIndex.value),
  selectToolAt: position => selectTool(TOOLS[position]!.className),
  resetCamera,
  toggleHelp: () => (helpVisible.value = !helpVisible.value),
})

// /?samples loads the bundled stack straight away, which makes the demo
// linkable and lets a headless browser drive it.
onMounted(() => {
  if (useRoute().query.samples !== undefined) study.loadSamples()
})
</script>

<template>
  <div class="flex h-full flex-col bg-[var(--p-surface-950)] text-[var(--p-text-color)]">
    <ViewerHeader
      :ready="ready"
      :busy="busy"
      :has-images="imageIds.length > 0"
      @load-samples="study.loadSamples"
      @open-files="study.open"
      @open-zip="study.openZip"
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
        @drop-files="study.openDropped"
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

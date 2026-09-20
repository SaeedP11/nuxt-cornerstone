<script setup lang="ts">
import type { Types as CoreTypes } from '@cornerstonejs/core'

defineProps<{
  imageIds: string[]
  imageIndex: number
}>()

const emit = defineEmits<{
  'ready': [viewport: CoreTypes.IStackViewport]
  'update:imageIndex': [index: number]
  'drop-files': [files: File[]]
}>()

const { t } = useCornerstoneI18n()

const dragging = ref(false)

function onDrop(event: DragEvent) {
  dragging.value = false
  emit('drop-files', Array.from(event.dataTransfer?.files ?? []))
}
</script>

<template>
  <main
    class="relative flex min-h-0 min-w-0 flex-1"
    :class="dragging && 'outline-2 -outline-offset-8 outline-dashed outline-[var(--p-primary-color)]'"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <CornerstoneViewport
      v-if="imageIds.length"
      :image-ids="imageIds"
      :image-index="imageIndex"
      default-tool="WindowLevelTool"
      class="min-w-0 flex-1"
      @ready="emit('ready', $event)"
      @image-index-change="emit('update:imageIndex', $event)"
    />

    <p
      v-else
      class="m-auto max-w-prose px-4 text-center text-[var(--p-text-muted-color)]"
    >
      {{ t('app.empty') }}
    </p>
  </main>
</template>

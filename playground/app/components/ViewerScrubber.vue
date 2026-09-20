<script setup lang="ts">
const props = defineProps<{
  imageIndex: number
  maxIndex: number
  count: number
  sourceLabel: string
}>()

const emit = defineEmits<{
  'update:imageIndex': [index: number]
}>()

const { n, isRtl } = useCornerstoneI18n()

// Slider is v-model-only, so the prop is bridged rather than bound directly.
const index = computed({
  get: () => props.imageIndex,
  set: value => emit('update:imageIndex', value),
})
</script>

<template>
  <footer class="flex flex-wrap items-center gap-4 border-t border-[var(--p-content-border-color)] bg-[var(--p-content-background)] px-4 py-3">
    <Slider
      v-model="index"
      :min="0"
      :max="maxIndex"
      :step="1"
      class="w-80"
    />
    <span
      class="text-sm text-[var(--p-text-muted-color)]"
      :class="isRtl ? 'tabular-nums' : 'font-mono'"
    >
      {{ n(imageIndex + 1) }} / {{ n(count) }}
    </span>

    <div class="flex-1" />

    <span class="text-sm text-[var(--p-text-muted-color)]">{{ sourceLabel }}</span>
  </footer>
</template>

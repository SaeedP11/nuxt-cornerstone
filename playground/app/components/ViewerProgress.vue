<script setup lang="ts">
defineProps<{
  label: string
  /** `null` while there is nothing countable to count. */
  value: number | null
}>()

const { isRtl } = useCornerstoneI18n()
</script>

<template>
  <div class="flex items-center gap-3 border-b border-[var(--p-content-border-color)] bg-[var(--p-content-background)] px-4 py-2">
    <ProgressBar
      :mode="value === null ? 'indeterminate' : 'determinate'"
      :value="value ?? 0"
      class="h-2 flex-1"
    />
    <span
      class="w-56 text-end text-sm text-[var(--p-text-muted-color)]"
      :class="isRtl ? 'tabular-nums' : 'font-mono'"
    >
      {{ label }}
    </span>
  </div>
</template>

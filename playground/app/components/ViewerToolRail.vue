<script setup lang="ts">
defineProps<{
  activeTool: string
}>()

const emit = defineEmits<{
  'update:activeTool': [className: string]
  'resetCamera': []
}>()

const { t, isRtl } = useCornerstoneI18n()

// The tooltip hangs off the side the rail is not on, which swaps with the
// reading direction along with the rail itself.
const tooltipSide = computed(() => (isRtl.value ? 'left' : 'right'))
</script>

<template>
  <nav
    class="flex w-14 shrink-0 flex-col items-center gap-1 border-e border-[var(--p-content-border-color)] bg-[var(--p-content-background)] py-3"
    :aria-label="t('app.tools.heading')"
  >
    <Button
      v-for="tool in TOOLS"
      :key="tool.className"
      v-tooltip="{ value: t(tool.key), position: tooltipSide }"
      :icon="tool.icon"
      :severity="tool.className === activeTool ? 'primary' : 'secondary'"
      :text="tool.className !== activeTool"
      rounded
      :aria-label="t(tool.key)"
      :aria-pressed="tool.className === activeTool"
      @click="emit('update:activeTool', tool.className)"
    />

    <div class="flex-1" />

    <!-- Tailwind v4 puts the important modifier at the end: `my-1!`, not `!my-1`. -->
    <Divider class="my-1!" />

    <Button
      v-tooltip="{ value: t('app.resetCamera'), position: tooltipSide }"
      icon="pi pi-refresh"
      severity="secondary"
      text
      rounded
      :aria-label="t('app.resetCamera')"
      @click="emit('resetCamera')"
    />
  </nav>
</template>

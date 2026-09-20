<script setup lang="ts">
import type { DicomSeries } from '../../../src/runtime/composables/useDicomFiles'

defineProps<{
  series: DicomSeries[]
  activeSeriesUid: string | null
}>()

const emit = defineEmits<{
  select: [uid: string]
}>()

const { t, n, isRtl } = useCornerstoneI18n()

const collapsed = ref(false)

// The chevron points the way the panel will move, which is mirrored in Farsi.
const toggleIcon = computed(() => {
  const towardsStart = isRtl.value ? 'pi-angle-right' : 'pi-angle-left'
  const towardsEnd = isRtl.value ? 'pi-angle-left' : 'pi-angle-right'
  return `pi ${collapsed.value ? towardsEnd : towardsStart}`
})
</script>

<template>
  <aside
    class="flex shrink-0 flex-col border-e border-[var(--p-content-border-color)] bg-[var(--p-content-background)]"
    :class="collapsed ? 'w-12' : 'w-72'"
  >
    <div class="flex items-center gap-2 px-2 py-2">
      <h2
        v-if="!collapsed"
        class="ps-1 text-xs font-semibold tracking-wide text-[var(--p-text-muted-color)] uppercase"
      >
        {{ t('app.series.heading') }}
      </h2>

      <div class="flex-1" />

      <Button
        :icon="toggleIcon"
        severity="secondary"
        text
        rounded
        size="small"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? t('app.sidebar.expand') : t('app.sidebar.collapse')"
        @click="collapsed = !collapsed"
      />
    </div>

    <!--
      `label` arrives already formatted and already translated — the module
      builds it from the series tags — so the list adds only the image count
      beside it.
    -->
    <Listbox
      v-if="!collapsed"
      :model-value="activeSeriesUid"
      :options="series"
      option-label="label"
      option-value="seriesInstanceUid"
      class="min-h-0 flex-1 rounded-none border-0"
      scroll-height="100%"
      :pt="{ list: { class: 'p-1' } }"
      @update:model-value="emit('select', $event)"
    >
      <template #option="{ option }">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
          <span class="shrink-0 text-xs text-[var(--p-text-muted-color)] tabular-nums">
            {{ n(option.imageIds.length) }}
          </span>
        </div>
      </template>
    </Listbox>
  </aside>
</template>

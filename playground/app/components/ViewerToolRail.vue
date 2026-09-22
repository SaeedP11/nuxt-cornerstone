<script setup lang="ts">
const props = defineProps<{
  activeTool: string
  /** Measurements the reader has selected, on any image. */
  selectedMeasurements: number
  /** Measurements on the image on screen. */
  sliceMeasurements: number
  /** Measurements on the whole series. */
  totalMeasurements: number
}>()

const emit = defineEmits<{
  'update:activeTool': [className: string]
  'resetCamera': []
  'deleteSelected': []
  'deleteSlice': []
  'deleteAll': []
}>()

const { t, isRtl } = useCornerstoneI18n()

// The tooltip hangs off the side the rail is not on, which swaps with the
// reading direction along with the rail itself.
const tooltipSide = computed(() => (isRtl.value ? 'left' : 'right'))

/**
 * The tooltip is where a shortcut is discovered, so it carries the key. The
 * key itself is a Latin character on the keyboard rather than prose, so it is
 * not translated.
 */
function tooltipFor(tool: ToolSpec): string {
  return `${t(tool.key)} (${tool.shortcut.toUpperCase()})`
}

/**
 * Deleting one measurement is what a reader reaches for first, so it is the
 * button nearest the tools — but it can only appear once there is a selection,
 * which is a thing the reader has to have done deliberately. The hint below
 * the tools is therefore what stands in for it the rest of the time: without
 * it, nothing on screen says that a measurement can be clicked at all.
 */
const canDeleteSelected = computed(() => props.selectedMeasurements > 0)

/**
 * Clearing one image is offered only when that image has more than the whole
 * series does — otherwise the two buttons would do the same thing, and the
 * narrower one would be the one that did not say so.
 */
const canClearSlice = computed(
  () => props.sliceMeasurements > 0 && props.sliceMeasurements < props.totalMeasurements,
)

/**
 * Deleting every measurement is the one action here that cannot be taken back
 * and that can destroy work the reader did not have in view, so it asks first.
 * Clearing the image on screen does not: what it removes is visible, and it is
 * one drawing gesture to put back.
 */
const confirming = ref(false)

function confirmAll() {
  confirming.value = false
  emit('deleteAll')
}
</script>

<template>
  <nav
    class="flex w-14 shrink-0 flex-col items-center gap-1 border-e border-[var(--p-content-border-color)] bg-[var(--p-content-background)] py-3"
    :aria-label="t('app.tools.heading')"
    @click="releaseFocus"
  >
    <Button
      v-for="tool in TOOLS"
      :key="tool.className"
      v-tooltip="{ value: tooltipFor(tool), position: tooltipSide }"
      :icon="tool.icon"
      :severity="tool.className === activeTool ? 'primary' : 'secondary'"
      :text="tool.className !== activeTool"
      rounded
      :aria-label="t(tool.key)"
      :aria-pressed="tool.className === activeTool"
      @click="emit('update:activeTool', tool.className)"
    />

    <div class="flex-1" />

    <!--
      The delete buttons appear only once there is something to delete, rather
      than sitting there disabled: a control that is never available on an
      untouched study is noise on the rail.
    -->
    <template v-if="totalMeasurements > 0">
      <!-- Tailwind v4 puts the important modifier at the end: `my-1!`, not `!my-1`. -->
      <Divider class="my-1!" />

      <Button
        v-if="canDeleteSelected"
        v-tooltip="{
          value: `${t('app.measurements.deleteSelected', { count: selectedMeasurements })} (Delete)`,
          position: tooltipSide,
        }"
        icon="pi pi-times-circle"
        severity="danger"
        text
        rounded
        :aria-label="t('app.measurements.deleteSelected', { count: selectedMeasurements })"
        @click="emit('deleteSelected')"
      />

      <!--
        How to get a selection in the first place. It is an icon rather than a
        button because there is nothing to press: it explains the gesture that
        makes the button above it appear, and it steps aside once the reader
        has made one.
      -->
      <i
        v-else
        v-tooltip="{ value: t('app.measurements.selectHint'), position: tooltipSide }"
        role="note"
        tabindex="0"
        class="pi pi-info-circle py-2 text-[var(--p-text-muted-color)]"
        :aria-label="t('app.measurements.selectHint')"
      />

      <Button
        v-if="canClearSlice"
        v-tooltip="{
          value: t('app.measurements.clearSlice', { count: sliceMeasurements }),
          position: tooltipSide,
        }"
        icon="pi pi-eraser"
        severity="secondary"
        text
        rounded
        :aria-label="t('app.measurements.clearSlice', { count: sliceMeasurements })"
        @click="emit('deleteSlice')"
      />

      <Button
        v-tooltip="{
          value: t('app.measurements.clearAll', { count: totalMeasurements }),
          position: tooltipSide,
        }"
        icon="pi pi-trash"
        severity="danger"
        text
        rounded
        :aria-label="t('app.measurements.clearAll', { count: totalMeasurements })"
        @click="confirming = true"
      />
    </template>

    <Divider class="my-1!" />

    <Button
      v-tooltip="{ value: `${t('app.resetCamera')} (R)`, position: tooltipSide }"
      icon="pi pi-refresh"
      severity="secondary"
      text
      rounded
      :aria-label="t('app.resetCamera')"
      @click="emit('resetCamera')"
    />

    <Dialog
      v-model:visible="confirming"
      modal
      dismissable-mask
      :header="t('app.measurements.confirmTitle')"
      :style="{ width: '24rem' }"
    >
      <p class="m-0 text-sm text-[var(--p-text-muted-color)]">
        {{ t('app.measurements.confirmBody', { count: totalMeasurements }) }}
      </p>

      <template #footer>
        <Button
          :label="t('app.measurements.cancel')"
          severity="secondary"
          text
          @click="confirming = false"
        />
        <Button
          :label="t('app.measurements.confirmDelete')"
          icon="pi pi-trash"
          severity="danger"
          @click="confirmAll"
        />
      </template>
    </Dialog>
  </nav>
</template>

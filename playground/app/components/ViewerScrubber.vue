<script setup lang="ts">
const props = defineProps<{
  imageIndex: number
  maxIndex: number
  count: number
  sourceLabel: string
  /** Cine is playing. */
  playing: boolean
  /** False for a single image: one picture is not a film. */
  canPlay: boolean
  /** True while the stack is being decoded into the cache. */
  preparing: boolean
  /** True once the whole stack is in the cache. */
  prepared: boolean
  /** True while too little of the stack is decoded to play it yet. */
  buffering: boolean
  /** How far preparation has got, 0..100. */
  percent: number
  /** How preparation is going, or `null` when there is nothing to say. */
  statusText: string | null
}>()

const emit = defineEmits<{
  'update:imageIndex': [index: number]
  'togglePlay': []
  'prepare': []
}>()

const frameRate = defineModel<number>('frameRate', { required: true })
const loop = defineModel<boolean>('loop', { required: true })

const { t, n, isRtl } = useCornerstoneI18n()

// Slider is v-model-only, so the prop is bridged rather than bound directly.
const index = computed({
  get: () => props.imageIndex,
  set: value => emit('update:imageIndex', value),
})

// The shortcut belongs on the tooltip, since that is where it is discovered —
// but not while the button is waiting, when the key does nothing either.
const playTooltip = computed(() => {
  if (props.buffering) return t('app.cine.buffering')
  if (props.playing) return t('app.cine.pause')
  return `${t('app.cine.play')} (Space)`
})

// Rates are numbers, so their labels are built through the formatter and carry
// the locale's digits — 24 fps reads as ۲۴ in Farsi.
const frameRateOptions = computed(() =>
  FRAME_RATES.map(value => ({ value, label: t('app.cine.fps', { count: value }) })),
)
</script>

<template>
  <!--
    Clicks bubble up to `releaseFocus`, so a button pressed with the mouse
    does not keep the spacebar to itself afterwards — see the helper for why.
  -->
  <footer
    class="flex flex-wrap items-center gap-3 border-t border-[var(--p-content-border-color)] bg-[var(--p-content-background)] px-4 py-3"
    @click="releaseFocus"
  >
    <!--
      The transport, and only when there is a film to play: a series of one
      image has nothing to run, so the controls are left out rather than
      greyed out. `<template>` renders no element of its own, so the buttons
      stay direct children of the footer's flex row.

      Icon-only, because the footer is already busy and play, pause and loop
      are the three symbols everyone reads without a label — the tooltip and
      the aria-label carry the words.
    -->
    <template v-if="canPlay">
      <!--
        `loading` while the stack is still being decoded: PrimeVue swaps the
        icon for a spinner and disables the button, which is the whole message
        — the film is coming, it is not ready yet. It says that better than a
        plain disabled play button, which reads as "not possible here".

        The colour follows that one fact rather than whether it is playing:
        muted while it is waiting, primary the moment it can be pressed. So
        the button lighting up is what announces the film is ready, and it
        stays lit through playback.
      -->
      <Button
        v-tooltip.top="playTooltip"
        :icon="playing ? 'pi pi-pause' : 'pi pi-play'"
        :severity="buffering ? 'secondary' : 'primary'"
        :loading="buffering"
        rounded
        :aria-label="buffering ? t('app.cine.buffering') : playing ? t('app.cine.pause') : t('app.cine.play')"
        @click="emit('togglePlay')"
      />

      <Select
        v-model="frameRate"
        :options="frameRateOptions"
        option-label="label"
        option-value="value"
        size="small"
        class="w-28"
        :aria-label="t('app.cine.frameRate')"
      />

      <Button
        v-tooltip.top="t('app.cine.loop')"
        icon="pi pi-replay"
        :severity="loop ? 'primary' : 'secondary'"
        :text="!loop"
        rounded
        :aria-label="t('app.cine.loop')"
        :aria-pressed="loop"
        @click="loop = !loop"
      />
    </template>

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

    <!--
      Preparing is decoding the whole stack into Cornerstone's cache up front,
      which is what makes playback run at the rate that was asked for. A stack
      starts preparing itself the moment it loads, so what is usually here is
      the progress bar and then the tally. The button is the way back when a
      run did not finish — interrupted by another series, or cut short by a
      full cache — and it disappears once there is nothing left to fetch.

      It goes with the transport, for the same reason: a single image is
      fetched the moment it is shown and there is nothing else to fetch ahead
      of, so there is nothing here to offer.
    -->
    <template v-if="canPlay">
      <ProgressBar
        v-if="preparing"
        :value="percent"
        :show-value="false"
        class="h-1.5 w-24"
      />
      <Button
        v-else-if="!prepared"
        v-tooltip.top="t('app.cine.prepareHint')"
        :label="t('app.cine.prepare')"
        icon="pi pi-download"
        severity="secondary"
        size="small"
        @click="emit('prepare')"
      />

      <span
        v-if="statusText"
        class="text-sm text-[var(--p-text-muted-color)]"
      >{{ statusText }}</span>
    </template>

    <span class="text-sm text-[var(--p-text-muted-color)]">{{ sourceLabel }}</span>
  </footer>
</template>

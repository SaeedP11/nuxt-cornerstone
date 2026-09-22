<script setup lang="ts">
defineProps<{
  ready: boolean
  busy: boolean
  hasImages: boolean
  annotationsBusy: boolean
  annotationsLoaded: boolean
  annotationsVisible: boolean
}>()

const emit = defineEmits<{
  loadSamples: []
  open: [files: File[]]
  openAnnotations: [file: File]
  toggleAnnotations: []
  clear: []
  showHelp: []
}>()

const { t, locale, availableLocales } = useCornerstoneI18n()

// Endonyms: a language picker names each language in that language.
const LOCALE_LABELS: Record<string, string> = { en: 'English', fa: 'فارسی' }

const localeOptions = computed(() =>
  availableLocales.value.map(code => ({ code, label: LOCALE_LABELS[code] ?? code })),
)

// FileUpload in basic mode with `custom-upload` hands the chosen files straight
// to us instead of posting them anywhere; it clears its own input afterwards,
// so the same files can be picked again.
function onPick(event: { files: File | File[] }) {
  emit('open', Array.isArray(event.files) ? event.files : [event.files])
}

// One report at a time, so the picker takes one file and the newest replaces
// whatever the last one drew.
function onPickAnnotations(event: { files: File | File[] }) {
  const file = Array.isArray(event.files) ? event.files[0] : event.files
  if (file) emit('openAnnotations', file)
}
</script>

<template>
  <header
    class="flex flex-wrap items-center gap-3 border-b border-[var(--p-content-border-color)] bg-[var(--p-content-background)] px-4 py-3"
    @click="releaseFocus"
  >
    <!-- A package name is an identifier, not prose: keep it LTR in both directions. -->
    <span
      dir="ltr"
      class="font-semibold"
    >nuxt-cornerstone</span>
    <Tag
      :value="ready ? t('app.ready') : t('app.initialising')"
      :severity="ready ? 'success' : 'secondary'"
    />

    <div class="flex-1" />

    <SelectButton
      v-model="locale"
      :options="localeOptions"
      option-label="label"
      option-value="code"
      :allow-empty="false"
      size="small"
      :aria-label="t('app.language')"
    />

    <!--
      The bundled samples are downloaded by `pnpm samples` and are gitignored,
      so a build does not carry them and the button would only ever report that
      it could not find them.

      <DevOnly> rather than `v-if`: a v-if on a build-time constant still ships
      the button's render code and its label, and only declines to draw it.
      This removes it from the bundle.
    -->
    <DevOnly>
      <Button
        :label="t('app.loadSamples')"
        icon="pi pi-images"
        size="small"
        :loading="busy"
        @click="emit('loadSamples')"
      />
    </DevOnly>

    <!--
      One picker for both: loose DICOM files and ZIP archives go to the same
      handler, which unpacks an archive if it finds one and vets the rest.
      Two buttons asked the user to classify their own files before the viewer
      would look at them.

      No `accept`, even though an archive has a reliable extension: FileUpload
      turns `accept` into a validation rule for the whole selection, and plenty
      of DICOM files carry no extension at all (IM000001, I10), so filtering on
      one would reject exactly the files a viewer is expected to open. What
      does not belong is turned away afterwards, on its contents, by the guard.
    -->
    <FileUpload
      mode="basic"
      custom-upload
      auto
      multiple
      :choose-label="t('app.open')"
      choose-icon="pi pi-folder-open"
      :choose-button-props="{ severity: 'secondary', size: 'small', loading: busy }"
      @uploader="onPick"
    />

    <!--
      Annotations are matched to the slices that are loaded, so the picker only
      appears once there are images to match them against. `accept` is safe
      here in a way it is not for the DICOM picker: a report is a .json file
      and says so.
    -->
    <FileUpload
      v-if="hasImages"
      mode="basic"
      custom-upload
      auto
      accept="application/json,.json"
      :choose-label="t('app.annotations.open')"
      choose-icon="pi pi-flag"
      :choose-button-props="{ severity: 'secondary', size: 'small', loading: annotationsBusy }"
      @uploader="onPickAnnotations"
    />

    <!-- Once a report is drawn, the button only shows and hides it. -->
    <Button
      v-if="annotationsLoaded"
      :label="annotationsVisible ? t('app.annotations.hide') : t('app.annotations.show')"
      :icon="annotationsVisible ? 'pi pi-eye-slash' : 'pi pi-eye'"
      :severity="annotationsVisible ? 'warn' : 'secondary'"
      size="small"
      @click="emit('toggleAnnotations')"
    />

    <Button
      :label="t('app.clear')"
      icon="pi pi-times"
      severity="secondary"
      size="small"
      :disabled="!hasImages"
      @click="emit('clear')"
    />

    <Button
      icon="pi pi-question"
      severity="secondary"
      text
      rounded
      size="small"
      :aria-label="t('app.shortcuts.title')"
      @click="emit('showHelp')"
    />
  </header>
</template>

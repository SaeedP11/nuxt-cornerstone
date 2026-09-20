<script setup lang="ts">
defineProps<{
  ready: boolean
  busy: boolean
  hasImages: boolean
}>()

const emit = defineEmits<{
  loadSamples: []
  openFiles: [files: File[]]
  openZip: [file: File]
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
  emit('openFiles', Array.isArray(event.files) ? event.files : [event.files])
}

function onPickZip(event: { files: File | File[] }) {
  const file = Array.isArray(event.files) ? event.files[0] : event.files
  if (file) emit('openZip', file)
}
</script>

<template>
  <header class="flex flex-wrap items-center gap-3 border-b border-[var(--p-content-border-color)] bg-[var(--p-content-background)] px-4 py-3">
    <!-- A package name is an identifier, not prose: keep it LTR in both directions. -->
    <span
      dir="ltr"
      class="font-semibold"
    >nuxt-cornerstone3d</span>
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
      No `accept`: FileUpload turns it into a validation rule, and plenty of
      DICOM files carry no extension at all (IM000001, I10), so filtering on
      one would reject exactly the files a viewer is expected to open.
    -->
    <FileUpload
      mode="basic"
      custom-upload
      auto
      multiple
      :choose-label="t('app.openFiles')"
      choose-icon="pi pi-folder-open"
      :choose-button-props="{ severity: 'secondary', size: 'small' }"
      @uploader="onPick"
    />

    <!-- An archive does have a reliable extension, so this one can filter. -->
    <FileUpload
      mode="basic"
      custom-upload
      auto
      accept=".zip,application/zip,application/x-zip-compressed"
      :choose-label="t('app.openZip')"
      choose-icon="pi pi-file-import"
      :choose-button-props="{ severity: 'secondary', size: 'small' }"
      @uploader="onPickZip"
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

<script setup lang="ts">
import type { Types as CoreTypes } from '@cornerstonejs/core'
import type { DicomSeries, ZipProgress } from '../../../src/runtime/composables/useDicomFiles'

interface SampleEntry {
  name: string
  label: string
  bytes: number
}

/**
 * What produced the current stack. Kept as data rather than as a finished
 * string, so the footer re-renders in the new language when the locale changes
 * instead of freezing whatever was picked at load time.
 */
type SourceInfo =
  | { kind: 'samples', count: number }
  | { kind: 'files', count: number }
  | { kind: 'zip', file: string, images: number, series: number, skipped: number }

/**
 * A problem to show. Either a key to translate, or a message that already came
 * out of a thrown error — those are translated at the moment they are thrown,
 * so switching locale afterwards does not rewrite them.
 */
type Problem =
  | { key: string, params?: Record<string, string | number> }
  | { message: string }

const { ready, error: initError } = useCornerstone()
const { addFiles, addZip, toImageId, purge } = useDicomFiles()
const tools = useCornerstoneTools()
const { t, n, locale, isRtl, availableLocales } = useCornerstoneI18n()

const imageIds = ref<string[]>([])
const imageIndex = ref(0)
const source = ref<SourceInfo | null>(null)
const busy = ref(false)
const problem = ref<Problem | null>(null)
const activeTool = ref('WindowLevelTool')
const viewport = shallowRef<CoreTypes.IStackViewport | null>(null)
const dragging = ref(false)

// ZIP state. `series` stays empty for every other source, which is what the
// series picker keys off.
const series = shallowRef<DicomSeries[]>([])
const activeSeriesUid = ref<string | null>(null)
const progress = ref<ZipProgress | null>(null)

const TOOLS = [
  { className: 'WindowLevelTool', key: 'app.tool.windowLevel' },
  { className: 'PanTool', key: 'app.tool.pan' },
  { className: 'ZoomTool', key: 'app.tool.zoom' },
  { className: 'LengthTool', key: 'app.tool.length' },
  { className: 'RectangleROITool', key: 'app.tool.rectangle' },
  { className: 'EllipticalROITool', key: 'app.tool.ellipse' },
  { className: 'ProbeTool', key: 'app.tool.probe' },
]

// Endonyms: a language picker names each language in that language.
const LOCALE_LABELS: Record<string, string> = { en: 'English', fa: 'فارسی' }

const toolOptions = computed(() =>
  TOOLS.map(tool => ({ className: tool.className, label: t(tool.key) })),
)

const localeOptions = computed(() =>
  availableLocales.value.map(code => ({ code, label: LOCALE_LABELS[code] ?? code })),
)

const maxIndex = computed(() => Math.max(0, imageIds.value.length - 1))

const problemText = computed(() => {
  if (initError.value) return initError.value.message
  const value = problem.value
  if (!value) return null
  return 'key' in value ? t(value.key, value.params) : value.message
})

const sourceLabel = computed(() => {
  const value = source.value
  if (!value) return ''
  if (value.kind === 'samples') return t('app.source.samples', { count: value.count })
  if (value.kind === 'files') return t('app.source.files', { count: value.count })

  const summary = t('app.source.zip', {
    file: value.file,
    images: t('app.count.images', { count: value.images }),
    series: t('app.count.series', { count: value.series }),
  })
  if (!value.skipped) return summary
  return summary + t('list.separator') + t('app.count.skipped', { count: value.skipped })
})

const progressLabel = computed(() => {
  const value = progress.value
  if (!value) return ''
  if (value.phase === 'reading') return t('app.progress.reading')
  if (value.phase === 'extracting') return t('app.progress.extracting')
  return t('app.progress.indexing', { done: value.done, total: value.total })
})

/** Indeterminate until there is something countable to count. */
const progressValue = computed(() => {
  const value = progress.value
  if (!value || value.phase !== 'indexing' || value.total === 0) return null
  return Math.round((value.done / value.total) * 100)
})

async function loadSamples() {
  busy.value = true
  problem.value = null
  try {
    const manifest = await $fetch<SampleEntry[]>('/samples/manifest.json')
    if (!manifest.length) throw new Error('manifest is empty')
    resetSeries()
    imageIndex.value = 0
    imageIds.value = manifest.map(entry => toImageId(`/samples/${entry.name}`))
    source.value = { kind: 'samples', count: manifest.length }
  }
  catch {
    problem.value = { key: 'app.error.noSamples' }
  }
  finally {
    busy.value = false
  }
}

async function open(files: File[] | FileList | null) {
  if (!files) return
  const list = Array.from(files)
  if (!list.length) return

  busy.value = true
  problem.value = null
  try {
    const ids = await addFiles(list)
    resetSeries()
    imageIndex.value = 0
    imageIds.value = ids
    source.value = { kind: 'files', count: ids.length }
  }
  catch (caught) {
    problem.value = { message: caught instanceof Error ? caught.message : String(caught) }
  }
  finally {
    busy.value = false
  }
}

async function openZip(file: File) {
  busy.value = true
  problem.value = null
  progress.value = null
  try {
    const result = await addZip(file, {
      onProgress: value => (progress.value = value),
    })

    if (!result.series.length) {
      resetSeries()
      imageIds.value = []
      source.value = null
      problem.value = { key: 'app.error.noDicomInZip', params: { file: file.name } }
      return
    }

    series.value = result.series
    selectSeries(result.series[0]!.seriesInstanceUid)

    source.value = {
      kind: 'zip',
      file: file.name,
      images: result.imageIds.length,
      series: result.series.length,
      skipped: result.skipped.length,
    }
  }
  catch (caught) {
    problem.value = { message: caught instanceof Error ? caught.message : String(caught) }
  }
  finally {
    busy.value = false
    progress.value = null
  }
}

function selectSeries(uid: string | null) {
  const chosen = series.value.find(entry => entry.seriesInstanceUid === uid)
  if (!chosen) return
  activeSeriesUid.value = chosen.seriesInstanceUid
  imageIndex.value = 0
  imageIds.value = chosen.imageIds
}

function resetSeries() {
  series.value = []
  activeSeriesUid.value = null
}

// FileUpload in basic mode with `custom-upload` hands the chosen files straight
// to us instead of posting them anywhere; it clears its own input afterwards,
// so the same files can be picked again.
function onPick(event: { files: File | File[] }) {
  open(Array.isArray(event.files) ? event.files : [event.files])
}

function onPickZip(event: { files: File | File[] }) {
  const file = Array.isArray(event.files) ? event.files[0] : event.files
  if (file) openZip(file)
}

function isZip(file: File): boolean {
  return /\.zip$/i.test(file.name) || /zip/.test(file.type)
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const dropped = Array.from(event.dataTransfer?.files ?? [])
  if (!dropped.length) return

  // A dropped archive is unpacked; anything else goes through the plain file
  // path. Dropping a ZIP alongside loose files is ambiguous, so the archive
  // wins and the rest is ignored.
  const archive = dropped.find(isZip)
  if (archive) openZip(archive)
  else open(dropped)
}

async function clear() {
  imageIds.value = []
  imageIndex.value = 0
  source.value = null
  resetSeries()
  await purge()
}

async function selectTool(className: string) {
  await tools.setActive(className)
}

// /?samples loads the bundled stack straight away, which makes the demo
// linkable and lets a headless browser drive it.
onMounted(() => {
  if (useRoute().query.samples !== undefined) loadSamples()
})

function resetCamera() {
  viewport.value?.resetCamera()
  viewport.value?.render()
}
</script>

<template>
  <div class="flex h-full flex-col bg-[var(--p-surface-950)] text-[var(--p-text-color)]">
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

      <Button
        :label="t('app.loadSamples')"
        icon="pi pi-images"
        size="small"
        :loading="busy"
        @click="loadSamples"
      />

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
        :disabled="!imageIds.length"
        @click="clear"
      />
    </header>

    <div
      v-if="progress"
      class="flex items-center gap-3 border-b border-[var(--p-content-border-color)] bg-[var(--p-content-background)] px-4 py-2"
    >
      <ProgressBar
        :mode="progressValue === null ? 'indeterminate' : 'determinate'"
        :value="progressValue ?? 0"
        class="h-2 flex-1"
      />
      <span
        class="w-56 text-end text-sm text-[var(--p-text-muted-color)]"
        :class="isRtl ? 'tabular-nums' : 'font-mono'"
      >
        {{ progressLabel }}
      </span>
    </div>

    <Message
      v-if="problemText"
      severity="warn"
      :closable="false"
      class="m-0 rounded-none"
    >
      {{ problemText }}
    </Message>

    <nav
      v-if="imageIds.length"
      class="flex flex-wrap items-center gap-3 border-b border-[var(--p-content-border-color)] bg-[var(--p-content-background)] px-4 py-2"
    >
      <SelectButton
        v-model="activeTool"
        :options="toolOptions"
        option-label="label"
        option-value="className"
        :allow-empty="false"
        size="small"
        @update:model-value="selectTool"
      />

      <Select
        v-if="series.length > 1"
        :model-value="activeSeriesUid"
        :options="series"
        option-label="label"
        option-value="seriesInstanceUid"
        size="small"
        class="w-72"
        @update:model-value="selectSeries"
      />

      <div class="flex-1" />

      <Button
        :label="t('app.resetCamera')"
        icon="pi pi-refresh"
        severity="secondary"
        size="small"
        @click="resetCamera"
      />
    </nav>

    <main
      class="relative flex min-h-0 flex-1"
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
        @ready="viewport = $event"
        @image-index-change="imageIndex = $event"
      />

      <p
        v-else
        class="m-auto max-w-prose px-4 text-center text-[var(--p-text-muted-color)]"
      >
        {{ t('app.empty') }}
      </p>
    </main>

    <footer
      v-if="imageIds.length"
      class="flex flex-wrap items-center gap-4 border-t border-[var(--p-content-border-color)] bg-[var(--p-content-background)] px-4 py-3"
    >
      <Slider
        v-model="imageIndex"
        :min="0"
        :max="maxIndex"
        :step="1"
        class="w-80"
      />
      <span
        class="text-sm text-[var(--p-text-muted-color)]"
        :class="isRtl ? 'tabular-nums' : 'font-mono'"
      >
        {{ n(imageIndex + 1) }} / {{ n(imageIds.length) }}
      </span>

      <div class="flex-1" />

      <span class="text-sm text-[var(--p-text-muted-color)]">{{ sourceLabel }}</span>
    </footer>
  </div>
</template>

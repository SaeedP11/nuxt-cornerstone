<script setup lang="ts">
import type { Types as CoreTypes } from '@cornerstonejs/core'
import type { DicomSeries, ZipProgress } from '../../../src/runtime/composables/useDicomFiles'

interface SampleEntry {
  name: string
  label: string
  bytes: number
}

const { ready, error: initError } = useCornerstone()
const { addFiles, addZip, toImageId, purge } = useDicomFiles()
const tools = useCornerstoneTools()

const imageIds = ref<string[]>([])
const imageIndex = ref(0)
const source = ref('')
const busy = ref(false)
const loadError = ref<string | null>(null)
const activeTool = ref('WindowLevelTool')
const viewport = shallowRef<CoreTypes.IStackViewport | null>(null)
const dragging = ref(false)

// ZIP state. `series` stays empty for every other source, which is what the
// series picker keys off.
const series = shallowRef<DicomSeries[]>([])
const activeSeriesUid = ref<string | null>(null)
const progress = ref<ZipProgress | null>(null)

const TOOLS = [
  { className: 'WindowLevelTool', label: 'Window/Level' },
  { className: 'PanTool', label: 'Pan' },
  { className: 'ZoomTool', label: 'Zoom' },
  { className: 'LengthTool', label: 'Length' },
  { className: 'RectangleROITool', label: 'Rectangle' },
  { className: 'EllipticalROITool', label: 'Ellipse' },
  { className: 'ProbeTool', label: 'Probe' },
]

const maxIndex = computed(() => Math.max(0, imageIds.value.length - 1))

const progressLabel = computed(() => {
  const value = progress.value
  if (!value) return ''
  if (value.phase === 'reading') return 'Reading archive…'
  if (value.phase === 'extracting') return 'Extracting…'
  return `Reading headers ${value.done} / ${value.total}`
})

/** Indeterminate until there is something countable to count. */
const progressValue = computed(() => {
  const value = progress.value
  if (!value || value.phase !== 'indexing' || value.total === 0) return null
  return Math.round((value.done / value.total) * 100)
})

async function loadSamples() {
  busy.value = true
  loadError.value = null
  try {
    const manifest = await $fetch<SampleEntry[]>('/samples/manifest.json')
    if (!manifest.length) throw new Error('manifest is empty')
    resetSeries()
    imageIndex.value = 0
    imageIds.value = manifest.map(entry => toImageId(`/samples/${entry.name}`))
    source.value = `${manifest.length} bundled samples (one CT slice per transfer syntax)`
  }
  catch {
    loadError.value
      = 'No samples found. Run `pnpm samples` to download them into playground/public/samples/.'
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
  loadError.value = null
  try {
    const ids = await addFiles(list)
    resetSeries()
    imageIndex.value = 0
    imageIds.value = ids
    source.value = `${ids.length} local file${ids.length === 1 ? '' : 's'}, sorted by InstanceNumber`
  }
  catch (caught) {
    loadError.value = caught instanceof Error ? caught.message : String(caught)
  }
  finally {
    busy.value = false
  }
}

async function openZip(file: File) {
  busy.value = true
  loadError.value = null
  progress.value = null
  try {
    const result = await addZip(file, {
      onProgress: value => (progress.value = value),
    })

    if (!result.series.length) {
      resetSeries()
      imageIds.value = []
      loadError.value = `No DICOM images found in ${file.name}.`
      return
    }

    series.value = result.series
    selectSeries(result.series[0]!.seriesInstanceUid)

    const total = result.imageIds.length
    const count = result.series.length
    source.value
      = `${file.name} — ${total} image${total === 1 ? '' : 's'} in `
        + `${count} series${count === 1 ? '' : 'es'}`
        + (result.skipped.length ? `, ${result.skipped.length} file(s) skipped` : '')
  }
  catch (caught) {
    loadError.value = caught instanceof Error ? caught.message : String(caught)
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
  source.value = ''
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
      <span class="font-semibold">nuxt-cornerstone3d</span>
      <Tag
        :value="ready ? 'cornerstone ready' : 'initialising…'"
        :severity="ready ? 'success' : 'secondary'"
      />

      <div class="flex-1" />

      <Button
        label="Load bundled samples"
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
        choose-label="Open DICOM files…"
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
        choose-label="Open ZIP…"
        choose-icon="pi pi-file-import"
        :choose-button-props="{ severity: 'secondary', size: 'small' }"
        @uploader="onPickZip"
      />

      <Button
        label="Clear"
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
      <span class="w-56 text-right font-mono text-sm text-[var(--p-text-muted-color)]">
        {{ progressLabel }}
      </span>
    </div>

    <Message
      v-if="initError || loadError"
      severity="warn"
      :closable="false"
      class="m-0 rounded-none"
    >
      {{ initError?.message ?? loadError }}
    </Message>

    <nav
      v-if="imageIds.length"
      class="flex flex-wrap items-center gap-3 border-b border-[var(--p-content-border-color)] bg-[var(--p-content-background)] px-4 py-2"
    >
      <SelectButton
        v-model="activeTool"
        :options="TOOLS"
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
        label="Reset camera"
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
        class="m-auto text-[var(--p-text-muted-color)]"
      >
        Drop DICOM files or a ZIP archive here, open them from the toolbar, or load the bundled
        samples.
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
      <span class="font-mono text-sm text-[var(--p-text-muted-color)]">
        {{ imageIndex + 1 }} / {{ imageIds.length }}
      </span>

      <div class="flex-1" />

      <span class="text-sm text-[var(--p-text-muted-color)]">{{ source }}</span>
    </footer>
  </div>
</template>

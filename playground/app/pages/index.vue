<script setup lang="ts">
import type { Types as CoreTypes } from '@cornerstonejs/core'

interface SampleEntry {
  name: string
  label: string
  bytes: number
}

const { ready, error: initError } = useCornerstone()
const { addFiles, toImageId, purge } = useDicomFiles()
const tools = useCornerstoneTools()

const imageIds = ref<string[]>([])
const imageIndex = ref(0)
const source = ref('')
const busy = ref(false)
const loadError = ref<string | null>(null)
const activeTool = ref('WindowLevelTool')
const viewport = shallowRef<CoreTypes.IStackViewport | null>(null)
const dragging = ref(false)

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

async function loadSamples() {
  busy.value = true
  loadError.value = null
  try {
    const manifest = await $fetch<SampleEntry[]>('/samples/manifest.json')
    if (!manifest.length) throw new Error('manifest is empty')
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

// FileUpload in basic mode with `custom-upload` hands the chosen files straight
// to us instead of posting them anywhere; it clears its own input afterwards,
// so the same files can be picked again.
function onPick(event: { files: File | File[] }) {
  open(Array.isArray(event.files) ? event.files : [event.files])
}

function onDrop(event: DragEvent) {
  dragging.value = false
  open(event.dataTransfer?.files ?? null)
}

async function clear() {
  imageIds.value = []
  imageIndex.value = 0
  source.value = ''
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

      <Button
        label="Clear"
        icon="pi pi-times"
        severity="secondary"
        size="small"
        :disabled="!imageIds.length"
        @click="clear"
      />
    </header>

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
        Drop DICOM files here, open them from the toolbar, or load the bundled samples.
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

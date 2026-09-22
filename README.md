# nuxt-cornerstone

[Cornerstone3D](https://www.cornerstonejs.org/) for Nuxt 4 — a DICOM stack viewport, tool groups
and loaders, with the build configuration Cornerstone needs already done.

Cornerstone3D cannot simply be imported into a Nuxt app. It needs Vite configured a particular way
(module workers, dependency prebundling held back from the WASM codecs, CommonJS interop), and it is
strictly browser-only, so SSR must never touch it. A plugin file cannot change Vite's configuration
for the app that installs it — a module can, which is what this is.

Built and verified against **Cornerstone3D 5.10.7**, **Nuxt 4.5.2**, **Vite 8.3.0**.

## Install

The `@cornerstonejs/*` packages are peer dependencies, so your app owns exactly one copy of each.
Two copies of `@cornerstonejs/core` in a dependency tree means two image caches and two event
targets, and it fails in ways that are hard to trace.

```bash
pnpm add nuxt-cornerstone
pnpm add @cornerstonejs/core @cornerstonejs/tools @cornerstonejs/dicom-image-loader \
         @cornerstonejs/metadata @cornerstonejs/utils dicom-parser
```

`@cornerstonejs/metadata` and `@cornerstonejs/utils` were split out of `core` in Cornerstone3D 5 and
are exact-pinned peers of it. Nothing in your code imports them directly, but the install is broken
without them. All `@cornerstonejs` packages must be on the same version.

The module checks for all six at startup and fails with the install command if any is missing.

### Styling

Nothing to configure. `<CornerstoneViewport>` brings the handful of rules it needs to function —
a size of its own, `overflow: hidden`, `touch-action: none`, and `display: block` on the canvas
Cornerstone appends to it — in its own `<style>` block, which your build compiles like any other
component's. There is no Tailwind requirement and no source-scanning line to add.

Those rules are written as `:where(.nuxt-cornerstone-viewport)`, which contributes no specificity,
so anything you write beats them without `!important`:

```vue
<CornerstoneViewport :image-ids="imageIds" class="h-[600px] rounded-lg" />
```

The element must end up with a height from somewhere. It defaults to `100%`, which means a parent
with a height of its own; a viewport that reports no error and draws nothing is almost always an
ancestor that collapsed to zero.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-cornerstone'],
})
```

## Usage

```vue
<script setup lang="ts">
const { addFiles } = useDicomFiles()
const tools = useCornerstoneTools()

const imageIds = ref<string[]>([])
const imageIndex = ref(0)

async function open(files: FileList | null) {
  if (files) imageIds.value = await addFiles(files)
}
</script>

<template>
  <input type="file" multiple @change="open(($event.target as HTMLInputElement).files)">
  <button @click="tools.setActive('LengthTool')">Measure</button>

  <div style="height: 600px">
    <CornerstoneViewport
      :image-ids="imageIds"
      :image-index="imageIndex"
      @image-index-change="imageIndex = $event"
    />
  </div>
</template>
```

Out of the box: left-drag windows/levels, right-drag zooms, middle-drag pans, the wheel scrolls the
stack.

## `<CornerstoneViewport>`

A stack viewport. Registered as a client-only component, so you never need `<ClientOnly>` around it.

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `imageIds` | `string[]` | required | `wadouri:` / `wadors:` / `dicomfile:` ids, in display order |
| `imageIndex` | `number` | `0` | index into `imageIds` |
| `viewportId` | `string` | generated | |
| `renderingEngineId` | `string` | module option | viewports sharing an id share one engine |
| `toolGroupId` | `string` | module option | |
| `background` | `[number, number, number]` | `[0, 0, 0]` | canvas background, RGB in 0..1 |
| `defaultTool` | `string \| false` | `'WindowLevelTool'` | bound to left-drag on mount |

Events: `ready(viewport)`, `imageRendered`, `imageIndexChange(index)`, `error(error)`.

Exposed: `viewport`, `viewportId`, `renderingEngineId`, `status`, `error`, `setImageIndex(index)`,
`resetCamera()`, `getRenderingEngine()`.

The default slot receives `{ status, error, viewport }` for overlays.

`imageIndex` changes collapse rather than queue. `setImageIdIndex` resolves only once the slice has
been loaded and drawn, which can take longer than the gap between requests — cine playback asks for
a frame every 30 ms or so, and scrubbing fires as fast as the pointer moves. Only one change is
ever in flight; whatever arrives while it runs replaces the previous waiting one, so the viewport
follows the newest index asked for rather than the last load to finish.

The element must have a size — give it a height. It waits for a non-zero box before enabling the
viewport, because Cornerstone sizes its canvas from the element and a zero-sized element produces a
camera that never recovers. A viewport that starts inside a collapsed panel therefore comes up when
the panel opens, not before. Resizes are followed with a `ResizeObserver`, keeping the user's
pan/zoom.

## Composables

All are auto-imported.

**`useCornerstone()`** → `{ libs, ready, error, pending, ensure, options }`. Calling it starts
initialisation; `ensure()` resolves with `{ core, tools, dicomImageLoader }`. Initialisation is
shared, so calling this from ten components still initialises once.

**`useDicomFiles()`** → `{ addFiles, addZip, toImageId, indexUrls, purge, imageIdForSopInstanceUid }`.
`addFiles(files)` registers local `File`s and returns `dicomfile:` imageIds sorted by
**InstanceNumber** — read from tag (0020,0013) with `dicom-parser`, stopping at that tag, and
falling back to a numeric-aware filename sort for files that do not carry it. Pass
`{ sort: 'name' }` or `{ sort: false }` to change that. `toImageId(url)` builds a `wadouri:` id for
a Part 10 file served over HTTP. `addZip(file)` unpacks a ZIP archive — see below.
`indexUrls(urls)` reads the headers of files served that way so imported annotations can find them,
which `toImageId()` alone does not do. `imageIdForSopInstanceUid(uid)` answers where a slice ended
up, which is how annotations from elsewhere find their image — see
[Imported annotations](#imported-annotations).

**`useCornerstoneI18n()`** → `{ locale, setLocale, availableLocales, dir, isRtl, t, n, formatBytes,
addMessages, setTranslator }`. Locale and translation for the strings this module produces — see
[Internationalisation](#internationalisation).

### ZIP archives

`addZip()` takes a `File`, `Blob`, `ArrayBuffer` or `Uint8Array` and returns the images inside it,
**split into series**:

```vue
<script setup lang="ts">
import type { DicomSeries } from 'nuxt-cornerstone'

const { addZip } = useDicomFiles()
const series = shallowRef<DicomSeries[]>([])
const imageIds = ref<string[]>([])

async function open(file: File) {
  const result = await addZip(file, {
    onProgress: ({ phase, done, total }) => console.log(phase, done, '/', total),
  })
  series.value = result.series
  imageIds.value = result.series[0]?.imageIds ?? []
}
</script>
```

Each `DicomSeries` carries `seriesInstanceUid`, `seriesNumber`, `description`, `modality`, a
ready-made `label` and its own sorted `imageIds`. Series come back ordered by SeriesNumber. The
result also has a flat `imageIds` across every series, and `skipped`, listing the archive members
that were not loaded and why.

Splitting by SeriesInstanceUID (0020,000E) is the default because a study ZIP normally holds
several series, and stacking a sagittal T1 on top of an axial T2 is not a stack. Files whose header
does not give a SeriesInstanceUID fall back to grouping by their folder inside the archive, which is
how burned CDs lay series out anyway. Pass `{ groupBy: false }` for a single group holding
everything.

Archive members are filtered twice. Before anything is inflated, entries are dropped by name and
declared size — directories, `__MACOSX/`, dotfiles, `DICOMDIR`, `Thumbs.db`, and extensions that are
never DICOM (`.pdf`, `.jpg`, `.txt` and friends). There is no allowlist in the other direction,
because plenty of DICOM files are named `IM000001` or `I10`.

What survives is then judged on its bytes, and has to prove itself. A Part 10 file says so with the
`DICM` magic at offset 128. A dataset stored without a preamble has nothing to declare, so its
structure is read instead: the first element must open a group a dataset may legitimately open with
(file meta, or the identifying module), and the elements after it must parse and ascend. Anything
that can show neither is skipped as `not-dicom`.

A name is not evidence in either direction — a PNG renamed to `.dcm` is still a PNG, and it is
rejected here on its first tag, whose group reads as `0x5089`.

| Option | Default | |
| --- | --- | --- |
| `groupBy` | `'series'` | `false` returns one group |
| `sort` | `'instanceNumber'` | as `addFiles`; applies within each series |
| `maxBytes` | `2 GiB` | ceiling on total *uncompressed* bytes |
| `onProgress` | — | `{ phase, done, total }` |

`maxBytes` is checked against the sizes the archive's central directory declares, so a 100 KB file
claiming to expand to 40 GB is rejected without allocating for it.

`onProgress` reports three phases. `'reading'` and `'extracting'` have nothing to count — fflate
reports nothing until inflation finishes — so show an indeterminate bar for those; `'indexing'`
counts DICOM headers and fills in `done`/`total`. Indexing yields to the event loop every 32 files,
so a large study does not freeze the page while it is read.

Decompression uses [`fflate`](https://github.com/101arrowz/fflate), imported dynamically: an app
that never opens an archive never loads it.

**`useCornerstoneTools(toolGroupId?)`** → `{ ensureGroup, addViewport, removeViewport, setActive,
setPassive, setEnabled, setDisabled, getActiveTool, destroy }`. Takes either a class name
(`'LengthTool'`) or a tool name (`'Length'`). `setActive` sets the tool that held the left-drag
binding to *passive* rather than disabled, so annotations it drew stay visible and selectable.

**`useRenderingEngine()`** → `{ acquire, release, get }`. Engines are shared per id and reference
counted; the last viewport to leave destroys the engine. `core.init()` allocates a pool of WebGL
contexts (7 by default) and each engine takes one, so four viewports should share one engine rather
than create four.

**`useImagePrefetch()`** → `{ prepare, cancel, reset, isPrepared, loaded, failed, total, pending,
progress, complete, cacheFull }`. Decodes a stack into Cornerstone's image cache ahead of time.

**`useCinePlayer(index, frameCount, options?)`** → `{ playing, frameRate, loop, bounce, direction,
canPlay, play, pause, toggle, setFrameRate, setDirection }`. Plays a stack as a film by advancing
the index ref you give it. Both are covered under [Cine playback](#cine-playback).

**`useDicomAnnotations(viewport)`** → `{ addBoxes, addJson, clear, setVisible, drawn, pending,
visible }`. Draws boxes that were produced somewhere else — see below.

### Cine playback

A stack viewport loads each slice at the moment it is shown. That is right for scrolling and wrong
for anything that moves on its own: at 15 frames a second the decoder never keeps up, and playback
stutters through whatever happens to be cached. So the two halves go together — prepare the stack,
then play it.

```vue
<script setup lang="ts">
const imageIds = ref<string[]>([])
const imageIndex = ref(0)

const prefetch = useImagePrefetch()
const cine = useCinePlayer(imageIndex, () => imageIds.value.length, { frameRate: 15 })

// Prepare as soon as a stack has loaded, rather than making the user ask:
// by the time they reach for play, the film is already in the cache. A new
// stack cancels the run the old one started.
watch(imageIds, (ids) => {
  cine.pause()
  prefetch.reset()
  if (ids.length > 1) prefetch.prepare(ids, { order: 'forward' })
})
</script>

<template>
  <CornerstoneViewport
    :image-ids="imageIds"
    :image-index="imageIndex"
    @image-index-change="imageIndex = $event"
  />
  <button @click="cine.toggle()">{{ cine.playing.value ? 'Pause' : 'Play' }}</button>
  <progress :value="prefetch.progress.value" />
</template>
```

`prepare(imageIds, options)` resolves once every image has been through the loader, and reports
`{ loaded, failed, total, cancelled, cacheFull }`. Follow it live on the refs instead — `progress`
is 0..1, and `pending` is true while it runs. Images already in the cache are counted and skipped,
so preparing again after adding slices only fetches the new ones.

| Option | Default | |
| --- | --- | --- |
| `from` | `0` | index to start from — pass the slice on screen |
| `order` | `'outward'` | `'outward'` fans out either side of `from`; `'forward'` runs to the end and wraps |
| `concurrency` | `4` | images decoded at once |
| `priority` | `0` | passed to Cornerstone's loader; lower runs sooner |
| `requestType` | `'prefetch'` | the request class the pool serves after anything the user waits on |
| `onProgress` | — | `{ loaded, failed, total }` after each image settles |

One instance runs one prepare at a time: a second call cancels the first, which is what you want
when the user switches series mid-load. `cancel()` also abandons the requests in flight, and the
composable calls it for you when its scope is disposed. Counters keep their values so a
half-prepared stack can still say so; `reset()` clears them.

A slice that will not decode is counted in `failed` and the rest continue. If the image cache fills
up, the run stops rather than thrashing — each new slice would only evict one just decoded — and
`cacheFull` says so. Raise the ceiling with `cache.setMaxCacheSize()` if a whole study has to fit.

`useCinePlayer()` owns no images and no viewport. It advances the index ref, and whatever is bound
to that index follows, so a scrubber, the keyboard and the player all move the same value. Frames
are paced with `requestAnimationFrame` measured against the clock, so the rate does not drift and a
backgrounded tab stops advancing instead of spending the battery. A frame that arrives late is
shown late and the ones behind it are dropped, rather than the stack sprinting to catch up.

| Option | Default | |
| --- | --- | --- |
| `frameRate` | `15` | clamped to 1..60; `frameRate` is writable, so a control can `v-model` it |
| `loop` | `true` | `false` stops at the end |
| `bounce` | `false` | reverse at each end instead of jumping — what a cardiac cine wants |
| `direction` | `1` | `-1` plays towards the first image |

`canPlay` is false for a stack of one, because a single image is a picture rather than a film. Draw
the transport from it rather than only disabling by it — a play button on a series of one has
nothing to do in any state, so leaving it out says so more clearly than greying it out. The player
pauses itself when the stack is replaced or emptied.

### Imported annotations

Boxes from a reporting service or a detection model are drawn onto the stack with
`useDicomAnnotations()`. It takes the viewport — a ref, a getter, or the object itself — and boxes
in **image pixel coordinates**, each naming the slice it belongs to by **SOPInstanceUID**:

```vue
<script setup lang="ts">
import type { Types as CoreTypes } from '@cornerstonejs/core'

const viewport = shallowRef<CoreTypes.IStackViewport | null>(null)
const { addZip } = useDicomFiles()
const { addBoxes, setVisible, visible } = useDicomAnnotations(viewport)

async function open(archive: Blob, report: Finding[]) {
  await addZip(archive)

  const { drawn, deferred, unresolved } = await addBoxes(
    report.map(finding => ({
      sopInstanceUid: finding.sopInstanceUid,
      box: { x1: finding.left, y1: finding.top, x2: finding.right, y2: finding.bottom },
      label: `${finding.name} ${Math.round(finding.confidence * 100)}%`,
      uid: finding.id,
    })),
    { color: 'rgb(251, 191, 36)' },
  )

  if (unresolved.length) console.warn(`${unresolved.length} boxes name slices that are not loaded`)
}
</script>
```

**SOPInstanceUID (0008,0018) is how a box finds its slice**, because it is the only identifier that
survives leaving the viewer: `dicomfile:` imageIds are handed out by the loader as files are
registered, so the same study opened twice has a different set of them. `addFiles()` and `addZip()`
record the UID of every file whose header they read, which is every file on the default settings —
`sort: false` and `sort: 'name'` skip header reading, and a file that was not indexed cannot be
found by UID. Boxes naming a slice that is not loaded come back in `unresolved` instead of throwing,
because a study and a report disagreeing about which slices exist is a normal thing to show the
user rather than an error.

**Boxes are placed lazily.** Pixel coordinates become world coordinates through the slice's own
image plane, and the metadata provider only holds that once the slice has been loaded. A box whose
slice is already loaded is drawn immediately and counted in `drawn`; the rest are held and counted
in `deferred`, then drawn the first time their slice is shown. Loading 500 slices up front to place
boxes the user may never scroll to would cost more than it saves.

**They are read-only.** Boxes are locked, so they cannot be dragged, resized or deleted, and they
are drawn with a RectangleROI instance of their own — registered as `DicomBoxOverlay` — rather than
with RectangleROI itself. That keeps the user's own measurements separately styled and separately
selectable, and lets an imported box show the label it arrived with instead of the area and mean a
measurement shows. Pass `{ locked: false }` if they should be editable.

`setVisible(false)` hides the boxes without discarding them; `clear()` removes every box this
composable drew and leaves the user's own measurements alone. Boxes are keyed to the imageIds that
were loaded when they were added, so clear them when the stack changes.

| Option | Default | |
| --- | --- | --- |
| `color` | Cornerstone's locked colour | any CSS colour; applies to imported boxes only |
| `locked` | `true` | `false` makes them editable |

### Annotation files

`addJson(file)` is the same thing starting from a JSON file rather than from objects you have
already built. Open the DICOM images first — the boxes are matched to the slices that are loaded —
then hand it whatever the user picked, dropped or you fetched: a `File`, a `Blob`, the JSON text, or
an object that is already parsed.

```vue
<script setup lang="ts">
const viewport = shallowRef<CoreTypes.IStackViewport | null>(null)
const { addJson } = useDicomAnnotations(viewport)

async function openReport(file: File) {
  const { drawn, deferred, report } = await addJson(file, { color: 'rgb(251, 191, 36)' })

  if (drawn + deferred === 0 && report.boxes.length) {
    // Parsed fine, matched nothing: normally a report for a different series.
    console.warn(`report belongs to series ${report.seriesInstanceUid}`)
  }
}
</script>
```

Two layouts are read. The first is this module's own — a list of boxes, either as the whole document
or under `boxes` / `annotations`:

```json
[{ "sopInstanceUid": "1.2.3", "box": { "x1": 10, "y1": 20, "x2": 80, "y2": 90 }, "label": "Nodule 1" }]
```

The second is a detector's output: findings, each holding the slices it was seen on, optionally
wrapped in `predictions`.

```json
{ "predictions": { "findings": [
  { "confidence": 0.87, "label": 1, "slice_findings": [
    { "sop_instance_uid": "1.2.3",
      "bounding_box": { "upper_left_x": 10, "upper_left_y": 20,
                        "lower_right_x": 80, "lower_right_y": 90 } }
  ] }
] } }
```

Field names are read in both `camelCase` and `snake_case`, and a box may be written as two opposite
corners, as `xMin`/`xMax`, as an origin with `width` and `height`, or as a bare `[x1, y1, x2, y2]`.
A finding's own `bounding_box` is deliberately ignored: it is in the volume the model ran on, not in
the pixel space of the images on screen, so only `slice_findings` is read. Anything else throws with
a message naming what was expected; individual rows that cannot be read are counted in
`report.malformed` rather than discarding the rest of the file.

Boxes read from the detector shape are captioned with the finding's name — or its class — and its
confidence, and are given a uid of `finding-<n>-<sopInstanceUid>`, so opening the same report twice
replaces its boxes instead of stacking a second set on the first. Pass `label` to write your own
caption, and `minConfidence` to drop findings below a threshold.

| Option | Default | |
| --- | --- | --- |
| `minConfidence` | `0` | 0..1; detector shape only |
| `label` | name + confidence | `(finding) => string` |

`addJson` also takes `color` and `locked`, which it passes to `addBoxes`. It returns what `addBoxes`
returns, plus `report`: `{ boxes, format, findings, filtered, malformed, seriesInstanceUid }`. For
files served over HTTP, call `indexUrls()` before drawing — `toImageId()` builds an imageId without
reading the file, so nothing would know its SOPInstanceUID.

## Building a viewer

The composables above are the primitives. Assembling them into something a
radiologist can use — open a study, switch series, scrub, play, report what
went wrong — is the same work in every application, so it is here too, in a
second tier of composables that produce **state and translated captions but no
markup**. You bring the buttons.

```vue
<script setup lang="ts">
import type { Types as CoreTypes } from '@cornerstonejs/core'

const study = useDicomStudy()
const viewport = shallowRef<CoreTypes.IStackViewport | null>(null)
const cine = useStackCine(study.imageIds, study.imageIndex)
const report = useAnnotationReport(viewport)
const tools = useCornerstoneTools()

useViewerShortcuts({
  isEnabled: () => study.imageIds.value.length > 0,
  step: study.step,
  first: () => (study.imageIndex.value = 0),
  last: () => (study.imageIndex.value = study.maxIndex.value),
  stepSeries: study.stepSeries,
  setTool: tools.setActive,
  resetViewport: () => viewport.value?.resetCamera(),
  togglePlay: cine.toggle,
  toggleHelp: () => {},
})
</script>

<template>
  <input type="file" multiple @change="study.openAny(Array.from($event.target.files ?? []))">
  <p v-if="study.problemText.value">{{ study.problemText }}</p>

  <div style="height: 600px">
    <CornerstoneViewport
      :image-ids="study.imageIds.value"
      :image-index="study.imageIndex.value"
      @ready="viewport = $event"
      @image-index-change="study.imageIndex.value = $event"
    />
  </div>

  <button :disabled="cine.buffering.value" @click="cine.toggle">Play</button>
  <small>{{ study.sourceLabel }} · {{ cine.statusText }}</small>
</template>
```

**`useDicomStudy()`** → `{ ready, imageIds, imageIndex, maxIndex, series, activeSeriesUid, source,
sourceLabel, busy, progress, progressLabel, progressValue, problemText, rejectedText, openAny,
openFiles, openZip, openUrls, selectSeries, step, stepSeries, clear, setProblem }`.

Everything about the stack on screen. `openAny(files)` is the one way in for a picked or dropped
selection: an archive is unpacked and anything else is vetted file by file, on content rather than
on the name, so a PNG renamed `.dcm` is turned away here with its name attached instead of failing
later at render with an error that points at the viewport. `openUrls(urls)` is the path for a study
served by your own backend; it reads each file's headers afterwards so an annotation report can find
the slices. The `*Label` and `*Text` members are computed, already translated, and re-render on a
locale switch — they hold data rather than a finished string for exactly that reason.

**`useStackCine(imageIds, imageIndex)`** → `{ playing, canPlay, frameRate, loop, preparing,
prepared, buffering, percent, statusText, play, pause, toggle, prepare }`.

[`useCinePlayer()`](#cine-playback) and `useImagePrefetch()` wired together, which is what a
transport actually needs: a stack viewport loads each slice as it shows it, so playing a stack
nobody has prepared runs at the speed of the decoder rather than at the frame rate that was asked
for. A stack prepares itself as soon as it loads, and `buffering` holds play until
`PLAY_READY_RATIO` — half — of it is decoded. Half is a comfortable head start, because the film and
the prefetch both run from the first image.

**`useAnnotationReport(viewport)`** → `{ open, toggle, reset, busy, loaded, visible, summaryText,
failure, drawn, pending }`.

[`useDicomAnnotations()`](#imported-annotations) as a user action: which file is open, whether its
boxes are showing, and what to say afterwards. The case worth having a sentence for is a file that
parsed perfectly and placed nothing, which almost always means the report belongs to another series.
Call `reset()` when the stack changes — boxes are keyed to the imageIds that were loaded when they
were drawn.

**`useMeasurements(viewport)`** → `{ list, refresh, remove, deleteSelected, deleteOnSlice,
deleteAll, total, onSlice, selected }`.

Deleting the measurements the reader drew. Cornerstone gives every annotation tool a way to draw and
no way to un-draw, so a stray Length or a mis-clicked Probe stays on the slice for as long as the
study is open. This is the other half: the counts a toolbar needs to decide what to offer, and the
three removals worth offering.

```vue
<script setup lang="ts">
const viewport = shallowRef<CoreTypes.IStackViewport | null>(null)
const measurements = useMeasurements(viewport)
</script>

<template>
  <!-- Nothing drawn yet, nothing to offer. -->
  <template v-if="measurements.total.value">
    <button @click="measurements.deleteOnSlice()">
      Clear this image ({{ measurements.onSlice.value }})
    </button>
    <button @click="measurements.deleteAll()">
      Clear all ({{ measurements.total.value }})
    </button>
  </template>
</template>
```

Only the reader's own work is in scope. Boxes drawn by [`useDicomAnnotations()`](#imported-annotations)
are excluded by tool name and anything locked is excluded outright, so a delete button cannot erase
an imported report — `useAnnotationReport().reset()` is what takes those away. Pass `{ keep: [...] }`
to exclude tools of your own as well.

Scope is the stack on screen, not the annotation state manager, which outlives a study: a
measurement drawn on a series that has since been closed is neither counted nor deleted. The counts
follow the annotation state — they move when the user draws, deletes, selects or scrolls — so a
toolbar can read them directly rather than recomputing them.

**`useViewerShortcuts(handlers, { tools })`** and **`releaseFocus(event)`**.

The [OHIF](https://ohif.org) keymap: arrows and Home/End through the stack, PageUp/PageDown through
the series, `W`/`P`/`Z` and friends for tools, `R` to reset, Space or `C` for cine, `?` for help.
Delete and Backspace remove the selected measurements when you supply `deleteMeasurement` — both
keys, because the one a reader reaches for is whichever their keyboard has; leave the handler out
and the keys stay with the browser.
Bindings match `event.code`, the physical key, not `event.key`: on a Persian layout the W key
reports `'ش'` and on a Russian one `'ц'`, so a `key`-based binding silently stops working for
anyone not on QWERTY. Pass `tools` so your toolbar and the keymap read from one table and the key a
button advertises is the key that works; the default is `DEFAULT_TOOL_SHORTCUTS`. Widgets that read
the keyboard themselves — anything with a text, combobox, listbox or menu role, and anything inside
an open dialog — are left alone. `releaseFocus` goes on a toolbar's root: a button clicked with the
mouse keeps focus and then swallows the spacebar, so picking a tool and pressing play appears to do
nothing.

**`guardDicomFiles(files)`** → `{ accepted, rejected }`. The content check `openFiles()` runs, on
its own, for an application that sorts its own selection.

## Options

```ts
export default defineNuxtConfig({
  modules: ['nuxt-cornerstone'],
  cornerstone: {
    autoInit: true,
    core: {},                        // -> coreInit(config)
    dicomImageLoader: {},            // -> dicomImageLoaderInit(options)
    tools: { enabled: true, register: [/* class names */] },
    i18n: {                          // see Internationalisation
      locale: 'en',
      fallbackLocale: 'en',
      messages: {},
      numberingSystem: 'auto',
      detect: false,                 // or true to follow the host app's locale
    },
    viteCommonjs: true,
    prefix: 'Cornerstone',
    renderingEngineId: 'nuxt-cornerstone',
    toolGroupId: 'nuxt-cornerstone-tools',
  },
})
```

Registered tools by default: `WindowLevelTool`, `PanTool`, `ZoomTool`, `StackScrollTool`,
`LengthTool`, `RectangleROITool`, `EllipticalROITool`, `ProbeTool`. Add any other export of
`@cornerstonejs/tools` to `tools.register`.

### Callbacks

Options reach the browser through `runtimeConfig`, which is serialized into the page payload, so
functions cannot travel that way — `dicomImageLoader.beforeSend`, `core.peerImport` and friends. The
module warns at build time and drops them. Pass them at runtime instead:

```ts
// nuxt.config.ts → cornerstone: { autoInit: false }

// app/plugins/cornerstone.client.ts
export default defineNuxtPlugin(() => {
  ensureCornerstone({
    dicomImageLoader: {
      beforeSend: xhr => ({ Authorization: `Bearer ${useAuth().token}` }),
    },
  })
})
```

## Internationalisation

The module ships `en` and `fa` (Farsi) and depends on no i18n library, because a viewer component
should not force one on the app that installs it. Both catalogues are bundled — they are a few
hundred bytes each, and the strings are needed synchronously, on paths like `asZipError()` that have
to return an `Error` rather than a promise of one.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  cornerstone: {
    i18n: {
      locale: 'fa',
      fallbackLocale: 'en',
      // Merged over the built-ins. Override a string, add a locale, or
      // register keys of your own — `t()` resolves anything in here.
      messages: {
        fa: { 'series.unnamed': 'سری ناشناس' },
      },
      // 'auto' (default) gives Farsi its Persian-Indic digits: ۱۲ تصویر.
      // 'latn' pins every locale to 0-9, for users who cross-reference slice
      // numbers against another system.
      numberingSystem: 'auto',
    },
  },
})
```

```vue
<script setup lang="ts">
const { t, n, locale, dir, isRtl, availableLocales } = useCornerstoneI18n()
</script>

<template>
  <!-- `locale` is writable, and every viewer in the app follows it. -->
  <select v-model="locale">
    <option v-for="code in availableLocales" :key="code" :value="code">{{ code }}</option>
  </select>
  <p>{{ t('series.unnamed') }} — {{ n(1234) }}</p>
</template>
```

Set `<html lang dir>` from the same source, so the chrome flips with the locale:

```ts
// app.vue
const { locale, dir } = useCornerstoneI18n()
useHead({ htmlAttrs: { lang: locale, dir } })   // pass the refs, not `.value`
```

### Following the host application's locale

By default the module uses the locale you configure and nothing else. Set `detect` and it reads the
locale from the app that installed it instead:

```ts
// nuxt.config.ts
cornerstone: {
  i18n: { detect: true },            // or pick the sources: ['i18n', 'html']
}
```

`true` tries each source in order and stops at the first that answers:

| Source | Reads | Follows changes |
| --- | --- | --- |
| `'i18n'` | `nuxtApp.$i18n.locale` — `@nuxtjs/i18n` and vue-i18n, in either Composition or legacy mode | yes, reactively |
| `'html'` | the `lang` attribute on `<html>`, which nearly every i18n library sets | yes, via `MutationObserver` |
| `'navigator'` | the browser's preferred language | no, read once at startup |

Nothing is imported to do this — `$i18n` is duck-typed, so the module gains no dependency and simply
declines when no i18n library is installed.

**Only a locale the module has a catalogue for is adopted.** An app running in a language nobody has
translated keeps the configured locale, rather than flipping text direction under the viewer to go
on showing English anyway. A host that *starts* in such a language is never hooked up at all, so it
cannot take the module over later either.

Two things worth knowing:

- **Detection is client-side.** The locale is module-scoped state, which on the server is shared by
  every in-flight request — following a per-request locale there would let one request's language
  leak into another's. During SSR the configured locale is used, so set `cornerstone.i18n.locale` to
  whatever your app's default is and detection takes over after hydration. If you need a genuinely
  per-request locale, use `i18n: false` and the translator below: your own i18n has request scope
  and this does not.
- **Do not use the `'html'` source if you set `<html lang>` *from* this module's locale**, as the
  playground does. It is a cycle. It settles, because adopting the locale that is already active
  changes nothing, but you then have no source of truth.

### What gets translated

Everything the module produces itself: the errors it throws, the series labels
`useDicomFiles()` builds — `Series 3 (CT, 12 images)` becomes `سری ۳ (CT، ۱۲ تصویر)` — and every
caption the [viewer composables](#building-a-viewer) return, under the `study.*`, `cine.*` and
`report.*` keys. Identifiers stay in English inside every translation, because
`cornerstone.autoInit` and `ensureCornerstone()` are things you have to type or search for.

Those captions are computed from state rather than stored once, so they are rewritten on a locale
switch. That is the one place the rule below does not apply.

An error is translated when it is **thrown**, not when it is displayed. Switching locale does not
rewrite an error already sitting in a `ref`.

### RTL and the viewport

`<CornerstoneViewport>` sets `dir="ltr"` on itself and you should leave it there. In an RTL app the
surrounding chrome flips, but a DICOM image must not: left and right are facts about the patient,
and mirroring one turns a left-sided finding into a right-sided one. It is a default rather than a
hard-coded value, so an app with its own reason to change it still can by passing `dir`.

### Using your own i18n instead

If the app already runs vue-i18n, `@nuxtjs/i18n` or anything else, hand it these strings:

```ts
// nuxt.config.ts → cornerstone: { i18n: false }

// app/plugins/cornerstone-i18n.client.ts
export default defineNuxtPlugin(() => {
  const { t } = useI18n()
  const { setTranslator } = useCornerstoneI18n()
  // Return `undefined` for a key you do not own and the built-in English
  // answers instead, so you can take over three strings or all of them.
  setTranslator((key, params) => (te(key) ? t(key, params) : undefined))
})
```

`i18n: false` keeps the module on English and makes `setLocale()` a no-op, so there is no second
locale quietly tracking alongside yours.

The locale is module-scoped state, shared by every request on the server. That is correct for a
locale fixed at build time and wrong for a per-request one, so `setLocale()` is a client-side call.
For per-request locales, keep `i18n: false` and let your own i18n — which has request scope — feed
the translator.

### Adding a locale

Nothing in the module is specific to `en` and `fa`. Plural forms come from `Intl.PluralRules`, so a
catalogue supplies whichever CLDR categories its language uses and missing ones fall back to
`other`; text direction is derived from the language subtag.

```ts
messages: {
  ar: {
    'series.unnamed': 'سلسلة بدون اسم',
    'series.images': { zero: 'لا صور', one: 'صورة واحدة', two: 'صورتان', few: '{count} صور', other: '{count} صورة' },
  },
}
```

## What the module does to Vite

On the client build only:

- **`optimizeDeps.exclude: ['@cornerstonejs/dicom-image-loader']`.** Each decoder locates its binary
  with a bare `@cornerstonejs/codec-*` specifier inside `new URL(..., import.meta.url)`. Rollup
  resolves that and emits the binary; esbuild does not, and dev prebundling is esbuild. Left in, the
  request goes to a path that does not exist, the SPA fallback answers with `index.html`, and you
  get `CompileError: WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 64 6f`
  — `3c 21 64 6f` is `<!do`.
- **`optimizeDeps.include`** for `dicom-parser` (CommonJS), `fflate`, `@cornerstonejs/core`,
  `@cornerstonejs/tools`, `@cornerstonejs/metadata` and `@cornerstonejs/utils`. Two reasons. Vite
  would discover core and tools on the first dynamic import anyway, but discovering them *while the
  browser is importing them* re-bundles, changes the dep hash and invalidates the in-flight URLs, so
  the first load fails with "error loading dynamically imported module" and only recovers through a
  full reload. And `metadata`/`utils` are singletons holding the metadata provider registry: reached
  only transitively, the optimizer inlines one copy into core's chunk while the excluded image loader
  resolves a second raw copy, the two stop sharing a registry, and every `wadouri` load fails with
  `no pixel data in NATURALIZED`. Naming them makes them shared chunks. `fflate` is here for the
  first reason too: it is imported dynamically the first time someone opens a ZIP, which is a click
  rather than a page load, so discovering it only then would reload the page out from under the
  archive the user just picked.
- **`worker.format: 'es'`.** The loader spawns
  `new Worker(new URL('./decodeImageFrameWorker.js', import.meta.url), { type: 'module' })`.
- **`assetsInclude: ['**/*.wasm']`.**
- **`@originjs/vite-plugin-commonjs`** (`viteCommonjs: true`, on by default). The four Emscripten
  codec bundles are UMD/CommonJS, and they are served raw because the loader that imports them is
  excluded from prebundling. Without this, initialisation fails with
  `doesn't provide an export named: 'default'`. Turn it off only if you supply your own interop.

It also adds the browser-only packages to `nitro.externals.external` so the server bundle cannot
inline them.

## Troubleshooting

**Deflated Explicit VR Little Endian (1.2.840.10008.1.2.1.99) fails to load** with `no pixel data in
NATURALIZED`. This is upstream: Cornerstone3D 5's default metadata path naturalises Part 10 with
dcmjs's `AsyncDicomReader`, which does not inflate the deflated dataset — it reads no elements past
the file meta group. The legacy path parses through `dicom-parser` with a pako inflater and handles
it:

```ts
cornerstone: { dicomImageLoader: { useLegacyMetadataProvider: true } }
```

That path is deprecated upstream, so treat it as a workaround for this transfer syntax rather than a
default.

**`Module "fs"/"path" has been externalized for browser compatibility`** during build, pointing at
the codec packages. Harmless — the Emscripten glue only reaches for them under Node. The equivalent
webpack fix is `config.resolve.fallback = { fs: false }`.

**Serving under a subpath, or from a CDN.** Point the loader at the binaries yourself:

```ts
cornerstone: {
  dicomImageLoader: { wasmBasePath: '/assets/cs-wasm/' },
}
```

One root for every codec, containing `charlswasm_decode.wasm`, `libjpegturbowasm_decode.wasm`,
`openjpegwasm_decode.wasm` and `openjphjs.wasm`, copied from the `dist` directory of each
`@cornerstonejs/codec-*` package.

**`No known conditions for "./types" specifier in "@cornerstonejs/core"`** at build time. Something
is importing `@cornerstonejs/core/types` as a *value*; that subpath only has a `types` condition. Use
`import type`.

**Tool names look minified** (`LengthTool` registered as `FE`). Set `build.minify: false`, or
register tools by their `toolName` string.

## Scope

This release covers 2D stack viewing: initialisation, `<CornerstoneViewport>`, tool groups, the
[viewer composables](#building-a-viewer) that assemble them into a working viewer,
annotations — drawn by the user, or imported as read-only boxes — and the `wadouri:` /
`dicomfile:` loading paths. Imported annotations are boxes only, and are read-only: nothing writes
measurements back out, and DICOM SR and Presentation State are not read. Volume and MPR viewports, segmentation,
`@cornerstonejs/polymorphic-segmentation` and `@cornerstonejs/labelmap-interpolation` are not wired
up yet — the last two each need their own `optimizeDeps.exclude` entry and a `peerImport` callback.

No chrome ships either, and that is deliberate: a header, a series list and a transport are a
handful of buttons over the composables above, and every application wants them to look like itself.
Making a component library a peer dependency of a DICOM viewport would be a large tax on anyone who
only wants the viewport. The [playground](#playground) is the reference implementation, written to
be read and copied.

## Playground

```bash
pnpm install
pnpm dev:prepare
pnpm samples      # downloads sample DICOM into playground/public/samples/
pnpm dev          # http://localhost:3000 — or /?samples to load the stack immediately
```

The playground UI is built from PrimeVue components with Tailwind for layout. The module itself
ships no UI dependency and no framework requirement — `<CornerstoneViewport>` carries only the
rules it needs to function, and has a default slot for everything else, so the consuming
application supplies the look. The playground's own stylesheet names no source inside the package,
which is the point: what works here works in an app that has never heard of Tailwind.

What is left in `playground/app/` is therefore chrome and nothing else: the header, the series
list, the tool rail, the scrubber and the shortcuts dialog, plus the table of tools that the rail
and the keymap share. Everything underneath them — opening a study, switching series, playback,
prefetch, the annotation report, the keyboard — is [`useDicomStudy()` and its
neighbours](#building-a-viewer), and is imported from the module exactly as it would be in your own
application. Copying a component out of `playground/app/components/` into your project is meant to
work: it is ordinary PrimeVue markup over composables you already have.

The header carries an **English / فارسی** switch. It flips `<html lang dir>`, loads a Persian face,
and renders counts in Persian-Indic digits, while the viewport stays left-to-right. The demo's own
strings live in `playground/i18n/messages.ts` and are registered through
`cornerstone.i18n.messages`, which is the point of it: the catalogue takes arbitrary keys, so an app
can translate its chrome from one source without a second i18n library.

**Open annotations…** appears once there are images on screen. It reads a JSON report and draws it
over the stack, and the button beside it then shows and hides what it drew. A report can also be
dropped on the stage, on its own or alongside the study it belongs to, in which case it is drawn as
soon as the images finish loading. Boxes are discarded whenever the stack changes, since they are
keyed to the imageIds that were loaded when they were drawn.

The rail grows a **delete** section as soon as the reader has drawn something. **Click a
measurement to select it** — any tool selects, so this works without leaving window/level, and
shift-click adds to the selection — and the first button deletes what is selected, as Delete and
Backspace also do. Below it, an eraser clears the measurements on the image on screen and a trash
button clears the series, the latter asking first because it can take away work that is not in view.
Each button appears only when it has something to do: the eraser stays away while every measurement
is on the slice anyway, since it would then be the trash button under another icon, and while
nothing is selected the first slot holds the hint that says a measurement can be clicked at all.
Imported boxes are not measurements: none of this touches a report, which is shown and hidden from
the header and discarded with the stack.

The footer is the transport. **Play** — or the spacebar, or `C` — runs the stack as a film at the
rate chosen beside it, looping unless the loop button is turned off, and moving the scrubber or the
arrow keys takes over from it. Space is the one place this demo parts company with the OHIF keymap,
which resets the viewport with it; Space means play/pause everywhere else a person has used a media
player, so the reset moves to `R`.

Shortcuts are matched on the physical key rather than the character it types, so they work the same
on a Persian, Russian or French layout — `W` is the key marked W, whatever it produces. They stay
out of the way of anything that reads the keyboard itself: a text field, the frame-rate select, the
series list, the scrubber's own arrow handling, and an open dialog.

A stack **prepares itself** as soon as it has loaded — decoding every image into Cornerstone's
cache, in playback order, so that playback and scrolling never wait for the loader — and the footer
shows how far that has got. Play waits for half of it: until then the button holds a spinner rather
than a play icon, and the keys do nothing. Half a stack is already a comfortable head start, because
the film and the prefetch both run from the first image, and the rest arrives while that half plays. A prepare that stops early — cancelled by another series, or cut short by a full
cache — releases play whatever it managed, so the button never spins on a run that is not coming
back. The **Prepare** button is the way back when a run did
not finish, because another series interrupted it or the image cache cut it short, and it
disappears once there is nothing left to fetch. None of this appears for a series of a single
image, which has nothing to play and nothing to fetch ahead of.

The samples are the MIT-licensed test images from the Cornerstone3D repository: one CT slice in eight
transfer syntaxes. Loading them as a single stack exercises every decoder — pako, RLE,
jpeg-lossless-decoder-js, and the libjpeg-turbo, charls and openjpeg WASM codecs — so it doubles as a
check that the worker and WASM wiring is intact.

## Licence

MIT. Cornerstone3D is MIT, maintained by the Open Health Imaging Foundation.

**Not a medical device.** Nothing here is cleared for clinical use.

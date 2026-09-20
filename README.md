# nuxt-cornerstone3d

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
pnpm add nuxt-cornerstone3d
pnpm add @cornerstonejs/core @cornerstonejs/tools @cornerstonejs/dicom-image-loader \
         @cornerstonejs/metadata @cornerstonejs/utils dicom-parser
```

`@cornerstonejs/metadata` and `@cornerstonejs/utils` were split out of `core` in Cornerstone3D 5 and
are exact-pinned peers of it. Nothing in your code imports them directly, but the install is broken
without them. All `@cornerstonejs` packages must be on the same version.

The module checks for all six at startup and fails with the install command if any is missing.

### Tailwind

`<CornerstoneViewport>` styles itself with Tailwind utilities, so your app needs Tailwind v4 and
has to scan this package — Tailwind skips `node_modules` unless a source is named explicitly:

```css
/* assets/css/main.css */
@import "tailwindcss";
@source "../../node_modules/nuxt-cornerstone3d/dist";
```

Without that line the viewport element is laid out at its intrinsic size, which is zero height, and
nothing renders. If you would rather not add Tailwind, give `.nuxt-cornerstone-viewport` the
equivalent rules yourself: `position: relative`, `width: 100%`, `height: 100%`,
`overflow: hidden`, `touch-action: none`, and `display: block` on its child `canvas`.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-cornerstone3d'],
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

**`useDicomFiles()`** → `{ addFiles, addZip, toImageId, purge }`. `addFiles(files)` registers local
`File`s and returns `dicomfile:` imageIds sorted by **InstanceNumber** — read from tag (0020,0013)
with `dicom-parser`, stopping at that tag, and falling back to a numeric-aware filename sort for
files that do not carry it. Pass `{ sort: 'name' }` or `{ sort: false }` to change that.
`toImageId(url)` builds a `wadouri:` id for a Part 10 file served over HTTP. `addZip(file)` unpacks
a ZIP archive — see below.

**`useCornerstoneI18n()`** → `{ locale, setLocale, availableLocales, dir, isRtl, t, n, formatBytes,
addMessages, setTranslator }`. Locale and translation for the strings this module produces — see
[Internationalisation](#internationalisation).

### ZIP archives

`addZip()` takes a `File`, `Blob`, `ArrayBuffer` or `Uint8Array` and returns the images inside it,
**split into series**:

```vue
<script setup lang="ts">
import type { DicomSeries } from 'nuxt-cornerstone3d'

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

## Options

```ts
export default defineNuxtConfig({
  modules: ['nuxt-cornerstone3d'],
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

Everything the module produces itself: the errors it throws, and the series labels
`useDicomFiles()` builds — `Series 3 (CT, 12 images)` becomes `سری ۳ (CT، ۱۲ تصویر)`. Identifiers
stay in English inside every translation, because `cornerstone.autoInit` and `ensureCornerstone()`
are things you have to type or search for.

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

This release covers 2D stack viewing: initialisation, `<CornerstoneViewport>`, tool groups,
annotations, and the `wadouri:` / `dicomfile:` loading paths. Volume and MPR viewports, segmentation,
`@cornerstonejs/polymorphic-segmentation` and `@cornerstonejs/labelmap-interpolation` are not wired
up yet — the last two each need their own `optimizeDeps.exclude` entry and a `peerImport` callback.

## Playground

```bash
pnpm install
pnpm dev:prepare
pnpm samples      # downloads sample DICOM into playground/public/samples/
pnpm dev          # http://localhost:3000 — or /?samples to load the stack immediately
```

The playground UI is built from PrimeVue components with Tailwind for layout. The module itself
ships no UI dependency — `<CornerstoneViewport>` is an unstyled element with a default slot, so the
consuming application supplies its own styling.

The header carries an **English / فارسی** switch. It flips `<html lang dir>`, loads a Persian face,
and renders counts in Persian-Indic digits, while the viewport stays left-to-right. The demo's own
strings live in `playground/i18n/messages.ts` and are registered through
`cornerstone.i18n.messages`, which is the point of it: the catalogue takes arbitrary keys, so an app
can translate its chrome from one source without a second i18n library.

The samples are the MIT-licensed test images from the Cornerstone3D repository: one CT slice in eight
transfer syntaxes. Loading them as a single stack exercises every decoder — pako, RLE,
jpeg-lossless-decoder-js, and the libjpeg-turbo, charls and openjpeg WASM codecs — so it doubles as a
check that the worker and WASM wiring is intact.

## Licence

MIT. Cornerstone3D is MIT, maintained by the Open Health Imaging Foundation.

**Not a medical device.** Nothing here is cleared for clinical use.

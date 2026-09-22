<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue'
import { ensureCornerstone, getCornerstoneOptions } from '../cornerstone'
import { useCornerstoneTools } from '../composables/useCornerstoneTools'
import { useRenderingEngine } from '../composables/useRenderingEngine'
import type { CornerstoneLibs, StackViewport } from '../types'

/**
 * A Cornerstone3D stack viewport.
 *
 * Registered with `mode: 'client'`, so Nuxt never renders it on the server —
 * WebGL, web workers and the WASM decoders have no server-side equivalent.
 */
const props = withDefaults(defineProps<{
  /** `wadouri:` / `wadors:` / `dicomfile:` imageIds, in display order. */
  imageIds: string[]
  /** Defaults to a generated id, unique per component instance. */
  viewportId?: string
  renderingEngineId?: string
  toolGroupId?: string
  /** Index into `imageIds`. Two-way via the `imageIndexChange` event. */
  imageIndex?: number
  /** Canvas background as RGB in 0..1. */
  background?: [number, number, number]
  /** Tool to bind to left-drag once mounted, or `false` to leave it alone. */
  defaultTool?: string | false
}>(), {
  viewportId: undefined,
  renderingEngineId: undefined,
  toolGroupId: undefined,
  imageIndex: 0,
  background: () => [0, 0, 0],
  defaultTool: 'WindowLevelTool',
})

const emit = defineEmits<{
  ready: [viewport: StackViewport]
  error: [error: Error]
  imageRendered: []
  imageIndexChange: [index: number]
}>()

const element = ref<HTMLDivElement | null>(null)
const viewport = shallowRef<StackViewport | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = shallowRef<Error | null>(null)

const engines = useRenderingEngine()
const tools = useCornerstoneTools(props.toolGroupId)

const viewportId = props.viewportId ?? `nuxt-cornerstone-${useId()}`
const renderingEngineId = props.renderingEngineId ?? getCornerstoneOptions().renderingEngineId

let libs: CornerstoneLibs | null = null
let sizeObserver: ResizeObserver | null = null
let resizeObserver: ResizeObserver | null = null
let frame = 0
let acquired = false
let disposed = false
/** True while a `setImageIdIndex` is in flight — see {@link showIndex}. */
let settingIndex = false
/** The newest index asked for while one was in flight, or `null`. */
let queuedIndex: number | null = null

function fail(caught: unknown): void {
  const asError = caught instanceof Error ? caught : new Error(String(caught))
  error.value = asError
  status.value = 'error'
  emit('error', asError)
}

/**
 * Cornerstone sizes the canvas from the element, so enabling a zero-sized
 * element yields a viewport with a degenerate camera that never recovers.
 * Wait until the element has been laid out — which may be never, if it starts
 * inside a collapsed panel, and that is the correct behaviour: the viewport
 * comes up when it becomes visible.
 */
function waitForSize(el: HTMLElement): Promise<void> {
  if (el.clientWidth > 0 && el.clientHeight > 0) return Promise.resolve()
  return new Promise((resolve) => {
    sizeObserver = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        sizeObserver?.disconnect()
        sizeObserver = null
        resolve()
      }
    })
    sizeObserver.observe(el)
  })
}

function observeResize(el: HTMLElement): void {
  resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      // keepCamera: the user's pan/zoom survives a container resize.
      engines.get(renderingEngineId)?.resize(true, true)
    })
  })
  resizeObserver.observe(el)
}

function onImageRendered(): void {
  emit('imageRendered')
}

function onStackNewImage(): void {
  const index = viewport.value?.getCurrentImageIdIndex()
  if (typeof index === 'number') emit('imageIndexChange', index)
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0
  return Math.min(Math.max(index, 0), length - 1)
}

async function applyStack(imageIds: string[], index: number): Promise<void> {
  const vp = viewport.value
  if (!vp) return
  // A frame still waiting to be shown belongs to the stack being replaced.
  queuedIndex = null
  if (imageIds.length === 0) {
    vp.setStack([])
    vp.render()
    return
  }
  await vp.setStack(imageIds, clampIndex(index, imageIds.length))
  vp.render()
}

/**
 * Show one image, with at most one change in flight.
 *
 * `setImageIdIndex` resolves only once the slice has been loaded and drawn,
 * which can take longer than the gap between requests — cine playback asks for
 * a frame every 30 ms or so, and scrubbing fires as fast as the pointer moves.
 * Letting those overlap leaves several loads racing to draw into the same
 * viewport, and the last one to finish wins rather than the last one asked for.
 *
 * So requests collapse: whatever arrives while a change is in flight replaces
 * the previous waiting one, and only that survivor runs next. Frames in
 * between are dropped, which is the right answer — they are already in the
 * past, and drawing them would only make the viewport run late for ever.
 */
async function showIndex(target: number): Promise<void> {
  if (settingIndex) {
    queuedIndex = target
    return
  }

  settingIndex = true
  try {
    let next: number | null = target
    while (next !== null && !disposed) {
      const vp = viewport.value
      if (!vp) return
      const current = next
      next = null
      if (vp.getCurrentImageIdIndex() !== current) await vp.setImageIdIndex(current)
      if (queuedIndex !== null) {
        next = queuedIndex
        queuedIndex = null
      }
    }
  }
  catch (caught) {
    if (!disposed) fail(caught)
  }
  finally {
    settingIndex = false
  }
}

onMounted(async () => {
  const el = element.value
  if (!el) return

  try {
    libs = await ensureCornerstone()
    await waitForSize(el)
    if (disposed) return

    const { Enums } = libs.core
    const engine = await engines.acquire(renderingEngineId)
    acquired = true
    if (disposed) return

    engine.enableElement({
      viewportId,
      element: el,
      type: Enums.ViewportType.STACK,
      defaultOptions: { background: props.background },
    })

    viewport.value = engine.getViewport(viewportId) as StackViewport

    el.addEventListener(Enums.Events.IMAGE_RENDERED, onImageRendered)
    el.addEventListener(Enums.Events.STACK_NEW_IMAGE, onStackNewImage)

    await tools.addViewport(viewportId, renderingEngineId)
    if (props.defaultTool) await tools.setActive(props.defaultTool)

    observeResize(el)
    await applyStack(props.imageIds, props.imageIndex)

    if (disposed) return
    status.value = 'ready'
    emit('ready', viewport.value)
  }
  catch (caught) {
    if (!disposed) fail(caught)
  }
})

watch(
  () => props.imageIds,
  async (imageIds) => {
    if (!viewport.value) return
    try {
      await applyStack(imageIds, props.imageIndex)
    }
    catch (caught) {
      fail(caught)
    }
  },
)

watch(
  () => props.imageIndex,
  (index) => {
    const vp = viewport.value
    if (!vp || props.imageIds.length === 0) return
    const target = clampIndex(index, props.imageIds.length)
    // Guard against the round trip when the parent mirrors imageIndexChange.
    if (!settingIndex && vp.getCurrentImageIdIndex() === target) return
    showIndex(target)
  },
)

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(frame)
  sizeObserver?.disconnect()
  resizeObserver?.disconnect()
  sizeObserver = null
  resizeObserver = null

  const el = element.value
  if (el && libs) {
    el.removeEventListener(libs.core.Enums.Events.IMAGE_RENDERED, onImageRendered)
    el.removeEventListener(libs.core.Enums.Events.STACK_NEW_IMAGE, onStackNewImage)
  }

  tools.removeViewport(viewportId, renderingEngineId)

  try {
    engines.get(renderingEngineId)?.disableElement(viewportId)
  }
  catch {
    // Engine already gone.
  }

  if (acquired) engines.release(renderingEngineId)
  viewport.value = null
})

defineExpose({
  /** The Cornerstone stack viewport, once mounted. */
  viewport,
  viewportId,
  renderingEngineId,
  status,
  error,
  setImageIndex: async (index: number) => {
    if (!viewport.value) return
    await showIndex(clampIndex(index, props.imageIds.length))
  },
  resetCamera: () => {
    viewport.value?.resetCamera()
    viewport.value?.render()
  },
  getRenderingEngine: () => engines.get(renderingEngineId),
})
</script>

<template>
  <!--
    Cornerstone appends its own canvas to this element and reads the element’s
    box for sizing, so the element must carry a size of its own and must not let
    the canvas change it. `touch-none` keeps touch panning from stealing drags
    from the tools, and the canvas is reached with an arbitrary variant because
    Cornerstone creates it at runtime, out of reach of a class binding.

    These are Tailwind utilities: a consuming app needs Tailwind and has to scan
    this package — see “Tailwind” in the README.

    `dir="ltr"` is deliberate and should stay. In an RTL app the surrounding
    chrome flips, but a DICOM image must not: left and right are facts about the
    patient, and mirroring one turns a left-sided finding into a right-sided
    one. It is written as a default rather than hard-coded, so an app that has
    its own reason to change it still can by passing `dir` to the component.
  -->
  <div
    ref="element"
    dir="ltr"
    class="nuxt-cornerstone-viewport relative h-full w-full touch-none overflow-hidden [&>canvas]:block"
    :data-status="status"
    @contextmenu.prevent
  >
    <slot
      :status="status"
      :error="error"
      :viewport="viewport"
    />
  </div>
</template>

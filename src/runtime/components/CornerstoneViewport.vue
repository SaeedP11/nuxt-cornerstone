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
  if (imageIds.length === 0) {
    vp.setStack([])
    vp.render()
    return
  }
  await vp.setStack(imageIds, clampIndex(index, imageIds.length))
  vp.render()
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
  async (index) => {
    const vp = viewport.value
    if (!vp || props.imageIds.length === 0) return
    const target = clampIndex(index, props.imageIds.length)
    // Guard against the round trip when the parent mirrors imageIndexChange.
    if (vp.getCurrentImageIdIndex() === target) return
    try {
      await vp.setImageIdIndex(target)
    }
    catch (caught) {
      fail(caught)
    }
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
    const vp = viewport.value
    if (!vp) return
    await vp.setImageIdIndex(clampIndex(index, props.imageIds.length))
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
  -->
  <div
    ref="element"
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

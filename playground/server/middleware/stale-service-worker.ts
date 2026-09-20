/**
 * Retire a stale service worker left on this origin by another app.
 *
 * Nothing in this project registers a service worker. Registrations are scoped
 * per origin — scheme, host *and* port — so a PWA that once ran on this
 * localhost port leaves one behind, and it outlives the app that created it.
 * The worker then keeps re-fetching its own script to check for an update, and
 * pulls in its Workbox runtime, against whatever is serving that port now.
 *
 * Unhandled, those requests fall through to the Vue app, which has no such
 * pages, and each one logs `[VUE_ROUTER_R0004] No match found for location`.
 *
 * Only the *entry point* can end it: the browser compares the bytes, sees a
 * different script, installs it as the replacement worker, and this one
 * unregisters itself. The `workbox-<hash>.js` requests are a side effect of the
 * old worker still being alive, so they get a harmless stub to keep the log
 * quiet until it goes.
 *
 * This is a dev-time cleanup for a foreign artifact and is not part of the
 * module — production still 404s, and a genuine missing route still warns.
 */
const SERVICE_WORKER_ENTRY_POINTS = new Set([
  '/sw.js',
  '/dev-sw.js',
  '/service-worker.js',
  '/serviceworker.js',
])

/** Workbox ships its runtime as `workbox-<contenthash>.js`. */
const WORKBOX_RUNTIME = /^\/workbox-[\da-f]+\.js$/i

const SELF_DESTROYING_WORKER = `
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.map(key => caches.delete(key)))
    await self.registration.unregister()

    // Reload the pages this worker still controls, so they come back
    // unintercepted rather than waiting for a manual refresh.
    const clients = await self.clients.matchAll({ type: 'window' })
    for (const client of clients) client.navigate(client.url)
  })())
})
`.trimStart()

const WORKBOX_STUB = '// Runtime of a service worker being retired. Intentionally empty.\n'

export default defineEventHandler((event) => {
  if (!import.meta.dev) return

  const path = event.path.split('?')[0] ?? ''
  const isEntryPoint = SERVICE_WORKER_ENTRY_POINTS.has(path)

  if (!isEntryPoint && !WORKBOX_RUNTIME.test(path)) return

  setResponseHeader(event, 'content-type', 'text/javascript; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'service-worker-allowed', '/')

  return isEntryPoint ? SELF_DESTROYING_WORKER : WORKBOX_STUB
})

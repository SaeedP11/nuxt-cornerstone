/**
 * Hooks Vite 8 ignores on a plugin returned from `applyToEnvironment`, and
 * warns about once per environment.
 *
 * The list is Vite's own `ignoredEnvironmentPluginHooks`. These four are
 * whole-config hooks: they run before environments exist, so a plugin that is
 * only created for one environment is already too late to define them.
 */
const IGNORED_ENVIRONMENT_HOOKS = [
  'config',
  'configEnvironment',
  'configureServer',
  'configResolved',
] as const

const ignored: ReadonlySet<string> = new Set(IGNORED_ENVIRONMENT_HOOKS)

/** Marks a plugin whose `applyToEnvironment` this has already wrapped. */
const WRAPPED = Symbol('nuxt-cornerstone:environment-hooks')

/**
 * The little of a Vite plugin this touches, described structurally rather than
 * imported: `vite` is a transitive dependency here, hoisted under Nuxt, and
 * the playground should not grow a direct one for four hook names.
 */
interface Wrappable {
  applyToEnvironment?: (environment: never) => unknown
  [WRAPPED]?: true
}

interface ViteConfigLike {
  plugins?: unknown[]
}

/**
 * Stop Vite warning that a plugin's per-environment hooks will be ignored.
 *
 * Vite 8 lets a plugin return a second plugin from `applyToEnvironment`, built
 * for one environment. Four hooks on that returned plugin can never run,
 * because they belong to a phase that is over by then — and Vite says so:
 *
 *     Plugin "x" defines Vite-specific hooks (configResolved) in a plugin
 *     returned from applyToEnvironment. These hooks will be ignored.
 *
 * `@nuxt/devtools` does exactly this, twice, to collect the resolved client
 * and server configs for its Vite panel, so the warning lands on every cold
 * dev start of this playground with several lines of preamble each time. It is
 * not this module's doing and there is nothing to fix in the plugin from here
 * — but the hooks it names are dead either way, so removing them costs nothing
 * that still works and leaves the log saying only what matters.
 *
 * Written against the whole class rather than that one plugin: any plugin in
 * the config that returns any of the four is handled, so nothing has to change
 * here when a dependency starts or stops doing it. Everything else about each
 * plugin — its name, its `enforce`, and every hook that does run — is left
 * exactly as it was.
 *
 * Development only. A production build resolves no environments this way, and
 * a build should not be quietly rewriting other people's plugins.
 */
export function stripIgnoredEnvironmentHooks(config: ViteConfigLike): void {
  for (const entry of config.plugins ?? []) {
    const plugin = entry as Wrappable | null | undefined
    if (!plugin || typeof plugin !== 'object' || Array.isArray(plugin)) continue
    if (plugin[WRAPPED] || typeof plugin.applyToEnvironment !== 'function') continue

    const original = plugin.applyToEnvironment.bind(plugin)
    plugin.applyToEnvironment = (environment: never) => {
      const applied = original(environment)
      // The hook may hand back a promise, one plugin, an array of them, or a
      // plain boolean meaning "apply the plugin itself, unchanged".
      return applied instanceof Promise ? applied.then(strip) : strip(applied)
    }
    plugin[WRAPPED] = true
  }
}

function strip<T>(applied: T): T {
  if (Array.isArray(applied)) return applied.map(strip) as T
  if (!applied || typeof applied !== 'object') return applied

  const plugin = applied as Record<string, unknown>
  if (!IGNORED_ENVIRONMENT_HOOKS.some(hook => plugin[hook])) return applied

  // Rebuilt without them rather than deleted from a copy: the plugin object
  // may be shared with the top-level config, where these hooks do still run.
  const kept = Object.fromEntries(
    Object.entries(plugin).filter(([key]) => !ignored.has(key)),
  )
  return kept as T
}

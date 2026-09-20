import { ensureCornerstone, getCornerstoneOptions, getLoadedCornerstone } from '../cornerstone'
import type { CornerstoneTools, ToolBinding } from '../types'
import type { Types as ToolsTypes } from '@cornerstonejs/tools'

/**
 * Tool group management.
 *
 * Note the two different names in play: `WindowLevelTool` is the *class* export
 * from `@cornerstonejs/tools`, while `'WindowLevel'` (its static `toolName`) is
 * what tool groups speak. Both are accepted here and resolved to the latter.
 */
export function useCornerstoneTools(toolGroupId?: string) {
  const groupId = toolGroupId ?? getCornerstoneOptions().toolGroupId

  function resolveToolName(tools: CornerstoneTools, tool: string): string {
    const exported = (tools as unknown as Record<string, { toolName?: string }>)[tool]
    return exported?.toolName ?? tool
  }

  /**
   * Get the tool group, creating it on first use with every registered tool
   * added and the conventional viewer bindings wired up: left-drag
   * window/level, right-drag zoom, middle-drag pan, wheel to scroll the stack.
   */
  async function ensureGroup(): Promise<ToolsTypes.IToolGroup> {
    const { tools } = await ensureCornerstone()

    const existing = tools.ToolGroupManager.getToolGroup(groupId)
    if (existing) return existing

    const group = tools.ToolGroupManager.createToolGroup(groupId)
    if (!group) {
      throw new Error(`[nuxt-cornerstone3d] could not create tool group "${groupId}".`)
    }

    const registered = getCornerstoneOptions().tools.register
    const classNames = registered === false ? [] : registered

    for (const className of classNames) {
      const toolName = resolveToolName(tools, className)
      if (!group.hasTool(toolName)) group.addTool(toolName)
    }

    const { MouseBindings } = tools.Enums
    const activate = (className: string, bindings: ToolBinding[]) => {
      const toolName = resolveToolName(tools, className)
      if (group.hasTool(toolName)) group.setToolActive(toolName, { bindings })
    }

    activate('WindowLevelTool', [{ mouseButton: MouseBindings.Primary }])
    activate('ZoomTool', [{ mouseButton: MouseBindings.Secondary }])
    activate('PanTool', [{ mouseButton: MouseBindings.Auxiliary }])
    activate('StackScrollTool', [{ mouseButton: MouseBindings.Wheel }])

    return group
  }

  async function addViewport(viewportId: string, renderingEngineId?: string): Promise<void> {
    const group = await ensureGroup()
    group.addViewport(viewportId, renderingEngineId ?? getCornerstoneOptions().renderingEngineId)
  }

  function removeViewport(viewportId: string, renderingEngineId?: string): void {
    const tools = getLoadedCornerstone()?.tools
    if (!tools) return
    const group = tools.ToolGroupManager.getToolGroup(groupId)
    group?.removeViewports(
      renderingEngineId ?? getCornerstoneOptions().renderingEngineId,
      viewportId,
    )
  }

  /**
   * Make `tool` the active left-drag tool. The tool that held the primary
   * binding is set *passive*, not disabled, so annotations it drew stay on
   * screen and remain selectable.
   */
  async function setActive(tool: string, bindings?: ToolBinding[]): Promise<void> {
    const { tools } = await ensureCornerstone()
    const group = await ensureGroup()
    const toolName = resolveToolName(tools, tool)

    if (!group.hasTool(toolName)) {
      throw new Error(
        `[nuxt-cornerstone3d] tool "${toolName}" is not in tool group "${groupId}". `
        + 'Add its class name to `cornerstone.tools.register` in nuxt.config.',
      )
    }

    const resolved = bindings ?? [{ mouseButton: tools.Enums.MouseBindings.Primary }]
    const takesPrimary = resolved.some(
      binding => binding.mouseButton === tools.Enums.MouseBindings.Primary,
    )

    if (takesPrimary) {
      const previous = group.getCurrentActivePrimaryToolName()
      if (previous && previous !== toolName) group.setToolPassive(previous)
    }

    group.setToolActive(toolName, { bindings: resolved })
  }

  async function setPassive(tool: string): Promise<void> {
    const { tools } = await ensureCornerstone()
    const group = await ensureGroup()
    group.setToolPassive(resolveToolName(tools, tool))
  }

  async function setEnabled(tool: string): Promise<void> {
    const { tools } = await ensureCornerstone()
    const group = await ensureGroup()
    group.setToolEnabled(resolveToolName(tools, tool))
  }

  async function setDisabled(tool: string): Promise<void> {
    const { tools } = await ensureCornerstone()
    const group = await ensureGroup()
    group.setToolDisabled(resolveToolName(tools, tool))
  }

  /** The tool currently bound to left-drag, as a `toolName`. */
  function getActiveTool(): string | null {
    const tools = getLoadedCornerstone()?.tools
    if (!tools) return null
    return tools.ToolGroupManager.getToolGroup(groupId)?.getCurrentActivePrimaryToolName() ?? null
  }

  function destroy(): void {
    const tools = getLoadedCornerstone()?.tools
    if (!tools) return
    if (tools.ToolGroupManager.getToolGroup(groupId)) {
      tools.ToolGroupManager.destroyToolGroup(groupId)
    }
  }

  return {
    toolGroupId: groupId,
    ensureGroup,
    addViewport,
    removeViewport,
    setActive,
    setPassive,
    setEnabled,
    setDisabled,
    getActiveTool,
    destroy,
  }
}

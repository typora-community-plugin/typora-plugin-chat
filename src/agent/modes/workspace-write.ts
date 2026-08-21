import type { AgentModeStrategy } from './index'

/** Default mode: every tool is available (preserves legacy behavior). */
export const workspaceWriteStrategy: AgentModeStrategy = {
  id: 'workspace-write',
  labelKey: 'chat.modeWorkspaceWrite',
  toolAllowed: () => true,
  blockReason: () => null,
  systemPromptLine: () => '',
  canUndoRedo: () => true,
}

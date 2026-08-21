import { isReadTool, isWriteTool } from '../tools/permissions'
import type { AgentModeStrategy } from './index'

/** Read-only mode: read tools stay available; write tools are hidden and blocked. */
export const readOnlyStrategy: AgentModeStrategy = {
  id: 'read-only',
  labelKey: 'chat.modeReadOnly',
  toolAllowed: (name) => !isWriteTool(name),
  blockReason: (name) =>
    isWriteTool(name) ? `Blocked: ${name} requires write access (current mode is read-only).` : null,
  systemPromptLine: () =>
    '\n- The current access mode is READ ONLY: do not modify any file; only read tools are available.',
  canUndoRedo: () => false,
}

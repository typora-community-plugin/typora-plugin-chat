import { isReadTool, isWriteTool } from '../tools/tool-groups'
import type { AgentModeStrategy } from './index'

/** Chat-only mode: no vault/editor file tools at all; only non-file tools remain. */
export const chatOnlyStrategy: AgentModeStrategy = {
  id: 'chat-only',
  labelKey: 'chat.modeChatOnly',
  toolAllowed: (name) => !isWriteTool(name) && !isReadTool(name),
  blockReason: (name) => {
    if (isWriteTool(name)) return `Blocked: ${name} requires write access (current mode is chat-only).`
    if (isReadTool(name)) return `Blocked: ${name} is unavailable in chat-only mode.`
    return null
  },
  systemPromptLine: () =>
    '\n- The current access mode is CHAT ONLY: no vault/editor file tools (read or write) are available; answer conversationally using only the non-file tools.',
  canUndoRedo: () => true,
}

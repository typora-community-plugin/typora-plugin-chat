import type { AgentMode, ApiMessage, ToolDefinition } from '@/config/types'
import { buildSystemPrompt } from './system-prompt'
import { appendAgentsMd, loadAgentsMd } from './agents-md'
import { buildContextMessage } from './context'
import { toolDefinitions } from './tools/registry'
import { toolAllowed } from './tools/permissions'

export interface RequestParts {
  systemMessage: ApiMessage
  contextMessage: ApiMessage
  conversation: ApiMessage[]
  tools: ToolDefinition[]
}

/** Re-export so callers that only need the prompt assembly don't import agents-md directly. */
export { appendAgentsMd } from './agents-md'

export async function buildSystemMessage(skillsCatalog = '', mode: AgentMode = 'workspace-write', agentsMd?: string): Promise<ApiMessage> {
  const content = appendAgentsMd(buildSystemPrompt(skillsCatalog, mode), agentsMd ?? await loadAgentsMd())
  return { role: 'system', content }
}

export function filterTools(mode: AgentMode = 'workspace-write'): ToolDefinition[] {
  return toolDefinitions.filter((tool) => toolAllowed(tool.name, mode))
}

/**
 * Build the exact message list that will be sent to the provider, plus the
 * tools attached to the request. Both the agent loop and the context-usage
 * indicator share this function so their token accounting stays consistent.
 */
export async function buildRequestParts(
  userMessage: string,
  history: ApiMessage[],
  skillsCatalog = '',
  mode: AgentMode = 'workspace-write',
  contextText?: string,
): Promise<RequestParts> {
  // AGENTS.md is loaded inside buildSystemMessage (TTL-cached, so steady-state
  // turns cost zero I/O); the dynamic vault context stays a user message right
  // after it.
  const systemMessage = await buildSystemMessage(skillsCatalog, mode)
  const contextMessage: ApiMessage = { role: 'user', content: contextText ?? await buildContextMessage() }
  const conversation: ApiMessage[] = userMessage
    ? [...history, { role: 'user', content: userMessage }]
    : [...history]
  return {
    systemMessage,
    contextMessage,
    conversation,
    tools: filterTools(mode),
  }
}

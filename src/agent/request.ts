import type { AgentMode, ApiMessage, ToolDefinition } from '@/config/types'
import { buildSystemPrompt } from './system-prompt'
import { buildContextMessage } from './context'
import { toolDefinitions } from './tools/registry'
import { isWriteTool } from './tools/permissions'

export interface RequestParts {
  systemMessage: ApiMessage
  contextMessage: ApiMessage
  conversation: ApiMessage[]
  tools: ToolDefinition[]
}

export function buildSystemMessage(skillsCatalog = '', mode: AgentMode = 'workspace-write'): ApiMessage {
  return { role: 'system', content: buildSystemPrompt(skillsCatalog, mode) }
}

export function filterTools(mode: AgentMode = 'workspace-write'): ToolDefinition[] {
  return mode === 'read-only'
    ? toolDefinitions.filter((tool) => !isWriteTool(tool.name))
    : toolDefinitions
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
  const systemMessage = buildSystemMessage(skillsCatalog, mode)
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

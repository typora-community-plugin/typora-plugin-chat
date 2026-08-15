/**
 * Barrel exports for the Typora Chat plugin (core + adapter layers).
 */

export { ChatView } from './chat-view'
export { executeAgentLoop, abortAgentLoop, resetAgentHistory } from './agent/loop'
export { buildSystemPrompt } from './agent/system-prompt'
export { buildContextMessage } from './agent/context'
export { sendMessage } from './api/client'
export { toolDefinitions } from './tools/registry'
export { executeTool } from './tools/executor'
export { settingsManager, DEFAULT_SETTINGS } from './config/settings'
export type {
  AgentCallbacks,
  AgentResult,
  ApiMessage,
  ApiProvider,
  ChatMessage,
  ContentBlock,
  PluginSettings,
  SelectionScope,
  StopReason,
  ToolDefinition,
  ToolResult,
  UnifiedResponse,
} from './config/types'

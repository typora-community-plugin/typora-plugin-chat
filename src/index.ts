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
export { discoverSkills, getSkill, buildSkillsCatalog } from './skills/index'
export { rescanSkills, skills as skillStore } from './skills/store'
export { parseFrontmatter, deriveSkillMeta, stripFrontmatter } from './skills/frontmatter'
export { globalSkillsDir, vaultSkillsDir, skillRoots } from './skills/paths'
export type {
  AgentCallbacks,
  AgentResult,
  ApiMessage,
  ApiProvider,
  AssistantMeta,
  ChatMessage,
  ContentBlock,
  PluginSettings,
  ReplySpeedUnit,
  SelectionScope,
  StopReason,
  ToolDefinition,
  ToolResult,
  UnifiedResponse,
} from './config/types'
export type { DiscoveredSkill } from './skills/index'

/**
 * Barrel exports for the Typora Chat plugin (core + adapter layers).
 */

export { ChatView } from './chat-view'
export { executeAgentLoop, abortAgentLoop, resetAgentHistory } from './agent/loop'
export { buildSystemPrompt } from './agent/system-prompt'
export { buildContextMessage } from './agent/context'
export { sendMessage } from './api/client'
export { toolDefinitions } from './agent/tools/registry'
export { executeTool } from './agent/tools/executor'
export { settingsManager, DEFAULT_SETTINGS } from './config/settings'
export { discoverSkills, getSkill, buildSkillsCatalog } from './agent/skills/index'
export { rescanSkills, skills as skillStore } from './agent/skills/store'
export { parseFrontmatter, deriveSkillMeta, stripFrontmatter } from './agent/skills/frontmatter'
export { globalSkillsDir, vaultSkillsDir, skillRoots } from './agent/skills/paths'
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
export type { DiscoveredSkill } from './agent/skills/index'

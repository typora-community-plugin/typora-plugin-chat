import type { AskUserQuestionItem, AskUserAnswerItem } from '@/agent/tools/types'

/**
 * Shared type definitions for Typora AI Chat plugin.
 */

export type BuiltinProvider = 'anthropic' | 'openai' | 'ollama'

/**
 * Provider id. Built-in providers use the literals above; custom providers may
 * use any non-colliding string id (`string & {}` keeps the literal hints while
 * allowing arbitrary ids).
 */
export type ApiProvider = BuiltinProvider | (string & {})

/**
 * Per-model parameters. The structure is open: future knobs such as
 * `temperature` / `maxTokens` can be added without changing the UI contract.
 */
export interface ModelConfig {
  /** Model context window in tokens. When unset the provider-level fallback applies. */
  contextWindow?: number
}

/** Per-provider configuration (model parameters are independent per provider). */
export interface ProviderConfig {
  /** Optional API key; omitted when empty to keep persisted settings clean. */
  apiKey?: string
  /** Whether the provider is usable/selectable. Defaults to `true` when unset. */
  enabled?: boolean
  model: string
  baseUrl: string
  /** OpenAI adapter mode: `responses` (default) or `chat` fallback. Only meaningful for the `openai` provider. */
  openaiApiMode?: 'responses' | 'chat'
  /** Provider-level context window in tokens; fallback for models without an explicit per-model config. */
  contextWindow?: number
  /** Per-model parameters keyed by model id (required, defaults to `{}`). */
  models: Record<string, ModelConfig>
}

/** Agent write-permission mode. */
export type AgentMode = 'read-only' | 'chat-only' | 'workspace-write'

export type ChatMessageType = 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error' | 'thinking'

export type ReplySpeedUnit = 'tokens' | 'chars'

/** Metadata shown below an assistant reply after it finishes. */
export interface AssistantMeta {
  /** Model id that produced the reply. */
  model: string
  /** Wall-clock time spent on the whole reply, including tool iterations. */
  durationMs: number
  /** True when the reply was interrupted by the stop button. */
  aborted?: boolean
  /** Reply speed. Uses tokens/s when token usage is available, else chars/s. */
  speed?: number
  speedUnit?: ReplySpeedUnit
  outputTokens?: number
  chars?: number
}

export interface ChatMessage {
  id: string
  type: ChatMessageType
  /** text content for user/assistant/error messages */
  text?: string
  /** tool name for tool_call/tool_result messages */
  toolName?: string
  /** tool input parameters (tool_call) */
  toolInput?: Record<string, unknown>
  /** tool result payload (tool_result) */
  toolResult?: ToolResult
  /** links a tool_result to its tool_call */
  toolCallId?: string
  isError?: boolean
  timestamp: number
  /** Completion metadata for assistant messages. */
  meta?: AssistantMeta
}

export interface ToolResult {
  /** markdown/plain text result */
  content: string
  isError?: boolean
}

/** JSON Schema based tool definition shared with providers */
export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

/** Builds a compact human-readable summary from a tool call's input and/or result. */
export type ToolSummary = (input: Record<string, unknown>, result?: ToolResult) => string

/** Unified content block returned by every provider adapter */
export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
  is_error?: boolean
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop'

export interface UnifiedResponse {
  content: ContentBlock[]
  stopReason: StopReason
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

export interface SelectionScope {
  text: string
  filePath?: string
}

export interface PluginSettings {
  provider: ApiProvider
  maxIterations: number
  /** Agent write-permission mode: `read-only` blocks all file access, `chat-only` disables every vault/editor file tool (reads and writes), `workspace-write` is full access (default). */
  mode?: AgentMode
  /** Per-provider configuration; each provider keeps its own model parameters. */
  providers: Record<ApiProvider, ProviderConfig>
  /** Simple glob patterns (one per line) for vault paths the agent must never list, read or modify. Built-in rules (.git, node_modules, *.apikey) always apply on top of this. */
  forbiddenPaths?: string
}

/** Returns the configuration of the currently active provider (falls back to `ollama`). */
export function getActiveConfig(settings: PluginSettings): ProviderConfig {
  return settings.providers[settings.provider] ?? settings.providers.ollama
}

/** Conversation format used by provider adapters */
export interface ApiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface AgentResult {
  text: string
  iterations: number
  aborted: boolean
  usage?: { inputTokens: number; outputTokens: number }
  /** Model id used for this agent run. */
  model?: string
  /** Total time spent waiting on model API responses, excluding tool execution. */
  apiDurationMs?: number
}

/** Options accepted by the `create_subagent` tool. */
export interface SubagentOptions {
  /** Independent task description handed to the sub agent (required). */
  task: string
  /** Optional extra system prompt appended after the default sub-agent instructions. */
  system?: string
  /** Tool whitelist; may only NARROW what the current mode allows, never widen it. */
  tools?: string[]
  /** Max tool-call rounds inside the sub loop (default 10). */
  maxIterations?: number
  /** Overall wall-clock budget in ms (default 300000 = 5 minutes). */
  timeoutMs?: number
}

/** Result returned by `create_subagent` / produced by `runSubagent`. */
export interface SubagentResult {
  /** Final assistant text of the sub agent. */
  text: string
  iterations: number
  aborted: boolean
  usage?: { inputTokens: number; outputTokens: number }
  isError?: boolean
}

export interface AgentCallbacks {
  onText?: (text: string) => void
  /** reasoning / chain-of-thought text produced by the model */
  onThinking?: (text: string) => void
  onToolCall?: (name: string, input: Record<string, unknown>) => string | void
  onToolResult?: (toolCallId: string, name: string, result: ToolResult) => void
  onError?: (message: string) => void
  /** resolve when the agent wants the user to answer one or more questions */
  onAskUser?: (questions: AskUserQuestionItem[]) => Promise<AskUserAnswerItem[]>
  onThinkingChange?: (thinking: boolean) => void
  /** Called with each API response's token usage during an agent loop. */
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void
}

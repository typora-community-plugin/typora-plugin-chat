/**
 * Shared type definitions for Typora AI Chat plugin.
 */


export type ApiProvider = 'anthropic' | 'openai' | 'ollama' | 'custom'

/** Agent write-permission mode. */
export type AgentMode = 'read-only' | 'workspace-write'

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
  apiKey: string
  model: string
  maxIterations: number
  baseUrl: string
  /** OpenAI adapter mode: `responses` (default) or `chat` fallback */
  openaiApiMode?: 'responses' | 'chat'
  /** Agent write-permission mode: `read-only` hides/blocks file-mutating tools. */
  mode?: AgentMode
  /** Optional model context window in tokens; when unset it is auto-detected. */
  contextWindow?: number
  /** Optional per-model context window overrides in tokens. */
  contextWindows?: Record<string, number>
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

/** Actions supported by the `subbrowser` tool. */
export type SubBrowserAction = 'open' | 'extract' | 'status' | 'close'

/** Options accepted by the `subbrowser` tool. */
export interface SubBrowserOptions {
  /** Which action to perform (required). */
  action: SubBrowserAction
  /** The http(s) URL to open (`open` requires this). */
  url?: string
  /** CSS selector for scoped extraction; omitted = whole body (`extract`). */
  selector?: string
  /** Max characters returned by `extract` (default 30000, clamped 1..200000). */
  max_chars?: number
  /** Load/extract timeout in ms (default 15000). */
  timeout_ms?: number
}

/** Structured result of a `subbrowser` call. */
export interface SubBrowserResult {
  status: 'idle' | 'loading' | 'loaded' | 'error' | 'closed'
  title?: string
  url?: string
  /** Final URL after redirects (when readable). */
  finalUrl?: string
  /** Extracted page body text (whole or selector-scoped), truncated. */
  content?: string
  /** Whether the extracted content was truncated to max_chars. */
  truncated?: boolean
  isError?: boolean
  error?: string
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
  onAskUser?: (questions: import('@/agent/tools/system/ask-user').AskUserQuestionItem[]) => Promise<import('@/agent/tools/system/ask-user').AskUserAnswerItem[]>
  onThinkingChange?: (thinking: boolean) => void
  /** Called with each API response's token usage during an agent loop. */
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void
}

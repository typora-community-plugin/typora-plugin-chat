/**
 * Shared type definitions for Typora AI Chat plugin.
 */


export type ApiProvider = 'anthropic' | 'openai' | 'ollama' | 'custom'

export type ChatMessageType = 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'error' | 'thinking'

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
}

export interface AgentCallbacks {
  onText?: (text: string) => void
  /** reasoning / chain-of-thought text produced by the model */
  onThinking?: (text: string) => void
  onToolCall?: (name: string, input: Record<string, unknown>) => string | void
  onToolResult?: (toolCallId: string, name: string, result: ToolResult) => void
  onError?: (message: string) => void
  /** resolve when the agent wants the user to answer a question */
  onAskUser?: (question: string) => Promise<string>
  onThinkingChange?: (thinking: boolean) => void
}

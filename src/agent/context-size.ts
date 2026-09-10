import type { ApiMessage, ContentBlock, ProviderConfig, ToolDefinition } from '@/config/types'

/**
 * Lightweight token estimator used only for the context-usage indicator.
 *
 * It is intentionally approximate: there is no provider tokenizer in the
 * plugin. CJK characters are counted as one token each and everything else is
 * approximated at roughly four characters per token. JSON tool schemas and
 * tool inputs are also included because they occupy context window space.
 */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g

export function estimateTokens(text: string): number {
  if (!text) return 0
  const chars = Array.from(text)
  const cjkCount = (text.match(CJK_RE) ?? []).length
  const otherCount = chars.length - cjkCount
  return cjkCount + Math.ceil(otherCount / 4)
}

export function estimateContentBlockTokens(block: ContentBlock): number {
  switch (block.type) {
    case 'text':
    case 'thinking':
      return estimateTokens(block.text ?? '')
    case 'tool_use':
      return estimateTokens(block.name ?? '') + estimateTokens(JSON.stringify(block.input ?? {}))
    case 'tool_result':
      return estimateTokens(block.content ?? '') + (block.is_error ? 2 : 0)
    default:
      return 0
  }
}

export function estimateMessageTokens(message: ApiMessage): number {
  if (typeof message.content === 'string') return estimateTokens(message.content)
  return message.content.reduce((sum, block) => sum + estimateContentBlockTokens(block), 0)
}

export function estimateToolTokens(tools: ToolDefinition[]): number {
  return tools.reduce((sum, tool) => sum + estimateTokens(JSON.stringify(tool)), 0)
}

export function estimateRequestTokens(messages: ApiMessage[], tools: ToolDefinition[] = []): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0) + estimateToolTokens(tools)
}

const DEFAULT_CONTEXT_WINDOW = 128000

/**
 * Resolve the model's context window in tokens.
 *
 * Priority: per-model config > built-in model-name hints > default fallback.
 * The fallback is intentionally conservative for unknown local models.
 */
export function resolveContextWindow(model: string, config?: ProviderConfig): number {
  const modelOverride = config?.models?.[model]?.contextWindow
  if (modelOverride && modelOverride > 0) return modelOverride

  const id = model.toLowerCase()
  if (id.includes('claude')) return id.includes('haiku') ? 200000 : 1000000
  if (id.startsWith('gpt-5.4') || id.startsWith('gpt-5.5') || id.startsWith('gpt-5.6') || id.startsWith('gpt-6')) return 1050000
  if (id.includes('gpt-5')) return 400000
  if (id.includes('gpt-4.1')) return 1047576
  if (id.includes('gpt-4o') || id.includes('gpt-4-turbo')) return 128000
  if (id.startsWith('gpt-3.5')) return 16385
  if (id.includes('o1') || id.includes('o3') || id.includes('o4')) return 200000
  if (id.includes('gemini')) return 1048576
  if (id.includes('qwen')) return /plus|max|flash|coder/.test(id) ? 1000000 : 262144
  if (id.includes('deepseek')) return id.startsWith('v4') || id.includes('r2') ? 1048576 : 163840
  if (id.includes('llama-4')) return 1048576
  if (id.includes('llama3')) return 131072
  if (id.includes('mistral')) return 262144
  return DEFAULT_CONTEXT_WINDOW
}

import type {
  ApiMessage,
  ContentBlock,
  PluginSettings,
  ToolDefinition,
  UnifiedResponse,
} from '../config/types'
import { extractReasoningContent, httpError } from '../utils/helpers'


function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = (baseUrl || 'http://192.168.137.1:11431/v1').replace(/\/+$/, '')
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`
}

function toChatMessages(messages: ApiMessage[]) {
  const result: Record<string, unknown>[] = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({ role: 'system', content: msg.content })
      continue
    }
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content })
      continue
    }
    const toolCalls: Record<string, unknown>[] = []
    let text = ''
    for (const block of msg.content as ContentBlock[]) {
      if (block.type === 'text') text += block.text ?? ''
      else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        })
      } else if (block.type === 'tool_result') {
        result.push({
          role: 'tool',
          tool_call_id: block.tool_use_id,
          content: block.content ?? '',
        })
      }
    }
    if (text || toolCalls.length) {
      const entry: Record<string, unknown> = { role: msg.role, content: text || null }
      if (toolCalls.length) entry.tool_calls = toolCalls
      result.push(entry)
    }
  }
  return result
}

function toOpenAITools(tools: ToolDefinition[]) {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

function parseToolCalls(toolCalls: Record<string, unknown>[] = []): ContentBlock[] {
  return toolCalls.map(call => {
    const fn = (call.function ?? {}) as Record<string, unknown>
    let input: Record<string, unknown> = {}
    try {
      input = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments ?? {})
    } catch {
      input = {}
    }
    return { type: 'tool_use', id: call.id as string, name: fn.name as string, input }
  })
}

function buildBody(settings: PluginSettings, messages: ApiMessage[], tools: ToolDefinition[], stream: boolean) {
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: toChatMessages(messages),
    stream,
  }
  if (tools.length) {
    body.tools = toOpenAITools(tools)
    body.tool_choice = 'auto'
  }
  return body
}

function buildHeaders(settings: PluginSettings) {
  return {
    'content-type': 'application/json',
    ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
  }
}

/** Non-streaming request used by the agent loop. */
export async function sendOllama(
  settings: PluginSettings,
  messages: ApiMessage[],
  tools: ToolDefinition[] = [],
): Promise<UnifiedResponse> {
  const baseUrl = normalizeBaseUrl(settings.baseUrl)
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(settings),
    body: JSON.stringify(buildBody(settings, messages, tools, false)),
  })

  if (!response.ok) {
    throw httpError(response.status, `Ollama API error ${response.status}: ${await response.text()}`, response.headers)
  }

  const data = await response.json()
  const message = data.choices?.[0]?.message ?? {}
  const content: ContentBlock[] = []

  // Reasoning models (qwen3, deepseek-r1, …) stream chain-of-thought through
  // `reasoning_content`; surface it to the UI, never back to the API.
  const reasoning = extractReasoningContent(message)
  if (reasoning) content.push({ type: 'thinking', text: reasoning })

  if (message.content) content.push({ type: 'text', text: message.content })
  content.push(...parseToolCalls(message.tool_calls))

  const finishReason = data.choices?.[0]?.finish_reason
  const stopReason = finishReason === 'tool_calls' ? 'tool_use' as const
    : finishReason === 'length' ? 'max_tokens' as const
    : 'end_turn' as const

  return {
    content,
    stopReason,
    usage: data.usage
      ? { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0 }
      : undefined,
  }
}

/**
 * SSE streaming request (kept from the original `ai-proxy.ts`).
 * Parses `data:` frames and invokes `onChunk` for every content delta.
 */
export async function streamOllama(
  settings: PluginSettings,
  messages: ApiMessage[],
  onChunk: (chunk: string) => void,
  tools: ToolDefinition[] = [],
): Promise<void> {
  const baseUrl = normalizeBaseUrl(settings.baseUrl)
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(settings),
    body: JSON.stringify(buildBody(settings, messages, tools, true)),
  })

  if (!response.body) {
    throw new Error('Streaming response does not contain a body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      if (!part.startsWith('data: ')) continue
      const jsonStr = part.slice(6)
      if (jsonStr === '[DONE]') return
      try {
        const chunk = JSON.parse(jsonStr)
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) onChunk(delta)
      } catch {
        onChunk('\n[chunk parse failed]')
      }
    }
  }
}

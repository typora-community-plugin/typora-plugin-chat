import type {
  ApiMessage,
  ContentBlock,
  PluginSettings,
  StopReason,
  ToolDefinition,
  UnifiedResponse,
} from '../config/types'
import { httpError } from '../utils/helpers'


function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = (baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`
}

function toOpenAITools(tools: ToolDefinition[]) {
  return tools.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}

function toOpenAIMessages(messages: ApiMessage[]): Record<string, unknown>[] {
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

export async function sendOpenAIResponses(
  settings: PluginSettings,
  messages: ApiMessage[],
  tools: ToolDefinition[] = [],
  previousResponseId?: string,
): Promise<UnifiedResponse> {
  const baseUrl = normalizeBaseUrl(settings.baseUrl)
  const systemText = messages
    .filter(m => m.role === 'system')
    .map(m => (typeof m.content === 'string' ? m.content : ''))
    .join('\n')
  const input: Record<string, unknown>[] = []
  for (const m of messages.filter(m => m.role !== 'system')) {
    if (typeof m.content === 'string') {
      input.push({ role: m.role, content: m.content })
      continue
    }
    let text = ''
    for (const block of m.content as ContentBlock[]) {
      if (block.type === 'text') {
        text += block.text ?? ''
      } else if (block.type === 'tool_use') {
        if (text.trim()) input.push({ role: m.role, content: text })
        text = ''
        input.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        })
      } else if (block.type === 'tool_result') {
        input.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output: block.content ?? '',
        })
      }
    }
    if (text.trim()) input.push({ role: m.role, content: text })
  }

  const body: Record<string, unknown> = {
    model: settings.model,
    input,
    store: false,
  }
  if (systemText) body.instructions = systemText
  if (tools.length) body.tools = toOpenAITools(tools)
  if (previousResponseId) body.previous_response_id = previousResponseId

  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw httpError(response.status, `OpenAI Responses API error ${response.status}: ${await response.text()}`, response.headers)
  }

  const data = await response.json()
  const content: ContentBlock[] = []
  for (const item of data.output ?? []) {
    if (item.type === 'message') {
      for (const part of item.content ?? []) {
        if (part.type === 'output_text') content.push({ type: 'text', text: part.text ?? '' })
      }
    } else if (item.type === 'function_call') {
      let input: Record<string, unknown> = {}
      try {
        input = typeof item.arguments === 'string' ? JSON.parse(item.arguments) : (item.arguments ?? {})
      } catch {
        input = {}
      }
      content.push({ type: 'tool_use', id: item.call_id, name: item.name, input })
    }
  }

  const stopReason: StopReason = content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn'
  return {
    content,
    stopReason,
    usage: data.usage
      ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0 }
      : undefined,
  }
}

export async function sendOpenAIChat(
  settings: PluginSettings,
  messages: ApiMessage[],
  tools: ToolDefinition[] = [],
): Promise<UnifiedResponse> {
  const baseUrl = normalizeBaseUrl(settings.baseUrl)
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: toOpenAIMessages(messages),
  }
  if (tools.length) {
    body.tools = toOpenAITools(tools)
    body.tool_choice = 'auto'
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw httpError(response.status, `OpenAI Chat API error ${response.status}: ${await response.text()}`, response.headers)
  }

  const data = await response.json()
  const message = data.choices?.[0]?.message ?? {}
  const content: ContentBlock[] = []
  if (message.content) content.push({ type: 'text', text: message.content })
  content.push(...parseToolCalls(message.tool_calls))

  const finishReason = data.choices?.[0]?.finish_reason
  const stopReason: StopReason =
    finishReason === 'tool_calls' ? 'tool_use' :
    finishReason === 'length' ? 'max_tokens' : 'end_turn'

  return {
    content,
    stopReason,
    usage: data.usage
      ? { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0 }
      : undefined,
  }
}

export async function sendOpenAI(
  settings: PluginSettings,
  messages: ApiMessage[],
  tools: ToolDefinition[] = [],
): Promise<UnifiedResponse> {
  if (settings.openaiApiMode === 'chat') return sendOpenAIChat(settings, messages, tools)
  return sendOpenAIResponses(settings, messages, tools)
}

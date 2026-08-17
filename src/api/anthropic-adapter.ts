import type {
  ApiMessage,
  ContentBlock,
  PluginSettings,
  StopReason,
  ToolDefinition,
  UnifiedResponse,
} from '@/config/types'
import { httpError } from '@/utils/helpers'


function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = (baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`
}

function convertMessages(messages: ApiMessage[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = []
  for (const msg of messages) {
    if (msg.role === 'system') continue // handled via system block
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content })
      continue
    }
    const blocks = (msg.content as ContentBlock[]).map(block => {
      if (block.type === 'text') return { type: 'text', text: block.text ?? '' }
      if (block.type === 'tool_use') {
        return { type: 'tool_use', id: block.id, name: block.name, input: block.input ?? {} }
      }
      return {
        type: 'tool_result',
        tool_use_id: block.tool_use_id,
        content: block.content ?? '',
        is_error: block.is_error ?? false,
      }
    })
    result.push({ role: msg.role, content: blocks })
  }
  return result
}

function mapStopReason(reason: string): StopReason {
  switch (reason) {
    case 'end_turn': return 'end_turn'
    case 'tool_use': return 'tool_use'
    case 'max_tokens': return 'max_tokens'
    default: return 'stop'
  }
}

export async function sendAnthropic(
  settings: PluginSettings,
  messages: ApiMessage[],
  tools: ToolDefinition[] = [],
): Promise<UnifiedResponse> {
  const baseUrl = normalizeBaseUrl(settings.baseUrl)
  const systemText = messages
    .filter(m => m.role === 'system')
    .map(m => (typeof m.content === 'string' ? m.content : ''))
    .join('\n')

  const anthropicTools = tools.map((tool, index) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
    ...(index === tools.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
  }))

  const body: Record<string, unknown> = {
    model: settings.model,
    max_tokens: 16384,
    messages: convertMessages(messages),
  }
  if (systemText) {
    body.system = [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }]
  }
  if (anthropicTools.length) body.tools = anthropicTools

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw httpError(response.status, `Anthropic API error ${response.status}: ${await response.text()}`, response.headers)
  }

  const data = await response.json()
  const content: ContentBlock[] = []
  for (const block of data.content ?? []) {
    if (block.type === 'text') {
      content.push({ type: 'text', text: block.text ?? '' })
    } else if (block.type === 'tool_use') {
      content.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input ?? {} })
    } else if (block.type === 'thinking') {
      // Surface the model's chain of thought to the UI. Reasoning tokens are
      // already counted in usage below. `redacted_thinking` blocks carry no
      // readable text and are skipped.
      const thinkingText = block.thinking ?? ''
      if (thinkingText.trim()) content.push({ type: 'thinking', text: thinkingText })
    }
  }

  return {
    content,
    stopReason: mapStopReason(data.stop_reason ?? 'end_turn'),
    usage: data.usage
      ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
      : undefined,
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendAnthropic } from '../../src/api/anthropic-adapter'
import type { ApiMessage, PluginSettings } from '../../src/config/types'


const settings: PluginSettings = {
  provider: 'anthropic',
  apiKey: 'test-key',
  model: 'claude-sonnet-4-6',
  maxIterations: 20,
  baseUrl: 'https://api.anthropic.com',
}

const messages: ApiMessage[] = [
  { role: 'system', content: 'You are a test assistant.' },
  { role: 'user', content: 'Hello' },
]

describe('anthropic adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('parses text and tool_use content blocks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 'toolu_1', name: 'read_document', input: { path: 'a.md' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await sendAnthropic(settings, messages, [
      { name: 'read_document', description: 'read', parameters: { type: 'object', properties: {} } },
    ])

    expect(response.stopReason).toBe('tool_use')
    expect(response.content).toHaveLength(2)
    expect(response.content[0]).toEqual({ type: 'text', text: 'Let me check.' })
    expect(response.content[1]).toMatchObject({ type: 'tool_use', name: 'read_document' })
    expect(response.usage).toEqual({ inputTokens: 10, outputTokens: 5 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const body = JSON.parse(init.body)
    expect(body.system[0]).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } })
    expect(body.tools[0].name).toBe('read_document')
  })

  it('maps end_turn stop reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        content: [{ type: 'text', text: 'Done.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 3, output_tokens: 2 },
      }),
    }))

    const response = await sendAnthropic(settings, messages)

    expect(response.stopReason).toBe('end_turn')
    expect(response.content).toEqual([{ type: 'text', text: 'Done.' }])
  })

  it('surfaces thinking blocks as thinking content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        content: [
          { type: 'thinking', thinking: 'Let me reason about this.', signature: 'sig_1' },
          { type: 'text', text: 'Answer.' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 3 },
      }),
    }))

    const response = await sendAnthropic(settings, messages)

    expect(response.content).toEqual([
      { type: 'thinking', text: 'Let me reason about this.' },
      { type: 'text', text: 'Answer.' },
    ])
  })

  it('drops redacted_thinking blocks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        content: [
          { type: 'redacted_thinking', data: 'encrypted', signature: 'sig_2' },
          { type: 'text', text: 'Ok.' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 3 },
      }),
    }))

    const response = await sendAnthropic(settings, messages)

    expect(response.content).toEqual([{ type: 'text', text: 'Ok.' }])
  })
})

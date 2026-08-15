import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendOpenAIChat, sendOpenAIResponses } from '../../src/api/openai-adapter'
import type { ApiMessage, PluginSettings } from '../../src/config/types'


const settings: PluginSettings = {
  provider: 'openai',
  apiKey: 'test-key',
  model: 'gpt-5.2',
  maxIterations: 20,
  baseUrl: 'https://api.openai.com',
  openaiApiMode: 'responses',
}

const messages: ApiMessage[] = [
  { role: 'system', content: 'You are a test assistant.' },
  { role: 'user', content: 'Hello' },
]

describe('openai adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('parses Responses API output including function calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'Calling a tool.' }] },
          { type: 'function_call', call_id: 'call_1', name: 'list_files', arguments: '{"folder":"notes"}' },
        ],
        usage: { input_tokens: 12, output_tokens: 7 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await sendOpenAIResponses(settings, messages, [
      { name: 'list_files', description: 'list', parameters: { type: 'object', properties: {} } },
    ])

    expect(response.stopReason).toBe('tool_use')
    expect(response.content).toHaveLength(2)
    expect(response.content[1]).toMatchObject({ type: 'tool_use', name: 'list_files', input: { folder: 'notes' } })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses')
  })

  it('parses Chat Completions API tool_calls format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [{
              id: 'call_2',
              type: 'function',
              function: { name: 'read_document', arguments: '{"path":"b.md"}' },
            }],
          },
        }],
        usage: { prompt_tokens: 9, completion_tokens: 4 },
      }),
    }))

    const response = await sendOpenAIChat(settings, messages, [
      { name: 'read_document', description: 'read', parameters: { type: 'object', properties: {} } },
    ])

    expect(response.stopReason).toBe('tool_use')
    expect(response.content[0]).toMatchObject({ type: 'tool_use', name: 'read_document', input: { path: 'b.md' } })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendOpenAIChat, sendOpenAIResponses } from '../../src/api/openai-adapter'
import { sendAnthropic } from '../../src/api/anthropic-adapter'
import type { ApiMessage, ProviderConfig, ToolDefinition } from '../../src/config/types'

const tool: ToolDefinition = { name: 'read_document', description: 'read', parameters: { type: 'object', properties: {} } }

const toolTurn: ApiMessage[] = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'read a.md' },
  {
    role: 'assistant',
    content: [
      { type: 'thinking', text: 'I should read the file.' },
      { type: 'tool_use', id: 'call_1', name: 'read_document', input: { path: 'a.md' } },
    ],
  },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '# A' }] },
]

function okFetch(json: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => json })
  vi.stubGlobal('fetch', fn)
  return fn
}

const sentBody = (fn: ReturnType<typeof vi.fn>) => JSON.parse(fn.mock.calls[0][1].body)

describe('request shapes', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('Chat Completions nests tool definitions under `function`', async () => {
    const fetchMock = okFetch({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] })
    const config: ProviderConfig = { apiKey: 'k', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' }

    await sendOpenAIChat(config, [{ role: 'user', content: 'hi' }], [tool])

    expect(sentBody(fetchMock).tools).toEqual([
      { type: 'function', function: { name: 'read_document', description: 'read', parameters: { type: 'object', properties: {} } } },
    ])
  })

  it('Responses API keeps the flat tool shape', async () => {
    const fetchMock = okFetch({ output: [], status: 'completed' })
    const config: ProviderConfig = { apiKey: 'k', model: 'gpt', baseUrl: 'https://api.openai.com', openaiApiMode: 'responses' }

    await sendOpenAIResponses(config, [{ role: 'user', content: 'hi' }], [tool])

    expect(sentBody(fetchMock).tools[0]).toEqual({ type: 'function', name: 'read_document', description: 'read', parameters: { type: 'object', properties: {} } })
  })

  it('Chat Completions echoes reasoning_content on the tool-calling assistant message', async () => {
    const fetchMock = okFetch({ choices: [{ finish_reason: 'stop', message: { content: 'done' } }] })
    const config: ProviderConfig = { apiKey: 'k', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' }

    await sendOpenAIChat(config, toolTurn, [tool])

    const msgs = sentBody(fetchMock).messages
    const assistant = msgs.find((m: Record<string, unknown>) => m.role === 'assistant')
    expect(assistant).toMatchObject({ reasoning_content: 'I should read the file.', tool_calls: [{ id: 'call_1' }] })
    expect(msgs.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_1', content: '# A' })
  })

  it('Chat Completions echoes reasoning_content on plain assistant replies too', async () => {
    const fetchMock = okFetch({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] })
    const config: ProviderConfig = { apiKey: 'k', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' }

    await sendOpenAIChat(config, [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'thinking', text: 'greet back' }, { type: 'text', text: 'Hello!' }] },
      { role: 'user', content: 'again' },
    ], [tool])

    const assistant = sentBody(fetchMock).messages.find((m: Record<string, unknown>) => m.role === 'assistant')
    expect(assistant).toEqual({ role: 'assistant', content: 'Hello!', reasoning_content: 'greet back' })
  })

  it('Anthropic drops unsigned thinking blocks from history', async () => {
    const fetchMock = okFetch({ content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })
    const config: ProviderConfig = { apiKey: 'k', model: 'claude', baseUrl: 'https://api.anthropic.com' }

    await sendAnthropic(config, toolTurn, [tool])

    const assistant = sentBody(fetchMock).messages.find((m: Record<string, unknown>) => m.role === 'assistant')
    expect(assistant.content).toEqual([{ type: 'tool_use', id: 'call_1', name: 'read_document', input: { path: 'a.md' } }])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendOllama, streamOllama } from '../../src/api/ollama-adapter'
import type { ApiMessage, ProviderConfig } from '../../src/config/types'


const config: ProviderConfig = {
  model: 'qwen3.6-35b-a3b',
  baseUrl: 'http://localhost:11431/v1',
}

const messages: ApiMessage[] = [{ role: 'user', content: 'Hi' }]

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

describe('ollama adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('parses non-streaming chat completion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{ finish_reason: 'stop', message: { content: 'Hello back' } }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }),
    }))

    const response = await sendOllama(config, messages)

    expect(response.stopReason).toBe('end_turn')
    expect(response.content).toEqual([{ type: 'text', text: 'Hello back' }])
  })

  it('captures reasoning_content from reasoning models', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{
          finish_reason: 'stop',
          message: { content: 'Hello back', reasoning_content: 'Thinking step.' },
        }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }),
    }))

    const response = await sendOllama(config, messages)

    expect(response.content).toEqual([
      { type: 'thinking', text: 'Thinking step.' },
      { type: 'text', text: 'Hello back' },
    ])
  })

  it('parses SSE streaming chunks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: sseStream([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    }))

    const chunks: string[] = []
    await streamOllama(config, messages, (chunk) => chunks.push(chunk))

    expect(chunks).toEqual(['Hel', 'lo'])
  })
})

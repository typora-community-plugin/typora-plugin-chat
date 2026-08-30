import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendMessage } from '../../src/api/client'
import type { ApiMessage, PluginSettings } from '../../src/config/types'


const settings: PluginSettings = {
  provider: 'ollama',
  maxIterations: 20,
  providers: {
    anthropic: { baseUrl: '', model: '' },
    openai: { baseUrl: '', model: '', openaiApiMode: 'responses' },
    ollama: { baseUrl: 'http://localhost:11431/v1', model: 'test-model' },
    custom: { baseUrl: '', model: '' },
  },
}

const messages: ApiMessage[] = [{ role: 'user', content: 'Hi' }]

describe('api client dispatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('retries HTTP 429 with exponential backoff then succeeds', async () => {
    const success = {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }], usage: {} }),
    }
    const rateLimited = {
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '1' }),
      text: async () => 'rate limited',
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(success)
    vi.stubGlobal('fetch', fetchMock)

    const promise = sendMessage(settings, messages)
    const result = await vi.runAllTimersAsync().then(() => promise)

    expect(result.stopReason).toBe('end_turn')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws after max 429 retries', async () => {
    const rateLimited = {
      ok: false,
      status: 429,
      headers: new Headers(),
      text: async () => 'rate limited',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimited))

    const promise = sendMessage(settings, messages)
    // Attach the assertion up front so the rejection is never "unhandled"
    // while fake timers advance the backoff sleeps.
    const assertion = expect(promise).rejects.toThrow()
    await vi.runAllTimersAsync()
    await assertion
  })
})

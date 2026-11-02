import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/api/client', () => ({ sendMessage: vi.fn() }))

const settingsState = vi.hoisted(() => ({
  value: {
    provider: 'ollama' as const,
    maxIterations: 20,
    providers: { ollama: { baseUrl: 'http://localhost/v1', model: 'test-model' } },
  },
}))
vi.mock('../../src/config/settings', () => ({ settingsManager: { get: () => settingsState.value } }))

// Simulate preparation I/O that never finishes (e.g. a huge directory walk).
vi.mock('../../src/agent/request', () => ({ buildRequestParts: vi.fn(() => new Promise(() => {})) }))

import { sendMessage } from '../../src/api/client'
import { abortAgentLoop, executeAgentLoop } from '../../src/agent/loop'

describe('agent loop: stop during request preparation', () => {
  it('resolves as aborted without sending a request', async () => {
    const run = executeAgentLoop('hello')
    setTimeout(() => abortAgentLoop(), 20)

    const result = await Promise.race([
      run,
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 1000)),
    ])

    expect(result).not.toBe('timeout')
    expect(result).toMatchObject({ aborted: true, iterations: 0 })
    expect(sendMessage).not.toHaveBeenCalled()
  })
})

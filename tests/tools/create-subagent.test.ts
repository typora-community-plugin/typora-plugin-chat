import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, UnifiedResponse } from '../../src/config/types'

vi.mock('../../src/api/client', () => ({ sendMessage: vi.fn() }))
vi.mock('../../src/config/settings', () => ({
  settingsManager: { get: () => ({ provider: 'ollama', apiKey: '', model: 'm', maxIterations: 20, baseUrl: '', mode: 'workspace-write' }) },
}))
vi.mock('../../src/agent/tools/registry', () => ({
  toolDefinitions: [
    { name: 'read_document', description: '', parameters: { type: 'object', properties: {} } },
    { name: 'create_subagent', description: '', parameters: { type: 'object', properties: {} } },
  ] as ToolDefinition[],
}))

import { sendMessage } from '../../src/api/client'
import { executeCreateSubagent, createSubagentSchema, summarizeCreateSubagent, setCreateSubagentOverrides } from '../../src/agent/tools/system/create-subagent'

function textResponse(text: string): UnifiedResponse {
  return { content: [{ type: 'text', text }], stopReason: 'end_turn', usage: { inputTokens: 5, outputTokens: 6 } }
}

describe('create_subagent tool', () => {
  beforeEach(() => {
    vi.mocked(sendMessage).mockReset()
    setCreateSubagentOverrides(null)
  })

  afterEach(() => {
    setCreateSubagentOverrides(null)
  })

  it('exposes a schema with task as the only required parameter', () => {
    expect(createSubagentSchema.name).toBe('create_subagent')
    expect(createSubagentSchema.parameters.required).toEqual(['task'])
    const props = createSubagentSchema.parameters.properties as Record<string, unknown>
    expect(Object.keys(props).sort()).toEqual(['maxIterations', 'system', 'task', 'timeoutMs', 'tools'])
  })

  it('requires a non-empty task', async () => {
    const result = await executeCreateSubagent({ task: '' }, {})
    expect(result.isError).toBe(true)
    expect(result.content).toContain('"task" is required')
  })

  it('runs the sub agent and formats its result with status + usage', async () => {
    vi.mocked(sendMessage).mockResolvedValue(textResponse('The answer is 42.'))
    const executeToolFn = vi.fn()
    setCreateSubagentOverrides({ sendMessageFn: sendMessage as never, executeToolFn } as never)

    const result = await executeCreateSubagent(
      { task: 'Answer the question', maxIterations: 7 },
      { turnId: 'turn-abc' },
    )

    expect(result.isError).toBeFalsy()
    expect(result.content).toContain('[Sub-agent result]')
    expect(result.content).toContain('The answer is 42.')
    expect(result.content).toContain('completed after 1 iteration(s)')
    expect(result.content).toContain('5 in / 6 out tokens')

    // The sub agent's tool executor receives the parent turnId so its writes join /undo.
    if (executeToolFn.mock.calls.length) {
      expect(executeToolFn.mock.calls[0][2]).toMatchObject({ turnId: 'turn-abc' })
    }
  })

  it('reports abort when the parent signal is set', async () => {
    const executeToolFn = vi.fn()
    // The mock "API" completes, but the sub loop sees abortSignal.aborted on entry.
    vi.mocked(sendMessage).mockResolvedValue(textResponse('never reached'))
    setCreateSubagentOverrides({ sendMessageFn: sendMessage as never, executeToolFn } as never)

    const result = await executeCreateSubagent(
      { task: 't' },
      { abortSignal: { aborted: true } },
    )

    expect(result.isError).toBe(true)
    expect(result.content).toContain('STATUS: ABORTED')
  })

  it('summarizes input and result', () => {
    expect(summarizeCreateSubagent({ task: 'Research X' })).toBe('Research X')
    expect(
      summarizeCreateSubagent(
        { task: 'Research X' },
        { content: '[Sub-agent result]\nSTATUS: completed after 3 iteration(s), 1 in / 2 out tokens\n\ndone' },
      ),
    ).toBe('Research X — 3 iteration(s)')
    expect(
      summarizeCreateSubagent({ task: 'X' }, { content: 'STATUS: ABORTED', isError: true }),
    ).toContain('failed/aborted')
  })
})

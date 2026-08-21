import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, UnifiedResponse } from '../../src/config/types'
import { runSubagent, resolveSubagentTools } from '../../src/agent/subagent'

vi.mock('../../src/api/client', () => ({
  sendMessage: vi.fn(),
}))

const settingsState = vi.hoisted(() => ({
  value: {
    provider: 'ollama' as const,
    apiKey: '',
    model: 'test-model',
    maxIterations: 20,
    baseUrl: 'http://localhost/v1',
    mode: 'workspace-write' as const,
  },
}))

vi.mock('../../src/config/settings', () => ({
  settingsManager: { get: () => settingsState.value },
}))

// Registry with a minimal but representative tool set (incl. write + delegation tools).
vi.mock('../../src/agent/tools/registry', () => ({
  toolDefinitions: [
    { name: 'read_document', description: '', parameters: { type: 'object', properties: {} } },
    { name: 'edit_document', description: '', parameters: { type: 'object', properties: {} } },
    { name: 'create_file', description: '', parameters: { type: 'object', properties: {} } },
    { name: 'ask_user', description: '', parameters: { type: 'object', properties: {} } },
    { name: 'use_skill', description: '', parameters: { type: 'object', properties: {} } },
    { name: 'create_subagent', description: '', parameters: { type: 'object', properties: {} } },
  ] as ToolDefinition[],
}))

import { sendMessage } from '../../src/api/client'

function textResponse(text: string): UnifiedResponse {
  return { content: [{ type: 'text', text }], stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 2 } }
}

function toolResponse(name = 'read_document'): UnifiedResponse {
  return {
    content: [{ type: 'tool_use', id: 't1', name, input: {} }],
    stopReason: 'tool_use',
    usage: { inputTokens: 3, outputTokens: 4 },
  }
}

describe('runSubagent', () => {
  beforeEach(() => {
    vi.mocked(sendMessage).mockReset()
    settingsState.value = { ...settingsState.value, mode: 'workspace-write' }
  })

  it('runs an isolated loop and returns text + usage', async () => {
    const executeToolFn = vi.fn().mockResolvedValue({ content: 'ok' })
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(toolResponse())
      .mockResolvedValueOnce(textResponse('Final answer.'))

    const result = await runSubagent(
      { task: 'Do the thing' },
      {},
      {},
      { executeToolFn } as never,
    )

    expect(result.text).toBe('Final answer.')
    expect(result.iterations).toBe(2)
    expect(result.aborted).toBe(false)
    expect(result.isError).toBeFalsy()
    expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 6 })
    expect(executeToolFn).toHaveBeenCalledWith('read_document', {}, expect.objectContaining({ turnId: undefined }))

    // Isolation: the API conversation starts with only the delegated task.
    const firstMessages = vi.mocked(sendMessage).mock.calls[0][1] as Array<{ role: string; content: unknown }>
    expect(firstMessages.length).toBe(2)
    expect(firstMessages[0].role).toBe('system')
    expect(String(firstMessages[1].content)).toContain('[Delegated task from the parent agent]')
  })

  it('appends a custom system prompt', async () => {
    vi.mocked(sendMessage).mockResolvedValue(textResponse('ok'))
    await runSubagent({ task: 't', system: 'Always be brief.' }, {}, {})
    const messages = vi.mocked(sendMessage).mock.calls[0][1] as Array<{ role: string; content: unknown }>
    expect(String(messages[0].content)).toContain('You are a SUB-AGENT')
    expect(String(messages[0].content)).toContain('Always be brief.')
  })

  it('never exposes create_subagent or ask_user to the sub agent', async () => {
    vi.mocked(sendMessage).mockResolvedValue(textResponse('ok'))
    await runSubagent({ task: 't' }, {}, {})
    const tools = (vi.mocked(sendMessage).mock.calls[0][2] ?? []) as ToolDefinition[]
    const names = tools.map((t) => t.name)
    expect(names).not.toContain('create_subagent')
    expect(names).not.toContain('ask_user')
  })

  it('drops write tools in read-only mode (no privilege escalation)', async () => {
    settingsState.value = { ...settingsState.value, mode: 'read-only' }
    vi.mocked(sendMessage).mockResolvedValue(textResponse('ok'))
    await runSubagent({ task: 't', tools: ['edit_document', 'create_file'] }, {}, {})
    const tools = (vi.mocked(sendMessage).mock.calls[0][2] ?? []) as ToolDefinition[]
    expect(tools.length).toBe(0) // whitelist names were all write-only in read-only mode
  })

  it('inherits chat-only: drops all file tools but keeps non-file tools', async () => {
    settingsState.value = { ...settingsState.value, mode: 'chat-only' }
    vi.mocked(sendMessage).mockResolvedValue(textResponse('ok'))
    await runSubagent({ task: 't' }, {}, {})
    const names = ((vi.mocked(sendMessage).mock.calls[0][2] ?? []) as ToolDefinition[]).map((t) => t.name)
    expect(names).not.toContain('edit_document')
    expect(names).not.toContain('create_file')
    expect(names).not.toContain('read_document') // read tools are dropped in chat-only too
    expect(names).toContain('use_skill')
  })

  it('cannot widen a chat-only sub agent to write tools via the whitelist', async () => {
    settingsState.value = { ...settingsState.value, mode: 'chat-only' }
    vi.mocked(sendMessage).mockResolvedValue(textResponse('ok'))
    await runSubagent({ task: 't', tools: ['edit_document', 'create_file'] }, {}, {})
    const tools = (vi.mocked(sendMessage).mock.calls[0][2] ?? []) as ToolDefinition[]
    expect(tools.length).toBe(0) // whitelist can only narrow, never widen
  })

  it('blocks a model-requested write tool at runtime in read-only mode', async () => {
    settingsState.value = { ...settingsState.value, mode: 'read-only' }
    const executeToolFn = vi.fn()
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(toolResponse('edit_document'))
      .mockResolvedValueOnce(textResponse('done'))

    const result = await runSubagent(
      { task: 't', maxIterations: 5 },
      {},
      {},
      { executeToolFn } as never,
    )

    expect(executeToolFn).not.toHaveBeenCalled()
    // The blocked tool produced an error tool_result; the loop then completed.
    const secondMessages = vi.mocked(sendMessage).mock.calls[1][1] as Array<{ role: string; content: unknown }>
    const userMsg = secondMessages.find((m) => m.role === 'user' && Array.isArray(m.content))
    const block = (userMsg!.content as Array<Record<string, unknown>>)[0]!
    expect(String(block.content)).toContain('Blocked')
    expect(result.isError).toBeFalsy()
  })

  it('honors maxIterations and reports the error', async () => {
    vi.mocked(sendMessage).mockResolvedValue(toolResponse())
    const result = await runSubagent({ task: 't', maxIterations: 3 }, {}, {})
    expect(result.iterations).toBe(3)
    expect(result.isError).toBe(true)
    expect(result.text).toContain('stopped after 3 iterations')
  })

  it('stops when the parent abort signal flips mid-run', async () => {
    const signal = { aborted: false }
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(toolResponse()) // round 1 executes a tool, then...
      .mockImplementation(async () => {
        signal.aborted = true // ...the stop button hits before round 2's API call
        return textResponse('partial')
      })

    const result = await runSubagent({ task: 't' }, { abortSignal: signal }, {})

    expect(result.aborted).toBe(true)
    expect(result.isError).toBe(true)
    expect(result.text).toContain('Aborted.')
  })

  it('respects timeoutMs', async () => {
    const t0 = Date.now()
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(toolResponse())
      .mockImplementation(async () => {
        // Let real time elapse well past the budget before answering.
        await new Promise((resolve) => setTimeout(resolve, 30))
        return textResponse('done')
      })

    const result = await runSubagent(
      { task: 't', timeoutMs: 1 },
      {},
      {},
      { now: () => Date.now(), executeToolFn: vi.fn(async () => ({ content: 'ok' })) } as never,
    )

    expect(Date.now() - t0).toBeGreaterThanOrEqual(25) // sanity: real time actually elapsed
    expect(result.aborted).toBe(true)
    expect(result.text.toLowerCase()).toContain('timed out')
  })

  it('returns an error when task is missing', async () => {
    const result = await runSubagent({ task: '   ' }, {}, {})
    expect(result.isError).toBe(true)
    expect(result.text).toContain('"task" is required')
  })

  describe('resolveSubagentTools', () => {
    const allowed: ToolDefinition[] = [
      { name: 'read_document', description: '', parameters: { type: 'object', properties: {} } },
      { name: 'edit_document', description: '', parameters: { type: 'object', properties: {} } },
    ]

    it('returns the allowed list unchanged without a whitelist', () => {
      expect(resolveSubagentTools(allowed)).toHaveLength(2)
      expect(resolveSubagentTools(allowed, [])).toHaveLength(2)
    })

    it('narrows via the whitelist and ignores unknown names', () => {
      const narrowed = resolveSubagentTools(allowed, ['read_document', 'nonexistent'])
      expect(narrowed.map((t) => t.name)).toEqual(['read_document'])
    })
  })
})

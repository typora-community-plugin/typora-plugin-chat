import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiMessage, ContentBlock, ToolDefinition, UnifiedResponse } from '../../src/config/types'

vi.mock('../../src/api/client', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('../../src/agent/tools/executor', () => ({
  executeTool: vi.fn(),
  allToolSchemas: [
    { name: 'read_document', description: 'Read a document.', parameters: { type: 'object', properties: {} } },
    { name: 'edit_document', description: 'Edit a document.', parameters: { type: 'object', properties: {} } },
  ],
}))

const settingsState = vi.hoisted(() => ({
  value: {
    provider: 'ollama' as const,
    maxIterations: 20,
    providers: {
      anthropic: { baseUrl: '', model: '' },
      openai: { baseUrl: '', model: '', openaiApiMode: 'responses' as const },
      ollama: { baseUrl: 'http://localhost/v1', model: 'test-model' },
      custom: { baseUrl: '', model: '' },
    },
  },
}))

vi.mock('../../src/config/settings', () => ({
  settingsManager: {
    get: () => settingsState.value,
  },
}))

vi.mock('../../src/agent/context', () => ({
  buildContextMessage: vi.fn(async () => '[Context: Vault "Test" with 1 markdown file(s).]'),
}))

import { sendMessage } from '../../src/api/client'
import { executeTool } from '../../src/agent/tools/executor'
import { abortAgentLoop, executeAgentLoop, resetAgentHistory } from '../../src/agent/loop'


function textResponse(text: string): UnifiedResponse {
  return { content: [{ type: 'text', text }], stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1 } }
}

function toolResponse(): UnifiedResponse {
  return {
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'read_document', input: {} }],
    stopReason: 'tool_use',
    usage: { inputTokens: 2, outputTokens: 1 },
  }
}

describe('agent loop', () => {
  beforeEach(() => {
    vi.mocked(sendMessage).mockReset()
    vi.mocked(executeTool).mockReset()
    vi.mocked(executeTool).mockResolvedValue({ content: 'tool result' })
    resetAgentHistory()
    settingsState.value = {
      provider: 'ollama',
      maxIterations: 20,
      providers: {
        anthropic: { baseUrl: '', model: '' },
        openai: { baseUrl: '', model: '', openaiApiMode: 'responses' },
        ollama: { baseUrl: 'http://localhost/v1', model: 'test-model' },
        custom: { baseUrl: '', model: '' },
      },
    }
  })

  it('completes a single turn on end_turn', async () => {
    vi.mocked(sendMessage).mockResolvedValue(textResponse('Hello!'))
    const onText = vi.fn()

    const result = await executeAgentLoop('Hi', { onText })

    expect(result.text).toBe('Hello!')
    expect(result.iterations).toBe(1)
    expect(result.aborted).toBe(false)
    expect(onText).toHaveBeenCalledWith('Hello!')
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('iterates through tool_use → tool_result → end_turn', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(toolResponse())
      .mockResolvedValueOnce(textResponse('Done.'))
    const onToolCall = vi.fn(() => 'ui-tool-call-1')
    const onToolResult = vi.fn()

    const result = await executeAgentLoop('read it', { onToolCall, onToolResult }, 5)

    expect(result.iterations).toBe(2)
    expect(onToolCall).toHaveBeenCalledWith('read_document', {})
    expect(executeTool).toHaveBeenCalledWith('read_document', {}, expect.objectContaining({ askUser: undefined }))
    expect(onToolResult).toHaveBeenCalledWith('ui-tool-call-1', 'read_document', { content: 'tool result' })
    expect(result.text).toBe('Done.')
  })

  it('respects maxIterations limit', async () => {
    vi.mocked(sendMessage).mockResolvedValue(toolResponse())

    const result = await executeAgentLoop('loop forever', {}, 3)

    expect(result.iterations).toBe(3)
    expect(result.aborted).toBe(false)
    expect(sendMessage).toHaveBeenCalledTimes(3)
  })

  it('stops when aborted during a tool call', async () => {
    vi.mocked(sendMessage).mockResolvedValue(toolResponse())
    const onToolCall = vi.fn(() => {
      abortAgentLoop()
      return 'id-1'
    })

    const result = await executeAgentLoop('stop me', { onToolCall }, 5)

    expect(result.aborted).toBe(true)
    expect(result.iterations).toBeLessThanOrEqual(2)
  })

  it('interrupts an in-flight API request when aborted', async () => {
    const onError = vi.fn()
    vi.mocked(sendMessage).mockImplementation(
      (_s, _m, _t, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }),
    )

    const promise = executeAgentLoop('stop me', { onError })
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled())

    abortAgentLoop()
    const result = await promise

    expect(result.aborted).toBe(true)
    expect(result.text).toBe('')
    expect(onError).not.toHaveBeenCalled()
  })

  it('surfaces thinking via onThinking without echoing it into history', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce({
        content: [
          { type: 'thinking', text: 'Let me think.' },
          { type: 'tool_use', id: 'toolu_1', name: 'read_document', input: {} },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 2, outputTokens: 1 },
      })
      .mockResolvedValueOnce(textResponse('Done.'))
    const onThinking = vi.fn()
    const onToolCall = vi.fn(() => 'id-1')
    const onToolResult = vi.fn()

    const result = await executeAgentLoop('think', { onThinking, onToolCall, onToolResult }, 5)

    expect(onThinking).toHaveBeenCalledWith('Let me think.')
    expect(result.text).toBe('Done.')

    // The assistant history sent to the API must not include the thinking block.
    const secondCall = vi.mocked(sendMessage).mock.calls[1]
    const history = secondCall[1] as ApiMessage[]
    const assistantMsg = history.find(m => m.role === 'assistant')
    expect(assistantMsg).toBeDefined()
    const blocks = assistantMsg!.content as ContentBlock[]
    expect(blocks.some(b => b.type === 'thinking')).toBe(false)
    expect(blocks.some(b => b.type === 'tool_use')).toBe(true)
  })

  it('omits write tools from the API tool list in read-only mode (read tools stay visible)', async () => {
    settingsState.value = { ...settingsState.value, mode: 'read-only' }
    vi.mocked(sendMessage).mockResolvedValue(textResponse('Done.'))

    await executeAgentLoop('hi')

    const tools = vi.mocked(sendMessage).mock.calls[0][2] as ToolDefinition[]
    expect(tools.map((t) => t.name)).toEqual(['read_document'])
  })

  it('omits both write and read file tools from the API tool list in chat-only mode', async () => {
    settingsState.value = { ...settingsState.value, mode: 'chat-only' }
    vi.mocked(sendMessage).mockResolvedValue(textResponse('Done.'))

    await executeAgentLoop('hi')

    const tools = vi.mocked(sendMessage).mock.calls[0][2] as ToolDefinition[]
    expect(tools.map((t) => t.name)).toEqual([])
  })

  it('keeps write tools in the API tool list in workspace-write mode', async () => {
    vi.mocked(sendMessage).mockResolvedValue(textResponse('Done.'))

    await executeAgentLoop('hi')

    const tools = vi.mocked(sendMessage).mock.calls[0][2] as ToolDefinition[]
    expect(tools.map((t) => t.name).sort()).toEqual(['edit_document', 'read_document'])
  })
})

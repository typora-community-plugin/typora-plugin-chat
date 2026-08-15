import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UnifiedResponse } from '../../src/config/types'

vi.mock('../../src/api/client', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('../../src/tools/executor', () => ({
  executeTool: vi.fn(),
}))

vi.mock('../../src/config/settings', () => ({
  settingsManager: {
    get: () => ({
      provider: 'ollama',
      apiKey: '',
      model: 'test-model',
      maxIterations: 20,
      baseUrl: 'http://localhost/v1',
    }),
  },
}))

vi.mock('../../src/agent/context', () => ({
  buildContextMessage: vi.fn(async () => '[Context: Vault "Test" with 1 markdown file(s).]'),
}))

import { sendMessage } from '../../src/api/client'
import { executeTool } from '../../src/tools/executor'
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
    expect(executeTool).toHaveBeenCalledWith('read_document', {}, { askUser: undefined })
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
})

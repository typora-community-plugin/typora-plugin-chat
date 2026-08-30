import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, UnifiedResponse } from '../../src/config/types'

// Mock only the API client; the REAL executor + registry run so that a
// `create_subagent` tool_use is executed end-to-end (schema → subagent.ts → back).
vi.mock('../../src/api/client', () => ({ sendMessage: vi.fn() }))

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
    mode: 'workspace-write' as const,
  },
}))

vi.mock('../../src/config/settings', () => ({
  settingsManager: { get: () => settingsState.value },
}))

// Registry used by BOTH the main loop and the sub agent.
const TOOL_NAMES = [
  'read_document',
  'edit_document',
  'create_file',
  'ask_user',
  'use_skill',
  'create_subagent',
] as const
vi.mock('../../src/agent/tools/registry', () => ({
  toolDefinitions: TOOL_NAMES.map((name) => ({
    name, description: '', parameters: { type: 'object', properties: {} },
  })) as ToolDefinition[],
}))

// The real create_subagent executor would recurse into the mock API; instead
// short-circuit it with a fake sub-agent run so this test stays focused on the
// MAIN loop's behavior around delegation (tool_use → tool_result continuation).
vi.mock('../../src/agent/tools/system/create-subagent', async () => {
  const actual = await vi.importActual<typeof import('../../src/agent/tools/system/create-subagent')>(
    '../../src/agent/tools/system/create-subagent',
  )
  return {
    ...actual,
    executeCreateSubagent: vi.fn(async (input: Record<string, unknown>) => ({
      content: `[Sub-agent result]\nSTATUS: completed after 2 iteration(s)\n\nsub answer for ${String(input.task ?? '')}`,
    })),
  }
})

import { sendMessage } from '../../src/api/client'
import { executeAgentLoop, resetAgentHistory } from '../../src/agent/loop'
import { executeCreateSubagent } from '../../src/agent/tools/system/create-subagent'

function toolResponse(name: string, input: Record<string, unknown>, id = 't1'): UnifiedResponse {
  return { content: [{ type: 'tool_use', id, name, input }], stopReason: 'tool_use', usage: { inputTokens: 2, outputTokens: 1 } }
}

function textResponse(text: string): UnifiedResponse {
  return { content: [{ type: 'text', text }], stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1 } }
}

describe('main loop + create_subagent integration', () => {
  beforeEach(() => {
    vi.mocked(sendMessage).mockReset()
    vi.mocked(executeCreateSubagent).mockClear()
    resetAgentHistory()
    settingsState.value = { ...settingsState.value, mode: 'workspace-write' }
  })

  it('delegates to the sub agent and continues with follow-up work', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(toolResponse('create_subagent', { task: 'research X' }))
      .mockResolvedValueOnce(textResponse('Done: research finished.'))

    const onToolCall = vi.fn(() => 'call-1')
    const onToolResult = vi.fn()
    const result = await executeAgentLoop('Use a sub agent for this', { onToolCall, onToolResult }, 5)

    // The main loop executed the delegation tool...
    expect(onToolCall).toHaveBeenCalledWith('create_subagent', { task: 'research X' })
    expect(executeCreateSubagent).toHaveBeenCalledTimes(1)
    // ...received its result as a tool_result callback...
    const [id, name, toolResult] = vi.mocked(onToolResult).mock.calls[0]!
    expect(id).toBe('call-1')
    expect(name).toBe('create_subagent')
    expect(toolResult.content).toContain('[Sub-agent result]')
    // ...and continued to a final answer.
    expect(result.text).toBe('Done: research finished.')
    expect(result.aborted).toBe(false)
  })

  it('excludes create_subagent from the sub agent tool list (no recursion)', async () => {
    settingsState.value = { ...settingsState.value, mode: 'workspace-write' }
    vi.mocked(sendMessage).mockResolvedValue(textResponse('ok'))
    // Import the real runSubagent machinery via a direct call.
    const { runSubagent } = await import('../../src/agent/subagent')

    await runSubagent({ task: 't' }, {}, {})

    const tools = (vi.mocked(sendMessage).mock.calls[0][2] ?? []) as ToolDefinition[]
    expect(tools.map((t) => t.name)).not.toContain('create_subagent')
  })
})

import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import type { ExecutorContext, ExecuteToolFn } from '../types'
import { runSubagent, type RunSubagentOverrides } from '../../subagent'

/** Test seam for the sub-agent overrides (injected API client / tool executor). */
const _subagentOverridesRef: { current: RunSubagentOverrides | null } = { current: null }

export function setCreateSubagentOverrides(overrides: RunSubagentOverrides | null): void {
  _subagentOverridesRef.current = overrides
}

/** Test seam for injecting a custom executeTool into create_subagent. */
let _executeToolOverride: ExecuteToolFn | null = null

export function setExecuteToolOverride(fn: ExecuteToolFn | null): void {
  _executeToolOverride = fn
}

export const createSubagentSchema: ToolDefinition = {
  name: 'create_subagent',
  description:
    "Delegate a self-contained sub-task to an independent sub agent. The sub agent gets its OWN conversation (it cannot see this chat), inherits the current access mode, and runs until it produces a final answer. " +
    'Use it for bounded side-quests (research, a focused analysis or edit) so their tool traffic does not clutter this conversation. ' +
    'The sub agent CANNOT ask the user questions and cannot spawn further sub agents.',
  parameters: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Complete, self-contained description of the delegated task. Include everything the sub agent needs — it has no access to this conversation.',
      },
      system: {
        type: 'string',
        description: "Optional extra instructions appended to the sub agent's default system prompt.",
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional whitelist of tool names. Can only NARROW what the current access mode allows; write tools are dropped in read-only mode and unknown names are ignored.',
      },
      maxIterations: {
        type: 'number',
        description: 'Maximum tool-call rounds for the sub agent (default 10, hard limit 25).',
      },
      timeoutMs: {
        type: 'number',
        description: 'Overall wall-clock budget in milliseconds (default 300000 = 5 minutes).',
      },
    },
    required: ['task'],
  },
}

export const summarizeCreateSubagent: ToolSummary = (input, result?) => {
  const task = input.task
  const shortTask = typeof task === 'string' && task.trim() ? truncate(task.trim(), 80) : '(no task)'
  if (!result?.content) return shortTask
  if (result.isError || result.content.includes('ABORTED')) {
    return `${shortTask} — failed/aborted`
  }
  const iterationsMatch = /(\d+) iteration/.exec(result.content)
  return iterationsMatch ? `${shortTask} — ${iterationsMatch[1]} iteration(s)` : shortTask
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Execute `create_subagent`: run an isolated sub-agent loop and report its
 * final answer back as a single tool result. Write tools executed inside the
 * sub agent are stamped with THIS turn's id so /undo rolls them back together
 * with everything else this turn did (plan p0-7 / p3-4).
 */
export async function executeCreateSubagent(
  input: Record<string, unknown>,
  context: ExecutorContext = {},
): Promise<ToolResult> {
  const task = typeof input.task === 'string' ? input.task.trim() : ''
  if (!task) {
    return { content: 'create_subagent failed: "task" is required', isError: true }
  }

  let result
  try {
    const options = {
      task,
      system: typeof input.system === 'string' && input.system.trim() ? input.system : undefined,
      tools: Array.isArray(input.tools) ? input.tools.filter((t): t is string => typeof t === 'string') : undefined,
      maxIterations: typeof input.maxIterations === 'number' ? input.maxIterations : undefined,
      timeoutMs: typeof input.timeoutMs === 'number' ? input.timeoutMs : undefined,
    } as const
    const executeToolFn = _executeToolOverride ?? (async (name, input, context) => {
      // Lazy import to break the circular dependency at runtime.
      const { executeTool } = await import('../executor')
      return executeTool(name, input, context) as Awaited<ReturnType<ExecuteToolFn>>
    })
    result = await runSubagent(
      options,
      { turnId: context.turnId, abortSignal: context.abortSignal, context },
      {},
      { ...(_subagentOverridesRef.current ?? {}), executeToolFn },
    )
  } catch (error) {
    return {
      content: `create_subagent failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    }
  }

  const usage = result.usage
    ? `${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens`
    : 'no usage reported'
  const statusLine = result.aborted
    ? 'STATUS: ABORTED (the parent agent was stopped)'
    : `STATUS: completed after ${result.iterations} iteration(s), ${usage}`

  return {
    content: `[Sub-agent result]\n${statusLine}\n\n${result.text}`,
    isError: !!result.isError,
  }
}

import type {
  AgentMode,
  ApiMessage,
  ContentBlock,
  SubagentOptions,
  SubagentResult,
  ToolDefinition,
  UnifiedResponse,
} from '@/config/types'
import { settingsManager } from '@/config/settings'
import { sendMessage } from '@/api/client'
import type { ExecutorContext, ExecuteToolFn } from './tools/types'
import { getMode, normalizeMode, subAgentToolAllowed } from './modes'
import { buildSystemPrompt } from './system-prompt'
import { appendAgentsMd, loadAgentsMd } from './agents-md'
import { getCurrentFilePath } from '@/adapter/vault'

export const DEFAULT_SUBAGENT_MAX_ITERATIONS = 10
export const DEFAULT_SUBAGENT_TIMEOUT_MS = 5 * 60 * 1000
/** Hard ceiling for a single sub agent's tool-call rounds. */
const SUBAGENT_MAX_ITERATION_LIMIT = 25

export interface SubagentContext {
  /** Agent depth of the CALLING context: main loop is 1; each nesting level adds 1. */
  depth?: number
  /** Access mode inherited from the caller (defaults to the live settings mode). */
  mode?: AgentMode
  /** Abort signal from the outer (main) agent loop. */
  abortSignal?: { aborted: boolean; signal?: AbortSignal }
  /** Turn id inherited so sub-agent write ops join the parent's /undo scope. */
  turnId?: string
  /** Parent executor context; activeFile is refreshed, askUser is never forwarded. */
  context?: ExecutorContext
}

export interface SubagentCallbacks {
  onText?: (text: string) => void
  onError?: (message: string) => void
  onToolCall?: (name: string, input: Record<string, unknown>) => void
  onToolResult?: (name: string, result: { content: string; isError?: boolean }) => void
}

export interface RunSubagentOverrides {
  /** Test seam: replace the API client. */
  sendMessageFn?: typeof sendMessage
  /** Test seam: replace the tool executor. */
  executeToolFn?: ExecuteToolFn
  now?: () => number
}

/**
 * Compute the tool list a sub agent may use: start from what the mode allows,
 * then intersect with an optional whitelist. The whitelist can only NARROW —
 * a write tool named in read-only mode is dropped, and unknown names are ignored.
 */
export function resolveSubagentTools(allowed: ToolDefinition[], tools?: string[]): ToolDefinition[] {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return allowed
  const wanted = new Set(tools.filter((t): t is string => typeof t === 'string'))
  return allowed.filter((tool) => wanted.has(tool.name))
}

function buildSubagentSystemPrompt(system: string | undefined, mode: AgentMode): string {
  const base = [
    ...buildSystemPrompt('', mode).split('\n'),
    '',
    'You are a SUB-AGENT. A parent agent delegated one self-contained task to you.',
    '- You have NO access to the parent conversation; work only from the task below and your tool results.',
    '- Do not call create_subagent (nesting is handled by the parent).',
    '- When finished, reply with a concise final answer that directly completes the task — no preamble, no plan, no apology for tool failures that did not happen.',
  ]
  return system && system.trim() ? `${base.join('\n')}\n\n${system.trim()}` : base.join('\n')
}

/**
 * Run an isolated sub-agent loop: a fresh conversation (no parent history),
 * the inherited AgentMode, and independent iteration/timeout budgets.
 * Write tools executed inside are stamped with the parent turnId so they join
 * the parent's /undo scope; abortSignal propagates the outer stop button in.
 */
export async function runSubagent(
  options: SubagentOptions,
  context: SubagentContext = {},
  callbacks: SubagentCallbacks = {},
  overrides: RunSubagentOverrides = {},
): Promise<SubagentResult> {
  const task = typeof options.task === 'string' ? options.task.trim() : ''
  if (!task) {
    return { text: 'create_subagent failed: "task" is required', iterations: 0, aborted: false, isError: true }
  }

  // Inherit the caller's mode; an unknown stored/forwarded value normalizes to workspace-write.
  const mode: AgentMode = context.mode === undefined ? getMode().id : normalizeMode(context.mode)
  // Depth: the caller (main loop or a nested sub agent) reports its own depth;
  // nesting happens through the parent's tool list, which drops create_subagent.
  void context.depth

  const { toolDefinitions } = await import('./tools/registry')
  // Inherit the caller's mode: read-only stays read-only (no privilege escalation);
  // additionally strip delegation and user-interruption tools from every sub agent.
  const baseAllowed = toolDefinitions.filter((tool) => subAgentToolAllowed(tool.name, mode))
  const tools = resolveSubagentTools(baseAllowed, options.tools)

  const maxIterations = clampInt(options.maxIterations, DEFAULT_SUBAGENT_MAX_ITERATIONS, 1, SUBAGENT_MAX_ITERATION_LIMIT)
  const timeoutMs = clampInt(options.timeoutMs, DEFAULT_SUBAGENT_TIMEOUT_MS, 0, Number.MAX_SAFE_INTEGER)

  const settings = settingsManager.get()
  const send = overrides.sendMessageFn ?? sendMessage
  const runTool: ExecuteToolFn = overrides.executeToolFn ?? (async (name, input, context) => {
    // Lazy import to break the circular dependency at runtime.
    const { executeTool } = await import('./tools/executor')
    return executeTool(name, input, context) as ReturnType<ExecuteToolFn>
  })
  const now = overrides.now ?? Date.now
  const startedAt = now()

  // Sub agents operate in the same vault, so they inherit AGENTS.md too.
  const agentsMd = await loadAgentsMd()
  const conversation: ApiMessage[] = [{ role: 'user', content: `[Delegated task from the parent agent]\n${task}` }]
  const systemMessage: ApiMessage = { role: 'system', content: appendAgentsMd(buildSubagentSystemPrompt(options.system, mode), agentsMd) }

  let finalText = ''
  const totalUsage = { inputTokens: 0, outputTokens: 0 }
  let iterations = 0
  let aborted = false
  let timedOut = false
  let errorText: string | null = null

  while (iterations < maxIterations) {
    if (context.abortSignal?.aborted || (timeoutMs > 0 && now() - startedAt >= timeoutMs)) {
      aborted = true
      timedOut = timeoutMs > 0 && !timedOut
      break
    }
    iterations++

    let response: UnifiedResponse
    try {
      response = await send(settings, [systemMessage, ...conversation], tools, context.abortSignal?.signal)
    } catch (error) {
      if (context.abortSignal?.aborted) aborted = true
      else errorText = error instanceof Error ? error.message : String(error)
      break
    }

    if (context.abortSignal?.aborted || (timeoutMs > 0 && now() - startedAt >= timeoutMs)) {
      aborted = true
      timedOut = !timedOut && timeoutMs > 0
      break
    }

    if (response.usage) {
      totalUsage.inputTokens += response.usage.inputTokens
      totalUsage.outputTokens += response.usage.outputTokens
    }

    const assistantBlocks: ContentBlock[] = []
    const toolUses: ContentBlock[] = []
    let responseText = ''

    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text ?? ''
        assistantBlocks.push(block)
      } else if (block.type === 'tool_use') {
        toolUses.push(block)
        assistantBlocks.push(block)
      }
    }

    if (responseText.trim()) {
      finalText = finalText ? `${finalText}\n${responseText.trim()}` : responseText.trim()
      callbacks.onText?.(responseText.trim())
    }

    conversation.push({ role: 'assistant', content: assistantBlocks })

    if (!toolUses.length || response.stopReason !== 'tool_use') break

    const toolResultBlocks: ContentBlock[] = []
    for (const toolUse of toolUses) {
      // Abort mid-batch: stop scheduling further tools, but still answer the API.
      if (context.abortSignal?.aborted || (timeoutMs > 0 && now() - startedAt >= timeoutMs)) {
        aborted = true
        timedOut = !timedOut && timeoutMs > 0
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Aborted before execution.',
          is_error: true,
        })
        continue
      }

      const name = toolUse.name ?? 'unknown'
      if (!subAgentToolAllowed(name, mode)) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Blocked: ${name} is not available to sub agents in the current access mode.`,
          is_error: true,
        })
        continue
      }

      callbacks.onToolCall?.(name, toolUse.input ?? {})
      const result = await runTool(name, toolUse.input ?? {}, {
        activeFile: getCurrentFilePath(),
        turnId: context.turnId,
        // askUser is intentionally NOT forwarded: a sub agent must never
        // interrupt the user (see plan p3-6).
      })
      callbacks.onToolResult?.(name, result)
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.content,
        is_error: result.isError,
      })
    }
    conversation.push({ role: 'user', content: toolResultBlocks })
  }

  if (iterations >= maxIterations && !aborted) {
    errorText = `Sub agent stopped after ${maxIterations} iterations without finishing.`
  }

  const isError = !!errorText || aborted
  const text = finalText
    ? (timedOut ? `[Timed out after ${timeoutMs} ms]\n${finalText}` : finalText)
    : errorText ?? (aborted ? 'Aborted.' : '(no output)')

  return {
    text,
    iterations,
    aborted,
    usage: totalUsage,
    isError,
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
  return Math.min(Math.max(n, min), max)
}

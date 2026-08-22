import type {
  AgentCallbacks,
  AgentResult,
  ApiMessage,
  ContentBlock,
  UnifiedResponse,
} from '@/config/types'
import { settingsManager } from '@/config/settings'
import { sendMessage } from '@/api/client'
import { executeTool } from './tools/executor'
import { currentAgentMode } from './tools/permissions'
import { buildRequestParts } from './request'
import { getCurrentFilePath } from '@/adapter/vault'
import { discoverSkills, buildSkillsCatalog } from './skills/index'
import { getAgentHistory, resetAgentHistory, setAgentHistory, popLastAgentTurn, commitHistory } from './history'

// Re-export history functions so existing imports from loop.ts keep working.
export { resetAgentHistory, popLastAgentTurn, getAgentHistory, setAgentHistory } from './history'

let aborted = false
let abortController: AbortController | null = null

export function abortAgentLoop(): void {
  aborted = true
  abortController?.abort()
}

/**
 * Run the agentic loop: call the API, execute tool_use blocks, feed tool
 * results back, until the model ends its turn or `maxIterations` is reached.
 */
export async function executeAgentLoop(
  userMessage: string,
  callbacks: AgentCallbacks = {},
  maxIterations = 20,
): Promise<AgentResult> {
  aborted = false
  abortController = new AbortController()
  const signal = abortController.signal
  const settings = settingsManager.get()
  // Re-discover skills on every turn so a freshly added SKILL.md is picked up
  // without a plugin restart; with no skills this yields an empty catalog and
  // the system prompt stays byte-identical to the pre-skills version.
  let skillsCatalog = ''
  try {
    skillsCatalog = buildSkillsCatalog(await discoverSkills())
  } catch {
    skillsCatalog = ''
  }
  const history = getAgentHistory()
  const {
    systemMessage,
    contextMessage,
    conversation,
    tools: allowedTools,
  } = await buildRequestParts(userMessage, trimForApi(history), skillsCatalog, currentAgentMode())

  // One turnId per user turn (i.e. one executeAgentLoop call). All write tool
  // calls made during this loop share it so /undo can roll the whole turn back.
  const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Shared live-abort flag: create_subagent (and any nested runSubagent) reads
  // this so the stop button terminates in-flight sub loops as well (p3-5).
  // The `aborted` getter follows the module flag so abortAgentLoop() reaches
  // sub agents, and `signal` lets them abort their own in-flight API request.
  const abortSignal = { signal, get aborted() { return aborted } }

  let finalText = ''
  const totalUsage = { inputTokens: 0, outputTokens: 0 }
  let apiDurationMs = 0
  let iterations = 0

  while (iterations < maxIterations) {
    if (aborted) break
    iterations++

    callbacks.onThinkingChange?.(true)
    let response: UnifiedResponse
    const requestStartedAt = performance.now()
    try {
      response = await sendMessage(settings, [systemMessage, contextMessage, ...conversation], allowedTools, signal)
      apiDurationMs += performance.now() - requestStartedAt
    } catch (error) {
      callbacks.onThinkingChange?.(false)
      if (aborted) break // user pressed stop mid-request: exit quietly, no error bubble
      callbacks.onError?.(error instanceof Error ? error.message : String(error))
      break
    }
    callbacks.onThinkingChange?.(false)

    if (response.usage) {
      totalUsage.inputTokens += response.usage.inputTokens
      totalUsage.outputTokens += response.usage.outputTokens
      callbacks.onUsage?.(response.usage)
    }

    const assistantBlocks: ContentBlock[] = []
    const toolUses: ContentBlock[] = []
    let responseText = ''
    let thinkingText = ''

    for (const block of response.content) {
      if (block.type === 'thinking') {
        // Reasoning is shown to the user but never echoed back to the API.
        const text = (block.text ?? '').trim()
        if (text) thinkingText += (thinkingText ? '\n\n' : '') + text
        continue
      }
      if (block.type === 'text') {
        responseText += block.text ?? ''
        assistantBlocks.push(block)
      } else if (block.type === 'tool_use') {
        toolUses.push(block)
        assistantBlocks.push(block)
      }
    }

    if (thinkingText) {
      callbacks.onThinking?.(thinkingText)
    }

    if (responseText.trim()) {
      finalText += (finalText ? '\n' : '') + responseText.trim()
      callbacks.onText?.(responseText.trim())
    }

    conversation.push({ role: 'assistant', content: assistantBlocks })

    if (toolUses.length && response.stopReason === 'tool_use') {
      const toolResultBlocks: ContentBlock[] = []
      for (const toolUse of toolUses) {
        if (aborted) break
        const name = toolUse.name ?? 'unknown'
        const returnedId = callbacks.onToolCall?.(name, toolUse.input ?? {})
        const toolCallId = (typeof returnedId === 'string' && returnedId)
          ? returnedId
          : toolUse.id ?? `${name}-${iterations}`
        const result = await executeTool(name, toolUse.input ?? {}, {
          activeFile: getCurrentFilePath(),
          turnId,
          askUser: callbacks.onAskUser,
          abortSignal,
        })
        callbacks.onToolResult?.(toolCallId, name, result)
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.isError,
        })
      }
      conversation.push({ role: 'user', content: toolResultBlocks })
      continue
    }

    break
  }

  commitHistory(conversation)
  return { text: finalText, iterations, aborted, usage: totalUsage, model: settings.model, apiDurationMs }
}

/** Trim history to the API-friendly window before building the request. */
function trimForApi(messages: ApiMessage[]): ApiMessage[] {
  const MAX_HISTORY = 50
  const KEEP_HISTORY = 40
  return messages.length > MAX_HISTORY ? messages.slice(messages.length - KEEP_HISTORY) : messages
}

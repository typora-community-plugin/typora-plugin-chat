import type {
  AgentCallbacks,
  AgentResult,
  ApiMessage,
  ContentBlock,
  UnifiedResponse,
} from '../config/types'
import { settingsManager } from '../config/settings'
import { sendMessage } from '../api/client'
import { toolDefinitions } from '../tools/registry'
import { executeTool } from '../tools/executor'
import { buildSystemPrompt } from './system-prompt'
import { buildContextMessage } from './context'


const MAX_HISTORY = 50
const KEEP_HISTORY = 40

let history: ApiMessage[] = []
let aborted = false


function trimHistory(messages: ApiMessage[]): ApiMessage[] {
  return messages.length > MAX_HISTORY ? messages.slice(messages.length - KEEP_HISTORY) : messages
}

export function resetAgentHistory(): void {
  history = []
}

export function abortAgentLoop(): void {
  aborted = true
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
  const settings = settingsManager.get()
  const systemMessage: ApiMessage = { role: 'system', content: buildSystemPrompt() }
  const contextMessage: ApiMessage = { role: 'user', content: await buildContextMessage() }
  const conversation: ApiMessage[] = [
    ...trimHistory(history),
    { role: 'user', content: userMessage },
  ]

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
      response = await sendMessage(settings, [systemMessage, contextMessage, ...conversation], toolDefinitions)
      apiDurationMs += performance.now() - requestStartedAt
    } catch (error) {
      callbacks.onThinkingChange?.(false)
      callbacks.onError?.(error instanceof Error ? error.message : String(error))
      break
    }
    callbacks.onThinkingChange?.(false)

    if (response.usage) {
      totalUsage.inputTokens += response.usage.inputTokens
      totalUsage.outputTokens += response.usage.outputTokens
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
          askUser: callbacks.onAskUser,
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

  history = trimHistory(conversation)
  return { text: finalText, iterations, aborted, usage: totalUsage, model: settings.model, apiDurationMs }
}

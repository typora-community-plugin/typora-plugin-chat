import { get } from 'svelte/store'
import type { ChatMessage } from '../config/types'
import { messages } from '../store/chat-store'
import { format, t } from '../i18n'


export function formatChatMarkdown(list: ChatMessage[]): string {
  const blocks: string[] = []
  for (const msg of list) {
    switch (msg.type) {
      case 'user':
        blocks.push(`### ${t.transcript.question}:\n\n${msg.text ?? ''}`)
        break
      case 'assistant':
        blocks.push(`### ${t.transcript.answer}:\n\n${msg.text ?? ''}`)
        break
      case 'thinking':
        blocks.push(`### ${t.transcript.thinking}:\n\n${msg.text ?? ''}`)
        break
      case 'tool_call':
        blocks.push(`### ${format(t.transcript.toolCall, { name: msg.toolName })}\n\n\`\`\`json\n${JSON.stringify(msg.toolInput ?? {}, null, 2)}\n\`\`\``)
        break
      case 'tool_result':
        blocks.push(`### ${format(t.transcript.toolResult, { name: msg.toolName })}\n\n${msg.toolResult?.content ?? ''}`)
        break
      case 'error':
        blocks.push(`### ${t.transcript.error}:\n\n${msg.text ?? ''}`)
        break
      default:
        break
    }
  }
  return blocks.join('\n\n---\n\n')
}

export async function copyTranscript(): Promise<void> {
  const markdown = formatChatMarkdown(get(messages))
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown)
      return
    }
  } catch {
    /* fall through to legacy path */
  }
  const textarea = document.createElement('textarea')
  textarea.value = markdown
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

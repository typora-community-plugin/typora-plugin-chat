import type { ToolResult } from '../config/types'
import type { ExecutorContext } from './executor'


export async function executeAskUser(input: Record<string, unknown>, context: ExecutorContext): Promise<ToolResult> {
  const question = input.question as string
  if (!question) return { content: 'ask_user failed: question is required', isError: true }
  if (!context.askUser) return { content: 'ask_user failed: no user interaction callback available', isError: true }
  try {
    const answer = await context.askUser(question)
    return { content: `User answered: ${answer}` }
  } catch (error) {
    return { content: `ask_user cancelled: ${error.message || error}`, isError: true }
  }
}

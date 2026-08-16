import type { ToolDefinition, ToolResult } from '../../config/types'


export interface ExecutorContext {
  askUser?: (question: string) => Promise<string>
}

export const askUserSchema: ToolDefinition = {
  name: 'ask_user',
  description: 'Pause the agent loop and ask the user a question. Use only when a decision truly needs human input.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to show the user.' },
    },
    required: ['question'],
  },
}

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

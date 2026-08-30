import type { ToolDefinition, ToolResult } from '@/config/types'
import type { ExecutorContext, AskUserQuestionItem, AskUserAnswerItem } from '../types'

export type { AskUserQuestionItem, AskUserAnswerItem } from '../types'


export const askUserSchema: ToolDefinition = {
  name: 'ask_user',
  description:
    'Pause the agent loop and ask the user one or more questions. ' +
    'Each question may include optional predefined choices (options). ' +
    'The user can select one or more options, or type a custom answer.',
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description: 'List of questions to present to the user.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Stable identifier for this question, echoed back in the answer.' },
            question: { type: 'string', description: 'The question text shown to the user.' },
            options: {
              type: 'array',
              description: 'Optional predefined choices. If omitted the user types a free-form answer.',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: 'Short display text for this option.' },
                },
                required: ['label'],
              },
            },
          },
          required: ['id', 'question'],
        },
      },
    },
    required: ['questions'],
  },
}

export function summarizeAskUser(input: unknown): string {
  const questions = (input as Record<string, unknown>)?.questions
  if (!Array.isArray(questions) || !questions.length) return '(no question)'
  return (questions as AskUserQuestionItem[]).map((q) => q.question).join(' | ')
}

export async function executeAskUser(
  input: Record<string, unknown>,
  context: ExecutorContext,
): Promise<ToolResult> {
  const rawQuestions = input.questions
  if (!Array.isArray(rawQuestions) || !rawQuestions.length) {
    return { content: 'ask_user failed: questions array is required and must not be empty', isError: true }
  }

  // Normalise — the model may send slightly off-shape items.
  const questions: AskUserQuestionItem[] = rawQuestions.map((q, i) => {
    const obj = q as Record<string, unknown>
    return {
      id: typeof obj.id === 'string' && obj.id ? obj.id : String(i + 1),
      question: typeof obj.question === 'string' ? obj.question : '',
      options: Array.isArray(obj.options)
        ? (obj.options as Array<{ label?: string }>).filter(
            (o): o is { label: string } => typeof o?.label === 'string' && !!o.label,
          )
        : undefined,
    }
  })

  if (!context.askUser) {
    return { content: 'ask_user failed: no user interaction callback available', isError: true }
  }

  try {
    const answers = await context.askUser(questions)
    return { content: formatAnswers(answers) }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return { content: `ask_user cancelled: ${msg}`, isError: true }
  }
}

/** Format the structured answers into a readable string for the model. */
function formatAnswers(answers: AskUserAnswerItem[]): string {
  if (!answers.length) return 'User answered: (no answer)'
  const lines = answers.map((a) => {
    const parts: string[] = []
    if (a.selected.length) parts.push(a.selected.join(', '))
    if (a.custom) parts.push(`custom: ${a.custom}`)
    return `Q[${a.id}]: ${parts.length ? parts.join(' | ') : '(no answer)'}`
  })
  return `User answered:\n${lines.join('\n')}`
}

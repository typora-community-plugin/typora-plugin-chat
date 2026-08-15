import type { ToolDefinition } from '../config/types'


export const interactionSchemas: ToolDefinition[] = [
  {
    name: 'ask_user',
    description: 'Pause the agent loop and ask the user a question. Use only when a decision truly needs human input.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to show the user.' },
      },
      required: ['question'],
    },
  },
]

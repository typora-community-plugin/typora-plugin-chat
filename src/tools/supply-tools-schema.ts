import type { ToolDefinition } from '../config/types'


export const supplyToolSchemas: ToolDefinition[] = [
  {
    name: 'get_backlinks',
    description: 'Find notes that link to the given document. Omit `path` for the active document.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional vault-relative path to the markdown file.' },
      },
      required: [],
    },
  },
  {
    name: 'open_document',
    description: 'Open a file in the Typora editor.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Vault-relative path to the file to open.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_current_datetime',
    description: 'Get the current date and time in the user\'s local timezone.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

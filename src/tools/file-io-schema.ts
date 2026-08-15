import type { ToolDefinition } from '../config/types'


export const fileIoSchemas: ToolDefinition[] = [
  {
    name: 'read_document',
    description: 'Read a markdown document. Omit `path` to read the currently active document.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional vault-relative path to the markdown file.' },
      },
      required: [],
    },
  },
  {
    name: 'read_file',
    description: 'Read any file in the vault as text (markdown or other text files).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Vault-relative path to the file.' },
      },
      required: ['path'],
    },
  },
]

import type { ToolDefinition } from '../config/types'


export const fileOpsSchemas: ToolDefinition[] = [
  {
    name: 'create_file',
    description: 'Create a new file in the vault. Fails if the file already exists.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Vault-relative path for the new file.' },
        content: { type: 'string', description: 'Initial file content.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'rename_file',
    description: 'Rename or move a file inside the vault.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Current vault-relative path.' },
        new_path: { type: 'string', description: 'New vault-relative path.' },
      },
      required: ['path', 'new_path'],
    },
  },
  {
    name: 'delete_file',
    description: 'Move a file to the system trash. Fails if the file does not exist.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Vault-relative path to delete.' },
      },
      required: ['path'],
    },
  },
]

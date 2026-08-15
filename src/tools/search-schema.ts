import type { ToolDefinition } from '../config/types'


export const searchSchemas: ToolDefinition[] = [
  {
    name: 'search_vault',
    description: 'Search the vault by file name or file content. Returns matching file paths with snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query text.' },
        searchContent: {
          type: 'boolean',
          description: 'Search inside file contents (default true). When false, only file names are matched.',
          default: true,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 20, max 50).',
          default: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a vault folder. Omit `folder` to list the vault root.',
    parameters: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Optional vault-relative folder path.' },
        extension: { type: 'string', description: 'Optional file extension filter, e.g. "md".' },
      },
      required: [],
    },
  },
]

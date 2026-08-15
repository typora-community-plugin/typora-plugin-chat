import type { ToolDefinition } from '../config/types'


export const editSchemas: ToolDefinition[] = [
  {
    name: 'edit_document',
    description:
      'Edit a markdown document atomically. Use `replace_all` to overwrite the whole file, ' +
      '`find_replace` for surgical edits (preferred), or `insert` to add content at beginning/end/after_frontmatter. ' +
      'Omit `path` to edit the currently active document.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional vault-relative path. Defaults to active document.' },
        operation: {
          type: 'string',
          enum: ['replace_all', 'find_replace', 'insert'],
          description: 'The edit operation to perform.',
        },
        content: { type: 'string', description: 'New content (replace_all), replacement text (find_replace), or text to insert (insert).' },
        find: { type: 'string', description: 'Exact text to find, required for find_replace.' },
        position: {
          type: 'string',
          enum: ['beginning', 'end', 'after_frontmatter'],
          description: 'Insert position, required for insert.',
        },
      },
      required: ['operation'],
    },
  },
]

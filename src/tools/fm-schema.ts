import type { ToolDefinition } from '../config/types'


export const fmSchemas: ToolDefinition[] = [
  {
    name: 'get_properties',
    description: 'Read YAML frontmatter properties of a markdown document. Omit `path` for the active document.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional vault-relative path to the markdown file.' },
      },
      required: [],
    },
  },
  {
    name: 'set_properties',
    description:
      'Set/update YAML frontmatter properties of a markdown document. Properties are merged into ' +
      'existing ones; a null value removes that property. Omit `path` for the active document.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional vault-relative path to the markdown file.' },
        properties: {
          type: 'object',
          description: 'Map of frontmatter properties to set (use null value to delete a key).',
        },
      },
      required: ['properties'],
    },
  },
]

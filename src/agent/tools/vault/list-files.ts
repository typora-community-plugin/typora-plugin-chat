import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { listFiles } from '@/adapter/vault'


export const listFilesSchema: ToolDefinition = {
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
}

export const summarizeListFiles: ToolSummary = (input, result) => {
  const folder = typeof input.folder === 'string' && input.folder ? input.folder : '(root)'
  if (!result || typeof result.content !== `string`) return folder
  if (result.isError) return `${folder} — failed`
  const m = result.content.match(/^(\d+) file/)
  if (m) return `${folder}: ${m[1]} file(s)`
  if (/^No files found/.test(result.content)) return `${folder}: empty`
  return folder
}

export async function executeListFiles(input: Record<string, unknown>): Promise<ToolResult> {
  try {
    const folder = typeof input.folder === 'string' ? input.folder : ''
    const extension = typeof input.extension === 'string' ? input.extension : undefined
    const results = await listFiles(folder, extension)
    if (!results.length) return { content: 'No files found.' }
    return { content: `${results.length} file(s):\n${results.map(f => `- ${f}`).join('\n')}` }
  } catch (error: any) {
    return { content: `list_files failed: ${error.message || error}`, isError: true }
  }
}

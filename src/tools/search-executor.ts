import type { ToolResult } from '../config/types'
import { listFiles, searchFiles } from '../adapter/vault'


export async function executeSearchVault(input: Record<string, unknown>): Promise<ToolResult> {
  const query = input.query as string
  if (!query) return { content: 'search_vault failed: query is required', isError: true }
  try {
    const searchContent = input.searchContent !== false
    const limit = typeof input.limit === 'number' ? input.limit : 20
    const results = await searchFiles(query, searchContent, limit)
    if (!results.length) return { content: `No files found for "${query}".` }
    return { content: `Found ${results.length} file(s):\n${results.map(f => `- ${f}`).join('\n')}` }
  } catch (error) {
    return { content: `search_vault failed: ${error.message || error}`, isError: true }
  }
}

export async function executeListFiles(input: Record<string, unknown>): Promise<ToolResult> {
  try {
    const folder = typeof input.folder === 'string' ? input.folder : ''
    const extension = typeof input.extension === 'string' ? input.extension : undefined
    const results = await listFiles(folder, extension)
    if (!results.length) return { content: 'No files found.' }
    return { content: `${results.length} file(s):\n${results.map(f => `- ${f}`).join('\n')}` }
  } catch (error) {
    return { content: `list_files failed: ${error.message || error}`, isError: true }
  }
}

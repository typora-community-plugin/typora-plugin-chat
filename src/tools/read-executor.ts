import type { ToolResult } from '../config/types'
import { getActiveDocumentContent, readFile } from '../adapter/vault'


export async function executeReadDocument(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = typeof input.path === 'string' ? input.path : undefined
  try {
    const content = targetPath ? await readFile(targetPath) : await getActiveDocumentContent()
    return { content }
  } catch (error) {
    return { content: `read_document failed: ${error.message || error}`, isError: true }
  }
}

export async function executeReadFile(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = input.path as string
  if (!targetPath) return { content: 'read_file failed: path is required', isError: true }
  try {
    const content = await readFile(targetPath)
    return { content }
  } catch (error) {
    return { content: `read_file failed: ${error.message || error}`, isError: true }
  }
}

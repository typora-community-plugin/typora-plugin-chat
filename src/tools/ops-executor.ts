import type { ToolResult } from '../config/types'
import { createFile, deleteFile, renameFile } from '../adapter/vault'


export async function executeCreateFile(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = input.path as string
  const content = (input.content as string) ?? ''
  if (!targetPath) return { content: 'create_file failed: path is required', isError: true }
  try {
    await createFile(targetPath, content)
    return { content: `Created ${targetPath}.` }
  } catch (error) {
    return { content: `create_file failed: ${error.message || error}`, isError: true }
  }
}

export async function executeRenameFile(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = input.path as string
  const newPath = input.new_path as string
  if (!targetPath || !newPath) {
    return { content: 'rename_file failed: path and new_path are required', isError: true }
  }
  try {
    await renameFile(targetPath, newPath)
    return { content: `Renamed ${targetPath} → ${newPath}.` }
  } catch (error) {
    return { content: `rename_file failed: ${error.message || error}`, isError: true }
  }
}

export async function executeDeleteFile(input: Record<string, unknown>): Promise<ToolResult> {
  const targetPath = input.path as string
  if (!targetPath) return { content: 'delete_file failed: path is required', isError: true }
  try {
    await deleteFile(targetPath)
    return { content: `Deleted ${targetPath}.` }
  } catch (error) {
    return { content: `delete_file failed: ${error.message || error}`, isError: true }
  }
}

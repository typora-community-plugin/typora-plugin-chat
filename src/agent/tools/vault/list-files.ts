import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { vaultIndex } from '@/adapter/vault-index'


export const listFilesSchema: ToolDefinition = {
  name: 'list_files',
  description: 'List files in a vault folder (served from an in-memory index — no disk I/O). Omit `folder` to list the vault root. Set `recursive` to include subfolders.',
  parameters: {
    type: 'object',
    properties: {
      folder: { type: 'string', description: 'Optional vault-relative folder path.' },
      extension: { type: 'string', description: 'Optional file extension filter, e.g. "md" (default md).' },
      recursive: {
        type: 'boolean',
        description: 'Include files from subfolders (default false). When false, only direct children of `folder` are listed.',
        default: false,
      },
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

/**
 * Depth-aware folder filter over the flat index.
 * - folder '.' (or empty → normalized to '.'): direct children of vault root when !recursive, all files when recursive.
 * - other folder: only entries directly inside `folder/` when !recursive; everything under it when recursive.
 */
function filterByFolder(files: string[], folder: string, recursive: boolean): string[] {
  if (folder === '.' || !folder) {
    if (recursive) return files
    // Root level: keep only top-level files (no `/` in the relative path).
    return files.filter(f => !f.includes('/'))
  }

  const prefix = folder.endsWith('/') ? folder : folder + '/'
  if (recursive) {
    return files.filter(f => f.startsWith(prefix))
  }
  // Non-recursive: only direct children — no further `/` after the prefix.
  return files.filter(f => {
    if (!f.startsWith(prefix)) return false
    const rest = f.slice(prefix.length)
    return !rest.includes('/')
  })
}

export async function executeListFiles(input: Record<string, unknown>): Promise<ToolResult> {
  try {
    await vaultIndex.ensureFresh()
    const folderRaw = typeof input.folder === 'string' && input.folder.trim() ? input.folder.trim().replace(/\\/g, '/') : '.'
    const extension = (typeof input.extension === 'string' && input.extension) || 'md'
    const recursive = input.recursive === true

    let files = vaultIndex.listAll()

    // Extension filter.
    if (extension) {
      const ext = `.${extension.toLowerCase()}`
      files = files.filter(f => f.toLowerCase().endsWith(ext))
    }

    // Folder + depth filter ('.' = vault root).
    files = filterByFolder(files, folderRaw, recursive)

    if (!files.length) return { content: 'No files found.' }
    return { content: `${files.length} file(s):\n${files.map(f => `- ${f}`).join('\n')}` }
  } catch (error: any) {
    return { content: `list_files failed: ${error.message || error}`, isError: true }
  }
}

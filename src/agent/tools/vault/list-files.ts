import type { ToolDefinition, ToolResult, ToolSummary } from '@/config/types'
import { vaultIndex } from '@/adapter/vault-index'


const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export const listFilesSchema: ToolDefinition = {
  name: 'list_files',
  description: `List files directly inside one vault folder level (served from an in-memory index — no disk I/O). Only direct children are returned by default, so drill down folder by folder. Omit \`folder\` to list the vault root. Pass \`recursive\` only when the user explicitly asks for subfolders or all nested files. Results are sorted by path and paginated: at most \`limit\` entries per call (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}). If the output says "showing X of Y", more files exist — raise \`offset\` to page further, or narrow the folder/extension filter instead.`,
  parameters: {
    type: 'object',
    properties: {
      folder: { type: 'string', description: 'Optional vault-relative folder path.' },
      extension: { type: 'string', description: 'Optional file extension filter, e.g. "md" (default md).' },
      recursive: {
        type: 'boolean',
        description: 'Include files from subfolders. Defaults to false — do NOT set unless the user explicitly asks for recursive listing or all nested files; otherwise list one level at a time and drill down as needed.',
        default: false,
      },
      limit: {
        type: 'number',
        description: `Maximum number of files to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
        default: DEFAULT_LIMIT,
      },
      offset: {
        type: 'number',
        description: 'Number of files to skip from the start of the sorted list, for pagination. Defaults to 0.',
        default: 0,
      },
    },
    required: [],
  },
}

export const summarizeListFiles: ToolSummary = (input, result) => {
  const folder = typeof input.folder === 'string' && input.folder ? input.folder : '(root)'
  if (!result || typeof result.content !== `string`) return folder
  if (result.isError) return `${folder} — failed`
  if (/^No files found/.test(result.content)) return `${folder}: empty`
  const m = result.content.match(/^(\d+) file\(s\)(?: \(showing (\d+), offset (\d+)\))?/)
  if (m && m[2]) return `${folder}: showing ${m[2]} of ${m[1]}, offset ${m[3]}`
  if (m) return `${folder}: ${m[1]} file(s)`
  return folder
}

function clampLimit(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_LIMIT
  return Math.min(Math.max(1, n), MAX_LIMIT)
}

function clampOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
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

    const limit = clampLimit(input.limit)
    const offset = clampOffset(input.offset)

    let files = vaultIndex.listAll()

    // Extension filter.
    if (extension) {
      const ext = `.${extension.toLowerCase()}`
      files = files.filter(f => f.toLowerCase().endsWith(ext))
    }

    // Folder + depth filter ('.' = vault root).
    files = filterByFolder(files, folderRaw, recursive)

    if (!files.length) return { content: 'No files found.' }

    files.sort()
    const total = files.length
    const page = files.slice(offset, offset + limit)
    if (!page.length) return { content: `No files at offset ${offset} (total ${total}).` }

    const header = total > page.length || offset > 0
      ? `${total} file(s) (showing ${page.length}, offset ${offset}):`
      : `${total} file(s):`
    return { content: `${header}\n${page.map(f => `- ${f}`).join('\n')}` }
  } catch (error: any) {
    return { content: `list_files failed: ${error.message || error}`, isError: true }
  }
}

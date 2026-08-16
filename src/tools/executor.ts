import type { ToolResult } from '../config/types'
import type { ExecutorContext } from './implements/ask-user'
import { executeReadDocument, readDocumentSchema } from './implements/read-document'
import { executeReadFile, readFileSchema } from './implements/read-file'
import { executeEditDocument, editDocumentSchema } from './implements/edit-document'
import { executeSearchVault, searchVaultSchema } from './implements/search-vault'
import { executeListFiles, listFilesSchema } from './implements/list-files'
import { executeCreateFile, createFileSchema } from './implements/create-file'
import { executeDeleteFile, deleteFileSchema } from './implements/delete-file'
import { executeRenameFile, renameFileSchema } from './implements/rename-file'
import { executeGetProperties, getPropertiesSchema } from './implements/get-properties'
import { executeSetProperties, setPropertiesSchema } from './implements/set-properties'
import { executeGetBacklinks, getBacklinksSchema } from './implements/get-backlinks'
import { executeOpenDocument, openDocumentSchema } from './implements/open-document'
import { executeGetCurrentDatetime, getCurrentDatetimeSchema } from './implements/get-current-datetime'
import { executeAskUser, askUserSchema } from './implements/ask-user'


export type { ExecutorContext }

/** All 14 tool schemas — re-exported for registry.ts */
export const allToolSchemas = [
  readDocumentSchema,
  readFileSchema,
  editDocumentSchema,
  searchVaultSchema,
  listFilesSchema,
  createFileSchema,
  renameFileSchema,
  deleteFileSchema,
  getPropertiesSchema,
  setPropertiesSchema,
  getBacklinksSchema,
  openDocumentSchema,
  getCurrentDatetimeSchema,
  askUserSchema,
] as const

/**
 * Execute a tool by name against Typora's vault/editor APIs.
 * All executors return a `ToolResult`; they never throw.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: ExecutorContext = {},
): Promise<ToolResult> {
  switch (name) {
    case 'read_document': return executeReadDocument(input)
    case 'read_file': return executeReadFile(input)
    case 'edit_document': return executeEditDocument(input)
    case 'search_vault': return executeSearchVault(input)
    case 'list_files': return executeListFiles(input)
    case 'create_file': return executeCreateFile(input)
    case 'rename_file': return executeRenameFile(input)
    case 'delete_file': return executeDeleteFile(input)
    case 'get_properties': return executeGetProperties(input)
    case 'set_properties': return executeSetProperties(input)
    case 'get_backlinks': return executeGetBacklinks(input)
    case 'open_document': return executeOpenDocument(input)
    case 'get_current_datetime': return executeGetCurrentDatetime()
    case 'ask_user': return executeAskUser(input, context)
    default:
      return { content: `Unknown tool: ${name}`, isError: true }
  }
}

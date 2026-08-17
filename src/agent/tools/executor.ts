import type { ToolResult } from '@/config/types'
import { getCurrentFilePath } from '@/adapter/vault'
import { currentAgentMode, isWriteTool } from './permissions'
import { executeReadDocument, readDocumentSchema } from './editor/read-document'
import { executeEditDocument, editDocumentSchema } from './editor/edit-document'
import { executeGetProperties, getPropertiesSchema } from './editor/get-properties'
import { executeSetProperties, setPropertiesSchema } from './editor/set-properties'
import { executeOpenDocument, openDocumentSchema } from './editor/open-document'
import { executeReadFile, readFileSchema } from './vault/read-file'
import { executeSearchVault, searchVaultSchema } from './vault/search-vault'
import { executeListFiles, listFilesSchema } from './vault/list-files'
import { executeCreateFile, createFileSchema } from './vault/create-file'
import { executeDeleteFile, deleteFileSchema } from './vault/delete-file'
import { executeRenameFile, renameFileSchema } from './vault/rename-file'
import { executeGetBacklinks, getBacklinksSchema } from './vault/get-backlinks'
import { executeGetCurrentDatetime, getCurrentDatetimeSchema } from './system/get-current-datetime'
import { executeAskUser, askUserSchema } from './system/ask-user'
import { executeUseSkill, useSkillSchema } from './system/use-skill'


export interface ExecutorContext {
  activeFile?: string | null
  askUser?: (question: string) => Promise<string>
}

/** All 14 tool schemas — re-exported for registry.ts */
export const allToolSchemas = [
  // Editor tools
  readDocumentSchema,
  editDocumentSchema,
  getPropertiesSchema,
  setPropertiesSchema,
  openDocumentSchema,
  // Vault tools
  readFileSchema,
  searchVaultSchema,
  listFilesSchema,
  createFileSchema,
  deleteFileSchema,
  renameFileSchema,
  getBacklinksSchema,
  // System tools
  getCurrentDatetimeSchema,
  askUserSchema,
  useSkillSchema,
] as const

/** Tools whose `path` parameter is optional; when missing, fall back to the active file for summary display. */
const OPTIONAL_PATH_TOOLS = new Set([
  'read_document',
  'edit_document',
  'get_properties',
  'set_properties',
  'get_backlinks',
])

/**
 * Execute a tool by name against Typora's vault/editor APIs.
 * All executors return a `ToolResult`; they never throw.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: ExecutorContext = {},
): Promise<ToolResult> {
  // Defense in depth: even if a write tool reaches the executor (e.g. a model
  // calling a stale tool id), block it in read-only mode.
  if (isWriteTool(name) && currentAgentMode() === 'read-only') {
    return {
      content: `Blocked: ${name} requires write access (current mode is Read Only).`,
      isError: true,
    }
  }
  const result = await runTool(name, input, context)
  if (OPTIONAL_PATH_TOOLS.has(name)) {
    const path = input.path
    if (!(typeof path === 'string' && path)) {
      const activeFile = context.activeFile ?? getCurrentFilePath()
      if (activeFile) input.path = activeFile
    }
  }
  return result
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  context: ExecutorContext,
): Promise<ToolResult> {
  switch (name) {
    // Editor tools
    case 'read_document': return executeReadDocument(input)
    case 'edit_document': return executeEditDocument(input)
    case 'get_properties': return executeGetProperties(input)
    case 'set_properties': return executeSetProperties(input)
    case 'open_document': return executeOpenDocument(input)
    // Vault tools
    case 'read_file': return executeReadFile(input)
    case 'search_vault': return executeSearchVault(input)
    case 'list_files': return executeListFiles(input)
    case 'create_file': return executeCreateFile(input)
    case 'delete_file': return executeDeleteFile(input)
    case 'rename_file': return executeRenameFile(input)
    case 'get_backlinks': return executeGetBacklinks(input)
    // System tools
    case 'get_current_datetime': return executeGetCurrentDatetime()
    case 'ask_user': return executeAskUser(input, context)
    case 'use_skill': return executeUseSkill(input)
    default:
      return { content: `Unknown tool: ${name}`, isError: true }
  }
}

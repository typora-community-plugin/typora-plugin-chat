import type { ToolResult } from '../config/types'
import { executeReadDocument, executeReadFile } from './read-executor'
import { executeEditDocument } from './edit-executor'
import { executeListFiles, executeSearchVault } from './search-executor'
import { executeCreateFile, executeDeleteFile, executeRenameFile } from './ops-executor'
import { executeGetProperties, executeSetProperties } from './fm-executor'
import { executeGetBacklinks, executeGetCurrentDatetime, executeOpenDocument } from './supply-executor'
import { executeAskUser } from './interaction-executor'


export interface ExecutorContext {
  askUser?: (question: string) => Promise<string>
}

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

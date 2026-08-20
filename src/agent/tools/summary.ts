import type { ToolResult, ToolSummary } from '@/config/types'
import { summarizeReadDocument } from './editor/read-document'
import { summarizeEditDocument } from './editor/edit-document'
import { summarizeGetProperties } from './editor/get-properties'
import { summarizeSetProperties } from './editor/set-properties'
import { summarizeOpenDocument } from './editor/open-document'
import { summarizeReadFile } from './vault/read-file'
import { summarizeSearchVault } from './vault/search-vault'
import { summarizeListFiles } from './vault/list-files'
import { summarizeCreateFile } from './vault/create-file'
import { summarizeDeleteFile } from './vault/delete-file'
import { summarizeRenameFile } from './vault/rename-file'
import { summarizeGetCurrentDatetime } from './system/get-current-datetime'
import { summarizeAskUser } from './system/ask-user'
import { summarizeUpdateTodo } from './system/update-todo'
import { summarizeCreateSubagent } from './system/create-subagent'

/**
 * Maps each tool name to its parameter-summary function.
 * Every summary function is defined in the same file as the tool schema/executor.
 */
export const toolSummaries: Record<string, ToolSummary> = {
  // Editor tools
  read_document: summarizeReadDocument,
  edit_document: summarizeEditDocument,
  get_properties: summarizeGetProperties,
  set_properties: summarizeSetProperties,
  open_document: summarizeOpenDocument,
  // Vault tools
  read_file: summarizeReadFile,
  search_vault: summarizeSearchVault,
  list_files: summarizeListFiles,
  create_file: summarizeCreateFile,
  delete_file: summarizeDeleteFile,
  rename_file: summarizeRenameFile,
  // System tools
  get_current_datetime: summarizeGetCurrentDatetime,
  ask_user: summarizeAskUser,
  update_todo: summarizeUpdateTodo,
  create_subagent: summarizeCreateSubagent,
}

export function summarizeToolMessage(
  name: string,
  message: { toolInput?: Record<string, unknown>; toolResult?: ToolResult },
): string {
  const summarize = toolSummaries[name]
  if (!summarize) return ''
  return summarize(message.toolInput ?? {}, message.toolResult)
}

/** Tools that mutate vault/editor content and must be gated in non-write modes. */
export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'edit_document',
  'set_properties',
  'create_file',
  'delete_file',
  'rename_file',
])

/** Tools that read vault/editor content; blocked by `chat-only`. */
export const READ_TOOL_NAMES: ReadonlySet<string> = new Set([
  'read_document',
  'get_properties',
  'open_document',
  'read_file',
  'search_vault',
  'list_files',
])

// NOTE: `web_fetch` and `subbrowser` are deliberately NOT file tools — they
// only read remote content (fetch / embedded iframe) and never touch the
// vault, so they stay available in every mode.

export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name)
}

export function isReadTool(name: string): boolean {
  return READ_TOOL_NAMES.has(name)
}

/** Tools removed from every SUB-agent's tool list (the parent owns delegation). */
export const SUBAGENT_EXCLUDED_TOOLS: ReadonlySet<string> = new Set([
  'create_subagent', // no unbounded recursion — the parent loop delegates instead
  'ask_user', // a sub agent must never interrupt the user mid-turn (plan p3-6)
])

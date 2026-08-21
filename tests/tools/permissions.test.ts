import { beforeEach, describe, expect, it } from 'vitest'
import { currentAgentMode, isReadTool, isWriteTool, READ_TOOL_NAMES, subAgentToolAllowed, SUBAGENT_EXCLUDED_TOOLS, toolAllowed, WRITE_TOOL_NAMES } from '../../src/agent/tools/permissions'
import { settingsManager } from '../../src/config/settings'


describe('tool permissions', () => {
  beforeEach(async () => {
    await settingsManager.save({ mode: 'workspace-write' })
  })

  it('classifies the five file-mutating tools as write tools', () => {
    expect(isWriteTool('edit_document')).toBe(true)
    expect(isWriteTool('set_properties')).toBe(true)
    expect(isWriteTool('create_file')).toBe(true)
    expect(isWriteTool('delete_file')).toBe(true)
    expect(isWriteTool('rename_file')).toBe(true)
    expect(WRITE_TOOL_NAMES.size).toBe(5)
  })

  it('treats read and system tools as non-write', () => {
    const readOnlyTools = [
      'read_document',
      'get_properties',
      'open_document',
      'read_file',
      'search_vault',
      'list_files',
      'get_current_datetime',
      'ask_user',
      'use_skill',
      'web_fetch', // read-only network tool — available in both modes (plan p2-4)
    ]
    for (const name of readOnlyTools) {
      expect(isWriteTool(name)).toBe(false)
    }
  })

  it('defaults to workspace-write', () => {
    expect(currentAgentMode()).toBe('workspace-write')
  })

  it('normalizes unexpected stored modes back to workspace-write', async () => {
    await settingsManager.save({ mode: 'something-else' as never })
    expect(currentAgentMode()).toBe('workspace-write')
  })

  it('reports read-only when set', async () => {
    await settingsManager.save({ mode: 'read-only' })
    expect(currentAgentMode()).toBe('read-only')
  })

  it('reports chat-only when set and preserves it (no collapse)', async () => {
    await settingsManager.save({ mode: 'chat-only' })
    expect(currentAgentMode()).toBe('chat-only')
  })

  it('classifies the six file-reading tools as read tools', () => {
    expect(isReadTool('read_document')).toBe(true)
    expect(isReadTool('get_properties')).toBe(true)
    expect(isReadTool('open_document')).toBe(true)
    expect(isReadTool('read_file')).toBe(true)
    expect(isReadTool('search_vault')).toBe(true)
    expect(isReadTool('list_files')).toBe(true)
    expect(READ_TOOL_NAMES.size).toBe(6)
  })

  it('applies the full 3x3 mode/tool-class table', () => {
    // write tools: only workspace-write allows them
    for (const name of WRITE_TOOL_NAMES) {
      expect(toolAllowed(name, 'workspace-write'), `${name} / workspace-write`).toBe(true)
      expect(toolAllowed(name, 'chat-only'), `${name} / chat-only`).toBe(false)
      expect(toolAllowed(name, 'read-only'), `${name} / read-only`).toBe(false)
    }
    // read tools: blocked by read-only and chat-only
    for (const name of READ_TOOL_NAMES) {
      expect(toolAllowed(name, 'workspace-write'), `${name} / workspace-write`).toBe(true)
      expect(toolAllowed(name, 'chat-only'), `${name} / chat-only`).toBe(false)
      expect(toolAllowed(name, 'read-only'), `${name} / read-only`).toBe(false)
    }
    // non-file tools: allowed in every mode
    for (const name of ['get_current_datetime', 'ask_user', 'use_skill', 'update_todo', 'create_subagent', 'web_fetch', 'subbrowser']) {
      expect(toolAllowed(name, 'workspace-write'), `${name} / workspace-write`).toBe(true)
      expect(toolAllowed(name, 'chat-only'), `${name} / chat-only`).toBe(true)
      expect(toolAllowed(name, 'read-only'), `${name} / read-only`).toBe(true)
    }
  })

  it('gates write tools in both non-write modes and read tools in chat-only mode', () => {
    expect(toolAllowed('edit_document', 'workspace-write')).toBe(true)
    expect(toolAllowed('edit_document', 'chat-only')).toBe(false)
    expect(toolAllowed('create_file', 'read-only')).toBe(false)
    expect(toolAllowed('read_document', 'chat-only')).toBe(false)
  })

  describe('sub-agent helpers (p3-1/p3-2/p3-6)', () => {
    it('excludes delegation and user-interruption tools for sub agents', () => {
      expect(SUBAGENT_EXCLUDED_TOOLS.has('create_subagent')).toBe(true)
      expect(SUBAGENT_EXCLUDED_TOOLS.has('ask_user')).toBe(true)
      expect(subAgentToolAllowed('create_subagent', 'workspace-write')).toBe(false)
      expect(subAgentToolAllowed('ask_user', 'workspace-write')).toBe(false)
    })

    it('still gates write tools for sub agents in read-only mode (inheritance, no escalation)', () => {
      expect(subAgentToolAllowed('create_file', 'read-only')).toBe(false)
      expect(subAgentToolAllowed('edit_document', 'read-only')).toBe(false)
      expect(subAgentToolAllowed('read_document', 'read-only')).toBe(true)
    })

    it('keeps ordinary tools available to sub agents in workspace-write mode', () => {
      expect(subAgentToolAllowed('read_document', 'workspace-write')).toBe(true)
      expect(subAgentToolAllowed('edit_document', 'workspace-write')).toBe(true)
      expect(subAgentToolAllowed('use_skill', 'workspace-write')).toBe(true)
    })

    it('inherits chat-only for sub agents: all file tools dropped, non-file kept (no escalation)', () => {
      expect(subAgentToolAllowed('create_file', 'chat-only')).toBe(false)
      expect(subAgentToolAllowed('edit_document', 'chat-only')).toBe(false)
      expect(subAgentToolAllowed('read_document', 'chat-only')).toBe(false)
      expect(subAgentToolAllowed('web_fetch', 'chat-only')).toBe(true)
    })
  })
})

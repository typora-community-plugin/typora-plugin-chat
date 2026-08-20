import { beforeEach, describe, expect, it } from 'vitest'
import { currentAgentMode, isWriteTool, subAgentToolAllowed, SUBAGENT_EXCLUDED_TOOLS, toolAllowed, WRITE_TOOL_NAMES } from '../../src/agent/tools/permissions'
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

  it('gates write tools only in read-only mode', () => {
    expect(toolAllowed('edit_document', 'workspace-write')).toBe(true)
    expect(toolAllowed('edit_document', 'read-only')).toBe(false)
    expect(toolAllowed('create_file', 'read-only')).toBe(false)
    expect(toolAllowed('read_document', 'read-only')).toBe(true)
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
  })
})

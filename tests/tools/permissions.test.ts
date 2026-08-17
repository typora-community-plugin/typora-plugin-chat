import { beforeEach, describe, expect, it } from 'vitest'
import { currentAgentMode, isWriteTool, toolAllowed, WRITE_TOOL_NAMES } from '../../src/agent/tools/permissions'
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
      'get_backlinks',
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
})

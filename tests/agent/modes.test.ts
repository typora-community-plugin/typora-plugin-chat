import { beforeEach, describe, expect, it } from 'vitest'
import { settingsManager } from '../../src/config/settings'
import { ALL_MODES, currentMode, getMode, listModes, normalizeMode, subAgentToolAllowed } from '../../src/agent/modes/index'
import type { AgentModeStrategy } from '../../src/agent/modes/index'

const WRITE_TOOLS = ['edit_document', 'set_properties', 'create_file', 'delete_file', 'rename_file']
const READ_TOOLS = ['read_document', 'get_properties', 'open_document', 'read_file', 'search_vault', 'list_files']
const NON_FILE_TOOLS = ['get_current_datetime', 'ask_user', 'use_skill', 'update_todo', 'create_subagent', 'web_fetch', 'subbrowser']

function strategy(id: string): AgentModeStrategy {
  return ALL_MODES.find((m) => m.id === id)!
}

describe('mode strategies (3x3 semantic contract)', () => {
  describe.each(ALL_MODES.map((s) => [s.id, s]))('%s', (_id, s) => {
    it('keeps write tools only in workspace-write', () => {
      for (const name of WRITE_TOOLS) {
        expect(s.toolAllowed(name), `${name}`).toBe(_id === 'workspace-write')
      }
    })

    it('keeps read tools out of chat-only and in the other two modes', () => {
      for (const name of READ_TOOLS) {
        const expected = _id !== 'chat-only'
        expect(s.toolAllowed(name), `${name}`).toBe(expected)
      }
    })

    it('keeps non-file tools available in every mode', () => {
      for (const name of NON_FILE_TOOLS) {
        expect(s.toolAllowed(name), `${name}`).toBe(true)
      }
    })
  })

  it('exposes exactly the three registered strategies in dropdown order', () => {
    expect(listModes().map((m) => m.id)).toEqual(['chat-only', 'read-only', 'workspace-write'])
    expect(ALL_MODES).toHaveLength(3)
  })

  describe('blockReason (executor defense-in-depth copy)', () => {
    it('never blocks anything in workspace-write', () => {
      for (const name of [...WRITE_TOOLS, ...READ_TOOLS, ...NON_FILE_TOOLS]) {
        expect(strategy('workspace-write').blockReason(name), `${name}`).toBeNull()
      }
    })

    it('blocks write tools verbatim in read-only and chat-only', () => {
      for (const name of WRITE_TOOLS) {
        expect(strategy('read-only').blockReason(name)).toBe(
          `Blocked: ${name} requires write access (current mode is read-only).`,
        )
        expect(strategy('chat-only').blockReason(name)).toBe(
          `Blocked: ${name} requires write access (current mode is chat-only).`,
        )
      }
    })

    it('never blocks read tools in read-only', () => {
      for (const name of READ_TOOLS) {
        expect(strategy('read-only').blockReason(name), `${name}`).toBeNull()
      }
    })

    it('blocks read tools verbatim in chat-only only', () => {
      for (const name of READ_TOOLS) {
        expect(strategy('chat-only').blockReason(name)).toBe(`Blocked: ${name} is unavailable in chat-only mode.`)
        expect(strategy('workspace-write').blockReason(name), `${name}`).toBeNull()
      }
    })

    it('never blocks non-file tools', () => {
      for (const name of NON_FILE_TOOLS) {
        for (const s of ALL_MODES) {
          expect(s.blockReason(name), `${s.id} / ${name}`).toBeNull()
        }
      }
    })
  })

  describe('systemPromptLine', () => {
    it('is empty in workspace-write', () => {
      expect(strategy('workspace-write').systemPromptLine()).toBe('')
    })

    it('announces READ ONLY verbatim', () => {
      expect(strategy('read-only').systemPromptLine()).toBe(
        '\n- The current access mode is READ ONLY: do not modify any file; only read tools are available.',
      )
    })

    it('announces CHAT ONLY verbatim', () => {
      expect(strategy('chat-only').systemPromptLine()).toBe(
        '\n- The current access mode is CHAT ONLY: no vault/editor file tools (read or write) are available; answer conversationally using only the non-file tools.',
      )
    })
  })

  describe('canUndoRedo', () => {
    it('allows undo/redo in workspace-write and chat-only, blocks in read-only', () => {
      expect(strategy('workspace-write').canUndoRedo()).toBe(true)
      expect(strategy('chat-only').canUndoRedo()).toBe(true)
      expect(strategy('read-only').canUndoRedo()).toBe(false)
    })
  })

  describe('labelKey mapping', () => {
    it('maps each strategy to its existing i18n key', () => {
      expect(getMode('chat-only').labelKey).toBe('chat.modeChatOnly')
      expect(getMode('read-only').labelKey).toBe('chat.modeReadOnly')
      expect(getMode('workspace-write').labelKey).toBe('chat.modeWorkspaceWrite')
    })
  })

  describe('normalizeMode', () => {
    it('preserves known values', () => {
      expect(normalizeMode('read-only')).toBe('read-only')
      expect(normalizeMode('chat-only')).toBe('chat-only')
      expect(normalizeMode('workspace-write')).toBe('workspace-write')
    })

    it('collapses unknown values to workspace-write', () => {
      for (const v of ['something-else', '', null, undefined, 42, true]) {
        expect(normalizeMode(v)).toBe('workspace-write')
      }
    })

    it('getMode falls back to workspace-write for unknown ids', () => {
      expect(getMode('nonsense' as never).id).toBe('workspace-write')
    })
  })
})

describe('live mode resolution (settingsManager)', () => {
  beforeEach(async () => {
    await settingsManager.save({ mode: 'workspace-write' })
  })

  it('currentMode follows the stored settings', async () => {
    expect(currentMode().id).toBe('workspace-write')
    await settingsManager.save({ mode: 'read-only' })
    expect(currentMode().id).toBe('read-only')
    await settingsManager.save({ mode: 'chat-only' })
    expect(currentMode().id).toBe('chat-only')
  })

  it('currentMode normalizes a corrupted stored value', async () => {
    await settingsManager.save({ mode: 'bogus' as never })
    expect(currentMode().id).toBe('workspace-write')
  })

  describe('subAgentToolAllowed (no escalation)', () => {
    it('excludes create_subagent and ask_user in every mode', () => {
      for (const s of ALL_MODES) {
        expect(subAgentToolAllowed('create_subagent', s.id)).toBe(false)
        expect(subAgentToolAllowed('ask_user', s.id)).toBe(false)
      }
    })

    it('lets sub agents keep read tools in workspace-write and read-only (semantic fix)', () => {
      expect(subAgentToolAllowed('read_document', 'workspace-write')).toBe(true)
      expect(subAgentToolAllowed('read_document', 'read-only')).toBe(true)
    })

    it('drops all file tools for sub agents in chat-only, keeps non-file tools', () => {
      for (const name of [...WRITE_TOOLS, ...READ_TOOLS]) {
        expect(subAgentToolAllowed(name, 'chat-only'), `${name}`).toBe(false)
      }
      for (const name of ['web_fetch', 'subbrowser', 'use_skill']) {
        expect(subAgentToolAllowed(name, 'chat-only'), `${name}`).toBe(true)
      }
    })

    it('defaults to the live mode when no explicit mode is given', async () => {
      await settingsManager.save({ mode: 'read-only' })
      expect(subAgentToolAllowed('edit_document')).toBe(false)
      expect(subAgentToolAllowed('read_file')).toBe(true)
    })
  })
})

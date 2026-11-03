// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import InlinePopup from '../../src/inline/InlinePopup.svelte'
import { InlineSession } from '../../src/inline/inline-session.svelte'
import { renderMarkdown } from '../../src/utils/markdown-renderer'

vi.mock('@/i18n', () => ({
  t: {
    inline: {
      askPlaceholder: 'ASK',
      askSelectionPlaceholder: 'ASK_SELECTION',
      selected: 'Selected {count} chars',
      thinking: 'THINKING',
      stopped: 'STOPPED',
      replace: 'REPLACE',
      insert: 'INSERT',
      insertAfter: 'INSERT_AFTER',
      copy: 'COPY',
      copied: 'COPIED',
      copyFailed: 'COPY_FAILED',
      retry: 'RETRY',
      close: 'CLOSE',
      stop: 'STOP',
      emptyReply: 'EMPTY',
      error: 'Error: {message}',
      actions: { table: 'Table' },
    },
  },
  format: (template: string, params: Record<string, unknown>) =>
    template.replace(/\{([^}]+)\}/g, (_, name: string) => String(params[name])),
  getLocale: () => 'en',
}))

vi.mock('@/utils/markdown-renderer', () => ({ renderMarkdown: vi.fn() }))

const TEXT = { insertNoAnchor: 'NO_ANCHOR', insertFailed: 'INSERT_FAILED', copyFailed: 'COPY_FAILED', error: 'Error: {message}' }
const MSGS = [{ role: 'user' as const, content: 'hi' }]

function makeSession(reply = 'RESULT') {
  return new InlineSession({
    send: async () => reply,
    canInsert: () => true,
    insert: () => true,
    copy: async () => true,
    notify: () => {},
  }, TEXT)
}

function props(session: InlineSession, over: Record<string, unknown> = {}) {
  return {
    session,
    selectedText: 'picked',
    actionGroups: [[{ id: 'table' as const, label: 'Table' }]],
    hasSelection: true,
    canInsert: () => true,
    onRoot: () => {},
    onRun: vi.fn(),
    onAction: vi.fn(),
    onApply: vi.fn(),
    onRetry: vi.fn(),
    onAbort: vi.fn(),
    onCopy: vi.fn(async () => true),
    onClose: vi.fn(),
    ...over,
  }
}

describe('InlinePopup', () => {
  beforeEach(() => {
    vi.mocked(renderMarkdown).mockImplementation(async (markdown, target) => {
      target.textContent = markdown
    })
  })

  it('submits with Enter and renders the quick actions', async () => {
    const onRun = vi.fn()
    const { container } = render(InlinePopup, { props: props(makeSession(), { onRun }) })

    const input = container.querySelector('textarea') as HTMLTextAreaElement
    expect(input.placeholder).toBe('ASK_SELECTION')
    expect(screen.getByText('Table')).toBeTruthy()

    await fireEvent.input(input, { target: { value: '  hello  ' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRun).toHaveBeenCalledWith('  hello  ')

    cleanup()
  })

  it('shows insert actions once a reply arrives, and applies the chosen mode', async () => {
    const session = makeSession('RESULT')
    const onApply = vi.fn()
    render(InlinePopup, { props: props(session, { onApply }) })

    // Nothing to act on while idle.
    expect(screen.queryByText('REPLACE')).toBeNull()

    await session.run(MSGS)
    await tick()

    expect(screen.getByText('RESULT')).toBeTruthy()
    await fireEvent.click(screen.getByText('REPLACE'))
    expect(onApply).toHaveBeenCalledWith('replace')

    await fireEvent.click(screen.getByText('INSERT_AFTER'))
    expect(onApply).toHaveBeenCalledWith('after')

    cleanup()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { InlineSession } from '../../src/inline/inline-session.svelte'
import type { InlineDeps } from '../../src/inline/inline-session.svelte'

const TEXT = {
  insertNoAnchor: 'NO_ANCHOR',
  insertFailed: 'INSERT_FAILED',
  copyFailed: 'COPY_FAILED',
  error: 'Error: {message}',
}
const MSGS = [{ role: 'user' as const, content: 'hi' }]

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function makeDeps(over: Partial<InlineDeps> = {}): InlineDeps {
  return {
    send: vi.fn(async () => '```markdown\n| a |\n|---|\n```'),
    canInsert: vi.fn(() => true),
    insert: vi.fn(() => true),
    copy: vi.fn(async () => true),
    notify: vi.fn(),
    ...over,
  }
}

describe('InlineSession', () => {
  it('runs, cleans the reply and reaches done', async () => {
    const s = new InlineSession(makeDeps(), TEXT)
    expect(s.state.phase).toBe('idle')
    const run = s.run(MSGS)
    expect(s.state.phase).toBe('running')
    await run
    expect(s.state).toMatchObject({ phase: 'done', result: '| a |\n|---|' })
  })

  it('reports an empty reply and errors', async () => {
    const empty = new InlineSession(makeDeps({ send: async () => '   ' }), TEXT)
    await empty.run(MSGS)
    expect(empty.state.phase).toBe('empty')
    const failing = new InlineSession(makeDeps({ send: async () => { throw new Error('HTTP 401') } }), TEXT)
    await failing.run(MSGS)
    expect(failing.state).toMatchObject({ phase: 'error', error: 'Error: HTTP 401' })
  })

  it('fail() surfaces a precondition error', () => {
    const s = new InlineSession(makeDeps(), TEXT)
    s.fail('NO_MODEL')
    expect(s.state).toMatchObject({ phase: 'error', error: 'NO_MODEL' })
  })

  it('abort → aborted, and the request signal is aborted', async () => {
    let seen: AbortSignal | null = null
    const s = new InlineSession(makeDeps({
      send: (_m, signal) => { seen = signal; return new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('Aborted')))) },
    }), TEXT)
    const run = s.run(MSGS)
    s.abort()
    await run
    expect(seen!.aborted).toBe(true)
    expect(s.state.phase).toBe('aborted')
  })

  it('ignores a stale reply after retry (request id guard)', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const send = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const s = new InlineSession(makeDeps({ send }), TEXT)
    const r1 = s.run(MSGS)
    const r2 = s.retry()
    second.resolve('new')
    await r2
    first.resolve('old') // arrives late
    await r1
    expect(s.state).toMatchObject({ phase: 'done', result: 'new' })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('ignores replies after dispose (popup closed and reopened)', async () => {
    const d = deferred<string>()
    const s = new InlineSession(makeDeps({ send: () => d.promise }), TEXT)
    const run = s.run(MSGS)
    s.dispose()
    d.resolve('late')
    await run
    expect(s.state).toMatchObject({ phase: 'running', result: '' })
  })

  it('apply inserts when an anchor is available', async () => {
    const deps = makeDeps()
    const s = new InlineSession(deps, TEXT)
    await s.run(MSGS)
    expect(await s.apply('after')).toBe('inserted')
    expect(deps.insert).toHaveBeenCalledWith('| a |\n|---|', 'after')
    expect(deps.copy).not.toHaveBeenCalled()
  })

  it('apply without an anchor copies instead of inserting, and says why', async () => {
    const deps = makeDeps({ canInsert: () => false })
    const s = new InlineSession(deps, TEXT)
    await s.run(MSGS)
    expect(await s.apply('replace')).toBe('copied')
    expect(deps.insert).not.toHaveBeenCalled()
    expect(deps.notify).toHaveBeenCalledWith('NO_ANCHOR')
  })

  it('apply falls back to the clipboard when insertion fails, and reports clipboard failure', async () => {
    const deps = makeDeps({ insert: () => false })
    const s = new InlineSession(deps, TEXT)
    await s.run(MSGS)
    expect(await s.apply('replace')).toBe('copied')
    expect(deps.notify).toHaveBeenCalledWith('INSERT_FAILED')

    const noClip = makeDeps({ canInsert: () => false, copy: async () => false })
    const s2 = new InlineSession(noClip, TEXT)
    await s2.run(MSGS)
    expect(await s2.apply('replace')).toBe('failed')
    expect(noClip.notify).toHaveBeenCalledWith('COPY_FAILED')
  })

  it('apply does nothing before a result exists', async () => {
    const deps = makeDeps()
    expect(await new InlineSession(deps, TEXT).apply('replace')).toBe('nothing')
    expect(deps.insert).not.toHaveBeenCalled()
  })
})

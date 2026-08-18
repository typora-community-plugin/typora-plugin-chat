import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real i18n module reaches for `@typora-community-plugin/core` (`app`,
// which is `{}` in the test env) — accessing its properties would throw. Stub
// the whole module: with no init call, `t.chat.deleteConfirm` resolves to
// undefined and `confirmDeleteSession` must use its English fallback.
// A proxy that returns `undefined` for ANY property access (including nested
// paths like `t.chat.deleteConfirm`) — matching the uninitialized-i18n state.
const emptyI18n = new Proxy({} as Record<string, unknown>, { get: () => undefined })
vi.mock('@/i18n', () => ({ t: emptyI18n }))

/**
 * The store module keeps its state in module-level variables (writables + an
 * `initialized` flag), so each test resets all modules and re-imports to get a
 * clean instance. localStorage is cleared first; when it holds data,
 * `initSessionStore` restores exactly that persisted state — which doubles as
 * persistence coverage.
 */
async function freshStore() {
  localStorage.clear()
  vi.resetModules()
  const mod = await import('@/store/session-store')
  void mod.initSessionStore()
  return mod
}

describe('session-store', () => {
  beforeEach(() => localStorage.clear())

  it('initializes with exactly one default session and persists it', async () => {
    const store = await freshStore()
    expect(store.sessions.get()).toHaveLength(1)
    expect(store.activeSessionId.get()).toBe(store.sessions.get()[0]!.id)
    const raw = JSON.parse(localStorage.getItem('typora-plugin-chat.sessions') ?? '{}')
    expect(raw.sessions).toHaveLength(1)
  })

  it('restores previously persisted sessions (incl. active id)', async () => {
    let store = await freshStore()
    const a = store.createSession('A') // A becomes active, list grows to two
    const aId = a.id
    expect(store.activeSessionId.get()).toBe(aId)

    store = (await import('@/store/session-store')) as typeof store
    void store.initSessionStore()
    expect(store.sessions.get().map((s) => s.title)).toEqual(['Chat', 'A'])
    const aInRestored = store.sessions.get()[1]!
    expect(aInRestored.id).toBe(aId)
    expect(store.activeSessionId.get()).toBe(aInRestored.id)
  })

  describe('deleteSession', () => {
    it('returns undefined and leaves state untouched for an unknown id', async () => {
      const store = await freshStore()
      const before = store.sessions.get()
      const activeBefore = store.activeSessionId.get()
      expect(store.deleteSession('nope')).toBeUndefined()
      expect(store.sessions.get()).toEqual(before)
      expect(store.activeSessionId.get()).toBe(activeBefore)
    })

    it('deletes a non-active session and keeps the active one', async () => {
      const store = await freshStore()
      const [initial] = store.sessions.get()!
      const a = store.createSession('A') // A is now active; delete it → initial remains
      expect(store.deleteSession(a.id)).toBeUndefined()
      expect(store.sessions.get().map((s) => s.title)).toEqual(['Chat'])
      expect(store.activeSessionId.get()).toBe(initial!.id)

      // Now delete the remaining (active) one: a fresh default session replaces it.
      store.deleteSession(initial!.id)
      const next = store.sessions.get()
      expect(next).toHaveLength(1)
      expect(next[0]!.id).not.toBe(initial!.id)
      expect(store.activeSessionId.get()).toBe(next[0]!.id)
    })

    it('activates the most-recently-used session among survivors', async () => {
      const store = await freshStore()
      const a = store.createSession('A') // active: A, updatedAt newest at this point
      const b = store.createSession('B') // active: B (newer than A)
      expect(store.deleteSession(b.id)).toBeUndefined()
      // Survivors: default + A → the newer one is A.
      expect(store.sessions.get().map((s) => s.title)).toEqual(['Chat', 'A'])
      expect(store.activeSessionId.get()).toBe(a.id)
    })

    it('persists deletions to localStorage', async () => {
      const store = await freshStore()
      const a = store.createSession('A')
      store.deleteSession(a.id)
      const raw = JSON.parse(localStorage.getItem('typora-plugin-chat.sessions') ?? '{}')
      expect(raw.sessions).toHaveLength(1)
      expect(raw.activeSessionId).toBe(raw.sessions[0].id)
    })

    it("keeps the surviving session's messages and history intact", async () => {
      const store = await freshStore()
      const a = store.createSession('A') // A active
      store.saveActiveSession(
        [{ id: 'm1', type: 'user' as const, text: 'hi', timestamp: Date.now() }],
        [],
      )
      const [initial] = store.sessions.get()!
      expect(store.deleteSession(initial!.id)).toBeUndefined()
      const remaining = store.sessions.get()[0]!
      expect(remaining.id).toBe(a.id)
      expect(remaining.messages.map((m) => m.text)).toEqual(['hi'])
    })

    it('deleting the last session replaces it with a fresh default', async () => {
      const store = await freshStore()
      // Delete until only one remains, then delete that one.
      while (store.sessions.get().length > 1) store.deleteSession(store.sessions.get()[0]!.id)
      const [only] = store.sessions.get()!
      expect(store.deleteSession(only!.id)).toBeUndefined()
      expect(store.sessions.get()).toHaveLength(1)
    })
  })

  describe('confirmDeleteSession', () => {
    it('falls back to an English prompt (i18n uninitialized in tests) and asks the user', async () => {
      const store = await freshStore()
      const spy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      expect(store.confirmDeleteSession('My Session')).toBe(true)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(String(spy.mock.calls[0]![0])).toContain('My Session')
    })

    it('returns false when the user declines', async () => {
      const store = await freshStore()
      const spy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      expect(store.confirmDeleteSession('My Session')).toBe(false)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('returns false outside a browser (no window.confirm)', async () => {
      const store = await freshStore()
      const realWindow = globalThis.window
      try {
        Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true })
        expect(store.confirmDeleteSession('X')).toBe(false)
      } finally {
        Object.defineProperty(globalThis, 'window', { value: realWindow, configurable: true })
      }
    })
  })
})

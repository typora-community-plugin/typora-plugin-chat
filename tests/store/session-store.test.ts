import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApp } from '../setup'

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
async function freshStore(vaultPath = '/vault') {
  localStorage.clear()
  mockApp.vault.path = vaultPath
  vi.resetModules()
  const mod = await import('@/store/session-store')
  void mod.setVaultScope(mockApp.vault.path)
  void mod.initSessionStore()
  return mod
}

// Must match the store's key algorithm: `SESSIONS_KEY:<fnv1a hex of path>`.
function hashPath(path: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

const scopedKey = (path: string) => `typora-plugin-chat.sessions:${path ? hashPath(path) : 'global'}`

describe('session-store', () => {
  beforeEach(() => localStorage.clear())

  it('initializes with exactly one default session and persists it', async () => {
    const store = await freshStore()
    expect(store.sessions.get()).toHaveLength(1)
    expect(store.activeSessionId.get()).toBe(store.sessions.get()[0]!.id)
    const raw = JSON.parse(localStorage.getItem(scopedKey('/vault')) ?? '{}')
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
      const raw = JSON.parse(localStorage.getItem(scopedKey('/vault')) ?? '{}')
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

  describe('vault isolation', () => {
    it('persists each vault under its own key and never leaks sessions across vaults', async () => {
      const storeA = await freshStore('/vault-a')
      storeA.createSession('OnlyInA')

      // Simulate the plugin switching vaults (main.ts calls setVaultScope + reload).
      mockApp.vault.path = '/vault-b'
      void storeA.setVaultScope(mockApp.vault.path)
      void storeA.reloadSessionStore()

      expect(storeA.sessions.get().map((s) => s.title)).toEqual(['Chat'])
      const rawB = JSON.parse(localStorage.getItem(scopedKey('/vault-b')) ?? '{}')
      expect(rawB.sessions.map((s: { title: string }) => s.title)).toEqual(['Chat'])

      // Switch back: vault A's sessions are intact and untouched by B.
      mockApp.vault.path = '/vault-a'
      void storeA.setVaultScope(mockApp.vault.path)
      void storeA.reloadSessionStore()
      expect(storeA.sessions.get().map((s) => s.title)).toEqual(['Chat', 'OnlyInA'])

      // Both keys coexist in storage.
      const rawA = JSON.parse(localStorage.getItem(scopedKey('/vault-a')) ?? '{}')
      expect(rawA.sessions.map((s: { title: string }) => s.title)).toEqual(['Chat', 'OnlyInA'])
    })

    it('keeps the previous vault\'s active session id when switching back to a vault that has data', async () => {
      const store = await freshStore('/vault-a')
      const a = store.createSession('KeepMeActive')
      expect(store.activeSessionId.get()).toBe(a.id)

      mockApp.vault.path = '/vault-b'
      void store.setVaultScope(mockApp.vault.path)
      void store.reloadSessionStore()
      const bDefault = store.sessions.get()[0]!
      expect(store.activeSessionId.get()).toBe(bDefault.id)

      mockApp.vault.path = '/vault-a'
      void store.setVaultScope(mockApp.vault.path)
      void store.reloadSessionStore()
      expect(store.activeSessionId.get()).toBe(a.id)
    })

    it('is a no-op when the vault has not changed', async () => {
      const store = await freshStore('/vault-a')
      store.createSession('X')
      const before = store.sessions.get().length
      void store.reloadSessionStore()
      expect(store.sessions.get()).toHaveLength(before)
    })

    it('migrates legacy unscoped sessions into the current vault key exactly once', async () => {
      localStorage.clear()
      mockApp.vault.path = '/vault-legacy'
      vi.resetModules()
      const mod = await import('@/store/session-store')
      // Pre-seed what an older plugin version wrote.
      localStorage.setItem(
        'typora-plugin-chat.sessions',
        JSON.stringify({ sessions: [{ id: 'old1', title: 'Legacy', createdAt: 0, updatedAt: 0, messages: [], history: [] }], activeSessionId: 'old1' }),
      )

      void mod.setVaultScope(mockApp.vault.path)
      void mod.initSessionStore()

      expect(mod.sessions.get().map((s) => s.title)).toEqual(['Legacy'])
      expect(localStorage.getItem('typora-plugin-chat.sessions')).toBeNull()
      const migrated = JSON.parse(localStorage.getItem(scopedKey('/vault-legacy')) ?? '{}')
      expect(migrated.sessions.map((s: { title: string }) => s.title)).toEqual(['Legacy'])

      // A second init (fresh module, same storage) must not re-migrate or clobber.
      vi.resetModules()
      const mod2 = await import('@/store/session-store')
      void mod2.setVaultScope(mockApp.vault.path)
      void mod2.initSessionStore()
      expect(mod2.sessions.get().map((s) => s.title)).toEqual(['Legacy'])
    })

    it('migrated legacy data does not leak into other vaults', async () => {
      localStorage.clear()
      mockApp.vault.path = '/vault-legacy'
      vi.resetModules()
      const mod = await import('@/store/session-store')
      localStorage.setItem(
        'typora-plugin-chat.sessions',
        JSON.stringify({ sessions: [{ id: 'old1', title: 'Legacy', createdAt: 0, updatedAt: 0, messages: [], history: [] }], activeSessionId: 'old1' }),
      )
      void mod.setVaultScope(mockApp.vault.path)
      void mod.initSessionStore()

      // Switch to a different vault: it must start fresh, without the legacy session.
      mockApp.vault.path = '/vault-other'
      void mod.setVaultScope(mockApp.vault.path)
      void mod.reloadSessionStore()
      expect(mod.sessions.get().map((s) => s.title)).toEqual(['Chat'])
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

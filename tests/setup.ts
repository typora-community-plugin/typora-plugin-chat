import { vi } from 'vitest'


/**
 * Mock the Typora plugin core module globally for the test environment.
 * Individual tests can access the mocks via `vi.mocked(...)`.
 */

const mockFs = {
  readText: vi.fn(),
  readTextSync: vi.fn(),
  writeText: vi.fn(),
  appendText: vi.fn(),
  exists: vi.fn(),
  listFiles: vi.fn(),
  // Non-recursive directory listing used by skill discovery.
  list: vi.fn(),
  isDirectory: vi.fn(),
  mkdir: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
  trash: vi.fn(),
}

const mockApp = {
  vault: { path: '/vault', configDir: '/vault/.typora', dataDir: '/vault/.typora' },
  i18n: { locale: 'en' },
  workspace: {
    activeFile: 'notes/active.md',
    activeEditor: {
      getMarkdown: vi.fn(() => '# Active doc'),
      setMarkdown: vi.fn(),
      openFile: vi.fn(),
    },
    getViewByType: vi.fn(),
    on: vi.fn(),
  },
  features: {
    markdownRenderer: { renderTo: vi.fn() },
  },
  commands: { register: vi.fn(), run: vi.fn() },
  viewManager: { registerView: vi.fn() },
}

vi.mock('os', () => {
  // Skill discovery (paths.ts) resolves the global root from the OS home dir.
  return { homedir: vi.fn(() => '/home') }
})

// session-store persists to localStorage and its confirm dialog uses window.confirm;
// neither exists in the node test environment. Provide minimal globals that every
// suite can rely on (a fresh map per file, an always-accepting confirmation).
const storage = new Map<string, string>()
if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, String(v)),
      removeItem: (k: string) => void storage.delete(k),
      clear: () => storage.clear(),
    },
  })
}
if (!globalThis.window) {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
}
Object.defineProperty(globalThis, 'confirm', {
  configurable: true,
  writable: true,
  value: (message?: string) => String(message ?? ''),
})

vi.mock('@typora-community-plugin/core', () => ({
  app: mockApp,
  fs: mockFs as Record<string, unknown>,
  path: {
    sep: '/',
    isAbsolute: (p: string) => p.startsWith('/'),
    basename: (p: string) => p.split('/').pop() ?? p,
    extname: (p: string) => (p.includes('.') ? p.slice(p.lastIndexOf('.')) : ''),
    dirname: (p: string) => p.split('/').slice(0, -1).join('/') || '/',
    join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
    relative: (from: string, to: string) => to,
  },
  WorkspaceView: class {},
  I18n: class {
    locale: string
    t: Record<string, unknown>
    constructor(options: { resources?: Record<string, Record<string, unknown>>; userLang?: string; defaultLang?: string } = {}) {
      const { resources = {}, userLang, defaultLang = 'en' } = options
      this.locale = userLang ?? defaultLang
      this.t = resources[this.locale] ?? resources.en ?? {}
    }
  },
  format: (template: string, params: Record<string, unknown>) =>
    template.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const value = params[name]
      return value === undefined || value === null ? _ : String(value)
    }),
  Plugin: class {},
  PluginSettings: class {},
  Component: class {},
  Events: class {},
  SettingTab: class {},
  Notice: class {},
  Modal: class {},
  openInputBox: vi.fn(),
  openQuickPick: vi.fn(),
}))

export { mockApp, mockFs }

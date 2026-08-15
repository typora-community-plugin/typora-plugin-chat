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
  mkdir: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
  trash: vi.fn(),
}

const mockApp = {
  vault: { path: '/vault', configDir: '/vault/.typora', dataDir: '/vault/.typora' },
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

vi.mock('@typora-community-plugin/core', () => ({
  app: mockApp,
  fs: mockFs,
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

/**
 * Runtime stub for the types-only `@typora-community-plugin/core` package
 * (`main` is empty, so vitest cannot resolve it on its own).
 *
 * `tests/setup.ts` replaces this stub with `vi.mock(...)` factories for every
 * suite; this module only exists so the module id can be resolved at all.
 */

export const app = {}
export const fs = {}
export const path = { join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/') }

export class I18n {
  locale: string
  t: Record<string, unknown>

  constructor(options: { resources?: Record<string, Record<string, unknown>>; userLang?: string; defaultLang?: string } = {}) {
    const { resources = {}, userLang, defaultLang = 'en' } = options
    this.locale = userLang ?? defaultLang
    this.t = resources[this.locale] ?? resources.en ?? {}
  }
}

export const format = (template: string, params: Record<string, unknown>): string =>
  template.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = params[name]
    return value === undefined || value === null ? _ : String(value)
  })

export class WorkspaceView {}
export class Plugin {}
export class PluginSettings {}
export class Component {}
export class Events {}
export class SettingTab {}
export class Notice {}
export class Modal {}

export const openInputBox = () => {}
export const openQuickPick = () => {}

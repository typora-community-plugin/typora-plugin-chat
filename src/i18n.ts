import { app, I18n, path } from '@typora-community-plugin/core'
import type * as Locale from './locales/lang.en.json'


let i18n: I18n<typeof Locale> | undefined

/**
 * Initialize the plugin i18n instance from the installed plugin directory.
 * Must be called from the plugin's `onload()` before any UI is rendered.
 */
export function initI18n(manifestDir: string): void {
  i18n = new I18n<typeof Locale>({
    localePath: path.join(manifestDir, 'locales'),
    userLang: (app as { i18n?: { locale?: string } }).i18n?.locale ?? 'en',
  })
}

function getT(): typeof Locale {
  return i18n?.t ?? ({} as typeof Locale)
}

/**
 * Proxy that always reads from the current i18n instance. This lets modules
 * import `t` once while the real locale is only known after plugin load.
 */
export const t = new Proxy({} as typeof Locale, {
  get(_target, key: string | symbol) {
    return (getT() as Record<string | symbol, unknown>)[key]
  },
}) as typeof Locale

/** Resolved locale key, e.g. `en` or `zh-cn`. */
export function getLocale(): string {
  return i18n?.locale ?? 'en'
}

/** Interpolate `{key}` placeholders in a localized template. */
export function format(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = params[name]
    return value === undefined || value === null ? _ : String(value)
  })
}

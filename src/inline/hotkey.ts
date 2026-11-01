/**
 * Hotkey helpers mirroring core's HotkeyManager format ("Cmd+J", "Ctrl+Shift+K").
 *
 * Core matches hotkeys on `keyup`. On macOS, WebKit does not dispatch `keyup`
 * for a key released while ⌘ is held, so any ⌘ hotkey registered through core
 * never fires there. For those (and only those) the plugin matches on
 * `keydown` itself, reading the command's *current* hotkey so a binding
 * changed in Settings → Hotkey keeps working.
 */

const MODIFIER_ORDER = ['meta', 'ctrl', 'shift', 'alt']

/** Canonical form: lower-case, `meta|ctrl|shift|alt` first in a fixed order, then the key. */
export function normalizeHotkey(hotkey: string): string {
  const parts = hotkey
    .toLowerCase()
    .split('+')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => (/^(cmd|command|win|meta|⌘)$/.test(p) ? 'meta'
      : /^(ctrl|control|⌃)$/.test(p) ? 'ctrl'
        : /^(opt|option|alt|⌥)$/.test(p) ? 'alt'
          : /^(shift|⇧)$/.test(p) ? 'shift' : p))
  const mods = MODIFIER_ORDER.filter(m => parts.includes(m))
  const keys = parts.filter(p => !MODIFIER_ORDER.includes(p))
  return [...mods, ...keys].join('+')
}

/** Canonical form of a keyboard event, or '' for a lone modifier key. */
export function eventHotkey(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): string {
  const key = (event.key || '').toLowerCase()
  if (!key || ['meta', 'control', 'shift', 'alt'].includes(key)) return ''
  const mods = [
    event.metaKey && 'meta',
    event.ctrlKey && 'ctrl',
    event.shiftKey && 'shift',
    event.altKey && 'alt',
  ].filter(Boolean) as string[]
  return [...mods, key].join('+')
}

/** Whether core cannot deliver this hotkey on this platform (⌘ on macOS). */
export function needsKeydownFallback(hotkey: string | null | undefined, isMac: boolean): boolean {
  return !!hotkey && isMac && normalizeHotkey(hotkey).split('+').includes('meta')
}

import * as os from 'os'
import { app, path } from '@typora-community-plugin/core'


/**
 * Skill root directories.
 *
 * - Global: `~/.agents/skills`, a stable per-user location outside any vault.
 *   The OS home directory is resolved via Node's `os` module (available in the
 *   Typora plugin sandbox, where core exposes no dedicated home helper); if it
 *   cannot be determined the global root simply contributes nothing.
 * - Vault: `<vault root>/.agents/skills`, versionable alongside the notes.
 */

export function globalSkillsDir(): string | null {
  let home: string | undefined
  try {
    home = os.homedir()
  } catch {
    return null
  }
  if (!home) return null
  return path.join(home, '.agents', 'skills')
}

export function vaultSkillsDir(): string | null {
  const root = app.vault.path
  if (!root) return null
  return path.join(root, '.agents', 'skills')
}

/**
 * All skill roots to scan, highest precedence first. `discoverSkills` dedupes
 * by name so vault entries shadow global ones with the same name.
 */
export function skillRoots(): Array<{ dir: string; source: 'global' | 'vault' }> {
  const roots: Array<{ dir: string; source: 'global' | 'vault' }> = []
  const vaultDir = vaultSkillsDir()
  if (vaultDir) roots.push({ dir: vaultDir, source: 'vault' })
  const globalDir = globalSkillsDir()
  if (globalDir && (!vaultDir || path.join(globalDir) !== path.join(vaultDir))) {
    roots.push({ dir: globalDir, source: 'global' })
  }
  return roots
}

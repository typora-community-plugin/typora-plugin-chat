import { writable } from 'svelte/store'
import type { DiscoveredSkill } from './index'
import { discoverSkills } from './index'


/**
 * Reactive view of the currently discovered skills, used by the input bar for
 * `/skill:` autocomplete. The agent loop does NOT read this store — it always
 * re-discovers on disk at turn start so a freshly added SKILL.md is picked up
 * even if rescan() has not run yet.
 */
export const skills = writable<DiscoveredSkill[]>([])

let rescanning: Promise<void> | null = null

/** Re-scan both skill roots and update the store. Coalesces concurrent calls. */
export function rescanSkills(): Promise<void> {
  if (!rescanning) {
    rescanning = discoverSkills()
      .then(list => skills.set(list))
      .catch(() => { /* unreadable roots simply yield no skills */ })
      .finally(() => { rescanning = null })
  }
  return rescanning
}

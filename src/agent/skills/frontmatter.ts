/**
 * Minimal YAML-subset frontmatter parser for SKILL.md files.
 *
 * Supports the flat `key: value` shape that skill catalogs actually use:
 *
 *   ---
 *   name: my-skill
 *   description: One line describing when to use this skill.
 *   ---
 *   <markdown body>
 *
 * Deliberately not a full YAML implementation (no dependency, no nested or
 * multi-line values). A missing/empty frontmatter block falls back to the
 * directory basename for `name` and the first paragraph of the body for
 * `description`, so hand-written skills without metadata still work.
 */

export interface ParsedFrontmatter {
  meta: Record<string, string>
  body: string
}

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const MAX_DESCRIPTION_LENGTH = 160

export function parseFrontmatter(text: string): ParsedFrontmatter {
  const match = text.match(FRONTMATTER_RE)
  if (!match) return { meta: {}, body: text }

  const meta: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    // Only flat `key: value` pairs are recognised; indented lines and nested
    // structures are skipped rather than mis-parsed.
    if (line.match(/^\s+[\w-]+:/)) continue
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim()
    let value = line.slice(colon + 1).trim()
    // Strip surrounding quotes on scalar values.
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key) meta[key] = value
  }

  const body = text.slice(match[0].length).replace(/^\r?\n/, '')
  return { meta, body }
}

/** First non-empty paragraph of the markdown body, flattened to one line. */
function firstParagraph(body: string): string {
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const flat = block.replace(/\s+/g, ' ').trim()
    if (flat) return flat
  }
  return ''
}

/** Derive name/description from a SKILL.md file plus its directory basename. */
export function deriveSkillMeta(
  text: string,
  dirBasename: string,
): { name: string; description: string } {
  const { meta, body } = parseFrontmatter(text)

  let name = (meta.name ?? '').trim() || dirBasename
  if (!name) name = 'skill'

  let description = (meta.description ?? '').trim()
  if (!description) {
    description = firstParagraph(body)
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = `${description.slice(0, MAX_DESCRIPTION_LENGTH).trimEnd()}…`
    }
  }
  if (!description) description = '(no description)'

  return { name, description }
}

/** Strip the frontmatter block from a SKILL.md file, keeping only the body. */
export function stripFrontmatter(text: string): string {
  const match = text.match(FRONTMATTER_RE)
  if (!match) return text
  return text.slice(match[0].length).replace(/^\r?\n/, '')
}

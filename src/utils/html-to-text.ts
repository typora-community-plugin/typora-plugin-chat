/**
 * Lightweight HTML → readable text extractor (no external dependencies).
 *
 * A single regex-based pipeline works identically everywhere the plugin runs
 * (Typora render process, node test env), so no DOM implementation is needed.
 */

const STRIP_TAGS = ['script', 'style', 'noscript', 'template', 'head', 'iframe', 'object', 'embed']

export interface ParsedPage {
  title: string
  text: string
}

/** Extract the page <title> (falls back to '' when absent). */
export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : ''
}

/** Convert an HTML document into readable plain text with a minimal markdown flavor. */
export function htmlToText(html: string): ParsedPage {
  const title = extractTitle(html)
  return { title, text: normalize(convertBody(html)) }
}

function convertBody(html: string): string {
  let out = html
    // Drop non-content regions entirely.
    // `\W` after the tag name keeps `head` from matching `<html>` etc. (non-greedy
    // body match stops at the first closing tag of that type).
    .replace(new RegExp(`<(${STRIP_TAGS.join('|')})\\W[\\s\\S]*?<\\/\\1>`, 'gi'), ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  // Links: [label](href) for http(s)/relative targets; label only otherwise.
  out = out.replace(
    /<a\b[^>]*?href\s*=\s*(["'])([^"'\s>]+)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, _quote: string, href: string, labelHtml: string) => {
      const label = inlineText(labelHtml).trim()
      if (!label) return ''
      const cleanHref = decodeEntities(href.trim())
      const isUsable = /^https?:\/\//i.test(cleanHref) || (/^[\w./#?&%@=-]/.test(cleanHref) && !/^mailto:/i.test(cleanHref))
      return isUsable ? `[${label}](${cleanHref})` : label
    },
  )

  // Images: keep alt text as a marker (imgs without alt are dropped).
  out = out.replace(/<img\b[^>]*?alt\s*=\s*(["'])([\s\S]*?)\1[^>]*>/gi, (_match, _q: string, alt: string) => {
    const label = decodeEntities(alt).trim()
    return label ? `[image: ${label}]` : ''
  })

  // Headings become markdown.
  for (let level = 1; level <= 6; level++) {
    out = out.replace(new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'gi'), (_match, inner: string) => {
      const text = inlineText(inner).trim()
      return text ? `\n\n${'#'.repeat(level)} ${text}\n\n` : ''
    })
  }

  // List items get a bullet (or index for ordered lists is out of scope — keep it simple).
  out = out.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match, inner: string) => {
    const text = inlineText(inner).trim()
    return text ? `\n- ${text}` : ''
  })

  // Block boundaries become line breaks.
  out = out.replace(/<br\s*\/?>/gi, '\n')
  out = out.replace(
    /<\/?(p|div|section|article|header|footer|main|aside|ul|ol|table|tr|blockquote|pre|figure|figcaption|dl|dt|dd|form)\b[^>]*>/gi,
    '\n',
  )

  // Strip every remaining tag.
  out = out.replace(/<[^>]+>/g, '')
  return decodeEntities(out)
}

/** Reduce nested inline markup to plain text (used inside link/heading/list conversion). */
function inlineText(html: string): string {
  return html
    .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, '$2')
    .replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, '$2')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<[^>]+>/g, '')
}

function normalize(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/^ +| +$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&#38;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&ndash;': '-', '&mdash;': '—',
}

function decodeEntities(text: string): string {
  return text.replace(/&#x([0-9a-fA-F]+);|&#(\d+);|&[a-zA-Z][a-zA-Z0-9]*;/g, (entity, hex?: string, decimal?: string) => {
    if (hex !== undefined) {
      const code = parseInt(hex, 16)
      return safeCodePoint(code, entity)
    }
    if (decimal !== undefined) {
      return safeCodePoint(Number(decimal), entity)
    }
    return ENTITIES[entity.toLowerCase()] ?? entity
  })
}

function safeCodePoint(code: number, fallback: string): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback
}

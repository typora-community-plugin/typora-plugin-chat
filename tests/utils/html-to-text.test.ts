import { describe, expect, it } from 'vitest'
import { extractTitle, htmlToText } from '../../src/utils/html-to-text'


describe('extractTitle', () => {
  it('reads the <title> element', () => {
    expect(extractTitle('<html><head><title>My Page</title></head></html>')).toBe('My Page')
  })

  it('decodes entities and collapses whitespace', () => {
    expect(extractTitle('<title>Hello\n   &amp; world</title>')).toBe('Hello & world')
  })

  it('returns an empty string when no title exists', () => {
    expect(extractTitle('<html><body><p>x</p></body></html>')).toBe('')
  })
})

describe('htmlToText', () => {
  it('keeps body text and drops script/style content', () => {
    const html = `<html><head><script>var x = "SECRET";</script><style>.a{color:red}</style></head>
      <body><h1>Title here</h1><p>Hello &amp; welcome to the page.</p><script>alert(1)</script></body></html>`
    const { text } = htmlToText(html)
    expect(text).toContain('Hello & welcome to the page.')
    expect(text).not.toContain('SECRET')
    expect(text).not.toContain('color:red')
    expect(text).not.toContain('<p>')
  })

  it('converts headings to markdown', () => {
    const html = '<html><body><h2>Section</h2><p>Body text</p></body></html>'
    const { text } = htmlToText(html)
    expect(text).toContain('## Section')
    expect(text).toContain('Body text')
  })

  it('converts lists to markdown bullets', () => {
    const html = '<html><body><ul><li>one</li><li>two</li></ul></body></html>'
    const { text } = htmlToText(html)
    expect(text).toContain('- one')
    expect(text).toContain('- two')
  })

  it('converts links to markdown links', () => {
    const html = '<html><body><p>Visit <a href="https://example.com">Example</a> now.</p></body></html>'
    const { text } = htmlToText(html)
    expect(text).toContain('[Example](https://example.com)')
  })

  it('keeps img alt text as a marker', () => {
    const html = '<html><body><figure><img src="a.png" alt="A chart"></figure></body></html>'
    const { text } = htmlToText(html)
    expect(text).toContain('[image: A chart]')
  })

  it('decodes numeric entities', () => {
    const html = '<html><body><p>caf&#233; &amp; co</p></body></html>'
    const { text } = htmlToText(html)
    expect(text).toContain('café & co')
  })

  it('returns an empty string for a document without body content', () => {
    const { text, title } = htmlToText('<html><head><title>T</title></head></html>')
    expect(title).toBe('T')
    expect(text).toBe('')
  })

  it('normalizes excess blank lines', () => {
    const html = '<html><body><p>a</p><div><div><div>b</div></div></div></body></html>'
    const { text } = htmlToText(html)
    expect(text).not.toMatch(/\n{3,}/)
  })

  it('converts ordered list items to bullets', () => {
    const html = '<html><body><ol><li>first</li></ol></body></html>'
    const { text } = htmlToText(html)
    expect(text).toContain('- first')
  })

  it('keeps relative link targets as markdown links', () => {
    const html = '<html><body><p>See <a href="/docs/a">the docs</a>.</p></body></html>'
    const { text } = htmlToText(html)
    expect(text).toContain('[the docs](/docs/a)')
  })
})

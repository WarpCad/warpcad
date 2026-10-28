// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { gistLink } from './gistLink.js'
import {
  MAX_LISTED_BODIES,
  MAX_BODY_NAME_CHARS,
  MAX_NAME_CHARS,
  MAX_NOTE_CHARS,
  escapeMarkdownText,
  formatPublishedAt,
  gistReadme,
} from './gistReadme.js'

/**
 * `TODO/io-017` Stage 1 — the generated `README.md`. Names and the note are **data, never
 * instructions** and never markup: whatever a user typed into a body name must reach github.com
 * as inert text. Standing instructions, intent text and the AI conversation are never carried.
 */

const ID = '0123456789abcdef0123456789abcdef'
const RAW = `https://gist.githubusercontent.com/octo/${ID}/raw/phone-stand.ndjson`
const AT = Date.UTC(2026, 9, 27, 14, 5, 59)

/** @param {Partial<import('./gistReadme.js').GistReadmeInput>} [over] */
function input(over = {}) {
  return {
    name: 'Phone stand',
    note: 'A stand for a phone, 70° angle, for the desk.',
    bodies: ['Base', 'Back plate', 'Lip', 'Cable notch'],
    publishedAt: AT,
    id: ID,
    rawUrl: RAW,
    fileName: 'phone-stand.ndjson',
    ...over,
  }
}

describe('gistReadme — the template', () => {
  it('matches the spec template exactly for the worked example', () => {
    expect(gistReadme(input())).toBe(
      [
        '# Phone stand',
        '',
        '> A stand for a phone, 70° angle, for the desk\\.',
        '',
        `**[Open in WarpCad](${gistLink(ID)})** — nothing to install, no account.`,
        '',
        '- 4 bodies: Base, Back plate, Lip, Cable notch',
        '- Last published 2026-10-27 14:05 UTC',
        `- Project file: [phone\\-stand\\.ndjson](<${RAW}>)`,
        '',
        'Made with WarpCad. This page is generated; edits are overwritten when the project is published again.',
        '',
      ].join('\n'),
    )
  })

  it('is deterministic: the same input gives the same text', () => {
    expect(gistReadme(input())).toBe(gistReadme(input()))
    expect(gistReadme(input({ publishedAt: new Date(AT) }))).toBe(gistReadme(input()))
    expect(gistReadme(input({ publishedAt: new Date(AT).toISOString() }))).toBe(gistReadme(input()))
  })

  it('omits the blockquote for an empty or blank note', () => {
    for (const note of ['', '   ', '\n\n', undefined]) {
      const text = gistReadme(input({ note }))
      expect(text).not.toMatch(/^>/m)
      expect(text.startsWith('# Phone stand\n\n**[Open in WarpCad]')).toBe(true)
    }
  })

  it('quotes every line of a multi-line note', () => {
    const text = gistReadme(input({ note: 'line one\nline two\n\nline four' }))
    expect(text).toContain('> line one\n> line two\n>\n> line four\n')
  })

  it('uses "Untitled" for a blank name, and the singular for one body', () => {
    const text = gistReadme(input({ name: '  ', bodies: ['Base'] }))
    expect(text.startsWith('# Untitled\n')).toBe(true)
    expect(text).toContain('- 1 body: Base\n')
  })

  it('says so when there are no bodies', () => {
    expect(gistReadme(input({ bodies: [] }))).toContain('- No bodies\n')
  })

  it('leaves out the Open link while the id is not known yet (the first POST placeholder)', () => {
    for (const id of [null, undefined]) {
      const text = gistReadme(input({ id, rawUrl: undefined }))
      expect(text).not.toContain('Open in WarpCad')
      expect(text).not.toContain('#/gist/')
      expect(text).not.toContain('Project file')
      expect(text).toContain('- 4 bodies:')
    }
  })

  it('refuses an id that is not a gist id rather than building a link from it', () => {
    expect(() => gistReadme(input({ id: '../../x' }))).toThrow()
  })

  it('omits the project-file line for a raw link that is not on gist.githubusercontent.com over https', () => {
    for (const rawUrl of [
      'javascript:alert(1)',
      'http://gist.githubusercontent.com/x/raw/a.ndjson',
      'https://evil.example/raw/a.ndjson',
      'https://gist.githubusercontent.com.evil.example/a',
      'https://gist.githubusercontent.com/a b>c',
      'not a url',
    ]) {
      const text = gistReadme(input({ rawUrl }))
      expect(text).not.toContain('Project file')
      expect(text).not.toContain('javascript')
      expect(text).not.toContain('evil')
    }
  })

  it('formats the published time as YYYY-MM-DD HH:MM UTC, whatever the local zone', () => {
    expect(formatPublishedAt(AT)).toBe('2026-10-27 14:05 UTC')
    expect(formatPublishedAt(Date.UTC(2027, 0, 2, 3, 4))).toBe('2027-01-02 03:04 UTC')
    expect(formatPublishedAt('2026-10-27T23:59:00-02:00')).toBe('2026-10-28 01:59 UTC')
    expect(() => formatPublishedAt('not a date')).toThrow()
    expect(() => gistReadme(input({ publishedAt: Number.NaN }))).toThrow()
  })
})

describe('gistReadme — names and note are inert text', () => {
  const hostile = [
    '[x](javascript:alert(1))',
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '![pic](https://evil.example/t.png)',
    '**bold** _em_ `code` ~~gone~~',
    '# heading',
    '&lt;already&gt; &amp;',
    '<!-- comment -->',
    '[ref]: https://evil.example',
    '| table | row |',
  ]

  it.each(hostile)('a body named %j renders as text, never as a link, image, tag or emphasis', (name) => {
    const text = gistReadme(input({ bodies: [name], name, note: name }))
    // No raw angle bracket from the data survives: every `<` is ours (the raw link) or an entity.
    const withoutOurs = text.replace(`(<${RAW}>)`, '')
    expect(withoutOurs).not.toMatch(/<[a-z!/]/i)
    // No unescaped link/image/emphasis openers from the data.
    expect(text).not.toContain('](javascript')
    expect(text).not.toContain('![')
    expect(text).not.toMatch(/(^|[^\\])\[x\]\(/)
    expect(text).not.toMatch(/(^|[^\\])\*\*bold/)
  })

  it('escapes Markdown punctuation and HTML in text', () => {
    expect(escapeMarkdownText('[x](javascript:alert(1))')).toBe('\\[x\\]\\(javascript:alert\\(1\\)\\)')
    expect(escapeMarkdownText('<img onerror=x>')).toBe('&lt;img onerror=x&gt;')
    expect(escapeMarkdownText('a & b')).toBe('a &amp; b')
    expect(escapeMarkdownText('&lt;')).toBe('&amp;lt;')
    expect(escapeMarkdownText('*_`#!|~\\')).toBe('\\*\\_\\`\\#\\!\\|\\~\\\\')
  })

  it('puts a name with line breaks on one line, so it cannot start a new block', () => {
    const text = gistReadme(input({ name: 'A\n# B\r\nC\u2028D', bodies: ['x\n- y', 'z\r\n> q'] }))
    expect(text.split('\n')[0]).toBe('# A \\# B C D')
    expect(text).toContain('- 2 bodies: x \\- y, z &gt; q\n')
    expect(text).not.toMatch(/^# B/m)
    expect(text).not.toMatch(/^> q/m)
  })

  it('keeps emoji and right-to-left names, but strips bidi override controls', () => {
    const text = gistReadme(input({ name: 'Stand 📱👍🏽', bodies: ['בסיס', 'قاعدة', 'evil\u202Etxt.exe', 'a\u2066b\u2069'] }))
    expect(text).toContain('# Stand 📱👍🏽\n')
    expect(text).toContain('בסיס, قاعدة, eviltxt\\.exe, ab\n')
    expect(text).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/)
  })

  it('caps the name, the note and each body name, without splitting an emoji', () => {
    const text = gistReadme(input({
      name: '📱'.repeat(MAX_NAME_CHARS + 50),
      note: 'n'.repeat(MAX_NOTE_CHARS + 50),
      bodies: ['b'.repeat(MAX_BODY_NAME_CHARS + 50)],
    }))
    const heading = text.split('\n')[0]
    expect(Array.from(heading.slice(2)).length).toBe(MAX_NAME_CHARS)
    expect(heading.endsWith('…')).toBe(true)
    expect(heading).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/) // no lone high surrogate
    expect(text).toContain(`> ${'n'.repeat(MAX_NOTE_CHARS - 1)}…\n`)
    expect(text).toContain(`: ${'b'.repeat(MAX_BODY_NAME_CHARS - 1)}…\n`)
  })

  it(`lists at most ${500} bodies, then says how many more`, () => {
    expect(MAX_LISTED_BODIES).toBe(500)
    const bodies = Array.from({ length: 612 }, (_, index) => `B${index}`)
    const text = gistReadme(input({ bodies }))
    const line = /** @type {string} */ (text.split('\n').find((row) => row.startsWith('- 612 bodies: ')))
    expect(line.startsWith('- 612 bodies: B0, B1, ')).toBe(true)
    expect(line).toContain('B499, and 112 more')
    expect(line).not.toContain('B500')
  })

  it('treats a blank body name as unnamed rather than an empty list entry', () => {
    expect(gistReadme(input({ bodies: ['', '  ', 'Base'] }))).toContain('- 3 bodies: (unnamed), (unnamed), Base\n')
  })
})

describe('gistReadme — never carries instructions, intent or the AI conversation', () => {
  const SECRET_INSTRUCTIONS = 'STANDING-INSTRUCTION-SENTINEL always use metric'
  const SECRET_INTENT = 'INTENT-SENTINEL make it sturdier'
  const SECRET_CHAT = 'CONVERSATION-SENTINEL user: hello'

  it('ignores any extra field passed in, whatever it is called', () => {
    const smuggled = /** @type {any} */ ({
      ...input(),
      instructions: SECRET_INSTRUCTIONS,
      standingInstructions: SECRET_INSTRUCTIONS,
      intent: SECRET_INTENT,
      conversation: SECRET_CHAT,
      messages: [SECRET_CHAT],
      records: [{ kind: 'instructions', text: SECRET_INSTRUCTIONS }],
    })
    const text = gistReadme(smuggled)
    expect(text).toBe(gistReadme(input()))
    for (const sentinel of ['STANDING-INSTRUCTION-SENTINEL', 'INTENT-SENTINEL', 'CONVERSATION-SENTINEL']) {
      expect(text).not.toContain(sentinel)
    }
  })

  it('reads body names as strings only — a body object cannot carry its intent through', () => {
    const text = gistReadme(input({ bodies: /** @type {any} */ ([{ name: 'Base', intent: SECRET_INTENT }, 'Lip']) }))
    expect(text).not.toContain('INTENT-SENTINEL')
    expect(text).not.toContain('[object Object]')
  })

  it('has an input type that cannot carry them (checked by npm run typecheck)', () => {
    /** @type {import('./gistReadme.js').GistReadmeInput} */
    const typed = {
      ...input(),
      // @ts-expect-error — GistReadmeInput has no `instructions`; a type error here is the assertion.
      instructions: SECRET_INSTRUCTIONS,
    }
    expect(gistReadme(typed)).not.toContain('STANDING-INSTRUCTION-SENTINEL')
  })
})

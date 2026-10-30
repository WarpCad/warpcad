// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { DESCRIPTION_LIMITS } from './description.js'
import { gistLink } from './gistLink.js'
import {
  MAX_LISTED_BODIES,
  MAX_LISTED_PROMPTS,
  MAX_LISTED_VARIABLES,
  MAX_BODY_NAME_CHARS,
  MAX_NAME_CHARS,
  MAX_PROMPT_CHARS,
  escapeMarkdownText,
  formatPublishedAt,
  gistReadme,
} from './gistReadme.js'

/**
 * `TODO/io-017` Stage 1 — the generated `README.md`. Names are **data, never instructions** and
 * never markup: whatever a user typed into a body name must reach github.com as inert text.
 * Standing instructions and intent text are never carried. `TODO/io-023`: the description is the
 * one field with formatting, and only its Markdown subset (`src/core/description.js`).
 */

const ID = '0123456789abcdef0123456789abcdef'
const RAW = `https://gist.githubusercontent.com/octo/${ID}/raw/phone-stand.ndjson`
const AT = Date.UTC(2026, 9, 27, 14, 5, 59)

/** @param {Partial<import('./gistReadme.js').GistReadmeInput>} [over] */
function input(over = {}) {
  return {
    name: 'Phone stand',
    description: 'A stand for a phone, 70° angle, for the desk.',
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
        'A stand for a phone, 70° angle, for the desk\\.',
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

  it('omits the description for an empty or blank one', () => {
    for (const description of ['', '   ', '\n\n', undefined]) {
      const text = gistReadme(input({ description }))
      expect(text.startsWith('# Phone stand\n\n**[Open in WarpCad]')).toBe(true)
    }
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

describe('gistReadme — names are inert text', () => {
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
    const text = gistReadme(input({ bodies: [name], name }))
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

  it('caps the name, the description and each body name, without splitting an emoji', () => {
    const text = gistReadme(input({
      name: '📱'.repeat(MAX_NAME_CHARS + 50),
      description: 'n'.repeat(DESCRIPTION_LIMITS.maxLength + 50),
      bodies: ['b'.repeat(MAX_BODY_NAME_CHARS + 50)],
    }))
    const heading = text.split('\n')[0]
    expect(Array.from(heading.slice(2)).length).toBe(MAX_NAME_CHARS)
    expect(heading.endsWith('…')).toBe(true)
    expect(heading).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/) // no lone high surrogate
    expect(text).toContain(`\n${'n'.repeat(DESCRIPTION_LIMITS.maxLength - 1)}…\n`)
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

/** `TODO/io-022` — the prompts that made the project, in a **How this was made** section. */
describe('gistReadme — how this was made (the prompts)', () => {
  const PROMPTS = [
    { text: 'a 140 × 250 mm fan duct, 1.6 mm walls', bodies: ['Base', 'Lip'] },
    { text: 'add a mounting flange', bodies: ['Flange'] },
  ]

  it('lists each prompt as a block quote with the bodies it produced, after the bodies', () => {
    expect(gistReadme(input({ prompts: PROMPTS }))).toBe(
      [
        '# Phone stand',
        '',
        'A stand for a phone, 70° angle, for the desk\\.',
        '',
        `**[Open in WarpCad](${gistLink(ID)})** — nothing to install, no account.`,
        '',
        '- 4 bodies: Base, Back plate, Lip, Cable notch',
        '- Last published 2026-10-27 14:05 UTC',
        `- Project file: [phone\\-stand\\.ndjson](<${RAW}>)`,
        '',
        '## How this was made',
        '',
        '> a 140 × 250 mm fan duct, 1\\.6 mm walls',
        '',
        '- Made: Base, Lip',
        '',
        '> add a mounting flange',
        '',
        '- Made: Flange',
        '',
        'Made with WarpCad. This page is generated; edits are overwritten when the project is published again.',
        '',
      ].join('\n'),
    )
  })

  it('omits the section for an empty prompt list, and when no prompts are given', () => {
    expect(gistReadme(input({ prompts: [] }))).toBe(gistReadme(input()))
    expect(gistReadme(input())).not.toContain('How this was made')
  })

  it('leaves out the Made line for a prompt whose bodies are gone, and says so for the rest', () => {
    const text = gistReadme(input({ prompts: [{ text: 'a plain request', bodies: [] }] }))
    expect(text).toContain('## How this was made\n\n> a plain request\n\nMade with WarpCad')
  })

  it('keeps a prompt inert: a link, an image, a mention and bidi controls are text', () => {
    const hostile = '[x](javascript:alert(1)) <img src=x onerror=alert(1)> ask @octocat \u202Ereversed'
    const text = gistReadme(input({ prompts: [{ text: hostile, bodies: [] }] }))
    expect(text).not.toContain('](javascript:')
    expect(text).not.toContain('<img')
    expect(text).not.toContain('@octocat')
    expect(text).toContain('&#64;octocat')
    expect(text).not.toContain('\u202E')
  })

  it('breaks a mention in a produced body name too, so nobody is notified', () => {
    const text = gistReadme(input({ prompts: [{ text: 'a stand', bodies: ['@octocat plate'] }] }))
    expect(text).toContain('- Made: &#64;octocat plate')
  })

  it('quotes every line of a multi-line prompt and never lets a line start a heading', () => {
    const text = gistReadme(input({ prompts: [{ text: 'first line\n===\n\nlast', bodies: [] }] }))
    expect(text).toContain('> first line\n> \\===\n>\n> last')
  })

  it(`lists at most ${MAX_LISTED_PROMPTS} prompts, then says how many more`, () => {
    const many = Array.from({ length: 25 }, (_, index) => ({ text: `prompt ${index}`, bodies: [] }))
    const text = gistReadme(input({ prompts: many }))
    expect(text).toContain('> prompt 19')
    expect(text).not.toContain('> prompt 20')
    expect(text).toContain('- and 5 more')
  })

  it('caps the whole section, cutting the prompt that crosses the limit and counting the rest', () => {
    const long = 'x'.repeat(4000)
    const prompts = [{ text: long, bodies: [] }, { text: long, bodies: [] }, { text: 'tail', bodies: [] }]
    // Every `> ` line is a prompt's, so the count is the section's alone.
    const text = gistReadme(input({ description: '', prompts }))
    const sent = text.split('\n').filter((line) => line.startsWith('> ')).join('').replace(/[>\s]/g, '')
    expect([...sent].length).toBeLessThanOrEqual(MAX_PROMPT_CHARS)
    expect(text).not.toContain('> tail')
    expect(text).toContain('- and 1 more')
  })

  it('drops a blank prompt rather than listing an empty quote', () => {
    const text = gistReadme(input({ prompts: [{ text: '   ', bodies: [] }, { text: 'real', bodies: [] }] }))
    expect(text).toContain('## How this was made\n\n> real\n')
    expect(text).not.toContain('more')
  })

  it('is deterministic, and reads only the text and bodies of each prompt', () => {
    const smuggled = /** @type {any} */ ([{ text: 'a', bodies: [], instructions: 'INTENT-SENTINEL', id: 'x' }])
    const first = gistReadme(input({ prompts: smuggled }))
    expect(first).toBe(gistReadme(input({ prompts: smuggled })))
    expect(first).not.toContain('INTENT-SENTINEL')
  })
})

/** `TODO/io-023` — the description, in its Markdown subset, under the title. */
describe('gistReadme — the description', () => {
  it('renders paragraphs, bullet lists, bold, italic and inline code', () => {
    const description = 'A **wall** duct, *PETG*.\nSecond line.\n\n- one `wall = 1.6`\n- _two_'
    const text = gistReadme(input({ description }))
    expect(text).toContain(
      [
        '# Phone stand',
        '',
        'A **wall** duct, *PETG*\\. Second line\\.',
        '',
        '- one `wall = 1.6`',
        '- *two*',
        '',
        `**[Open in WarpCad](${gistLink(ID)})**`,
      ].join('\n'),
    )
  })

  it.each([
    ['a link', '[x](javascript:alert(1))'],
    ['an image', '![pic](https://evil.example/t.png)'],
    ['an autolink', '<https://evil.example>'],
    ['a script', '<script>alert(1)</script>'],
    ['an img onerror', '<img src=x onerror=alert(1)>'],
    ['a raw HTML block', '<div>\n<b>x</b>\n</div>'],
    ['a heading', '# Heading'],
    ['a fenced code block', '```js\nalert(1)\n```'],
    ['a reference definition', '[ref]: https://evil.example'],
    ['a table', '| a | b |\n| - | - |'],
  ])('keeps %s inert: escaped text, never markup', (_, description) => {
    const text = gistReadme(input({ description }))
    const body = text.split('\n').slice(2, text.split('\n').indexOf(`**[Open in WarpCad](${gistLink(ID)})** — nothing to install, no account.`)).join('\n')
    expect(body).not.toMatch(/<[a-z!/]/i)
    expect(body).not.toContain('](')
    expect(body).not.toContain('![')
    expect(body).not.toMatch(/^#/m)
    expect(body).not.toMatch(/^```/m)
    expect(body).not.toMatch(/^\|/m)
    expect(body).not.toMatch(/(^|[^\\])\[(x|ref|pic)\]/)
  })

  it('inline code keeps a hostile string as code, which GitHub never renders as HTML', () => {
    const text = gistReadme(input({ description: 'see `<img src=x onerror=alert(1)>`' }))
    expect(text).toContain('see `<img src=x onerror=alert(1)>`')
  })

  it('breaks a mention so it notifies nobody, and strips bidi controls', () => {
    const text = gistReadme(input({ description: 'ask **@octocat** or @hubot\u202Etxt' }))
    expect(text).not.toMatch(/(^|[^#\d])@\w/)
    expect(text).toContain('**&#64;octocat**')
    expect(text).toContain('&#64;hubottxt')
    expect(text).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/)
  })

  it('a description line can never start a heading, quote or numbered list', () => {
    const text = gistReadme(input({ description: '===\n\n> quote\n\n1. one' }))
    expect(text).toContain('\n\\===\n')
    expect(text).toContain('\n&gt; quote\n')
    expect(text).toContain('\n1\\. one\n')
  })
})

/** `TODO/io-023` — the agent's reply under each prompt, sharing the prompts' character budget. */
describe('gistReadme — the reply', () => {
  it('renders the reply as a second quote headed Reply, between the request and the bodies', () => {
    const text = gistReadme(input({ prompts: [{ text: 'a fan duct', reply: 'Done.\n\nProblems met: none.', bodies: ['Base'] }] }))
    expect(text).toContain(
      ['## How this was made', '', '> a fan duct', '', '**Reply**', '', '> Done\\.', '>', '> Problems met: none\\.', '', '- Made: Base'].join('\n'),
    )
  })

  it('a prompt with no reply renders exactly as io-022 does', () => {
    const withBlank = gistReadme(input({ prompts: [{ text: 'a fan duct', reply: '  ', bodies: ['Base'] }] }))
    const without = gistReadme(input({ prompts: [{ text: 'a fan duct', bodies: ['Base'] }] }))
    expect(withBlank).toBe(without)
    expect(without).not.toContain('Reply')
  })

  it('keeps a reply inert: a link, an image, a script, a mention and bidi controls are text', () => {
    const hostile = '[x](javascript:alert(1)) <img src=x onerror=alert(1)> <script>x</script> ask @octocat \u202Ereversed'
    const text = gistReadme(input({ prompts: [{ text: 'a stand', reply: hostile, bodies: [] }] }))
    expect(text).not.toContain('](javascript:')
    expect(text).not.toMatch(/<(img|script)/)
    expect(text).not.toContain('@octocat')
    expect(text).toContain('&#64;octocat')
    expect(text).not.toContain('\u202E')
  })

  it('counts against the shared cap: the cut reply ends in … and later prompts are counted', () => {
    const prompt = 'p'.repeat(MAX_PROMPT_CHARS - 100)
    const reply = 'r'.repeat(500)
    const text = gistReadme(input({ description: '', prompts: [{ text: prompt, reply, bodies: [] }, { text: 'tail', bodies: [] }] }))
    const quoted = text.split('\n').filter((line) => line.startsWith('> ')).join('').replace(/[>\s]/g, '')
    expect([...quoted].length).toBeLessThanOrEqual(MAX_PROMPT_CHARS)
    expect(text).toContain(`> ${'r'.repeat(99)}…`)
    expect(text).not.toContain('> tail')
    expect(text).toContain('- and 1 more')
  })
})

/** `TODO/io-023` — every project variable, with its range where the project defines one. */
describe('gistReadme — variables', () => {
  /** @type {import('./gistReadme.js').GistReadmeVariable[]} */
  const VARIABLES = [
    { name: 'inlet_diameter', kind: 'number', value: 80, unit: 'mm', min: 40, max: 120 },
    { name: 'wall', kind: 'number', value: 1.6, unit: 'mm', min: 0.4 },
    { name: 'angle', kind: 'number', value: 30, unit: 'deg', max: 90 },
    { name: 'count', kind: 'number', value: 3, unit: '' },
    { name: 'fan', kind: 'enum', value: 120, options: [{ value: 80, label: '80 mm' }, { value: 120, label: '120 mm' }] },
    { name: 'flange', kind: 'boolean', value: true },
  ]

  it('renders a table after How this was made: name, value and range', () => {
    const text = gistReadme(input({ prompts: [{ text: 'a duct', bodies: [] }], variables: VARIABLES }))
    expect(text).toContain(
      [
        '## Variables',
        '',
        '| Name | Value | Range |',
        '| --- | --- | --- |',
        '| inlet\\_diameter | 80 mm | 40–120 mm |',
        '| wall | 1\\.6 mm | ≥ 0\\.4 mm |',
        '| angle | 30 deg | ≤ 90 deg |',
        '| count | 3 | — |',
        '| fan | 120 mm | 80 mm, 120 mm |',
        '| flange | yes | yes / no |',
        '',
        'Made with WarpCad.',
      ].join('\n'),
    )
    expect(text.indexOf('## How this was made')).toBeLessThan(text.indexOf('## Variables'))
  })

  it('a min or max of 0, a negative and a fractional value render as written, not as blank', () => {
    const text = gistReadme(input({ variables: [
      { name: 'a', kind: 'number', value: 0, unit: 'mm', min: 0, max: 0.25 },
      { name: 'b', kind: 'number', value: -2.5, unit: 'mm', min: -10, max: 0 },
    ] }))
    expect(text).toContain('| a | 0 mm | 0–0\\.25 mm |')
    expect(text).toContain('| b | \\-2\\.5 mm | \\-10–0 mm |')
  })

  it('leaves the Range column out when no variable defines one', () => {
    const text = gistReadme(input({ variables: [
      { name: 'w', kind: 'number', value: 140, unit: 'mm' },
      { name: 'd', kind: 'number', value: 44, unit: 'mm' },
    ] }))
    expect(text).toContain('| Name | Value |\n| --- | --- |\n| w | 140 mm |\n| d | 44 mm |\n')
    expect(text).not.toContain('Range')
  })

  it('no variables, no section', () => {
    expect(gistReadme(input({ variables: [] }))).toBe(gistReadme(input()))
    expect(gistReadme(input())).not.toContain('## Variables')
  })

  it('a name or label with a pipe or a line break cannot break the table', () => {
    const text = gistReadme(input({ variables: [
      { name: 'a|b', kind: 'number', value: 1, unit: 'mm' },
      { name: 'c', kind: 'enum', value: 'x', options: [{ value: 'x', label: 'one\n| two |' }, { value: 'y', label: 'y|z' }] },
    ] }))
    const rows = text.split('\n').filter((line) => line.startsWith('| '))
    expect(rows).toHaveLength(4)
    for (const row of rows) expect(row.split(/(?<!\\)\|/).length).toBe(5)
    expect(text).toContain('| a\\|b | 1 mm | — |')
  })

  it('keeps a hostile option label or name inert, and breaks a mention', () => {
    const text = gistReadme(input({ variables: [
      { name: 'x', kind: 'enum', value: 1, options: [{ value: 1, label: '<img src=x onerror=alert(1)>' }, { value: 2, label: '[l](javascript:x) @octocat' }] },
    ] }))
    expect(text).not.toMatch(/<img/)
    expect(text).not.toContain('](javascript')
    expect(text).toContain('&#64;octocat')
  })

  it(`lists at most ${MAX_LISTED_VARIABLES} variables, then says how many more`, () => {
    const many = Array.from({ length: MAX_LISTED_VARIABLES + 7 }, (_, index) => ({ name: `v${index}`, kind: 'number', value: index, unit: '' }))
    const text = gistReadme(input({ variables: many }))
    expect(text).toContain(`| v${MAX_LISTED_VARIABLES - 1} |`)
    expect(text).not.toContain(`| v${MAX_LISTED_VARIABLES} |`)
    expect(text).toContain('- and 7 more')
  })

  it('is deterministic and reads only the documented fields of a variable', () => {
    const smuggled = /** @type {any} */ ([{ ...VARIABLES[0], intent: 'INTENT-SENTINEL', id: 'var-1' }])
    const first = gistReadme(input({ variables: smuggled }))
    expect(first).toBe(gistReadme(input({ variables: smuggled })))
    expect(first).not.toContain('INTENT-SENTINEL')
    expect(first).not.toContain('var-1')
  })
})

describe('gistReadme — section order', () => {
  it('title, description, link, counts, How this was made, Variables, footer', () => {
    const text = gistReadme(input({
      prompts: [{ text: 'a duct', reply: 'done', bodies: ['Base'] }],
      variables: [{ name: 'w', kind: 'number', value: 1, unit: 'mm', min: 0, max: 2 }],
    }))
    const order = ['# Phone stand', 'A stand for a phone', '[Open in WarpCad]', '- 4 bodies', '## How this was made', '> a duct', '**Reply**', '> done', '- Made: Base', '## Variables', 'Made with WarpCad']
    const at = order.map((marker) => text.indexOf(marker))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
})

describe('gistReadme — never carries instructions or intent', () => {
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

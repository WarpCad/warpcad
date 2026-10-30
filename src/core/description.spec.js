// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { DESCRIPTION_LIMITS, cleanDescription, parseDescription, prepareDescription } from './description.js'

/**
 * `TODO/io-023` — the project's **description**: text written for people to read, set by a person
 * (File ▾ → Project settings…) or an agent (`set_description`). It may use a small Markdown subset
 * — paragraphs, bullet lists, **bold**, *italic*, `inline code` — and nothing else: no links, no
 * images, no HTML, no headings, no code blocks. Anything outside the subset is plain text. It is
 * data, never markup and never instructions.
 */

/**
 * The parse as plain `[kind, text]` pairs per block, for compact assertions.
 *
 * @param {unknown} text
 */
function shape(text) {
  return parseDescription(text).map((block) =>
    block.type === 'paragraph'
      ? ['p', block.inlines.map((inline) => [inline.type, inline.text])]
      : ['ul', block.items.map((item) => item.map((inline) => [inline.type, inline.text]))]
  )
}

/**
 * Every text an inline of the parse carries, joined.
 *
 * @param {unknown} text
 */
function allText(text) {
  return parseDescription(text)
    .flatMap((block) => (block.type === 'paragraph' ? block.inlines : block.items.flat()))
    .map((inline) => inline.text)
    .join('')
}

describe('cleanDescription', () => {
  it('keeps line breaks, normalises CRLF and strips controls and bidi overrides', () => {
    expect(cleanDescription('one\r\ntwo\rthree')).toBe('one\ntwo\nthree')
    expect(cleanDescription('a\u202Eevil\u202Cb\u2066c\u2069\u200Fd')).toBe('aevilbcd')
    expect(cleanDescription('a\u0000b\u0007c\u009fd')).toBe('abcd')
    expect(cleanDescription('tab\there')).toBe('tab here')
    expect(cleanDescription('  padded  \n\n')).toBe('padded')
  })

  it('is not text for a non-string', () => {
    expect(cleanDescription(undefined)).toBe('')
    expect(cleanDescription(42)).toBe('')
    expect(cleanDescription({ toString: () => 'x' })).toBe('')
  })

  it('caps the text with an ellipsis, without splitting a surrogate pair, and is idempotent', () => {
    const long = '😀'.repeat(DESCRIPTION_LIMITS.maxLength + 10)
    const cut = cleanDescription(long)
    expect(Array.from(cut)).toHaveLength(DESCRIPTION_LIMITS.maxLength)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut).not.toMatch(/[\uD800-\uDBFF]…$/)
    expect(cleanDescription(cut)).toBe(cut)
  })
})

describe('prepareDescription', () => {
  it('accepts text, reporting whether it was cut', () => {
    expect(prepareDescription('A wall duct.')).toEqual({ ok: true, text: 'A wall duct.', truncated: false })
    const cut = prepareDescription('x'.repeat(DESCRIPTION_LIMITS.maxLength + 1))
    expect(cut).toMatchObject({ ok: true, truncated: true })
    expect(Array.from(/** @type {any} */ (cut).text)).toHaveLength(DESCRIPTION_LIMITS.maxLength)
  })

  it('accepts empty text, which clears the description', () => {
    expect(prepareDescription('')).toEqual({ ok: true, text: '', truncated: false })
    expect(prepareDescription('  \n ')).toEqual({ ok: true, text: '', truncated: false })
  })

  it('refuses a non-string and an input over the hard cap', () => {
    expect(prepareDescription(null)).toMatchObject({ ok: false })
    expect(prepareDescription(['a'])).toMatchObject({ ok: false })
    const huge = prepareDescription('x'.repeat(DESCRIPTION_LIMITS.maxInputLength + 1))
    expect(huge).toMatchObject({ ok: false })
    expect(/** @type {any} */ (huge).reason).toContain(String(DESCRIPTION_LIMITS.maxInputLength))
  })
})

describe('parseDescription — the allowed subset', () => {
  it('a blank description has no blocks', () => {
    expect(parseDescription('')).toEqual([])
    expect(parseDescription('   \n\n  ')).toEqual([])
    expect(parseDescription(undefined)).toEqual([])
  })

  it('paragraphs are separated by a blank line; a single line break is a space', () => {
    expect(shape('First line\nstill first.\n\nSecond.')).toEqual([
      ['p', [['text', 'First line still first.']]],
      ['p', [['text', 'Second.']]],
    ])
  })

  it('bold, italic (with * or _) and inline code', () => {
    expect(shape('A **wall** duct, *printed* in _PETG_ with `wall = 1.6`.')).toEqual([
      [
        'p',
        [
          ['text', 'A '],
          ['strong', 'wall'],
          ['text', ' duct, '],
          ['em', 'printed'],
          ['text', ' in '],
          ['em', 'PETG'],
          ['text', ' with '],
          ['code', 'wall = 1.6'],
          ['text', '.'],
        ],
      ],
    ])
  })

  it('bullet lists, with -, * or +', () => {
    expect(shape('Parts:\n\n- straight **section**\n* elbow\n+ inlet')).toEqual([
      ['p', [['text', 'Parts:']]],
      ['ul', [[['text', 'straight '], ['strong', 'section']], [['text', 'elbow']], [['text', 'inlet']]]],
    ])
  })

  it('a list directly after a paragraph line starts a list; a line after a list starts a paragraph', () => {
    expect(shape('Parts:\n- one\n- two\nAfter.')).toEqual([
      ['p', [['text', 'Parts:']]],
      ['ul', [[['text', 'one']], [['text', 'two']]]],
      ['p', [['text', 'After.']]],
    ])
  })

  it('an unmatched or empty marker is text', () => {
    expect(shape('2 * 3 = 6, a ** b, `` and ** **')).toEqual([['p', [['text', '2 * 3 = 6, a ** b, `` and ** **']]]])
    expect(shape('snake_case_name and *open')).toEqual([['p', [['text', 'snake_case_name and *open']]]])
  })

  it('code takes precedence: markers inside code are literal', () => {
    expect(shape('`**not bold**`')).toEqual([['p', [['code', '**not bold**']]]])
  })
})

describe('parseDescription — everything else is plain text', () => {
  it('a link or an image is text, not a link', () => {
    expect(shape('[x](javascript:alert(1)) and ![i](https://e.vil/p.png)')).toEqual([
      ['p', [['text', '[x](javascript:alert(1)) and ![i](https://e.vil/p.png)']]],
    ])
    expect(shape('<https://e.vil>')).toEqual([['p', [['text', '<https://e.vil>']]]])
  })

  it('HTML is text: a script, an img onerror, a raw HTML block', () => {
    expect(allText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
    expect(allText('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
    expect(shape('<div>\n<b>bold</b>\n</div>')).toEqual([['p', [['text', '<div> <b>bold</b> </div>']]]])
  })

  it('a heading is a paragraph whose text keeps its #', () => {
    expect(shape('# Title\n\n## Sub')).toEqual([
      ['p', [['text', '# Title']]],
      ['p', [['text', '## Sub']]],
    ])
  })

  it('a fenced code block is text, its lines joined', () => {
    expect(shape('```js\nalert(1)\n```')).toEqual([['p', [['text', '```js alert(1) ```']]]])
  })

  it('a numbered list, a quote and a table are text', () => {
    expect(shape('1. one\n> quoted\n| a | b |')).toEqual([['p', [['text', '1. one > quoted | a | b |']]]])
  })

  it('an @mention is kept as text (the renderer breaks it)', () => {
    expect(allText('ask @octocat')).toBe('ask @octocat')
  })

  it('bidi overrides and controls are removed again at parse time', () => {
    expect(allText('a\u202Eb\u0007c')).toBe('abc')
  })

  it('parses a description over the cap as its capped text', () => {
    const text = 'y'.repeat(DESCRIPTION_LIMITS.maxLength * 2)
    expect(Array.from(allText(text))).toHaveLength(DESCRIPTION_LIMITS.maxLength)
  })

  it('is deterministic', () => {
    const text = 'A **b** *c* `d`\n\n- e\n- f'
    expect(parseDescription(text)).toEqual(parseDescription(text))
  })
})

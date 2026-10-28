// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ai-031`: the prompt record — the request an agent was given, stored in the project as
 * `{ id, text, produced }` (`src/core/prompt.js`). Untrusted text from any file or agent, so
 * every bad shape has a test here: the cap and its truncation marker, control and bidi
 * stripping, empty, non-string, a 1 MB string, and markup that stays inert characters.
 */
import { describe, expect, it } from 'vitest'

import { cleanText } from './intent.js'
import {
  PROMPT_LIMITS,
  cleanPromptText,
  joinPromptMaps,
  preparePrompt,
  validatePromptRecord,
} from './prompt.js'

describe('cleanPromptText: intent’s rule plus bidi controls', () => {
  it('strips C0 controls like intent does, and keeps tabs and newlines', () => {
    expect(cleanPromptText('a\u0000b\u0007c\td\r\ne\u007f')).toBe('abc\td\ne')
  })

  it('strips every bidi control intent’s cleanText leaves in', () => {
    const bidi = ['‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩', '‎', '‏', '؜']
    for (const mark of bidi) {
      expect(cleanPromptText(`duct${mark}140`)).toBe('duct140')
      // Intent behaviour is unchanged: it never stripped these and still does not.
      expect(cleanText(`duct${mark}140`, 500)).toBe(`duct${mark}140`)
    }
    // A "Trojan Source" reordering: the visible order is what is stored.
    expect(cleanPromptText('wall ‮etirw‬ 1.6 mm')).toBe('wall etirw 1.6 mm')
  })

  it('cuts to the cap with a trailing ellipsis, never over it', () => {
    const long = 'x'.repeat(PROMPT_LIMITS.maxTextLength + 50)
    const cut = cleanPromptText(long)
    expect(cut.length).toBe(PROMPT_LIMITS.maxTextLength)
    expect(cut.endsWith('…')).toBe(true)
  })

  it('is idempotent, so a stored text validates as clean', () => {
    for (const value of ['  hi  ', 'x'.repeat(5000), 'a‮b', 'line\r\nline']) {
      const once = cleanPromptText(value)
      expect(cleanPromptText(once)).toBe(once)
    }
  })

  it('treats a non-string as no text', () => {
    for (const value of [undefined, null, 42, {}, ['a']]) expect(cleanPromptText(value)).toBe('')
  })
})

describe('preparePrompt: what record_prompt stores, or why not', () => {
  it('keeps the user’s words as received, cleaned', () => {
    expect(preparePrompt('  a 140 × 250 mm fan duct, 1.6 mm walls \n')).toEqual({
      ok: true,
      text: 'a 140 × 250 mm fan duct, 1.6 mm walls',
      truncated: false,
    })
  })

  it('cuts an over-cap prompt and says so', () => {
    const verdict = preparePrompt('word '.repeat(2000))
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.truncated).toBe(true)
    expect(verdict.text.length).toBeLessThanOrEqual(PROMPT_LIMITS.maxTextLength)
    expect(verdict.text.endsWith('…')).toBe(true)
  })

  it('refuses an empty prompt by name', () => {
    for (const value of ['', '   ', '\u0000‮\n']) {
      expect(preparePrompt(value)).toEqual({ ok: false, reason: expect.stringMatching(/empty/) })
    }
  })

  it('refuses a non-string by name', () => {
    for (const value of [undefined, null, 7, { text: 'x' }, ['x']]) {
      expect(preparePrompt(value)).toEqual({ ok: false, reason: expect.stringMatching(/text/) })
    }
  })

  it('refuses a 1 MB string as over the cap, without cleaning it', () => {
    const huge = 'a'.repeat(1024 * 1024)
    const started = performance.now()
    const verdict = preparePrompt(huge)
    expect(performance.now() - started).toBeLessThan(50)
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.reason).toMatch(/over the cap/)
    expect(verdict.reason).toContain(String(PROMPT_LIMITS.maxInputLength))
  })

  it('keeps markup as inert characters', () => {
    const verdict = preparePrompt('<img src=x onerror="alert(1)"><script>x</script>')
    expect(verdict).toEqual({ ok: true, text: '<img src=x onerror="alert(1)"><script>x</script>', truncated: false })
  })
})

describe('validatePromptRecord: a stored record, or why it is refused', () => {
  const good = { id: 'prompt-abcdef-3', text: 'a fan duct', produced: ['cuboid-abcdef-5', 'cuboid-abcdef-4'] }

  it('accepts a clean record and sorts produced', () => {
    expect(validatePromptRecord(good)).toEqual({
      ok: true,
      record: { id: 'prompt-abcdef-3', text: 'a fan duct', produced: ['cuboid-abcdef-4', 'cuboid-abcdef-5'] },
    })
  })

  it('reads a missing produced as none, and ignores a field it does not know', () => {
    expect(validatePromptRecord({ id: 'p1', text: 'x', later: 1 })).toEqual({ ok: true, record: { id: 'p1', text: 'x', produced: [] } })
  })

  /** @type {[string, unknown, RegExp][]} */
  const bad = [
    ['not an object', 'prompt', /object/],
    ['an array', [good], /object/],
    ['null', null, /object/],
    ['no id', { text: 'x' }, /id/],
    ['an empty id', { id: '', text: 'x' }, /id/],
    ['an id with spaces', { id: 'a b', text: 'x' }, /id/],
    ['an id over 256', { id: 'p'.repeat(257), text: 'x' }, /id/],
    ['non-string text', { id: 'p1', text: 42 }, /text/],
    ['empty text', { id: 'p1', text: '' }, /empty/],
    ['text over the cap', { id: 'p1', text: 'x'.repeat(PROMPT_LIMITS.maxTextLength + 1) }, /over the cap/],
    ['a control character', { id: 'p1', text: 'a\u0007b' }, /control/],
    ['a bidi override', { id: 'p1', text: 'a‮b' }, /control/],
    ['untrimmed text', { id: 'p1', text: ' a ' }, /control|clean/],
    ['produced not a list', { id: 'p1', text: 'x', produced: 'c1' }, /produced/],
    ['a produced id that is not text', { id: 'p1', text: 'x', produced: [3] }, /produced/],
    ['a duplicate produced id', { id: 'p1', text: 'x', produced: ['c1', 'c1'] }, /produced/],
    ['too many produced ids', { id: 'p1', text: 'x', produced: Array.from({ length: PROMPT_LIMITS.maxProduced + 1 }, (_, i) => `c${i}`) }, /produced/],
  ]
  for (const [label, raw, reason] of bad) {
    it(`refuses ${label}, naming why`, () => {
      const verdict = validatePromptRecord(raw)
      expect(verdict.ok).toBe(false)
      if (verdict.ok) return
      expect(verdict.reason).toMatch(reason)
    })
  }

  it('keeps <img onerror> as text: nothing in a record is parsed', () => {
    const verdict = validatePromptRecord({ id: 'p1', text: '<img src=x onerror=alert(1)>' })
    expect(verdict.ok && verdict.record.text).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('joinPromptMaps: the merge rule', () => {
  /** @param {[string, string, string[]][]} rows */
  const map = (rows) => new Map(rows.map(([id, text, produced]) => [id, { text, produced }]))

  it('keeps every prompt either side has', () => {
    const joined = joinPromptMaps(map([['p-a', 'from A', ['c1']]]), map([['p-b', 'from B', ['c2']]]))
    expect([...joined.keys()]).toEqual(['p-a', 'p-b'])
  })

  it('unions produced for one prompt, in a fixed order', () => {
    const a = map([['p', 'duct', ['c3', 'c1']]])
    const b = map([['p', 'duct', ['c2', 'c1']]])
    expect(joinPromptMaps(a, b).get('p')).toEqual({ text: 'duct', produced: ['c1', 'c2', 'c3'] })
    expect(joinPromptMaps(b, a).get('p')).toEqual({ text: 'duct', produced: ['c1', 'c2', 'c3'] })
  })

  it('is commutative, associative and idempotent', () => {
    const a = map([['p1', 'one', ['x']], ['p2', 'two', []]])
    const b = map([['p2', 'two', ['y']], ['p3', 'three', ['z']]])
    const c = map([['p1', 'one', ['w']]])
    const canon = (/** @type {Map<string, any>} */ m) => JSON.stringify([...m].sort())
    expect(canon(joinPromptMaps(a, b))).toBe(canon(joinPromptMaps(b, a)))
    expect(canon(joinPromptMaps(joinPromptMaps(a, b), c))).toBe(canon(joinPromptMaps(a, joinPromptMaps(b, c))))
    expect(canon(joinPromptMaps(a, a))).toBe(canon(a))
  })

  it('settles two different texts under one id the same way in both orders', () => {
    const a = map([['p', 'alpha', []]])
    const b = map([['p', 'beta', []]])
    expect(joinPromptMaps(a, b).get('p')).toEqual(joinPromptMaps(b, a).get('p'))
  })

  it('never holds more than the per-project cap', () => {
    const many = (/** @type {string} */ side) =>
      new Map(Array.from({ length: PROMPT_LIMITS.maxPrompts }, (_, i) => [`p-${side}-${String(i).padStart(4, '0')}`, { text: 'x', produced: [] }]))
    expect(joinPromptMaps(many('a'), many('b')).size).toBe(PROMPT_LIMITS.maxPrompts)
  })
})

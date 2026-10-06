// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  INSTRUCTIONS_MAX_LENGTH,
  INTENT_MAX_LENGTH,
  RATIONALE_MAX_LENGTH,
  cleanText,
  composeIntent,
} from './intent.js'

/**
 * `TODO/ai-003` — the caps and the one text-cleaning rule both design-intent fields share.
 * Both arrive from files and gists anyone can write, so they are bounded and stripped of
 * control characters here, once, for every reader.
 */

describe('cleanText', () => {
  it('trims, keeps newlines and tabs, and normalises CRLF', () => {
    expect(cleanText('  a\r\nb\tc  ', 100)).toBe('a\nb\tc')
  })

  it('strips C0 control characters and DEL other than newline and tab', () => {
    expect(cleanText('a\u0000b\u0007c\u001bd\u007fe', 100)).toBe('abcde')
  })

  it('truncates to the cap with an ellipsis, never exceeding it', () => {
    const out = cleanText('x'.repeat(50), 10)
    expect(out).toHaveLength(10)
    expect(out.endsWith('…')).toBe(true)
  })

  it('leaves text at exactly the cap alone', () => {
    expect(cleanText('y'.repeat(10), 10)).toBe('y'.repeat(10))
  })

  it('is the empty string for anything that is not a string', () => {
    expect(cleanText(undefined, 10)).toBe('')
    expect(cleanText(42, 10)).toBe('')
    expect(cleanText({ toString: () => 'evil' }, 10)).toBe('')
  })

  it('keeps markup as literal characters — it is text, never parsed', () => {
    expect(cleanText('<img src=x onerror=alert(1)>', 100)).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('composeIntent', () => {
  it('is the request and the rationale on separate lines', () => {
    expect(composeIntent('Make a bracket', 'Base plate for the bracket')).toBe(
      'Make a bracket\n— Base plate for the bracket',
    )
  })

  it('is either part alone when the other is missing or blank', () => {
    expect(composeIntent('Make a bracket', undefined)).toBe('Make a bracket')
    expect(composeIntent('  ', 'Why')).toBe('— Why')
  })

  it('is undefined when there is nothing to say', () => {
    expect(composeIntent(undefined, undefined)).toBeUndefined()
    expect(composeIntent('', '   ')).toBeUndefined()
  })

  it('caps the rationale to one short line and the whole to INTENT_MAX_LENGTH', () => {
    const intent = /** @type {string} */ (composeIntent('r'.repeat(5000), 'w'.repeat(5000)))
    expect(intent.length).toBeLessThanOrEqual(INTENT_MAX_LENGTH)
    const [, why] = intent.split('\n— ')
    expect(why.length).toBeLessThanOrEqual(RATIONALE_MAX_LENGTH)
    // The rationale is kept whole-ish rather than squeezed out by a long request.
    expect(why.length).toBeGreaterThan(100)
  })

  it('folds a multi-line rationale onto one line', () => {
    expect(composeIntent('Ask', 'line one\nline two')).toBe('Ask\n— line one line two')
  })
})

describe('caps', () => {
  it('are the documented numbers', () => {
    expect(INTENT_MAX_LENGTH).toBe(500)
    expect(RATIONALE_MAX_LENGTH).toBe(200)
    expect(INSTRUCTIONS_MAX_LENGTH).toBe(2000)
  })
})

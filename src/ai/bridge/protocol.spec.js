// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  CODE_ALPHABET,
  CODE_LENGTH,
  formatCode,
  normaliseCode,
  parseHostMessage,
  parseTabMessage,
} from './protocol.js'

describe('pairing codes', () => {
  it('are 8 characters from an alphabet with no look-alikes (0/O, 1/I/L)', () => {
    expect(CODE_LENGTH).toBe(8)
    for (const confusable of ['0', 'O', '1', 'I', 'L']) expect(CODE_ALPHABET).not.toContain(confusable)
  })

  it('are shown in two halves and read back however they were typed', () => {
    expect(formatCode('K7Q4FX2M')).toBe('K7Q4-FX2M')
    expect(normaliseCode(' k7q4-fx2m ')).toBe('K7Q4FX2M')
    expect(normaliseCode('K7Q4 FX2M')).toBe('K7Q4FX2M')
  })

  it('reads anything that is not code-shaped as no code at all', () => {
    expect(normaliseCode('K7Q4')).toBeNull()
    expect(normaliseCode('K7Q4FX2M9')).toBeNull()
    expect(normaliseCode('K7Q0FX2M')).toBeNull()
    expect(normaliseCode(42)).toBeNull()
  })
})

describe('message shapes', () => {
  it('accepts the tab’s three messages and nothing else', () => {
    expect(parseTabMessage({ type: 'hello' })).toEqual({ type: 'hello' })
    expect(parseTabMessage({ type: 'pair', code: 'k7q4-fx2m' })).toEqual({ type: 'pair', code: 'k7q4-fx2m' })
    expect(parseTabMessage({ type: 'result', id: 3, result: { applied: [] } })).toEqual({ type: 'result', id: 3, result: { applied: [] } })
    expect(parseTabMessage({ type: 'result', id: '3', result: {} })).toBeNull()
    expect(parseTabMessage({ type: 'result', id: 3, result: null })).toBeNull()
    expect(parseTabMessage({ type: 'call', id: 1, name: 'create', input: {} })).toBeNull()
    expect(parseTabMessage('pair')).toBeNull()
    expect(parseTabMessage(null)).toBeNull()
  })

  it('accepts the host’s messages, and a call only with a numeric id and a tool name', () => {
    expect(parseHostMessage({ type: 'call', id: 1, name: 'create', input: { op: 'primitive.cuboid' }, request: 'a cube' })).toEqual({
      type: 'call',
      id: 1,
      name: 'create',
      input: { op: 'primitive.cuboid' },
      request: 'a cube',
    })
    expect(parseHostMessage({ type: 'call', id: 1, name: 'create', input: {} })).toEqual({ type: 'call', id: 1, name: 'create', input: {} })
    expect(parseHostMessage({ type: 'call', id: 'x', name: 'create', input: {} })).toBeNull()
    expect(parseHostMessage({ type: 'call', id: 1, name: '', input: {} })).toBeNull()
    expect(parseHostMessage({ type: 'call', id: 1, name: 'create', input: {}, request: 7 })).toBeNull()
    expect(parseHostMessage({ type: 'paired' })).toEqual({ type: 'paired' })
    expect(parseHostMessage({ type: 'pair-refused', reason: 'wrong' })).toEqual({ type: 'pair-refused', reason: 'wrong' })
    expect(parseHostMessage({ type: 'unpaired', reason: 'gone' })).toEqual({ type: 'unpaired', reason: 'gone' })
    expect(parseHostMessage({ type: 'nonsense' })).toBeNull()
  })
})

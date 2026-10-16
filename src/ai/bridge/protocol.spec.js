// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { ACCESS_LEASES, parseHostMessage, parseTabMessage } from './protocol.js'

describe('live MCP access leases', () => {
  it('allows only the four consented durations plus explicit off', () => {
    expect(ACCESS_LEASES).toEqual(['15m', '1h', 'tab', 'unlimited', 'off'])
  })
})

describe('message shapes', () => {
  it('accepts hello, valid lease changes, and results, but no legacy pairing code', () => {
    expect(parseTabMessage({ type: 'hello' })).toEqual({ type: 'hello' })
    expect(parseTabMessage({ type: 'access', lease: '15m' })).toEqual({ type: 'access', lease: '15m' })
    expect(parseTabMessage({ type: 'access', lease: 'off' })).toEqual({ type: 'access', lease: 'off' })
    expect(parseTabMessage({ type: 'access', lease: 'invalid' })).toBeNull()
    expect(parseTabMessage({ type: 'pair', code: 'k7q4-fx2m' })).toBeNull()
    expect(parseTabMessage({ type: 'result', id: 3, result: { applied: [] } })).toEqual({ type: 'result', id: 3, result: { applied: [] } })
    expect(parseTabMessage({ type: 'result', id: '3', result: {} })).toBeNull()
    expect(parseTabMessage({ type: 'result', id: 3, result: null })).toBeNull()
    expect(parseTabMessage({ type: 'call', id: 1, name: 'create', input: {} })).toBeNull()
    expect(parseTabMessage('access')).toBeNull()
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
    expect(parseHostMessage({ type: 'status', access: 'enabled', expiresAt: 123, connection: 'connected', reason: '' })).toEqual({
      type: 'status', access: 'enabled', expiresAt: 123, connection: 'connected', reason: '',
    })
    expect(parseHostMessage({ type: 'status', access: 'enabled', expiresAt: NaN, connection: 'connected', reason: '' })).toBeNull()
    expect(parseHostMessage({ type: 'status', access: 'enabled', expiresAt: null, connection: 'ambiguous', reason: 'busy' })).toMatchObject({ connection: 'ambiguous' })
    expect(parseHostMessage({ type: 'paired' })).toBeNull()
    expect(parseHostMessage({ type: 'pair-refused', reason: 'wrong' })).toBeNull()
    expect(parseHostMessage({ type: 'nonsense' })).toBeNull()
  })
})

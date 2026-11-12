// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Host messages as both live hosts send them (`TODO/ai-026`): the dev host over Vite's HMR socket,
 * the native app's Rust host as Tauri events. `protocol.spec.js` checks `parseHostMessage` against
 * these, and `useLiveBridge.spec.js` sends the same ones through the native transport, so the two
 * routes cannot drift apart.
 */

/** Messages the tab acts on, with what `parseHostMessage` makes of each. */
export const VALID_HOST_MESSAGES = Object.freeze([
  {
    data: { type: 'call', id: 1, name: 'create', input: { op: 'primitive.cuboid' }, request: 'a cube' },
    parsed: { type: 'call', id: 1, name: 'create', input: { op: 'primitive.cuboid' }, request: 'a cube' },
  },
  {
    data: { type: 'call', id: 2, name: 'describe_scene', input: {} },
    parsed: { type: 'call', id: 2, name: 'describe_scene', input: {} },
  },
  {
    data: { type: 'status', access: 'enabled', expiresAt: 123, connection: 'connected', reason: '' },
    parsed: { type: 'status', access: 'enabled', expiresAt: 123, connection: 'connected', reason: '' },
  },
  {
    data: { type: 'status', access: 'enabled', expiresAt: null, connection: 'ambiguous', reason: 'busy' },
    parsed: { type: 'status', access: 'enabled', expiresAt: null, connection: 'ambiguous', reason: 'busy' },
  },
  {
    data: { type: 'status', access: 'expired', expiresAt: null, connection: 'idle', reason: 'Live MCP access expired.' },
    parsed: { type: 'status', access: 'expired', expiresAt: null, connection: 'idle', reason: 'Live MCP access expired.' },
  },
])

/** Messages of the wrong shape: dropped, never half-read. */
export const INVALID_HOST_MESSAGES = Object.freeze([
  { type: 'call', id: 'x', name: 'create', input: {} },
  { type: 'call', id: 1, name: '', input: {} },
  { type: 'call', id: 1, name: 'create', input: {}, request: 7 },
  { type: 'status', access: 'enabled', expiresAt: NaN, connection: 'connected', reason: '' },
  { type: 'paired' },
  { type: 'pair-refused', reason: 'wrong' },
  { type: 'nonsense' },
  'call',
  null,
])

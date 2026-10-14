// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The live bridge's wire (`TODO/ai-012`, `docs/decisions/ai-partner.md` Decision 11): the
 * messages between the bridge host (`mcp/bridge.js`, inside the Vite dev server) and the open
 * WarpCad tab (`./tabEndpoint.js`), and the pairing code's shape. Framework-free and shared by
 * both ends, so neither can drift from the other.
 *
 * Under `npm run dev` these ride Vite's own HMR WebSocket as custom events named
 * {@link BRIDGE_EVENT} (`server.ws.on/send`, `import.meta.hot.on/send`): same origin, already
 * connected, no new dependency and no port.
 *
 * | Direction | Message | Meaning |
 * |---|---|---|
 * | tab → host | `{ type: 'hello' }` | The tab can take calls (sent on connect; harmless repeated). |
 * | tab → host | `{ type: 'pair', code }` | The code the user typed into **Connect to Claude Code**. |
 * | tab → host | `{ type: 'result', id, result }` | The registry's JSON for call `id`. |
 * | host → tab | `{ type: 'paired' }` | The code was right; calls from that Claude Code session now come here. |
 * | host → tab | `{ type: 'pair-refused', reason }` | Wrong, expired, reused, or too many tries. |
 * | host → tab | `{ type: 'unpaired', reason }` | The session ended, or another tab took it over. |
 * | host → tab | `{ type: 'call', id, name, input, request? }` | Run one tool. `request` is the user's words (write tools). |
 *
 * Everything that arrives is checked here before either end acts on it ({@link parseTabMessage},
 * {@link parseHostMessage}): a message of the wrong shape is dropped, never half-read.
 *
 * @module ai/bridge/protocol
 */

/** The Vite custom-event name both ends use. */
export const BRIDGE_EVENT = 'warpcad:bridge'

/** No 0/O, no 1/I/L: a code read off one screen and typed into another must not be ambiguous. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Characters in a pairing code (shown as two halves of four). */
export const CODE_LENGTH = 8

/** How long a pairing code stays valid. */
export const CODE_TTL_MS = 5 * 60_000

/** Wrong codes one tab may send before the host stops listening to it. */
export const MAX_PAIR_ATTEMPTS = 5

/** How long a call that arrives mid-gesture waits for the gesture to end. */
export const GESTURE_WAIT_MS = 10_000

/** Same-`request` batches closer together than this are one **Undo AI turn** group. */
export const GROUP_IDLE_MS = 60_000

/** How long the host waits for the tab to answer one call. */
export const CALL_TIMEOUT_MS = 60_000

/** Decision 11 point 4, verbatim: what a call refused for a gesture in progress returns. */
export const EDITING_REFUSAL = 'the user is editing; try again'

/** What a call returns when the live document moved while it waited. */
export const STALE_REFUSAL =
  'The project changed in WarpCad while this call waited (the user edited it, or a merge landed), so nothing was applied. Read it again (describe_scene) and retry.'

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`)

/**
 * A typed or pasted code, as the host compares it: upper case, spaces and hyphens gone.
 *
 * @param {unknown} text
 * @returns {string | null} `null` when it cannot be a code at all.
 */
export function normaliseCode(text) {
  if (typeof text !== 'string') return null
  const code = text.toUpperCase().replace(/[\s-]/g, '')
  return CODE_PATTERN.test(code) ? code : null
}

/**
 * A code as shown to a person: `K7Q4-FX2M`.
 *
 * @param {string} code A normalised code.
 * @returns {string}
 */
export function formatCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @typedef {{ type: 'hello' }
 *   | { type: 'pair', code: string }
 *   | { type: 'result', id: number, result: Record<string, any> }} TabMessage
 */

/**
 * @typedef {{ type: 'call', id: number, name: string, input: unknown, request?: string }} CallMessage
 * @typedef {CallMessage
 *   | { type: 'paired' }
 *   | { type: 'pair-refused', reason: string }
 *   | { type: 'unpaired', reason: string }} HostMessage
 */

/**
 * Check a message from the tab.
 *
 * @param {unknown} data
 * @returns {TabMessage | null}
 */
export function parseTabMessage(data) {
  if (!isObject(data)) return null
  if (data.type === 'hello') return { type: 'hello' }
  if (data.type === 'pair' && typeof data.code === 'string') return { type: 'pair', code: data.code }
  if (data.type === 'result' && Number.isInteger(data.id) && isObject(data.result)) {
    return { type: 'result', id: /** @type {number} */ (data.id), result: data.result }
  }
  return null
}

/**
 * Check a message from the host.
 *
 * @param {unknown} data
 * @returns {HostMessage | null}
 */
export function parseHostMessage(data) {
  if (!isObject(data)) return null
  if (data.type === 'call') {
    if (!Number.isInteger(data.id) || typeof data.name !== 'string' || data.name === '') return null
    if (data.request !== undefined && typeof data.request !== 'string') return null
    return {
      type: 'call',
      id: /** @type {number} */ (data.id),
      name: data.name,
      input: data.input,
      ...(data.request === undefined ? {} : { request: data.request }),
    }
  }
  if (data.type === 'paired') return { type: 'paired' }
  if ((data.type === 'pair-refused' || data.type === 'unpaired') && typeof data.reason === 'string') {
    return { type: data.type, reason: data.reason }
  }
  return null
}

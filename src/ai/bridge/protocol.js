// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The live bridge's wire (`TODO/ai-012`, `docs/decisions/ai-partner.md` Decision 11): the
 * messages between the bridge host (`mcp/bridge.js`, inside the Vite dev server) and the open
 * WarpCad tab (`./tabEndpoint.js`), and live-access leases. Framework-free and shared by
 * both ends, so neither can drift from the other.
 *
 * Under `npm run dev` these ride Vite's own HMR WebSocket as custom events named
 * {@link BRIDGE_EVENT} (`server.ws.on/send`, `import.meta.hot.on/send`): same origin, already
 * connected, no new dependency and no port.
 *
 * | Direction | Message | Meaning |
 * |---|---|---|
 * | tab → host | `{ type: 'hello' }` | The tab can take calls (sent on connect; harmless repeated). |
 * | tab → host | `{ type: 'access', lease }` | The user enabled or disabled local MCP access. |
 * | tab → host | `{ type: 'result', id, result }` | The registry's JSON for call `id`. |
 * | host → tab | `{ type: 'status', access, expiresAt, connection }` | Lease and unambiguous route state. |
 * | host → tab | `{ type: 'call', id, name, input, request? }` | Run one tool. `request` is the user's words (write tools). |
 *
 * Everything that arrives is checked here before either end acts on it ({@link parseTabMessage},
 * {@link parseHostMessage}): a message of the wrong shape is dropped, never half-read.
 *
 * @module ai/bridge/protocol
 */

/** The Vite custom-event name both ends use. */
export const BRIDGE_EVENT = 'warpcad:bridge'

/** Lease choices accepted by the host. */
export const ACCESS_LEASES = /** @type {const} */ (['15m', '1h', 'tab', 'unlimited', 'off'])

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

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @typedef {{ type: 'hello' }
 *   | { type: 'access', lease: typeof ACCESS_LEASES[number] }
 *   | { type: 'result', id: number, result: Record<string, any> }} TabMessage
 */

/**
 * @typedef {{ type: 'call', id: number, name: string, input: unknown, request?: string }} CallMessage
 * @typedef {{ type: 'status', access: 'off' | 'enabled' | 'expired', expiresAt: number | null, connection: 'idle' | 'connected' | 'ambiguous', reason: string }} StatusMessage
 * @typedef {CallMessage | StatusMessage} HostMessage
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
  if (data.type === 'access' && ACCESS_LEASES.includes(/** @type {any} */ (data.lease))) {
    return { type: 'access', lease: /** @type {typeof ACCESS_LEASES[number]} */ (data.lease) }
  }
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
  if (data.type === 'status') {
    if (!['off', 'enabled', 'expired'].includes(/** @type {any} */ (data.access))) return null
    if (data.expiresAt !== null && !Number.isFinite(data.expiresAt)) return null
    if (!['idle', 'connected', 'ambiguous'].includes(/** @type {any} */ (data.connection))) return null
    if (typeof data.reason !== 'string') return null
    return {
      type: 'status',
      access: /** @type {StatusMessage['access']} */ (data.access),
      expiresAt: /** @type {number | null} */ (data.expiresAt),
      connection: /** @type {StatusMessage['connection']} */ (data.connection),
      reason: data.reason,
    }
  }
  return null
}

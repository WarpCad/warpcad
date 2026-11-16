// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The native app's MCP host, from the page's side (`TODO/ai-026`, `docs/decisions/ai-partner.md`
 * Decision 11, "the native app's host"). Framework-free: no Vue, no DOM.
 *
 * The Rust host (`warpcad-native/src-tauri/src/mcp/`) runs a Streamable HTTP MCP server inside the
 * app. It holds no document and defines no tool: it sends the page the same host messages
 * `src/ai/bridge/protocol.js` defines, as the Tauri event {@link NATIVE_MCP_EVENT}, and the page
 * answers with three commands, and nothing else:
 *
 * | Command | Arguments | Answer |
 * |---|---|---|
 * | `mcp_set_access` | `{ lease, lan, surface }` | {@link NativeEndpoint} |
 * | `mcp_reply` | `{ id, result }` (an MCP tool result) | nothing |
 * | `mcp_rotate_token` | none | {@link NativeEndpoint} |
 *
 * {@link createNativeLink} wraps that as the same `{ on, send }` link Vite's HMR socket gives the
 * dev host (`src/composables/useLiveBridge.js`), so the protocol module stays the contract for both.
 *
 * Events use Tauri's own event plugin (`plugin:event|listen`, allowed by `core:default`) through
 * the bridge's `transformCallback`, as `@tauri-apps/api` does; that package is still not imported
 * (`src/native/shell.js` says why).
 *
 * @module native/mcp
 */

import { liveToolResult } from '../ai/bridge/mcpSurface.js'
import { BRIDGE_EVENT, parseTabMessage } from '../ai/bridge/protocol.js'
import { invoke } from './shell.js'

/** The Tauri event carrying host messages (`HOST_EVENT` in the Rust host). */
export const NATIVE_MCP_EVENT = 'warpcad-mcp-host'

/** The Tauri event saying the app came back from the background with a client connected. */
export const NATIVE_MCP_PAUSED_EVENT = 'warpcad-mcp-paused'

/**
 * The Tauri event carrying an endpoint the host changed on its own (`TODO/ai-036`): the device's
 * Wi-Fi address moved (the new address) or went away (no address, and `lanError` says why).
 */
export const NATIVE_MCP_ENDPOINT_EVENT = 'warpcad-mcp-endpoint'

/** The only commands the page calls on the host. */
export const MCP_COMMANDS = Object.freeze({ setAccess: 'mcp_set_access', reply: 'mcp_reply', rotateToken: 'mcp_rotate_token' })

/**
 * The bridge as this module reads it: `invoke`, and `transformCallback` for event handlers.
 *
 * @typedef {{ __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: any) => Promise<unknown>, transformCallback?: (fn: (event: any) => void, once?: boolean) => number } }} EventGlobal
 */

/**
 * The server as the sheet shows it. Empty strings for what is not there.
 *
 * @typedef {object} NativeEndpoint
 * @property {number | null} port the listening port, `null` while closed
 * @property {string} url the loopback address, `http://127.0.0.1:<port>/mcp`
 * @property {string} lanUrl the Wi-Fi address while **Allow devices on this Wi-Fi** is on
 * @property {string} token the bearer token while it is on
 * @property {string} lanError why the switch could not be turned on
 */

const defaultGlobal = () => /** @type {EventGlobal} */ (/** @type {unknown} */ (globalThis))

/**
 * Listen to a Tauri event. Resolves once the listener is registered.
 *
 * @param {string} event
 * @param {(payload: unknown) => void} handler
 * @param {EventGlobal} [global]
 * @returns {Promise<void>}
 */
export async function listenNative(event, handler, global = defaultGlobal()) {
  const internals = global.__TAURI_INTERNALS__
  if (!internals || typeof internals.transformCallback !== 'function') throw new Error('native events need the native shell')
  const id = internals.transformCallback((message) => handler(message?.payload))
  await invoke('plugin:event|listen', { event, target: { kind: 'Any' }, handler: id }, /** @type {any} */ (global))
}

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value : '')

/**
 * @param {unknown} answer what a command returned
 * @returns {NativeEndpoint}
 */
function readEndpoint(answer) {
  const raw = /** @type {Record<string, unknown> | null} */ (answer !== null && typeof answer === 'object' ? answer : null)
  return {
    port: Number.isInteger(raw?.port) ? /** @type {number} */ (raw?.port) : null,
    url: text(raw?.url),
    lanUrl: text(raw?.lanUrl),
    token: text(raw?.token),
    lanError: text(raw?.lanError),
  }
}

/**
 * Set the lease and the Wi-Fi switch. `off` closes the server.
 *
 * @param {{ lease: string, lan: boolean, surface?: import('../ai/bridge/mcpSurface.js').NativeSurface }} access
 * @param {EventGlobal} [global]
 * @returns {Promise<NativeEndpoint>}
 */
export async function setNativeAccess({ lease, lan, surface }, global = defaultGlobal()) {
  const args = surface === undefined ? { lease, lan } : { lease, lan, surface }
  return readEndpoint(await invoke(MCP_COMMANDS.setAccess, args, /** @type {any} */ (global)))
}

/**
 * Answer call `id`.
 *
 * @param {number} id
 * @param {ReturnType<typeof liveToolResult>} result
 * @param {EventGlobal} [global]
 * @returns {Promise<unknown>}
 */
export function replyNative(id, result, global = defaultGlobal()) {
  return invoke(MCP_COMMANDS.reply, { id, result }, /** @type {any} */ (global))
}

/**
 * **New token**: every connected session ends.
 *
 * @param {EventGlobal} [global]
 * @returns {Promise<NativeEndpoint>}
 */
export async function rotateNativeToken(global = defaultGlobal()) {
  return readEndpoint(await invoke(MCP_COMMANDS.rotateToken, {}, /** @type {any} */ (global)))
}

/**
 * The line the user pastes into a terminal on their computer, or `''` while the Wi-Fi switch is off.
 *
 * @param {{ lanUrl: string, token: string }} endpoint
 * @returns {string}
 */
export function claudeCodeCommand({ lanUrl, token }) {
  if (!lanUrl || !token) return ''
  return `claude mcp add --transport http warpcad ${lanUrl} --header "Authorization: Bearer ${token}"`
}

/**
 * The live bridge's native transport: the same `{ on, send }` link as `import.meta.hot`.
 *
 * - `on(BRIDGE_EVENT, handler)` hands each host message to `handler` unparsed; the caller runs it
 *   through `parseHostMessage`, as it does for the HMR socket.
 * - `send(BRIDGE_EVENT, message)` checks `message` with `parseTabMessage`: `hello` sets access off
 *   (a reload or relaunch starts with access off), `access` sets the lease with the Wi-Fi switch
 *   (`message.lan`) and the page's surface, and `result` goes back with `mcp_reply`, wrapped.
 *   Every send waits until the listeners are registered, so the first status is never missed.
 *
 * @param {object} options
 * @param {EventGlobal} [options.global]
 * @param {() => Promise<import('../ai/bridge/mcpSurface.js').NativeSurface>} options.surface built when access is enabled
 * @param {(endpoint: NativeEndpoint) => void} [options.onEndpoint]
 * @param {() => void} [options.onPaused]
 * @param {(message: string) => void} [options.onError]
 * @returns {{ on: (event: string, handler: (data: any) => void) => void, send: (event: string, data?: any) => void }}
 */
export function createNativeLink({ global = defaultGlobal(), surface, onEndpoint = () => {}, onPaused = () => {}, onError = () => {} }) {
  /** @type {Promise<unknown>} */
  let ready = Promise.resolve()
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve()

  /** @param {() => Promise<void>} job */
  const enqueue = (job) => {
    queue = queue
      .then(() => ready)
      .then(job)
      .catch((error) => onError(error instanceof Error ? error.message : String(error)))
  }

  return {
    on(event, handler) {
      if (event !== BRIDGE_EVENT) return
      ready = Promise.all([
        listenNative(NATIVE_MCP_EVENT, handler, global),
        listenNative(NATIVE_MCP_PAUSED_EVENT, () => onPaused(), global),
        listenNative(NATIVE_MCP_ENDPOINT_EVENT, (payload) => onEndpoint(readEndpoint(payload)), global),
      ]).catch((error) =>
        onError(error instanceof Error ? error.message : String(error))
      )
    },
    send(event, data) {
      if (event !== BRIDGE_EVENT) return
      const message = parseTabMessage(data)
      if (message === null) return
      if (message.type === 'hello') {
        enqueue(async () => onEndpoint(await setNativeAccess({ lease: 'off', lan: false }, global)))
      } else if (message.type === 'access') {
        const lan = message.lease !== 'off' && /** @type {{ lan?: unknown }} */ (data).lan === true
        enqueue(async () => {
          const pageSurface = message.lease === 'off' ? undefined : await surface()
          onEndpoint(await setNativeAccess({ lease: message.lease, lan, ...(pageSurface === undefined ? {} : { surface: pageSurface }) }, global))
        })
      } else if (message.type === 'result') {
        const result = liveToolResult({ kind: 'result', result: message.result })
        enqueue(async () => {
          await replyNative(message.id, result, global)
        })
      }
    },
  }
}

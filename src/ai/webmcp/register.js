// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * WebMCP, the third transport (`TODO/ai-021`, `docs/decisions/ai-partner.md` Decision 13): the
 * open tab registers the tool registry on `document.modelContext`, so an agent that lives in the
 * browser can drive the project with no key, no helper process and no pairing code.
 * Framework-free: the app hands in the API, the endpoint and the tab's visibility
 * (`composables/useWebMcp.js`); a spec hands in fakes.
 *
 * - **No tools of its own.** Each tool is `createToolRegistry().definitions('webmcp')` — the live
 *   bridge's list minus `capture_view` — with the registry's own schema (`toolShape.js`).
 * - **Every call goes through the tab endpoint** (`src/ai/bridge/tabEndpoint.js`) with
 *   {@link WEBMCP_VIA}: one queue shared with Claude Code, the mid-gesture wait and refusal, the
 *   stale-revision refusal, origin `webmcp`, and a group per idle gap that **Undo AI turn** takes back.
 * - **Refusals are values.** `execute` never throws; the endpoint's sentence comes back as
 *   `{ ok: false, error }` for the agent to read and act on.
 * - **Unregistering is an `AbortController`** per registration ({@link registerWebMcpTools}); the
 *   link ({@link createWebMcpLink}) keeps tools registered only while the switch is on **and** the
 *   tab is visible, so the tab the user is looking at is the one an agent reaches.
 *
 * @module ai/webmcp/register
 */

import { createToolRegistry } from '../tools/index.js'
import { requestFor, splitPaging, toToolResult, toWebMcpTool } from './toolShape.js'

/** @typedef {import('./toolShape.js').ModelContext} ModelContext */
/** @typedef {Pick<import('../bridge/tabEndpoint.js').TabEndpoint, 'handle'>} CallEndpoint */

/** How a WebMCP call is run on the tab endpoint: its own origin, grouped by the idle gap. */
export const WEBMCP_VIA = Object.freeze({ origin: /** @type {const} */ ('webmcp'), groupBy: /** @type {const} */ ('idle') })

/**
 * @typedef {object} WebMcpRegistration
 * @property {string[]} registered The names `registerTool` accepted, in registry order.
 * @property {{ name: string, message: string }[]} failed Names it refused, with its reason.
 * @property {() => void} unregister Abort every registration. Idempotent; never throws.
 */

/** Ids for the calls this transport hands the endpoint (its replies are matched by promise, not id). */
let callIds = 0

/**
 * The `execute` for one tool: page arguments off, the intent line on, run on the endpoint, shape
 * the result. Never throws.
 *
 * @param {string} name
 * @param {CallEndpoint} endpoint
 * @returns {(input: unknown) => Promise<Record<string, any>>}
 */
function executorFor(name, endpoint) {
  return async (rawInput) => {
    try {
      const { input, paging, error } = splitPaging(name, rawInput ?? {})
      if (error !== undefined) return toToolResult(name, { error })
      const request = requestFor(name, input)
      callIds += 1
      const call = { type: /** @type {const} */ ('call'), id: callIds, name, input, ...(request === undefined ? {} : { request }) }
      const reply = await endpoint.handle(call, WEBMCP_VIA)
      return toToolResult(name, reply.result, paging)
    } catch {
      // A bug, not the agent: fixed wording, never the error's own text (decision 8).
      return { ok: false, error: `${name} failed inside WarpCad. The project was not changed by it.` }
    }
  }
}

/**
 * Register every WebMCP tool on `modelContext`. With no API, registers nothing.
 *
 * @param {object} options
 * @param {ModelContext | null} options.modelContext From `toolShape.modelContextOf()`.
 * @param {CallEndpoint} options.endpoint The tab endpoint every call runs through.
 * @param {import('../tools/index.js').ToolRegistry} [options.tools] The real registry by default.
 * @returns {Promise<WebMcpRegistration>}
 */
export async function registerWebMcpTools({ modelContext, endpoint, tools = createToolRegistry() }) {
  const controller = new AbortController()
  /** @type {string[]} */
  const registered = []
  /** @type {{ name: string, message: string }[]} */
  const failed = []

  const unregister = () => {
    if (controller.signal.aborted) return
    controller.abort()
    // An older Chrome registered by name and unregistered the same way; the current draft has no
    // `unregisterTool` and aborting the signal is the whole of it.
    if (modelContext && typeof modelContext.unregisterTool === 'function') {
      for (const name of registered) {
        try {
          modelContext.unregisterTool(name)
        } catch {
          // Already gone — the signal did it.
        }
      }
    }
  }

  if (modelContext === null) return { registered, failed, unregister }

  for (const definition of tools.definitions('webmcp')) {
    if (controller.signal.aborted) break
    try {
      await modelContext.registerTool(toWebMcpTool(definition, executorFor(definition.name, endpoint)), { signal: controller.signal })
      if (!controller.signal.aborted) registered.push(definition.name)
    } catch (error) {
      failed.push({ name: definition.name, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return { registered, failed, unregister }
}

/**
 * What the link reports after every settled update (`TODO/ai-024`): enough for the chip to say how
 * many tools are offered, or why none are.
 *
 * @typedef {object} WebMcpLinkState
 * @property {boolean} enabled The switch, as last set.
 * @property {boolean} visible The tab's visibility, as last set.
 * @property {string[]} registered
 * @property {{ name: string, message: string }[]} failed What the current registration refused; `[]` while nothing is registered.
 */

/**
 * @typedef {object} WebMcpLink
 * @property {(patch: { enabled?: boolean, visible?: boolean }) => Promise<void>} update Change the
 *   switch or the tab's visibility; resolves once the registrations match. Updates run in order.
 * @property {readonly string[]} registered What is registered right now.
 * @property {readonly { name: string, message: string }[]} failed What the current registration refused
 *   (`[]` once it is unregistered).
 */

/**
 * Keep the tools registered exactly while the switch is on and the tab is visible
 * (Decision 13 point 5). Starts disabled and hidden; the app sends the real state at once.
 *
 * @param {object} options
 * @param {ModelContext | null} options.modelContext
 * @param {CallEndpoint} options.endpoint
 * @param {import('../tools/index.js').ToolRegistry} [options.tools]
 * @param {(state: WebMcpLinkState) => void} [options.onChange] After every settled update.
 * @returns {WebMcpLink}
 */
export function createWebMcpLink({ modelContext, endpoint, tools, onChange }) {
  let enabled = false
  let visible = false
  /** @type {WebMcpRegistration | null} */
  let current = null
  /** @type {{ name: string, message: string }[]} */
  let failed = []
  /** @type {Promise<void>} */
  let queue = Promise.resolve()

  async function settle() {
    const wanted = enabled && visible && modelContext !== null
    if (!wanted && current !== null) {
      current.unregister()
      current = null
      failed = []
    } else if (wanted && current === null) {
      current = await registerWebMcpTools({ modelContext, endpoint, ...(tools ? { tools } : {}) })
      failed = current.failed
    }
    onChange?.({ enabled, visible, registered: current?.registered ?? [], failed })
  }

  return {
    update(patch) {
      const next = queue.then(() => {
        if (patch.enabled !== undefined) enabled = patch.enabled
        if (patch.visible !== undefined) visible = patch.visible
        return settle()
      })
      queue = next.catch(() => undefined)
      return next
    },
    get registered() {
      return current?.registered ?? []
    },
    get failed() {
      return failed
    },
  }
}

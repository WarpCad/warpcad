// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The **one** place that knows WebMCP's shape (`TODO/ai-021`, `docs/decisions/ai-partner.md`
 * Decision 13). The draft has already moved twice (`provideContext`/`clearContext` removed,
 * `navigator.modelContext` to `document.modelContext`), so detection, the registration object,
 * the annotations and the result value are all decided here and nowhere else. Framework-free.
 *
 * Facts this module is written against (re-verified 2026-10-14, Decision 13's table):
 *
 * - **Entry point** `document.modelContext`; older Chromes had `navigator.modelContext`.
 * - **Register** `registerTool({ name, description, inputSchema, execute, title?, annotations? },
 *   { signal? })`, returning a promise. There is no `unregisterTool`: aborting `signal` unregisters.
 * - **Result** `execute` returns any value and an agent gets its JSON. There is no MCP content
 *   array, so a tool's own failure is a value — `{ ok: false, error }` — never a throw, which a
 *   client would surface as a `DOMException` that ends the agent's loop.
 * - **Annotations** `readOnlyHint`, `untrustedContentHint`, `consequentialHint` (all default false).
 * - **Output budget** Chrome advises about 1.5K characters per tool result. Results are
 *   **measured** against {@link OUTPUT_BUDGET}: lists are paged with `limit`/`offset` and say how to
 *   ask for the rest; anything else over budget is returned whole with an `oversize` note. Nothing is
 *   cut silently.
 *
 * @module ai/webmcp/toolShape
 */

/** Chrome's advice for one tool result, in characters of its JSON. */
export const OUTPUT_BUDGET = 1500

/** The origin WebMCP writes carry (a transport value beside `ai` and `mcp`). */
export const WEBMCP_ORIGIN = 'webmcp'

/** The longest a no-rationale intent line (tool name and argument summary) may be. */
const REQUEST_MAX_LENGTH = 160

/**
 * Tools that change nothing — the document, the user's selection, the viewport. `select` is not
 * here: it changes the agent's working selection.
 */
const READ_ONLY_TOOLS = new Set([
  'check_clearance',
  'check_printability',
  'describe_body',
  'describe_scene',
  'get_selection',
  'get_timeline',
  'list_ops',
  'list_variables',
  'measure',
])

/**
 * Tools whose result carries **no** project text. Everything else returns body names, intent,
 * History labels or variable names — text from a file anyone may have written (Decision 7) — and is
 * marked `untrustedContentHint`. Listed this way round so a new tool is untrusted until shown not to be.
 */
const NO_PROJECT_TEXT = new Set(['list_ops'])

/**
 * Read tools whose result is a list an agent can page through, and which arrays hold the list.
 * `list_ops` has two (create ops, then operate ops), paged as one sequence.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const PAGED_TOOLS = Object.freeze({
  describe_scene: Object.freeze(['bodies']),
  get_timeline: Object.freeze(['rows']),
  list_ops: Object.freeze(['create', 'operate']),
  list_variables: Object.freeze(['variables']),
})

/**
 * @typedef {object} WebMcpAnnotations
 * @property {true} [readOnlyHint]
 * @property {true} [untrustedContentHint]
 */

/**
 * The object handed to `registerTool`.
 *
 * @typedef {object} WebMcpTool
 * @property {string} name
 * @property {string} description
 * @property {import('../tools/schema.js').JsonSchema} inputSchema
 * @property {WebMcpAnnotations} annotations
 * @property {(input: unknown, options?: unknown) => Promise<Record<string, any>>} execute
 */

/**
 * What `document.modelContext` must offer for WarpCad to use it.
 *
 * @typedef {object} ModelContext
 * @property {(tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<unknown> | unknown} registerTool
 * @property {(name: string) => unknown} [unregisterTool] An older Chrome's shape; called, quietly, if present.
 */

/**
 * @typedef {object} Paging
 * @property {number} [limit]
 * @property {number} [offset]
 */

/** @param {any} candidate @returns {boolean} */
const usable = (candidate) => Boolean(candidate) && typeof candidate.registerTool === 'function'

/**
 * Where the browser's WebMCP entry point was found: `document` (the current draft), `navigator`
 * (older Chromes), or `none`. For the diagnostic an agent reads (`TODO/ai-024`); the same rule as
 * {@link modelContextOf}, which prefers `document` and skips an object without `registerTool`.
 * Never throws.
 *
 * @param {any} [env] `globalThis` in the app; a plain object in a spec.
 * @returns {'document' | 'navigator' | 'none'}
 */
export function modelContextApiOf(env = globalThis) {
  try {
    if (usable(env?.document?.modelContext)) return 'document'
    if (usable(env?.navigator?.modelContext)) return 'navigator'
    return 'none'
  } catch {
    return 'none'
  }
}

/**
 * The browser's WebMCP entry point, or `null`. Never throws: a missing API, a partial one, a
 * locked-down embed or plain Node all read as "not available".
 *
 * @param {any} [env] `globalThis` in the app; a plain object in a spec.
 * @returns {ModelContext | null}
 */
export function modelContextOf(env = globalThis) {
  try {
    const api = modelContextApiOf(env)
    return api === 'none' ? null : env[api].modelContext
  } catch {
    return null
  }
}

/**
 * `TODO/ai-024`: Chrome 153 dropped `navigator.modelContext` for `document.modelContext`, but a
 * browser agent that probes only `navigator` reads "no WebMCP" and stops (Claude in Chrome did, on
 * 2026-10-17; with this alias set by hand it found the tools and added ten cubes). So when the
 * browser has the `document` API and `navigator` has none, expose the same object there. Never
 * replaces a `navigator.modelContext` the browser provides; never throws.
 *
 * @param {any} [env] `globalThis` in the app; a plain object in a spec.
 * @returns {boolean} Whether the alias was set.
 */
export function aliasNavigatorModelContext(env = globalThis) {
  try {
    if (modelContextApiOf(env) !== 'document' || !env.navigator || env.navigator.modelContext != null) return false
    Object.defineProperty(env.navigator, 'modelContext', { value: env.document.modelContext, configurable: true })
    return env.navigator.modelContext === env.document.modelContext
  } catch {
    return false
  }
}

/**
 * Decision 13 point 6: honest, per tool.
 *
 * @param {string} name
 * @returns {WebMcpAnnotations}
 */
export function annotationsFor(name) {
  /** @type {WebMcpAnnotations} */
  const annotations = {}
  if (READ_ONLY_TOOLS.has(name)) annotations.readOnlyHint = true
  if (!NO_PROJECT_TEXT.has(name)) annotations.untrustedContentHint = true
  return annotations
}

/**
 * The registry's own schema; a paged tool also takes `limit` and `offset` (consumed here, never
 * passed to the registry).
 *
 * @param {import('../tools/index.js').ToolDefinition} definition
 * @returns {import('../tools/schema.js').JsonSchema}
 */
export function schemaFor(definition) {
  if (PAGED_TOOLS[definition.name] === undefined) return definition.inputSchema
  const schema = /** @type {Record<string, any>} */ (definition.inputSchema)
  return {
    ...schema,
    properties: {
      ...schema.properties,
      limit: { type: 'integer', minimum: 1, description: 'WebMCP only: return at most this many items.' },
      offset: { type: 'integer', minimum: 0, description: 'WebMCP only: skip this many items first (a page says which offset comes next).' },
    },
  }
}

/**
 * Split the paging arguments off a paged tool's input. `error` names a bad value.
 *
 * @param {string} name
 * @param {unknown} input
 * @returns {{ input: unknown, paging: Paging, error?: string }}
 */
export function splitPaging(name, input) {
  if (PAGED_TOOLS[name] === undefined || typeof input !== 'object' || input === null || Array.isArray(input)) return { input, paging: {} }
  const { limit, offset, ...rest } = /** @type {Record<string, unknown>} */ (input)
  /** @type {Paging} */
  const paging = {}
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || /** @type {number} */ (limit) < 1) return { input: rest, paging, error: 'limit must be a whole number of 1 or more.' }
    paging.limit = /** @type {number} */ (limit)
  }
  if (offset !== undefined) {
    if (!Number.isInteger(offset) || /** @type {number} */ (offset) < 0) return { input: rest, paging, error: 'offset must be a whole number of 0 or more.' }
    paging.offset = /** @type {number} */ (offset)
  }
  return { input: rest, paging }
}

/**
 * The intent a write records when the agent gave no `rationale` (Decision 13): the tool name and
 * a one-line summary of its arguments, capped. With a rationale, `undefined` — the rationale is the
 * intent (`core/intent.js` composes it).
 *
 * @param {string} name
 * @param {unknown} input
 * @returns {string | undefined}
 */
export function requestFor(name, input) {
  const record = typeof input === 'object' && input !== null && !Array.isArray(input) ? /** @type {Record<string, unknown>} */ (input) : {}
  if (typeof record.rationale === 'string' && record.rationale.trim() !== '') return undefined
  const { rationale: _rationale, limit: _limit, offset: _offset, ...rest } = record
  const args = JSON.stringify(rest) ?? ''
  const line = (args === '{}' ? name : `${name} ${args}`).replace(/\s+/g, ' ')
  return line.length <= REQUEST_MAX_LENGTH ? line : `${line.slice(0, REQUEST_MAX_LENGTH - 1)}…`
}

/** @param {unknown} value */
const sizeOf = (value) => JSON.stringify(value).length

/**
 * `value` with `fields` (read in order as one sequence) cut to items `[start, start + count)`.
 *
 * @param {Record<string, any>} value
 * @param {readonly string[]} fields
 * @param {number} start
 * @param {number} count
 * @returns {Record<string, any>}
 */
function windowOf(value, fields, start, count) {
  const out = { ...value }
  let skipped = 0
  for (const field of fields) {
    const list = Array.isArray(value[field]) ? value[field] : []
    const from = Math.max(0, start - skipped)
    const to = Math.max(from, Math.min(list.length, start + count - skipped))
    out[field] = list.slice(from, to)
    skipped += list.length
  }
  return out
}

/**
 * The largest `count` in `[1, max]` (at least 1 when `max > 0`) whose `build(count)` fits the
 * budget. `build` is monotone in size, so a binary search.
 *
 * @param {number} max
 * @param {(count: number) => unknown} build
 * @returns {number}
 */
function largestFitting(max, build) {
  if (max === 0 || sizeOf(build(max)) <= OUTPUT_BUDGET) return max
  let low = 1
  let high = max - 1
  let best = 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (sizeOf(build(mid)) <= OUTPUT_BUDGET) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best
}

/**
 * Page a paged read tool's lists.
 *
 * @param {string} name
 * @param {Record<string, any>} value Already `{ ok: true, ... }`.
 * @param {Paging} paging
 * @returns {Record<string, any>}
 */
function pageList(name, value, paging) {
  const fields = PAGED_TOOLS[name]
  const total = fields.reduce((sum, field) => sum + (Array.isArray(value[field]) ? value[field].length : 0), 0)
  const offset = Math.min(paging.offset ?? 0, total)
  const room = Math.min(paging.limit ?? total, total - offset)
  const asked = paging.limit !== undefined || paging.offset !== undefined
  /** @param {number} shown */
  const build = (shown) => {
    const page = { offset, shown, total }
    const more = offset + shown < total ? { more: `${total - offset - shown} more. Call ${name} with offset: ${offset + shown} for the rest.` } : {}
    return { ...windowOf(value, fields, offset, shown), page: { ...page, ...more } }
  }
  if (!asked && sizeOf(value) <= OUTPUT_BUDGET) return value
  return build(largestFitting(room, build))
}

/**
 * Page the scene a write returns (`{ applied, scene }`), keeping every applied step.
 *
 * @param {Record<string, any>} value
 * @returns {Record<string, any>}
 */
function pageScene(value) {
  const bodies = /** @type {any[]} */ (value.scene.bodies)
  const total = bodies.length
  /** @param {number} shown */
  const build = (shown) => ({
    ...value,
    scene: {
      ...value.scene,
      bodies: bodies.slice(0, shown),
      page: {
        offset: 0,
        shown,
        total,
        ...(shown < total ? { more: `${total - shown} more bodies. Call describe_scene with offset: ${shown} for the rest.` } : {}),
      },
    },
  })
  return build(largestFitting(total, build))
}

/**
 * Turn a registry result into the value `execute` returns (Decision 13 points 4 and 7):
 * `{ ok: true, ...result }`, or `{ ok: false, error, ... }` for a refusal; fitted to
 * {@link OUTPUT_BUDGET} without cutting anything silently.
 *
 * @param {string} name
 * @param {Record<string, any>} result
 * @param {Paging} [paging]
 * @returns {Record<string, any>}
 */
export function toToolResult(name, result, paging = {}) {
  if (result.error !== undefined) {
    const { error, ...rest } = result
    return withOversizeNote({ ok: false, error: String(error), ...rest })
  }
  /** @type {Record<string, any>} */
  let value = { ok: true, ...result }
  if (PAGED_TOOLS[name] !== undefined) value = pageList(name, value, paging)
  else if (sizeOf(value) > OUTPUT_BUDGET && Array.isArray(value.scene?.bodies)) value = pageScene(value)
  return withOversizeNote(value)
}

/**
 * Anything still over the budget goes back whole, saying so.
 *
 * @param {Record<string, any>} value
 * @returns {Record<string, any>}
 */
function withOversizeNote(value) {
  const chars = sizeOf(value)
  if (chars <= OUTPUT_BUDGET) return value
  return {
    ...value,
    oversize: { chars, budget: OUTPUT_BUDGET, note: 'This result is longer than the 1,500 characters advised for one tool result. Ask about fewer bodies at a time if your client cuts it short.' },
  }
}

/**
 * The registration object for one registry tool.
 *
 * @param {import('../tools/index.js').ToolDefinition} definition
 * @param {(input: unknown) => Promise<Record<string, any>>} execute
 * @returns {WebMcpTool}
 */
export function toWebMcpTool(definition, execute) {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: schemaFor(definition),
    annotations: annotationsFor(definition.name),
    execute: (input) => execute(input),
  }
}

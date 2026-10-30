// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The AI tool registry (`TODO/ai-002`, `docs/decisions/ai-partner.md` decision 1): the
 * one place a tool is defined. Framework-free, so it runs in plain Node.
 *
 * Two thin adapters consume it and neither adds tools of its own: the browser agent
 * (`ai-005`, Messages API `tools`, origin `ai`) and the MCP server (`ai-009`,
 * `tools/list`, origin `mcp`). A tool sees which transport called it only through
 * `ctx.origin`, and the list differs by transport in exactly one way: the selection
 * tools are browser-only, because the MCP server edits a closed file with no human
 * looking at a selection, and `capture_view` (`ai-007`) is too, because Node has no GPU to
 * render with. The agent also drops `capture_view` from a turn when the browser has no working
 * viewport to hand over (`ToolContext.capture`), so no list ever offers a tool that fails every
 * time.
 *
 * A third adapter, WebMCP (`TODO/ai-021`, `src/ai/webmcp/`, origin `webmcp`), registers the live
 * bridge's list minus {@link WEBMCP_WITHHELD} on the open tab's `document.modelContext`, and adds
 * no tools either.
 *
 * ## Tool reference (reused by `docs/mcp.md`, `ai-009`)
 *
 * Units throughout: millimetres, Z up, degrees.
 *
 * | Tool | Writes | What it does |
 * |---|---|---|
 * | `list_ops` | no | The catalogue, split as the tools are: `create` ops (zero operands) and `operate` ops (one, or two or more), each with its params schema and defaults. Optional `{ detail: 'summary' }` (param names only, ~1/7 the size), `{ ops: [...] }` (just those, in full; at most 20) and `{ kind }` (one half) — `TODO/ai-030`. |
 * | `describe_scene` | no | Every body: id, name, op, bounds and size in mm, colour, part names. Never a mesh. |
 * | `describe_body` | no | One body: the above plus params, centre position and rotation. |
 * | `get_timeline` | no | The History rows: op, label, origin, suppressed / active / broken. |
 * | `get_selection` | no | Browser only. The user's current selection. |
 * | `select` | selection only | Browser only. Select bodies so the user sees which ones the model means. |
 * | `create` | yes | Place one body: `{ op, positionMm, params? }`. Zero-operand Library ops only. |
 * | `operate` | yes | One operation: `{ op, operands: [{ id, pieces? }], params? }`. Refused by name on a wrong operand count or an id that is not a body on screen. |
 * | `repeat` | yes | `{ source, seedBody, seedPart, targets }`: one linked `pattern.repeat` (`TODO/core-061`) — the source's own steps re-aimed from `seedPart` at each target, as one new body. Refused in core's words; at most 64 targets. |
 * | `apply_records` | yes | `{ steps: [{ create } \| { operate }], prompt? }` as one atomic change; a step names an earlier step's body as `@n`. `prompt` records the request with it (`ai-031`). |
 * | `record_prompt` | yes (the prompt only) | MCP and WebMCP (`ai-031`). `{ prompt }`: the user's request, in their words, stored in the project and linked to every record written for it afterwards; echoes `{ id, text, truncated }`. Called once, first. |
 * | `record_response` | yes (the reply only) | MCP and WebMCP (`ai-032`). `{ response }`: the agent's final message, appended as a segment under the bound prompt (`ctx.prompt`); refuses with none bound; echoes `{ promptId, id, text, truncated }`. Called last. |
 * | `set_description` | yes (the description only) | MCP and in-app (`io-023`). `{ description }`: the project's description for people, in a small Markdown subset (no links, images, headings or HTML); replaces it, `''` clears it; echoes `{ text, truncated, previous }`. |
 * | `measure` | no | `{ ids }`: bounds and size (mm), volume (mm³), surface area (mm²), centre of mass; a total for several, overlaps counted once. |
 * | `check_printability` | no | `{ ids, buildVolumeMm?, minWallMm?, nozzleMm? }`: watertight, fits the build volume (and which way round), thinnest wall by sampling, walls under the nozzle — `issues: [{ severity, message, where }]`. Heuristic, and says so. |
 * | `check_clearance` | no | `{ a, b }`: the smallest gap between two bodies and the closest points, or the volume they share when they interpenetrate. |
 * | `capture_view` | no | Browser only. `{ view, ids?, highlight?, section?, width?, overlay?, sliceId? }`: a PNG of the turn's scene from a named view, rendered offscreen; the image goes to the model as an image block. `overlay: 'reference'` (top view) lays the model over a scaled reference image (`ai-008`). |
 * | `get_reference_image` | no | Browser only (`ai-008`). `{ sliceId? }`: list the reference images (attachments, sketch slices' photos) or return one, with its pixel size and scale. |
 * | `set_reference_scale` | no document write | Browser only. `{ sliceId, fromPx, toPx, distanceMm, label?, checks? }`: an attached image's scale from a printed length; cross-checks other dimensions. |
 * | `locate_in_image` | no | Browser only. `{ sliceId, query, boxesPx }`: boxes in image pixels and in sketch-plane mm; refused until the image is scaled. |
 * | `save_to_library` | **never** | Browser only. `{ id, name, expose? }`: *proposes* a My parts save; the user's Confirm tap saves it. |
 * | `list_variables` | no | `{ id? }`: every project variable — name, kind, value (and in words), unit or options, and `usedBy` (each step and slot that reads it). With `id`, also the slots that step can bind (`bindableParams`), or core's reason it cannot. |
 * | `define_variable` | yes | `{ name, kind, value, label?, unit?, min?, max?, options? }`: one `var.define` record (`TODO/ai-014`). Counted as one record. |
 * | `set_variable` | yes | `{ name, value }`: every bound param follows, in one revision. Runs `variableImpactOf` first; a value that would break a dependent writes nothing and returns `breakages`. Returns `changedParams`, `parts`, `summary`. |
 * | `bind_param` | yes | `{ id, path, name }`: bind one slot (`model`, `size.2`) of a step to a variable. Refused in core's words for a slot `bindableParams` does not offer (a rotate step, a boolean) or a kind that does not fit. |
 * | `unbind_param` | yes | `{ id, path }`: the slot keeps its current value as a literal. |
 * | `rename_variable` | yes | `{ from, to }`: the definition and every binding and condition, in one revision. |
 * | `delete_variable` | yes | `{ name, keepValues? }`: refused with `usedBy` while anything reads it, unless `keepValues` rewrites the bindings to literals first. |
 *
 * Every write tool also takes an optional `rationale`: one line saying why. With the turn's
 * request (`ctx.request`, or else the bound prompt's text) it is saved as each new record's
 * design intent (`TODO/ai-003`), which `get_timeline`, `describe_scene` and `describe_body`
 * return as `intent`.
 *
 * ## The prompt (`TODO/ai-031`)
 *
 * After every call, {@link ToolRegistry.run} links the records the call added to the context's
 * bound prompt (`ctx.prompt`, `./prompt.js`), storing that prompt first if it was not yet. So
 * every write tool, on every transport, says which request it was made for — a boolean's result
 * included — without any tool knowing about prompts. `describe_body` returns a body's prompts.
 *
 * The variable tools are not kernel ops: `var.define` is never in `list_ops`, and `create` /
 * `apply_records` cannot write one (`docs/decisions/project-variables.md`). Their writes are
 * thin wrappers over `src/core/variables.js` — see `./variables.js` for their result shapes.
 *
 * A write returns `{ applied: [{ batchStep, tool, bodyId, recordIds }], scene }`, the
 * new state rather than a bare "ok". A refused write returns `{ error, step, reason,
 * batchStep }`, where `error` is the document's own `ReplayRejection` sentence when the
 * fold refused it (`Step 4 (Fillet Cube 1) can't be built: …`), and the document is
 * unchanged. A cap returns `{ error, limit, stop: true }`, and the turn is over.
 *
 * ## Running a tool
 *
 * {@link ToolRegistry.run} is the only entry point a transport calls. In order, it:
 *
 * 1. refuses an origin other than `ai`/`mcp`/`webmcp` (thrown: a transport bug);
 * 2. counts the call against the turn's step and time caps;
 * 3. checks the input's shape against the tool's schema and names what is wrong;
 * 4. runs the tool;
 * 5. tracks the failure streak, stopping the turn after three in a row.
 *
 * Tools are synchronous: the document folds synchronously. The kernel worker is the
 * *app's* path for rendering and is not involved here.
 *
 * That includes the analysis tools (`ai-007`), which do their kernel and ray work right here,
 * on the main thread, during a turn — the same place the fork's folds already run. Their cost
 * is bounded rather than moved: wall thickness casts at most 4,000 rays through a bounding
 * volume hierarchy (`src/core/kernel/meshQuery.js`), measured at about 13 ms on a 100-slice
 * wing (`bench/results/2026-10-09-ai-007.md`). A turn already blocks the user's edits
 * (decision 5), and these never run in the pan/zoom/drag frame path the 16 ms budget is for.
 * Moving them to the worker would make `run` asynchronous for every transport; that is worth
 * doing when a measured case needs it, not before.
 *
 * @module ai/tools
 */

import { registry as kernelRegistry } from '../../core/kernel/registry.js'
import { applySteps, createApplyRecordsTool } from './batch.js'
import { createCaptureTool } from './capture.js'
import { createClearanceTool } from './clearance.js'
import { createCreateTool, creatableOps } from './create.js'
import { createSetDescriptionTool } from './description.js'
import { createImageTools } from './image.js'
import { createSaveToLibraryTool } from './library.js'
import { LIMITS, assertWriteOrigin } from './limits.js'
import { createMeasureTool } from './measure.js'
import { OPERATIONS, createOperateTool, operableOps } from './operate.js'
import { createPrintabilityTool } from './printability.js'
import { createReadTools } from './read.js'
import { createRepeatTool } from './repeat.js'
import { createRecordPromptTool, createRecordResponseTool, knownIds, linkProduced } from './prompt.js'
import { checkInput, objectSchema, paramsSchemaFor } from './schema.js'
import { createVariableTools } from './variables.js'

export { LIMITS, WRITE_ORIGINS, createTurn } from './limits.js'
export { toStrictWire } from './schema.js'

/** @typedef {import('../../core/kernel/registry.js').RegistryEntry} RegistryEntry */
/** @typedef {Readonly<Record<string, RegistryEntry>>} Registry */
/**
 * `webmcp` (`TODO/ai-021`, Decision 13): an in-browser agent calling tools the open tab registers
 * on `document.modelContext`. It lists what the live bridge lists, minus {@link WEBMCP_WITHHELD}.
 *
 * @typedef {'ai' | 'mcp' | 'webmcp'} Transport
 */

/**
 * The live bridge's seam (`TODO/ai-012`, Decision 11 point 2): the browser tools an `mcp` client
 * may also call when its calls run in an open WarpCad tab rather than on a closed file. The tab
 * has a selection and a GPU, so these work there; the image and save-proposal tools need the
 * in-app chat (attachments, a Confirm tap) and stay browser-chat only. A capability flag
 * (`{ live: true }` on {@link ToolRegistry.toolsFor} / {@link ToolContext.live}), not a third
 * transport: records keep origin `mcp`.
 */
export const LIVE_BROWSER_TOOLS = Object.freeze(['capture_view', 'get_selection', 'select'])

/**
 * The WebMCP seam (`TODO/ai-021`, Decision 13 point 7): `webmcp` is a third transport onto the
 * same registry, running in the open tab like the live bridge, so it lists exactly the live
 * bridge's tools — minus these. A WebMCP result is a JSON value with no image type, and a PNG as a
 * base64 string is far over Chrome's 1.5K-character advice, so vision stays with the chat and
 * the bridge.
 */
export const WEBMCP_WITHHELD = Object.freeze(['capture_view'])

/**
 * @typedef {object} ListOptions
 * @property {boolean} [live] `mcp` from an open tab (the live bridge): add {@link LIVE_BROWSER_TOOLS}.
 */

/**
 * The selection, as the browser transport hands it over from its selection store.
 *
 * @typedef {object} ToolSelection
 * @property {() => string[]} ids The selected body ids.
 * @property {(ids: string[]) => void} select Replace the selection.
 */

/**
 * Everything a tool is given, and everything it may touch (decision 7). There is no
 * network handle, no key and no storage: a tool cannot reach what it is not handed.
 *
 * @typedef {object} ToolContext
 * @property {import('../../core/document.js').WarpDocument} document The document the
 *   writes land on: in the browser, the turn's forked document (decision 5); in MCP, the
 *   loaded project file. It must use the same op registry the tool registry was built with.
 * @property {string} origin `ai`, `mcp` or `webmcp`; every write carries it.
 * @property {import('./limits.js').Turn} turn This turn's budget.
 * @property {ToolSelection} [selection] Browser only.
 * @property {import('./capture.js').ToolCapture} [capture] Browser only, and only with a working
 *   viewport: what `capture_view` renders through (`src/render/offscreenCapture.js`).
 * @property {import('./image.js').ToolReferences} [references] Browser only (`TODO/ai-008`):
 *   images attached in the chat (already sanitised), the scales set on them, and the prepared
 *   copies of project photos — what the image tools and a sketch's `referenceImage` read.
 * @property {import('./library.js').SaveProposal[]} [proposals] Browser only (`TODO/ai-008`):
 *   where `save_to_library` records its proposal for the agent to hand back. Never a library.
 * @property {string} [request] `TODO/ai-003`: the user's message that started this turn. With
 *   each write's own `rationale` it becomes the design intent every appended record carries.
 *   The agent (`ai-005`) or the MCP server (`ai-009`) sets it; absent, only the rationale is
 *   recorded.
 * @property {boolean} [live] `TODO/ai-012`: an `mcp` call running in the open tab (the live
 *   bridge), which may also use {@link LIVE_BROWSER_TOOLS}. Origin stays `mcp`.
 * @property {PromptBinding} [prompt] `TODO/ai-031`: the prompt this context's writes are for.
 *   The registry links every record a call adds to it, storing it first while `id` is `null`;
 *   `record_prompt` replaces it. A transport that builds a context per call carries it over.
 */

/**
 * @typedef {object} PromptBinding
 * @property {string | null} id The stored prompt's id; `null` until something is written for it.
 * @property {string} text The prompt, cleaned (`src/core/prompt.js`).
 */

/**
 * @typedef {object} Tool
 * @property {string} name
 * @property {string} description
 * @property {import('./schema.js').JsonSchema} inputSchema Always `type: 'object'`.
 * @property {readonly Transport[]} transports Which transports list it.
 * @property {(input: unknown) => string[]} [validate] Replaces the generic shape check
 *   where `params` must be judged against the chosen op.
 * @property {(ctx: ToolContext, input: any) => Record<string, any>} run
 */

/**
 * What a transport sends to its client: the definition, without the code.
 *
 * @typedef {object} ToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {import('./schema.js').JsonSchema} inputSchema
 */

/**
 * @typedef {object} ToolRegistry
 * @property {readonly Tool[]} tools Every tool, sorted by name.
 * @property {(transport: Transport, options?: ListOptions) => Tool[]} toolsFor The tools one
 *   transport lists.
 * @property {(transport: Transport, options?: ListOptions) => ToolDefinition[]} definitions
 *   Deterministic: same registry, same JSON, so a cached prompt prefix never shifts (decision 9).
 * @property {(ctx: ToolContext, name: string, input: unknown) => Record<string, any>} run
 */

/**
 * `list_ops`: the catalogue, split the way the tools are.
 *
 * @param {Registry} ops
 * @returns {Tool}
 */
function createListOpsTool(ops) {
  const create = creatableOps(ops).map((op) => {
    const entry = ops[op]
    const { schema, defaults } = paramsSchemaFor(op, ops)
    return { op, label: entry.ui?.label ?? op, kind: entry.kind, operandCount: entry.operandCount, params: schema, defaults }
  })
  const operate = operableOps(ops).map((op) => {
    const entry = ops[op]
    return {
      op,
      label: OPERATIONS[op].label,
      kind: entry.kind,
      operandCount: entry.operandCount,
      partAddressable: entry.subPartOperands === true,
      description: OPERATIONS[op].description,
      params: OPERATIONS[op].params,
    }
  })
  const full = Object.freeze({ create, operate })
  /** @param {{ params: any }} entry */
  const paramNames = (entry) => Object.keys(entry.params?.properties ?? {})
  /** The same data as `full`, minus schemas and defaults: the names cannot disagree with the schemas. */
  const summary = Object.freeze({
    create: create.map(({ op, label, kind, operandCount, params }) => ({ op, label, kind, operandCount, params: paramNames({ params }) })),
    operate: operate.map(({ op, label, kind, operandCount, partAddressable, params }) => ({
      op,
      label,
      kind,
      operandCount,
      partAddressable,
      params: paramNames({ params }),
    })),
  })
  const known = [...create, ...operate].map((entry) => entry.op)
  const inputSchema = objectSchema({
    detail: {
      type: 'string',
      enum: ['summary', 'full'],
      description: 'summary: every op with its param names only (about a seventh of the size). full (the default): schemas and defaults.',
    },
    ops: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: LIMITS.listOpsIds,
      description: `Only these ops, in full, in this order (at most ${LIMITS.listOpsIds}), e.g. ["primitive.cylinder", "boolean.subtract"].`,
    },
    kind: { type: 'string', enum: ['create', 'operate'], description: 'Only the create ops, or only the operate ops.' },
  })
  return {
    name: 'list_ops',
    description:
      'List what can be made and what can be done: create ops (place from nothing) and operate ops (need existing bodies), ' +
      'each with its operand count, params schema and defaults. Lengths in millimetres, angles in degrees. ' +
      'The full list is large: call with { detail: "summary" } to see every op and its param names, then with ' +
      '{ ops: ["primitive.cylinder", ...] } for the full schema of just the ones you use. { kind } keeps one half.',
    inputSchema,
    transports: ['ai', 'mcp'],
    run: (_ctx, input) => {
      const { detail, ops: asked, kind } = /** @type {{ detail?: string, ops?: string[], kind?: string }} */ (input ?? {})
      if (asked !== undefined) {
        const unknown = asked.filter((id) => !known.includes(id))
        if (unknown.length > 0) {
          return {
            error: `input.ops names ${unknown.map((id) => JSON.stringify(id)).join(', ')}, which ${unknown.length === 1 ? 'is' : 'are'} not in the catalogue.`,
            closest: [...new Set(unknown.flatMap((id) => closestIds(id, known, 5)))].slice(0, 5),
          }
        }
        const pick = (/** @type {any[]} */ list) => asked.filter((id) => list.some((entry) => entry.op === id)).map((id) => list.find((entry) => entry.op === id))
        /** @type {Record<string, any[]>} */
        const source = detail === 'summary' ? summary : full
        /** @type {Record<string, any[]>} */
        const picked = {
          create: kind === 'operate' ? [] : pick(source.create),
          operate: kind === 'create' ? [] : pick(source.operate),
        }
        return kind === undefined ? picked : { [kind]: picked[kind] }
      }
      /** @type {Record<string, any[]>} */
      const source = detail === 'summary' ? summary : full
      if (kind !== undefined) return { [kind]: source[kind] }
      return { create: source.create, operate: source.operate }
    },
  }
}

/**
 * The `count` known ids nearest to a mistyped one: a shared word first, then edit distance.
 *
 * @param {string} wanted
 * @param {string[]} known
 * @param {number} count
 * @returns {string[]}
 */
function closestIds(wanted, known, count) {
  const lower = wanted.toLowerCase()
  const words = lower.split(/[^a-z0-9]+/).filter(Boolean)
  const score = (/** @type {string} */ id) => {
    const shared = words.filter((word) => id.toLowerCase().includes(word)).length
    return shared * 100 - editDistance(lower, id.toLowerCase())
  }
  return [...known].sort((a, b) => score(b) - score(a) || (a < b ? -1 : 1)).slice(0, count)
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i]
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    row = next
  }
  return row[b.length]
}

/**
 * Why a tool the registry has is refused on this transport, in a sentence the model can act on.
 *
 * @param {string} name
 * @param {string} origin
 * @returns {string}
 */
function notOfferedReason(name, origin) {
  if (origin === 'webmcp') {
    return `${name} is not available over WebMCP: its result is an image, which this transport cannot carry. Use describe_scene, describe_body or measure instead.`
  }
  const over = origin === 'mcp' ? 'MCP' : origin
  return `${name} is not available over ${over}: it needs the browser viewport (a selection to read, or a GPU to render with).`
}

/**
 * Build the tool registry over an op catalogue.
 *
 * @param {object} [options]
 * @param {Registry} [options.registry] The kernel registry; the real one by default. A
 *   spec passes a fake (`CLAUDE.md`: mock at the boundary).
 * @returns {ToolRegistry}
 */
export function createToolRegistry(options = {}) {
  const ops = options.registry ?? kernelRegistry
  /** @param {ToolContext} ctx @param {any[]} steps @param {string} [rationale] */
  const apply = (ctx, steps, rationale) => applySteps(ctx, steps, ops, rationale)
  const tools = Object.freeze(
    [
      ...createReadTools(),
      createListOpsTool(ops),
      createCreateTool(ops, apply),
      createOperateTool(ops, apply),
      createApplyRecordsTool(ops),
      createMeasureTool(),
      createPrintabilityTool(),
      createClearanceTool(),
      createRepeatTool(),
      createRecordPromptTool(),
      createRecordResponseTool(),
      createSetDescriptionTool(),
      createCaptureTool(),
      ...createImageTools(),
      createSaveToLibraryTool(),
      ...createVariableTools(),
    ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  )

  /**
   * @param {Tool} tool
   * @param {Transport} transport
   * @param {ListOptions} options
   */
  const offered = (tool, transport, options) => {
    if (transport === 'webmcp') return !WEBMCP_WITHHELD.includes(tool.name) && offeredLive(tool)
    return tool.transports.includes(transport) || (options.live === true && transport === 'mcp' && LIVE_BROWSER_TOOLS.includes(tool.name))
  }
  /** @param {Tool} tool What an `mcp` call from an open tab may use. */
  const offeredLive = (tool) => tool.transports.includes('mcp') || LIVE_BROWSER_TOOLS.includes(tool.name)
  /** @param {Transport} transport @param {ListOptions} [options] */
  const toolsFor = (transport, options = {}) => tools.filter((tool) => offered(tool, transport, options))

  return {
    tools,
    toolsFor,
    definitions: (transport, options) =>
      toolsFor(transport, options).map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
    run(ctx, name, input) {
      assertWriteOrigin(ctx.origin)
      const hit = ctx.turn.beginStep(name)
      if (hit) return hit

      const transport = /** @type {Transport} */ (ctx.origin)
      // A WebMCP call always runs in the open tab.
      const options = { live: ctx.live === true || transport === 'webmcp' }
      const tool = tools.find((candidate) => candidate.name === name)
      const known = knownIds(ctx.document)
      /** @type {Record<string, any>} */
      let result
      if (!tool) {
        result = { error: `There is no tool named ${JSON.stringify(name)}. The tools are: ${toolsFor(transport, options).map((t) => t.name).join(', ')}.` }
      } else if (!offered(tool, transport, options)) {
        result = { error: notOfferedReason(name, ctx.origin) }
      } else {
        const errors = tool.validate ? tool.validate(input) : checkInput(tool.inputSchema, input)
        result = errors.length > 0 ? { error: 'invalid input', reason: errors.join('; ') } : tool.run(ctx, input)
      }
      // `TODO/ai-031`: whatever the call added is linked to the bound prompt. A refused call added nothing.
      const problem = linkProduced(ctx, known)
      if (problem !== undefined) result = { ...result, promptNotRecorded: problem }

      // A cap hit inside the tool (a records cap) has already stopped the turn.
      if (result.stop === true) return result
      const failure = ctx.turn.endStep(name, result.error === undefined)
      return failure ? { ...result, stop: true, limit: failure.limit, stopReason: failure.error } : result
    },
  }
}

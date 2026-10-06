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
 * looking at a selection. (`capture_view`, `ai-007`, will be the second browser-only
 * tool.)
 *
 * ## Tool reference (reused by `docs/mcp.md`, `ai-009`)
 *
 * Units throughout: millimetres, Z up, degrees.
 *
 * | Tool | Writes | What it does |
 * |---|---|---|
 * | `list_ops` | no | The catalogue, split as the tools are: `create` ops (zero operands) and `operate` ops (one, or two or more), each with its params schema and defaults. |
 * | `describe_scene` | no | Every body: id, name, op, bounds and size in mm, colour, part names. Never a mesh. |
 * | `describe_body` | no | One body: the above plus params, centre position and rotation. |
 * | `get_timeline` | no | The History rows: op, label, origin, suppressed / active / broken. |
 * | `get_selection` | no | Browser only. The user's current selection. |
 * | `select` | selection only | Browser only. Select bodies so the user sees which ones the model means. |
 * | `create` | yes | Place one body: `{ op, positionMm, params? }`. Zero-operand Library ops only. |
 * | `operate` | yes | One operation: `{ op, operands: [{ id, pieces? }], params? }`. Refused by name on a wrong operand count or an id that is not a body on screen. |
 * | `apply_records` | yes | `{ steps: [{ create } \| { operate }] }` as one atomic change; a step names an earlier step's body as `@n`. |
 *
 * Every write tool also takes an optional `rationale`: one line saying why. With the turn's
 * request (`ctx.request`) it is saved as each new record's design intent (`TODO/ai-003`),
 * which `get_timeline`, `describe_scene` and `describe_body` return as `intent`.
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
 * 1. refuses an origin other than `ai`/`mcp` (thrown: a transport bug);
 * 2. counts the call against the turn's step and time caps;
 * 3. checks the input's shape against the tool's schema and names what is wrong;
 * 4. runs the tool;
 * 5. tracks the failure streak, stopping the turn after three in a row.
 *
 * Tools are synchronous: the document folds synchronously. The kernel worker is the
 * *app's* path for rendering and is not involved here.
 *
 * @module ai/tools
 */

import { registry as kernelRegistry } from '../../core/kernel/registry.js'
import { applySteps, createApplyRecordsTool } from './batch.js'
import { createCreateTool, creatableOps } from './create.js'
import { assertWriteOrigin } from './limits.js'
import { OPERATIONS, createOperateTool, operableOps } from './operate.js'
import { createReadTools } from './read.js'
import { checkInput, objectSchema, paramsSchemaFor } from './schema.js'

export { LIMITS, WRITE_ORIGINS, createTurn } from './limits.js'
export { toStrictWire } from './schema.js'

/** @typedef {import('../../core/kernel/registry.js').RegistryEntry} RegistryEntry */
/** @typedef {Readonly<Record<string, RegistryEntry>>} Registry */
/** @typedef {'ai' | 'mcp'} Transport */

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
 * @property {string} origin `ai` or `mcp`; every write carries it.
 * @property {import('./limits.js').Turn} turn This turn's budget.
 * @property {ToolSelection} [selection] Browser only.
 * @property {string} [request] `TODO/ai-003`: the user's message that started this turn. With
 *   each write's own `rationale` it becomes the design intent every appended record carries.
 *   The agent (`ai-005`) or the MCP server (`ai-009`) sets it; absent, only the rationale is
 *   recorded.
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
 * @property {(transport: Transport) => Tool[]} toolsFor The tools one transport lists.
 * @property {(transport: Transport) => ToolDefinition[]} definitions Deterministic: same
 *   registry, same JSON, so a cached prompt prefix never shifts (decision 9).
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
  return {
    name: 'list_ops',
    description:
      'List what can be made and what can be done: create ops (place from nothing) and operate ops (need existing bodies), ' +
      'each with its operand count, params schema and defaults. Lengths in millimetres, angles in degrees.',
    inputSchema: objectSchema({}),
    transports: ['ai', 'mcp'],
    run: () => ({ create, operate }),
  }
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
    ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  )

  /** @param {Transport} transport */
  const toolsFor = (transport) => tools.filter((tool) => tool.transports.includes(transport))

  return {
    tools,
    toolsFor,
    definitions: (transport) =>
      toolsFor(transport).map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
    run(ctx, name, input) {
      assertWriteOrigin(ctx.origin)
      const hit = ctx.turn.beginStep(name)
      if (hit) return hit

      const tool = tools.find((candidate) => candidate.name === name)
      /** @type {Record<string, any>} */
      let result
      if (!tool) {
        result = { error: `There is no tool named ${JSON.stringify(name)}. The tools are: ${toolsFor(/** @type {Transport} */ (ctx.origin)).map((t) => t.name).join(', ')}.` }
      } else if (!tool.transports.includes(/** @type {Transport} */ (ctx.origin))) {
        result = { error: `${name} is not available over ${ctx.origin === 'mcp' ? 'MCP' : ctx.origin}: there is no viewport selection there.` }
      } else {
        const errors = tool.validate ? tool.validate(input) : checkInput(tool.inputSchema, input)
        result = errors.length > 0 ? { error: 'invalid input', reason: errors.join('; ') } : tool.run(ctx, input)
      }

      // A cap hit inside the tool (a records cap) has already stopped the turn.
      if (result.stop === true) return result
      const failure = ctx.turn.endStep(name, result.error === undefined)
      return failure ? { ...result, stop: true, limit: failure.limit, stopReason: failure.error } : result
    },
  }
}

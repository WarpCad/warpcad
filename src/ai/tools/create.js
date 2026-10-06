// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `create` tool (`TODO/ai-002`): place a new body, the AI equivalent of dragging a
 * Library row into the viewport.
 *
 * **Only zero-operand ops, and only the ones the Library offers.** {@link creatableOps}
 * is "`operandCount: 0` with `ui` metadata", the same two facts `src/core/library.js`
 * builds its rows from, so the model can place exactly what a human can and nothing a
 * human cannot: not a 2D `profile.*` intermediate, and not `hardware.screw` until it
 * gets a Library row of its own. Operations are a separate tool (`operate.js`), never a
 * branch of this one (`CLAUDE.md`'s creation-vs-operation rule, applied to the model).
 *
 * **A created body is placed, never spawned at the origin.** `positionMm` is required.
 * Its x and y are where the body's footprint is centred and its z is the height its
 * underside rests at, which is exactly a drop on the grid plane when z is 0. The records
 * are the ones a drag commits (`library.js`'s `recordsForDrop`): one record for a native
 * op, whose `center` param takes the resting position, and two for a composite (the
 * recipe, then a `transform.translate` superseding it), because a recipe has no position
 * param to take. `create.spec.js` checks that every Library row produces byte-identical
 * records to `recordsForDrop`. The placement is written out here, not called, only
 * because `recordsForDrop` is tied to the real catalogue and these tools also run
 * against a test registry.
 *
 * A Sketch is the one exception, and it follows the sketch editor rather than the drop:
 * `positionMm` is the sketch plane's origin, as the editor's Done commits it
 * (`src/composables/useSketchEditorCommands.js`), because a sketch drawn off-centre must
 * stay where it was drawn.
 *
 * @module ai/tools/create
 */

import { evaluateOp } from '../../core/kernel/index.js'
import { boundsOf } from '../../core/kernel/group.js'
import { registry as kernelRegistry } from '../../core/kernel/registry.js'
import { checkInput, objectSchema, paramsSchemaFor, vectorSchema } from './schema.js'

/** @typedef {import('../../core/document.js').WarpDocument} WarpDocument */
/** @typedef {import('../../core/kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('../../core/kernel/registry.js').RegistryEntry} RegistryEntry */
/** @typedef {Readonly<Record<string, RegistryEntry>>} Registry */
/** @typedef {import('./schema.js').JsonSchema} JsonSchema */

/**
 * @typedef {object} CreateInput
 * @property {string} op
 * @property {[number, number, number]} positionMm
 * @property {Record<string, any>} [params]
 */

/**
 * @typedef {object} BuiltStep
 * @property {OpRecord[]} records In append order.
 * @property {string} bodyId The body's id afterwards (its lineage root).
 */

/**
 * The ops `create` takes: zero operands and a Library entry, sorted.
 *
 * @param {Registry} [ops]
 * @returns {string[]}
 */
export function creatableOps(ops = kernelRegistry) {
  return Object.keys(ops)
    .filter((op) => ops[op].operandCount === 0 && ops[op].ui !== undefined)
    .sort()
}

/**
 * An instance id's prefix: the op without its namespace, as `library.js` numbers it.
 *
 * @param {string} op
 * @returns {string}
 */
function idPrefixFor(op) {
  const dot = op.indexOf('.')
  return dot === -1 ? op : op.slice(dot + 1)
}

/**
 * The records one create commits. Nothing is appended here, and nothing is built
 * before the params have been measured, so a refusal never spends an id.
 *
 * @param {WarpDocument} document Supplies ids and instance names.
 * @param {CreateInput} input
 * @param {Registry} [ops]
 * @returns {BuiltStep}
 */
export function buildCreateRecords(document, input, ops = kernelRegistry) {
  const { op, positionMm } = input
  const entry = ops[op]
  if (!entry || entry.operandCount !== 0 || !entry.ui) throw new Error(`${op} is not something create can place`)
  const ui = entry.ui
  const [x, y, z] = positionMm
  const params = { ...ui.defaults, ...(input.params ?? {}) }

  if (ui.editor === 'sketch') {
    const { center: _ghost, ...shape } = params
    /** @type {OpRecord} */
    const record = { id: document.nextId(idPrefixFor(op)), op, name: document.nextName(ui.label), params: { center: [x, y, z], ...shape } }
    return { records: [record], bodyId: /** @type {string} */ (record.id) }
  }

  if (entry.kind !== 'composite') {
    // `library.js`'s `restingCenter`: measured off the built solid, so the underside
    // lands on the plane for every primitive without a per-type branch.
    const [min] = boundsOf(evaluateOp(op, { ...params, center: [0, 0, 0] }, { registry: ops }))
    const restZ = -min[2]
    /** @type {OpRecord} */
    const record = {
      id: document.nextId(idPrefixFor(op)),
      op,
      name: document.nextName(ui.label),
      params: { ...params, center: [x, y, z === 0 ? restZ : restZ + z] },
    }
    return { records: [record], bodyId: /** @type {string} */ (record.id) }
  }

  // `library.js`'s `restingOffsetMm`: a composite is placed by translating its result.
  const [min, max] = boundsOf(evaluateOp(op, params, { registry: ops }))
  const id = document.nextId(idPrefixFor(op))
  /** @type {OpRecord} */
  const created = { id, op, name: document.nextName(ui.label), params }
  /** @type {OpRecord} */
  const drop = {
    id: document.nextId(`${id}-drop`),
    op: 'transform.translate',
    target: id,
    supersedes: id,
    params: {
      vector: [x - (min[0] + max[0]) / 2, y - (min[1] + max[1]) / 2, z === 0 ? 0 - min[2] : z - min[2]],
      rotation: [0, 0, 0],
    },
  }
  return { records: [created, drop], bodyId: id }
}

/**
 * Identical branches collapse to one, so twelve fixed-shape recipes with no params
 * cost the schema one `{}` branch rather than twelve.
 *
 * @param {JsonSchema[]} branches
 * @returns {JsonSchema[]}
 */
export function uniqueBranches(branches) {
  const seen = new Set()
  return branches.filter((branch) => {
    const key = JSON.stringify(branch)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * The create tool's input schema. `params` is an `anyOf` of every creatable op's own
 * params schema (strict mode needs every object closed, so it cannot be free-form);
 * {@link validateCreateInput} then checks it against the chosen op's branch, so a wrong
 * param is named against the op the model picked.
 *
 * @param {Registry} ops
 * @returns {JsonSchema}
 */
export function createInputSchema(ops) {
  const creatable = creatableOps(ops)
  return objectSchema(
    {
      op: { type: 'string', enum: creatable, description: 'The registry op to place. list_ops gives each one’s params and defaults.' },
      positionMm: vectorSchema(
        3,
        '[x, y, z] in millimetres, Z up. x and y centre the body’s footprint; z is the height its underside rests at (0 = on the grid). For a sketch, the sketch plane’s origin.'
      ),
      params: {
        description: 'Params for the chosen op; any omitted take the op’s defaults. Lengths in millimetres, angles in degrees.',
        anyOf: uniqueBranches(creatable.map((op) => paramsSchemaFor(op, ops).schema)),
      },
    },
    ['op', 'positionMm'],
    'One body to place.'
  )
}

/**
 * Check a create input, judging `params` against the chosen op's own schema.
 *
 * @param {Registry} ops
 * @param {JsonSchema} schema {@link createInputSchema}'s result.
 * @param {unknown} input
 * @param {string} [path]
 * @returns {string[]}
 */
export function validateCreateInput(ops, schema, input, path = 'input') {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return checkInput(schema, input, path)
  const { params, ...rest } = /** @type {Record<string, any>} */ (input)
  const errors = checkInput({ ...schema, properties: { ...schema.properties, params: objectSchema({}) } }, rest, path)
  if (errors.length > 0 || params === undefined) return errors
  const op = /** @type {string} */ (rest.op)
  return checkInput(paramsSchemaFor(op, ops).schema, params, `${path}.params`).map((error) => `${error} (for ${op})`)
}

/**
 * @param {Registry} ops
 * @param {(ctx: import('./index.js').ToolContext, steps: any[]) => Record<string, any>} applySteps
 * @returns {import('./index.js').Tool}
 */
export function createCreateTool(ops, applySteps) {
  const inputSchema = createInputSchema(ops)
  return {
    name: 'create',
    description:
      'Place one new body in the scene — the equivalent of dragging a Library item into the viewport. Creates only: to change, combine, ' +
      'move or turn existing bodies use operate. Millimetres, Z up, degrees. Returns the new body’s id and the scene afterwards.',
    inputSchema,
    validate: (input) => validateCreateInput(ops, inputSchema, input),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => applySteps(ctx, [{ create: input }]),
  }
}

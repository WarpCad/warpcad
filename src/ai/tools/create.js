// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `create` tool (`TODO/ai-002`): place a new body, the AI equivalent of dragging a
 * Library row into the viewport.
 *
 * **Only zero-operand ops, and only the ones the Library offers.** {@link creatableOps}
 * is "`operandCount: 0` with `ui` metadata", the same two facts `src/core/library.js`
 * builds its rows from, so the model can place exactly what a human can and nothing a
 * human cannot: not a 2D `profile.*` intermediate, and not the replay-only
 * `hardware.screw` — pan-head, flat-head and wood screws are placed through
 * `hardware.bolt` with a `type` (`TODO/core-060`), exactly as the Library's **Bolt /
 * screw** row places them. Operations are a separate tool (`operate.js`), never a
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
 * ## `copy` (`TODO/FIND-ai-045`)
 *
 * A new body with the same op and params as a body on screen, or as one part of a group (the
 * step `describe_step` reads for it). It is a create, not an operation: the records are the ones
 * {@link buildCreateRecords} writes for that op and those params, so the copy shares nothing
 * with its source and editing either leaves the other alone. A bound param is copied as the
 * value its source uses now (`literalParamsOf`), never as the binding, which `create` could not
 * place. Only a Library op can be copied; anything else (a Union, a group) is refused by name.
 * Absent `positionMm`, the copy stands where the source does now: its footprint centre and its
 * underside, read off the source's (or the part's) built bounds, so a part moved with its group
 * is copied where it is. A sketch keeps its own plane origin.
 *
 * @module ai/tools/create
 */

import { evaluateOp } from '../../core/kernel/index.js'
import { boundsOf, isGroup } from '../../core/kernel/group.js'
import { registry as kernelRegistry } from '../../core/kernel/registry.js'
import { literalParamsOf } from '../../core/variables.js'
import { checkInput, objectSchema, paramsSchemaFor, splitRationale, vectorSchema, withRationale } from './schema.js'
import { curvePoints } from '../../sketch/curves.js'
import { placeReferenceImages } from './image.js'
import { findBody, findStep, round3 } from './read.js'
import { renameRecord } from '../../core/operationRecords.js'

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
 * @property {string} [name] The body's name (`TODO/FIND-ai-041` gap 3); absent, the Library's
 *   numbered default ("Cube 1"). Written as the `style.rename` record the Inspector's rename
 *   appends, never as `record.name`, which is also the body's key in the scene group.
 */

/**
 * @typedef {object} BuiltStep
 * @property {OpRecord[]} records In append order.
 * @property {string} bodyId The body's id afterwards (its lineage root).
 * @property {Array<{ subPart: string, hidden: true }>} [viewHides] What to hide in the view under
 *   that body, straight after the records land (`TODO/core-076`).
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
 * @param {import('./image.js').ToolReferences} [references] Browser only: attached images a
 *   sketch slice's `referenceImage` may name (`TODO/ai-008`).
 * @returns {BuiltStep}
 */
export function buildCreateRecords(document, input, ops = kernelRegistry, references) {
  const built = buildPlacementRecords(document, input, ops, references)
  if (input.name === undefined) return built
  // The rename continues the body from its last record: the drop, for a composite.
  const terminal = /** @type {string} */ (built.records.at(-1)?.id)
  return { ...built, records: [...built.records, renameRecord(document, built.bodyId, terminal, input.name)] }
}

/**
 * {@link buildCreateRecords} without the name: the records a drag-to-place commits.
 *
 * @param {WarpDocument} document
 * @param {CreateInput} input
 * @param {Registry} ops
 * @param {import('./image.js').ToolReferences} [references]
 * @returns {BuiltStep}
 */
function buildPlacementRecords(document, input, ops, references) {
  const { op, positionMm } = input
  const entry = ops[op]
  if (!entry || entry.operandCount !== 0 || !entry.ui) throw new Error(`${op} is not something create can place`)
  const ui = entry.ui
  const [x, y, z] = positionMm
  const params = { ...ui.defaults, ...(input.params ?? {}) }

  if (ui.editor === 'sketch') {
    // `TODO/ai-008`: a slice's `referenceImage` becomes its calibrated reference photo, and the
    // sanitised asset record is appended first (the sketch editor's `appendAll([asset, sketch])`).
    const placed = placeReferenceImages(document, params, references)
    const { center: _ghost, ...shape } = sampleCurveProfiles(placed.params)
    /** @type {OpRecord} */
    const record = { id: document.nextId(idPrefixFor(op)), op, name: document.nextName(ui.label), params: { center: [x, y, z], ...shape } }
    return { records: [.../** @type {OpRecord[]} */ (placed.assets), record], bodyId: /** @type {string} */ (record.id) }
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
  const created = { id, op, name: document.nextName(ui.nameFor ? ui.nameFor(params) : ui.label), params }
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
 * Replace every `curve` profile (`TODO/sketch-008`) with the closed polyline it samples to,
 * keeping the curve as the polyline's `source` — exactly what the sketch editor's Curve sheet
 * commits, so a model's airfoil and a person's are the same record. A bad curve throws,
 * naming its field, before anything is appended.
 *
 * @param {Record<string, any>} params
 * @returns {Record<string, any>}
 */
function sampleCurveProfiles(params) {
  if (!Array.isArray(params.slices)) return params
  return {
    ...params,
    slices: params.slices.map((/** @type {any} */ slice, /** @type {number} */ sliceIndex) => {
      if (!slice || !Array.isArray(slice.profiles) || !slice.profiles.some((/** @type {any} */ p) => p?.kind === 'curve')) return slice
      return {
        ...slice,
        profiles: slice.profiles.map((/** @type {any} */ profile, /** @type {number} */ profileIndex) => {
          if (profile?.kind !== 'curve') return profile
          const source = { curve: profile.curve, params: { ...profile.params }, atMm: profile.atMm ?? [0, 0] }
          let pointsMm
          try {
            pointsMm = curvePoints(source)
          } catch (error) {
            throw new Error(`primitive.sketch: slices[${sliceIndex}].profiles[${profileIndex}] — ${error instanceof Error ? error.message : String(error)}`)
          }
          return { id: profile.id, kind: 'polyline', role: profile.role, closed: true, pointsMm, source }
        }),
      }
    }),
  }
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
      name: { type: 'string', description: 'Optional name for the new body, e.g. "Lid". Omitted, it is numbered like a Library drop ("Cube 1").' },
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
 * @typedef {object} CopyInput
 * @property {string} id A body on screen; inside `apply_records`, `@n` for an earlier step's.
 * @property {string} [part] One part of that group, as `describe_body` lists it.
 * @property {string} [name] The copy's name; absent, numbered like a Library drop.
 * @property {[number, number, number]} [positionMm] Where to place it, as `create` takes it;
 *   absent, where the source stands now.
 */

/**
 * The records one copy commits (`TODO/FIND-ai-045`): {@link buildCreateRecords} for the source
 * step's op and its params as they are now. Throws a sentence naming the fix for a source that
 * is not a body on screen, a part the group does not have or that has no step of its own, and
 * an op `create` cannot place.
 *
 * @param {WarpDocument} document
 * @param {CopyInput} input
 * @param {Registry} [ops]
 * @param {(id: string) => string} [resolveId] Turns an `@n` batch reference into a body id.
 * @returns {BuiltStep}
 */
export function buildCopyRecords(document, input, ops = kernelRegistry, resolveId = (id) => id) {
  const id = resolveId(input.id)
  const onScreen = findBody(document, id)
  if (onScreen.reason !== undefined) throw new Error(onScreen.reason)
  const found = findStep(document, id, input.part)
  if (found.reason !== undefined) throw new Error(found.reason)
  const { record } = found
  const source = input.part === undefined ? onScreen.body.name : `"${input.part}" in ${onScreen.body.name}`
  if (!creatableOps(ops).includes(record.op)) {
    throw new Error(
      `${source} was made by ${record.op}, which create cannot place, so it cannot be copied. ` +
        'Copy a body or part made by a Library op (list_ops kind "create"), or read its steps with describe_step and rebuild them.'
    )
  }
  const { center, ...params } = literalParamsOf(document, record)
  const positionMm = input.positionMm ?? copyPositionOf(onScreen.body, input.part, ops[record.op], center)
  return buildCreateRecords(document, { op: record.op, positionMm, params, ...(input.name === undefined ? {} : { name: input.name }) }, ops)
}

/**
 * Where a copy goes when no `positionMm` is given: `create`'s placement point (footprint centre,
 * underside) read off the source's built bounds, or a part's within its group. A sketch's
 * `positionMm` is its plane origin, so a sketch keeps its own.
 *
 * @param {import('../../core/document.js').Body} body The body on screen (the group, for a part).
 * @param {string | undefined} part
 * @param {RegistryEntry} entry The source step's registry entry.
 * @param {unknown} center The source step's own `center` param, if it has one.
 * @returns {[number, number, number]}
 */
function copyPositionOf(body, part, entry, center) {
  if (entry.ui?.editor === 'sketch' && Array.isArray(center) && center.length === 3) return round3(center)
  const geometry = part !== undefined && isGroup(body.geometry) ? body.geometry.parts[part] : body.geometry
  const [min, max] = boundsOf(geometry)
  return round3([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]])
}

/**
 * The copy tool's input, and the shape of an `apply_records` `{ copy }` step.
 *
 * @returns {JsonSchema}
 */
export function copyInputSchema() {
  return objectSchema(
    {
      id: { type: 'string', description: 'The body to copy, an id from describe_scene (in apply_records, "@n" for an earlier step’s body). With part, the group.' },
      part: { type: 'string', description: 'Optional: copy one part of the group id names, exactly as describe_body lists it, e.g. "Pin".' },
      name: { type: 'string', description: 'Optional name for the copy, e.g. "Pin cutter". Omitted, it is numbered like a Library drop ("Cylinder 2").' },
      positionMm: vectorSchema(
        3,
        'Optional: where to place the copy, as create takes it ([x, y, z] mm; x and y centre the footprint, z is the underside). Omitted, it stands exactly where the source does.'
      ),
    },
    ['id'],
    'One body or part to copy.'
  )
}

/**
 * `copy` (`TODO/FIND-ai-045`): a new body from a body's or a part's op and params.
 *
 * @param {(ctx: import('./index.js').ToolContext, steps: any[], rationale?: string) => Record<string, any>} applySteps
 * @returns {import('./index.js').Tool}
 */
export function createCopyTool(applySteps) {
  return {
    name: 'copy',
    description:
      'Make a new body with the same op and params as a body on screen, or as one part of a group (part), e.g. a cutter the shape of a round pin. ' +
      'It stands where the source does unless positionMm says otherwise, and is independent of it: editing either leaves the other alone. ' +
      'Only the step that made the source is copied, not later steps (a fillet, a cut, a turn): describe_step shows that step. ' +
      'A param tied to a variable is copied as its current value. Only bodies made by a Library op can be copied. Returns the copy’s id and the scene afterwards.',
    inputSchema: withRationale(copyInputSchema()),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const { rationale, ...step } = input
      return applySteps(ctx, [{ copy: step }], rationale)
    },
  }
}

/**
 * @param {Registry} ops
 * @param {(ctx: import('./index.js').ToolContext, steps: any[], rationale?: string) => Record<string, any>} applySteps
 * @returns {import('./index.js').Tool}
 */
export function createCreateTool(ops, applySteps) {
  const stepSchema = createInputSchema(ops)
  // The tool's own input adds `rationale` (TODO/ai-003); an `apply_records` step does not —
  // there the rationale is the call's, once.
  const inputSchema = withRationale(stepSchema)
  return {
    name: 'create',
    description:
      'Place one new body in the scene — the equivalent of dragging a Library item into the viewport. Creates only: to change, combine, ' +
      'move or turn existing bodies use operate. Millimetres, Z up, degrees. Returns the new body’s id and the scene afterwards.',
    inputSchema,
    validate: (input) => {
      const { rest, errors } = splitRationale(input)
      return errors.length > 0 ? errors : validateCreateInput(ops, stepSchema, rest)
    },
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const { rationale, ...step } = input
      return applySteps(ctx, [{ create: step }], rationale)
    },
  }
}

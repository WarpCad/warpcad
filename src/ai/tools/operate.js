// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `operate` tool (`TODO/ai-002`): change, combine, move or turn existing bodies.
 *
 * **Only ops that need operands, and it refuses by name** unless the operand ids are
 * ones the document issued, belong to bodies on screen, and match the op's operand
 * count, which is judged by the same `acceptsOperandCount` the Operations toolbar uses
 * to enable its buttons.
 *
 * ## Why a table here and not a read of the registry
 *
 * The registry says *which* ops exist and how many operands each takes, and this
 * module reads that. What it cannot say is the **record shape** each op is appended
 * with, because that is not a property of the op. It is decided by whoever writes the
 * record, and today that is `src/components/viewport/OperationsToolbar.vue` (booleans
 * and Group `consume` their operands; Snap/Align/Fillet/Chamfer/Enlarge/Fit/Bisect
 * `supersede` theirs; Mirror does neither) and `src/core/transform.js` (move and turn).
 * {@link OPERATIONS} copies those shapes, and `operate.spec.js` checks each one
 * against the toolbar's or `transform.js`'s output. `transform.js` is called directly
 * rather than copied. Every registry op that takes operands is either in
 * {@link OPERATIONS} or in {@link NOT_OFFERED} with a reason, and the spec fails on a
 * new op that is in neither, so a new operation cannot be silently missing from the
 * model's tools.
 *
 * Param names are the registry's own (`radius`, `deltaMm`), with units in each
 * description, except where the record is built by `transform.js` from a delta
 * (`deltaMm`/`deltaDeg`) or a plane (`planeMm`).
 *
 * @module ai/tools/operate
 */

import { RIM_ORIENTATIONS } from '../../core/kernel/fillet.js'
import { DEFAULT_ROTATE_AXIS, SNAP_SIDES, mirrorRotationDeg } from '../../core/kernel/group.js'
import { acceptsOperandCount, registry as kernelRegistry } from '../../core/kernel/registry.js'
import { DEFAULT_JOINT_CLEARANCE_MM, JOINT_TYPES } from '../../core/kernel/split.js'
import { rotateRecord, translateRecord } from '../../core/transform.js'
import { uniqueBranches } from './create.js'
import { findBody } from './read.js'
import { checkInput, objectSchema, splitRationale, vectorSchema, withRationale } from './schema.js'

/** @typedef {import('../../core/document.js').WarpDocument} WarpDocument */
/** @typedef {import('../../core/kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('../../core/kernel/registry.js').RegistryEntry} RegistryEntry */
/** @typedef {Readonly<Record<string, RegistryEntry>>} Registry */
/** @typedef {import('./schema.js').JsonSchema} JsonSchema */
/** @typedef {import('./create.js').BuiltStep} BuiltStep */

/**
 * One operand, resolved.
 *
 * @typedef {object} ResolvedOperand
 * @property {string} id The body's id (its lineage root) — stable across moves.
 * @property {string} terminal The record currently representing it: what a new record
 *   must target, so a moved body is operated on where it now is.
 * @property {string} name The body's display name.
 * @property {[number, number, number]} rotationDeg
 * @property {string | { id: string, pieces: string }} ref How the new record names it:
 *   the terminal id, or a sub-part address of it.
 */

/**
 * @typedef {object} OperationSpec
 * @property {string} label The verb a named result is numbered by ("Subtract 1").
 * @property {string} description What it does, for the model.
 * @property {JsonSchema} params
 * @property {(document: WarpDocument, operands: ResolvedOperand[], params: Record<string, any>, op: string) => OpRecord} build
 */

/**
 * @typedef {object} OperateInput
 * @property {string} op
 * @property {Array<{ id: string, pieces?: string }>} operands
 * @property {Record<string, any>} [params]
 */

const AXES = /** @type {JsonSchema} */ ({
  type: 'string',
  enum: ['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz'],
  description: 'Which axes to act on, e.g. "z" or "xy".',
})
const AXIS = /** @type {JsonSchema} */ ({ type: 'string', enum: Object.keys(DEFAULT_ROTATE_AXIS), description: 'One axis.' })
const FACE = /** @type {JsonSchema} */ ({
  type: 'string',
  enum: [...RIM_ORIENTATIONS],
  description: 'Which axis-aligned face’s rim, e.g. "z+" for the top.',
})

/**
 * A boolean: named, the first operand as the base (`target`), the rest as `operands`,
 * and every operand **consumed** — the toolbar's `run()`.
 *
 * @param {string} label
 * @param {string} description
 * @returns {OperationSpec}
 */
function booleanSpec(label, description) {
  return {
    label,
    description,
    params: objectSchema({}),
    build: (document, operands, _params, op) => ({
      id: document.nextId('bool'),
      op,
      name: document.nextName(label),
      target: operands[0].ref,
      operands: operands.slice(1).map((operand) => operand.ref),
      consumes: operands.map((operand) => operand.terminal),
    }),
  }
}

/**
 * A one-body edit in place: unnamed, `target` and `supersedes` both the body's current
 * record — the toolbar's Fillet/Chamfer/Enlarge/Fit/Bisect commits.
 *
 * @param {string} label
 * @param {string} prefix Id prefix, as the toolbar numbers it.
 * @param {string} description
 * @param {JsonSchema} params
 * @param {(params: Record<string, any>) => Record<string, any>} recordParams
 * @returns {OperationSpec}
 */
function inPlaceSpec(label, prefix, description, params, recordParams) {
  return {
    label,
    description,
    params,
    build: (document, operands, input, op) => ({
      id: document.nextId(prefix),
      op,
      target: operands[0].terminal,
      supersedes: operands[0].terminal,
      params: recordParams(input),
    }),
  }
}

/**
 * Snap or Align: the moving body (first operand) is superseded, the reference stays.
 *
 * @param {string} label
 * @param {string} prefix
 * @param {string} description
 * @param {JsonSchema} params
 * @param {(params: Record<string, any>) => Record<string, any>} recordParams
 * @returns {OperationSpec}
 */
function positionSpec(label, prefix, description, params, recordParams) {
  return {
    label,
    description,
    params,
    build: (document, operands, input, op) => ({
      id: document.nextId(prefix),
      op,
      target: operands[0].ref,
      operands: operands.slice(1).map((operand) => operand.ref),
      supersedes: operands[0].terminal,
      params: recordParams(input),
    }),
  }
}

/**
 * Every operation the model may run, and how its record is written.
 *
 * @type {Readonly<Record<string, OperationSpec>>}
 */
export const OPERATIONS = Object.freeze({
  'boolean.union': booleanSpec('Union', 'Merge two or more bodies into one.'),
  'boolean.subtract': booleanSpec('Subtract', 'Cut every later operand out of the first. Operands may name parts, e.g. a bolt’s "tap".'),
  'boolean.intersect': booleanSpec('Intersect', 'Keep only the volume every operand shares.'),

  'group.assemble': {
    label: 'Group',
    description:
      'Gather two or more bodies into one group whose parts keep the bodies’ names — or the names you give, one per operand, in order ' +
      '(e.g. "Board", "USB-A"), so the parts stay addressable by snap and align.',
    params: objectSchema({
      names: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional (TODO/ai-008): one unique part name per operand, in operand order. Default: each body’s own name.',
      },
    }),
    build: (document, operands, params, op) => {
      const names = params.names ?? operands.map((operand) => operand.name)
      if (names.length !== operands.length) throw new Error(`${op}: give one name per operand — ${operands.length} operands, ${names.length} names`)
      const trimmed = names.map((/** @type {string} */ name) => name.trim())
      if (trimmed.some((/** @type {string} */ name) => name === '' || name.length > 80)) throw new Error(`${op}: each part name must be 1 to 80 characters`)
      if (new Set(trimmed).size !== trimmed.length) throw new Error(`${op}: part names must be unique, got ${JSON.stringify(trimmed)}`)
      return {
        id: document.nextId('group'),
        op,
        name: document.nextName('Group'),
        target: operands[0].terminal,
        operands: operands.slice(1).map((operand) => operand.terminal),
        consumes: operands.map((operand) => operand.terminal),
        params: { names: trimmed },
      }
    },
  },

  'group.snap': positionSpec(
    'Snap',
    'snap',
    'Move the first body flush against the second (exactly two operands). The first body’s parts may be named to snap by, e.g. "head".',
    objectSchema(
      {
        axes: AXES,
        orientation: { type: 'string', enum: Object.keys(SNAP_SIDES), description: 'Which sides meet. "outside+" puts the first body on the second’s − side (its + face meets the second’s − face); "outside-" puts it on the second’s + side.' },
        deltaMm: { type: 'number', description: 'Extra gap along the axes, in millimetres. Default 0.' },
      },
      ['axes', 'orientation']
    ),
    (params) => ({ axes: params.axes, deltaMm: params.deltaMm ?? 0, orientation: params.orientation })
  ),
  'group.align': positionSpec(
    'Align',
    'align',
    'Centre the first body on the second along the given axes (exactly two operands).',
    objectSchema({ axes: AXES, deltaMm: { type: 'number', description: 'Offset from centred, in millimetres. Default 0.' } }, ['axes']),
    (params) => ({ axes: params.axes, deltaMm: params.deltaMm ?? 0 })
  ),

  'modify.filletRim': inPlaceSpec(
    'Fillet',
    'fillet',
    'Round the whole rim of one axis-aligned face of a prismatic body.',
    objectSchema({ radius: { type: 'number', description: 'Fillet radius, in millimetres.' }, orientation: FACE }, ['radius', 'orientation']),
    (params) => ({ radius: params.radius, orientation: params.orientation })
  ),
  'modify.chamferRim': inPlaceSpec(
    'Chamfer',
    'chamfer',
    'Bevel the whole rim of one axis-aligned face of a prismatic body.',
    objectSchema({ radius: { type: 'number', description: 'Chamfer size, in millimetres.' }, orientation: FACE }, ['radius', 'orientation']),
    (params) => ({ radius: params.radius, orientation: params.orientation })
  ),
  'modify.enlarge': inPlaceSpec(
    'Resize',
    'enlarge',
    'Grow (or shrink, with negatives) a body by a per-axis amount.',
    objectSchema({ deltaMm: vectorSchema(3, 'Change in size per axis, [x, y, z] in millimetres.') }, ['deltaMm']),
    (params) => ({ deltaMm: params.deltaMm })
  ),
  'modify.fit': inPlaceSpec(
    'Fit',
    'fit',
    'Scale a body to an absolute size; 0 on an axis leaves that axis alone.',
    objectSchema(
      {
        sizeMm: vectorSchema(3, 'Target size per axis, [x, y, z] in millimetres; 0 leaves an axis alone.'),
        keepAspectRatio: { type: 'boolean', description: 'Scale every axis by the same factor. Default false.' },
      },
      ['sizeMm']
    ),
    (params) => ({ sizeMm: params.sizeMm, keepAspectRatio: params.keepAspectRatio ?? false })
  ),
  'modify.bisect': inPlaceSpec(
    'Bisect',
    'bisect',
    'Cut a body in two across a plane; the result is one body with parts "negative" and "positive".',
    objectSchema(
      {
        axis: AXIS,
        offsetMm: { type: 'number', description: 'Where the plane crosses the axis, in millimetres.' },
        angleDeg: { type: 'number', description: 'Tilt of the cut plane, in degrees. Omit or 0 for a straight cut.' },
        rotateAxis: { ...AXIS, description: 'The axis the tilt turns about.' },
        rotateOffsetMm: { type: 'number', description: 'Where the tilt hinges, in millimetres. Omitted: the third axis’s centre.' },
      },
      ['axis', 'offsetMm']
    ),
    (params) => {
      const tilted = typeof params.angleDeg === 'number' && params.angleDeg !== 0
      if (!tilted) return { axis: params.axis, offsetMm: params.offsetMm }
      return {
        axis: params.axis,
        offsetMm: params.offsetMm,
        angleDeg: params.angleDeg,
        ...(params.rotateAxis === undefined ? {} : { rotateAxis: params.rotateAxis }),
        ...(params.rotateOffsetMm === undefined ? {} : { rotateOffsetMm: params.rotateOffsetMm }),
      }
    }
  ),
  // TODO/io-007: the Split sheet's record, by the same `inPlaceSpec` Bisect uses — same shape
  // (`stores/splitSheet.js` writes it: unnamed, `supersedes` the body).
  'modify.splitWithJoint': inPlaceSpec(
    'Split',
    'split',
    'Split one body into two printable pieces across an axis plane, with a joint so they go back together: pins and sockets, or a tongue and groove for thin sections. ' +
      'The body becomes a group of two named parts. On a body that is already split, only the part the plane crosses is cut. Refuses a body that is not watertight.',
    objectSchema(
      {
        axis: { ...AXIS, description: 'The cut plane’s normal.' },
        offsetMm: { type: 'number', description: 'Where the plane crosses the axis, in millimetres from the body’s minimum face; must be inside the body.' },
        joint: { type: 'string', enum: [...JOINT_TYPES], description: 'pins (default), tongue (for thin sections), or none.' },
        clearanceMm: { type: 'number', description: `Gap per side between pin and socket, in millimetres. Default ${DEFAULT_JOINT_CLEARANCE_MM}.` },
        names: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 2,
          description: 'The two pieces’ part names, A (minimum side) then B, e.g. ["Wing A", "Wing B"]. No commas.',
        },
      },
      ['axis', 'offsetMm']
    ),
    (params) => ({
      axis: params.axis,
      offsetMm: params.offsetMm,
      joint: params.joint ?? 'pins',
      clearanceMm: params.clearanceMm ?? DEFAULT_JOINT_CLEARANCE_MM,
      ...(params.names === undefined ? {} : { names: params.names }),
    })
  ),

  'transform.translate': {
    label: 'Move',
    description: 'Move one body by a millimetre delta.',
    params: objectSchema({ deltaMm: vectorSchema(3, 'How far to move, [x, y, z] in millimetres.') }, ['deltaMm']),
    build: (document, operands, params) => translateRecord(document, operands[0].id, params.deltaMm),
  },
  'transform.rotate': {
    label: 'Rotate',
    description: 'Turn one body about its own centre by a degree delta, about the world X, Y and Z axes.',
    params: objectSchema({ deltaDeg: vectorSchema(3, 'How far to turn about X, Y and Z, in degrees.') }, ['deltaDeg']),
    build: (document, operands, params) => rotateRecord(document, operands[0].id, params.deltaDeg),
  },
  'transform.mirror': {
    label: 'Mirror',
    description: 'Add a reflected copy of one body across an axis-aligned plane. The original stays.',
    params: objectSchema(
      {
        axis: { ...AXIS, description: 'The plane’s normal.' },
        planeMm: { type: 'number', description: 'Where the plane crosses that axis, in millimetres. Omitted: through the body’s own centre.' },
      },
      ['axis']
    ),
    build: (document, operands, params, op) => {
      const index = ['x', 'y', 'z'].indexOf(params.axis)
      /** @type {[number, number, number]} */
      const pointMm = [0, 0, 0]
      if (typeof params.planeMm === 'number') pointMm[index] = params.planeMm
      return {
        id: document.nextId('mirror'),
        op,
        name: document.nextName('Mirror'),
        target: operands[0].terminal,
        params: {
          axis: params.axis,
          ...(typeof params.planeMm === 'number' ? { pointMm } : {}),
          rotation: mirrorRotationDeg(operands[0].rotationDeg, params.axis),
        },
      }
    },
  },
})

/**
 * Registry ops that take operands but are deliberately not offered to the model, and
 * why. A new operation must land in {@link OPERATIONS} or here; the spec fails otherwise.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const NOT_OFFERED = Object.freeze({
  'profile.extrudeLinear':
    'A 2D-profile step used inside composite recipes. A body on screen is never a 2D profile, so there is nothing for the model to extrude.',
  'profile.extrudeToApex':
    'The bevel gear’s loft (TODO/core-045), a 2D-profile step inside gear.bevel exactly like profile.extrudeLinear. A body on screen is never a 2D profile, so there is nothing for the model to loft.',
  'style.recolor':
    'Colour is not geometry, and the UI writes it through document.setColorOverride rather than a plain append. A recolour tool is a later addition, not part of v1.',
  'style.rename':
    'Renaming is the human’s call from the Inspector (document.renameBody); a rename tool is a later addition, not part of v1.',
  'group.removePart':
    'Removing a part from a placed group is destructive and is the human’s call from the Inspector; not offered to the model in v1.',
  'import.mesh':
    'It builds a body from an asset.mesh record inside an imported-model library part (TODO/io-009), never from a body on screen. Importing a model file is the human’s call from the Library; the model places the part that import made like any other.',
})

/**
 * The ops `operate` takes: mapped in {@link OPERATIONS} and needing operands in `ops`.
 *
 * @param {Registry} [ops]
 * @returns {string[]}
 */
export function operableOps(ops = kernelRegistry) {
  return Object.keys(OPERATIONS)
    .filter((op) => ops[op] !== undefined && ops[op].operandCount !== 0)
    .sort()
}

/**
 * @param {0 | 1 | '2+'} operandCount
 * @returns {string}
 */
function countPhrase(operandCount) {
  if (operandCount === '2+') return '2 or more operands'
  return `exactly ${operandCount} operand${operandCount === 1 ? '' : 's'}`
}

/**
 * The records one operation commits, after every refusal the toolbar would make by
 * disabling a button: an unoffered op, the wrong operand count, a repeated body, a part
 * address the op cannot take, or an id that is not a body on screen.
 *
 * @param {WarpDocument} document
 * @param {OperateInput} input
 * @param {Registry} [ops]
 * @param {(id: string) => string} [resolveId] Maps a batch reference (`@1`) to a body
 *   id; identity outside a batch.
 * @returns {BuiltStep}
 */
export function buildOperateRecords(document, input, ops = kernelRegistry, resolveId = (id) => id) {
  const { op } = input
  const spec = OPERATIONS[op]
  const entry = ops[op]
  if (!spec || !entry || entry.operandCount === 0) throw new Error(`${op} is not an operation operate can run`)

  const count = input.operands.length
  if (!acceptsOperandCount(op, count, ops)) throw new Error(`${op} needs ${countPhrase(entry.operandCount)}, got ${count}`)

  /** @type {ResolvedOperand[]} */
  const operands = []
  for (const operand of input.operands) {
    const id = resolveId(operand.id)
    if (operand.pieces !== undefined && !entry.subPartOperands) {
      throw new Error(`${op} cannot take a part address ("pieces": "${operand.pieces}") — name the whole body`)
    }
    const found = findBody(document, id)
    if (found.reason !== undefined) throw new Error(`operand ${found.reason}`)
    if (operands.some((existing) => existing.id === found.body.id)) throw new Error(`${op} names "${id}" twice — each body may be an operand once`)
    const terminal = found.body.recordId
    operands.push({
      id: found.body.id,
      terminal,
      name: found.body.name,
      rotationDeg: found.body.rotationDeg,
      ref: operand.pieces === undefined ? terminal : { id: terminal, pieces: operand.pieces },
    })
  }

  const record = spec.build(document, operands, input.params ?? {}, op)
  // A record that continues a body keeps that body's id; anything else is a new body.
  const bodyId = record.supersedes !== undefined ? operands[0].id : /** @type {string} */ (record.id)
  return { records: [record], bodyId }
}

/**
 * The operate tool's input schema; `params` is an `anyOf` of each operation's own,
 * judged against the chosen op by {@link validateOperateInput}.
 *
 * @param {Registry} ops
 * @returns {JsonSchema}
 */
export function operateInputSchema(ops) {
  const operable = operableOps(ops)
  return objectSchema(
    {
      op: {
        type: 'string',
        enum: operable,
        description: operable.map((op) => `${op}: ${OPERATIONS[op].description}`).join(' '),
      },
      operands: {
        type: 'array',
        description: 'The bodies to operate on, in order: the first is the base (the one cut from, moved, or edited).',
        items: objectSchema(
          {
            id: { type: 'string', description: 'A body id from describe_scene.' },
            pieces: {
              type: 'string',
              description: 'Only for booleans, snap and align: comma-separated part names from describe_body, to use just those parts.',
            },
          },
          ['id']
        ),
      },
      params: {
        description: 'Params for the chosen op. Lengths in millimetres, angles in degrees.',
        anyOf: uniqueBranches(operable.map((op) => OPERATIONS[op].params)),
      },
    },
    ['op', 'operands'],
    'One operation on existing bodies.'
  )
}

/**
 * Check an operate input, judging `params` against the chosen op's own schema.
 *
 * @param {JsonSchema} schema
 * @param {unknown} input
 * @param {string} [path]
 * @returns {string[]}
 */
export function validateOperateInput(schema, input, path = 'input') {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return checkInput(schema, input, path)
  const { params, ...rest } = /** @type {Record<string, any>} */ (input)
  const errors = checkInput({ ...schema, properties: { ...schema.properties, params: objectSchema({}) } }, rest, path)
  if (errors.length > 0) return errors
  const op = /** @type {string} */ (rest.op)
  return checkInput(OPERATIONS[op].params, params ?? {}, `${path}.params`).map((error) => `${error} (for ${op})`)
}

/**
 * @param {Registry} ops
 * @param {(ctx: import('./index.js').ToolContext, steps: any[], rationale?: string) => Record<string, any>} applySteps
 * @returns {import('./index.js').Tool}
 */
export function createOperateTool(ops, applySteps) {
  const stepSchema = operateInputSchema(ops)
  const inputSchema = withRationale(stepSchema) // TODO/ai-003, as in create.js
  return {
    name: 'operate',
    description:
      'Run one operation on existing bodies, named by id: booleans, group, snap/align, rim fillet/chamfer, resize, fit, bisect, move, rotate, mirror. ' +
      'Refused with a reason if an id is not a body on screen or the operand count is wrong. Returns the resulting body’s id and the scene afterwards.',
    inputSchema,
    validate: (input) => {
      const { rest, errors } = splitRationale(input)
      return errors.length > 0 ? errors : validateOperateInput(stepSchema, rest)
    },
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const { rationale, ...step } = input
      return applySteps(ctx, [{ operate: step }], rationale)
    },
  }
}

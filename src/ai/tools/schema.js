// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Op params as JSON Schema, and the one checker for that schema (`TODO/ai-002`,
 * `docs/decisions/ai-partner.md` decision 4).
 *
 * ## One closed subset, emitted and checked here
 *
 * The tool registry speaks plain JSON Schema because both transports already do: the
 * Messages API (`input_schema`, with `strict: true`) and MCP (`tools/list`). This module
 * both **emits** that schema and **checks** inputs against it, over a closed set of
 * keywords, {@link SUBSET_KEYWORDS}. `schema.spec.js` fails if any tool ever emits a
 * keyword outside it, and holds one refusal case per keyword, so the emitter and the
 * checker cannot drift apart. There is no zod and no ajv: decision 4 rejected both.
 *
 * The check is **structural only**. Its job is to turn "wrong shape" into a named,
 * model-readable sentence before a record is built. Whether a value is *buildable*
 * (a positive diameter, a fillet that fits, an outline that does not cross itself) is
 * the kernel registry's question, answered by the document's trial fold, and nothing
 * here second-guesses it. A second validator that disagreed with the registry would be
 * a bug, not a safety net.
 *
 * ## Two deliberate widenings of decision 4's list
 *
 * Decision 4 named `type`, `properties`, `required`, `enum`, `minimum`/`maximum`,
 * `items` and `additionalProperties: false`. This module adds `const`, `anyOf`,
 * `minItems`/`maxItems` and `description`, for reasons the decision did not have in
 * front of it:
 *
 * - **`anyOf`.** Strict mode requires `additionalProperties: false` on *every* object
 *   (checked against the `claude-api` skill's structured-outputs notes, 2026-10-06), so
 *   a per-op `params` object cannot be left free-form. Each op's params are one closed
 *   branch of an `anyOf`, which strict mode supports.
 * - **`minItems`/`maxItems`.** A `[x, y, z]` vector is three numbers, and saying so is
 *   the honest schema.
 *
 * ## What strict mode will not take
 *
 * The same skill notes list `minimum`, `maximum` and "complex array constraints" as
 * **unsupported** under `strict: true`. The local checker still enforces them; the
 * Messages API adapter (`ai-005`) sends {@link toStrictWire}'s copy, which drops them.
 * That keeps one schema as the source of truth and puts the wire difference in one
 * function.
 *
 * ## Derivation, and the one hand-written schema
 *
 * Registry param validation is code, not data (`requirePositive(...)` inside each
 * `build`). What *is* data is each Library entry's `ui.defaults`, its `ui.choice`, and
 * the composite param tables `paramOptions` reads. {@link paramsSchemaFor} derives a
 * schema from those: a default's JSON type gives the property's type, an array keeps its
 * length, and every enum is read from the same list the Library and the Inspector read.
 * Units are stated in each property's description, because the property **names** are
 * the registry's own (`diameter`, not `diameterMm`): renaming them would make the AI's
 * records differ from the ones a human's drag writes.
 *
 * `primitive.sketch` cannot be derived from its defaults (they are a ghost preview, not
 * a description of every valid sketch), so it gets {@link SKETCH_PARAMS_SCHEMA}, written
 * by hand from the sketch model's exported constants. `schema.spec.js` fails if the
 * sketch model's profile kinds, roles, extrusion methods or per-method params drift
 * from it, or if the registry's own sketch defaults stop passing it.
 *
 * @module ai/tools/schema
 */

import { labelForParam } from '../../core/inspector.js'
import { paramOptions, registry as kernelRegistry } from '../../core/kernel/registry.js'
import { EXTRUSION_DEFAULTS, EXTRUSION_METHODS, PROFILE_KINDS, PROFILE_ROLES } from '../../sketch/profile.js'

/**
 * A node of the closed subset.
 *
 * @typedef {object} JsonSchema
 * @property {'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean'} [type]
 * @property {string} [description]
 * @property {Record<string, JsonSchema>} [properties]
 * @property {string[]} [required]
 * @property {false} [additionalProperties]
 * @property {readonly any[]} [enum]
 * @property {any} [const]
 * @property {number} [minimum]
 * @property {number} [maximum]
 * @property {JsonSchema} [items]
 * @property {number} [minItems]
 * @property {number} [maxItems]
 * @property {JsonSchema[]} [anyOf]
 */

/** Every keyword the emitter may produce and the checker handles. */
export const SUBSET_KEYWORDS = Object.freeze([
  'type',
  'description',
  'properties',
  'required',
  'additionalProperties',
  'enum',
  'const',
  'minimum',
  'maximum',
  'items',
  'minItems',
  'maxItems',
  'anyOf',
])

/** Keywords the Messages API's strict mode does not accept, dropped by {@link toStrictWire}. */
export const STRICT_UNSUPPORTED = Object.freeze(['minimum', 'maximum', 'minItems', 'maxItems'])

/** How many problems one check reports; the first few are what a model can act on. */
const MAX_ERRORS = 5

// --- building blocks ------------------------------------------------------

/**
 * A closed object: `additionalProperties: false` and a `required` list, always, so
 * every object this module emits is already what strict mode demands.
 *
 * @param {Record<string, JsonSchema>} properties
 * @param {string[]} [required]
 * @param {string} [description]
 * @returns {JsonSchema}
 */
export function objectSchema(properties, required = [], description) {
  return {
    type: 'object',
    ...(description === undefined ? {} : { description }),
    properties,
    required,
    additionalProperties: false,
  }
}

/**
 * `n` numbers, e.g. a `[x, y, z]` position.
 *
 * @param {number} n
 * @param {string} description
 * @returns {JsonSchema}
 */
export function vectorSchema(n, description) {
  return { type: 'array', description, items: { type: 'number' }, minItems: n, maxItems: n }
}

/**
 * The unit a plain number param is in, said once in its description. The registry's
 * convention (`CLAUDE.md`: millimetres, degrees) is that an angle's name ends in `Deg`
 * and every other length is millimetres; `schema.spec.js` holds every derived number
 * to one of the two.
 *
 * @param {string} key
 * @returns {string}
 */
function unitSentence(key) {
  const label = labelForParam(key.replace(/(Mm|Deg)$/, ''))
  return key.endsWith('Deg') ? `${label}, in degrees.` : `${label}, in millimetres.`
}

// --- the checker ------------------------------------------------------------

/**
 * Check `value` against `schema`. Never throws, whatever it is handed.
 *
 * @param {JsonSchema} schema
 * @param {unknown} value
 * @param {string} [path] How the value is named in each message.
 * @returns {string[]} Problems, as sentences, at most a handful; empty when it fits.
 */
export function checkInput(schema, value, path = 'input') {
  /** @type {string[]} */
  const errors = []
  try {
    checkNode(schema, value, path, errors)
  } catch (error) {
    // A hostile input (a getter that throws, a cyclic object) is a refusal, not a crash.
    errors.push(`${path} could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
  return errors.slice(0, MAX_ERRORS)
}

/**
 * The optional `rationale` every write tool takes (`TODO/ai-003`): the model's one-line reason
 * for the call, recorded with the user's request as the design intent of every record the call
 * appends. Optional so a call without one still works; capped by `src/core/intent.js`.
 *
 * @type {JsonSchema}
 */
export const RATIONALE_PROPERTY = Object.freeze({
  type: 'string',
  description:
    'One line, in plain words, saying why this change is being made (e.g. "Base plate the clamp bolts to"). ' +
    'It is saved with the change as its design intent, shown in History, and read back by a future model.',
})

/**
 * A top-level write-tool schema with the optional `rationale` added.
 *
 * @param {JsonSchema} schema An `objectSchema` result.
 * @returns {JsonSchema}
 */
export function withRationale(schema) {
  return { ...schema, properties: { ...schema.properties, rationale: RATIONALE_PROPERTY } }
}

/**
 * Split `rationale` off a write tool's input, so the rest can be judged by the tool's own
 * checker exactly as before.
 *
 * @param {unknown} input
 * @returns {{ rest: unknown, rationale: string | undefined, errors: string[] }}
 */
export function splitRationale(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || !('rationale' in input)) {
    return { rest: input, rationale: undefined, errors: [] }
  }
  const { rationale, ...rest } = /** @type {Record<string, unknown>} */ (input)
  if (typeof rationale !== 'string') return { rest, rationale: undefined, errors: ['input.rationale must be a string'] }
  return { rest, rationale, errors: [] }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {readonly unknown[]} values
 * @returns {string}
 */
function listOf(values) {
  return values.map((value) => JSON.stringify(value)).join(', ')
}

/**
 * @param {JsonSchema} schema
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} errors
 */
function checkNode(schema, value, path, errors) {
  if (errors.length >= MAX_ERRORS) return
  if (schema.anyOf) {
    checkAnyOf(schema.anyOf, value, path, errors)
    return
  }
  if (!checkType(schema, value, path, errors)) return
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path} must be ${JSON.stringify(schema.const)}`)
    return
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${listOf(schema.enum)}`)
    return
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be at most ${schema.maximum}`)
    return
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path} must have at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`)
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path} must have at most ${schema.maxItems} item${schema.maxItems === 1 ? '' : 's'}`)
    }
    if (schema.items) value.forEach((item, index) => checkNode(/** @type {JsonSchema} */ (schema.items), item, `${path}[${index}]`, errors))
    return
  }
  if (isPlainObject(value)) {
    const properties = schema.properties ?? {}
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) errors.push(`${path}.${key} is required`)
    }
    for (const key of Object.keys(value)) {
      const child = properties[key]
      if (child) checkNode(child, value[key], `${path}.${key}`, errors)
      else if (schema.additionalProperties === false) errors.push(`${path} has unknown field ${JSON.stringify(key)}`)
    }
  }
}

/**
 * @param {JsonSchema} schema
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} errors
 * @returns {boolean} Whether the value has the right type, so the rest is worth checking.
 */
function checkType(schema, value, path, errors) {
  const fail = (/** @type {string} */ what) => {
    errors.push(`${path} must be ${what}`)
    return false
  }
  switch (schema.type) {
    case undefined:
      return true
    case 'object':
      return isPlainObject(value) || fail('an object')
    case 'array':
      return Array.isArray(value) || fail('an array')
    case 'string':
      return typeof value === 'string' || fail('a string')
    case 'boolean':
      return typeof value === 'boolean' || fail('true or false')
    case 'number':
      return (typeof value === 'number' && Number.isFinite(value)) || fail('a finite number')
    case 'integer':
      return Number.isInteger(value) || fail('a whole number')
    default:
      return fail(`of type ${String(schema.type)}`)
  }
}

/**
 * Which branches of an `anyOf` a value is *aiming at*: the ones whose `const`
 * properties it matches, or — for branches with no `const` (apply_records' `create` /
 * `operate` steps) — the ones whose required keys it has.
 *
 * @param {JsonSchema[]} branches
 * @param {unknown} value
 * @returns {JsonSchema[] | null} `null` when the branches carry no discriminator at all.
 */
function aimedBranches(branches, value) {
  const constKeys = (/** @type {JsonSchema} */ branch) =>
    Object.entries(branch.properties ?? {}).filter(([, child]) => child.const !== undefined)
  const byConst = branches.every((branch) => branch.type === 'object' && constKeys(branch).length > 0)
  const byRequired = branches.every((branch) => branch.type === 'object' && (branch.required ?? []).length > 0)
  if (!isPlainObject(value)) return byConst || byRequired ? [] : null
  if (byConst) return branches.filter((branch) => constKeys(branch).every(([key, child]) => value[key] === child.const))
  if (byRequired) return branches.filter((branch) => (branch.required ?? []).every((key) => value[key] !== undefined))
  return null
}

/**
 * @param {JsonSchema[]} branches
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} errors
 */
function checkAnyOf(branches, value, path, errors) {
  const aimed = aimedBranches(branches, value)
  if (aimed !== null && aimed.length === 1) {
    checkNode(aimed[0], value, path, errors)
    return
  }
  if (branches.some((branch) => checkInput(branch, value, path).length === 0)) return
  if (aimed !== null && aimed.length === 0) {
    // Name the discriminator the value missed: an op it did not pick from the list, or
    // a step that is neither a create nor an operate.
    const [first] = branches
    const constKey = Object.keys(first.properties ?? {}).find((key) => first.properties?.[key]?.const !== undefined)
    if (constKey !== undefined) {
      const options = branches.map((branch) => branch.properties?.[constKey]?.const)
      errors.push(`${path}.${constKey} must be one of ${listOf(options)}`)
    } else {
      const keys = branches.map((branch) => (branch.required ?? [])[0])
      errors.push(`${path} must have exactly one of ${listOf(keys)}`)
    }
    return
  }
  errors.push(`${path} does not match any of the ${branches.length} allowed shapes`)
}

// --- schema-level helpers ------------------------------------------------

/**
 * Every keyword used anywhere in a schema — what `schema.spec.js` compares against
 * {@link SUBSET_KEYWORDS}.
 *
 * @param {JsonSchema} schema
 * @returns {Set<string>}
 */
export function keywordsOf(schema) {
  /** @type {Set<string>} */
  const found = new Set()
  /** @param {JsonSchema} node */
  const walk = (node) => {
    for (const key of Object.keys(node)) found.add(key)
    for (const child of Object.values(node.properties ?? {})) walk(child)
    if (node.items) walk(node.items)
    for (const branch of node.anyOf ?? []) walk(branch)
  }
  walk(schema)
  return found
}

/**
 * The schema as the Messages API's strict mode will accept it: a deep copy without
 * {@link STRICT_UNSUPPORTED}. The local checker keeps enforcing those bounds against the
 * original, so dropping them from the wire loses nothing.
 *
 * @param {JsonSchema} schema
 * @returns {JsonSchema}
 */
export function toStrictWire(schema) {
  /** @type {Record<string, any>} */
  const copy = {}
  for (const [key, value] of Object.entries(schema)) {
    if (STRICT_UNSUPPORTED.includes(key)) continue
    if (key === 'properties') {
      copy.properties = Object.fromEntries(
        Object.entries(/** @type {Record<string, JsonSchema>} */ (value)).map(([name, child]) => [name, toStrictWire(child)])
      )
    } else if (key === 'items') copy.items = toStrictWire(/** @type {JsonSchema} */ (value))
    else if (key === 'anyOf') copy.anyOf = /** @type {JsonSchema[]} */ (value).map(toStrictWire)
    else copy[key] = Array.isArray(value) ? [...value] : value
  }
  return /** @type {JsonSchema} */ (copy)
}

// --- derivation from the registry ---------------------------------------

/**
 * @typedef {object} ParamsSchema
 * @property {JsonSchema} schema The params object a create call may pass.
 * @property {Record<string, any>} defaults What an omitted param is filled from — the
 *   same `ui.defaults` a Library drag starts from.
 * @property {'defaults' | 'sketch'} source Derived from `ui.defaults`, or the
 *   hand-written {@link SKETCH_PARAMS_SCHEMA}.
 */

/**
 * Every value an enum param can take, read from the registry's own lists: a Library
 * `choice`, and the composite param tables. A table that depends on another param (a
 * bolt's fits depend on its spec) is unioned over that param's every value, so the
 * schema offers what *some* pairing accepts and the trial fold judges the pairing.
 *
 * @param {string} op
 * @param {import('../../core/kernel/registry.js').RegistryEntry} entry
 * @param {Record<string, any>} defaults
 * @returns {{ enums: Map<string, any[]>, extraNumbers: Map<string, number | undefined> }}
 */
function registryEnumsOf(op, entry, defaults) {
  /** @type {Map<string, any[]>} */
  const enums = new Map()
  /** @type {Map<string, number | undefined>} */
  const extraNumbers = new Map()
  /**
   * @param {string} key
   * @param {readonly any[]} values
   */
  const add = (key, values) => {
    const list = enums.get(key) ?? []
    for (const value of values) if (!list.includes(value)) list.push(value)
    enums.set(key, list)
  }
  const choice = entry.ui?.choice
  if (choice) add(choice.param, choice.options.map((option) => option.value))

  // `paramOptions` describes the real catalogue's composites; a fake registry's entry
  // under the same name is not that op, so it is not asked.
  if (kernelRegistry[op] === entry) {
    const base = paramOptions(op, defaults)
    const enumKeys = Object.keys(base).filter((key) => base[key].kind === 'enum')
    /** @type {Record<string, any>[]} */
    const variants = [defaults]
    for (const key of enumKeys) {
      const schema = /** @type {import('../../core/kernel/registry.js').EnumParamSchema} */ (base[key])
      for (const option of schema.options) variants.push({ ...defaults, [key]: option.value })
    }
    for (const variant of variants) {
      const options = paramOptions(op, variant)
      for (const key of enumKeys) {
        const schema = /** @type {import('../../core/kernel/registry.js').EnumParamSchema} */ (options[key])
        add(key, schema.options.map((option) => option.value))
      }
    }
    for (const [key, schema] of Object.entries(base)) {
      if (schema.kind === 'number' && !(key in defaults)) extraNumbers.set(key, schema.default)
    }
  }
  return { enums, extraNumbers }
}

/**
 * One derived property, from a default's JSON type.
 *
 * @param {string} op
 * @param {string} key
 * @param {unknown} value
 * @param {any[] | undefined} enumValues
 * @returns {JsonSchema}
 */
function propertyFromDefault(op, key, value, enumValues) {
  if (enumValues !== undefined) {
    const type = typeof value === 'number' ? 'number' : 'string'
    return { type, description: `${labelForParam(key)}. One of the listed values.`, enum: enumValues }
  }
  if (typeof value === 'number') return { type: 'number', description: unitSentence(key) }
  if (typeof value === 'string') return { type: 'string', description: `${labelForParam(key)}.` }
  if (typeof value === 'boolean') return { type: 'boolean', description: `${labelForParam(key)}.` }
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'number')) {
    const unit = key.endsWith('Deg') ? 'degrees' : 'millimetres'
    return vectorSchema(value.length, `${labelForParam(key)}: ${value.length} numbers, in ${unit}.`)
  }
  // Not derivable honestly from one example value. Such an op needs a hand-written
  // schema (as primitive.sketch has); failing here is what makes that visible.
  throw new Error(`${op}: cannot derive a schema for param "${key}" from its default ${JSON.stringify(value)}`)
}

/**
 * The params schema for a creatable op: `operandCount: 0` with `ui` metadata, exactly
 * the ops the Library offers.
 *
 * `center` is never a param here. Where a body goes is the create tool's own
 * `positionMm` argument, because placement is part of creating (`CLAUDE.md`: geometry
 * is placed, not spawned at a fixed transform).
 *
 * @param {string} op
 * @param {Readonly<Record<string, import('../../core/kernel/registry.js').RegistryEntry>>} [ops]
 * @returns {ParamsSchema}
 */
export function paramsSchemaFor(op, ops = kernelRegistry) {
  const entry = ops[op]
  if (!entry || entry.operandCount !== 0 || !entry.ui) {
    throw new Error(`${op} is not a creatable op: it needs operandCount 0 and a Library entry (ui metadata)`)
  }
  const defaults = entry.ui.defaults
  if (entry.ui.editor === 'sketch') return { schema: SKETCH_PARAMS_SCHEMA, defaults, source: 'sketch' }

  const { enums, extraNumbers } = registryEnumsOf(op, entry, defaults)
  /** @type {Record<string, JsonSchema>} */
  const properties = {}
  for (const [key, value] of Object.entries(defaults)) {
    if (key === 'center') continue
    properties[key] = propertyFromDefault(op, key, value, enums.get(key))
  }
  for (const [key, values] of enums) {
    if (!(key in properties)) properties[key] = { type: typeof values[0] === 'number' ? 'number' : 'string', description: `${labelForParam(key)}. One of the listed values.`, enum: values }
  }
  for (const [key, fallback] of extraNumbers) {
    properties[key] = {
      type: 'number',
      description: `${unitSentence(key)}${fallback === undefined ? '' : ` Default ${fallback}.`}`,
    }
  }
  return { schema: objectSchema(properties), defaults, source: 'defaults' }
}

// --- primitive.sketch, by hand ----------------------------------------------

const VEC2 = vectorSchema(2, 'A point in the sketch plane: [x, y] in millimetres.')
const ROLE = /** @type {JsonSchema} */ ({
  type: 'string',
  enum: [...PROFILE_ROLES],
  description: 'solid adds area; hole cuts it out of the solids it sits inside.',
})
const ID = /** @type {JsonSchema} */ ({ type: 'string', description: 'An id unique within its slice, e.g. "p1".' })

/** @type {Record<string, JsonSchema>} */
const PROFILE_SCHEMAS = {
  circle: objectSchema(
    { id: ID, kind: { type: 'string', const: 'circle' }, role: ROLE, centerMm: VEC2, radiusMm: { type: 'number', description: 'Radius, in millimetres.' } },
    ['id', 'kind', 'role', 'centerMm', 'radiusMm']
  ),
  rect: objectSchema(
    {
      id: ID,
      kind: { type: 'string', const: 'rect' },
      role: ROLE,
      centerMm: VEC2,
      widthMm: { type: 'number', description: 'Width along sketch X, in millimetres.' },
      heightMm: { type: 'number', description: 'Height along sketch Y, in millimetres.' },
    },
    ['id', 'kind', 'role', 'centerMm', 'widthMm', 'heightMm']
  ),
  polygon: objectSchema(
    {
      id: ID,
      kind: { type: 'string', const: 'polygon' },
      role: ROLE,
      centerMm: VEC2,
      radiusMm: { type: 'number', description: 'Circumradius, in millimetres.' },
      sides: { type: 'integer', description: 'Number of sides, 3 or more.' },
      rotationDeg: { type: 'number', description: 'Rotation, in degrees.' },
    },
    ['id', 'kind', 'role', 'centerMm', 'radiusMm', 'sides', 'rotationDeg']
  ),
  polyline: objectSchema(
    {
      id: ID,
      kind: { type: 'string', const: 'polyline' },
      role: ROLE,
      pointsMm: { type: 'array', items: VEC2, description: 'The outline’s points in order; do not repeat the first point at the end.' },
      closed: { type: 'boolean', description: 'true for an outline that encloses area; an open chain is never part of the solid.' },
    },
    ['id', 'kind', 'role', 'pointsMm', 'closed']
  ),
}

/**
 * Extrusion params that are counts, not lengths or angles. Not exported by the sketch
 * model (its rules table is private), so named here; the trial fold still judges every
 * value, so a mistake here costs a worse error message, never a wrong body.
 */
const INTEGER_EXTRUSION_PARAMS = Object.freeze(['twistSteps', 'segments', 'segmentsPerTurn', 'resolution'])

/**
 * @param {string} key
 * @returns {JsonSchema}
 */
function extrusionParam(key) {
  if (INTEGER_EXTRUSION_PARAMS.includes(key)) return { type: 'integer', description: `${labelForParam(key)} (a count).` }
  if (key.endsWith('Mm') || key.endsWith('Deg')) return { type: 'number', description: unitSentence(key) }
  return { type: 'number', description: `${labelForParam(key)}.` }
}

/**
 * A sketch's params, minus `center` (the create tool's `positionMm` is the sketch
 * plane's origin). Written from `src/sketch/profile.js`'s exported constants; see the
 * module note for the spec that holds the two together.
 *
 * @type {JsonSchema}
 */
export const SKETCH_PARAMS_SCHEMA = Object.freeze(
  objectSchema(
    {
      slices: {
        type: 'array',
        description:
          'One slice for linear, revolve, helical and outline; two or more, each at its own zMm with exactly one solid outline, for loft.',
        items: objectSchema(
          {
            id: { type: 'string', description: 'A slice id, unique within the sketch, e.g. "s1".' },
            zMm: { type: 'number', description: 'Offset along the sketch’s local Z, in millimetres.' },
            profiles: { type: 'array', items: { anyOf: PROFILE_KINDS.map((kind) => PROFILE_SCHEMAS[kind]) } },
          },
          ['id', 'zMm', 'profiles']
        ),
      },
      extrusion: {
        anyOf: EXTRUSION_METHODS.map((method) =>
          objectSchema(
            {
              method: { type: 'string', const: method },
              ...Object.fromEntries(Object.keys(EXTRUSION_DEFAULTS[method]).map((key) => [key, extrusionParam(key)])),
            },
            ['method'],
            method === 'revolve' || method === 'helical'
              ? `${method}: spins around the sketch’s Y axis, so every outline must stay on the +X side.`
              : `${method}. Omitted params take the sketch editor’s defaults.`
          )
        ),
      },
    },
    ['slices', 'extrusion'],
    'A sketch: closed 2D outlines on one or more slices, and how they are extruded into a solid.'
  )
)

// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { registry } from '../../core/kernel/registry.js'
import {
  EXTRUSION_DEFAULTS,
  EXTRUSION_METHODS,
  PROFILE_KINDS,
  PROFILE_ROLES,
  emptySketchParams,
} from '../../sketch/profile.js'
import { fakeRegistry } from './__fixtures__/fakeRegistry.js'
import {
  SKETCH_PARAMS_SCHEMA,
  STRICT_UNSUPPORTED,
  SUBSET_KEYWORDS,
  checkInput,
  keywordsOf,
  paramsSchemaFor,
  toStrictWire,
} from './schema.js'
import { createToolRegistry } from './index.js'

/** @typedef {import('./schema.js').JsonSchema} JsonSchema */

/**
 * Every object node in a schema, depth first.
 *
 * @param {JsonSchema} schema
 * @returns {JsonSchema[]}
 */
function objectNodes(schema) {
  /** @type {JsonSchema[]} */
  const found = []
  /** @param {JsonSchema} node */
  const walk = (node) => {
    if (node.type === 'object') found.push(node)
    for (const child of Object.values(node.properties ?? {})) walk(child)
    if (node.items) walk(node.items)
    for (const branch of node.anyOf ?? []) walk(branch)
  }
  walk(schema)
  return found
}

describe('the closed JSON-Schema subset (ai-001 decision 4)', () => {
  it('every tool schema the registry emits, on both registries and both transports, uses only subset keywords', () => {
    for (const ops of [registry, fakeRegistry]) {
      const tools = createToolRegistry({ registry: ops })
      for (const transport of /** @type {const} */ (['ai', 'mcp'])) {
        for (const tool of tools.toolsFor(transport)) {
          const unknown = [...keywordsOf(tool.inputSchema)].filter((keyword) => !SUBSET_KEYWORDS.includes(keyword))
          expect(unknown, `${tool.name} emits keywords the checker does not handle`).toEqual([])
        }
      }
    }
  })

  // One failing input per keyword: if the checker ever stops honouring a keyword the
  // emitter still produces, this is the test that says which.
  /** @type {Array<[string, JsonSchema, unknown]>} */
  const refusals = [
    ['type', { type: 'number' }, 'five'],
    ['properties', { type: 'object', properties: { a: { type: 'number' } }, required: [], additionalProperties: false }, { a: 'x' }],
    ['required', { type: 'object', properties: { a: { type: 'number' } }, required: ['a'], additionalProperties: false }, {}],
    ['additionalProperties', { type: 'object', properties: {}, required: [], additionalProperties: false }, { extra: 1 }],
    ['enum', { type: 'string', enum: ['x', 'y'] }, 'z'],
    ['const', { type: 'string', const: 'x' }, 'y'],
    ['minimum', { type: 'number', minimum: 0 }, -1],
    ['maximum', { type: 'number', maximum: 1 }, 2],
    ['items', { type: 'array', items: { type: 'number' } }, [1, 'two']],
    ['minItems', { type: 'array', items: { type: 'number' }, minItems: 2 }, [1]],
    ['maxItems', { type: 'array', items: { type: 'number' }, maxItems: 1 }, [1, 2]],
    [
      'anyOf',
      {
        anyOf: [
          { type: 'object', properties: { op: { type: 'string', const: 'a' } }, required: ['op'], additionalProperties: false },
          { type: 'object', properties: { op: { type: 'string', const: 'b' } }, required: ['op'], additionalProperties: false },
        ],
      },
      { op: 'c' },
    ],
  ]

  it('covers every keyword in the subset with a refusal case', () => {
    const covered = new Set(refusals.map(([keyword]) => keyword))
    // `description` is the one keyword that constrains nothing.
    expect([...SUBSET_KEYWORDS].filter((keyword) => keyword !== 'description' && !covered.has(keyword))).toEqual([])
  })

  for (const [keyword, schema, value] of refusals) {
    it(`refuses by name when ${keyword} is violated`, () => {
      const errors = checkInput(schema, value)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toMatch(/^input/)
    })
  }

  it('accepts a value that satisfies the schema, and returns no errors', () => {
    const schema = /** @type {JsonSchema} */ ({
      type: 'object',
      properties: { sizeMm: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }, n: { type: 'integer' } },
      required: ['sizeMm'],
      additionalProperties: false,
    })
    expect(checkInput(schema, { sizeMm: [1, 2, 3], n: 4 })).toEqual([])
  })

  it('refuses a non-integer for an integer, and a non-finite number for any number', () => {
    expect(checkInput({ type: 'integer' }, 1.5)).toHaveLength(1)
    expect(checkInput({ type: 'number' }, Number.NaN)).toHaveLength(1)
    expect(checkInput({ type: 'number' }, Number.POSITIVE_INFINITY)).toHaveLength(1)
  })

  it('names the discriminating branch for an anyOf, so the model is told which op it got wrong', () => {
    const schema = /** @type {JsonSchema} */ ({
      anyOf: [
        { type: 'object', properties: { op: { type: 'string', const: 'a' }, n: { type: 'number' } }, required: ['op', 'n'], additionalProperties: false },
        { type: 'object', properties: { op: { type: 'string', const: 'b' } }, required: ['op'], additionalProperties: false },
      ],
    })
    expect(checkInput(schema, { op: 'a' })).toEqual(['input.n is required'])
    expect(checkInput(schema, { op: 'c' })[0]).toMatch(/input\.op must be one of "a", "b"/)
  })

  it('never throws, whatever it is handed', () => {
    for (const value of [null, undefined, 1, 'x', [], {}, () => 1]) {
      expect(() => checkInput({ type: 'object', properties: {}, required: [], additionalProperties: false }, value)).not.toThrow()
    }
  })
})

describe('toStrictWire — what the Messages API strict mode accepts', () => {
  it('drops every keyword strict mode does not support and keeps every object closed with a required list', () => {
    const tools = createToolRegistry({ registry })
    for (const tool of tools.toolsFor('ai')) {
      const wire = toStrictWire(tool.inputSchema)
      for (const keyword of STRICT_UNSUPPORTED) expect(keywordsOf(wire).has(keyword), `${tool.name}: ${keyword}`).toBe(false)
      for (const node of objectNodes(wire)) {
        expect(node.additionalProperties, tool.name).toBe(false)
        expect(Array.isArray(node.required), tool.name).toBe(true)
      }
    }
  })

  it('does not mutate the schema it was handed — the local checker still enforces the bounds', () => {
    const schema = /** @type {JsonSchema} */ ({ type: 'number', minimum: 0 })
    toStrictWire(schema)
    expect(schema.minimum).toBe(0)
  })
})

describe('paramsSchemaFor — op params as JSON Schema, derived from the registry', () => {
  it('derives a primitive from its ui.defaults: arrays keep their length, numbers say millimetres', () => {
    const { schema, defaults, source } = paramsSchemaFor('primitive.cuboid')
    expect(source).toBe('defaults')
    expect(defaults).toEqual({ size: [40, 40, 40] })
    const size = /** @type {JsonSchema} */ (schema.properties?.size)
    expect(size).toMatchObject({ type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 })
    expect(size.description).toMatch(/millimetres/)
    expect(schema.required).toEqual([])
    expect(schema.additionalProperties).toBe(false)
  })

  it('never lets a caller set the position through params — placement is the tool’s own argument', () => {
    for (const op of ['primitive.cuboid', 'primitive.sphere', 'primitive.sketch', 'text.label']) {
      expect(paramsSchemaFor(op).schema.properties?.center, op).toBeUndefined()
    }
  })

  it('says degrees for a *Deg parameter and millimetres for every other plain number', () => {
    for (const [op, entry] of Object.entries(registry)) {
      if (entry.operandCount !== 0 || !entry.ui || op === 'primitive.sketch') continue
      for (const [key, property] of Object.entries(paramsSchemaFor(op).schema.properties ?? {})) {
        if (property.type !== 'number' || property.enum) continue
        expect(property.description, `${op}.${key}`).toMatch(key.endsWith('Deg') ? /degrees/ : /millimetres/)
      }
    }
  })

  it('reads an enum from the Library choice (a Pi model) and from the param tables (a bolt spec)', () => {
    const pi = paramsSchemaFor('raspberrypi.bplus').schema.properties ?? {}
    expect(pi.model?.enum).toEqual([2, 3, 4, 5])
    const bolt = paramsSchemaFor('hardware.bolt').schema.properties ?? {}
    expect(bolt.spec?.enum).toContain('m10 hex')
    // A bolt's valid fits depend on its spec; the schema offers every fit any spec
    // has, and the trial fold judges the pairing.
    expect(bolt.fit?.enum).toContain('loose')
    // A schema-known param the defaults omit (the Pi's clearance) is still offered.
    expect(pi.clearance?.type).toBe('number')
  })

  it('accepts every op’s own defaults — the schema cannot refuse what the Library itself places', () => {
    for (const [op, entry] of Object.entries(registry)) {
      if (entry.operandCount !== 0 || !entry.ui) continue
      const { schema, defaults } = paramsSchemaFor(op)
      const placeable = op === 'primitive.sketch' ? withoutCenter(defaults) : defaults
      expect(checkInput(schema, placeable), op).toEqual([])
    }
  })

  it('derives the fake registry’s op the same way', () => {
    const { schema } = paramsSchemaFor('fake.block', fakeRegistry)
    expect(schema.properties?.sizeMm?.type).toBe('number')
  })

  it('refuses an op that is not creatable, by name', () => {
    expect(() => paramsSchemaFor('boolean.union')).toThrow(/boolean\.union/)
    expect(() => paramsSchemaFor('fake.internal', fakeRegistry)).toThrow(/fake\.internal/)
  })
})

describe('the hand-written sketch schema — and the spec that fails when the sketch model drifts from it', () => {
  it('is the source paramsSchemaFor reports for primitive.sketch', () => {
    expect(paramsSchemaFor('primitive.sketch').source).toBe('sketch')
  })

  it('names exactly the sketch model’s profile kinds, roles and extrusion methods', () => {
    const profile = sliceProfileSchema()
    const kinds = (profile.anyOf ?? []).map((branch) => branch.properties?.kind?.const)
    expect(kinds.sort()).toEqual([...PROFILE_KINDS].sort())
    for (const branch of profile.anyOf ?? []) expect(branch.properties?.role?.enum).toEqual([...PROFILE_ROLES])
    const extrusion = /** @type {JsonSchema} */ (SKETCH_PARAMS_SCHEMA.properties?.extrusion)
    const methods = (extrusion.anyOf ?? []).map((branch) => branch.properties?.method?.const)
    expect(methods.sort()).toEqual([...EXTRUSION_METHODS].sort())
  })

  it('offers exactly each extrusion method’s own params, from EXTRUSION_DEFAULTS', () => {
    const extrusion = /** @type {JsonSchema} */ (SKETCH_PARAMS_SCHEMA.properties?.extrusion)
    for (const branch of extrusion.anyOf ?? []) {
      const method = /** @type {keyof typeof EXTRUSION_DEFAULTS} */ (branch.properties?.method?.const)
      const keys = Object.keys(branch.properties ?? {}).filter((key) => key !== 'method')
      expect(keys.sort(), method).toEqual(Object.keys(EXTRUSION_DEFAULTS[method]).sort())
    }
  })

  it('accepts the registry’s own ghost defaults and a fresh sketch, so the two cannot drift apart silently', () => {
    expect(checkInput(SKETCH_PARAMS_SCHEMA, withoutCenter(registry['primitive.sketch'].ui?.defaults ?? {}))).toEqual([])
    expect(checkInput(SKETCH_PARAMS_SCHEMA, emptySketchParams())).toEqual([])
  })
})

/**
 * @param {Record<string, any>} params
 * @returns {Record<string, any>}
 */
function withoutCenter(params) {
  const { center: _center, ...rest } = params
  return rest
}

/** @returns {JsonSchema} The schema one sketch profile is checked against. */
function sliceProfileSchema() {
  const slices = /** @type {JsonSchema} */ (SKETCH_PARAMS_SCHEMA.properties?.slices)
  const slice = /** @type {JsonSchema} */ (slices.items)
  const profiles = /** @type {JsonSchema} */ (slice.properties?.profiles)
  return /** @type {JsonSchema} */ (profiles.items)
}

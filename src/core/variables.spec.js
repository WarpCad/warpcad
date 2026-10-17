// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest'

import { LOCAL } from './__fixtures__/piScenes.js'
import { createDocument } from './document.js'
import { boundsOf, hiddenNamesOf, isGroup, volumeOf } from './kernel/group.js'
import { parseProject, serializeProject } from './project.js'
import { resetUserParts, setLibraryParts } from './userPart.js'
import {
  VARIABLE_LIMITS,
  VARIABLE_OP,
  VariableError,
  VariableInUseError,
  bindParam,
  bindParamToNewVariable,
  bindableParams,
  consumersOf,
  defineVariable,
  deleteVariable,
  readVariables,
  renameVariable,
  resolveParams,
  resolveRecord,
  setVariable,
  unbindParam,
  variableDefinitionError,
} from './variables.js'
import { recordLinesOf } from './__fixtures__/projectText.js'

/**
 * `TODO/core-050` — project variables: named values any param of any record can be bound to.
 *
 * Kernel is real (plain Node); no worker, no DOM, no WebGL. Numerical comparisons against a
 * hand-written literal document use `toBeCloseTo` at **1e-6 mm** (precision 6) for bounds and
 * 1e-6 relative for volume.
 */

/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

afterEach(() => {
  resetUserParts()
})

/** @type {any} */
const PI_MODEL = Object.freeze({
  name: 'piModel',
  kind: 'enum',
  value: 4,
  label: 'Pi model',
  options: [
    { value: 3, label: 'Pi 3' },
    { value: 4, label: 'Pi 4' },
    { value: 5, label: 'Pi 5' },
  ],
})

/**
 * @param {Record<string, any>} [overrides]
 * @returns {any}
 */
const wallVar = (overrides = {}) => ({ name: 'wall', kind: 'number', value: 2, unit: 'mm', min: 1, max: 10, ...overrides })

/**
 * @param {OpRecord[]} records
 * @returns {import('./document.js').DocumentEntry[]}
 */
const entriesOf = (records) => records.map((record) => ({ record, origin: 'local' }))

/** @param {Record<string, any>} params @param {string} [id] */
const varRecord = (params, id = `var-${params.name}`) => ({ id, op: VARIABLE_OP, params })

/** @param {WarpDocument} document @param {string} id */
function bodyOf(document, id) {
  const body = document.bodies().find((candidate) => candidate.id === id)
  if (!body) throw new Error(`no body ${id}`)
  return body
}

/** @param {WarpDocument} document @param {string} id */
function sizeOf(document, id) {
  const [min, max] = boundsOf(bodyOf(document, id).geometry)
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

/**
 * Bounds, volume and part names of every body — what "the same document" means here.
 *
 * @param {WarpDocument} document
 */
function shapeOf(document) {
  return document.bodies().map((body) => ({
    id: body.id,
    bounds: boundsOf(body.geometry),
    volume: volumeOf(body.geometry),
    parts: isGroup(body.geometry) ? [...body.geometry.names] : [],
    hidden: isGroup(body.geometry) ? hiddenNamesOf(body.geometry) : [],
  }))
}

/**
 * @param {ReturnType<typeof shapeOf>} actual
 * @param {ReturnType<typeof shapeOf>} expected
 */
function expectSameShape(actual, expected) {
  expect(actual.map((body) => body.id)).toEqual(expected.map((body) => body.id))
  actual.forEach((body, index) => {
    const reference = expected[index]
    expect(body.parts).toEqual(reference.parts)
    expect(body.hidden).toEqual(reference.hidden)
    for (let corner = 0; corner < 2; corner += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        expect(body.bounds[corner][axis]).toBeCloseTo(reference.bounds[corner][axis], 6)
      }
    }
    expect(body.volume / reference.volume).toBeCloseTo(1, 6)
  })
}

// --- the motivating case ---------------------------------------------------

/**
 * The Pi-case document: a Pi, a case, and an AV-jack cut-out that only applies on a Pi 4.
 * `bound` drives the Pi's model and the cut-out's condition from `piModel`; otherwise both
 * hold the literal `model`, the way a hand-written document would.
 *
 * @param {{ bound: true } | { bound: false, model: number }} options
 * @returns {WarpDocument}
 */
function piCase(options) {
  const document = createDocument()
  if (options.bound) defineVariable(document, PI_MODEL, LOCAL)
  const model = options.bound ? { $var: 'piModel' } : options.model
  document.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model } }, LOCAL)
  document.append(
    { id: 'case-1', op: 'primitive.cuboid', name: 'Case 1', params: { size: [110, 80, 30], center: [50, 30, 5] } },
    LOCAL,
  )
  document.append(
    { id: 'av-cut', op: 'primitive.cuboid', name: 'AV cut-out', params: { size: [20, 10, 10], center: [0, 30, 5] } },
    LOCAL,
  )
  document.append(
    {
      id: 'bool-1',
      op: 'boolean.subtract',
      name: 'Case',
      target: 'case-1',
      operands: ['av-cut'],
      consumes: ['case-1', 'av-cut'],
      when: options.bound ? { var: 'piModel', in: [4] } : { ref: 'pi-1', param: 'model', in: [4] },
    },
    LOCAL,
  )
  return document
}

describe('the motivating case — one switch drives the board and the cut-outs', () => {
  it('piModel 4 → 5 → 4 equals a literal document at each step, and leaves no residue', () => {
    const document = piCase({ bound: true })
    const start = serializeProject(document)
    expectSameShape(shapeOf(document), shapeOf(piCase({ bound: false, model: 4 })))

    setVariable(document, 'piModel', 5, LOCAL)
    expectSameShape(shapeOf(document), shapeOf(piCase({ bound: false, model: 5 })))
    // Neither record was touched: the Pi still says "piModel", the cut-out still says "if piModel is 4".
    expect(document.recordOf('pi-1')?.params).toEqual({ model: { $var: 'piModel' } })
    expect(document.timeline().find((row) => row.id === 'bool-1')?.inactiveBy).not.toBeNull()

    setVariable(document, 'piModel', 4, LOCAL)
    expectSameShape(shapeOf(document), shapeOf(piCase({ bound: false, model: 4 })))
    expect(recordLinesOf(serializeProject(document))).toBe(recordLinesOf(start))
  })

  it('one setVariable is one Undo step, and Undo puts the Pi 4 back', () => {
    const document = piCase({ bound: true })
    const before = shapeOf(document)
    setVariable(document, 'piModel', 5, LOCAL)
    document.undo()
    expectSameShape(shapeOf(document), before)
    expect(document.canUndo()).toBe(true) // the build-up steps are still there, one each
  })
})

// --- any param, any op -------------------------------------------------------

describe('any param, any op — resolution happens once, before the op sees its params', () => {
  it('a number into one element of primitive.cuboid size', () => {
    const document = createDocument()
    defineVariable(document, wallVar({ value: 3 }), LOCAL)
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [{ $var: 'wall' }, 20, 10] } }, LOCAL)
    const [x, y, z] = sizeOf(document, 'cube-1')
    expect(x).toBeCloseTo(3, 6)
    expect(y).toBeCloseTo(20, 6)
    expect(z).toBeCloseTo(10, 6)
    // The record keeps the binding; the body's params are what the user wrote.
    expect(document.recordOf('cube-1')?.params?.size[0]).toEqual({ $var: 'wall' })
  })

  it('an enum into hardware.bolt spec', () => {
    const bound = createDocument()
    defineVariable(bound, { name: 'boltSpec', kind: 'enum', value: 'm3 socket', options: [{ value: 'm3 socket', label: 'M3' }, { value: 'm5 socket', label: 'M5' }] }, LOCAL)
    bound.append({ id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: { $var: 'boltSpec' }, length: 10, fit: 'close' } }, LOCAL)
    setVariable(bound, 'boltSpec', 'm5 socket', LOCAL)
    const literal = createDocument()
    literal.append({ id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm5 socket', length: 10, fit: 'close' } }, LOCAL)
    expectSameShape(shapeOf(bound), shapeOf(literal))
  })

  it('a boolean into a composite (the HQ camera\'s flipTripodMount)', () => {
    const bound = createDocument()
    defineVariable(bound, { name: 'flip', kind: 'boolean', value: true }, LOCAL)
    bound.append({ id: 'cam-1', op: 'raspberrypi.cameraModule', name: 'Camera 1', params: { model: 'hq', flipTripodMount: { $var: 'flip' } } }, LOCAL)
    const literal = createDocument()
    literal.append({ id: 'cam-1', op: 'raspberrypi.cameraModule', name: 'Camera 1', params: { model: 'hq', flipTripodMount: true } }, LOCAL)
    const unflipped = createDocument()
    unflipped.append({ id: 'cam-1', op: 'raspberrypi.cameraModule', name: 'Camera 1', params: { model: 'hq', flipTripodMount: false } }, LOCAL)
    expectSameShape(shapeOf(bound), shapeOf(literal))
    setVariable(bound, 'flip', false, LOCAL)
    expectSameShape(shapeOf(bound), shapeOf(unflipped))
  })

  it("a user part's exposed parameter — expansion happens after resolution (core-037)", () => {
    setLibraryParts([
      {
        op: 'user.test-cube',
        name: 'Test cube',
        version: 1,
        result: 'r1',
        records: [{ id: 'r1', op: 'primitive.cuboid', params: { size: [10, 20, 30] } }],
        params: [{ name: 'width', unit: 'mm', default: 10, min: 2, max: 50, binds: [{ record: 'r1', path: 'size.0' }] }],
      },
    ])
    const document = createDocument()
    defineVariable(document, wallVar({ name: 'partWidth', value: 7, max: 50 }), LOCAL)
    document.append({ id: 'part-1', op: 'user.test-cube', name: 'Test cube 1', params: { width: { $var: 'partWidth' } } }, LOCAL)
    expect(sizeOf(document, 'part-1')[0]).toBeCloseTo(7, 6)
    setVariable(document, 'partWidth', 33, LOCAL)
    expect(sizeOf(document, 'part-1')[0]).toBeCloseTo(33, 6)
  })

  it('a binding to a variable defined *after* its consumer in the log still resolves', () => {
    const document = createDocument()
    document.loadEntries(
      entriesOf([
        { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [{ $var: 'wall' }, 5, 5] } },
        varRecord(wallVar({ value: 4 })),
      ]),
    )
    expect(document.brokenSteps()).toEqual([])
    expect(sizeOf(document, 'cube-1')[0]).toBeCloseTo(4, 6)
  })
})

// --- one variable, many consumers ---------------------------------------------

describe('one variable, many consumers — one transaction', () => {
  /** @returns {WarpDocument} */
  function threeConsumers() {
    const document = createDocument()
    defineVariable(document, wallVar(), LOCAL)
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [{ $var: 'wall' }, 20, 10], center: [0, 0, 0] } }, LOCAL)
    document.append(
      { id: 'cube-1-move', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [{ $var: 'wall' }, 0, 0], rotation: [0, 0, 0] } },
      LOCAL,
    )
    document.append({ id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { height: { $var: 'wall' }, diameter: 6, center: [50, 0, 0] } }, LOCAL)
    return document
  }

  it('changes all three on one setVariable, and one Undo restores all three', () => {
    const document = threeConsumers()
    const centreX = () => {
      const [min, max] = boundsOf(bodyOf(document, 'cube-1').geometry)
      return (min[0] + max[0]) / 2
    }
    expect(sizeOf(document, 'cube-1')[0]).toBeCloseTo(2, 6)
    expect(centreX()).toBeCloseTo(2, 6)
    expect(sizeOf(document, 'cyl-1')[2]).toBeCloseTo(2, 6)

    const undoDepth = /** @type {any} */ (document).pendingUndo()
    setVariable(document, 'wall', 5, LOCAL)
    expect(sizeOf(document, 'cube-1')[0]).toBeCloseTo(5, 6)
    expect(centreX()).toBeCloseTo(5, 6)
    expect(sizeOf(document, 'cyl-1')[2]).toBeCloseTo(5, 6)

    document.undo()
    expect(document.pendingUndo()).toBe(undoDepth)
    expect(sizeOf(document, 'cube-1')[0]).toBeCloseTo(2, 6)
    expect(centreX()).toBeCloseTo(2, 6)
    expect(sizeOf(document, 'cyl-1')[2]).toBeCloseTo(2, 6)
    document.redo()
    expect(sizeOf(document, 'cyl-1')[2]).toBeCloseTo(5, 6)
  })

  it('consumersOf names every record that reads the variable, and every condition', () => {
    const document = threeConsumers()
    const consumers = consumersOf(document.entries, 'wall')
    expect(consumers.map((consumer) => [consumer.recordId, consumer.path])).toEqual([
      ['cube-1', 'size.0'],
      ['cube-1-move', 'vector.0'],
      ['cyl-1', 'height'],
    ])
  })
})

// --- dependent enum -----------------------------------------------------------

describe('a dependent enum (a bolt fit follows its spec) is checked after resolution', () => {
  /** Fake size tables: spec `a` has fits tap/close, spec `b` only tap. */
  const tables = /** @type {any} */ ({
    boltSpecs: { a: { fitDiameterMm: { tap: 1, close: 2 } }, b: { fitDiameterMm: { tap: 1 } } },
    nutSpecs: {},
    washerSpecs: {},
    bearingSpecs: {},
    screwSpecs: {},
    FIT_CLEARANCE_MM: {},
  })
  const bolt = { id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: { $var: 'spec' }, length: 10, fit: { $var: 'fit' } } }
  /** @param {string} spec */
  const variablesWith = (spec) =>
    readVariables(
      entriesOf([
        varRecord({ name: 'spec', kind: 'enum', value: spec, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }),
        varRecord({ name: 'fit', kind: 'enum', value: 'close', options: [{ value: 'tap', label: 'Tap' }, { value: 'close', label: 'Close' }] }),
      ]),
    ).variables

  it('resolves while the fit is one of the spec\'s fits', () => {
    const { record, errors } = resolveRecord(bolt, variablesWith('a'), { tables })
    expect(errors).toEqual([])
    expect(record.params).toEqual({ spec: 'a', length: 10, fit: 'close' })
  })

  it('names the stranded fit, the record and the variable — never a coerced value', () => {
    const { errors } = resolveRecord(bolt, variablesWith('b'), { tables })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/Bolt 1/)
    expect(errors[0]).toMatch(/fit/)
    expect(errors[0]).toMatch(/"fit"|fit/)
    expect(errors[0]).toMatch(/close/)
  })

  it('in a document, a stranded fit is a broken row, named — not a refused change', () => {
    const document = createDocument()
    defineVariable(document, { name: 'spec', kind: 'enum', value: 'm3 socket', options: [{ value: 'm3 socket', label: 'M3' }, { value: 'm5 socket', label: 'M5' }] }, LOCAL)
    // The real tables give every spec the same fits, so strand it with a literal the spec
    // never had: with `spec` bound, the record is judged after resolution, by name.
    document.append({ id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: { $var: 'spec' }, length: 10, fit: 'snug' } }, LOCAL)
    const [step] = document.brokenSteps()
    expect(step.id).toBe('bolt-1')
    expect(step.reason).toMatch(/Bolt 1/)
    expect(step.reason).toMatch(/fit/)
    expect(step.reason).toMatch(/snug/)
  })
})

// --- rename and delete -----------------------------------------------------------

describe('rename and delete', () => {
  /** @returns {WarpDocument} */
  function twoBound() {
    const document = createDocument()
    defineVariable(document, wallVar(), LOCAL)
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [{ $var: 'wall' }, 20, 10] } }, LOCAL)
    document.append({ id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { height: { $var: 'wall' }, diameter: 6, center: [50, 0, 0] } }, LOCAL)
    return document
  }

  it('rename rewrites the variable and every binding atomically — and undoes as one step', () => {
    const document = twoBound()
    renameVariable(document, 'wall', 'wallThickness', LOCAL)
    expect(readVariables(document.entries).variables.has('wallThickness')).toBe(true)
    expect(readVariables(document.entries).variables.has('wall')).toBe(false)
    expect(document.recordOf('cube-1')?.params?.size[0]).toEqual({ $var: 'wallThickness' })
    expect(document.recordOf('cyl-1')?.params?.height).toEqual({ $var: 'wallThickness' })
    expect(document.brokenSteps()).toEqual([])

    document.undo()
    expect(document.recordOf('cube-1')?.params?.size[0]).toEqual({ $var: 'wall' })
    expect(document.recordOf('cyl-1')?.params?.height).toEqual({ $var: 'wall' })
    expect(readVariables(document.entries).variables.has('wall')).toBe(true)
  })

  it('rename also rewrites a condition that reads the variable', () => {
    const document = piCase({ bound: true })
    renameVariable(document, 'piModel', 'board', LOCAL)
    expect(document.recordOf('bool-1')?.when).toEqual({ var: 'board', in: [4] })
    expect(document.brokenSteps()).toEqual([])
  })

  it('rename refuses a name already taken, or a bad one', () => {
    const document = twoBound()
    defineVariable(document, wallVar({ name: 'gap' }), LOCAL)
    expect(() => renameVariable(document, 'wall', 'gap', LOCAL)).toThrow(/gap/)
    expect(() => renameVariable(document, 'wall', '2wall', LOCAL)).toThrow(VariableError)
  })

  it('delete is refused while in use, with the list of consumers', () => {
    const document = twoBound()
    const before = serializeProject(document)
    let thrown
    try {
      deleteVariable(document, 'wall', LOCAL)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(VariableInUseError)
    const consumers = /** @type {VariableInUseError} */ (thrown).consumers
    expect(consumers.map((consumer) => consumer.recordId)).toEqual(['cube-1', 'cyl-1'])
    expect(/** @type {Error} */ (thrown).message).toMatch(/Cube 1/)
    expect(/** @type {Error} */ (thrown).message).toMatch(/Cylinder 1/)
    expect(serializeProject(document)).toBe(before)
  })

  it('delete-and-keep-values leaves the literals the bindings resolved to, in one Undo step', () => {
    const document = twoBound()
    setVariable(document, 'wall', 4, LOCAL)
    const shape = shapeOf(document)
    deleteVariable(document, 'wall', LOCAL, { keepValues: true })
    expect(readVariables(document.entries).variables.size).toBe(0)
    expect(document.entries.some((entry) => entry.record.op === VARIABLE_OP)).toBe(false)
    expect(document.recordOf('cube-1')?.params?.size).toEqual([4, 20, 10])
    expect(document.recordOf('cyl-1')?.params?.height).toBe(4)
    expectSameShape(shapeOf(document), shape)

    document.undo()
    expect(readVariables(document.entries).variables.get('wall')?.value).toBe(4)
    expect(document.recordOf('cube-1')?.params?.size[0]).toEqual({ $var: 'wall' })
    expectSameShape(shapeOf(document), shape)
  })

  it('an unused variable deletes outright, and Undo brings it back', () => {
    const document = createDocument()
    defineVariable(document, wallVar(), LOCAL)
    deleteVariable(document, 'wall', LOCAL)
    expect(readVariables(document.entries).variables.size).toBe(0)
    document.undo()
    expect(readVariables(document.entries).variables.has('wall')).toBe(true)
  })

  it('bind and unbind go through the command layer, one step each', () => {
    const document = createDocument()
    defineVariable(document, wallVar({ value: 3 }), LOCAL)
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [8, 20, 10] } }, LOCAL)
    bindParam(document, 'cube-1', 'size.0', 'wall', LOCAL)
    expect(document.recordOf('cube-1')?.params?.size).toEqual([{ $var: 'wall' }, 20, 10])
    expect(sizeOf(document, 'cube-1')[0]).toBeCloseTo(3, 6)
    unbindParam(document, 'cube-1', 'size.0', LOCAL)
    expect(document.recordOf('cube-1')?.params?.size).toEqual([3, 20, 10])
    document.undo()
    document.undo()
    expect(document.recordOf('cube-1')?.params?.size).toEqual([8, 20, 10])
  })
})

// --- definitions ---------------------------------------------------------------------

describe('variable definitions — names, kinds and limits', () => {
  it.each([
    ['__proto__', /name/],
    ['constructor', /name/],
    ['', /name/],
    ['a'.repeat(VARIABLE_LIMITS.maxNameLength + 1), /40|long/],
    ['2wall', /name/],
    ['wall-thickness', /name/],
  ])('refuses the name %j', (name, pattern) => {
    expect(variableDefinitionError(wallVar({ name }))).toMatch(pattern)
  })

  it('accepts a 40-character identifier', () => {
    expect(variableDefinitionError(wallVar({ name: 'a'.repeat(VARIABLE_LIMITS.maxNameLength) }))).toBeNull()
  })

  it.each([
    ['an unknown kind', { name: 'x', kind: 'string', value: 'hi' }],
    ['an empty enum', { name: 'x', kind: 'enum', value: 1, options: [] }],
    ['an enum value outside its options', { ...PI_MODEL, value: 7 }],
    ['too many options', { name: 'x', kind: 'enum', value: 0, options: Array.from({ length: VARIABLE_LIMITS.maxOptions + 1 }, (_, i) => ({ value: i, label: String(i) })) }],
    ['a number below min', wallVar({ value: 0 })],
    ['a number above max', wallVar({ value: 11 })],
    ['min above max', wallVar({ min: 5, max: 4, value: 5 })],
    ['a NaN', wallVar({ value: Number.NaN })],
    ['an unknown unit', wallVar({ unit: 'in' })],
    ['a boolean with a number value', { name: 'x', kind: 'boolean', value: 1 }],
    ['a value that is itself a binding', wallVar({ value: { $var: 'wall' } })],
  ])('refuses %s', (_label, definition) => {
    expect(variableDefinitionError(definition)).not.toBeNull()
  })

  it('names are unique case-sensitively: wall and Wall coexist, a second wall is refused', () => {
    const document = createDocument()
    defineVariable(document, wallVar(), LOCAL)
    defineVariable(document, wallVar({ name: 'Wall' }), LOCAL)
    expect(() => defineVariable(document, wallVar(), LOCAL)).toThrow(/already/)
    const { variables, problems } = readVariables(
      entriesOf([varRecord(wallVar(), 'v1'), varRecord(wallVar({ value: 3 }), 'v2')]),
    )
    expect(variables.get('wall')?.value).toBe(2)
    expect(problems.get('v2')).toMatch(/already/)
  })

  it('setVariable refuses a value outside the variable\'s own range, and changes nothing', () => {
    const document = createDocument()
    defineVariable(document, wallVar(), LOCAL)
    const before = serializeProject(document)
    expect(() => setVariable(document, 'wall', 50, LOCAL)).toThrow(/between|max|10/)
    expect(() => setVariable(document, 'nope', 3, LOCAL)).toThrow(/nope/)
    expect(serializeProject(document)).toBe(before)
  })
})

// --- resolution: degenerate and hostile ---------------------------------------------

describe('resolveParams / resolveRecord — degenerate and hostile bindings', () => {
  const variables = readVariables(
    entriesOf([
      varRecord(wallVar()),
      varRecord({ name: 'flag', kind: 'boolean', value: true }),
      varRecord({ ...PI_MODEL }),
    ]),
  ).variables

  it('returns the very same params object when nothing is bound', () => {
    const params = { size: [1, 2, 3] }
    expect(resolveParams(params, variables).params).toBe(params)
    const record = { id: 'c', op: 'primitive.cuboid', params }
    expect(resolveRecord(record, variables).record).toBe(record)
  })

  it('resolves a whole value and an array element', () => {
    const { params, errors } = resolveParams({ height: { $var: 'wall' }, size: [{ $var: 'wall' }, 3] }, variables)
    expect(errors).toEqual([])
    expect(params).toEqual({ height: 2, size: [2, 3] })
  })

  it('reports an unbound name by variable and param', () => {
    const { errors } = resolveParams({ height: { $var: 'nope' } }, variables)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ name: 'nope', path: 'height' })
    expect(errors[0].reason).toMatch(/not defined/)
  })

  it('refuses `$var` with sibling keys, and a `$var` that is not a name', () => {
    expect(resolveParams({ height: { $var: 'wall', fallback: 3 } }, variables).errors[0].reason).toMatch(/only/)
    expect(resolveParams({ height: { $var: 7 } }, variables).errors).toHaveLength(1)
  })

  it('refuses a binding nested deeper than one array element', () => {
    expect(resolveParams({ slices: [{ zMm: { $var: 'wall' } }] }, variables).errors[0].reason).toMatch(/whole param|element/)
  })

  it('a hostile param key (`a.b`, `__proto__`) resolves as an own field, never a path or the prototype', () => {
    const params = JSON.parse('{"a.b": {"$var": "wall"}, "__proto__": {"$var": "wall"}, "size": [{"$var": "wall"}, 1]}')
    const { params: resolved, errors } = resolveParams(params, variables)
    expect(errors).toEqual([])
    expect(Object.getPrototypeOf(resolved)).toBe(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(resolved, '__proto__')?.value).toBe(2)
    expect(resolved['a.b']).toBe(2)
    expect(resolved.size).toEqual([2, 1])
    expect(params.size[0]).toEqual({ $var: 'wall' }) // the record's own params are never mutated
  })

  it('a name of __proto__ never reaches Object.prototype', () => {
    const { errors } = resolveParams({ height: { $var: '__proto__' } }, variables)
    expect(errors[0].reason).toMatch(/not defined/)
  })

  /**
   * @param {OpRecord} record
   * @returns {string[]}
   */
  const errorsOf = (record) => resolveRecord(record, variables).errors

  it('wrong kind: a boolean into a number param, a number into an enum, an enum into an array element', () => {
    expect(errorsOf({ id: 'b', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm3 socket', length: { $var: 'flag' } } })[0]).toMatch(/flag.*boolean|yes\/no|number/)
    expect(errorsOf({ id: 'b', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: { $var: 'wall' }, length: 10 } })[0]).toMatch(/wall/)
    expect(errorsOf({ id: 'c', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [{ $var: 'flag' }, 2, 2] } })[0]).toMatch(/Cube 1.*size/)
  })

  it('a value at or below the param\'s exclusiveMin is reported, not passed on', () => {
    const zero = readVariables(entriesOf([varRecord({ name: 'len', kind: 'number', value: 0, unit: 'mm' })])).variables
    const [error] = resolveRecord({ id: 'b', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm3 socket', length: { $var: 'len' } } }, zero).errors
    expect(error).toMatch(/Bolt 1/)
    expect(error).toMatch(/len/)
    expect(error).toMatch(/greater than 0/)
  })

  it('an enum value the param does not offer is reported', () => {
    const odd = readVariables(entriesOf([varRecord({ name: 'm', kind: 'enum', value: 9, options: [{ value: 9, label: 'Nine' }] })])).variables
    expect(resolveRecord({ id: 'p', op: 'raspberrypi.bplus', name: 'Pi', params: { model: { $var: 'm' } } }, odd).errors[0]).toMatch(/9/)
  })

  it.each([
    ['a boolean (union) row', { id: 'u', op: 'boolean.union', consumes: ['a', 'b'], target: 'a', operands: ['b'], params: { x: { $var: 'wall' } } }, /no params|operands/],
    ['a group row', { id: 'g', op: 'group.assemble', consumes: ['a', 'b'], target: 'a', operands: ['b'], params: { names: [{ $var: 'wall' }] } }, /no params|operands/],
    ['a transform.rotate row', { id: 't', op: 'transform.rotate', target: 'a', supersedes: 'a', params: { angles: [{ $var: 'wall' }, 0, 0], center: [0, 0, 0], rotation: [0, 0, 0] } }, /rotat/],
    ['rotation on a translate row', { id: 't', op: 'transform.translate', target: 'a', supersedes: 'a', params: { vector: [0, 0, 0], rotation: [{ $var: 'wall' }, 0, 0] } }, /rotation/],
    ['an undescribed composite', { id: 'h', op: 'raspberrypi.hat', name: 'HAT', params: { thickness: { $var: 'wall' } } }, /raspberrypi\.hat/],
    ['a variable bound to itself', { id: 'v', op: VARIABLE_OP, params: { name: 'wall', kind: 'number', value: { $var: 'wall' } } }, /variable/],
  ])('refuses a binding in %s, with a reason', (_label, record, pattern) => {
    const errors = errorsOf(/** @type {any} */ (record))
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(pattern)
  })
})

describe('in a document — an unresolvable binding is a broken row, named, never a guess', () => {
  it.each([
    ['an unbound name', { size: [{ $var: 'nope' }, 5, 5] }, /nope/],
    ['a wrong kind', { size: [{ $var: 'flag' }, 5, 5] }, /flag/],
    ['$var with sibling keys', { size: [{ $var: 'wall', or: 3 }, 5, 5] }, /only/],
  ])('%s', (_label, params, pattern) => {
    const document = createDocument()
    document.loadEntries(
      entriesOf([
        varRecord(wallVar()),
        varRecord({ name: 'flag', kind: 'boolean', value: true }),
        { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params },
        { id: 'cube-2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [5, 5, 5] } },
      ]),
    )
    const [step] = document.brokenSteps()
    expect(step.id).toBe('cube-1')
    expect(step.reason).toMatch(pattern)
    expect(step.reason).toMatch(/Cube 1/)
    // The body is out of the fold; its neighbour is not.
    expect(document.bodies().map((body) => body.id)).toEqual(['cube-2'])
  })

  it('a `$var` in a record whose op takes no params is a broken row, not a crash', () => {
    const document = createDocument()
    document.loadEntries(
      entriesOf([
        varRecord(wallVar()),
        { id: 'a', op: 'primitive.cuboid', name: 'A', params: { size: [5, 5, 5] } },
        { id: 'b', op: 'primitive.cuboid', name: 'B', params: { size: [5, 5, 5], center: [2, 0, 0] } },
        { id: 'u', op: 'boolean.union', name: 'Union 1', target: 'a', operands: ['b'], consumes: ['a', 'b'], params: { x: { $var: 'wall' } } },
      ]),
    )
    expect(document.brokenSteps().map((step) => step.id)).toEqual(['u'])
  })

  it('an invalid variable definition in a loaded log is a broken row, and its consumers are too', () => {
    const document = createDocument()
    document.loadEntries(
      entriesOf([
        varRecord({ name: 'wall', kind: 'enum', value: 1, options: [] }),
        { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [{ $var: 'wall' }, 5, 5] } },
      ]),
    )
    expect(document.brokenSteps().map((step) => step.id)).toEqual(['var-wall', 'cube-1'])
  })

  it('timeline labels a definition by its name', () => {
    const document = createDocument()
    defineVariable(document, wallVar(), LOCAL)
    expect(document.timeline()[0].label).toBe('Define wall')
  })

  it('a variable record survives save and reload byte-identically', () => {
    const document = piCase({ bound: true })
    setVariable(document, 'piModel', 5, LOCAL)
    const text = serializeProject(document)
    const parsed = parseProject(text)
    expect(parsed.warnings).toEqual([])
    const reloaded = createDocument()
    reloaded.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, { merge: parsed.merge })
    expect(serializeProject(reloaded)).toBe(text)
    expectSameShape(shapeOf(reloaded), shapeOf(document))
  })
})

// --- bindableParams ---------------------------------------------------------------------

describe('bindableParams — what the bind control may offer, read from the registry', () => {
  /** @param {string} op @param {Record<string, any>} params */
  const paths = (op, params) => bindableParams(op, params).map((slot) => `${slot.path}:${slot.kind}`)

  it('a cuboid offers each size element (number) and each centre element; never segments', () => {
    expect(paths('primitive.cuboid', { size: [1, 2, 3], center: [0, 0, 0], segments: 8 })).toEqual([
      'size.0:number',
      'size.1:number',
      'size.2:number',
      'center.0:number',
      'center.1:number',
      'center.2:number',
    ])
  })

  it('a bolt offers its schema: spec (enum), length (number, > 0), fit (enum, following spec)', () => {
    const slots = bindableParams('hardware.bolt', { spec: 'm3 socket', length: 10, fit: 'close' })
    expect(slots.map((slot) => `${slot.path}:${slot.kind}`)).toEqual(['spec:enum', 'length:number', 'fit:enum'])
    expect(slots.find((slot) => slot.path === 'length')?.exclusiveMin).toBe(0)
    expect(slots.find((slot) => slot.path === 'fit')?.dependsOn).toEqual(['spec'])
  })

  it('a new-shape bolt offers type, spec, length and fit; fit follows type and spec, spec follows type (TODO/core-060)', () => {
    const slots = bindableParams('hardware.bolt', { type: 'flat', spec: 'm3', length: 10, fit: 'close' })
    expect(slots.map((slot) => `${slot.path}:${slot.kind}`)).toEqual(['type:enum', 'spec:enum', 'length:number', 'fit:enum'])
    expect(slots.find((slot) => slot.path === 'fit')?.dependsOn).toEqual(['type', 'spec'])
    expect(slots.find((slot) => slot.path === 'spec')?.dependsOn).toEqual(['type'])
    expect(slots.find((slot) => slot.path === 'type')?.dependsOn).toBeUndefined()
  })

  it('a described composite offers a boolean literal too', () => {
    expect(paths('raspberrypi.cameraModule', { model: 'hq', flipTripodMount: false })).toEqual(['model:enum', 'flipTripodMount:boolean'])
  })

  it('a translate row offers its vector but never its absolute rotation', () => {
    expect(paths('transform.translate', { vector: [1, 0, 0], rotation: [0, 0, 0] })).toEqual(['vector.0:number', 'vector.1:number', 'vector.2:number'])
  })

  it.each([
    ['transform.rotate', { angles: [0, 0, 90], center: [0, 0, 0], rotation: [0, 0, 90] }],
    ['group.assemble', { names: ['A', 'B'] }],
    ['boolean.union', {}],
    ['raspberrypi.hat', {}],
    ['asset.image', { mime: 'image/png' }],
    [VARIABLE_OP, { name: 'x', kind: 'number', value: 1 }],
  ])('%s offers nothing', (op, params) => {
    expect(bindableParams(op, params)).toEqual([])
  })

  it('bindParam refuses a slot bindableParams does not offer, and a kind that does not fit', () => {
    const document = createDocument()
    defineVariable(document, wallVar(), LOCAL)
    defineVariable(document, { name: 'flag', kind: 'boolean', value: true }, LOCAL)
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [8, 20, 10] } }, LOCAL)
    document.append({ id: 'cube-1-move', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [1, 0, 0], rotation: [0, 0, 0] } }, LOCAL)
    expect(() => bindParam(document, 'cube-1-move', 'rotation.0', 'wall', LOCAL)).toThrow(/rotation/)
    expect(() => bindParam(document, 'cube-1', 'size.0', 'flag', LOCAL)).toThrow(/flag/)
    expect(() => bindParam(document, 'cube-1', 'size.0', 'nope', LOCAL)).toThrow(/nope/)
  })
})

describe('create-and-bind is one Undo step (TODO/ui-059)', () => {
  /** @returns {WarpDocument} */
  const piDocument = () => {
    const document = createDocument()
    document.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } }, LOCAL)
    return document
  }

  it('document.batch(define; bind) is one Undo step (TODO/core-056), bindParamToNewVariable the direct route', () => {
    const document = piDocument()
    const depth = document.canUndo()
    document.batch(() => {
      defineVariable(document, PI_MODEL, LOCAL)
      bindParam(document, 'pi-1', 'model', 'piModel', LOCAL)
    })
    expect(document.recordOf('pi-1')?.params?.model).toEqual({ $var: 'piModel' })
    document.undo()
    // Both went: the field is a literal again and the variable is gone.
    expect(document.recordOf('pi-1')?.params?.model).toBe(4)
    expect(readVariables(document.entries).variables.has('piModel')).toBe(false)
    expect(document.canUndo()).toBe(depth)
    document.redo()
    expect(document.recordOf('pi-1')?.params?.model).toEqual({ $var: 'piModel' })
    expect(readVariables(document.entries).variables.get('piModel')?.value).toBe(4)
  })

  it('bindParamToNewVariable defines and binds in one step, and one Undo takes both back', () => {
    const document = piDocument()
    const depth = document.canUndo()
    bindParamToNewVariable(document, 'pi-1', 'model', PI_MODEL, LOCAL)
    expect(document.recordOf('pi-1')?.params?.model).toEqual({ $var: 'piModel' })
    expect(readVariables(document.entries).variables.get('piModel')?.value).toBe(4)
    expect(document.pendingUndo()?.label).toMatch(/piModel/)

    document.undo()
    expect(document.recordOf('pi-1')?.params?.model).toBe(4)
    expect(readVariables(document.entries).variables.has('piModel')).toBe(false)
    expect(document.canUndo()).toBe(depth)

    document.redo()
    expect(document.recordOf('pi-1')?.params?.model).toEqual({ $var: 'piModel' })
    expect(readVariables(document.entries).variables.get('piModel')?.value).toBe(4)
  })

  it('the new variable drives the body: setVariable re-folds it', () => {
    const document = piDocument()
    bindParamToNewVariable(document, 'pi-1', 'model', PI_MODEL, LOCAL)
    const before = boundsOf(document.bodies()[0].geometry)
    setVariable(document, 'piModel', 5, LOCAL)
    expect(boundsOf(document.bodies()[0].geometry)).not.toEqual(before)
  })

  it('a refusal writes nothing: a taken name, a kind that does not fit, a slot not offered', () => {
    const document = piDocument()
    defineVariable(document, PI_MODEL, LOCAL)
    const entries = document.entries.length
    expect(() => bindParamToNewVariable(document, 'pi-1', 'model', PI_MODEL, LOCAL)).toThrow(/already defined/)
    expect(() =>
      bindParamToNewVariable(document, 'pi-1', 'model', { name: 'flag', kind: 'boolean', value: true }, LOCAL),
    ).toThrow(/flag/)
    expect(() => bindParamToNewVariable(document, 'pi-1', 'nope', wallVar(), LOCAL)).toThrow(/nope/)
    expect(document.entries).toHaveLength(entries)
    expect(document.recordOf('pi-1')?.params?.model).toBe(4)
  })
})

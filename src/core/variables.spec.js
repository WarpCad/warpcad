// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LOCAL } from './__fixtures__/piScenes.js'
import { createDocument } from './document.js'
import { variableImpactOf } from './dependents.js'
import { FORMULA_LIMITS } from './formula.js'
import { describeSelection } from './inspector.js'
import { boundsOf, hiddenNamesOf, isGroup, volumeOf } from './kernel/group.js'
import { parseProject, serializeProject } from './project.js'
import { resetUserParts, setLibraryParts } from './userPart.js'
import {
  FORMULA_OP,
  VARIABLE_LIMITS,
  VARIABLE_OP,
  VariableError,
  VariableInUseError,
  bindParam,
  bindParamToNewFormula,
  bindParamToNewVariable,
  bindableParams,
  consumersOf,
  defineFormula,
  defineVariable,
  deleteVariable,
  displayFormulaOf,
  evaluateFormulaIn,
  formulaReadsOf,
  readVariables,
  renameVariable,
  resolveParams,
  resolveRecord,
  setFormula,
  setVariable,
  unbindParam,
  variableDefinitionError,
  variablesOf,
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
    ['group.merge', { members: [{}, { prefix: 'x', hidden: true }] }],
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

// =====================================================================================
// `TODO/FIND-core-078` part 2 — calculated variables in the fold (`var.derive`).
//
// Kernel real, plain Node. Geometry at 1e-6 mm (precision 6). A formula is evaluated at each row
// that binds it, against the bodies as they stand just above that row.
// =====================================================================================

/**
 * @param {string} id
 * @param {string} name
 * @param {any[]} size Millimetres, or bindings.
 * @param {number[]} [center]
 * @returns {OpRecord}
 */
const cuboid = (id, name, size, center = [0, 0, size[2] / 2]) => ({ id, op: 'primitive.cuboid', name, params: { size, center } })

/** @param {readonly object[]} records @returns {string} One record per line, no state line. */
const ndjsonOf = (records) => `${records.map((record) => JSON.stringify(record)).join('\n')}\n`

/** @param {Record<string, any>} params @param {string} [id] */
const formulaRecord = (params, id = `var-${params.name}`) => ({ id, op: FORMULA_OP, params })

/** @param {WarpDocument} document @param {string} name */
const formulaOf = (document, name) => variablesOf(document).find((variable) => variable.name === name)

/** @param {WarpDocument} document @param {string} name */
const formulaIdOf = (document, name) => /** @type {string} */ (formulaOf(document, name)?.id)

/** @param {WarpDocument} document @param {string} id */
const reasonOf = (document, id) => document.brokenSteps().find((step) => step.id === id)?.reason ?? ''

/**
 * The owner's request: two parts in a group, and a third cube placed after it.
 *
 * @returns {WarpDocument}
 */
function ownerScene() {
  const document = createDocument()
  document.append(cuboid('c1', 'Cube 1', [60, 20, 10], [0, 0, 5]), LOCAL)
  document.append(cuboid('c2', 'Cube 2', [40, 20, 10], [100, 0, 5]), LOCAL)
  document.append(
    { id: 'g', op: 'group.assemble', name: 'group1', target: 'c1', operands: ['c2'], consumes: ['c1', 'c2'], params: { names: ['part1', 'part2'] } },
    LOCAL,
  )
  document.append(cuboid('c', 'C', [10, 10, 10], [0, 60, 5]), LOCAL)
  return document
}

/**
 * Base, then C, then nothing else: the simplest "C reads Base" scene.
 *
 * @returns {WarpDocument}
 */
function baseThenC() {
  const document = createDocument()
  document.append(cuboid('base', 'Base', [40, 30, 10], [0, 0, 5]), LOCAL)
  document.append(cuboid('c', 'C', [10, 10, 10], [0, 60, 5]), LOCAL)
  return document
}

describe('calculated variables — the owner’s example, end to end (FIND-core-078)', () => {
  it('group1.part1.width - (group1.part2.width / 2) drives C, follows part1, and one Undo restores it', () => {
    const document = ownerScene()
    defineFormula(document, { name: 'overhang', formula: 'group1.part1.width - (group1.part2.width / 2)', unit: 'mm' }, LOCAL)
    const record = document.recordOf(formulaIdOf(document, 'overhang'))
    expect(record?.op).toBe(FORMULA_OP)
    // Stored by body id, never by name; nothing computed is stored.
    expect(record?.params).toEqual({ name: 'overhang', formula: '#g.part1.width - #g.part2.width / 2', unit: 'mm' })
    expect(formulaOf(document, 'overhang')?.value).toBeCloseTo(40, 6)
    expect(displayFormulaOf(document, /** @type {any} */ (formulaOf(document, 'overhang')))).toBe('group1.part1.width - group1.part2.width / 2')

    bindParam(document, 'c', 'size.0', 'overhang', LOCAL)
    expect(sizeOf(document, 'c')[0]).toBeCloseTo(40, 6)
    expect(document.boundValuesOf('c')).toEqual({ 'size.0': 40 })

    // part1's width, through the replace path.
    document.replaceRecord('c1', cuboid('c1', 'Cube 1', [80, 20, 10], [0, 0, 5]), LOCAL)
    expect(sizeOf(document, 'c')[0]).toBeCloseTo(60, 6)
    expect(formulaOf(document, 'overhang')?.value).toBeCloseTo(60, 6)
    expect(document.brokenSteps()).toEqual([])

    document.undo()
    expect(sizeOf(document, 'c')[0]).toBeCloseTo(40, 6)
    expect(formulaOf(document, 'overhang')?.value).toBeCloseTo(40, 6)
  })

  it('bindParamToNewFormula defines and binds as one Undo step', () => {
    const document = ownerScene()
    const depth = document.canUndo()
    bindParamToNewFormula(document, 'c', 'size.1', { name: 'half', formula: 'group1.part2.width / 2' }, LOCAL)
    expect(sizeOf(document, 'c')[1]).toBeCloseTo(20, 6)
    document.undo()
    expect(document.recordOf('c')?.params?.size).toEqual([10, 10, 10])
    expect(formulaOf(document, 'half')).toBeUndefined()
    expect(document.canUndo()).toBe(depth)
  })

  it('a timeline row reads "Calculate overhang"', () => {
    const document = ownerScene()
    defineFormula(document, { name: 'overhang', formula: '1 + 1' }, LOCAL)
    expect(document.timeline().at(-1)?.label).toBe('Calculate overhang')
  })

  it('defineFormula refuses a formula that cannot be used, and writes nothing', () => {
    const document = ownerScene()
    const length = document.entries.length
    expect(() => defineFormula(document, { name: 'x', formula: 'group1.part1.width +' }, LOCAL)).toThrow(VariableError)
    expect(() => defineFormula(document, { name: 'x', formula: 'nobody.width' }, LOCAL)).toThrow(/nobody/)
    expect(() => defineFormula(document, { name: 'x', formula: 'group1.fan.width' }, LOCAL)).toThrow(/part1, part2/)
    expect(() => defineFormula(document, { name: 'x', formula: '1 / 0' }, LOCAL)).toThrow(/division by zero/)
    expect(() => defineFormula(document, { name: 'x', formula: '5', min: 10 }, LOCAL)).toThrow(/10/)
    expect(document.entries).toHaveLength(length)
  })

  it('two bodies with one name are refused and listed', () => {
    const document = createDocument()
    document.append(cuboid('s1', 'Screw', [5, 5, 5]), LOCAL)
    document.append(cuboid('s2', 'Screw', [5, 5, 5], [20, 0, 2.5]), LOCAL)
    expect(() => defineFormula(document, { name: 'x', formula: 'Screw.width' }, LOCAL)).toThrow(/s1, s2/)
    defineFormula(document, { name: 'x', formula: '#s2.width' }, LOCAL)
    expect(formulaOf(document, 'x')?.value).toBeCloseTo(5, 6)
  })
})

describe('calculated variables — read at the consumer’s row', () => {
  it('place C, then define, then bind: works', () => {
    const document = baseThenC()
    defineFormula(document, { name: 'w', formula: 'Base.width / 2' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'w', LOCAL)
    expect(sizeOf(document, 'c')[0]).toBeCloseTo(20, 6)
  })

  it('a forward read is refused up front by bindParam, naming the step', () => {
    const document = createDocument()
    document.append(cuboid('c', 'C', [10, 10, 10]), LOCAL)
    document.append(cuboid('base', 'Base', [40, 30, 10], [0, 60, 5]), LOCAL)
    defineFormula(document, { name: 'w', formula: 'Base.width' }, LOCAL)
    expect(() => bindParam(document, 'c', 'size.0', 'w', LOCAL)).toThrow(/reads Base, which is not built until step 2/)
    expect(document.recordOf('c')?.params?.size).toEqual([10, 10, 10])
  })

  it('a body reading itself while it is being created is the same named refusal', () => {
    const document = baseThenC()
    defineFormula(document, { name: 'own', formula: 'C.height + 1' }, LOCAL)
    expect(() => bindParam(document, 'c', 'size.2', 'own', LOCAL)).toThrow(/reads C, which is not built until step 2/)
  })

  it('a later step reading its own body works (pitablet:76)', () => {
    const document = createDocument()
    document.append(cuboid('lcd', 'LCD', [20, 20, 4]), LOCAL)
    document.append({ id: 'grow', op: 'modify.enlarge', target: 'lcd', supersedes: 'lcd', params: { deltaMm: [0, 0, 0] } }, LOCAL)
    defineFormula(document, { name: 'fill', formula: '10 - LCD.height' }, LOCAL)
    bindParam(document, 'grow', 'deltaMm.2', 'fill', LOCAL)
    expect(sizeOf(document, 'lcd')[2]).toBeCloseTo(10, 6)
    expect(document.brokenSteps()).toEqual([])
  })

  it('a moveStep that turns a good read into a forward read leaves a named broken row, no crash', () => {
    const document = baseThenC()
    defineFormula(document, { name: 'w', formula: 'Base.width' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'w', LOCAL)
    document.moveStep('c', -1, LOCAL)
    expect(reasonOf(document, 'c')).toMatch(/reads Base, which is not built until step 2/)
    expect(reasonOf(document, 'c')).toMatch(/"w"/)
  })

  it('evaluateFormulaIn names what it reads — each body by id and current name, and each variable — and writes nothing', () => {
    const document = ownerScene()
    defineVariable(document, wallVar(), LOCAL)
    const before = JSON.stringify(document.entries)
    const result = evaluateFormulaIn(document, 'group1.part1.width - wall')
    expect(result.value).toBeCloseTo(58, 6)
    expect(result.stored).toBe('#g.part1.width - wall')
    expect(result.reads).toEqual({ variables: ['wall'], parts: [{ bodyId: 'g', body: 'group1', part: 'part1', quantity: 'width' }] })
    expect(JSON.stringify(document.entries)).toBe(before)
  })

  it('evaluateFormulaIn refuses an unknown `at` step by name, as a VariableError', () => {
    const document = ownerScene()
    expect(() => evaluateFormulaIn(document, '1 + 1', { at: 'nope' })).toThrow(VariableError)
    expect(() => evaluateFormulaIn(document, '1 + 1', { at: 'nope' })).toThrow(/no step "nope"/)
  })

  it('reads a hidden part; a body with no part is its visible parts', () => {
    const document = ownerScene()
    document.setPartHidden('g', 'part2', true, LOCAL)
    expect(evaluateFormulaIn(document, 'group1.part2.width').value).toBeCloseTo(40, 6)
    expect(evaluateFormulaIn(document, 'group1.width').value).toBeCloseTo(60, 6)
  })

  it('reads a consumed cutter as itself, never as the Subtract it went into', () => {
    const document = createDocument()
    document.append(cuboid('plate', 'Plate', [40, 40, 10]), LOCAL)
    document.append(cuboid('k', 'Cutter', [10, 10, 20]), LOCAL)
    document.append({ id: 'cut', op: 'boolean.subtract', name: 'Cut', target: 'plate', operands: ['k'], consumes: ['plate', 'k'] }, LOCAL)
    document.append(cuboid('c', 'C', [5, 5, 5], [0, 60, 2.5]), LOCAL)
    defineFormula(document, { name: 'hole', formula: 'Cutter.width' }, LOCAL)
    expect(document.currentIdOf('k')).toBe('cut') // currentIdOf walks through, deliberately
    bindParam(document, 'c', 'size.0', 'hole', LOCAL)
    expect(sizeOf(document, 'c')[0]).toBeCloseTo(10, 6)
    expect(sizeOf(document, 'cut')[0]).toBeCloseTo(40, 6)
  })

  it('reads a rotated part’s extent along world X', () => {
    const document = createDocument()
    document.append(cuboid('r', 'Rot', [10, 20, 5]), LOCAL)
    document.append({ id: 'r-rot', op: 'transform.rotate', target: 'r', supersedes: 'r', params: { angles: [0, 0, 90] } }, LOCAL)
    expect(evaluateFormulaIn(document, 'Rot.width').value).toBeCloseTo(20, 6)
    expect(evaluateFormulaIn(document, 'Rot.depth').value).toBeCloseTo(10, 6)
    expect(evaluateFormulaIn(document, 'Rot.center.x').value).toBeCloseTo(0, 6)
  })

  it('a deleted body is a named error, wherever the delete sits', () => {
    const document = baseThenC()
    defineFormula(document, { name: 'w', formula: 'Base.width' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'w', LOCAL)
    document.deleteBodies(['base'], LOCAL)
    expect(reasonOf(document, 'c')).toMatch(/reads Base, which has been deleted/)
  })

  it('a suppressed body is a named error', () => {
    const document = baseThenC()
    defineFormula(document, { name: 'w', formula: 'Base.width' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'w', LOCAL)
    document.setSuppressed('base', true, LOCAL)
    expect(reasonOf(document, 'c')).toMatch(/reads Base, which is suppressed/)
  })

  it('a body its condition leaves out is a named error', () => {
    const document = createDocument()
    defineVariable(document, { name: 'flag', kind: 'boolean', value: true }, LOCAL)
    document.append({ ...cuboid('base', 'Base', [40, 30, 10]), when: { var: 'flag', in: [true] } }, LOCAL)
    document.append(cuboid('c', 'C', [10, 10, 10], [0, 60, 5]), LOCAL)
    defineFormula(document, { name: 'w', formula: 'Base.width' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'w', LOCAL)
    setVariable(document, 'flag', false, LOCAL)
    expect(reasonOf(document, 'c')).toMatch(/reads Base, which its condition leaves out/)
  })

  it('a part a variant lost is a named error listing the parts it has', () => {
    const document = createDocument()
    defineVariable(document, PI_MODEL, LOCAL)
    document.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Pi', params: { model: { $var: 'piModel' } } }, LOCAL)
    document.append(cuboid('c', 'C', [10, 10, 10], [0, 120, 5]), LOCAL)
    defineFormula(document, { name: 'jack', formula: 'Pi.avjack.width' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'jack', LOCAL)
    expect(document.brokenSteps()).toEqual([])
    setVariable(document, 'piModel', 5, LOCAL)
    expect(reasonOf(document, 'c')).toMatch(/Pi has no part avjack — its parts are: .*mb/)
  })

  it('an empty body reads as a named error, never 0; so does a body that does not exist', () => {
    const document = createDocument()
    document.append(cuboid('a', 'A', [5, 5, 5], [0, 0, 0]), LOCAL)
    document.append(cuboid('b', 'B', [5, 5, 5], [50, 0, 0]), LOCAL)
    document.append({ id: 'x', op: 'boolean.intersect', name: 'Empty', target: 'a', operands: ['b'], consumes: ['a', 'b'] }, LOCAL)
    expect(() => evaluateFormulaIn(document, 'Empty.width')).toThrow(/reads Empty, which is empty — there is nothing to measure/)
    expect(() => evaluateFormulaIn(document, 'Empty.min.x')).toThrow(/is empty/)
    expect(() => evaluateFormulaIn(createDocument(), '#nobody.width')).toThrow(/there is no body #nobody/)
  })

  it('a rollback marker above the consumer: the consumer is inactive, the formula still has its value', () => {
    const document = baseThenC()
    defineFormula(document, { name: 'w', formula: 'Base.width' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'w', LOCAL)
    document.rollBackTo('base', LOCAL)
    expect(document.brokenSteps()).toEqual([])
    expect(document.bodies().map((body) => body.id)).toEqual(['base'])
    document.rollForward(LOCAL)
    expect(sizeOf(document, 'c')[0]).toBeCloseTo(40, 6)
  })

  it('a hostile result gets no further than a hostile literal or a var.define (Security item 8)', () => {
    // A count-like param (a gear's teeth) cannot be bound at all: gear.spur describes no params.
    expect(bindableParams('gear.spur', { teeth: 24, moduleMm: 2, thicknessMm: 8 })).toEqual([])
    // 1e9 into an undescribed op: the kernel receives the same number either way.
    const literal = createDocument()
    literal.append(cuboid('c', 'C', [1e9, 5, 5]), LOCAL)
    const bound = createDocument()
    defineFormula(bound, { name: 'many', formula: '1000 * 1000 * 1000' }, LOCAL)
    bound.append(cuboid('c', 'C', [{ $var: 'many' }, 5, 5]), LOCAL)
    expect(sizeOf(bound, 'c')).toEqual(sizeOf(literal, 'c'))
    // A value its slot refuses: the same named slot refusal a var.define gets.
    /** @param {(document: WarpDocument) => void} define */
    const boltWith = (define) => {
      const document = createDocument()
      define(document)
      document.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt', params: { spec: 'm3', length: { $var: 'len' } } }, LOCAL)
      return reasonOf(document, 'bolt')
    }
    const viaFormula = boltWith((document) => defineFormula(document, { name: 'len', formula: '0 - 5' }, LOCAL))
    const viaValue = boltWith((document) => defineVariable(document, { name: 'len', kind: 'number', value: -5 }, LOCAL))
    expect(viaFormula).toMatch(/must be greater than 0/)
    expect(viaFormula).toBe(viaValue)
  })
})

describe('calculated variables — a read taken before a later change is reported', () => {
  it('a later move reports max.z and not width; the chip uses the row’s value', () => {
    const document = baseThenC()
    document.append(cuboid('d', 'D', [10, 10, 10], [60, 60, 5]), LOCAL)
    defineFormula(document, { name: 'top', formula: 'Base.max.z' }, LOCAL)
    defineFormula(document, { name: 'w', formula: 'Base.width' }, LOCAL)
    bindParam(document, 'c', 'size.2', 'top', LOCAL)
    bindParam(document, 'd', 'size.0', 'w', LOCAL)
    document.append({ id: 'lift', op: 'transform.translate', target: 'base', supersedes: 'base', params: { vector: [0, 0, 5] } }, LOCAL)

    const results = document.formulaResults()
    expect(results.get('top')?.value).toBeCloseTo(15, 6)
    const [varies] = /** @type {any} */ (results.get('top')).varies
    expect(varies).toMatchObject({ recordId: 'c', path: 'size.2', atStep: 2 })
    expect(varies.valueMm).toBeCloseTo(10, 6)
    expect(varies.nowMm).toBeCloseTo(15, 6)
    expect(varies.changedAtStep).toBe(document.entries.findIndex((entry) => entry.record.id === 'lift') + 1)
    expect(varies.note).toMatch(/Reads Base before step \d+ .*changed it \(uses 10 mm, now 15 mm\)/)
    expect(results.get('w')?.varies).toEqual([])
    // C keeps the value its row read; the chip says so.
    expect(sizeOf(document, 'c')[2]).toBeCloseTo(10, 6)
    expect(document.boundValuesOf('c')).toEqual({ 'size.2': 10 })
    expect(formulaOf(document, 'top')?.varies).toHaveLength(1)
    // The Inspector's chip carries the row's value, not the end-of-log one.
    const { body } = describeSelection(document.bodies(), ['c'], { document })
    const size = /** @type {any} */ (body?.params.find((field) => field.key === 'size'))
    expect(size.components[2]).toMatchObject({ value: 10, bound: { name: 'top' } })
  })

  it('an upstream param edit reports nothing — the consumer simply follows', () => {
    const document = baseThenC()
    defineFormula(document, { name: 'top', formula: 'Base.max.z' }, LOCAL)
    bindParam(document, 'c', 'size.2', 'top', LOCAL)
    document.replaceRecord('base', cuboid('base', 'Base', [40, 30, 20], [0, 0, 10]), LOCAL)
    expect(sizeOf(document, 'c')[2]).toBeCloseTo(20, 6)
    expect(document.formulaResults().get('top')?.varies).toEqual([])
  })
})

describe('calculated variables — cycles, chains and budgets', () => {
  /** @param {OpRecord[]} records */
  const loaded = (records) => {
    const document = createDocument()
    document.loadEntries(entriesOf(records))
    return document
  }

  it.each([
    ['a → a', [formulaRecord({ name: 'a', formula: 'a + 1' })], /a → a/],
    ['a → b → a', [formulaRecord({ name: 'a', formula: 'b + 1' }), formulaRecord({ name: 'b', formula: 'a * 2' })], /a → b → a/],
    [
      'through three formulas',
      [formulaRecord({ name: 'a', formula: 'b' }), formulaRecord({ name: 'b', formula: 'c' }), formulaRecord({ name: 'c', formula: 'a' })],
      /a → b → c → a/,
    ],
  ])('a cycle %s is named, and a consumer says why', (_label, records, pattern) => {
    const document = loaded([...records, cuboid('c', 'C', [{ $var: 'a' }, 5, 5])])
    const { variables } = readVariables(document.entries)
    expect(variables.get('a')?.error).toMatch(pattern)
    expect(reasonOf(document, 'c')).toMatch(/bound to "a", whose formula can't be used/)
  })

  it('a chain past maxChainDepth is refused by name; one inside it works', () => {
    const records = [formulaRecord({ name: 'f0', formula: '1' })]
    for (let index = 1; index <= FORMULA_LIMITS.maxChainDepth + 1; index += 1) {
      records.push(formulaRecord({ name: `f${index}`, formula: `f${index - 1} + 1` }))
    }
    const { variables } = readVariables(entriesOf(records))
    expect(variables.get(`f${FORMULA_LIMITS.maxChainDepth - 1}`)?.value).toBe(FORMULA_LIMITS.maxChainDepth)
    expect(variables.get(`f${FORMULA_LIMITS.maxChainDepth + 1}`)?.error).toMatch(/32/)
  })

  it('doubling across 500 formulas finishes in linear time', () => {
    const records = [formulaRecord({ name: 'd0', formula: '1' })]
    // Past maxChainDepth on purpose: the chain error must cost nothing either.
    for (let index = 1; index < 500; index += 1) records.push(formulaRecord({ name: `d${index}`, formula: `d${index - 1} + d${index - 1}` }))
    const started = performance.now()
    const { variables } = readVariables(entriesOf(records))
    expect(performance.now() - started).toBeLessThan(500)
    expect(variables.get('d20')?.value).toBe(2 ** 20)
    expect(variables.get('d499')?.error).toMatch(/32/)
  })

  it('consumers past maxNodeVisitsPerFold load broken with the budget named, and the file still opens', () => {
    const ones = Array.from({ length: 120 }, () => '1').join(' + ')
    const records = [cuboid('base', 'Base', [40, 30, 10]), formulaRecord({ name: 'm0', formula: `#base.width + ${ones}` })]
    for (let index = 1; index < 32; index += 1) records.push(formulaRecord({ name: `m${index}`, formula: `m${index - 1} + ${ones}` }))
    for (let index = 0; index < 200; index += 1) records.push(cuboid(`c${index}`, `C${index}`, [{ $var: 'm31' }, 5, 5], [index * 10, 50, 2.5]))
    const document = loaded(records)
    const broken = document.brokenSteps()
    expect(broken.length).toBeGreaterThan(0)
    expect(broken.length).toBeLessThan(200)
    expect(broken.every((step) => /calculation budget/.test(step.reason))).toBe(true)
    expect(document.bodies().length).toBeGreaterThan(1)
  })

  it('formulas reading formulas reading parts: measured once per row, in order', () => {
    const document = baseThenC()
    defineFormula(document, { name: 'a', formula: 'Base.width' }, LOCAL)
    defineFormula(document, { name: 'b', formula: 'a / 4' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'b', LOCAL)
    expect(sizeOf(document, 'c')[0]).toBeCloseTo(10, 6)
    expect(formulaOf(document, 'b')).toMatchObject({ measuring: true })
  })
})

describe('calculated variables — the fold cache and repeats', () => {
  it('an unrelated edit leaves a formula-bound body’s geometry the very same object (core-031)', () => {
    const document = ownerScene()
    document.append(cuboid('u', 'Unrelated', [5, 5, 5], [300, 0, 2.5]), LOCAL)
    defineFormula(document, { name: 'overhang', formula: 'group1.part1.width - group1.part2.width / 2' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'overhang', LOCAL)
    const before = bodyOf(document, 'c').geometry
    document.replaceRecord('u', cuboid('u', 'Unrelated', [7, 7, 7], [300, 0, 3.5]), LOCAL)
    expect(bodyOf(document, 'c').geometry).toBe(before)
  })

  it('the memo keys on a formula’s value, not its text: renaming what it reads keeps the cache warm', () => {
    const document = baseThenC()
    defineVariable(document, wallVar({ value: 4 }), LOCAL)
    defineFormula(document, { name: 'w', formula: 'Base.width / wall' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'w', LOCAL)
    const before = bodyOf(document, 'c').geometry
    renameVariable(document, 'wall', 'thickness', LOCAL)
    expect(document.recordOf(formulaIdOf(document, 'w'))?.params?.formula).toBe('#base.width / thickness')
    expect(bodyOf(document, 'c').geometry).toBe(before)
  })

  /** A pin aligned to part1 of a three-part group: what a repeat replays onto part2 and part3. */
  function pinScene() {
    const document = createDocument()
    document.append(cuboid('c1', 'Cube 1', [60, 20, 10], [0, 0, 5]), LOCAL)
    document.append(cuboid('c2', 'Cube 2', [40, 20, 10], [100, 0, 5]), LOCAL)
    document.append(cuboid('c3', 'Cube 3', [40, 20, 10], [200, 0, 5]), LOCAL)
    document.append(
      { id: 'g', op: 'group.assemble', name: 'group1', target: 'c1', operands: ['c2', 'c3'], consumes: ['c1', 'c2', 'c3'], params: { names: ['part1', 'part2', 'part3'] } },
      LOCAL,
    )
    document.append(cuboid('pin', 'Pin', [4, 4, 4], [0, 50, 2]), LOCAL)
    document.append({ id: 'pin-al', op: 'group.align', target: 'pin', supersedes: 'pin', operands: [{ id: 'g', pieces: 'part1' }], params: { axes: 'xy', deltaMm: 0 } }, LOCAL)
    // A step after the seed-referencing one: the member re-runs it, binding and all.
    document.append({ id: 'pin-grow', op: 'modify.enlarge', target: 'pin-al', supersedes: 'pin-al', params: { deltaMm: [0, 0, 0] } }, LOCAL)
    return document
  }
  const repeatRecord = { id: 'rep', op: 'pattern.repeat', params: { source: 'pin', seed: { id: 'g', pieces: 'part1' }, targets: ['part2', 'part3'] } }

  it('a repeated step bound to a plain formula replays it', () => {
    const document = pinScene()
    defineFormula(document, { name: 'pinSize', formula: '2 + 3' }, LOCAL)
    bindParam(document, 'pin-grow', 'deltaMm.0', 'pinSize', LOCAL)
    document.append(repeatRecord, LOCAL)
    const rep = /** @type {any} */ (bodyOf(document, 'rep').geometry)
    const [min, max] = boundsOf(rep.parts.part2)
    expect(max[0] - min[0]).toBeCloseTo(9, 6)
  })

  it('a repeated step bound to a measuring formula is refused by name (v1)', () => {
    const document = pinScene()
    defineFormula(document, { name: 'pinSize', formula: 'group1.part1.depth / 4' }, LOCAL)
    bindParam(document, 'pin-grow', 'deltaMm.0', 'pinSize', LOCAL)
    expect(sizeOf(document, 'pin')[0]).toBeCloseTo(9, 6)
    expect(() => document.append(repeatRecord, LOCAL)).toThrow(/pinSize.*measures parts|measures parts.*pinSize/)
  })
})

describe('calculated variables — rename, delete, impact', () => {
  /** wall (a number), f = wall * 2 bound to Cube 1, g = wall + 1 on a suppressed row. */
  function wallScene() {
    const document = createDocument()
    defineVariable(document, wallVar(), LOCAL)
    document.append(cuboid('cube-1', 'Cube 1', [10, 20, 10]), LOCAL)
    defineFormula(document, { name: 'f', formula: 'wall * 2' }, LOCAL)
    defineFormula(document, { name: 'g', formula: 'wall + 1' }, LOCAL)
    bindParam(document, 'cube-1', 'size.0', 'f', LOCAL)
    document.setSuppressed(formulaIdOf(document, 'g'), true, LOCAL)
    return document
  }

  it('consumersOf names a formula that reads the variable, kind "formula"', () => {
    const document = wallScene()
    const fId = formulaIdOf(document, 'f')
    expect(consumersOf(document.entries, 'wall')).toEqual(
      expect.arrayContaining([expect.objectContaining({ recordId: fId, kind: 'formula', name: 'f' })]),
    )
    expect(consumersOf(document.entries, 'f')).toEqual([expect.objectContaining({ recordId: 'cube-1', kind: 'binding', path: 'size.0' })])
  })

  it('renameVariable rewrites formula trees too, suppressed rows included, as one Undo step', () => {
    const document = wallScene()
    const gId = /** @type {string} */ (document.entries.find((entry) => entry.record.params?.name === 'g')?.record.id)
    renameVariable(document, 'wall', 'thickness', LOCAL)
    expect(document.recordOf(formulaIdOf(document, 'f'))?.params?.formula).toBe('thickness * 2')
    expect(document.recordOf(gId)?.params?.formula).toBe('thickness + 1')
    expect(sizeOf(document, 'cube-1')[0]).toBeCloseTo(4, 6)
    document.undo()
    expect(document.recordOf(formulaIdOf(document, 'f'))?.params?.formula).toBe('wall * 2')
    expect(document.recordOf(gId)?.params?.formula).toBe('wall + 1')
  })

  it('renaming a formula renames its bindings and the formulas that read it', () => {
    const document = wallScene()
    defineFormula(document, { name: 'h', formula: 'f + 1' }, LOCAL)
    renameVariable(document, 'f', 'doubled', LOCAL)
    expect(document.recordOf('cube-1')?.params?.size[0]).toEqual({ $var: 'doubled' })
    expect(document.recordOf(formulaIdOf(document, 'h'))?.params?.formula).toBe('doubled + 1')
    expect(document.brokenSteps()).toEqual([])
  })

  it('renaming a body costs nothing: the formula stores its id and shows the new name', () => {
    const document = baseThenC()
    defineFormula(document, { name: 'w', formula: 'Base.width' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'w', LOCAL)
    document.renameBody('base', 'Plate', LOCAL)
    expect(document.recordOf(formulaIdOf(document, 'w'))?.params?.formula).toBe('#base.width')
    expect(displayFormulaOf(document, /** @type {any} */ (formulaOf(document, 'w')))).toBe('Plate.width')
    expect(sizeOf(document, 'c')[0]).toBeCloseTo(40, 6)
  })

  it('deleteVariable without keepValues lists the formula that reads it', () => {
    const document = wallScene()
    let thrown
    try {
      deleteVariable(document, 'wall', LOCAL)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(VariableInUseError)
    expect(/** @type {VariableInUseError} */ (thrown).consumers.map((consumer) => consumer.kind)).toEqual(['formula', 'formula'])
    expect(/** @type {Error} */ (thrown).message).toMatch(/\bf\b/)
  })

  it('deleteVariable with keepValues writes the value into each formula, suppressed rows included, as one Undo step', () => {
    const document = wallScene()
    const gId = /** @type {string} */ (document.entries.find((entry) => entry.record.params?.name === 'g')?.record.id)
    deleteVariable(document, 'wall', LOCAL, { keepValues: true })
    expect(document.recordOf(formulaIdOf(document, 'f'))?.params?.formula).toBe('2 * 2')
    expect(document.recordOf(gId)?.params?.formula).toBe('2 + 1')
    expect(sizeOf(document, 'cube-1')[0]).toBeCloseTo(4, 6)
    document.undo()
    expect(document.recordOf(formulaIdOf(document, 'f'))?.params?.formula).toBe('wall * 2')
    expect(readVariables(document.entries).variables.has('wall')).toBe(true)
  })

  it('deleting a formula with keepValues turns its bindings into the values each row used', () => {
    const document = baseThenC()
    defineFormula(document, { name: 'w', formula: 'Base.width / 4' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'w', LOCAL)
    deleteVariable(document, 'w', LOCAL, { keepValues: true })
    expect(document.recordOf('c')?.params?.size).toEqual([10, 10, 10])
    expect(formulaOf(document, 'w')).toBeUndefined()
    document.undo()
    expect(document.recordOf('c')?.params?.size[0]).toEqual({ $var: 'w' })
  })

  it('setVariable on a formula is refused, naming setFormula; setFormula changes it as one step', () => {
    const document = wallScene()
    expect(() => setVariable(document, 'f', 5, LOCAL)).toThrow(/setFormula/)
    setFormula(document, 'f', 'wall * 3', LOCAL)
    expect(sizeOf(document, 'cube-1')[0]).toBeCloseTo(6, 6)
    document.undo()
    expect(sizeOf(document, 'cube-1')[0]).toBeCloseTo(4, 6)
  })

  it('the impact check is transitive: shrinking wall breaks a formula-bound cube, named before commit', () => {
    const document = createDocument()
    defineVariable(document, wallVar({ value: 5 }), LOCAL)
    document.append(cuboid('cube-1', 'Cube 1', [10, 20, 10]), LOCAL)
    document.append({ id: 'mv', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [1, 0, 0] } }, LOCAL)
    defineFormula(document, { name: 'gap', formula: 'wall - 3' }, LOCAL)
    bindParam(document, 'cube-1', 'size.0', 'gap', LOCAL)
    const { breakages, consumers } = variableImpactOf(document, 'wall', 3)
    expect(consumers.map((consumer) => consumer.recordId)).toEqual(expect.arrayContaining(['cube-1']))
    expect(breakages.map((breakage) => breakage.dependentRecordId)).toEqual(expect.arrayContaining(['mv']))
    expect(document.recordOf(formulaIdOf(document, 'gap'))?.params?.formula).toBe('wall - 3')
  })

  it('formulaReadsOf lists the formulas that measure a body, and what binds them', () => {
    const document = baseThenC()
    defineFormula(document, { name: 'w', formula: 'Base.width' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'w', LOCAL)
    expect(formulaReadsOf(document, 'base')).toEqual([expect.objectContaining({ name: 'w', consumers: [expect.objectContaining({ recordId: 'c' })] })])
    expect(formulaReadsOf(document, 'c')).toEqual([])
  })
})

describe('calculated variables — load, merge and hostile files', () => {
  it('a var.derive line round-trips byte-identically', () => {
    const document = ownerScene()
    defineFormula(document, { name: 'overhang', formula: 'group1.part1.width - (group1.part2.width / 2)', unit: 'mm', label: 'Overhang' }, LOCAL)
    bindParam(document, 'c', 'size.0', 'overhang', LOCAL)
    const text = serializeProject(document)
    const parsed = parseProject(text)
    expect(parsed.warnings).toEqual([])
    const reloaded = createDocument()
    reloaded.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, { merge: parsed.merge })
    expect(serializeProject(reloaded)).toBe(text)
    expect(sizeOf(reloaded, 'c')[0]).toBeCloseTo(40, 6)
  })

  it('a malformed, over-cap or cyclic formula is a named load warning, never a refused file', () => {
    const lines = [
      cuboid('c1', 'C1', [{ $var: 'bad' }, 5, 5]),
      { id: 'u1', op: 'transform.translate', target: 'c1', supersedes: 'c1', params: { vector: [1, 0, 0] } },
      cuboid('c2', 'C2', [{ $var: 'loopy' }, 5, 5], [20, 0, 2.5]),
      cuboid('c3', 'C3', [{ $var: 'huge' }, 5, 5], [40, 0, 2.5]),
      cuboid('ok', 'OK', [5, 5, 5], [60, 0, 2.5]),
      formulaRecord({ name: 'bad', formula: '1 +' }),
      formulaRecord({ name: 'loopy', formula: 'loopy * 2' }),
      formulaRecord({ name: 'huge', formula: '1'.repeat(FORMULA_LIMITS.maxLength + 1) }),
      formulaRecord({ name: 'tree', formula: '1', tree: { type: 'number', value: 1 } }),
    ]
    const parsed = parseProject(ndjsonOf(lines))
    const messages = parsed.warnings.map((warning) => warning.message).join('\n')
    expect(messages).toMatch(/"bad"/)
    expect(messages).toMatch(/"loopy".*loopy → loopy/)
    expect(messages).toMatch(/"huge"/)
    expect(messages).toMatch(/"tree".*unknown field/)
    const document = createDocument()
    document.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, { merge: parsed.merge })
    expect(document.bodies().map((body) => body.id)).toEqual(['ok'])
  })

  it('e2e/fixtures/hostile-formula.ndjson (scenario 8 step 7) opens: every problem named, the rest intact, nothing run', () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort()
    const text = readFileSync(join(process.cwd(), 'e2e/fixtures/hostile-formula.ndjson'), 'utf-8')
    const parsed = parseProject(text)
    const document = createDocument()
    document.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, { merge: parsed.merge })
    // The plate and the block bound to the good formula build; the cube bound to the loop is broken by name.
    expect(document.bodies().map((body) => body.id).sort()).toEqual(['block-2', 'plate-1'])
    expect(sizeOf(document, 'block-2')[0]).toBeCloseTo(20, 6)
    const looped = document.brokenSteps().find((step) => step.id === 'cube-3')
    expect(looped?.reason).toMatch(/loopA/)
    // Every hostile formula is unusable and says why: a load warning or the table's own error.
    const named = parsed.warnings.map((warning) => warning.message)
    const variables = new Map(variablesOf(document).map((variable) => [variable.name, variable]))
    for (let index = 1; index <= 25; index += 1) {
      const name = `h${index}`
      const variable = variables.get(name)
      const warned = named.some((message) => message.includes(`"${name}"`))
      expect(warned || typeof variable?.error === 'string', name).toBe(true)
      expect(variable?.value, name).toBeUndefined()
    }
    expect(variables.get('loopA')?.error).toMatch(/loopA → loopB → loopA|loopB → loopA → loopB/)
    expect(variables.get('c33')?.error).toMatch(/more than 32 formulas/)
    expect(variables.get('c31')?.value).toBe(32)
    // A __proto__ or constructor name is refused by name, never a prototype write.
    expect(variables.has('__proto__')).toBe(false)
    expect(variables.has('constructor')).toBe(false)
    expect(named.some((message) => message.includes('__proto__'))).toBe(true)
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before)
    expect(/** @type {any} */ (globalThis).__pwned).toBeUndefined()
  })

  it('an unknown var.* record is still skipped with a warning, so a file from a newer build opens', () => {
    const parsed = parseProject(ndjsonOf([cuboid('ok', 'OK', [5, 5, 5]), { id: 'v', op: 'var.future', params: { name: 'x' } }]))
    expect(parsed.warnings.map((warning) => warning.message).join('\n')).toMatch(/var\.future.*newer version/)
    expect(parsed.entries.map((entry) => entry.record.id)).toEqual(['ok'])
  })

  it('a formula on one copy, the body renamed on the other: it still resolves after the merge', () => {
    const base = baseThenC().entries.map((entry) => structuredClone(entry.record))
    const ours = createDocument({ replica: 'oooooo', actions: structuredClone(base) })
    const theirs = createDocument({ replica: 'tttttt', actions: structuredClone(base) })
    defineFormula(ours, { name: 'w', formula: 'Base.width' }, LOCAL)
    bindParam(ours, 'c', 'size.0', 'w', LOCAL)
    theirs.renameBody('base', 'Plate', LOCAL)
    ours.mergeFrom(theirs.mergeState(), { origin: 'merge' })
    expect(sizeOf(ours, 'c')[0]).toBeCloseTo(40, 6)
    expect(displayFormulaOf(ours, /** @type {any} */ (formulaOf(ours, 'w')))).toBe('Plate.width')
  })

  it('a formula and a var.define of one name on two copies: the first wins, the other is named', () => {
    const base = baseThenC().entries.map((entry) => structuredClone(entry.record))
    const ours = createDocument({ replica: 'oooooo', actions: structuredClone(base) })
    const theirs = createDocument({ replica: 'tttttt', actions: structuredClone(base) })
    defineFormula(ours, { name: 'w', formula: 'Base.width' }, LOCAL)
    defineVariable(theirs, wallVar({ name: 'w' }), LOCAL)
    ours.mergeFrom(theirs.mergeState(), { origin: 'merge' })
    const defs = ours.entries.filter((entry) => entry.record.params?.name === 'w')
    expect(defs).toHaveLength(2)
    expect(reasonOf(ours, /** @type {string} */ (defs[1].record.id))).toMatch(/already defined/)
  })

  it('an AI fork landing is re-validated from the text, never trusted', () => {
    const live = baseThenC()
    const fork = createDocument({ replica: 'aaaaaa', actions: live.entries.map((entry) => structuredClone(entry.record)) })
    fork.loadEntries([...fork.entries, ...entriesOf([formulaRecord({ name: 'sneaky', formula: 'Base.width +' }, 'var-ai-1')])], null, undefined, { tolerateAll: true })
    live.mergeFrom(fork.mergeState(), { origin: 'ai' })
    expect(formulaOf(live, 'sneaky')?.error).toMatch(/./)
    expect(formulaOf(live, 'sneaky')?.value).toBeUndefined()
  })
})

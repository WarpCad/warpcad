// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { piBoltRepeated } from './__fixtures__/piScenes.js'
import { lookupEntry, paramOptions, hasEditableParams } from './kernel/registry.js'
import { definePartFromSelection } from './library.js'
import { canEditParams, compositeParamEditRecord } from './paramEdit.js'
import { describeBody } from './inspector.js'
import { effectiveUserPart, libraryUserParts, lineageUserPartOps, partsToCarry, resetUserParts, setLibraryParts, setProjectParts } from './userPart.js'
import {
  duplicatePart,
  holdsRepeat,
  lineageNameProblem,
  partNameProblem,
  renamePart,
  saveToLibraryGate,
  projectUsage,
  usageOf,
} from './userPartTools.js'

/**
 * `TODO/ui-055` — the rules behind the Save to library sheet and the My parts menu, all in
 * plain Node: name validation, which numbers a group can expose, the enabled-state by
 * selection count, rename/duplicate, and a placed part's exposed parameters reaching the
 * Inspector's schema.
 */

const LOCAL = { origin: 'local' }

afterEach(() => resetUserParts())

/** A cube + cylinder combined into one group, the TODO's own example. */
function groupDocument() {
  const doc = createDocument()
  doc.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } }, LOCAL)
  doc.append({ id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { height: 20, diameter: 6, center: [8, 0, 10] } }, LOCAL)
  doc.append(
    {
      id: 'group-1',
      op: 'group.assemble',
      name: 'Group 1',
      target: 'cube-1',
      operands: ['cyl-1'],
      consumes: ['cube-1', 'cyl-1'],
      params: { names: ['Cube 1', 'Cylinder 1'] },
    },
    LOCAL
  )
  return doc
}

describe('partNameProblem — the sheet’s name validation', () => {
  const taken = [{ op: 'user.standoff', name: 'Standoff' }]

  it('accepts an ordinary name', () => {
    expect(partNameProblem('Bracket', taken)).toBe('')
  })

  it('refuses an empty or blank name, saying what to do', () => {
    expect(partNameProblem('', taken)).toMatch(/name/i)
    expect(partNameProblem('   \t', taken)).toMatch(/name/i)
  })

  it('refuses a name over 80 characters, naming the limit', () => {
    expect(partNameProblem('x'.repeat(80), taken)).toBe('')
    expect(partNameProblem('x'.repeat(81), taken)).toMatch(/80/)
  })

  it('refuses a duplicate — including one that only differs in case, spacing or punctuation', () => {
    expect(partNameProblem('Standoff', taken)).toMatch(/already/i)
    expect(partNameProblem('  standoff ', taken)).toMatch(/already/i)
    expect(partNameProblem('Stand-off!', taken)).toBe('')
    expect(partNameProblem('STAND OFF'.replace(' ', ''), taken)).toMatch(/already/i)
  })

  it('lets a part keep its own name when renaming it (`except`)', () => {
    expect(partNameProblem('Standoff', taken, { except: 'user.standoff' })).toBe('')
  })

  it('refuses a name with no letters or digits at all, since it would have no usable key', () => {
    expect(partNameProblem('???', taken)).toMatch(/letter|digit/i)
  })
})

describe('saveToLibraryGate — exactly one body', () => {
  it('is disabled at 0 and at 2 with a reason each, and enabled at exactly 1', () => {
    const none = saveToLibraryGate({ count: 0 })
    expect(none.enabled).toBe(false)
    expect(none.reason).toMatch(/select/i)

    const two = saveToLibraryGate({ count: 2 })
    expect(two.enabled).toBe(false)
    expect(two.reason).toMatch(/combine into group/i)

    expect(saveToLibraryGate({ count: 1 })).toEqual({ enabled: true, reason: '' })
  })

  it('is disabled while previewing a past step, and for a body a condition keeps out', () => {
    expect(saveToLibraryGate({ count: 1, previewing: true }).enabled).toBe(false)
    expect(saveToLibraryGate({ count: 1, inactive: true }).enabled).toBe(false)
  })
})

describe('saveToLibraryGate — a repeat is never saved (TODO/ui-076)', () => {
  it('is disabled for a repeat, with a reason that says what to do instead', () => {
    const gate = saveToLibraryGate({ count: 1, repeat: true })
    expect(gate.enabled).toBe(false)
    expect(gate.reason).toMatch(/repeat can't be saved/i)
    expect(gate.reason).toMatch(/source/i)
  })

  it('holdsRepeat is true for a repeat body and false for its source', () => {
    const document = piBoltRepeated()
    const bodies = document.bodies()
    const repeat = bodies.find((body) => body.recordId === 'rep-1')
    expect(repeat).toBeDefined()
    expect(holdsRepeat(document, /** @type {any} */ (repeat).id)).toBe(true)
    expect(holdsRepeat(document, 'nope')).toBe(false)
    const source = bodies.find((body) => body.id !== /** @type {any} */ (repeat).id && body.op?.startsWith('hardware.'))
    if (source) expect(holdsRepeat(document, source.id)).toBe(false)
  })
})

describe('lineageNameProblem — a name the body is built from (TODO/ui-105)', () => {
  it('is empty when the body uses no part of that name', () => {
    expect(lineageNameProblem('Feather', new Set(['user.other']))).toBe('')
    expect(lineageNameProblem('Feather', new Set())).toBe('')
  })

  it('names the typed name, trimmed, and compares by slug', () => {
    const ops = new Set(['user.esp8266-feather'])
    expect(lineageNameProblem('  esp8266 feather ', ops)).toBe('esp8266 feather is built from a part with that name — pick another name')
    expect(lineageNameProblem('ESP8266 Feather', ops)).toBe('ESP8266 Feather is built from a part with that name — pick another name')
  })

  it('leaves empty and symbol-only names to partNameProblem', () => {
    expect(lineageNameProblem('', new Set(['user.'])).length).toBe(0)
    expect(lineageNameProblem('!!!', new Set(['user.']))).toBe('')
  })
})

describe('partNameProblem is checked against My parts only (TODO/ui-105)', () => {
  it('a part only the project carries does not block its name; the library one does', () => {
    const definition = definePartFromSelection(groupDocument(), 'group-1', { name: 'Hexagon' })
    setProjectParts([definition])
    expect(libraryUserParts()).toEqual([])
    expect(partNameProblem('Hexagon', libraryUserParts())).toBe('')
    setLibraryParts([definition])
    expect(partNameProblem('hexagon ', libraryUserParts())).toMatch(/already exists/)
  })
})

/**
 * A document that places `inner` and merges it with a cube, like the Feather group.
 *
 * @param {import('./userPart.js').UserPartDefinition} inner
 */
function nestingDocument(inner) {
  const doc = createDocument()
  doc.append({ id: 'u-1', op: inner.op, name: 'Inner 1', params: {} }, LOCAL)
  doc.append({ id: 'cube-2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [4, 4, 4], center: [30, 0, 2] } }, LOCAL)
  doc.append(
    { id: 'group-2', op: 'group.assemble', name: 'Outer', target: 'u-1', operands: ['cube-2'], consumes: ['u-1', 'cube-2'], params: { names: ['Inner', 'Cube 2'] } },
    LOCAL
  )
  return doc
}

describe('lineageUserPartOps — the parts a body is built from, by records alone', () => {
  it('is empty for a body of plain primitives and for an unknown body', () => {
    expect([...lineageUserPartOps(groupDocument(), 'group-1')]).toEqual([])
    expect([...lineageUserPartOps(groupDocument(), 'nope')]).toEqual([])
  })

  it('lists a placed part, and the parts that part nests', () => {
    const leaf = definePartFromSelection(groupDocument(), 'group-1', { name: 'Leaf' })
    setProjectParts([leaf])
    const middleDoc = createDocument()
    middleDoc.append({ id: 'l-1', op: leaf.op, name: 'Leaf 1', params: {} }, LOCAL)
    const middle = definePartFromSelection(middleDoc, 'l-1', { name: 'Middle' })
    setProjectParts([leaf, middle])
    const doc = nestingDocument(middle)
    expect([...lineageUserPartOps(doc, 'group-2')].sort()).toEqual(['user.leaf', 'user.middle'])
  })
})

describe('partsToCarry — what a save copies into My parts (TODO/ui-105)', () => {
  /** leaf <- middle <- outer, all carried by the project. */
  function chain() {
    const leaf = definePartFromSelection(groupDocument(), 'group-1', { name: 'Leaf', version: 3 })
    setProjectParts([leaf])
    const middleDoc = createDocument()
    middleDoc.append({ id: 'l-1', op: leaf.op, name: 'Leaf 1', params: {} }, LOCAL)
    const middle = definePartFromSelection(middleDoc, 'l-1', { name: 'Middle', version: 2 })
    setProjectParts([leaf, middle])
    const outerDoc = createDocument()
    outerDoc.append({ id: 'm-1', op: middle.op, name: 'Middle 1', params: {} }, LOCAL)
    const outer = definePartFromSelection(outerDoc, 'm-1', { name: 'Outer' })
    return { leaf, middle, outer }
  }

  it('returns every nested project-only part, leaves first, at the project’s version', () => {
    const { leaf, middle, outer } = chain()
    expect(partsToCarry(outer).map((part) => [part.op, part.version])).toEqual([
      [leaf.op, 3],
      [middle.op, 2],
    ])
  })

  it('leaves out a nested part My parts already holds, whatever its version, and what it nests', () => {
    const { leaf, middle, outer } = chain()
    setLibraryParts([leaf, { ...middle, version: 1 }])
    expect(partsToCarry(outer)).toEqual([])
    setLibraryParts([leaf])
    expect(partsToCarry(outer).map((part) => part.op)).toEqual([middle.op])
  })

  it('is empty for a part that nests nothing', () => {
    const plain = definePartFromSelection(groupDocument(), 'group-1', { name: 'Plain' })
    expect(partsToCarry(plain)).toEqual([])
  })
})

describe('renamePart / duplicatePart', () => {
  function stored() {
    const doc = groupDocument()
    return definePartFromSelection(doc, 'group-1', { name: 'Standoff' })
  }

  it('rename changes the label and keeps the op, so placed instances still resolve', () => {
    const definition = stored()
    const renamed = renamePart(definition, 'Spacer')
    expect(renamed.name).toBe('Spacer')
    expect(renamed.op).toBe(definition.op)
    expect(renamed.records).toEqual(definition.records)
  })

  it('duplicate is a separate part: new op from the new name, version 1, same records', () => {
    const definition = { ...stored(), version: 4 }
    const copy = duplicatePart(definition, 'Standoff copy')
    expect(copy.op).toBe('user.standoff-copy')
    expect(copy.name).toBe('Standoff copy')
    expect(copy.version).toBe(1)
    expect(copy.records).toEqual(definition.records)
    expect(copy.result).toBe(definition.result)
  })
})

describe('usageOf — how many placed instances use a part', () => {
  it('counts the document’s records of that op', () => {
    const doc = groupDocument()
    const definition = definePartFromSelection(doc, 'group-1', { name: 'Standoff' })
    setLibraryParts([definition])
    expect(usageOf(doc.records, definition.op)).toBe(0)
    doc.append({ id: 'u-1', op: definition.op, params: {} }, LOCAL)
    doc.append({ id: 'u-2', op: definition.op, params: {} }, LOCAL)
    expect(usageOf(doc.records, definition.op)).toBe(2)
  })
})

describe('a placed part’s exposed parameters reach the Inspector’s schema', () => {
  function placed() {
    const source = groupDocument()
    // New saves expose nothing (TODO/ui-105), but a part saved earlier with exposed sizes must
    // still load and place with its fields, so the core option stays and is exercised here.
    /** @type {import('./userPart.js').ExposedParam[]} */
    const exposeParams = [
      { name: 'cylinder-1-height', unit: 'mm', default: 20, min: 2, max: 200, binds: [{ record: 'cyl-1', path: 'height' }] },
    ]
    const definition = definePartFromSelection(source, 'group-1', { name: 'Standoff', exposeParams })
    setLibraryParts([definition])
    const doc = createDocument()
    doc.append({ id: 'u-1', op: definition.op, name: 'Standoff 1', params: {} }, LOCAL)
    return { doc, definition }
  }

  it('paramOptions and hasEditableParams describe the exposed numbers, with their range', () => {
    const { definition } = placed()
    const name = definition.params[0].name
    expect(hasEditableParams(definition.op)).toBe(true)
    const schema = /** @type {any} */ (paramOptions(definition.op, {}))
    expect(schema[name]).toMatchObject({ kind: 'number', unit: 'mm', default: 20 })
    expect(schema[name].min).toBe(definition.params[0].min)
    expect(schema[name].max).toBe(definition.params[0].max)
  })

  it('a part with no exposed parameters has no editable fields (stays read-only)', () => {
    const doc = groupDocument()
    const definition = definePartFromSelection(doc, 'group-1', { name: 'Plain' })
    setLibraryParts([definition])
    expect(hasEditableParams(definition.op)).toBe(false)
    expect(paramOptions(definition.op, {})).toEqual({})
  })

  it('describeBody shows the exposed parameter as a labelled number field and names the sub-parts', () => {
    const { doc, definition } = placed()
    const body = /** @type {any} */ (doc.bodies().find((candidate) => candidate.id === 'u-1'))
    const described = describeBody(body)
    expect(described.isRecipe).toBe(true)
    expect(described.opLabel).toBe('Standoff')
    const field = described.params.find((candidate) => candidate.key === definition.params[0].name)
    expect(field).toMatchObject({ kind: 'number', unit: 'mm', value: 20 })
    expect(described.parts.map((part) => part.name)).toEqual(['Cube 1', 'Cylinder 1'])
  })

  it('is editable in place, and a value outside the exposed range is refused by name', () => {
    const { doc, definition } = placed()
    const name = definition.params[0].name
    expect(canEditParams(doc, 'u-1')).toMatchObject({ editable: true, path: 'replace' })
    const record = compositeParamEditRecord(doc, 'u-1', { [name]: 30 })
    expect(record?.params?.[name]).toBe(30)
    expect(() => compositeParamEditRecord(doc, 'u-1', { [name]: definition.params[0].max + 1 })).toThrow(
      new RegExp(`${name}.*between|${name}.*at most|${name}.*outside`, 'i')
    )
    expect(() => compositeParamEditRecord(doc, 'u-1', { [name]: 0 })).toThrow(/at least|between|outside/i)
  })

  it('a project-layer copy is used too (the project wins over the library)', () => {
    const { definition } = placed()
    setLibraryParts([])
    setProjectParts([definition])
    expect(effectiveUserPart(definition.op)).toBeDefined()
    expect(lookupEntry(definition.op)?.kind).toBe('composite')
    expect(hasEditableParams(definition.op)).toBe(true)
  })
})

describe('projectUsage — direct and nested use of a part (TODO/ui-096)', () => {
  /**
   * @param {string} op
   * @param {string} name
   * @param {...string} children
   */
  const part = (op, name, ...children) => ({
    op,
    name,
    version: 1,
    result: 'r1',
    records: children.length > 0 ? children.map((child, i) => ({ id: `r${i + 1}`, op: child, params: {} })) : [{ id: 'r1', op: 'primitive.cuboid', params: { size: [1, 1, 1] } }],
    params: [],
  })
  /** @param {...any} definitions */
  const lookupOf = (...definitions) => {
    const byOp = new Map(definitions.map((definition) => [definition.op, definition]))
    return (/** @type {string} */ op) => byOp.get(op)
  }
  /** @param {...string} ops */
  const placed = (...ops) => ops.map((op, i) => ({ id: `p-${i}`, op, name: `P ${i}`, params: {} }))

  it('counts records that place the part itself', () => {
    const lookup = lookupOf(part('user.a', 'A'))
    expect(projectUsage(placed('user.a', 'user.a', 'primitive.cuboid'), 'user.a', lookup)).toEqual({ direct: 2, nestedIn: [] })
  })

  it('names the placed part that nests it, one level down', () => {
    const lookup = lookupOf(part('user.a', 'A'), part('user.b', 'Box', 'user.a'))
    expect(projectUsage(placed('user.b'), 'user.a', lookup)).toEqual({ direct: 0, nestedIn: ['Box'] })
  })

  it('walks two levels: A nests B nests C, A placed, C names A', () => {
    const lookup = lookupOf(part('user.c', 'C'), part('user.b', 'B', 'user.c'), part('user.a', 'A', 'user.b'))
    expect(projectUsage(placed('user.a'), 'user.c', lookup)).toEqual({ direct: 0, nestedIn: ['A'] })
    expect(projectUsage(placed('user.a'), 'user.b', lookup)).toEqual({ direct: 0, nestedIn: ['A'] })
  })

  it('an unused part is 0 and []', () => {
    const lookup = lookupOf(part('user.a', 'A'), part('user.b', 'B'))
    expect(projectUsage(placed('user.b'), 'user.a', lookup)).toEqual({ direct: 0, nestedIn: [] })
    expect(projectUsage([], 'user.a', lookup)).toEqual({ direct: 0, nestedIn: [] })
  })

  it('a part nested by two placed parts names both once, in name order, however often each is placed', () => {
    const lookup = lookupOf(part('user.a', 'A'), part('user.z', 'Zed', 'user.a'), part('user.b', 'Bee', 'user.a'))
    expect(projectUsage(placed('user.z', 'user.b', 'user.z'), 'user.a', lookup)).toEqual({ direct: 0, nestedIn: ['Bee', 'Zed'] })
  })

  it('a part both placed directly and nested counts both kinds', () => {
    const lookup = lookupOf(part('user.a', 'A'), part('user.b', 'Box', 'user.a'))
    expect(projectUsage(placed('user.a', 'user.b'), 'user.a', lookup)).toEqual({ direct: 1, nestedIn: ['Box'] })
  })

  it('a deleted placement does not count, nor does one consumed into a deleted body; undo (no tombstone) restores it', () => {
    const lookup = lookupOf(part('user.a', 'A'), part('user.b', 'Box', 'user.a'))
    const records = [
      { id: 'p-1', op: 'user.a', params: {} },
      { id: 'p-2', op: 'user.b', params: {} },
      { id: 'grp', op: 'group.assemble', consumes: ['p-2'], params: {} },
    ]
    expect(projectUsage(records, 'user.a', lookup)).toEqual({ direct: 1, nestedIn: ['Box'] })
    const withDelete = [...records, { id: 'p-1-delete', op: 'body.delete', target: 'p-1', supersedes: 'p-1' }, { id: 'grp-delete', op: 'body.delete', target: 'grp', supersedes: 'grp' }]
    expect(projectUsage(withDelete, 'user.a', lookup)).toEqual({ direct: 0, nestedIn: [] })
  })

  it('a missing definition ends the walk without throwing', () => {
    const lookup = lookupOf(part('user.b', 'Box', 'user.gone'))
    expect(projectUsage(placed('user.b'), 'user.a', lookup)).toEqual({ direct: 0, nestedIn: [] })
  })
})

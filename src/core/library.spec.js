import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { PRIMITIVE_LIBRARY, recordForDrop } from './library.js'
import { createDocument } from './document.js'

const { measurements } = modeling

describe('PRIMITIVE_LIBRARY — the Library panel rows, derived from the registry', () => {
  it('lists every primitive.* op the registry carries, and nothing else', () => {
    // The single mechanism CLAUDE.md's creation-vs-operation rule asks for: the
    // rows are the registry's creation entries, not a hand-copied list that can
    // drift from it.
    expect(PRIMITIVE_LIBRARY.map((row) => row.op)).toEqual([
      'primitive.cuboid',
      'primitive.cylinder',
      'primitive.cone',
      'primitive.hexagon',
      'primitive.triangle',
      'primitive.tube',
      'primitive.sphere',
    ])
    expect(PRIMITIVE_LIBRARY).toHaveLength(7)
  })

  it('gives every row a human label and buildable defaults', () => {
    for (const row of PRIMITIVE_LIBRARY) {
      expect(row.label, row.op).toMatch(/\S/)
      expect(row.defaults, row.op).toBeTypeOf('object')
      expect(row.operandCount, row.op).toBe(0)
    }
    expect(PRIMITIVE_LIBRARY.map((row) => row.label)).toEqual([
      'Cube',
      'Cylinder',
      'Cone',
      'Hexagon',
      'Triangle',
      'Tube',
      'Sphere',
    ])
  })
})

describe('recordForDrop — one generic drop, parameterised by which op the row names', () => {
  it('builds a record for any of the seven rows without a per-primitive branch', () => {
    const document = createDocument()
    for (const row of PRIMITIVE_LIBRARY) {
      const record = recordForDrop(row.op, { x: 0, y: 0 }, document)
      expect(record.op).toBe(row.op)
      expect(record.id).toMatch(/\S/)
      expect(record.name).toBe(`${row.label} 1`)
      expect(() => document.append(record, { origin: 'local' })).not.toThrow()
    }
    expect(document.bodies()).toHaveLength(7)
  })

  it('places the drop point in X/Y — not a fixed-origin spawn', () => {
    const document = createDocument()
    const record = recordForDrop('primitive.cuboid', { x: 42.5, y: -17.25 }, document)
    const { scene } = document.append(record, { origin: 'local' })
    const bounds = measurements.measureBoundingBox(
        /** @type {any} */ (scene.byId.get(String(record.id)))
      )
    expect((bounds[0][0] + bounds[1][0]) / 2).toBeCloseTo(42.5, 6)
    expect((bounds[0][1] + bounds[1][1]) / 2).toBeCloseTo(-17.25, 6)
  })

  it('rests every primitive on the working plane rather than half-burying it', () => {
    // The drop point is on the Z=0 grid; a solid centred there would sit half
    // underground, which reads as a bug the first time anyone drops a cube.
    const document = createDocument()
    for (const row of PRIMITIVE_LIBRARY) {
      const record = recordForDrop(row.op, { x: 10, y: 20 }, document)
      const { scene } = document.append(record, { origin: 'local' })
      const bounds = measurements.measureBoundingBox(
        /** @type {any} */ (scene.byId.get(String(record.id)))
      )
      expect(bounds[0][2], `${row.op} does not rest on Z=0`).toBeCloseTo(0, 6)
      expect(bounds[1][2], `${row.op} has no height`).toBeGreaterThan(0)
    }
  })

  it('numbers each type independently, so names never collide', () => {
    const document = createDocument()
    const names = []
    for (const op of ['primitive.cuboid', 'primitive.sphere', 'primitive.cuboid']) {
      const record = recordForDrop(op, { x: 0, y: 0 }, document)
      document.append(record, { origin: 'local' })
      names.push(String(record.name))
    }
    expect(names).toEqual(['Cube 1', 'Sphere 1', 'Cube 2'])
  })

  it('rejects an op that is not a library row', () => {
    const document = createDocument()
    expect(() => recordForDrop('boolean.union', { x: 0, y: 0 }, document)).toThrow(/boolean\.union/)
    expect(() => recordForDrop('primitive.dodecahedron', { x: 0, y: 0 }, document)).toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { acceptsOperandCount, assertOperandCount, getEntry, registry } from './registry.js'

const { measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/**
 * Call a native entry's builder directly, bypassing the fold.
 *
 * @param {string} op
 * @param {{ params?: Record<string, any>, inputs?: Geom3[] }} [args]
 * @returns {Geom3}
 */
function build(op, { params = {}, inputs = [] } = {}) {
  const entry = getEntry(op)
  if (!entry.build) throw new Error(`${op} is not a native op`)
  return entry.build({ params, inputs })
}

/** @param {Geom3} geometry */
const boundsOf = (geometry) => measurements.measureBoundingBox(geometry)

describe('registry shape', () => {
  it('tags every entry composite or native and gives every one an operandCount', () => {
    const ops = Object.keys(registry)
    expect(ops.length).toBeGreaterThan(0)
    for (const op of ops) {
      const entry = registry[op]
      expect(['native', 'composite']).toContain(entry.kind)
      expect([0, 1, '2+']).toContain(entry.operandCount)
      if (entry.kind === 'native') expect(typeof entry.build).toBe('function')
      else expect(typeof entry.recipe).toBe('function')
    }
  })

  it('carries the three native entries this spike is built on', () => {
    expect(registry['primitive.cuboid']).toMatchObject({ kind: 'native', operandCount: 0 })
    expect(registry['boolean.union']).toMatchObject({ kind: 'native', operandCount: '2+' })
    expect(registry['boolean.subtract']).toMatchObject({ kind: 'native', operandCount: '2+' })
  })

  it('carries hardware.bolt as a composite that creates geometry from nothing', () => {
    expect(registry['hardware.bolt']).toMatchObject({ kind: 'composite', operandCount: 0 })
  })

  it('getEntry names the unknown op and does not return undefined', () => {
    expect(() => getEntry('primitive.dodecahedron')).toThrow(/primitive\.dodecahedron/)
  })

  it('getEntry/acceptsOperandCount/assertOperandCount all honour a caller-supplied registry', () => {
    // Regression: found while building core-002's replay engine against a fake
    // registry (CLAUDE.md's "always mock at the boundary") — these three used to
    // always check the real, hardcoded registry regardless of what `ops` a record
    // was actually resolved against, so `evaluate({ registry: fakeRegistry })`
    // rejected every op in the fake registry as "unknown", even ones it defined.
    const fakeOps = Object.freeze({
      'fake.thing': /** @type {import('./registry.js').RegistryEntry} */ ({
        kind: 'native',
        operandCount: '2+',
      }),
    })
    expect(() => getEntry('fake.thing')).toThrow(/fake\.thing/)
    expect(getEntry('fake.thing', fakeOps)).toBe(fakeOps['fake.thing'])
    expect(acceptsOperandCount('fake.thing', 2, fakeOps)).toBe(true)
    expect(acceptsOperandCount('fake.thing', 1, fakeOps)).toBe(false)
    expect(() => assertOperandCount('fake.thing', 1, fakeOps)).toThrow(/2 or more/)
    expect(() => assertOperandCount('fake.thing', 2, fakeOps)).not.toThrow()
  })
})

describe('acceptsOperandCount — the UI tool-enablement gate', () => {
  it('lets a creation op run with no selection and blocks it with one', () => {
    expect(acceptsOperandCount('primitive.cuboid', 0)).toBe(true)
    expect(acceptsOperandCount('primitive.cuboid', 1)).toBe(false)
    expect(acceptsOperandCount('hardware.bolt', 0)).toBe(true)
    expect(acceptsOperandCount('hardware.bolt', 2)).toBe(false)
  })

  it('requires exactly one operand for a single-object edit', () => {
    expect(acceptsOperandCount('transform.translate', 0)).toBe(false)
    expect(acceptsOperandCount('transform.translate', 1)).toBe(true)
    expect(acceptsOperandCount('transform.translate', 2)).toBe(false)
  })

  it('requires two or more operands for a boolean', () => {
    expect(acceptsOperandCount('boolean.union', 1)).toBe(false)
    expect(acceptsOperandCount('boolean.union', 2)).toBe(true)
    expect(acceptsOperandCount('boolean.union', 5)).toBe(true)
    expect(acceptsOperandCount('boolean.subtract', 1)).toBe(false)
    expect(acceptsOperandCount('boolean.subtract', 2)).toBe(true)
  })
})

describe('native builders', () => {
  it('primitive.cuboid is centred on the origin, V3-style', () => {
    expect(boundsOf(build('primitive.cuboid', { params: { size: [40, 20, 10] } }))).toEqual([
      [-20, -10, -5],
      [20, 10, 5],
    ])
  })

  it('primitive.cuboid honours an explicit centre in millimetres', () => {
    expect(
      boundsOf(build('primitive.cuboid', { params: { size: [2, 2, 2], center: [0, 0, 5] } }))
    ).toEqual([
      [-1, -1, 4],
      [1, 1, 6],
    ])
  })

  it('primitive.cylinder takes a diameter, not a radius', () => {
    const bounds = boundsOf(build('primitive.cylinder', { params: { diameter: 10, height: 20 } }))
    expect(bounds[0][0]).toBeCloseTo(-5, 9)
    expect(bounds[1][2]).toBeCloseTo(10, 9)
  })

  it('primitive.hexagon has a vertex on +X and flats at r*sqrt(3)/2, like jscad-utils', () => {
    const bounds = boundsOf(build('primitive.hexagon', { params: { diameter: 18, height: 6.5 } }))
    expect(bounds[1][0]).toBeCloseTo(9, 9)
    expect(bounds[1][1]).toBeCloseTo((9 * Math.sqrt(3)) / 2, 9)
    expect(bounds[1][2]).toBeCloseTo(3.25, 9)
  })

  it('transform.translate moves its single input by a millimetre vector', () => {
    const cube = build('primitive.cuboid', { params: { size: [2, 2, 2] } })
    const moved = build('transform.translate', {
      params: { vector: [0, 0, 5] },
      inputs: [cube],
    })
    expect(boundsOf(moved)).toEqual([
      [-1, -1, 4],
      [1, 1, 6],
    ])
  })

  it('boolean.union merges every input', () => {
    const a = build('primitive.cuboid', { params: { size: [2, 2, 2], center: [-3, 0, 0] } })
    const b = build('primitive.cuboid', { params: { size: [2, 2, 2], center: [3, 0, 0] } })
    expect(boundsOf(build('boolean.union', { inputs: [a, b] }))).toEqual([
      [-4, -1, -1],
      [4, 1, 1],
    ])
  })

  it('boolean.subtract removes every input after the first', () => {
    const a = build('primitive.cuboid', { params: { size: [10, 10, 10] } })
    const b = build('primitive.cuboid', { params: { size: [10, 10, 6], center: [0, 0, 5] } })
    const result = build('boolean.subtract', { inputs: [a, b] })
    expect(boundsOf(result)[1][2]).toBeCloseTo(2, 6)
  })

  it('rejects degenerate primitive dimensions instead of emitting an empty solid', () => {
    expect(() => build('primitive.cylinder', { params: { diameter: 10, height: 0 } })).toThrow(
      /height/
    )
    expect(() => build('primitive.hexagon', { params: { diameter: 0, height: 5 } })).toThrow(
      /diameter/
    )
  })

  it('modify.filletRim rounds one face rim and defaults to the top', () => {
    const cube = build('primitive.cuboid', { params: { size: [20, 20, 20] } })
    const filleted = build('modify.filletRim', { params: { radius: 3, segments: 64 }, inputs: [cube] })
    expect(measurements.measureVolume(filleted)).toBeLessThan(measurements.measureVolume(cube))
    // Same bounding box: a rim op removes material, it does not resize the solid.
    expect(boundsOf(filleted)[1][2]).toBeCloseTo(10, 3)
    const bottom = build('modify.filletRim', {
      params: { radius: 3, segments: 64, orientation: 'z-' },
      inputs: [cube],
    })
    expect(measurements.measureVolume(bottom)).toBeCloseTo(measurements.measureVolume(filleted), 6)
  })

  it('modify.chamferRim bevels the same rim and takes more material than the fillet', () => {
    const cube = build('primitive.cuboid', { params: { size: [20, 20, 20] } })
    const chamfered = build('modify.chamferRim', { params: { radius: 3 }, inputs: [cube] })
    const filleted = build('modify.filletRim', { params: { radius: 3, segments: 64 }, inputs: [cube] })
    expect(measurements.measureVolume(chamfered)).toBeLessThan(measurements.measureVolume(filleted))
  })

  it('gates both rim ops on a single selected object', () => {
    for (const op of ['modify.filletRim', 'modify.chamferRim']) {
      expect(registry[op]).toMatchObject({ kind: 'native', operandCount: 1 })
      expect(acceptsOperandCount(op, 1)).toBe(true)
      expect(acceptsOperandCount(op, 0)).toBe(false)
      expect(acceptsOperandCount(op, 2)).toBe(false)
    }
  })

  it('registers no general edge fillet or chamfer — TODO/core-003 found none is possible', () => {
    // Guards the naming decision, not just the absence: if a later task adds an edge
    // fillet it has to come with its own evidence, and it must not be these rim ops
    // renamed, because the UI gates tools on what an op claims to accept.
    expect(registry['modify.fillet']).toBeUndefined()
    expect(registry['modify.chamfer']).toBeUndefined()
    expect(registry['hardware.bearing']).toBeUndefined()
  })
})

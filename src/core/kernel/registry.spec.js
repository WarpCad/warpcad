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

  it('carries all seven base creation primitives, each creating geometry from nothing', () => {
    // §6's Base creation rows, and the set TODO/ui-010's Library panel lists. The
    // panel is built by iterating this registry, so a missing entry here is a
    // missing row there — that is the point of asserting the whole set.
    for (const op of [
      'primitive.cuboid',
      'primitive.cylinder',
      'primitive.cone',
      'primitive.hexagon',
      'primitive.triangle',
      'primitive.tube',
      'primitive.sphere',
    ]) {
      expect(registry[op], op).toMatchObject({ kind: 'native', operandCount: 0 })
    }
  })

  it('gives every creation op the UI metadata the Library panel is built from', () => {
    // CLAUDE.md's creation-vs-operation rule: "read the registry, don't hardcode a
    // list" only produces a working UI if the registry itself encodes what the UI
    // needs. A row needs a human label and a set of default params to drop with.
    for (const [op, entry] of Object.entries(registry)) {
      const ui = entry.ui
      if (!ui) continue
      expect(typeof ui.label, op).toBe('string')
      expect(ui.label.length, op).toBeGreaterThan(0)
      expect(typeof ui.defaults, op).toBe('object')
      expect(() => build(op, { params: ui.defaults }), op).not.toThrow()
    }
    for (const op of Object.keys(registry).filter((key) => key.startsWith('primitive.'))) {
      expect(registry[op]?.ui, `${op} has no ui metadata`).toBeTruthy()
    }
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

  it('transform.rotate takes degrees and turns its input about its own centre', () => {
    // Degrees in, radians at the registry boundary — this module's own documented
    // unit convention, and the reason no component ever sees a radian.
    const bar = build('primitive.cuboid', { params: { size: [20, 4, 4], center: [0, 0, 10] } })
    const turned = build('transform.rotate', {
      params: { angles: [0, 0, 90], center: [0, 0, 10] },
      inputs: [bar],
    })
    const bounds = boundsOf(turned)
    // A quarter turn about Z swaps the 20 mm and 4 mm extents...
    expect(bounds[1][0] - bounds[0][0]).toBeCloseTo(4, 6)
    expect(bounds[1][1] - bounds[0][1]).toBeCloseTo(20, 6)
    // ...and rotating about the body's *own* centre leaves it where it was,
    // rather than flinging it around the world origin.
    expect((bounds[0][0] + bounds[1][0]) / 2).toBeCloseTo(0, 6)
    expect((bounds[0][2] + bounds[1][2]) / 2).toBeCloseTo(10, 6)
  })

  it('transform.rotate defaults its centre to the world origin', () => {
    const bar = build('primitive.cuboid', { params: { size: [20, 4, 4], center: [20, 0, 0] } })
    const turned = build('transform.rotate', { params: { angles: [0, 0, 90] }, inputs: [bar] })
    const bounds = boundsOf(turned)
    // Rotated about [0,0,0], the bar swings from +X onto +Y.
    expect((bounds[0][0] + bounds[1][0]) / 2).toBeCloseTo(0, 6)
    expect((bounds[0][1] + bounds[1][1]) / 2).toBeCloseTo(20, 6)
  })

  it('transform.rotate rejects a non-finite angle rather than emitting NaN geometry', () => {
    const cube = build('primitive.cuboid', { params: { size: [2, 2, 2] } })
    expect(() =>
      build('transform.rotate', { params: { angles: [0, Number.NaN, 0] }, inputs: [cube] })
    ).toThrow(/angles/)
  })

  it('transform.rotate is a single-operand edit, like transform.translate', () => {
    expect(registry['transform.rotate']).toMatchObject({ kind: 'native', operandCount: 1 })
    expect(acceptsOperandCount('transform.rotate', 0)).toBe(false)
    expect(acceptsOperandCount('transform.rotate', 1)).toBe(true)
    expect(acceptsOperandCount('transform.rotate', 2)).toBe(false)
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

  it('primitive.sphere takes a diameter and centres on the origin', () => {
    const bounds = boundsOf(build('primitive.sphere', { params: { diameter: 24 } }))
    expect(bounds[0][0]).toBeCloseTo(-12, 9)
    expect(bounds[1][0]).toBeCloseTo(12, 9)
    expect(bounds[1][2]).toBeCloseTo(12, 9)
    const moved = boundsOf(build('primitive.sphere', { params: { diameter: 10, center: [0, 0, 5] } }))
    expect(moved[0][2]).toBeCloseTo(0, 9)
    expect(moved[1][2]).toBeCloseTo(10, 9)
  })

  it('primitive.cone tapers from a full base diameter to a point', () => {
    const cone = build('primitive.cone', { params: { diameter: 20, height: 30 } })
    const bounds = boundsOf(cone)
    expect(bounds[0][0]).toBeCloseTo(-10, 6)
    expect(bounds[1][0]).toBeCloseTo(10, 6)
    expect(bounds[0][2]).toBeCloseTo(-15, 9)
    expect(bounds[1][2]).toBeCloseTo(15, 9)
    // A cone is a third of the cylinder that encloses it — the tolerance is the
    // 32-segment polygonal approximation of both, not the arithmetic.
    const cylinder = build('primitive.cylinder', { params: { diameter: 20, height: 30 } })
    expect(measurements.measureVolume(cone)).toBeCloseTo(
      measurements.measureVolume(cylinder) / 3,
      3
    )
  })

  it('primitive.cone accepts a truncated top (a frustum) via topDiameter', () => {
    const frustum = build('primitive.cone', {
      params: { diameter: 20, topDiameter: 10, height: 10 },
    })
    const bounds = boundsOf(frustum)
    expect(bounds[1][0]).toBeCloseTo(10, 6)
    // Cross-section at the top is half the base, so the frustum holds more than a
    // full cone and less than a cylinder of the same base.
    const cone = build('primitive.cone', { params: { diameter: 20, height: 10 } })
    const cylinder = build('primitive.cylinder', { params: { diameter: 20, height: 10 } })
    const volume = measurements.measureVolume(frustum)
    expect(volume).toBeGreaterThan(measurements.measureVolume(cone))
    expect(volume).toBeLessThan(measurements.measureVolume(cylinder))
  })

  it('primitive.tube is hollow: same envelope as its cylinder, less material', () => {
    const tube = build('primitive.tube', {
      params: { diameter: 20, innerDiameter: 12, height: 20 },
    })
    const bounds = boundsOf(tube)
    expect(bounds[0][0]).toBeCloseTo(-10, 6)
    expect(bounds[1][2]).toBeCloseTo(10, 9)
    const solid = build('primitive.cylinder', { params: { diameter: 20, height: 20 } })
    const bore = build('primitive.cylinder', { params: { diameter: 12, height: 20 } })
    expect(measurements.measureVolume(tube)).toBeCloseTo(
      measurements.measureVolume(solid) - measurements.measureVolume(bore),
      6
    )
  })

  it('primitive.tube rejects a bore that is not strictly inside the outer wall', () => {
    const params = { diameter: 20, height: 10 }
    expect(() => build('primitive.tube', { params: { ...params, innerDiameter: 20 } })).toThrow(
      /innerDiameter/
    )
    expect(() => build('primitive.tube', { params: { ...params, innerDiameter: 25 } })).toThrow(
      /innerDiameter/
    )
    expect(() => build('primitive.tube', { params: { ...params, innerDiameter: 0 } })).toThrow(
      /innerDiameter/
    )
  })

  it('primitive.triangle is a prism, centred like every other primitive', () => {
    const prism = build('primitive.triangle', { params: { sides: [30, 30, 30], height: 10 } })
    const bounds = boundsOf(prism)
    expect(bounds[1][2] - bounds[0][2]).toBeCloseTo(10, 9)
    // Equilateral, side 30: width 30, altitude 30*sqrt(3)/2.
    expect(bounds[1][0] - bounds[0][0]).toBeCloseTo(30, 6)
    expect(bounds[1][1] - bounds[0][1]).toBeCloseTo((30 * Math.sqrt(3)) / 2, 6)
    // Centred on the origin, not sitting in the +X/+Y quadrant the way
    // @jscad/modeling's own 2D triangle is.
    expect((bounds[0][0] + bounds[1][0]) / 2).toBeCloseTo(0, 6)
    expect((bounds[0][1] + bounds[1][1]) / 2).toBeCloseTo(0, 6)
    expect((bounds[0][2] + bounds[1][2]) / 2).toBeCloseTo(0, 9)
    // Area * height, within the exact arithmetic — a prism has no curved surface
    // to approximate, so this one is not a tolerance-of-segments case.
    const area = ((30 * Math.sqrt(3)) / 2 / 2) * 30
    expect(measurements.measureVolume(prism)).toBeCloseTo(area * 10, 6)
  })

  it('primitive.triangle rejects degenerate side lengths', () => {
    expect(() => build('primitive.triangle', { params: { sides: [1, 1, 5], height: 5 } })).toThrow()
    expect(() => build('primitive.triangle', { params: { sides: [10, 10, 0], height: 5 } })).toThrow(
      /sides\[2\]/
    )
    expect(() =>
      build('primitive.triangle', { params: { sides: [10, 10, 10], height: 0 } })
    ).toThrow(/height/)
  })

  it('rejects degenerate dimensions on every one of the seven base primitives', () => {
    /** @type {[string, Record<string, any>, RegExp][]} */
    const cases = [
      ['primitive.cuboid', { size: [0, 10, 10] }, /size\[0\]/],
      ['primitive.cylinder', { diameter: 10, height: -1 }, /height/],
      ['primitive.hexagon', { diameter: Number.NaN, height: 5 }, /diameter/],
      ['primitive.sphere', { diameter: 0 }, /diameter/],
      ['primitive.cone', { diameter: 0, height: 5 }, /diameter/],
      ['primitive.tube', { diameter: Number.POSITIVE_INFINITY, innerDiameter: 4, height: 5 }, /diameter/],
      ['primitive.triangle', { sides: [10, 10, 10], height: Number.NaN }, /height/],
    ]
    for (const [op, params, message] of cases) {
      expect(() => build(op, { params }), `${op} accepted ${JSON.stringify(params)}`).toThrow(message)
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

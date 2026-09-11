import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { acceptsOperandCount, assertOperandCount, getEntry, registry } from './registry.js'
import { calcCenterWith, calcSnap, centroidOf, combine, isGroup, pick } from './group.js'
import { evaluate } from './index.js'

const { measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('@jscad/modeling').geometries.geom2.Geom2} Geom2 */

/**
 * Call a native entry's builder directly, bypassing the fold.
 *
 * Returns `Geom3 | Geom2` rather than a solid: `profile.roundedRectangle` builds a
 * flat profile (TODO/core-012), and the tests below measure it the same way.
 *
 * @param {string} op
 * @param {{ params?: Record<string, any>, inputs?: any[] }} [args]
 * @returns {Geom3 | Geom2}
 */
function build(op, { params = {}, inputs = [] } = {}) {
  const entry = getEntry(op)
  if (!entry.build) throw new Error(`${op} is not a native op`)
  // A `group.*` entry may hand back a Group (TODO/core-013); no test below calls
  // this helper on one, and the two that measure a group go through `evaluate`.
  return /** @type {Geom3 | Geom2} */ (entry.build({ params, inputs }))
}

/** @param {Geom3 | Geom2} geometry */
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

  it('carries §6’s three kit parts as composites that create geometry from nothing', () => {
    for (const op of ['kit.board', 'kit.boardFrame', 'kit.anchor']) {
      expect(registry[op], op).toMatchObject({ kind: 'composite', operandCount: 0 })
    }
  })

  it('keeps the 2D profile ops out of the primitive.* namespace, and out of the panel', () => {
    // TODO/core-012: `src/core/library.js` filters registry keys on `primitive.` and
    // throws on any match without `ui` metadata, so naming a geom2-producing op
    // `primitive.roundedRectangle` would either break the Library panel's build or
    // offer a flat profile as a draggable body. Neither of these is a placeable row.
    for (const op of ['profile.roundedRectangle', 'profile.extrudeLinear']) {
      expect(op.startsWith('primitive.'), op).toBe(false)
      expect(registry[op]?.ui, `${op} must not be offered as a catalogue row`).toBeUndefined()
    }
  })
})

describe('the 2D profile layer (TODO/core-012)', () => {
  const { geometries } = modeling

  it('builds a rounded rectangle as a 2D profile, not a solid', () => {
    const profile = build('profile.roundedRectangle', {
      params: { size: [40, 30], roundRadius: 3 },
    })
    expect(geometries.geom2.isA(profile)).toBe(true)
    expect(geometries.geom3.isA(profile)).toBe(false)
    const [min, max] = boundsOf(profile)
    expect(max[0] - min[0]).toBeCloseTo(40, 6)
    expect(max[1] - min[1]).toBeCloseTo(30, 6)
  })

  it('treats a zero corner radius as a square corner rather than an error', () => {
    const profile = build('profile.roundedRectangle', { params: { size: [10, 10] } })
    const [min, max] = boundsOf(profile)
    expect(max[0] - min[0]).toBeCloseTo(10, 6)
  })

  it('names the op and the parameter when a corner radius cannot fit', () => {
    // Upstream's own message — "roundRadius must be smaller than the radius of all
    // dimensions" — names neither, and fires for the sliver just under half too.
    expect(() =>
      build('profile.roundedRectangle', { params: { size: [10, 10], roundRadius: 5 } })
    ).toThrow(/profile\.roundedRectangle: roundRadius must be smaller than half/)
    expect(() =>
      build('profile.roundedRectangle', { params: { size: [10, 10], roundRadius: 4.999999 } })
    ).toThrow(/profile\.roundedRectangle: roundRadius/)
    expect(() =>
      build('profile.roundedRectangle', { params: { size: [0, 10], roundRadius: 1 } })
    ).toThrow(/profile\.roundedRectangle: size\[0\]/)
  })

  it('extrudes a profile into a solid of the requested height, based on z = 0', () => {
    const profile = build('profile.roundedRectangle', {
      params: { size: [40, 30], roundRadius: 3 },
    })
    const prism = build('profile.extrudeLinear', { params: { height: 1.62 }, inputs: [profile] })
    expect(geometries.geom3.isA(prism)).toBe(true)
    const [min, max] = boundsOf(prism)
    expect(min[2]).toBeCloseTo(0, 6)
    expect(max[2]).toBeCloseTo(1.62, 6)
  })

  it('rejects a solid operand instead of silently passing it through', () => {
    // Upstream `extrudeLinear` returns anything that is neither geom2 nor path2
    // *unchanged*, so without this guard the mistake would surface as wrong geometry
    // several records later, with nothing pointing back at the cause.
    const solid = build('primitive.cuboid', { params: { size: [10, 10, 10] } })
    expect(() =>
      build('profile.extrudeLinear', { params: { height: 2 }, inputs: [solid] })
    ).toThrow(/profile\.extrudeLinear: operand must be a 2D profile \(geom2\), got a 3D solid/)
  })

  it('rejects a non-positive extrusion height', () => {
    const profile = build('profile.roundedRectangle', { params: { size: [10, 10] } })
    expect(() => build('profile.extrudeLinear', { params: { height: 0 }, inputs: [profile] })).toThrow(
      /profile\.extrudeLinear: height/
    )
  })

  it('needs exactly one operand to extrude, and none to build a profile', () => {
    expect(acceptsOperandCount('profile.roundedRectangle', 0)).toBe(true)
    expect(acceptsOperandCount('profile.roundedRectangle', 1)).toBe(false)
    expect(acceptsOperandCount('profile.extrudeLinear', 1)).toBe(true)
    expect(acceptsOperandCount('profile.extrudeLinear', 0)).toBe(false)
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

  it('boolean.intersect keeps only the volume every input shares (TODO/ui-014)', () => {
    // Two 10 mm cubes offset by 6 mm along X overlap in a 4 × 10 × 10 slab.
    const a = build('primitive.cuboid', { params: { size: [10, 10, 10], center: [-3, 0, 0] } })
    const b = build('primitive.cuboid', { params: { size: [10, 10, 10], center: [3, 0, 0] } })
    expect(boundsOf(build('boolean.intersect', { inputs: [a, b] }))).toEqual([
      [-2, -5, -5],
      [2, 5, 5],
    ])
  })

  it('boolean.intersect is a 2-or-more operand op, like the other two booleans', () => {
    expect(registry['boolean.intersect']).toMatchObject({ kind: 'native', operandCount: '2+' })
    expect(acceptsOperandCount('boolean.intersect', 1)).toBe(false)
    expect(acceptsOperandCount('boolean.intersect', 2)).toBe(true)
    expect(acceptsOperandCount('boolean.intersect', 5)).toBe(true)
    // It is an *operation*, not a catalogue row: the Library panel is built by
    // iterating `primitive.*` entries with `ui` metadata, and an operation that
    // leaked in there would be the undifferentiated create/operate dropdown
    // CLAUDE.md's Interaction Model rules out.
    expect(registry['boolean.intersect'].ui).toBeUndefined()
  })

  // TODO/ui-015: unlike the booleans above, `group.assemble` keeps every operand's
  // own geometry intact — addressable by name — rather than collapsing them into one
  // combined solid. Its `combine()` still unions the same way `boolean.union` does,
  // which is the cross-check every test below leans on: grouping must not silently
  // lose or double geometry relative to the boolean it otherwise resembles.
  describe('group.assemble — TODO/ui-015', () => {
    it('is a 2-or-more operand op, like the booleans, and carries no ui metadata', () => {
      expect(registry['group.assemble']).toMatchObject({ kind: 'native', operandCount: '2+' })
      expect(acceptsOperandCount('group.assemble', 1)).toBe(false)
      expect(acceptsOperandCount('group.assemble', 2)).toBe(true)
      expect(acceptsOperandCount('group.assemble', 5)).toBe(true)
      // Same reasoning as boolean.intersect above: an operation must never leak
      // into the Library panel's creation rows.
      expect(registry['group.assemble'].ui).toBeUndefined()
    })

    it('builds a Group whose names/parts match the given names 1:1, one part per operand', () => {
      const a = build('primitive.cuboid', { params: { size: [10, 10, 10], center: [-10, 0, 0] } })
      const b = build('primitive.cuboid', { params: { size: [10, 10, 10], center: [10, 0, 0] } })
      const result = /** @type {any} */ (
        build('group.assemble', { params: { names: ['Cube 1', 'Cube 2'] }, inputs: [a, b] })
      )
      expect(isGroup(result)).toBe(true)
      expect(result.names).toEqual(['Cube 1', 'Cube 2'])
      expect(result.parts['Cube 1']).toBe(a)
      expect(result.parts['Cube 2']).toBe(b)
    })

    it('accepts 3 or more operands, one part per name, in order', () => {
      const a = build('primitive.cuboid', { params: { size: [10, 10, 10], center: [-20, 0, 0] } })
      const b = build('primitive.cuboid', { params: { size: [10, 10, 10], center: [0, 0, 0] } })
      const c = build('primitive.cuboid', { params: { size: [10, 10, 10], center: [20, 0, 0] } })
      const result = /** @type {any} */ (
        build('group.assemble', { params: { names: ['A', 'B', 'C'] }, inputs: [a, b, c] })
      )
      expect(result.names).toEqual(['A', 'B', 'C'])
      expect(result.parts).toEqual({ A: a, B: b, C: c })
    })

    it("combine()'s output volume equals boolean.union's for the same inputs — grouping loses nothing", () => {
      // Overlapping, not just adjacent, so a naive implementation that dropped or
      // double-counted a part would show up as a volume mismatch rather than
      // being masked by the two solids not sharing any space at all.
      const a = build('primitive.cuboid', { params: { size: [10, 10, 10], center: [-3, 0, 0] } })
      const b = build('primitive.cuboid', { params: { size: [10, 10, 10], center: [3, 0, 0] } })
      const grouped = /** @type {any} */ (
        build('group.assemble', { params: { names: ['A', 'B'] }, inputs: [a, b] })
      )
      const groupVolume = measurements.measureVolume(combine(grouped))
      const unionVolume = measurements.measureVolume(
        /** @type {Geom3} */ (build('boolean.union', { inputs: [a, b] }))
      )
      expect(groupVolume).toBeCloseTo(unionVolume, 6)
    })

    it('throws when names has a different length than inputs', () => {
      const a = build('primitive.cuboid', { params: { size: [10, 10, 10] } })
      const b = build('primitive.cuboid', { params: { size: [10, 10, 10], center: [20, 0, 0] } })
      expect(() =>
        build('group.assemble', { params: { names: ['only-one'] }, inputs: [a, b] })
      ).toThrow(/one name per operand/)
      expect(() => build('group.assemble', { params: {}, inputs: [a, b] })).toThrow(
        /one name per operand/
      )
      expect(() =>
        build('group.assemble', { params: { names: ['a', 'b', 'c'] }, inputs: [a, b] })
      ).toThrow(/one name per operand/)
    })

    it('throws on duplicate names rather than silently overwriting a part (group.js add() assigns by name)', () => {
      const a = build('primitive.cuboid', { params: { size: [10, 10, 10] } })
      const b = build('primitive.cuboid', { params: { size: [10, 10, 10], center: [20, 0, 0] } })
      expect(() =>
        build('group.assemble', { params: { names: ['Cube 1', 'Cube 1'] }, inputs: [a, b] })
      ).toThrow(/unique/)
    })
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

// ---------------------------------------------------------------------------
// TODO/core-013 — group.snap / group.align
//
// Every case below reproduces a **real** call from the user's own `.jscad`
// projects, cited by file:line, rather than an invented arrangement of boxes;
// `recipes/__fixtures__/group-snap-align.real-usage.md` is the table those
// citations come from. The arithmetic itself is `core-001`'s, already covered by
// `group.spec.js` — what these tests are for is the *wiring*: that a document
// record can reach it, and that a sub-part address survives the fold.
// ---------------------------------------------------------------------------

/** Params every bolt in these tests is built from — the shape `index.spec.js` uses. */
const BOLT = { spec: 'm10 hex', length: 20, fit: 'loose' }

/**
 * Evaluate records and hand back the value bound to `id`.
 *
 * @param {any[]} records
 * @param {string} id
 * @returns {any}
 */
function valueOf(records, id) {
  return got(evaluate(records).byId, id)
}

/**
 * The value bound to `id`, failing the test rather than handing back `undefined` —
 * every id these tests ask for is one they just evaluated.
 *
 * @param {Map<string, any>} byId
 * @param {string} id
 * @returns {any}
 */
function got(byId, id) {
  const value = byId.get(id)
  if (value === undefined) throw new Error(`nothing bound to id "${id}"`)
  return value
}

describe('group.snap — TODO/core-013', () => {
  it('registers as a two-operand operation, not a creation row', () => {
    // CLAUDE.md's creation-vs-operation rule: snapping needs a thing to move *and*
    // a thing to move against, so it must never be offered at zero or one selected.
    expect(registry['group.snap']).toMatchObject({ kind: 'native' })
    expect(acceptsOperandCount('group.snap', 0)).toBe(false)
    expect(acceptsOperandCount('group.snap', 1)).toBe(false)
    expect(acceptsOperandCount('group.snap', 2)).toBe(true)
    expect(registry['group.snap']?.ui).toBeUndefined()
  })

  it('snaps a whole solid against another, both delta signs (laptop-stand.jscad:52-53)', () => {
    // `.snap(body, "x", "inside-", 2.5)` / `.snap(body, "y", "inside+", -2.5)` —
    // survey pattern 1: `this` is a bare solid, so no piece names anywhere.
    const base = [
      { id: 'body', op: 'primitive.cuboid', params: { size: [100, 60, 20] } },
      { id: 'foot', op: 'primitive.cuboid', params: { size: [10, 10, 5] } },
    ]
    const inside = valueOf(
      [
        ...base,
        {
          id: 'placed',
          op: 'group.snap',
          target: 'foot',
          operands: ['body'],
          params: { axes: 'x', orientation: 'inside-', deltaMm: 2.5 },
        },
      ],
      'placed'
    )
    // `inside-` flushes the moving min to the reference min; +2.5 holds it proud of it.
    expect(boundsOf(inside)[0][0]).toBeCloseTo(-50 + 2.5, 9)

    const outside = valueOf(
      [
        ...base,
        {
          id: 'placed',
          op: 'group.snap',
          target: 'foot',
          operands: ['body'],
          params: { axes: 'y', orientation: 'inside+', deltaMm: -2.5 },
        },
      ],
      'placed'
    )
    expect(boundsOf(outside)[1][1]).toBeCloseTo(30 - 2.5, 9)

    // A bare solid in is a bare solid out — nothing is wrapped in a group on the way.
    expect(isGroup(inside)).toBe(false)
  })

  it('drives the offset from a named moving piece and moves the whole group (PiPiece.jscad:263)', () => {
    // `.snap('head', picase, 'z', 'outside+')` — survey pattern 2. The offset comes
    // from the bolt's *head* alone; the thread and tap travel with it.
    const records = [
      { id: 'picase', op: 'primitive.cuboid', params: { size: [80, 50, 30] } },
      { id: 'bolt1', op: 'hardware.bolt', params: BOLT },
      {
        id: 'placed',
        op: 'group.snap',
        target: { id: 'bolt1', pieces: 'head' },
        operands: ['picase'],
        params: { axes: 'z', orientation: 'outside+' },
      },
    ]
    const placed = valueOf(records, 'placed')

    // The group survives the op — this is what lets V1's `.snap(...).snap(...)` chain
    // work at all, and what keeps the hidden `tap` reachable for a later subtract.
    expect(isGroup(placed)).toBe(true)
    expect(placed.names).toEqual(['head', 'thread', 'tap'])

    // head 0..6.5 → its max lands on the case's min (-15), so the offset is -21.5.
    expect(boundsOf(placed.parts.head)[1][2]).toBeCloseTo(-15, 9)
    // and every other part moved by that same -21.5, not by its own offset.
    expect(boundsOf(placed.parts.thread)[0][2]).toBeCloseTo(6.5 - 21.5, 9)
    expect(boundsOf(placed.parts.tap)[1][2]).toBeCloseTo(27.5 - 21.5, 9)

    // Naming no piece measures the whole bolt (max z 27.5) and lands somewhere else
    // entirely — which is what makes the assertion above about `pieces`, not luck.
    const whole = valueOf(
      [...records.slice(0, 2), { ...records[2], target: 'bolt1' }],
      'placed'
    )
    expect(boundsOf(whole.parts.head)[1][2]).toBeCloseTo(6.5 - 42.5, 9)
  })

  it('reaches a named piece of a *different* placed item as the reference (pvc-joints2.jscad:302-303)', () => {
    // `.snap('head', hinge.parts.body, 'x', 'outside-')` — survey pattern 3, the one
    // shape nothing in this project could express before this task: a sub-part on
    // the moving side *and* a sub-part of another document item on the reference side.
    const records = [
      { id: 'hinge', op: 'hardware.bolt', params: BOLT },
      { id: 'anchor1', op: 'kit.anchor', params: {} },
      {
        id: 'placed',
        op: 'group.snap',
        target: { id: 'anchor1', pieces: 'post' },
        operands: [{ id: 'hinge', pieces: 'thread' }],
        params: { axes: 'x', orientation: 'outside-' },
      },
    ]
    const placed = valueOf(records, 'placed')

    // post min x −2.5 flushed to thread max x +5 ⇒ offset 7.5. Each of the three
    // less-specific addressings gives a different number (12, 10, 14.5), so this
    // asserts both piece names were honoured, not just one of them.
    expect(boundsOf(placed.parts.post)[0][0]).toBeCloseTo(5, 9)
    expect(boundsOf(placed.parts.hole)[0][0]).toBeCloseTo(-5 + 7.5, 9)
    expect(placed.names).toEqual(['hole', 'post'])

    /** @param {any} target @param {any} operand */
    const offsetFor = (target, operand) =>
      boundsOf(
        valueOf([...records.slice(0, 2), { ...records[2], target, operands: [operand] }], 'placed')
          .parts.post
      )[0][0] + 2.5
    expect(offsetFor({ id: 'anchor1', pieces: 'post' }, 'hinge')).toBeCloseTo(12, 9)
    expect(offsetFor('anchor1', { id: 'hinge', pieces: 'thread' })).toBeCloseTo(10, 9)
    expect(offsetFor('anchor1', 'hinge')).toBeCloseTo(14.5, 9)
  })

  it('keeps a negative delta negative (solar-panel-bracket.jscad:110,113)', () => {
    // `.snap(mount.parts.negative, 'y', 'outside+', 5)` against
    // `.snap(mount.parts.negative, 'x', 'inside+', -2)` — the same call shape with the
    // delta pointing both ways. A sign silently flipped or clamped to zero here would
    // turn a deliberate clearance into an interference, and both still evaluate.
    const base = [
      { id: 'panel', op: 'primitive.cuboid', params: { size: [100, 60, 10] } },
      { id: 'mount', op: 'primitive.cuboid', params: { size: [10, 10, 10] } },
    ]
    /** @param {number} deltaMm */
    const snapWith = (deltaMm) =>
      boundsOf(
        valueOf(
          [
            ...base,
            {
              id: 'placed',
              op: 'group.snap',
              target: 'mount',
              operands: ['panel'],
              params: { axes: 'y', orientation: 'outside+', deltaMm },
            },
          ],
          'placed'
        )
      )[1][1]

    expect(snapWith(5)).toBeCloseTo(-30 + 5, 9)
    expect(snapWith(-2)).toBeCloseTo(-30 - 2, 9)
    expect(snapWith(5) - snapWith(-2)).toBeCloseTo(7, 9)
    // and no delta at all is flush, not silently offset by something
    expect(snapWith(0)).toBeCloseTo(-30, 9)
  })

  it('chains, the way every real V1 call site does', () => {
    // `.snap(...).snap(...)` is the dominant idiom in the survey. It only works if
    // the first op's result is still a group whose pieces the second can name.
    const placed = valueOf(
      [
        { id: 'picase', op: 'primitive.cuboid', params: { size: [80, 50, 30] } },
        { id: 'rail', op: 'primitive.cuboid', params: { size: [10, 10, 10], center: [40, 0, 0] } },
        { id: 'bolt1', op: 'hardware.bolt', params: BOLT },
        {
          id: 'first',
          op: 'group.snap',
          target: { id: 'bolt1', pieces: 'head' },
          operands: ['picase'],
          params: { axes: 'z', orientation: 'outside+' },
        },
        {
          id: 'second',
          op: 'group.snap',
          target: { id: 'first', pieces: 'head' },
          operands: ['rail'],
          params: { axes: 'x', orientation: 'outside+' },
        },
      ],
      'second'
    )
    expect(placed.names).toEqual(['head', 'thread', 'tap'])
    // the second snap moved x only; the first snap's z result is still standing
    expect(boundsOf(placed.parts.head)[1][2]).toBeCloseTo(-15, 9)
    expect(boundsOf(placed.parts.head)[1][0]).toBeCloseTo(35, 9)
  })

  it('agrees with calcSnap called directly on the same two solids', () => {
    // The op is wiring, not arithmetic — so it must produce exactly what the ported
    // function produces, with no re-derivation of its own.
    const { byId } = evaluate([
      { id: 'body', op: 'primitive.cuboid', params: { size: [100, 60, 20] } },
      { id: 'foot', op: 'primitive.cuboid', params: { size: [10, 10, 5] } },
      {
        id: 'placed',
        op: 'group.snap',
        target: 'foot',
        operands: ['body'],
        params: { axes: 'xy', orientation: 'center+', deltaMm: 1.25 },
      },
    ])
    const expected = calcSnap(got(byId, 'foot'), got(byId, 'body'), 'xy', 'center+', 1.25)
    const before = boundsOf(got(byId, 'foot'))[0]
    const after = boundsOf(got(byId, 'placed'))[0]
    for (const axis of [0, 1, 2]) {
      expect(after[axis] - before[axis]).toBeCloseTo(expected[axis], 9)
    }
  })

  it('rejects the degenerate cases by their existing names, not new messages', () => {
    const base = [
      { id: 'picase', op: 'primitive.cuboid', params: { size: [80, 50, 30] } },
      { id: 'bolt1', op: 'hardware.bolt', params: BOLT },
    ]
    /** @param {any} record */
    const run = (record) => () => evaluate([...base, { id: 'placed', ...record }])
    const ok = { axes: 'z', orientation: 'outside+' }

    // a moving piece that isn't in the group — group.js's own resolvePieces message
    expect(
      run({
        op: 'group.snap',
        target: { id: 'bolt1', pieces: 'nosuchpart' },
        operands: ['picase'],
        params: ok,
      })
    ).toThrow(/no part named "nosuchpart"/)

    // the same on the reference side
    expect(
      run({
        op: 'group.snap',
        target: 'picase',
        operands: [{ id: 'bolt1', pieces: 'nosuchpart' }],
        params: ok,
      })
    ).toThrow(/no part named "nosuchpart"/)

    // an unknown orientation — calcSnap's existing check
    expect(
      run({
        op: 'group.snap',
        target: 'bolt1',
        operands: ['picase'],
        params: { axes: 'z', orientation: 'sideways' },
      })
    ).toThrow(/unknown orientation "sideways"/)

    // pieces named against a bare solid, which has no parts to name
    expect(
      run({
        op: 'group.snap',
        target: { id: 'picase', pieces: 'head' },
        operands: ['bolt1'],
        params: ok,
      })
    ).toThrow(/picase/)
    expect(
      run({
        op: 'group.snap',
        target: 'bolt1',
        operands: [{ id: 'picase', pieces: 'head' }],
        params: ok,
      })
    ).toThrow(/picase/)

    // an unknown axis — axisApply's existing check
    expect(
      run({ op: 'group.snap', target: 'bolt1', operands: ['picase'], params: { axes: 'w', orientation: 'outside+' } })
    ).toThrow(/unknown axis w/)

    // more operands than it can use, rather than silently ignoring the extras
    expect(
      run({ op: 'group.snap', target: 'bolt1', operands: ['picase', 'picase'], params: ok })
    ).toThrow(/group\.snap/)
  })
})

describe('group.align — TODO/core-013', () => {
  it('registers as a two-operand operation with no orientation of its own', () => {
    expect(registry['group.align']).toMatchObject({ kind: 'native' })
    expect(acceptsOperandCount('group.align', 1)).toBe(false)
    expect(acceptsOperandCount('group.align', 2)).toBe(true)
  })

  it('centres a solid on a named piece of a placed group, on all three axes (leafblower.jscad:114)', () => {
    // `.align(part.parts.collar, 'xyz')` — a bare solid centred on another item's
    // sub-part, the reference-side half of survey pattern 3.
    const records = [
      { id: 'part', op: 'hardware.bolt', params: BOLT },
      {
        id: 'drain',
        op: 'primitive.cylinder',
        params: { diameter: 4, height: 20, center: [20, 10, 40] },
      },
      {
        id: 'holes',
        op: 'group.align',
        target: 'drain',
        operands: [{ id: 'part', pieces: 'head' }],
        params: { axes: 'xyz' },
      },
    ]
    const { byId } = evaluate(records)
    const head = pick(got(byId, 'part'), 'head')
    const centred = centroidOf(got(byId, 'holes'))
    const target = centroidOf(head)
    for (const axis of [0, 1, 2]) expect(centred[axis]).toBeCloseTo(target[axis], 9)

    // head's centre is z 3.25; the whole bolt's is 13.75 — so naming the piece is
    // what puts it there, and the test would still pass on the wrong one otherwise.
    expect(centred[2]).toBeCloseTo(3.25, 9)
  })

  it('moves the whole group when a moving piece is named (pvc-joints2.jscad:302)', () => {
    // `.align('head', hinge.parts.pipe, 'xz')` — both sides named, align flavour.
    const { byId } = evaluate([
      { id: 'hinge', op: 'hardware.bolt', params: BOLT },
      { id: 'anchor1', op: 'kit.anchor', params: {} },
      {
        id: 'placed',
        op: 'group.align',
        target: { id: 'anchor1', pieces: 'post' },
        operands: [{ id: 'hinge', pieces: 'thread' }],
        params: { axes: 'xz' },
      },
    ])
    const placed = got(byId, 'placed')
    expect(placed.names).toEqual(['hole', 'post'])

    const expected = calcCenterWith(
      pick(got(byId, 'anchor1'), 'post'),
      'xz',
      pick(got(byId, 'hinge'), 'thread')
    )
    const before = centroidOf(got(byId, 'anchor1').parts.hole)
    const after = centroidOf(placed.parts.hole)
    for (const axis of [0, 1, 2]) {
      expect(after[axis] - before[axis]).toBeCloseTo(expected[axis], 9)
    }
    // y was not named, so nothing moved on it
    expect(after[1]).toBeCloseTo(before[1], 9)
  })

  it('takes a delta, scalar or per-axis, the way calcCenterWith does', () => {
    const base = [
      { id: 'panel', op: 'primitive.cuboid', params: { size: [100, 60, 10] } },
      { id: 'mount', op: 'primitive.cuboid', params: { size: [10, 10, 10], center: [30, 20, 10] } },
    ]
    /** @param {any} deltaMm */
    const alignWith = (deltaMm) =>
      centroidOf(
        valueOf(
          [
            ...base,
            {
              id: 'placed',
              op: 'group.align',
              target: 'mount',
              operands: ['panel'],
              params: { axes: 'xy', ...(deltaMm === undefined ? {} : { deltaMm }) },
            },
          ],
          'placed'
        )
      )
    expect(alignWith(undefined)[0]).toBeCloseTo(0, 9)
    expect(alignWith(4)[0]).toBeCloseTo(4, 9)
    expect(alignWith(-3)[1]).toBeCloseTo(-3, 9)
    expect(alignWith([1, 2, 0])[0]).toBeCloseTo(1, 9)
    expect(alignWith([1, 2, 0])[1]).toBeCloseTo(2, 9)
  })

  it('rejects the same degenerate cases as group.snap', () => {
    const base = [
      { id: 'picase', op: 'primitive.cuboid', params: { size: [80, 50, 30] } },
      { id: 'bolt1', op: 'hardware.bolt', params: BOLT },
    ]
    /** @param {any} record */
    const run = (record) => () => evaluate([...base, { id: 'placed', ...record }])

    expect(
      run({
        op: 'group.align',
        target: { id: 'bolt1', pieces: 'nosuchpart' },
        operands: ['picase'],
        params: { axes: 'z' },
      })
    ).toThrow(/no part named "nosuchpart"/)
    expect(
      run({
        op: 'group.align',
        target: { id: 'picase', pieces: 'head' },
        operands: ['bolt1'],
        params: { axes: 'z' },
      })
    ).toThrow(/picase/)
    expect(
      run({ op: 'group.align', target: 'bolt1', operands: ['picase'], params: { axes: 'q' } })
    ).toThrow(/unknown axis q/)
  })
})

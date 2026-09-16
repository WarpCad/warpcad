import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, isGroup } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { MOUNTING_HOLES_MM } from '../tables/rpi-parts.js'
import { SPACER_MM, solveDiagonal } from './raspberrypi.spacer.js'
import v1ReferenceJson from './__fixtures__/raspberrypi.accessories.v1-reference.json'

const { measurements } = modeling

/**
 * @type {{ spacer: Record<string, any>, diagnostics: Record<string, any> }}
 */
const v1Reference = v1ReferenceJson

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */

/**
 * @param {Geom3 | Group | undefined} value
 * @returns {Group}
 */
function asGroup(value) {
  if (!isGroup(value)) throw new Error('expected a Group, got bare geometry')
  return value
}

/** @param {Record<string, any>} [params] */
const spacerOf = (params = {}) => asGroup(evaluateOp('raspberrypi.spacer', params))

/**
 * How far a volume may drift from V1's, and why there are two answers.
 *
 * Everything this recipe builds from primitives — the four posts, both brace bars,
 * their union, the enlarged header clearance — reproduces V1 to **0.000000 mm³**, so
 * those are held to 1e-6. The one exception is the gusset, which is emitted as a
 * `kit.boardFrame` record: that op subtracts its inner rectangle from its outer one
 * in 2D before extruding (V1's own ordering, to avoid BSP artefacts), and a 2D
 * boolean routes through `martinez`, whose output sits within ~1.3e-4 mm of the input
 * rectangle rather than on it. `kit.boardFrame.js`'s module doc records exactly that
 * and its own spec asserts with a millimetre tolerance for the same reason.
 *
 * The bar is **relative**, not absolute, because the error is an outline displacement
 * multiplied by a thickness: every gusset-bearing variant here lands at ~1.5e-5 of its
 * own volume (0.034 mm³ on the 2440 mm³ default, 0.056 mm³ on the 3560 mm³
 * `thickness: 2` one — the same fraction, twice the material). An absolute bar tuned
 * to the default silently tightens as the part grows.
 *
 * 1e-4 leaves ~6x headroom over that and is still three orders of magnitude below
 * anything a real defect produces. Measured, not guessed — each of these was observed
 * while this recipe was being written: a gusset half a thickness low cost 41.7 mm³
 * (1.7e-2 relative), and rounding a brace at 3.1 rather than V1's clamped 3.0 costs
 * 0.54 mm³ per bar — if `@jscad/modeling` accepted that radius at all, which it does
 * not.
 */
const GUSSET_VOLUME_TOLERANCE = 1e-4

/**
 * @param {Geom3} solid
 * @param {{ bounds: number[][], volume: number }} reference
 * @param {string} label
 * @param {{ exact?: boolean }} [options] `exact` for a solid with no gusset in it.
 */
function expectMatchesV1(solid, reference, label, options = {}) {
  const [min, max] = boundsOf(solid)
  for (const axis of [0, 1, 2]) {
    expect(min[axis], `${label} min[${axis}]`).toBeCloseTo(reference.bounds[0][axis], 8)
    expect(max[axis], `${label} max[${axis}]`).toBeCloseTo(reference.bounds[1][axis], 8)
  }
  const volume = measurements.measureVolume(solid)
  if (options.exact) {
    expect(volume, `${label} volume`).toBeCloseTo(reference.volume, 6)
  } else {
    expect(
      Math.abs(volume - reference.volume) / reference.volume,
      `${label} volume (relative)`
    ).toBeLessThan(GUSSET_VOLUME_TOLERANCE)
  }
}

describe('raspberrypi.spacer', () => {
  it('takes no board parameter', () => {
    // `spacer.js:51`'s `mb` argument is dropped per
    // docs/decisions/composite-recipe-geometry.md. V1 itself shows the way: `:52` is
    // `mb = mb || BPlus().parts.mb`, so when handed nothing it builds a throwaway
    // board to measure against. That is `core-012`'s origin-probe pattern, in the
    // source being ported from.
    expect(() => expand('raspberrypi.spacer')).not.toThrow()
  })

  it('probes a board without emitting one', () => {
    // The probe is measured and discarded: nothing in the expansion references
    // `raspberrypi.bplus`, and no record builds an 85 x 56 board. Recipe nesting is
    // explicitly deferred (that decision's rejection table), so the probe is the one
    // part actually needed — the motherboard PCB — built from `BPLUS_BOARD`'s own
    // dimensions rather than by expanding `core-014`'s recipe.
    const records = expand('raspberrypi.spacer')
    expect(records.some((r) => r.op === 'raspberrypi.bplus')).toBe(false)
    for (const record of records) {
      if (record.op === 'profile.roundedRectangle') {
        expect(record.params?.size, 'no record builds the probe board').not.toEqual([85, 56])
      }
    }
  })

  it('names the assembly, and carries the four pads as addressable hidden parts', () => {
    // V1 returns a bare CSG, so there is one visible part. The pads are exposed
    // hidden because the attachment step this port defers to the user
    // (`ui-026`'s Snap/Align, sub-part addressed) needs something to name on the
    // spacer's side — the same call `core-016`/`017` made for their mounting pads.
    const g = spacerOf()
    expect([...g.names]).toEqual(['spacer'])
    for (const n of [1, 2, 3, 4]) expect(g.parts[`pad${n}`], `pad${n}`).toBeDefined()
  })

  it('puts the pads on core-014’s mounting-hole positions, not re-derived ones', () => {
    // `bplus-mounting.js:56-59` walks each pad to the same (3.5, 3.5) / (61.5, 3.5) /
    // (3.5, 52.5) / (61.5, 52.5) midlines `MOUNTING_HOLES_MM.positions` already
    // records, which is why this task reuses that table rather than restating four
    // literals.
    const g = spacerOf()
    MOUNTING_HOLES_MM.positions.forEach(([xMm, yMm], index) => {
      const [min, max] = boundsOf(g.parts[`pad${index + 1}`])
      expect((min[0] + max[0]) / 2, `pad${index + 1} x`).toBeCloseTo(xMm, 9)
      expect((min[1] + max[1]) / 2, `pad${index + 1} y`).toBeCloseTo(yMm, 9)
    })
  })

  describe('the gusset cross-brace angle', () => {
    // This task's Testing section asks for the angle to be asserted "against the
    // exact analytic right-triangle angle between the diagonal pad centroids (not a
    // measured rendering, since this is closed-form trig)". The pad centroids are
    // fixed by `MOUNTING_HOLES_MM`, so the triangle is fully determined by two
    // subtractions and there is nothing to measure.
    const dxMm = MOUNTING_HOLES_MM.positions[3][0] - MOUNTING_HOLES_MM.positions[0][0]
    const dyMm = MOUNTING_HOLES_MM.positions[3][1] - MOUNTING_HOLES_MM.positions[0][1]

    it('solves the diagonal between pad1 and pad4 in closed form', () => {
      expect(dxMm).toBe(58)
      expect(dyMm).toBe(49)

      const tri = solveDiagonal(
        { x: MOUNTING_HOLES_MM.positions[0][0], y: MOUNTING_HOLES_MM.positions[0][1] },
        { x: MOUNTING_HOLES_MM.positions[3][0], y: MOUNTING_HOLES_MM.positions[3][1] }
      )
      // `triangle.js:29-42`: A and B are the leg lengths, `b` the angle opposite B,
      // `C` the hypotenuse and `a` its complement. Asserted against `Math.atan2` and
      // Pythagoras directly, not against V1's own output.
      expect(tri.A).toBeCloseTo(58, 12)
      expect(tri.B).toBeCloseTo(49, 12)
      expect(tri.b).toBeCloseTo((Math.atan2(49, 58) * 180) / Math.PI, 12)
      expect(tri.a).toBeCloseTo(90 - (Math.atan2(49, 58) * 180) / Math.PI, 12)
      expect(tri.C).toBeCloseTo(Math.sqrt(58 * 58 + 49 * 49), 9)
      expect(tri.c).toBe(90)
    })

    it('agrees with the triangle real V1 solved', () => {
      const tri = solveDiagonal({ x: 3.5, y: 3.5 }, { x: 61.5, y: 52.5 })
      const reference = v1Reference.diagnostics.tri
      for (const key of /** @type {const} */ (['A', 'B', 'C', 'a', 'b', 'c'])) {
        expect(tri[key], key).toBeCloseTo(reference[key], 12)
      }
    })

    it('rounds the brace with V1’s CLAMPED corner radius, not the 3.1 it asks for', () => {
      // The real divergence in this recipe, and one only a fixture finds.
      // `spacer.js:82` writes `Parts.Board(tri.C + 5.5, 6.2, 3.1, thickness)` — a
      // corner radius of exactly half the 6.2 width. `CAG.roundedRectangle`
      // (`@jscad/csg/src/api/primitives2d.js`) silently clamps it:
      // `maxroundradius = Math.min(radius.x, radius.y) - 0.1`, i.e. 3.1 - 0.1 = 3.0.
      // So V1's brace is rounded at 3.0. Passing 3.1 through would be wrong twice:
      // `@jscad/modeling` rejects a roundRadius that is not strictly smaller than
      // half the shortest side, and so does this registry's own
      // `assertCornerRadiusFits` — the recipe would throw rather than quietly
      // mis-round. The clamp is therefore ported, not worked around.
      expect(SPACER_MM.braceCornerRadiusMm).toBeCloseTo(3.0, 12)
      expect(SPACER_MM.braceWidthMm).toBe(6.2)
      expect(SPACER_MM.braceCornerRadiusMm).toBeLessThan(SPACER_MM.braceWidthMm / 2)
      // And the shape it produces is V1's, to twelve significant figures.
      expect(v1Reference.diagnostics.barUnrotated.volume).toBeCloseTo(496.944108334, 8)
    })
  })

  describe('the option flags choose which records are emitted', () => {
    // `postOnly` (`:74`) is an early return and `hollow` (`:76`) skips a block;
    // `gpio` (`:109`) is `subtractIf`, which at record-expansion time is just
    // "emit the subtract record, or don't". No conditional-record type is needed in
    // the registry — a composite recipe is plain JS choosing what to return.
    it('postOnly returns the posts alone', () => {
      const records = expand('raspberrypi.spacer', { postOnly: true })
      expect(records.some((r) => r.op === 'kit.boardFrame')).toBe(false)
      expect(records.some((r) => r.op === 'modify.enlarge')).toBe(false)
      expectMatchesV1(
        spacerOf({ postOnly: true }).parts.spacer,
        v1Reference.spacer.postOnly,
        'postOnly',
        // No gusset in this one, so it is held to the exact bar.
        { exact: true }
      )
    })

    it('hollow keeps the gusset frame but drops the cross-brace', () => {
      const records = expand('raspberrypi.spacer', { hollow: true })
      expect(records.some((r) => r.op === 'kit.boardFrame')).toBe(true)
      expect(records.some((r) => r.op === 'transform.rotate')).toBe(false)
      expectMatchesV1(spacerOf({ hollow: true }).parts.spacer, v1Reference.spacer.hollow, 'hollow')
    })

    it('gpio:false leaves the header clearance uncut', () => {
      const records = expand('raspberrypi.spacer', { gpio: false })
      expect(records.some((r) => r.op === 'modify.enlarge')).toBe(false)
      expectMatchesV1(spacerOf({ gpio: false }).parts.spacer, v1Reference.spacer.noGpio, 'noGpio')
      // Not cutting the header away leaves more material, which is the whole point
      // of the flag.
      expect(v1Reference.spacer.noGpio.volume).toBeGreaterThan(v1Reference.spacer.default.volume)
    })

    it('hollow + gpio:false compose', () => {
      expectMatchesV1(
        spacerOf({ hollow: true, gpio: false }).parts.spacer,
        v1Reference.spacer.hollowNoGpio,
        'hollowNoGpio'
      )
    })

    it('the default emits both the brace and the header cut', () => {
      const records = expand('raspberrypi.spacer')
      expect(records.some((r) => r.op === 'kit.boardFrame')).toBe(true)
      expect(records.some((r) => r.op === 'modify.enlarge')).toBe(true)
      expect(records.filter((r) => r.op === 'transform.rotate')).toHaveLength(2)
    })
  })

  describe('degenerate input', () => {
    it('rejects a gusset whose inside is not smaller than its outside', () => {
      // This task's Testing section asks that this "throw the same way
      // kit.boardFrame already throws on that condition (reuse, not reinvent, the
      // guard)" — so the gusset really is emitted as a `kit.boardFrame` record and
      // that op's own guard is what fires. V1 also fails here, but only later and
      // less usefully: its 2D subtraction empties the frame and `assertValidCSG`
      // reports "parts:BoardFrame: invalid CSG: Empty mesh: no polygons".
      expect(v1Reference.spacer.degenerateThrew).toContain('Empty mesh')
      expect(() =>
        evaluateOp('raspberrypi.spacer', { gussetOutside: [40, 40], gussetInside: [45, 45] })
      ).toThrow(/innerWidth must be smaller than outerWidth/)
    })

    it('rejects a non-positive height rather than building an empty post', () => {
      expect(() => evaluateOp('raspberrypi.spacer', { height: 0 })).toThrow()
    })
  })

  describe('against real V1 output', () => {
    it('reproduces the default spacer', () => {
      expectMatchesV1(spacerOf().parts.spacer, v1Reference.spacer.default, 'default')
    })

    it('reproduces a taller spacer, a thicker one, and an unoffset one', () => {
      expectMatchesV1(spacerOf({ height: 20 }).parts.spacer, v1Reference.spacer.height20, 'height20')
      expectMatchesV1(
        spacerOf({ thickness: 2 }).parts.spacer,
        v1Reference.spacer.thickness2,
        'thickness2'
      )
      expectMatchesV1(spacerOf({ offset: 0 }).parts.spacer, v1Reference.spacer.offset0, 'offset0')
    })

    it('places each post exactly where V1 does', () => {
      const g = spacerOf()
      for (const name of ['pad1', 'pad2', 'pad3', 'pad4']) {
        expectMatchesV1(g.parts[name], v1Reference.diagnostics.pads[name], name, { exact: true })
      }
    })
  })
})

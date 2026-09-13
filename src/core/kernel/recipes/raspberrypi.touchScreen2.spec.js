import { describe, expect, it } from 'vitest'

import { boundsOf, isGroup, sizeOf } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import {
  NO_GO_POWER_MM,
  PI_MOUNTING_POST_OFFSETS_MM,
  SCREEN_MOUNTING_PAD_OFFSETS_MM,
} from './raspberrypi.touchScreen2.js'
import { MOUNTING_HOLES_MM, rpiParts } from '../tables/rpi-parts.js'
import v1ReferenceJson from './__fixtures__/raspberrypi.touch.v1-reference.json'

/**
 * @type {{ screens: Record<string, { names: string[], parts: Record<string, number[][]> }>,
 *   rpi: { parts: Record<string, number[][]> } }}
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

const screen = () => asGroup(evaluateOp('raspberrypi.touchScreen2', {}))

/**
 * @param {Geom3} part
 * @param {readonly [number, number, number]} expected
 */
function expectSize(part, expected) {
  const actual = sizeOf(part)
  for (const axis of [0, 1, 2]) expect(actual[axis]).toBeCloseTo(expected[axis], 6)
}

/**
 * @param {Geom3} part
 * @returns {[number, number, number]}
 */
function centreOf(part) {
  const [min, max] = boundsOf(part)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

describe('raspberrypi.touchScreen2', () => {
  it('takes no board parameter and expands with no params at all', () => {
    expect(() => expand('raspberrypi.touchScreen2')).not.toThrow()
    expect(expand('raspberrypi.touchScreen2').length).toBeGreaterThan(20)
  })

  it('renders V1’s visible part set, less the dropped dimCheck', () => {
    expect([...screen().names].sort()).toEqual(
      v1Reference.screens.touchScreen2.names.filter((n) => n !== 'dimCheck').sort()
    )
  })

  it('sizes the four body panels to the source constants', () => {
    const g = screen()
    // `touch-screen2.js:41-62`. `backPlateZ` is `15.9 - (0.7 + 8.5)`, spelled as the
    // arithmetic because that is how V1 spells it.
    const backPlateZ = 15.9 - (0.7 + 8.5)
    expectSize(g.parts.lens, [143.4, 91.46, 0.7])
    expectSize(g.parts.backPlate, [122.74, 72.96, backPlateZ])
    expectSize(g.parts.overHang, [2, 52, backPlateZ])
    expectSize(g.parts.backPlateCover, [92.87, 32.6, 2])
  })

  it('hangs the overHang off the backPlate’s +x face and centres it on y', () => {
    const g = screen()
    const [backMin, backMax] = boundsOf(g.parts.backPlate)
    const [hangMin] = boundsOf(g.parts.overHang)
    // `snap(backPlate, 'x', 'outside-')` is SNAP_SIDES [1, 0]: the mover's min goes on
    // the reference's max. The name reads like "below" and means the opposite.
    expect(hangMin[0]).toBeCloseTo(backMax[0], 6)
    expect(centreOf(g.parts.overHang)[1]).toBeCloseTo(centreOf(g.parts.backPlate)[1], 6)
    expect(hangMin[2]).toBeCloseTo(backMin[2], 6)
  })

  it('turns screen mounting pads 3 and 4 only', () => {
    // Unlike the 7-inch factory, `touch-screen2.js:97,103` calls `clone()` *before*
    // `rotate()`, so the mutation lands on the throwaway copy and pads 1 and 2 keep
    // their original 5.6 x 12 footprint. Same library method, opposite outcome — which
    // is why this is measured on both recipes rather than assumed from one.
    const g = screen()
    expectSize(g.parts.screenMountingPad1, [5.6, 12, 3])
    expectSize(g.parts.screenMountingPad2, [5.6, 12, 3])
    expectSize(g.parts.screenMountingPad3, [12, 5.6, 3])
    expectSize(g.parts.screenMountingPad4, [12, 5.6, 3])
  })

  it('leaves every pad hole square to its own axis, turned or not', () => {
    // As on the 7-inch recipe: a 32-segment cylinder turned 90 degrees about its own
    // centroid is exactly itself, so the hole can never evidence the rotation. The
    // pads above are the measurement that can.
    const g = screen()
    for (const n of [1, 2, 3, 4]) {
      expectSize(g.parts[`screenMountingPad${n}hole`], [2.75, 2.75, 10])
      const padCentre = centreOf(g.parts[`screenMountingPad${n}`])
      const holeCentre = centreOf(g.parts[`screenMountingPad${n}hole`])
      expect(holeCentre[0], `hole ${n} x`).toBeCloseTo(padCentre[0], 6)
      expect(holeCentre[1], `hole ${n} y`).toBeCloseTo(padCentre[1], 6)
    }
  })

  it('clones each screen mounting pad to its stated offset from pad 1', () => {
    const g = screen()
    // Measured on the holes, not the pads: pads 3 and 4 are turned, so their bounding
    // box centre is the only thing comparable to pad 1's, while the hole centres are
    // the datum V1's own translate numbers are quoted against.
    const origin = centreOf(g.parts.screenMountingPad1hole)
    SCREEN_MOUNTING_PAD_OFFSETS_MM.forEach((offset, index) => {
      const centre = centreOf(g.parts[`screenMountingPad${index + 1}hole`])
      for (const axis of [0, 1, 2]) {
        expect(centre[axis] - origin[axis], `pad ${index + 1} axis ${axis}`).toBeCloseTo(
          offset[axis],
          6
        )
      }
    })
  })

  it('clones each pi mounting post to its stated offset from post 1', () => {
    const g = screen()
    const origin = centreOf(g.parts.piMountingPost1)
    PI_MOUNTING_POST_OFFSETS_MM.forEach((offset, index) => {
      const centre = centreOf(g.parts[`piMountingPost${index + 1}`])
      for (const axis of [0, 1, 2]) {
        expect(centre[axis] - origin[axis], `post ${index + 1} axis ${axis}`).toBeCloseTo(
          offset[axis],
          6
        )
      }
    })
  })

  it('keeps every pad and post individually addressable for ui-016 pick-depth', () => {
    const g = screen()
    for (const n of [1, 2, 3, 4]) {
      expect(g.parts[`screenMountingPad${n}`], `screenMountingPad${n}`).toBeDefined()
      expect(g.parts[`screenMountingPad${n}hole`], `screenMountingPad${n}hole`).toBeDefined()
      expect(g.parts[`piMountingPost${n}`], `piMountingPost${n}`).toBeDefined()
      expect(g.parts[`piMountingPost${n}postHole`], `piMountingPost${n}postHole`).toBeDefined()
    }
    expectSize(g.parts.piMountingPost1, [5, 5, 8.5])
    expectSize(g.parts.piMountingPost1postHole, [2.75, 2.75, 10])
  })

  it('derives the noGoPower marker from the GPIO table, not from an rpi operand', () => {
    // The one call `docs/decisions/composite-recipe-geometry.md` flagged rather than
    // decomposed: `touch-screen2.js:184-193` snaps this marker to `rpi.parts.gpio` on
    // x and y while snapping it to this screen's own `backPlate` on z. With `rpi`
    // dropped there is no gpio to snap to, so the x/y offset is resolved analytically
    // at expansion time — see NO_GO_POWER_MM's own doc comment for the derivation and
    // for exactly what it narrows.
    const g = screen()
    expectSize(g.parts.noGoPower, [10, 3, 1])

    // The derivation, restated independently of the recipe's own arithmetic: in the
    // board's frame V1 puts the GPIO header's midline at x 32.5 / y 52.5
    // (`bplus.js`, ported at raspberrypi.bplus.js:600), and the marker's minimum
    // corner on the header's min-x / max-y corner. The attachment step puts
    // piMountingPost1's centre on mounting hole 1.
    const gpioSize = rpiParts.gpio.params.size
    const [holeX, holeY] = MOUNTING_HOLES_MM.positions[0]
    const expectedFromPost = [32.5 - gpioSize[0] / 2 - holeX, 52.5 + gpioSize[1] / 2 - holeY]

    const postCentre = centreOf(g.parts.piMountingPost1)
    const [noGoMin] = boundsOf(g.parts.noGoPower)
    expect(noGoMin[0] - postCentre[0]).toBeCloseTo(expectedFromPost[0], 6)
    expect(noGoMin[1] - postCentre[1]).toBeCloseTo(expectedFromPost[1], 6)

    // z is the part V1 states in this screen's own frame, and it survives unchanged.
    const [, backMax] = boundsOf(g.parts.backPlate)
    expect(noGoMin[2]).toBeCloseTo(backMax[2], 6)

    // The marker is hidden, exactly as V1 adds it (`touch-screen2.js:191`).
    expect(g.names).not.toContain('noGoPower')
    expect(g.parts.noGoPower).toBeDefined()
    expect(NO_GO_POWER_MM.sizeMm).toEqual([10, 3, 1])
  })

  it('drops the dimCheck development rulers', () => {
    const g = screen()
    for (const key of Object.keys(g.parts)) expect(key).not.toMatch(/dimCheck/)
  })

  describe('against the real V1 output', () => {
    // Same fixture, same procedure and same reasoning as
    // raspberrypi.touchDisplay7inch.spec.js's block of this name — see there.

    /**
     * @param {string} v1Name
     * @returns {string | null}
     */
    const portNameOf = (v1Name) => {
      if (v1Name.startsWith('dimCheck')) return null
      const padLeaf = /^(screenMountingPad\d)pad$/.exec(v1Name)
      if (padLeaf) return padLeaf[1]
      const postLeaf = /^(piMountingPost\d)post$/.exec(v1Name)
      return postLeaf ? postLeaf[1] : v1Name
    }

    it('reproduces every V1 part’s lens-relative bounding box', () => {
      const reference = v1Reference.screens.touchScreen2
      const [v1LensMin] = reference.parts.lens
      const g = screen()
      const [lensMin] = boundsOf(g.parts.lens)
      let checked = 0

      for (const v1Name of Object.keys(reference.parts)) {
        const portName = portNameOf(v1Name)
        if (portName === null) continue
        const part = g.parts[portName]
        expect(part, `V1 part ${v1Name} has no counterpart named ${portName}`).toBeDefined()
        const [min, max] = boundsOf(part)
        const [v1Min, v1Max] = reference.parts[v1Name]
        for (const axis of [0, 1, 2]) {
          expect(min[axis] - lensMin[axis], `${v1Name} min[${axis}]`).toBeCloseTo(
            v1Min[axis] - v1LensMin[axis],
            9
          )
          expect(max[axis] - lensMin[axis], `${v1Name} max[${axis}]`).toBeCloseTo(
            v1Max[axis] - v1LensMin[axis],
            9
          )
        }
        checked += 1
      }
      expect(checked).toBeGreaterThanOrEqual(20)
    })

    it('reproduces the noGoPower marker V1 positions against the real GPIO', () => {
      // This is the narrowing's actual size, measured rather than asserted to be
      // small: for a stock BPlus attached at the stock datum it is zero — the derived
      // constant reproduces V1's own marker to the nanometre. It becomes a real
      // divergence only for a screen attached to something other than a stock B+, or
      // not attached at all.
      const reference = v1Reference.screens.touchScreen2
      const [v1LensMin] = reference.parts.lens
      const g = screen()
      const [lensMin] = boundsOf(g.parts.lens)
      const [min, max] = boundsOf(g.parts.noGoPower)
      const [v1Min, v1Max] = reference.parts.noGoPower
      for (const axis of [0, 1, 2]) {
        expect(min[axis] - lensMin[axis]).toBeCloseTo(v1Min[axis] - v1LensMin[axis], 9)
        expect(max[axis] - lensMin[axis]).toBeCloseTo(v1Max[axis] - v1LensMin[axis], 9)
      }
    })

    it('lands piMountingPost1 on the Pi’s hole1 and mb when the ui-026 step is applied', () => {
      const g = screen()
      const [postMin, postMax] = boundsOf(g.parts.piMountingPost1)
      const [holeMin, holeMax] = v1Reference.rpi.parts.hole1
      const [mbMin] = v1Reference.rpi.parts.mb

      const shift = [
        (holeMin[0] + holeMax[0]) / 2 - (postMin[0] + postMax[0]) / 2,
        (holeMin[1] + holeMax[1]) / 2 - (postMin[1] + postMax[1]) / 2,
        mbMin[2] - postMax[2],
      ]
      const reference = v1Reference.screens.touchScreen2.parts.piMountingPost1
      for (const axis of [0, 1, 2]) {
        expect(postMin[axis] + shift[axis], `attached min[${axis}]`).toBeCloseTo(
          reference[0][axis],
          9
        )
      }
    })
  })
})

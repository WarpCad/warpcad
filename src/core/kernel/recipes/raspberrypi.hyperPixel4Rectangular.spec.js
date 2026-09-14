import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, isGroup, sizeOf, volumeOf } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { HYPERPIXEL4_MM, PAD_OFFSETS_MM } from './raspberrypi.hyperPixel4Rectangular.js'
import v1ReferenceJson from './__fixtures__/raspberrypi.smallDisplays.v1-reference.json'

/**
 * @type {{ factories: Record<string, { names: string[], parts: Record<string, number[][]>,
 *   combined: number[][] | null }> }}
 */
const v1Reference = v1ReferenceJson

// See group.js: default import, not named, so this runs under raw Node ESM too.
const { booleans, primitives } = modeling

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

const screen = () => asGroup(evaluateOp('raspberrypi.hyperPixel4Rectangular', {}))

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

describe('raspberrypi.hyperPixel4Rectangular', () => {
  it('takes no board parameter and expands with no params at all', () => {
    // `hyper-pixel-4-rectangular.js:17` takes `rpi` and uses it only for the closing
    // `align`/`snap` attachment at `:57-59`, which this port drops in favour of the
    // user's own `ui-026` Snap/Align step. TODO/core-017.
    expect(() => expand('raspberrypi.hyperPixel4Rectangular')).not.toThrow()
  })

  it('renders V1’s visible part set', () => {
    expect([...screen().names].sort()).toEqual(
      [...v1Reference.factories.hyperPixel4Rectangular.names].sort()
    )
  })

  it('leaves the board’s bounding box unchanged by the notch and the 180° turn', () => {
    // `:27` subtracts the notch from the board and `:55` turns the whole group about
    // the board. The notch is cut out of the middle of one long edge and the board is
    // centred on the origin in plan, so neither step may move the outline.
    const board = screen().parts.mb
    expectSize(board, [HYPERPIXEL4_MM.xMm, HYPERPIXEL4_MM.yMm, HYPERPIXEL4_MM.thicknessMm])
    const centre = centreOf(board)
    expect(centre[0]).toBeCloseTo(0, 9)
    expect(centre[1]).toBeCloseTo(0, 9)
  })

  it('confirms the notch is really cut, by volume', () => {
    // A bounding-box check cannot see a subtraction that never happened — this is the
    // assertion that does.
    //
    // Only part of the notch bites. `:26` pushes it 2mm *past* the edge it was just
    // snapped to, so of its 10.1mm width only 8.1mm overlaps the board; the two r=1.5
    // corners on the overhanging side are cut off in mid-air and only the two inboard
    // ones give material back.
    const board = screen().parts.mb
    const slabMm3 = HYPERPIXEL4_MM.xMm * HYPERPIXEL4_MM.yMm * HYPERPIXEL4_MM.thicknessMm
    const bitingWidthMm = HYPERPIXEL4_MM.notchXMm - HYPERPIXEL4_MM.notchInsetMm
    const squareBiteMm3 = bitingWidthMm * HYPERPIXEL4_MM.notchYMm * HYPERPIXEL4_MM.thicknessMm
    const removed = slabMm3 - volumeOf(board)
    expect(removed).toBeGreaterThan(squareBiteMm3 * 0.99)
    expect(removed).toBeLessThan(squareBiteMm3)
  })

  it('turns the notch to the other end of the board, which is what the rotate is for', () => {
    // The turn's only visible consequence on `mb` is *where* the notch ends up: V1
    // builds it against the board's +x edge and `group.rotate('mb', 'z', 180)` swings
    // it round to -x. The bounding box is invariant under the turn by construction
    // (above), so this weighs the two halves instead — the bitten one is lighter.
    const board = screen().parts.mb
    const [min, max] = boundsOf(board)
    const midX = (min[0] + max[0]) / 2
    const halfWidth = (max[0] - min[0]) / 2

    /** @param {number} centreX */
    const halfVolume = (centreX) =>
      volumeOf(
        booleans.intersect(
          board,
          primitives.cuboid({
            size: [halfWidth, max[1] - min[1] + 2, max[2] - min[2] + 2],
            center: [centreX, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
          })
        )
      )

    const minusX = halfVolume(midX - halfWidth / 2)
    const plusX = halfVolume(midX + halfWidth / 2)
    // The -x half is missing the notch; the +x half is a plain rounded half-slab.
    expect(minusX).toBeLessThan(plusX)
    // The whole difference between the halves is the bite, less the two r=1.5
    // corners on the notch's inboard edge — the same 0.25% shortfall the volume test
    // above allows for.
    const squareBiteMm3 =
      (HYPERPIXEL4_MM.notchXMm - HYPERPIXEL4_MM.notchInsetMm) *
      HYPERPIXEL4_MM.notchYMm *
      HYPERPIXEL4_MM.thicknessMm
    expect((plusX - minusX) / squareBiteMm3).toBeGreaterThan(0.99)
    expect((plusX - minusX) / squareBiteMm3).toBeLessThan(1)
    // And the notch as *built* overhangs the edge, which is why only 8.1mm of its
    // 10.1mm width bites — stated here so the constant and the measurement agree.
    const [notchMinX] = HYPERPIXEL4_MM.notchXSpanAfterTurnMm
    expect(notchMinX).toBeLessThan(min[0])
  })

  it('places the four pads under the board at V1’s offsets, turned with it', () => {
    const g = screen()
    const origin = centreOf(g.parts.pad1)
    PAD_OFFSETS_MM.forEach((offsetMm, index) => {
      const pad = g.parts[`pad${index + 1}`]
      expect(pad, `pad${index + 1}`).toBeDefined()
      expectSize(pad, [HYPERPIXEL4_MM.padDiameterMm, HYPERPIXEL4_MM.padDiameterMm, HYPERPIXEL4_MM.padHeightMm])
      const centre = centreOf(pad)
      // The whole group is turned 180 degrees about z after the pads are cloned, so
      // each clone offset comes out negated relative to pad 1.
      expect(centre[0] - origin[0], `pad ${index + 1} x`).toBeCloseTo(-offsetMm[0], 9)
      expect(centre[1] - origin[1], `pad ${index + 1} y`).toBeCloseTo(-offsetMm[1], 9)
      // Every pad hangs below the board.
      expect(boundsOf(pad)[1][2]).toBeCloseTo(0, 9)
    })
  })

  describe('against real V1 output', () => {
    // See `raspberrypi.miniPiTFT.spec.js` for the fixture's provenance and the
    // regeneration procedure.
    it('reproduces every V1 part’s bounding box', () => {
      const reference = v1Reference.factories.hyperPixel4Rectangular
      const g = screen()
      let checked = 0
      for (const v1Name of Object.keys(reference.parts)) {
        const part = g.parts[v1Name]
        expect(part, `V1 part ${v1Name} has no counterpart`).toBeDefined()
        const [min, max] = boundsOf(part)
        const [v1Min, v1Max] = reference.parts[v1Name]
        for (const axis of [0, 1, 2]) {
          expect(min[axis], `${v1Name} min[${axis}]`).toBeCloseTo(v1Min[axis], 9)
          expect(max[axis], `${v1Name} max[${axis}]`).toBeCloseTo(v1Max[axis], 9)
        }
        checked += 1
      }
      expect(checked).toBe(6)
    })
  })
})

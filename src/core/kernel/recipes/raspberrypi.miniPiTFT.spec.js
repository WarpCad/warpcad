// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { v1ColorToRecord } from '../colors.js'
import { boundsOf, isGroup, sizeOf, volumeOf } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { MINI_BOARD_MM } from './raspberrypi.miniPiTFT.js'
import v1ReferenceJson from './__fixtures__/raspberrypi.smallDisplays.v1-reference.json'

/**
 * @type {{ factories: Record<string, { names: string[], parts: Record<string, number[][]>,
 *   combined: number[][] | null }> }}
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

const screen = () => asGroup(evaluateOp('raspberrypi.miniPiTFT', {}))

/**
 * @param {Geom3} part
 * @param {readonly [number, number, number]} expected
 */
function expectSize(part, expected) {
  const actual = sizeOf(part)
  for (const axis of [0, 1, 2]) expect(actual[axis]).toBeCloseTo(expected[axis], 6)
}

describe('raspberrypi.miniPiTFT', () => {
  it('takes no board parameter and expands with no params at all', () => {
    // TODO/core-017: `docs/decisions/composite-recipe-geometry.md`'s Family B table
    // lists this factory as taking an external `piMotherBoard`. Dropping it is the
    // point; if this op ever needs an operand again, that decision has been reopened.
    expect(() => expand('raspberrypi.miniPiTFT')).not.toThrow()
    expect(expand('raspberrypi.miniPiTFT').length).toBeGreaterThan(20)
  })

  it('renders V1’s visible part set', () => {
    expect([...screen().names].sort()).toEqual(
      [...v1Reference.factories.miniPiTFT.names].sort()
    )
  })

  describe('the board, which V1 carves with two chained bisects', () => {
    // `miniPiTFT.js:90-93`:
    //   RoundedCube(inch(2), inch(1), 2, 2)
    //     .bisect('x',  inch(1.5)).parts.negative
    //     .bisect('y', -inch(0.96)).parts.positive
    //
    // Nested sub-part addressing cannot express that chain (see the recipe's module
    // doc), so the port subtracts the two half-space boxes `bisect` itself would have
    // built. These assertions pin the *result* of the two cuts, measured, which is the
    // only thing that has to agree.

    it('keeps the x-negative half of the cut at inch(1.5)', () => {
      const [min, max] = boundsOf(screen().parts.board)
      expect(min[0]).toBeCloseTo(0, 9)
      // 2in wide, cut at 1.5in keeping the negative side.
      expect(max[0]).toBeCloseTo(MINI_BOARD_MM.xCutMm, 9)
      expect(max[0]).toBeCloseTo(38.1, 9)
    })

    it('keeps the y-positive half of the cut measured back from the far face', () => {
      const [min, max] = boundsOf(screen().parts.board)
      // A *negative* offset measures from the maximum face, so the cut lands at
      // 25.4 - 24.384 = 1.016 and the positive half is everything above it.
      expect(min[1]).toBeCloseTo(MINI_BOARD_MM.yMm - MINI_BOARD_MM.yCutBackMm, 9)
      expect(min[1]).toBeCloseTo(1.016, 9)
      expect(max[1]).toBeCloseTo(MINI_BOARD_MM.yMm, 9)
    })

    it('leaves exactly the two rounded corners the cuts do not reach', () => {
      // A bounding box alone cannot tell a cut from a smaller box, and both cuts here
      // are straight, so both bounds tests above would also pass for a plain
      // `primitive.cuboid`. What distinguishes the real thing is *which* corners are
      // still round: the x cut is a straight slice through the rounded rectangle's
      // long side, so the two right-hand corners come out square; the two left-hand
      // ones survive, and the y cut truncates the lower of them.
      //
      // The expected shortfall is derived here from the 32-gon the kernel actually
      // builds, not measured off the implementation.
      const r = MINI_BOARD_MM.cornerRadiusMm
      const polygonCircleArea = (32 / 2) * Math.sin((2 * Math.PI) / 32) * r * r
      const fullCornerLossMm3 = (r * r - polygonCircleArea / 4) * MINI_BOARD_MM.thicknessMm

      const board = screen().parts.board
      const [min, max] = boundsOf(board)
      const boxVolume = (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2])
      const shortfall = boxVolume - volumeOf(board)

      // More than one whole corner (the untouched top-left one) and less than two
      // (the bottom-left one is truncated by the y cut, so it gives back less than a
      // full corner's worth). A plain cuboid scores 0; an uncut rounded slab scores
      // four corners against a much larger box and fails both bounds tests above.
      expect(shortfall).toBeGreaterThan(fullCornerLossMm3)
      expect(shortfall).toBeLessThan(2 * fullCornerLossMm3)
    })

    it('is 2mm thick, sitting on z = 0', () => {
      const [min, max] = boundsOf(screen().parts.board)
      expect(min[2]).toBeCloseTo(0, 9)
      expect(max[2]).toBeCloseTo(MINI_BOARD_MM.thicknessMm, 9)
    })
  })

  it('flares the display clearance outward, because V1 chamfers it by a NEGATIVE radius', () => {
    // `miniPiTFT.js:123-127` is `display.stretch('z', 5).chamfer(-5, 'z+')`. The TODO
    // file's Proposed fix reads only the stretch and asks for "one correctly-sized
    // primitive.cuboid" — which would be 10mm too small in x and y, because
    // `util.chamfer`'s slicer insets by `-radius * 2`, so a negative radius *grows*
    // the face instead of bevelling it. For a clearance volume that is a real error,
    // not a cosmetic one.
    const g = screen()
    const display = sizeOf(g.parts.display)
    const clearance = sizeOf(g.parts['display-clearance'])
    // 4 decimal places on the flared axes, not the 9 everything else here uses:
    // `fillet.js`'s `sectionAt` reads a cross-section through `project`, whose
    // `unionGeom2` round-trip inflates the outline by a shape-dependent ~8e-6mm. On
    // an inward rim that lands inside the remainder and never shows; on an outward
    // flare the loft *is* the outline, so it leaks into the bounding box. 8 nanometres
    // on a 35mm clearance volume, and pre-existing — see `fillet.spec.js`, which
    // already allowed for it on ordinary rim ops.
    expect(clearance[0]).toBeCloseTo(display[0] + 10, 4)
    expect(clearance[1]).toBeCloseTo(display[1] + 10, 4)
    // The stretch, which the TODO did read correctly: +5mm of z. Exact — the flare
    // changes the section, never the band's height.
    expect(clearance[2]).toBeCloseTo(display[2] + 5, 9)

    // And it is a flare, not a box: only the top 5mm reaches full width, so the solid
    // fills roughly 60% of its own bounding box. A `primitive.cuboid` of the same
    // extents would score 1.0 and a merely-stretched display would fail the size
    // checks above.
    const [min, max] = boundsOf(g.parts['display-clearance'])
    const boxVolume = (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2])
    const fill = volumeOf(g.parts['display-clearance']) / boxVolume
    expect(fill).toBeGreaterThan(0.5)
    expect(fill).toBeLessThan(0.8)
  })

  it('builds the standoff from a real tube, diameters not radii', () => {
    // `Parts.Tube(outsideDiameter, insideDiameter, height)` (`jscad-utils/src/parts.js:371`)
    // takes diameters, which is exactly `primitive.tube`'s `diameter`/`innerDiameter`/
    // `height`. Checked rather than assumed, per the TODO's own caution.
    const standoff = screen().parts.standoff
    expectSize(standoff, [7, 7, 8.5])
    const solidCylinder = Math.PI * 3.5 ** 2 * 8.5
    const bore = Math.PI * 1.5 ** 2 * 8.5
    // 32 segments, so both are polygonal and read a little under the true circle.
    expect(volumeOf(standoff)).toBeGreaterThan((solidCylinder - bore) * 0.97)
    expect(volumeOf(standoff)).toBeLessThan(solidCylinder - bore)
  })

  it('rounds each button cap’s top rim through the registry’s own op', () => {
    // `Parts.Cylinder(4, 3).fillet(1, 'z+')` (`miniPiTFT.js:44`) is exactly
    // `modify.filletRim`'s signature — radius, then face orientation — so this needs
    // no adaptation and the port should not be re-deriving the rounded solid.
    //
    // Asserted structurally rather than by volume, deliberately: V1 unions the
    // filleted cylinder with a bisected disc before anything measures it, so no
    // public part isolates the fillet's own contribution, and `fillet.spec.js`
    // already measures the op itself. What is worth pinning here is that the recipe
    // reaches for that op with V1's arguments instead of approximating it.
    const records = expand('raspberrypi.miniPiTFT')
    const fillets = records.filter((record) => record.op === 'modify.filletRim')
    expect(fillets).toHaveLength(2)
    for (const fillet of fillets) {
      expect(fillet.params).toMatchObject({ radius: 1, orientation: 'z+' })
    }
    // A rim fillet takes material off the rim only, so the cap's own extents are
    // untouched — this is what says it was applied to the cap and not to the disc.
    const cap = screen().parts.buttonCap1
    expectSize(cap, [5.5, 6, 3])
  })

  it('hides every clearance, cap and standoff volume, exactly as V1 does', () => {
    const g = screen()
    for (const hidden of [
      'display-clearance',
      'buttonCap1',
      'buttonCap2',
      'buttonCap1-clearance',
      'buttonCap2-clearance',
      'button-connector',
      'button-connector-clearance',
      'standoff',
      'button1-base',
      'button1-push',
    ]) {
      expect(g.parts[hidden], `${hidden} must exist`).toBeDefined()
      expect(g.names, `${hidden} must not be visible`).not.toContain(hidden)
    }
  })

  describe('against real V1 output', () => {
    // The fixture: `recipes/__fixtures__/raspberrypi.smallDisplays.v1-reference.json`.
    //
    // Both `core-015` and `core-016` reversed their own TODO file's "no fixture" call
    // and both said the fixture earned its keep immediately. This task's own Testing
    // section asks for that judgement to be made again rather than copied, so: build
    // one, for a reason neither of those had. Four of V1's behaviours here are
    // readable only from the `jscad-utils` *implementation* and at least two of them
    // are mis-stated in this task's own Proposed fix —
    //
    //   1. `util.calcmidlineTo` (`jscad-utils/src/util.js:874`) returns `to - size/2`
    //      as a *relative* translate and never reads where the solid already is;
    //   2. `util.chamfer` with a negative radius flares outward (above);
    //   3. `PiTFT24`'s `buttonWire` variable is never reassigned, so its own
    //      clearance is measured from the pre-snap solid (see that recipe's spec);
    //   4. `bisect`'s negative offset measures back from the maximum face.
    //
    // A hand-written assertion for any of those restates the reading it is meant to
    // check. The fixture does not.
    //
    // To regenerate: in a checkout of jscad-raspberrypi at 62a8e3b, add a vitest file
    // that calls each factory with NO board argument and writes `group.names` plus
    // `parts[name].getBounds()` as JSON (it must run under vitest, not bare node —
    // jscad-utils uses extensionless imports that need a bundler to resolve).
    //
    // Unlike core-016's touch fixture there is no lens-relative trick: called with no
    // board, V1's own `if (piMotherBoard)` guard skips the attachment translate, so
    // these bounds are already in the standalone frame this port emits.

    /**
     * V1's `Group.add(group, name, hidden, subparts)` stores the combined group under
     * `name` *and* every leaf under `subparts + key`. A `buttonCap` group has one
     * visible member, so `buttonCap1` and `buttonCap1-cap` are the same solid; this
     * port emits one part for both, under the shorter name.
     *
     * @param {string} v1Name
     * @returns {string | null}
     */
    const portNameOf = (v1Name) => {
      const capAlias = /^(buttonCap\d)-cap$/.exec(v1Name)
      return capAlias ? capAlias[1] : v1Name
    }

    it('reproduces every V1 part’s bounding box', () => {
      const reference = v1Reference.factories.miniPiTFT
      const g = screen()
      let checked = 0
      for (const v1Name of Object.keys(reference.parts)) {
        const portName = portNameOf(v1Name)
        if (portName === null) continue
        const part = g.parts[portName]
        expect(part, `V1 part ${v1Name} has no counterpart named ${portName}`).toBeDefined()
        const [min, max] = boundsOf(part)
        const [v1Min, v1Max] = reference.parts[v1Name]
        // 9 decimal places: the two kernels tessellate independently, so agreeing to
        // a nanometre is agreement, not a shared rounding. The one exception is the
        // outward-flared clearance volume, whose outline picks up `project`'s ~8e-6mm
        // union round-trip — see the flare test above.
        const digits = v1Name === 'display-clearance' ? 4 : 9
        for (const axis of [0, 1, 2]) {
          expect(min[axis], `${v1Name} min[${axis}]`).toBeCloseTo(v1Min[axis], digits)
          expect(max[axis], `${v1Name} max[${axis}]`).toBeCloseTo(v1Max[axis], digits)
        }
        checked += 1
      }
      expect(checked).toBeGreaterThanOrEqual(18)
    })
  })
})

describe('raspberrypi.miniPiTFT: colour (TODO/core-033)', () => {
  /** @param {string} name */
  const recordFor = (name) => expand('raspberrypi.miniPiTFT').find((r) => r.name === name)

  it('board is opaque darkgreen (:93 — no alpha, unlike hat/bplus)', () => {
    const board = recordFor('board')
    expect(board).toMatchObject(v1ColorToRecord('darkgreen'))
    expect(board?.colorAlpha).toBeUndefined()
  })

  it('screen is white, display is black, display-clearance is red', () => {
    expect(recordFor('screen')).toMatchObject(v1ColorToRecord('white'))
    expect(recordFor('display')).toMatchObject(v1ColorToRecord('black'))
    expect(recordFor('display-clearance')).toMatchObject({ ...v1ColorToRecord('red'), hidden: true })
  })

  it('button1/button2 are uncoloured, but their base/push leaves carry V1’s own colours', () => {
    for (const name of ['button1', 'button2']) {
      expect(recordFor(name)?.color).toBeUndefined()
      expect(recordFor(`${name}-base`)).toMatchObject({ ...v1ColorToRecord('silver'), hidden: true })
      expect(recordFor(`${name}-push`)).toMatchObject({ ...v1ColorToRecord('black'), hidden: true })
    }
  })

  it('buttonCap1/2 are blue; their -clearance is left uncoloured (the module’s own canonical example)', () => {
    for (const name of ['buttonCap1', 'buttonCap2']) {
      expect(recordFor(name)).toMatchObject({ ...v1ColorToRecord('blue'), hidden: true })
      const clearance = recordFor(`${name}-clearance`)
      expect(clearance).toBeDefined()
      expect(clearance?.color).toBeUndefined()
    }
  })

  it('button-connector is blue, button-connector-clearance is red', () => {
    expect(recordFor('button-connector')).toMatchObject({ ...v1ColorToRecord('blue'), hidden: true })
    expect(recordFor('button-connector-clearance')).toMatchObject({
      ...v1ColorToRecord('red'),
      hidden: true,
    })
  })

  it('standoff is yellow', () => {
    expect(recordFor('standoff')).toMatchObject({ ...v1ColorToRecord('yellow'), hidden: true })
  })
})

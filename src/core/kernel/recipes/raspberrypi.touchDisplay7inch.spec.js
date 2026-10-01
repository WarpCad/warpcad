import { describe, expect, it } from 'vitest'

import { v1ColorToRecord } from '../colors.js'
import { boundsOf, isGroup, sizeOf } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { PI_MOUNTING_PAD_OFFSETS_MM, SCREEN_MOUNTING_PAD_OFFSETS_MM } from './raspberrypi.touchDisplay7inch.js'
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

const screen = () => asGroup(evaluateOp('raspberrypi.touchDisplay7inch', {}))

/**
 * @param {Geom3} part
 * @param {readonly [number, number, number]} expected
 */
function expectSize(part, expected) {
  const actual = sizeOf(part)
  for (const axis of [0, 1, 2]) expect(actual[axis]).toBeCloseTo(expected[axis], 6)
}

/**
 * Bounding-box centre of one part, the datum every clone-translate offset below is
 * measured between.
 *
 * @param {Geom3} part
 * @returns {[number, number, number]}
 */
function centreOf(part) {
  const [min, max] = boundsOf(part)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

describe('raspberrypi.touchDisplay7inch', () => {
  it('takes no board parameter and expands with no params at all', () => {
    // The whole point of TODO/core-016: `docs/decisions/composite-recipe-geometry.md`
    // lists this factory as requiring an external `rpi`, and the decision is to drop
    // it. If this op ever needs an operand again, that decision has been reopened.
    expect(() => expand('raspberrypi.touchDisplay7inch')).not.toThrow()
    expect(expand('raspberrypi.touchDisplay7inch').length).toBeGreaterThan(20)
  })

  it('renders V1’s visible part set, less the dropped dimCheck', () => {
    // `noGoPower` is the one deliberate omission besides dimCheck: V1 shows it, this port
    // hides it by default (TODO/render-005).
    expect([...screen().names].sort()).toEqual(
      v1Reference.screens.touchDisplay7inch.names
        .filter((n) => n !== 'dimCheck' && n !== 'noGoPower')
        .sort()
    )
  })

  it('sizes the lens and backPlate to the source constants', () => {
    const g = screen()
    expectSize(g.parts.lens, [192.96, 110.76, 0.7])
    expectSize(g.parts.backPlate, [166.2, 100.6, 5.96])
    // `touch-display-7inch.js:26-30` — snapped into the lens corner, then offset.
    const [lensMin] = boundsOf(g.parts.lens)
    const [backMin] = boundsOf(g.parts.backPlate)
    expect(backMin[0] - lensMin[0]).toBeCloseTo(11.89, 6)
    expect(backMin[1] - lensMin[1]).toBeCloseTo(3.53, 6)
    // `snap(lens, 'z', 'outside-')` stacks it on the lens's top face.
    expect(backMin[2] - lensMin[2]).toBeCloseTo(0.7, 6)
  })

  it('turns every screen mounting pad, not only pad 1', () => {
    // The TODO spec says only `screenMountingPad1` is rotated. It is wrong, and this
    // is the assertion that says so: `JsCadUtilsGroup.prototype.rotate` is documented
    // "This mutates the group" (`jscad-utils/src/group.js:246-272`), and
    // `touch-display-7inch.js:69` rotates the shared `screenMountingPad` *before*
    // lines 75/81/87 clone it — so all four clones inherit the turn. A 8x12 pad
    // therefore measures 12x8 on all four.
    const g = screen()
    for (const n of [1, 2, 3, 4]) expectSize(g.parts[`screenMountingPad${n}`], [12, 8, 2.5])
  })

  it('measures the pad turn on the pad, because the hole cannot show it', () => {
    // The TODO spec asks for the rotation to be confirmed "by measuring the hole's own
    // bounding box". That check cannot work: the hole is a 32-segment cylinder whose
    // vertices land every 11.25 degrees, so a 90-degree turn maps it exactly onto
    // itself, and it is turned about its own centroid so it does not move either.
    // Asserted here rather than merely noted, so the reason stays checked.
    const g = screen()
    for (const n of [1, 2, 3, 4]) expectSize(g.parts[`screenMountingPad${n}hole`], [3, 3, 10])
    // The turn's real, measurable consequence is the pad's swapped extents, above,
    // plus the fact that the hole sits exactly at the pad's centre.
    const padCentre = centreOf(g.parts.screenMountingPad1)
    const holeCentre = centreOf(g.parts.screenMountingPad1hole)
    expect(holeCentre[0]).toBeCloseTo(padCentre[0], 6)
    expect(holeCentre[1]).toBeCloseTo(padCentre[1], 6)
  })

  it('clones each screen mounting pad to its stated offset from pad 1', () => {
    const g = screen()
    const origin = centreOf(g.parts.screenMountingPad1)
    SCREEN_MOUNTING_PAD_OFFSETS_MM.forEach((offset, index) => {
      const centre = centreOf(g.parts[`screenMountingPad${index + 1}`])
      for (const axis of [0, 1, 2]) {
        expect(centre[axis] - origin[axis], `pad ${index + 1} axis ${axis}`).toBeCloseTo(
          offset[axis],
          6
        )
      }
    })
  })

  it('clones each pi mounting pad to its stated offset from pad 1', () => {
    const g = screen()
    const origin = centreOf(g.parts.piMountingPad1)
    PI_MOUNTING_PAD_OFFSETS_MM.forEach((offset, index) => {
      const centre = centreOf(g.parts[`piMountingPad${index + 1}`])
      for (const axis of [0, 1, 2]) {
        expect(centre[axis] - origin[axis], `pad ${index + 1} axis ${axis}`).toBeCloseTo(
          offset[axis],
          6
        )
      }
    })
  })

  it('keeps every pad and post individually addressable for ui-016 pick-depth', () => {
    // `docs/decisions/composite-recipe-geometry.md`'s closing requirement, and the
    // precondition for the ui-026 attachment step: `piMountingPad1` must be nameable
    // on its own, not folded into one combined solid.
    const g = screen()
    for (const n of [1, 2, 3, 4]) {
      expect(g.parts[`screenMountingPad${n}`], `screenMountingPad${n}`).toBeDefined()
      expect(g.parts[`screenMountingPad${n}hole`], `screenMountingPad${n}hole`).toBeDefined()
      expect(g.parts[`piMountingPad${n}`], `piMountingPad${n}`).toBeDefined()
      expect(g.parts[`piMountingPad${n}pad`], `piMountingPad${n}pad`).toBeDefined()
      expect(g.parts[`piMountingPad${n}post`], `piMountingPad${n}post`).toBeDefined()
    }
    // The pad+post union is the solid the attachment step measures, so it must span
    // both: a 2.5 mm pad with a 13.25 mm post standing on it.
    expectSize(g.parts.piMountingPad1, [8, 12, 15.75])
    expectSize(g.parts.piMountingPad1pad, [8, 12, 2.5])
    expectSize(g.parts.piMountingPad1post, [6, 6, 13.25])
  })

  it('places the noGoPower clearance marker against the backPlate alone', () => {
    // The 7-inch marker is the ordinary case — `touch-display-7inch.js:138-148` snaps
    // it to `backPlate` only. It is the TouchScreen2 one that mixes frames.
    const g = screen()
    expectSize(g.parts.noGoPower, [15, 10, 1])
    const [backMin, backMax] = boundsOf(g.parts.backPlate)
    const [noGoMin] = boundsOf(g.parts.noGoPower)
    expect(noGoMin[0] - backMin[0]).toBeCloseTo(48.45 + 3, 6)
    expect(noGoMin[1] - backMin[1]).toBeCloseTo(30.8 + 49.0, 6)
    expect(noGoMin[2]).toBeCloseTo(backMax[2], 6)
  })

  it('drops the dimCheck development rulers', () => {
    const g = screen()
    for (const key of Object.keys(g.parts)) expect(key).not.toMatch(/dimCheck/)
  })

  describe('against the real V1 output', () => {
    // The assertions above compare this recipe against numbers *this author* read out
    // of `touch-display-7inch.js`, which proves the port matches one reading of V1 —
    // not that it matches V1. This block is the other thing: real bounding boxes
    // dumped from `jscad-raspberrypi@62a8e3b` executing under `@jwc/jscad-utils@6.0.0`.
    //
    // TODO/core-016 scoped this as "no V1 execution fixture ... make your own
    // documented call". The call is to build one, for a reason narrower than
    // core-015's: this port's single largest risk is `Group.rotate`'s *mutation*
    // semantics, which are visible only in the jscad-utils implementation and which
    // the TODO's own Proposed fix read incorrectly. A hand-written assertion for
    // "all four pads are turned" restates the reading it is meant to check; the
    // fixture does not.
    //
    // To regenerate: in a checkout of jscad-raspberrypi at 62a8e3b, add a vitest file
    // that calls `TouchDisplay_7inch(BPlus(2))` and writes `parts[name].getBounds()`
    // as JSON (it must run under vitest, not bare node — jscad-utils uses
    // extensionless imports that need a bundler to resolve).
    //
    // The fixture is in V1's BOARD-ATTACHED frame, because both V1 factories end by
    // aligning the whole screen onto the Pi. That final step is a pure rigid
    // translation, so every assertion here is made LENS-RELATIVE, which is invariant
    // under it — and which is exactly the claim "dropping the rpi parameter changes
    // nothing but the frame".

    /**
     * V1 stores both the combined group under `name` and every leaf under
     * `subparts + key` (`jscad-utils/src/group.js:83-103`). For a screen mounting pad
     * the combined entry and its `…pad` leaf are the same solid (the hole is hidden,
     * so `combine()` skips it), so this port emits one part for both.
     *
     * @param {string} v1Name
     * @returns {string | null}
     */
    const portNameOf = (v1Name) => {
      if (v1Name.startsWith('dimCheck')) return null
      const padLeaf = /^(screenMountingPad\d)pad$/.exec(v1Name)
      return padLeaf ? padLeaf[1] : v1Name
    }

    it('reproduces every V1 part’s lens-relative bounding box', () => {
      const reference = v1Reference.screens.touchDisplay7inch
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
          // 9 decimal places: the two kernels tessellate independently, so agreeing to
          // a nanometre is agreement, not a shared rounding.
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

    it('lands piMountingPad1 on the Pi’s hole1 and mb when the ui-026 step is applied', () => {
      // The dropped step, re-derived: `touch-display-7inch.js:152-154` aligns
      // `piMountingPad1` to `rpi.parts.hole1` on xy and snaps it to `rpi.parts.mb` on
      // z `outside+`. This asserts the recipe's own output satisfies it — i.e. that
      // applying the user's `group.align`/`group.snap` records reproduces V1 exactly.
      const g = screen()
      const [padMin, padMax] = boundsOf(g.parts.piMountingPad1)
      const [holeMin, holeMax] = v1Reference.rpi.parts.hole1
      const [mbMin] = v1Reference.rpi.parts.mb

      // align('xy') puts the pad's centre on hole1's centre.
      const shift = [
        (holeMin[0] + holeMax[0]) / 2 - (padMin[0] + padMax[0]) / 2,
        (holeMin[1] + holeMax[1]) / 2 - (padMin[1] + padMax[1]) / 2,
        // snap(mb, 'z', 'outside+') puts the pad's max on mb's min.
        mbMin[2] - padMax[2],
      ]
      const reference = v1Reference.screens.touchDisplay7inch.parts.piMountingPad1
      for (const axis of [0, 1, 2]) {
        expect(padMin[axis] + shift[axis], `attached min[${axis}]`).toBeCloseTo(
          reference[0][axis],
          9
        )
      }
    })
  })
})

describe('raspberrypi.touchDisplay7inch: colour (TODO/core-033)', () => {
  /** @param {string} name */
  const recordFor = (name) => expand('raspberrypi.touchDisplay7inch').find((r) => r.name === name)

  it('lens is black, backPlate is gray', () => {
    expect(recordFor('lens')).toMatchObject(v1ColorToRecord('black'))
    expect(recordFor('backPlate')).toMatchObject(v1ColorToRecord('gray'))
  })

  it('each screenMountingPadN is blue, its hole is red and hidden', () => {
    for (let n = 1; n <= 4; n += 1) {
      expect(recordFor(`screenMountingPad${n}`)).toMatchObject(v1ColorToRecord('blue'))
      expect(recordFor(`screenMountingPad${n}hole`)).toMatchObject({
        ...v1ColorToRecord('red'),
        hidden: true,
      })
    }
  })

  it('each piMountingPadN is left uncoloured, but its pad/post leaves carry V1’s own colours', () => {
    for (let n = 1; n <= 4; n += 1) {
      expect(recordFor(`piMountingPad${n}`)?.color).toBeUndefined()
      expect(recordFor(`piMountingPad${n}pad`)).toMatchObject({
        ...v1ColorToRecord('green'),
        hidden: true,
      })
      expect(recordFor(`piMountingPad${n}post`)).toMatchObject({
        ...v1ColorToRecord('silver'),
        hidden: true,
      })
    }
  })

  // TODO/render-005: V1 adds `noGoPower` visible (`:147`'s `false`), but this port hides
  // it by default, the same deliberate divergence TODO/render-004 made for
  // `hardware.bolt`'s `tap` — a clearance volume is for a boolean subtract, not to look at.
  it('noGoPower is red but hidden by default (render-005 divergence from V1)', () => {
    const g = screen()
    expect(recordFor('noGoPower')).toMatchObject({ ...v1ColorToRecord('red'), hidden: true })
    expect(g.names).not.toContain('noGoPower')
    expect(g.parts.noGoPower).toBeDefined()
  })
})

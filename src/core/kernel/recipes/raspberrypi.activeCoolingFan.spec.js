import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, isGroup, toGeom3 } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import v1ReferenceJson from './__fixtures__/raspberrypi.accessories.v1-reference.json'

const { measurements } = modeling

/**
 * @type {{ factories: Record<string, any>, spacer: Record<string, any>,
 *   diagnostics: Record<string, any> }}
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

const fan = () => asGroup(evaluateOp('raspberrypi.activeCoolingFan', {}))

describe('raspberrypi.activeCoolingFan', () => {
  it('takes no parameters and no board', () => {
    // `active-cooling-fan.js:9` — the only recipe in the M4 catalogue with no external
    // reference of any kind and no options object. Nothing to drop, nothing to probe.
    expect(() => expand('raspberrypi.activeCoolingFan')).not.toThrow()
  })

  it('renders V1’s one visible part', () => {
    // `:30` — `g.add(board, 'board')`, and that is the whole group.
    expect([...fan().names]).toEqual(v1Reference.factories.activeCoolingFan.names)
  })

  it('reproduces V1’s bounding box and volume exactly', () => {
    // Every offset in this recipe is a literal constant in the source measured
    // against nothing, so this is the one recipe where bounds *and* volume are both
    // computable by hand: a 64 x 42.5 x 1 plate less two notches (6 x 31.3 and
    // 28 x 11.2), plus a 19 x 40 x 9 block and a 30 x 30 x 9 block. The fixture is
    // still diffed against, because the hand calculation is what this task's own
    // Proposed fix asked for and a hand calculation is exactly what a fixture is for.
    const reference = v1Reference.factories.activeCoolingFan.parts.board
    const board = fan().parts.board
    const [min, max] = boundsOf(board)
    for (const axis of [0, 1, 2]) {
      expect(min[axis], `min[${axis}]`).toBeCloseTo(reference.bounds[0][axis], 9)
      expect(max[axis], `max[${axis}]`).toBeCloseTo(reference.bounds[1][axis], 9)
    }
    expect(measurements.measureVolume(board)).toBeCloseTo(reference.volume, 6)

    // The hand calculation, spelled out so a future reader can check the fixture
    // rather than trust it: plate 2720, less 187.8 and 313.6 of notches, is 2218.6.
    // Block 1 is 6840 of which 760 already existed as plate; block 2 is 8100 of
    // which 900 already existed.
    expect(reference.volume).toBeCloseTo(2218.6 + (6840 - 760) + (8100 - 900), 6)
  })

  it('is one solid, not four loose cuboids', () => {
    // A `boolean.subtract`/`boolean.union` chain, not four parts a consumer has to
    // combine: V1 hands back a single `board` CSG and the enclosure code downstream
    // subtracts it as one body.
    const g = fan()
    expect(Object.keys(g.parts)).toEqual(['board'])
    const [min, max] = boundsOf(toGeom3(g))
    expect(min).toEqual(boundsOf(g.parts.board)[0])
    expect(max).toEqual(boundsOf(g.parts.board)[1])
  })

  it('cuts both notches out of the plate rather than only the larger one', () => {
    // `:13-21` subtracts a *union* of two cubes. Emitting the two subtracts in the
    // wrong order, or dropping the `.union(...)` and subtracting only the first, both
    // still produce a plausible-looking fan; the volume is what tells them apart.
    const board = fan().parts.board
    // A plate with neither notch cut would be 900 + 187.8 + 313.6 larger.
    expect(measurements.measureVolume(board)).toBeLessThan(
      v1Reference.diagnostics.fan.plate.volume + 6840 + 8100
    )
    // Both notches are open at z = 0..1: sample a point inside each one.
    const cut1 = v1Reference.diagnostics.fan.cut1.bounds
    const cut2 = v1Reference.diagnostics.fan.cut2.bounds
    for (const cut of [cut1, cut2]) {
      const centre = [0, 1, 2].map((axis) => (cut[0][axis] + cut[1][axis]) / 2)
      // A notch's centre is outside the solid, so a tiny cube there must not
      // intersect it.
      const probe = modeling.primitives.cuboid({
        size: [0.2, 0.2, 0.2],
        center: /** @type {[number, number, number]} */ ([centre[0], centre[1], 0.5]),
      })
      const hit = modeling.booleans.intersect(board, probe)
      expect(measurements.measureVolume(hit), `notch at ${centre}`).toBeCloseTo(0, 9)
    }
  })
})

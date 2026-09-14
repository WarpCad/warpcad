import { describe, expect, it } from 'vitest'

import { boundsOf, isGroup, sizeOf, volumeOf } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { HAT_MM } from './raspberrypi.hat.js'
import { PITFT24_BUTTON_MIDLINES_MM } from './raspberrypi.piTFT24.js'
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

/** @param {Record<string, any>} [params] */
const hat = (params = {}) => asGroup(evaluateOp('raspberrypi.piTFT24', params))

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

describe('raspberrypi.piTFT24', () => {
  it('takes no board parameter and expands with no params at all', () => {
    // Same shape as PiTFT22: `pi-tft24.js:61` forwards `piMotherBoard` into
    // `Hat(piMotherBoard, options)` rather than using it, so dropping it means
    // calling this port's standalone Hat expansion. TODO/core-017.
    expect(() => expand('raspberrypi.piTFT24')).not.toThrow()
    expect(expand('raspberrypi.piTFT24').length).toBeGreaterThan(60)
  })

  it('renders V1’s visible part set', () => {
    expect([...hat().names].sort()).toEqual([...v1Reference.factories.piTFT24.names].sort())
  })

  it('sizes the LCD and its bevel to the source constants', () => {
    const g = hat()
    expectSize(g.parts.lcd, [50, 40, 3.72])
    expectSize(g.parts.lcdbevel, [60, 42, 5.3 - 1.62])
  })

  it('places five buttons 10mm apart, as one visible assembly plus five leaves', () => {
    const g = hat()
    PITFT24_BUTTON_MIDLINES_MM.forEach((midlineMm, index) => {
      const button = g.parts[`button${index + 1}`]
      expect(button, `button${index + 1}`).toBeDefined()
      expect(centreOf(button)[0]).toBeCloseTo(midlineMm, 9)
    })
    // `:110` adds the five under one visible `buttons` entry with `button` as the
    // subpart prefix, so only the combined assembly is in `names`.
    expect(g.names).toContain('buttons')
    expect(g.names).not.toContain('button1')
    const [min, max] = boundsOf(g.parts.buttons)
    expect(min[0]).toBeCloseTo(boundsOf(g.parts.button1)[0][0], 9)
    expect(max[0]).toBeCloseTo(boundsOf(g.parts.button5)[1][0], 9)
  })

  describe('the spacer and gusset assembly', () => {
    // `pi-tft24.js:236-309`, the most complex single piece of geometry in this task:
    // four cylinder-minus-bolt-hole spacers on the Hat's own mounting holes, joined
    // by four connector bars whose length V1 takes from `util.calcSnap` between two
    // *already-built* spacers. That is textbook probe-and-bake, and the assertions
    // below deliberately measure the emitted bars against the emitted spacers rather
    // than against the hole-position constants a second time.

    it('centres each spacer on the Hat’s own mounting hole', () => {
      const g = hat()
      for (const n of [1, 2, 3, 4]) {
        const spacer = g.parts[`spacersspacer${n}`]
        const hole = g.parts[`hathole${n}`]
        expect(spacer, `spacersspacer${n}`).toBeDefined()
        expect(hole, `hathole${n}`).toBeDefined()
        const spacerCentre = centreOf(spacer)
        const holeCentre = centreOf(hole)
        expect(spacerCentre[0], `spacer ${n} x`).toBeCloseTo(holeCentre[0], 9)
        expect(spacerCentre[1], `spacer ${n} y`).toBeCloseTo(holeCentre[1], 9)
        // 6mm outer, hanging below the board's underside.
        expectSize(spacer, [6, 6, HAT_MM.defaultHatHeightMm])
        expect(boundsOf(spacer)[1][2]).toBeCloseTo(0, 9)
      }
    })

    it('bores each spacer for an M2.5 bolt rather than leaving it solid', () => {
      const g = hat()
      const outer = Math.PI * 3 ** 2 * HAT_MM.defaultHatHeightMm
      const bore = Math.PI * 1.375 ** 2 * HAT_MM.defaultHatHeightMm
      for (const n of [1, 2, 3, 4]) {
        const spacer = g.parts[`spacersspacer${n}`]
        // 32 segments, so both readings sit just under the true circle.
        expect(volumeOf(spacer)).toBeLessThan(outer - bore * 0.97)
        expect(volumeOf(spacer)).toBeGreaterThan((outer - bore) * 0.95)
      }
    })

    it('lengths the x bars from the measured spacer separation, not from a constant', () => {
      // `util.calcSnap(spacer1, spacer2, 'x', 'inside+')[0]` is the translation that
      // would put spacer1's maximum face on spacer2's maximum face — i.e. exactly the
      // distance between those two faces. Recomputing it here from the *emitted*
      // bounding boxes is the point: if the port ever derives the bar length from
      // `HAT_MM.holePositionsMm` instead, the two numbers can drift apart silently.
      const g = hat()
      const measuredMm = boundsOf(g.parts.spacersspacer2)[1][0] - boundsOf(g.parts.spacersspacer1)[1][0]
      for (const n of [1, 2]) {
        expect(sizeOf(g.parts[`spacersspacerBar${n}`])[0], `bar ${n}`).toBeCloseTo(measuredMm, 9)
      }
    })

    it('lengths the y bars from the measured spacer separation, not from a constant', () => {
      const g = hat()
      const measuredMm = boundsOf(g.parts.spacersspacer3)[1][1] - boundsOf(g.parts.spacersspacer1)[1][1]
      for (const n of [3, 4]) {
        expect(sizeOf(g.parts[`spacersspacerBar${n}`])[1], `bar ${n}`).toBeCloseTo(measuredMm, 9)
      }
    })

    it('hangs every bar off the spacers’ top faces, 1mm square in section', () => {
      const g = hat()
      for (const n of [1, 2, 3, 4]) {
        const bar = g.parts[`spacersspacerBar${n}`]
        const [barMin, barMax] = boundsOf(bar)
        expect(barMax[2], `bar ${n} top`).toBeCloseTo(boundsOf(g.parts.spacersspacer1)[1][2], 9)
        expect(barMax[2] - barMin[2], `bar ${n} thickness`).toBeCloseTo(1, 9)
      }
    })
  })

  describe('buttonWireYOffset, whose two branches build different parts', () => {
    // `:163` — `if (options.buttonWireYOffset > 0)`. The documented `<= 0` branch is
    // not a degenerate-input guard but a second, genuinely different assembly, so
    // both are exercised rather than only the default.

    it('offsets the wire and adds a connector when the offset is positive', () => {
      const g = hat()
      expect(g.parts.buttonWireConnector).toBeDefined()
      expect(g.parts.buttonWire).toBeDefined()
      expect(g.parts.buttonWireClearance).toBeDefined()
      // The connector reaches from the caps out to the offset wire.
      const [wireMin] = boundsOf(g.parts.buttonWire)
      const [connectorMin, connectorMax] = boundsOf(g.parts.buttonWireConnector)
      expect(connectorMax[1] - connectorMin[1]).toBeCloseTo(5, 9)
      expect(wireMin[1]).toBeCloseTo(connectorMin[1], 9)
    })

    it('builds no connector at all when the offset is zero', () => {
      const g = hat({ buttonWireYOffset: 0 })
      expect(g.parts.buttonWireConnector).toBeUndefined()
      expect(g.parts.buttonWire).toBeDefined()
      expect(g.parts.buttonWireClearance).toBeDefined()
      // The wire now sits against the caps instead of standing off them.
      expect(boundsOf(g.parts.buttonWire)[0][1]).toBeCloseTo(
        boundsOf(g.parts.buttonCaps)[0][1],
        9
      )
    })

    it('treats a negative offset as the same branch, translated the other way', () => {
      // `:208` translates by `-buttonWireYOffset`, so a negative offset pushes the
      // wire *into* the caps rather than away from them. No V1 fixture covers this —
      // it is asserted as the documented displacement from the zero case, which is
      // fixture-backed.
      const zero = hat({ buttonWireYOffset: 0 })
      const negative = hat({ buttonWireYOffset: -2 })
      expect(negative.parts.buttonWireConnector).toBeUndefined()
      expect(boundsOf(negative.parts.buttonWire)[0][1]).toBeCloseTo(
        boundsOf(zero.parts.buttonWire)[0][1] + 2,
        9
      )
    })
  })

  describe('against real V1 output', () => {
    // See `raspberrypi.miniPiTFT.spec.js` for the fixture's provenance and the
    // regeneration procedure.

    /**
     * V1's `group.add(hat, 'hat', true, 'hat')` stores the Hat's combined solid under
     * `hat` and each leaf under `hat<key>`, so `hatmb`/`hatgpio` are the same solids
     * as the `mb`/`gpio` added immediately afterwards. This port emits one part for
     * each such pair, following `core-016`'s precedent.
     *
     * @param {string} v1Name
     * @returns {string | null}
     */
    const portNameOf = (v1Name) => {
      if (v1Name === 'hatmb') return 'mb'
      if (v1Name === 'hatgpio') return 'gpio'
      return v1Name
    }

    for (const [label, params, factory] of /** @type {[string, Record<string, any>, string][]} */ ([
      ['with the default button wire offset', {}, 'piTFT24'],
      ['with the button wire offset zeroed', { buttonWireYOffset: 0 }, 'piTFT24NoWireOffset'],
    ])) {
      it(`reproduces every V1 part’s bounding box ${label}`, () => {
        const reference = v1Reference.factories[factory]
        const g = hat(params)
        let checked = 0
        for (const v1Name of Object.keys(reference.parts)) {
          const portName = portNameOf(v1Name)
          if (portName === null) continue
          const part = g.parts[portName]
          expect(part, `V1 part ${v1Name} has no counterpart named ${portName}`).toBeDefined()
          const [min, max] = boundsOf(part)
          const [v1Min, v1Max] = reference.parts[v1Name]
          for (const axis of [0, 1, 2]) {
            expect(min[axis], `${v1Name} min[${axis}]`).toBeCloseTo(v1Min[axis], 9)
            expect(max[axis], `${v1Name} max[${axis}]`).toBeCloseTo(v1Max[axis], 9)
          }
          checked += 1
        }
        expect(checked).toBeGreaterThanOrEqual(28)
      })
    }
  })
})

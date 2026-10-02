// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, isGroup } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { rpiParts } from '../tables/rpi-parts.js'
import { HAT_STANDOFF_MM } from './raspberrypi.hatStandoff.js'
import v1ReferenceJson from './__fixtures__/raspberrypi.accessories.v1-reference.json'

const { measurements } = modeling

/** @type {{ factories: Record<string, any> }} */
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
const standoff = (params = {}) => asGroup(evaluateOp('raspberrypi.hatStandoff', params))

describe('raspberrypi.hatStandoff', () => {
  it('takes no board parameter, only a height', () => {
    // `hat-standoff.js:13` — `HatStandoff(options)`. Nothing external is measured.
    expect(() => expand('raspberrypi.hatStandoff')).not.toThrow()
  })

  it('is one solid: a mounting pad unioned with a mounting peg', () => {
    // `:17` — `standoff.union(peg)`, returned as a bare CSG rather than a group, so
    // this port names the single result rather than inventing two parts.
    const g = standoff()
    expect(Object.keys(g.parts)).toEqual(['standoff'])
    expect([...g.names]).toEqual(['standoff'])
  })

  it('takes both diameters from core-014’s table but NEITHER height', () => {
    // This is the divergence from this task's own Proposed fix, which reads
    // `hat-standoff.js:15-16` as "one boolean.union over two parts from
    // tables/rpi-parts.js". The *diameters* come from there (6.2 and 2.8). The
    // heights do not: V1 passes `options.height` and `options.height + 3`
    // explicitly, overriding the table's own 1.5 and 4. A port that reused the
    // table's params wholesale would build a 6.2 x 1.5 pad with a 2.8 x 4 peg —
    // a standoff 1.5mm tall instead of 10mm.
    expect(rpiParts.mountingPad.params.diameter).toBe(HAT_STANDOFF_MM.padDiameterMm)
    expect(rpiParts.mountingHole.params.diameter).toBe(HAT_STANDOFF_MM.pegDiameterMm)
    expect(rpiParts.mountingPad.params.height).toBe(1.5)
    expect(rpiParts.mountingHole.params.height).toBe(4)

    const [min, max] = boundsOf(standoff().parts.standoff)
    // The peg is the taller of the two and both straddle z = 0, so the solid's own
    // height is `height + 3`, not the table's 4.
    expect(max[2] - min[2]).toBeCloseTo(HAT_STANDOFF_MM.defaultHeightMm + 3, 9)
    expect(max[0] - min[0]).toBeCloseTo(HAT_STANDOFF_MM.padDiameterMm, 9)
  })

  it('straddles z = 0 rather than standing on it', () => {
    // `rpi-parts.js:24-27` and `:40-43` both build `CSG_cylinder({start:[0,0,-h/2],
    // end:[0,0,h/2]})` — the `frame: 'center'` the table records. A `base`-framed
    // cylinder would put the whole standoff above the origin.
    const [min, max] = boundsOf(standoff().parts.standoff)
    expect(min[2]).toBeCloseTo(-max[2], 9)
  })

  it('honours a custom height on both the pad and the peg', () => {
    const [min, max] = boundsOf(standoff({ height: 4 }).parts.standoff)
    const reference = v1Reference.factories.hatStandoffHeight4
    for (const axis of [0, 1, 2]) {
      expect(min[axis]).toBeCloseTo(reference.bounds[0][axis], 9)
      expect(max[axis]).toBeCloseTo(reference.bounds[1][axis], 9)
    }
  })

  describe('against real V1 output', () => {
    it('reproduces V1’s bounding box and volume', () => {
      const reference = v1Reference.factories.hatStandoff
      const solid = standoff().parts.standoff
      const [min, max] = boundsOf(solid)
      for (const axis of [0, 1, 2]) {
        expect(min[axis], `min[${axis}]`).toBeCloseTo(reference.bounds[0][axis], 9)
        expect(max[axis], `max[${axis}]`).toBeCloseTo(reference.bounds[1][axis], 9)
      }
      // Both kernels facet a cylinder with 32 segments, so the volumes agree to far
      // better than a tolerance that would hide a wrong diameter or height.
      expect(measurements.measureVolume(solid)).toBeCloseTo(reference.volume, 6)
    })
  })
})

describe('raspberrypi.hatStandoff: colour (TODO/core-033)', () => {
  // `rpi-parts.js:44` colours the pad `Mountingpad` `.color('yellow')` and `:28`
  // colours the peg `MountingHole` `.color('orange')` — a union of two differently
  // coloured V1 solids, so `standoff` stays uncoloured. See the module doc.
  it('standoff carries no colour', () => {
    const record = expand('raspberrypi.hatStandoff').find((r) => r.name === 'standoff')
    expect(record).toBeDefined()
    expect(record?.color).toBeUndefined()
    expect(record?.colorAlpha).toBeUndefined()
  })
})

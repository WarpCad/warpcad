// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, isGroup, sizeOf } from '../group.js'
import { evaluateOp, expand } from '../index.js'

/**
 * `TODO/core-034` for every `raspberrypi.*` recipe that has a board V1's `combine()`
 * drilled. `raspberrypi.bplus.spec.js` carries the exact-volume check for the Pi; this
 * file is the shared "is it really a drilled board" check for the rest.
 */

const { booleans, primitives, transforms, measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/**
 * @type {ReadonlyArray<{ label: string, op: string, params: Record<string, any>, board: string, holes: string[] }>}
 */
const CASES = [
  { label: 'hat', op: 'raspberrypi.hat', params: {}, board: 'mb', holes: ['hole1', 'hole2', 'hole3', 'hole4'] },
  { label: 'piTFT22', op: 'raspberrypi.piTFT22', params: {}, board: 'mb', holes: ['hole1', 'hole2', 'hole3', 'hole4'] },
  { label: 'piTFT24', op: 'raspberrypi.piTFT24', params: {}, board: 'mb', holes: ['hathole1', 'hathole2', 'hathole3', 'hathole4'] },
  ...['v1', 'v2', 'v3'].map((model) => ({
    label: `cameraModule ${model}`,
    op: 'raspberrypi.cameraModule',
    params: { model },
    board: 'board',
    holes: ['hole0', 'hole1', 'hole2', 'hole3'],
  })),
  ...['hq', 'arducam-hq'].map((model) => ({
    label: `cameraModule ${model}`,
    op: 'raspberrypi.cameraModule',
    params: { model },
    board: 'board',
    holes: ['hole1', 'hole2', 'hole3', 'hole4'],
  })),
]

/** @param {Geom3} part @param {0 | 1 | 2} axis */
const midline = (part, axis) => {
  const [min, max] = boundsOf(part)
  return (min[axis] + max[axis]) / 2
}

describe('raspberrypi.*: mounting holes are drilled through the board, not just kept as parts (TODO/core-034)', () => {
  describe.each(CASES.map((c) => [c.label, c]))('%s', (_label, c) => {
    const records = expand(c.op, c.params)
    const group = evaluateOp(c.op, c.params)
    if (!isGroup(group)) throw new Error('expected a Group')
    const board = /** @type {Geom3} */ (group.parts[c.board])
    const [bMin, bMax] = boundsOf(board)
    const thickness = sizeOf(board)[2]

    it('the named board record is a boolean.subtract over exactly the hole parts', () => {
      const record = records.find((r) => r.name === c.board)
      expect(record).toMatchObject({ op: 'boolean.subtract' })
      const holeIds = c.holes.map((name) => records.find((r) => r.name === name)?.id)
      expect(holeIds.every(Boolean)).toBe(true)
      expect(/** @type {{ operands: string[] }} */ (record).operands).toEqual(holeIds)
    })

    it('keeps every hole as a hidden, named part', () => {
      for (const name of c.holes) {
        expect(group.parts[name], name).toBeDefined()
        expect(group.names).not.toContain(name)
        expect(records.find((r) => r.name === name)).toMatchObject({ hidden: true })
      }
    })

    it('removes at least n·π·r²·t from the board’s bounding box', () => {
      const bboxVolume = (bMax[0] - bMin[0]) * (bMax[1] - bMin[1]) * thickness
      const removed = bboxVolume - measurements.measureVolume(board)
      const expectedHoles = c.holes.reduce((sum, name) => {
        const radius = sizeOf(/** @type {Geom3} */ (group.parts[name]))[0] / 2
        return sum + Math.PI * radius * radius * thickness
      }, 0)
      // Rounded corners remove a little more, never less; a polygon circle is a little under π·r².
      expect(removed).toBeGreaterThan(expectedHoles * 0.95)
    })

    it('has empty hole centres and material just beyond each hole', () => {
      const cx0 = (bMin[0] + bMax[0]) / 2
      const cy0 = (bMin[1] + bMax[1]) / 2
      const column = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ half) =>
        measurements.measureVolume(
          booleans.intersect(
            board,
            transforms.translate([x, y, midline(board, 2)], primitives.cuboid({ size: [half * 2, half * 2, 20] }))
          )
        )
      for (const name of c.holes) {
        const hole = /** @type {Geom3} */ (group.parts[name])
        const x = midline(hole, 0)
        const y = midline(hole, 1)
        const radius = sizeOf(hole)[0] / 2
        expect(column(x, y, radius * 0.5)).toBeCloseTo(0, 6)
        // Step from the hole toward the board centre, clear of the hole's rim.
        const step = radius + 0.6
        const beyondX = x + Math.sign(cx0 - x) * step
        const beyondY = y + Math.sign(cy0 - y) * step
        expect(column(beyondX, beyondY, 0.2)).toBeGreaterThan(0.001)
      }
    })
  })
})

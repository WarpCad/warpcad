import { describe, expect, it } from 'vitest'

import { v1ColorToRecord } from '../colors.js'
import { boundsOf, isGroup, sizeOf } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { HAT_MM } from './raspberrypi.hat.js'
import v1ReferenceJson from './__fixtures__/raspberrypi.accessories.v1-reference.json'

/**
 * @type {{ factories: Record<string, any> }}
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

const hat = () => asGroup(evaluateOp('raspberrypi.hat', {}))

describe('raspberrypi.hat', () => {
  it('is registered as an op in its own right, not only reachable through a display', () => {
    // `core-017` shipped the standalone expansion as a module because `PiTFT22` and
    // `PiTFT24` needed it before this task ran. Registering it is the whole of what
    // `core-018` owes `Hat` — see raspberrypi.hat.js's own header.
    expect(() => expand('raspberrypi.hat')).not.toThrow()
  })

  it('takes no board parameter', () => {
    // `hat.js:24`'s `pi` is an *attachment*, not geometry: `:64-68` translates the
    // finished group onto the board. Per docs/decisions/composite-recipe-geometry.md
    // that step is the user's own ui-026 Snap/Align between two placed bodies.
    expect(() => evaluateOp('raspberrypi.hat', {})).not.toThrow()
  })

  it('renders V1’s visible part set, with the holes hidden', () => {
    // `:31-54` adds each hole with `hidden = true`, so V1's own `names` is mb + gpio.
    const g = hat()
    expect([...g.names].sort()).toEqual([...v1Reference.factories.hat.names].sort())
    for (const n of [1, 2, 3, 4]) {
      expect(g.parts[`hole${n}`], `hole${n}`).toBeDefined()
      expect(g.names).not.toContain(`hole${n}`)
    }
  })

  it('places the four mounting holes at hat.js’s stated centres', () => {
    // `:32-50` — (3.56,3.56), (61.47,3.56), (3.56,52.46), (61.47,52.46). These are
    // *not* the B+ board's own hole positions; a HAT's sit at 3.56, not 3.5.
    const g = hat()
    HAT_MM.holePositionsMm.forEach(([xMm, yMm], index) => {
      const [min, max] = boundsOf(g.parts[`hole${index + 1}`])
      expect((min[0] + max[0]) / 2, `hole${index + 1} x`).toBeCloseTo(xMm, 9)
      expect((min[1] + max[1]) / 2, `hole${index + 1} y`).toBeCloseTo(yMm, 9)
    })
  })

  it('builds the board at 65.02 x 56.39 x 1.62, minimum corner on the origin', () => {
    // V1's own docstring (`:20`) says "65.02 × 56.39 × 3.56 mm", which is wrong:
    // `Parts.Board(width, height, cornerRadius, thickness)` makes 3.56 the corner
    // radius and 1.62 the thickness. The fixture is the arbiter, not the docstring.
    const g = hat()
    const size = sizeOf(g.parts.mb)
    expect(size[0]).toBeCloseTo(HAT_MM.xMm, 9)
    expect(size[1]).toBeCloseTo(HAT_MM.yMm, 9)
    expect(size[2]).toBeCloseTo(HAT_MM.thicknessMm, 9)
  })

  describe('against real V1 output', () => {
    // Fixture: `__fixtures__/raspberrypi.accessories.v1-reference.json`, regenerated
    // the way core-017's was — a vitest file in a jscad-raspberrypi checkout at
    // 62a8e3b calling each factory with no board argument and writing `group.names`,
    // each part's `getBounds()` and a divergence-theorem volume as JSON.
    it('reproduces every V1 part’s bounding box', () => {
      const reference = v1Reference.factories.hat
      const g = hat()
      let checked = 0
      for (const name of Object.keys(reference.parts)) {
        const [min, max] = boundsOf(g.parts[name])
        const [v1Min, v1Max] = reference.parts[name].bounds
        for (const axis of [0, 1, 2]) {
          expect(min[axis], `${name} min[${axis}]`).toBeCloseTo(v1Min[axis], 9)
          expect(max[axis], `${name} max[${axis}]`).toBeCloseTo(v1Max[axis], 9)
        }
        checked += 1
      }
      expect(checked).toBe(6)
    })
  })
})

describe('raspberrypi.hat: the alpha-channel colour V1 gave the board (TODO/core-026)', () => {
  // V1, re-read for core-026 — `jscad-raspberrypi@62a8e3b` `src/hat.js:28`:
  //   hat.add(Parts.Board(65.02, 56.39, 3.56, 1.62).color('darkgreen', 0.75), 'mb');
  it('emits darkgreen at alpha 0.75 on the mb record', () => {
    const records = expand('raspberrypi.hat')
    const board = records.filter((record) => record.name === 'mb')
    expect(board).toHaveLength(1)
    expect(board[0]).toMatchObject({ color: 0x006400, colorAlpha: 0.75 })
  })

  it('the evaluated group carries it as the part colour', () => {
    const group = evaluateOp('raspberrypi.hat', {})
    expect(isGroup(group) && group.colors.mb).toEqual({ color: 0x006400, alpha: 0.75 })
  })
})

describe('raspberrypi.hat: the opaque colours V1 gave the rest (TODO/core-033)', () => {
  it('gpio is gray (rpi-parts.js:153 Gpio)', () => {
    const record = expand('raspberrypi.hat').find((r) => r.name === 'gpio')
    expect(record).toMatchObject(v1ColorToRecord('gray'))
  })

  it('hole1-4 are orange, still hidden (hat.js:30 → rpi-parts.js:28 MountingHole)', () => {
    const records = expand('raspberrypi.hat')
    for (const name of ['hole1', 'hole2', 'hole3', 'hole4']) {
      expect(records.find((r) => r.name === name)).toMatchObject({
        ...v1ColorToRecord('orange'),
        hidden: true,
      })
    }
  })
})

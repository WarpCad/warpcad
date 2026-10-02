// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { v1ColorToRecord } from '../colors.js'
import { boundsOf, isGroup, sizeOf } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { HAT_MM } from './raspberrypi.hat.js'
import { PITFT22_BUTTON_MIDLINES_MM } from './raspberrypi.piTFT22.js'
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

const hat = () => asGroup(evaluateOp('raspberrypi.piTFT22', {}))

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

describe('raspberrypi.piTFT22', () => {
  it('takes no board parameter and expands with no params at all', () => {
    // `pi-tft22.js:29` does not use `piMotherBoard` itself — it *forwards* it into
    // `Hat(piMotherBoard, options)`, which uses it only for the final attachment
    // translate. So dropping the parameter here means calling this port's standalone
    // `Hat` expansion with no board, which is what V1 itself does when the argument
    // is omitted. TODO/core-017.
    expect(() => expand('raspberrypi.piTFT22')).not.toThrow()
    expect(expand('raspberrypi.piTFT22').length).toBeGreaterThan(20)
  })

  it('renders V1’s visible part set', () => {
    expect([...hat().names].sort()).toEqual([...v1Reference.factories.piTFT22.names].sort())
  })

  it('builds the Hat’s own board and header, unmoved', () => {
    // With no board the Hat's `if (pi)` guard never fires, so `mb`'s minimum corner
    // sits on the origin and the GPIO header hangs below it.
    const g = hat()
    expectSize(g.parts.mb, [HAT_MM.xMm, HAT_MM.yMm, HAT_MM.thicknessMm])
    const [mbMin] = boundsOf(g.parts.mb)
    expect(mbMin[0]).toBeCloseTo(0, 9)
    expect(mbMin[1]).toBeCloseTo(0, 9)
    expect(mbMin[2]).toBeCloseTo(0, 9)
    // `hat.js:53` snaps the header `outside+` on z, so its top face is the board's
    // underside.
    const [, gpioMax] = boundsOf(g.parts.gpio)
    expect(gpioMax[2]).toBeCloseTo(0, 9)
  })

  it('carries the Hat’s four mounting holes as hidden parts', () => {
    // `pi-tft22.js:35` assigns `group.holes = hat.holes`, which makes V1's `combine()`
    // drill them. They stay hidden named parts (snap targets, Subtract operands) and,
    // since TODO/core-034, `mb` is also a `boolean.subtract` of the plate by them — the
    // drilling itself is asserted in `raspberrypi.drilled-boards.spec.js`.
    const g = hat()
    HAT_MM.holePositionsMm.forEach(([xMm, yMm], index) => {
      const hole = g.parts[`hole${index + 1}`]
      expect(hole, `hole${index + 1}`).toBeDefined()
      expect(g.names).not.toContain(`hole${index + 1}`)
      const centre = centreOf(hole)
      expect(centre[0]).toBeCloseTo(xMm, 9)
      expect(centre[1]).toBeCloseTo(yMm, 9)
    })
  })

  it('sizes the LCD and its bevel to the source constants', () => {
    const g = hat()
    expectSize(g.parts.lcd, [45.97, 34.8, 4])
    expectSize(g.parts.lcdbevel, [55, 40, 3.5])
    // Both are snapped `outside-` onto the board's top face.
    const [lcdMin] = boundsOf(g.parts.lcd)
    const [bevelMin] = boundsOf(g.parts.lcdbevel)
    expect(lcdMin[2]).toBeCloseTo(HAT_MM.thicknessMm, 9)
    expect(bevelMin[2]).toBeCloseTo(HAT_MM.thicknessMm, 9)
    // `:43-44`'s bevel is a plain translate from the board corner, not a midline.
    expect(bevelMin[0]).toBeCloseTo(8, 9)
    expect(bevelMin[1]).toBeCloseTo(6, 9)
  })

  it('places the four buttons at V1’s midlines, 12.7mm apart', () => {
    const g = hat()
    PITFT22_BUTTON_MIDLINES_MM.forEach((midlineMm, index) => {
      const button = g.parts[`button${index + 1}`]
      expect(button, `button${index + 1}`).toBeDefined()
      // `util.calcmidlineTo` is a *relative* translate of `to - size/2`
      // (`jscad-utils/src/util.js:874`), and every button here starts with its
      // minimum on x = 0, so the midline really does land on `midlineMm`. Measured,
      // not assumed — that precondition is the whole reason this holds.
      expect(centreOf(button)[0]).toBeCloseTo(midlineMm, 9)
      // A base cube plus its push cylinder: 7 x 6 x 2.5 grown to 3.7 by the cap.
      expectSize(button, [7, 6, 3.7])
    })
    const pitch = PITFT22_BUTTON_MIDLINES_MM.map((m, i, all) => (i === 0 ? 12.7 : m - all[i - 1]))
    for (const step of pitch) expect(step).toBeCloseTo(12.7, 9)
  })

  describe('against real V1 output', () => {
    // See `raspberrypi.miniPiTFT.spec.js` for the fixture's provenance, the
    // regeneration procedure, and why this task built one at all.
    it('reproduces every V1 part’s bounding box', () => {
      const reference = v1Reference.factories.piTFT22
      const g = hat()
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
      expect(checked).toBe(8)
    })

    it('reproduces the Hat’s own parts, which V1 exposes only through this hat', () => {
      // The four holes have no counterpart in PiTFT22's own part dictionary (V1 keeps
      // them as `group.holes`), so they are diffed against `Hat()`'s dictionary —
      // the same solids, from the same standalone call.
      const reference = v1Reference.factories.hat
      const g = hat()
      for (const name of ['hole1', 'hole2', 'hole3', 'hole4', 'mb', 'gpio']) {
        const [min, max] = boundsOf(g.parts[name])
        const [v1Min, v1Max] = reference.parts[name]
        for (const axis of [0, 1, 2]) {
          expect(min[axis], `${name} min[${axis}]`).toBeCloseTo(v1Min[axis], 9)
          expect(max[axis], `${name} max[${axis}]`).toBeCloseTo(v1Max[axis], 9)
        }
      }
    })
  })
})

describe('raspberrypi.piTFT22: the alpha-channel colour V1 gave the board (TODO/core-026)', () => {
  // V1, re-read for core-026 — `jscad-raspberrypi@62a8e3b` `src/hat.js:28`:
  //   hat.add(Parts.Board(65.02, 56.39, 3.56, 1.62).color('darkgreen', 0.75), 'mb');
  // and `src/pi-tft22.js:29-36` re-uses that very part:
  //   var hat = Hat(piMotherBoard, options); var mb = hat.parts.mb; ... group.add(mb, 'mb');
  it('emits darkgreen at alpha 0.75 on the mb record', () => {
    const records = expand('raspberrypi.piTFT22')
    const board = records.filter((record) => record.name === 'mb')
    expect(board).toHaveLength(1)
    expect(board[0]).toMatchObject({ color: 0x006400, colorAlpha: 0.75 })
  })

  it('the evaluated group carries it as the part colour', () => {
    const group = evaluateOp('raspberrypi.piTFT22', {})
    expect(isGroup(group) && group.colors.mb).toEqual({ color: 0x006400, alpha: 0.75 })
  })
})

describe('raspberrypi.piTFT22: the opaque colours V1 gave the rest (TODO/core-033)', () => {
  it('gpio is gray, hole1-4 are orange and hidden', () => {
    const records = expand('raspberrypi.piTFT22')
    expect(records.find((r) => r.name === 'gpio')).toMatchObject(v1ColorToRecord('gray'))
    for (const name of ['hole1', 'hole2', 'hole3', 'hole4']) {
      expect(records.find((r) => r.name === name)).toMatchObject({
        ...v1ColorToRecord('orange'),
        hidden: true,
      })
    }
  })

  it('lcd is black, lcdbevel is white (pi-tft22.js:40,50)', () => {
    const records = expand('raspberrypi.piTFT22')
    expect(records.find((r) => r.name === 'lcd')).toMatchObject(v1ColorToRecord('black'))
    expect(records.find((r) => r.name === 'lcdbevel')).toMatchObject(v1ColorToRecord('white'))
  })

  it('button1-4 are left uncoloured — gray base union black cap (pi-tft22.js:54,58)', () => {
    const records = expand('raspberrypi.piTFT22')
    for (const name of ['button1', 'button2', 'button3', 'button4']) {
      const record = records.find((r) => r.name === name)
      expect(record).toBeDefined()
      expect(record?.color).toBeUndefined()
    }
  })
})

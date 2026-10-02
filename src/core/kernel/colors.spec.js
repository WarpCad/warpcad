// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import v1ColorSource from 'jscad-utils/jscad-utils-color.jscad?raw'

import { assertRecordColor, hexToUnitRgb, V1_CSS_COLOR_HEX, v1ColorToRecord } from './colors.js'

/**
 * V1's own colour-name table, parsed out of the installed `jscad-utils@3.2.0`'s
 * `jscad-utils-color.jscad` at test time (a Vite `?raw` import). Read fresh on every
 * run, not copied: the whole point of {@link V1_CSS_COLOR_HEX} is that it says what V1
 * said (TODO/core-026).
 * `jscad-utils@6.0.0`'s `src/color.js`, which `jscad-raspberrypi` runs under, carries the
 * identical 147 entries (checked when this task was written; 6.0.0 is not installed here).
 *
 * @returns {Record<string, number>}
 */
function readV1NameTable() {
  /** @type {Record<string, number>} */
  const table = {}
  for (const match of v1ColorSource.matchAll(/'([a-z]+)':\s*'#([0-9a-f]{6})'/g)) {
    table[match[1]] = Number.parseInt(match[2], 16)
  }
  return table
}

describe('V1_CSS_COLOR_HEX', () => {
  it("is V1's own name table, entry for entry, as numbers", () => {
    const v1 = readV1NameTable()
    expect(Object.keys(v1)).toHaveLength(147)
    expect(V1_CSS_COLOR_HEX).toEqual(v1)
  })

  it('carries the names this project’s ported recipes use, at their CSS values', () => {
    expect(V1_CSS_COLOR_HEX.gray).toBe(0x808080)
    expect(V1_CSS_COLOR_HEX.silver).toBe(0xc0c0c0)
    expect(V1_CSS_COLOR_HEX.red).toBe(0xff0000)
    expect(V1_CSS_COLOR_HEX.purple).toBe(0x800080)
    expect(V1_CSS_COLOR_HEX.green).toBe(0x008000)
    expect(V1_CSS_COLOR_HEX.darkgreen).toBe(0x006400)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(V1_CSS_COLOR_HEX)).toBe(true)
  })
})

describe('v1ColorToRecord', () => {
  it("turns V1's .color(name) into a numeric colour and no alpha field", () => {
    expect(v1ColorToRecord('gray')).toEqual({ color: 0x808080 })
    expect(v1ColorToRecord('gray')).not.toHaveProperty('colorAlpha')
  })

  it("carries V1's .color(name, alpha) alpha channel", () => {
    expect(v1ColorToRecord('green', 0.75)).toEqual({ color: 0x008000, colorAlpha: 0.75 })
  })

  it('treats an explicit alpha of 1 as the default and omits it', () => {
    expect(v1ColorToRecord('red', 1)).toEqual({ color: 0xff0000 })
  })

  it('rejects a name V1 does not know, rather than emitting undefined', () => {
    expect(() => v1ColorToRecord('grey-ish')).toThrow(/unknown V1 colour name "grey-ish"/)
  })

  it("rejects an alpha of 0: V1's `g || 1.0` would silently draw that opaque", () => {
    expect(() => v1ColorToRecord('red', 0)).toThrow(/alpha/)
  })

  it('rejects an alpha outside (0, 1]', () => {
    expect(() => v1ColorToRecord('red', 1.5)).toThrow(/alpha/)
    expect(() => v1ColorToRecord('red', -0.25)).toThrow(/alpha/)
    expect(() => v1ColorToRecord('red', Number.NaN)).toThrow(/alpha/)
  })
})

describe('hexToUnitRgb', () => {
  it("reproduces V1's own name2rgb(...) / 255 arithmetic exactly", () => {
    // V1: `Colors.name2rgb(r).map(x => x / 255)`. Same division, same doubles.
    expect(hexToUnitRgb(0x808080)).toEqual([128 / 255, 128 / 255, 128 / 255])
    expect(hexToUnitRgb(0xff0000)).toEqual([1, 0, 0])
    expect(hexToUnitRgb(0x006400)).toEqual([0, 100 / 255, 0])
  })

  it('handles the two extremes', () => {
    expect(hexToUnitRgb(0x000000)).toEqual([0, 0, 0])
    expect(hexToUnitRgb(0xffffff)).toEqual([1, 1, 1])
  })
})

describe('assertRecordColor', () => {
  it('accepts an absent colour and a valid one, with or without alpha', () => {
    expect(() => assertRecordColor(undefined, undefined, 'x')).not.toThrow()
    expect(() => assertRecordColor(0x808080, undefined, 'x')).not.toThrow()
    expect(() => assertRecordColor(0x008000, 0.75, 'x')).not.toThrow()
  })

  it('rejects a colour that is not a 24-bit integer, naming the label', () => {
    expect(() => assertRecordColor(-1, undefined, 'washer')).toThrow(/washer.*colour/)
    expect(() => assertRecordColor(0x1000000, undefined, 'washer')).toThrow(/colour/)
    expect(() => assertRecordColor(1.5, undefined, 'washer')).toThrow(/colour/)
    expect(() => assertRecordColor(/** @type {any} */ ('gray'), undefined, 'washer')).toThrow(
      /colour/
    )
  })

  it('rejects an alpha with no colour to apply it to', () => {
    expect(() => assertRecordColor(undefined, 0.5, 'washer')).toThrow(/colorAlpha.*without a color/)
  })

  it('rejects an alpha outside (0, 1]', () => {
    expect(() => assertRecordColor(0xff0000, 0, 'x')).toThrow(/colorAlpha/)
    expect(() => assertRecordColor(0xff0000, 2, 'x')).toThrow(/colorAlpha/)
  })
})

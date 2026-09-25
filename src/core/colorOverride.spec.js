import { describe, expect, it } from 'vitest'

import {
  colorIntToCssHex,
  cssHexToColorInt,
  effectiveOverrideOf,
  ownOverrideOf,
} from './colorOverride.js'

describe('colour conversions at the Inspector boundary (TODO/ui-037)', () => {
  it('writes a 0xRRGGBB integer as the #rrggbb string a native colour input takes', () => {
    expect(colorIntToCssHex(0xff0000)).toBe('#ff0000')
    expect(colorIntToCssHex(0x00ff00)).toBe('#00ff00')
    // Leading zeros are the easy thing to lose: 0x0000ff is not '#ff'.
    expect(colorIntToCssHex(0x0000ff)).toBe('#0000ff')
    expect(colorIntToCssHex(0)).toBe('#000000')
    expect(colorIntToCssHex(0xffffff)).toBe('#ffffff')
  })

  it('reads a #rrggbb string back, case-insensitively, and refuses anything else', () => {
    expect(cssHexToColorInt('#ff0000')).toBe(0xff0000)
    expect(cssHexToColorInt('#00FF7f')).toBe(0x00ff7f)
    expect(cssHexToColorInt('#000000')).toBe(0)
    expect(cssHexToColorInt('ff0000')).toBeNull()
    expect(cssHexToColorInt('#f00')).toBeNull()
    expect(cssHexToColorInt('#gg0000')).toBeNull()
    expect(cssHexToColorInt('')).toBeNull()
  })

  it('round-trips every channel boundary exactly', () => {
    for (const color of [0, 1, 0xff, 0x100, 0xff00, 0x10000, 0xff0000, 0xffffff, 0x9fc0e8]) {
      expect(cssHexToColorInt(colorIntToCssHex(color))).toBe(color)
    }
  })
})

describe('which override paints which part (TODO/ui-037)', () => {
  const whole = { color: 0xff0000 }
  const usbc = { color: 0x0000ff, subPart: 'usbc' }

  it('a body with no overrides has no override anywhere', () => {
    expect(effectiveOverrideOf(undefined, undefined)).toBeUndefined()
    expect(effectiveOverrideOf(undefined, 'usbc')).toBeUndefined()
    expect(ownOverrideOf(undefined, undefined)).toBeUndefined()
  })

  it('a sub-part override wins on its own part; the whole-body one paints the rest', () => {
    const overrides = [whole, usbc]
    expect(effectiveOverrideOf(overrides, 'usbc')).toEqual(usbc)
    expect(effectiveOverrideOf(overrides, 'ethernet')).toEqual(whole)
    expect(effectiveOverrideOf(overrides, undefined)).toEqual(whole)
  })

  it('order of the two records does not matter: the sub-part still wins on its part', () => {
    expect(effectiveOverrideOf([usbc, whole], 'usbc')).toEqual(usbc)
  })

  it('with only a sub-part override, every other part keeps the default', () => {
    expect(effectiveOverrideOf([usbc], 'ethernet')).toBeUndefined()
    expect(effectiveOverrideOf([usbc], undefined)).toBeUndefined()
  })

  it('"own" is exact: a part inheriting the whole-body colour has no override of its own', () => {
    const overrides = [whole, usbc]
    expect(ownOverrideOf(overrides, 'usbc')).toEqual(usbc)
    expect(ownOverrideOf(overrides, 'ethernet')).toBeUndefined()
    expect(ownOverrideOf(overrides, undefined)).toEqual(whole)
    expect(ownOverrideOf([usbc], undefined)).toBeUndefined()
  })
})

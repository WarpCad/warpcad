// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  colorIntToCssHex,
  cssHexToColorInt,
  effectiveOverrideOf,
  ownOverrideOf,
  paintColorOf,
  recipeColorOf,
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

describe('a recipe s own baked-in colour, as a tier beneath a user override (TODO/render-003)', () => {
  const recipeColors = {
    washer: { color: 0x808080, alpha: 1 },
    mb: { color: 0x008000, alpha: 0.75 },
  }

  it('reports a fully-opaque recipe colour with colorAlpha omitted, matching a user override s own convention', () => {
    expect(recipeColorOf(recipeColors, 'washer')).toEqual({ color: 0x808080 })
  })

  it('carries a translucent recipe colour s alpha through as colorAlpha', () => {
    expect(recipeColorOf(recipeColors, 'mb')).toEqual({ color: 0x008000, colorAlpha: 0.75 })
  })

  it('a part the recipe never coloured has no recipe colour', () => {
    expect(recipeColorOf(recipeColors, 'shell')).toBeUndefined()
    expect(recipeColorOf({}, 'washer')).toBeUndefined()
    expect(recipeColorOf(undefined, 'washer')).toBeUndefined()
  })

  it('undefined for "the whole body" (no partName): a recipe colour is per-part, never averaged', () => {
    expect(recipeColorOf(recipeColors, undefined)).toBeUndefined()
  })

  it('paintColorOf: with no user override at all, the recipe colour applies', () => {
    expect(paintColorOf(undefined, recipeColors, 'washer')).toEqual({ color: 0x808080 })
    expect(paintColorOf(undefined, recipeColors, 'mb')).toEqual({ color: 0x008000, colorAlpha: 0.75 })
  })

  it('paintColorOf: a whole-body user override beats the recipe colour', () => {
    const overrides = [{ color: 0xff0000 }]
    expect(paintColorOf(overrides, recipeColors, 'washer')).toEqual({ color: 0xff0000 })
  })

  it('paintColorOf: a sub-part user override beats both the whole-body override and the recipe colour', () => {
    const overrides = [{ color: 0xff0000 }, { color: 0x0000ff, subPart: 'washer' }]
    expect(paintColorOf(overrides, recipeColors, 'washer')).toEqual({ color: 0x0000ff })
  })

  it('paintColorOf: neither a user override nor a recipe colour falls through to undefined — draw the palette', () => {
    expect(paintColorOf(undefined, recipeColors, 'shell')).toBeUndefined()
    expect(paintColorOf(undefined, undefined, undefined)).toBeUndefined()
  })
})

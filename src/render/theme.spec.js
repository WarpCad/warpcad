// SPDX-License-Identifier: AGPL-3.0-or-later
// `TODO/render-008`: the 3D view's colours come from the theme tokens. `readSceneTheme` parses the
// scene-role custom properties to 24-bit integers, and the fallback tables (`SCENE_THEMES`, and the
// `VIEWPORT_THEMES` / `BODY_COLORS` views of them) equal what the CSS files say, so the two cannot
// drift again.
import { describe, expect, it } from 'vitest'

import { declarationsOf, readTokenFile, resolveToken, splitLightMedia } from '../styles/cssTokens.js'
import { BODY_COLORS } from './mesh.js'
import { VIEWPORT_THEMES } from './scene.js'
import { SCENE_THEMES, SCENE_TOKENS, readSceneTheme, sameSceneTheme, sceneThemeOf } from './theme.js'

/**
 * The resolved custom properties of each scheme, read from the CSS files as text, as
 * `src/styles/tokens.spec.js` does.
 * @returns {{ dark: Map<string, string>, light: Map<string, string> }}
 */
function schemes() {
  const all = new Map()
  for (const f of ['base.css', 'semantic.css']) for (const [k, v] of declarationsOf(readTokenFile(f))) all.set(k, v)
  const dark = new Map([...all, ...declarationsOf(readTokenFile('themes/dark.css'))])
  const light = new Map([...dark, ...splitLightMedia(readTokenFile('themes/light.css')).light])
  return { dark, light }
}

/**
 * A `getPropertyValue` source over resolved token values, the shape a `CSSStyleDeclaration` has.
 * @param {Map<string, string>} decls
 * @returns {{ getPropertyValue: (name: string) => string }}
 */
function styleOf(decls) {
  return { getPropertyValue: (name) => resolveToken(name, decls) ?? '' }
}

/**
 * @param {Record<string, string>} values
 * @returns {{ getPropertyValue: (name: string) => string }}
 */
function plain(values) {
  return { getPropertyValue: (name) => values[name] ?? '' }
}

/** Every scene role set to one colour, so a test can change a single one. */
function uniform(hex = '#123456') {
  /** @type {Record<string, string>} */
  const values = {}
  for (const token of Object.values(SCENE_TOKENS)) values[token] = hex
  return values
}

describe('readSceneTheme', () => {
  it('parses each token to its 24-bit integer', () => {
    const values = uniform()
    values['--scene-background'] = '#161a21'
    values['--axis-x'] = '  #B04A45 ' // a browser may hand back surrounding whitespace, and any case
    values['--body'] = '#9fc0e8'
    const theme = readSceneTheme(plain(values), 'light')
    expect(theme.background).toBe(0x161a21)
    expect(theme.axisX).toBe(0xb04a45)
    expect(theme.body).toBe(0x9fc0e8)
    expect(theme.gridMinor).toBe(0x123456)
    expect(theme.scheme).toBe('light')
    for (const key of Object.keys(SCENE_TOKENS)) {
      const value = /** @type {any} */ (theme)[key]
      expect(Number.isInteger(value), key).toBe(true)
      expect(value, key).toBeGreaterThanOrEqual(0)
      expect(value, key).toBeLessThanOrEqual(0xffffff)
    }
  })

  it('expands a three-digit hex, which is what the production CSS minifier writes for #ffffff', () => {
    const values = uniform()
    values['--scene-light-key'] = '#fff'
    values['--body-hover'] = '#1a2'
    const theme = readSceneTheme(plain(values))
    expect(theme.lightKey).toBe(0xffffff)
    expect(theme.bodyHover).toBe(0x11aa22)
  })

  it('returns a frozen object', () => {
    const theme = readSceneTheme(plain(uniform()))
    expect(Object.isFrozen(theme)).toBe(true)
    expect(theme.scheme).toBe('dark')
  })

  it.each([
    ['a colour-mix()', 'color-mix(in srgb, #fff 50%, #000)'],
    ['a four-digit hex', '#fff8'],
    ['an alpha hex', '#11223344'],
    ['rgb()', 'rgb(1, 2, 3)'],
    ['a named colour', 'red'],
    ['an unresolved var()', 'var(--slate-950)'],
    ['nothing (no stylesheet)', ''],
  ])('throws, naming the token, on %s instead of rendering black', (_label, value) => {
    const values = uniform()
    values['--body-hover'] = value
    expect(() => readSceneTheme(plain(values))).toThrow(/--body-hover/)
  })
})

describe('the fallback scene themes equal the CSS', () => {
  const { dark, light } = schemes()

  it.each(/** @type {const} */ (['dark', 'light']))('%s: every scene role, read from the CSS files', (scheme) => {
    const fromCss = readSceneTheme(styleOf(scheme === 'dark' ? dark : light), scheme)
    expect({ ...fromCss }).toEqual({ ...SCENE_THEMES[scheme] })
  })

  it('VIEWPORT_THEMES and BODY_COLORS are views of the same numbers', () => {
    for (const scheme of /** @type {const} */ (['dark', 'light'])) {
      const theme = SCENE_THEMES[scheme]
      expect(VIEWPORT_THEMES[scheme]).toEqual({
        background: theme.background,
        gridMinor: theme.gridMinor,
        gridMajor: theme.gridMajor,
        axisX: theme.axisX,
        axisY: theme.axisY,
      })
      expect(BODY_COLORS[scheme]).toEqual({
        body: theme.body,
        selected: theme.bodySelected,
        secondary: theme.bodySecondary,
        ghost: theme.bodyGhost,
        hover: theme.bodyHover,
      })
    }
  })

  it('the DOM role colours are the body highlight colours by definition, not by a comment', () => {
    for (const decls of [dark, light]) {
      expect(resolveToken('--role-moving', decls)).toBe(resolveToken('--body-selected', decls))
      expect(resolveToken('--role-target', decls)).toBe(resolveToken('--body-secondary', decls))
      expect(resolveToken('--accent-secondary', decls)).toBe(resolveToken('--body-secondary', decls))
      expect(resolveToken('--hover-highlight', decls)).toBe(resolveToken('--body-hover', decls))
    }
  })

  it('light mode draws the DOM X and Y axis colours the WebGL axis lines use', () => {
    // The finding: `--axis-x` had no light value, so DimensionLines' X and the WebGL X axis were
    // two different reds in light mode.
    expect(resolveToken('--axis-x', light)).toBe(`#${SCENE_THEMES.light.axisX.toString(16).padStart(6, '0')}`)
    expect(resolveToken('--axis-y', light)).toBe(`#${SCENE_THEMES.light.axisY.toString(16).padStart(6, '0')}`)
    expect(SCENE_THEMES.light.axisX).not.toBe(SCENE_THEMES.dark.axisX)
  })
})

describe('sceneThemeOf and sameSceneTheme', () => {
  it('passes a SceneTheme through and turns a scheme name into its fallback', () => {
    const read = readSceneTheme(plain(uniform()))
    expect(sceneThemeOf(read)).toBe(read)
    expect(sceneThemeOf('light')).toBe(SCENE_THEMES.light)
    expect(sceneThemeOf('dark')).toBe(SCENE_THEMES.dark)
    // An unknown name is the dark fallback, never an undefined palette that blanks the scene.
    expect(sceneThemeOf(/** @type {any} */ ('sepia'))).toBe(SCENE_THEMES.dark)
    expect(sceneThemeOf(undefined)).toBe(SCENE_THEMES.dark)
  })

  it('compares by value, so a fresh read equal to the current theme is not a change', () => {
    const { dark } = schemes()
    const read = readSceneTheme(styleOf(dark), 'dark')
    expect(read).not.toBe(SCENE_THEMES.dark)
    expect(sameSceneTheme(read, SCENE_THEMES.dark)).toBe(true)
    expect(sameSceneTheme(SCENE_THEMES.light, SCENE_THEMES.dark)).toBe(false)
    const values = uniform()
    const a = readSceneTheme(plain(values))
    values['--scene-section'] = '#654321'
    expect(sameSceneTheme(a, readSceneTheme(plain(values)))).toBe(false)
  })
})

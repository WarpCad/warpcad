// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The 3D view's colours, from the theme tokens (`TODO/render-008`).
 *
 * The scene roles are CSS custom properties in `src/styles/semantic.css` and `themes/*.css`, like
 * every other colour in the app. {@link readSceneTheme} turns them into the 24-bit integers three.js
 * takes, once per theme change: `Viewport.vue` passes it `getComputedStyle(document.documentElement)`
 * on mount and again from `useTheme().onChange`, never from the frame or pointer path (a
 * `getComputedStyle` read forces a style flush, CLAUDE.md Performance). The result goes to
 * `graph.setTheme` and the body materials' `applyMaterialTheme`, which recolour the existing
 * `Color` and material instances in place.
 *
 * Framework-free and DOM-free: the caller hands in anything with `getPropertyValue`.
 *
 * {@link SCENE_THEMES} is the fallback for Node, workers and tests, where there is no stylesheet. It
 * is built from the same numbers as the tokens, and `theme.spec.js` reads the CSS files as text and
 * fails if the two ever differ. `VIEWPORT_THEMES` (`scene.js`) and `BODY_COLORS` (`mesh.js`) are
 * views of it, kept for the callers that only want one slice. This file is exempt from the
 * JavaScript colour-literal guard (`src/styles/guardScan.js`) for exactly that table.
 *
 * @module render/theme
 */

/** @typedef {'dark' | 'light'} SceneScheme */

/**
 * @typedef {object} SceneTheme
 * @property {SceneScheme} scheme which theme the values were read under
 * @property {number} background the 3D view's ground (`--scene-background`)
 * @property {number} gridMinor
 * @property {number} gridMajor
 * @property {number} axisX shared with the DOM's X dimension line (`--axis-x`)
 * @property {number} axisY
 * @property {number} body a body's default colour; a user colour override always wins over it
 * @property {number} bodySelected the first-picked body (`--role-moving` is the same value)
 * @property {number} bodySecondary the rest of a multi-selection (`--role-target`, `--accent-secondary`)
 * @property {number} bodyGhost the placement preview
 * @property {number} bodyHover the object list's hover tint (`--hover-highlight`)
 * @property {number} section a section capture's cut faces
 * @property {number} lightSky hemisphere light, sky colour
 * @property {number} lightGround hemisphere light, ground colour
 * @property {number} lightFill the fill directional light
 * @property {number} lightKey the key directional light and the ambient light
 * @property {number} exportBody a body's colour in an exported .glb (the same in both themes)
 */

/** Each colour field of a {@link SceneTheme}, and the custom property it is read from. */
export const SCENE_TOKENS = Object.freeze({
  background: '--scene-background',
  gridMinor: '--scene-grid-minor',
  gridMajor: '--scene-grid-major',
  axisX: '--axis-x',
  axisY: '--axis-y',
  body: '--body',
  bodySelected: '--body-selected',
  bodySecondary: '--body-secondary',
  bodyGhost: '--body-ghost',
  bodyHover: '--body-hover',
  section: '--scene-section',
  lightSky: '--scene-light-sky',
  lightGround: '--scene-light-ground',
  lightFill: '--scene-light-fill',
  lightKey: '--scene-light-key',
  exportBody: '--export-body',
})

/** @typedef {keyof typeof SCENE_TOKENS} SceneColorKey */

const COLOR_KEYS = /** @type {SceneColorKey[]} */ (Object.keys(SCENE_TOKENS))

/** The roles that are the same in both themes (`semantic.css`). */
const SHARED = {
  section: 0xd9534f,
  lightSky: 0xc8dcff,
  lightGround: 0x20262f,
  lightFill: 0x9fb6d4,
  lightKey: 0xffffff,
  exportBody: 0xb0b8c4,
}

/**
 * The fallback scene themes: the token values, for where there is no stylesheet to read. Neither
 * ground is black (SECOND-ATTEMPT.md: "the scene is very dark" shipped twice), and no body colour is
 * near-black in either scheme, so a solid reads against the grid at a glance.
 *
 * @type {Readonly<Record<SceneScheme, Readonly<SceneTheme>>>}
 */
export const SCENE_THEMES = Object.freeze({
  dark: Object.freeze({
    scheme: /** @type {SceneScheme} */ ('dark'),
    background: 0x161a21,
    gridMinor: 0x2f3742,
    gridMajor: 0x4d5a6b,
    axisX: 0xc75c5c,
    axisY: 0x6aa84f,
    body: 0x9fc0e8,
    bodySelected: 0xffc46b,
    bodySecondary: 0x66d9c0,
    bodyGhost: 0xffc46b,
    bodyHover: 0xb69cff,
    ...SHARED,
  }),
  light: Object.freeze({
    scheme: /** @type {SceneScheme} */ ('light'),
    background: 0xe9edf3,
    gridMinor: 0xc2cad6,
    gridMajor: 0x8c99ab,
    axisX: 0xb04a45,
    axisY: 0x4f7f3a,
    body: 0x6f8fb8,
    bodySelected: 0xd4802a,
    bodySecondary: 0x0f8a72,
    bodyGhost: 0xd4802a,
    bodyHover: 0x6d3fd6,
    ...SHARED,
  }),
})

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * Read the scene roles from computed style.
 *
 * Accepts `#rrggbb`, and `#rgb` (what a production build's CSS minifier turns `#ffffff` into). Anything
 * else (a `color-mix()`, an alpha hex, a named colour, or
 * nothing at all because no stylesheet applied) throws, naming the token, so a token edit three.js
 * cannot use fails loudly instead of silently painting black.
 *
 * @param {{ getPropertyValue: (name: string) => string }} style a `CSSStyleDeclaration` in the app
 *   (`getComputedStyle(document.documentElement)`), a plain object in tests
 * @param {SceneScheme} [scheme] which theme the style was computed under; recorded, not read
 * @returns {Readonly<SceneTheme>}
 * @throws {Error} when a token is not a `#rrggbb` colour
 */
export function readSceneTheme(style, scheme = 'dark') {
  /** @type {Record<string, number | string>} */
  const out = { scheme: scheme === 'light' ? 'light' : 'dark' }
  for (const key of COLOR_KEYS) {
    const token = SCENE_TOKENS[key]
    const raw = String(style.getPropertyValue(token) ?? '').trim()
    const match = HEX.exec(raw)
    if (!match) throw new Error(`readSceneTheme: ${token} is "${raw}"; the 3D view needs a #rrggbb colour`)
    // A production build's CSS minifier writes #ffffff as #fff, and a custom property is reported as
    // authored, so the three-digit form is the same colour and is expanded here.
    const digits = match[1].length === 3 ? [...match[1]].map((d) => d + d).join('') : match[1]
    out[key] = Number.parseInt(digits, 16)
  }
  return /** @type {Readonly<SceneTheme>} */ (Object.freeze(out))
}

/**
 * A {@link SceneTheme} as given, or the fallback for a scheme name. An unknown name is the dark
 * fallback, never an undefined palette that blanks the scene.
 *
 * @param {Readonly<SceneTheme> | SceneScheme | string | null | undefined} theme
 * @returns {Readonly<SceneTheme>}
 */
export function sceneThemeOf(theme) {
  if (theme && typeof theme === 'object' && typeof theme.background === 'number') return theme
  return theme === 'light' ? SCENE_THEMES.light : SCENE_THEMES.dark
}

/**
 * Whether two scene themes hold the same values, so a fresh read equal to the current theme is
 * not a change.
 *
 * @param {Readonly<SceneTheme>} a
 * @param {Readonly<SceneTheme>} b
 * @returns {boolean}
 */
export function sameSceneTheme(a, b) {
  if (a === b) return true
  if (a.scheme !== b.scheme) return false
  for (const key of COLOR_KEYS) if (a[key] !== b[key]) return false
  return true
}

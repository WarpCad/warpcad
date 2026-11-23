// SPDX-License-Identifier: AGPL-3.0-or-later
// The view cube's face labels (`TODO/ui-162`) must read against the axis-tinted fill under them: WCAG
// 4.5:1 in both themes and under every skin, since a skin changes the axis colours the faces are
// tinted toward. The fill is `color-mix(in srgb, var(--axis-*) T%, var(--view-cube-*))`, which is a
// plain linear mix of the two sRGB colours, so the maths is done here from the token files.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, declarationsOf, readTokenFile, resolveToken, splitLightMedia } from './cssTokens.js'
import { VIEW_CUBE_FACES } from '../render/viewCube.js'

const GIZMO = readFileSync(join(REPO_ROOT, 'src/components/viewport/OrientationGizmo.vue'), 'utf8')
/** The tint percentage the component mixes the axis colour in at, read from its `--layout-face-tint`. */
const TINT = Number(GIZMO.match(/--layout-face-tint:\s*(\d+)%/)?.[1])

/** @param {string} hex `#rrggbb` @returns {number[]} */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
/** @param {number} c 0-255 @returns {number} */
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
/** @param {number[]} a @returns {number} */
const luminance = (a) => 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2])
/** @param {number[]} a @param {number[]} b @returns {number} */
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const base = new Map()
for (const f of ['base.css', 'semantic.css']) for (const [k, v] of declarationsOf(readTokenFile(f))) base.set(k, v)
const dark = new Map([...base, ...declarationsOf(readTokenFile('themes/dark.css'))])
const light = new Map([...dark, ...splitLightMedia(readTokenFile('themes/light.css')).light])
/** @type {[string, Map<string, string>][]} */
const schemes = [['dark', dark], ['light', light]]
for (const f of readdirSync(new URL('./skins/', import.meta.url))) {
  if (!f.endsWith('.css') || f === 'index.css') continue
  schemes.push([`skin ${f}`, new Map([...dark, ...declarationsOf(readFileSync(new URL(`./skins/${f}`, import.meta.url), 'utf8'))])])
}

/** @param {Map<string, string>} decls @param {string} name @returns {number[]} */
function colour(decls, name) {
  const v = resolveToken(name, decls)
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} resolves to ${v}, not #rrggbb`)
  return rgb(v)
}

describe('view cube face labels (TODO/ui-162)', () => {
  it('the component declares its tint', () => {
    expect(TINT).toBeGreaterThan(0)
    expect(TINT).toBeLessThan(60)
  })

  it.each(schemes)('%s: every face label has 4.5:1 against its tinted fill', (_name, decls) => {
    for (const face of VIEW_CUBE_FACES) {
      const axis = colour(decls, `--axis-${face.axis}`)
      const shade = colour(decls, `--view-cube-${face.view}`)
      const fill = axis.map((c, i) => (c * TINT + shade[i] * (100 - TINT)) / 100)
      const textToken = face.view === 'bottom' ? '--view-cube-label-light' : '--view-cube-label'
      expect(contrast(fill, colour(decls, textToken)), `${face.view} in ${_name}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

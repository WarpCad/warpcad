// SPDX-License-Identifier: AGPL-3.0-or-later
// Guard for TODO/docs-023: every third-party product name the app source uses to name a compatible part
// must also appear, with its owner, in the "Trademarks and names" section of LICENSING.md. Add a new brand
// name to BRAND_NAMES below the day it first appears in src/; the guard then fails until the section names it.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** @type {string[]} product names (as they appear in src/) that the Trademarks section must name */
export const BRAND_NAMES = [
  'Raspberry Pi',
  'iPhone',
  'Apple',
  'Pixel',
  'Galaxy',
  'Samsung',
  'Adafruit',
  'Pimoroni',
]

/** @type {string[]} services the app calls or names; the section must name these even if src/ does not */
export const SERVICE_NAMES = ['Claude', 'Anthropic', 'GitHub', 'Sentry', 'Google Analytics', 'OpenJSCAD']

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Every non-test source file under src/.
 * @param {string} dir absolute directory
 * @returns {string[]} absolute file paths
 */
function sourceFiles(dir) {
  /** @type {string[]} */
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) out.push(...sourceFiles(p))
    else if (/\.(js|mjs|vue|ts)$/.test(e.name) && !/\.(spec|e2e|story|stories)\./.test(e.name)) out.push(p)
  }
  return out
}

/**
 * The text of the "Trademarks and names" section of LICENSING.md (heading to the next `## ` heading).
 * @returns {string}
 */
function trademarkSection() {
  const text = readFileSync(`${ROOT}LICENSING.md`, 'utf8')
  const m = /^## Trademarks and names\n([\s\S]*?)(?=^## |\n<!-- SPDX)/m.exec(text)
  return m ? m[1] : ''
}

describe('trademark notice (docs-023)', () => {
  const section = trademarkSection()

  it('LICENSING.md has a "Trademarks and names" section', () => {
    expect(section.length).toBeGreaterThan(200)
  })

  it('every brand name used in src/ is named in the section', () => {
    const src = sourceFiles(`${ROOT}src`).map((f) => readFileSync(f, 'utf8')).join('\n')
    const used = BRAND_NAMES.filter((n) => src.includes(n))
    expect(used.length).toBeGreaterThan(0)
    const missing = used.filter((n) => !section.includes(n))
    expect(missing).toEqual([])
  })

  it('the section names every service the app calls or names', () => {
    expect(SERVICE_NAMES.filter((n) => !section.includes(n))).toEqual([])
  })

  it('the section states the no-affiliation rule', () => {
    expect(section.replace(/\s+/g, ' ')).toMatch(/not affiliated with, or endorsed by/)
  })

  it('README.md, docs/hardware-library.md and CONTRIBUTING.md point at the section', () => {
    for (const f of ['README.md', 'docs/hardware-library.md', 'CONTRIBUTING.md']) {
      expect(readFileSync(`${ROOT}${f}`, 'utf8'), f).toMatch(/LICENSING\.md#trademarks-and-names/)
    }
  })
})

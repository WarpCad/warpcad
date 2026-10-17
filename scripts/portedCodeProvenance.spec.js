// SPDX-License-Identifier: AGPL-3.0-or-later
// Guard for TODO/docs-024: every file in src/ that says it is "ported from `jscad-...`" (or generated from a
// jscad- library) must be named in the "Ported code and data" section of LICENSING.md, together with the V1
// library it came from. Add a new ported file to EXPECTED_PORTED below the day it first appears; the guard
// fails until the section names it, and fails if src/ holds a ported file this list does not know about.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** @type {Record<string, string>} repo-relative ported source file -> the V1 library the section must name for it */
export const EXPECTED_PORTED = {
  'src/core/kernel/tables/rpi-parts.js': 'jscad-raspberrypi',
  'src/core/kernel/tables/fit-clearances.js': 'jscad-hardware',
  'src/core/kernel/tables/washer-specs.js': 'jscad-hardware',
  'src/core/kernel/tables/screw-specs.js': 'jscad-hardware',
  'src/core/kernel/tables/nut-specs.js': 'jscad-hardware',
  'src/core/kernel/tables/bolt-specs.js': 'jscad-hardware',
  'src/core/kernel/tables/hardware-tables.generated.js': 'jscad-hardware',
  'src/core/kernel/group.js': 'jscad-utils',
}

/** @type {Record<string, string>} data and fixture files outside the header scan that the section must also name */
export const EXPECTED_DATA = {
  'src/core/gear/__fixtures__/v1-gears.json': '@jwc/jscad-gears',
  'scripts/generate-v1-gear-fixture.cjs': '@jwc/jscad-gears',
  'src/core/kernel/recipes/__fixtures__/group-snap-align.real-usage.md': 'PiPiece',
}

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Every non-test source file under a directory.
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
 * The text of the "Ported code and data" section of LICENSING.md (heading to the next `## ` heading).
 * @returns {string}
 */
function portedSection() {
  const text = readFileSync(`${ROOT}LICENSING.md`, 'utf8')
  const m = /^## Ported code and data\n([\s\S]*?)(?=^## |\n<!-- SPDX)/m.exec(text)
  return m ? m[1] : ''
}

describe('ported-code provenance statement (docs-024)', () => {
  it('has the section', () => {
    expect(portedSection().length).toBeGreaterThan(200)
  })

  it('names every ported file in src/ and nothing in src/ is ported without being on the expected list', () => {
    /** @type {string[]} */
    const found = []
    for (const abs of sourceFiles(`${ROOT}src`)) {
      const text = readFileSync(abs, 'utf8')
      if (/ported from [`']?jscad-/i.test(text) || /generated[^\n]*from jscad-/i.test(text)) {
        found.push(abs.slice(ROOT.length))
      }
    }
    expect(found.sort()).toEqual(Object.keys(EXPECTED_PORTED).sort())
  })

  it.each(Object.entries({ ...EXPECTED_PORTED, ...EXPECTED_DATA }))('names %s and its library %s', (file, lib) => {
    const section = portedSection()
    expect(section, `${file} missing from LICENSING.md "Ported code and data"`).toContain(file.split('/').pop())
    expect(section, `${lib} missing from the section`).toContain(lib)
  })

  it('states the copyright holder relicenses under AGPL-3.0-or-later, the Hessmer fact, and the dimensional sources', () => {
    const s = portedSection()
    expect(s).toMatch(/AGPL-3\.0-or-later/)
    expect(s).toMatch(/Hessmer/)
    expect(s).toMatch(/atlrod\.com/)
    expect(s).toMatch(/americanfastener\.com/)
    expect(s).toMatch(/ISO 7089/)
    expect(s).toMatch(/ISO 4032/)
    expect(s).toMatch(/docs\/decisions\/gears\.md/)
  })

  it('README links to the section', () => {
    expect(readFileSync(`${ROOT}README.md`, 'utf8')).toContain('LICENSING.md#ported-code-and-data')
  })
})

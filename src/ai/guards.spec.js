// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — reads source files with node:fs; `src/` is typed for the browser (no @types/node).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `TODO/ai-004`, `docs/decisions/ai-partner.md` decision 8: model output is attacker-influenced
 * text, so it is never rendered as HTML and no remote resource is ever loaded from it. These
 * are source guards, in the spirit of `schema.spec.js`'s "no tool references fetch" check.
 */

const root = process.cwd()

/** @param {string} dir @returns {string[]} */
function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(vue|js)$/.test(entry) && !entry.endsWith('.spec.js')) out.push(full)
  }
  return out
}

/** @param {string} source */
function codeOnly(source) {
  // Comments may *say* "never v-html"; only code and templates count.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('the AI surface renders model output as text only', () => {
  const files = [...sourceFiles(join(root, 'src/components/ai')), ...sourceFiles(join(root, 'src/ai'))]

  it('has files to guard (so the guard cannot pass vacuously)', () => {
    expect(files.some((f) => f.endsWith('KeySheet.vue'))).toBe(true)
    expect(files.some((f) => f.endsWith('client.js'))).toBe(true)
  })

  it('uses no v-html, innerHTML, outerHTML or insertAdjacentHTML', () => {
    const offenders = files.filter((f) => /v-html|innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(codeOnly(readFileSync(f, 'utf8'))))
    expect(offenders).toEqual([])
  })

  it('loads no remote image: no <img src=http…>, no CSS url(http…), no new Image()', () => {
    const offenders = files.filter((f) => /<img[^>]+src=["']?https?:|url\(\s*["']?https?:|new Image\(/.test(codeOnly(readFileSync(f, 'utf8'))))
    expect(offenders).toEqual([])
  })

  it('only the provider client (and the assistant store test hook) talks to the network', () => {
    const offenders = files.filter((f) => !f.endsWith('client.js') && /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(codeOnly(readFileSync(f, 'utf8'))))
    expect(offenders).toEqual([])
  })
})

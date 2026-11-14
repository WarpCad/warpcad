// SPDX-License-Identifier: AGPL-3.0-or-later
// Guards the rule in CLAUDE.md that colours (and z-index, font size and weight) are tokens, never literals
// (`TODO/testing-036`). Rules live in `guardScan.js`. Violations are phased in by an allow-list of
// nothing: the allow-list `ui-118` emptied is gone, so any violation fails. Spacing and radius are
// deliberately not guarded yet.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { REPO_ROOT, rel, sourceFiles, surface0 } from './cssTokens.js'
import { compareToAllowlist, definedVariables, scanFile, scanScriptColours, scanStyleBlocks } from './guardScan.js'

const srcRoot = `${REPO_ROOT}src`
const files = sourceFiles(srcRoot, ['.vue', '.js', '.css']).filter((f) => !f.includes('/__fixtures__/'))
const texts = new Map(files.map((f) => [rel(f), readFileSync(f, 'utf-8')]))
const defined = new Set([...texts.values()].flatMap((t) => [...definedVariables(t)]))

/** Wrap a style body in a minimal component. */
/** @param {string} css @returns {string} */
const vue = (css) => `<template><div /></template>\n<style scoped>\n${css}\n</style>\n`
/** @param {{ rule: string }[]} vs @returns {string[]} */
const names = (vs) => vs.map((v) => v.rule)

describe('the tree is strict', () => {
  it('has no violation of any rule', () => {
    const scanned = [...texts].map(([file, text]) => ({ file, violations: scanFile(file, text, defined) }))
    const errors = compareToAllowlist({}, scanned)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

describe('each rule bites, naming the file, line and fix', () => {
  it('colour literals in a style block: hex, rgb(), hsla() and named colours', () => {
    const vs = scanStyleBlocks(vue('.a {\n  color: #ff0000;\n  background: rgba(0, 0, 0, 0.5);\n  border: 1px solid red;\n  fill: hsl(10 20% 30%);\n}'), defined)
    expect(names(vs)).toEqual(['style-color', 'style-color', 'style-color', 'style-color'])
    expect(vs[0].line).toBe(4)
    expect(vs[0].text).toContain('#ff0000')
    expect(vs[0].fix).toContain('src/styles/semantic.css')
  })

  it('allows transparent, currentColor, inherit, tokens, selectors and ids', () => {
    const css = '#app .row:hover {\n  color: inherit;\n  background: transparent;\n  border-color: currentColor;\n  fill: var(--accent);\n  content: "red";\n  font-family: system-ui;\n}'
    expect(scanStyleBlocks(vue(css), defined)).toEqual([])
  })

  it('z-index with a number, but not a token or calc() on one', () => {
    expect(names(scanStyleBlocks(vue('.a { z-index: 10; }\n.b { z-index: -1; }'), defined))).toEqual(['style-z-index', 'style-z-index'])
    expect(scanStyleBlocks(vue('.a { z-index: var(--z-panel); z-index: calc(var(--z-panel) + 1); }'), defined)).toEqual([])
  })

  it('font-size and font-weight with a number, but not a token', () => {
    expect(names(scanStyleBlocks(vue('.a { font-size: 12px; font-weight: 600; }'), defined))).toEqual(['style-font', 'style-font'])
    expect(scanStyleBlocks(vue('.a { font-size: var(--text-size-sm); font-weight: var(--weight-bold); }'), new Set(['--text-size-sm', '--weight-bold']))).toEqual([])
  })

  it('a var() fallback that is not itself a var()', () => {
    const vs = scanStyleBlocks(vue('.a { margin: var(--layout-x, 4px); gap: var(--layout-x, var(--layout-x)); }'), new Set(['--layout-x']))
    expect(names(vs)).toEqual(['style-var-fallback'])
  })

  it('a var() naming something defined nowhere under src/', () => {
    const vs = scanStyleBlocks(vue('.a { color: var(--nope-nothing); }'), defined)
    expect(names(vs)).toEqual(['style-var-undefined'])
    expect(vs[0].fix).toContain('--nope-nothing')
  })

  it('colour literals in style= and :style= attributes', () => {
    const t = '<template>\n<div style="color: #fff" />\n<div :style="{ background: \'rgb(1,2,3)\' }" />\n<div :style="{ width: w }" />\n</template>'
    const vs = scanFile('src/components/x/X.vue', t, defined)
    expect(names(vs)).toEqual(['inline-style-color', 'inline-style-color'])
    expect(vs.map((v) => v.line)).toEqual([2, 3])
  })

  it('0x six-digit and quoted #hex literals in JavaScript, outside the exempt files', () => {
    const js = "const a = 0xff8800\nconst b = '#abc'\nconst c = 0x10\n// '#fff' in a comment\n"
    const vs = scanScriptColours(js)
    expect(names(vs)).toEqual(['js-color', 'js-color'])
    expect(vs.map((v) => v.line)).toEqual([1, 2])
    expect(scanFile('src/render/theme.js', js, defined)).toEqual([])
    expect(scanFile('src/core/kernel/colors.js', js, defined)).toEqual([])
    expect(names(scanFile('src/render/scene.js', js, defined))).toEqual(['js-color', 'js-color'])
    expect(scanFile('src/core/other.js', js, defined)).toEqual([])
    expect(scanFile('src/styles/x.vue', vue('.a { color: #fff; }'), defined)).toEqual([])
  })

  it('the failure message names the file, line and fix', () => {
    const scanned = [{ file: 'src/components/x/X.vue', violations: scanStyleBlocks(vue('.a {\n color: #ff0000;\n}'), defined) }]
    const [msg] = compareToAllowlist({}, scanned)
    expect(msg).toContain('src/components/x/X.vue:4')
    expect(msg).toContain('#ff0000')
    expect(msg).toContain('Fix:')
  })
})

describe('the allow-list only shrinks', () => {
  /** @param {number} n @returns {{ file: string, violations: import('./guardScan.js').Violation[] }[]} */
  const scanned = (n) => [{ file: 'src/a.vue', violations: Array.from({ length: n }, (_, i) => ({ rule: 'style-color', line: i + 1, text: 'color: #fff', fix: 'x' })) }]

  it('passes at exactly the allowance', () => {
    expect(compareToAllowlist({ 'style-color': { 'src/a.vue': 2 } }, scanned(2))).toEqual([])
  })

  it('fails when a file exceeds its allowance', () => {
    const [msg] = compareToAllowlist({ 'style-color': { 'src/a.vue': 1 } }, scanned(2))
    expect(msg).toMatch(/has 2, allowed 1/)
  })

  it('fails when a file is under its allowance, telling the author to tighten the list', () => {
    const [msg] = compareToAllowlist({ 'style-color': { 'src/a.vue': 3 } }, scanned(1))
    expect(msg).toMatch(/has 1, allowed 3/)
    expect(msg).toContain('guard-allowlist.json')
  })

  it('fails when a migrated file still has an entry', () => {
    expect(compareToAllowlist({ 'style-color': { 'src/a.vue': 1 } }, scanned(0))).toHaveLength(1)
  })

  it('fails on a file the list does not mention', () => {
    expect(compareToAllowlist({}, scanned(1))).toHaveLength(1)
  })
})

describe('first-paint copies of --surface-0', () => {
  const { dark } = surface0()

  it('index.html and the PWA manifest hold the dark value', () => {
    expect(readFileSync(`${REPO_ROOT}index.html`, 'utf-8').toLowerCase()).toContain(`background: ${dark}`)
    const vite = readFileSync(`${REPO_ROOT}vite.config.js`, 'utf-8')
    expect(vite.match(/background_color:\s*'(#[0-9a-f]{6})'/i)?.[1].toLowerCase()).toBe(dark)
    expect(vite.match(/theme_color:\s*'(#[0-9a-f]{6})'/i)?.[1].toLowerCase()).toBe(dark)
  })

  it('the native shell window backgroundColor equals it, when warpcad-native is checked out', () => {
    const conf = `${REPO_ROOT}../warpcad-native/src-tauri/tauri.conf.json`
    if (!existsSync(conf)) {
      console.warn('style guard: ../warpcad-native is not checked out, skipping the tauri.conf.json backgroundColor check')
      return
    }
    const windows = JSON.parse(readFileSync(conf, 'utf-8')).app?.windows ?? []
    expect(windows.length, 'tauri.conf.json lists no window').toBeGreaterThan(0)
    for (const w of windows) expect(String(w.backgroundColor).toLowerCase(), 'tauri.conf.json backgroundColor').toBe(dark)
  })
})

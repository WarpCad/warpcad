// SPDX-License-Identifier: AGPL-3.0-or-later
// The scanner behind `src/styles/guard.spec.js` (`TODO/testing-036`): finds styling written outside the
// token files. Pure functions over text, so the spec can prove each rule bites with a fixture string.
// Node only, never imported by the app.
import { V1_CSS_COLOR_HEX } from '../core/kernel/colors.js'

/** @typedef {{ rule: string, line: number, text: string, fix: string }} Violation */

/** The rule ids, in report order. */
export const RULES = ['style-color', 'style-z-index', 'style-font', 'style-var-fallback', 'style-var-undefined', 'inline-style-color', 'js-color']

/** Values that are never a colour literal. */
const NOT_A_COLOUR = new Set(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert'])
const NAMED_COLOURS = new Set(Object.keys(V1_CSS_COLOR_HEX).map((n) => n.toLowerCase()).filter((n) => !NOT_A_COLOUR.has(n)))
/** Properties whose value can hold a named colour (a named colour elsewhere is a keyword, a font name, a string). */
const COLOUR_PROPS = /color|background|border|outline|fill|stroke|shadow|text-decoration|caret|accent/i
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-z_-])/i
const FUNC = /\b(?:rgba?|hsla?)\(/i

const TOKEN_FIX = 'use a colour token from src/styles/semantic.css (var(--surface-1), var(--text-1), var(--accent) ...)'

/**
 * Blank out comments, keeping every newline so line numbers stay true.
 * @param {string} text
 * @returns {string}
 */
function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
}

/**
 * 1-based line number of an offset.
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function lineOf(text, index) {
  let n = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++
  return n
}

/**
 * Every custom property a source text defines or sets from script.
 * @param {string} text
 * @returns {Set<string>}
 */
export function definedVariables(text) {
  const bare = blankComments(text)
  const out = new Set()
  for (const m of bare.matchAll(/(--[a-z][a-z0-9-]*)\s*:/gi)) out.add(m[1])
  for (const m of bare.matchAll(/['"`](--[a-z][a-z0-9-]*)['"`]/gi)) out.add(m[1])
  return out
}

/**
 * The text of each `<style>` block of a .vue file, padded with newlines so line numbers match the file.
 * @param {string} text
 * @returns {string[]}
 */
function styleBlocks(text) {
  /** @type {string[]} */
  const out = []
  for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    out.push('\n'.repeat(lineOf(text, m.index + m[0].indexOf('>') + 1) - 1) + m[1])
  }
  return out
}

/**
 * Every custom-property use that has a fallback, with the balanced fallback, with the balanced fallback.
 * @param {string} bare comment-free text
 * @returns {{ index: number, name: string, fallback: string }[]}
 */
function varFallbacks(bare) {
  const out = []
  for (const m of bare.matchAll(/var\(\s*(--[a-z][a-z0-9-]*)\s*,/gi)) {
    let depth = 1
    let i = m.index + m[0].length
    const from = i
    for (; i < bare.length && depth > 0; i++) {
      if (bare[i] === '(') depth++
      else if (bare[i] === ')') depth--
    }
    out.push({ index: m.index, name: m[1], fallback: bare.slice(from, i - 1).trim() })
  }
  return out
}

/**
 * @param {string} value a declaration value
 * @param {string} prop its property name
 * @returns {boolean} true when it holds a colour literal
 */
function hasColourLiteral(value, prop) {
  const v = value.replace(/var\([^)]*\)/gi, ' ').replace(/(["']).*?\1/g, ' ')
  if (HEX.test(v) || FUNC.test(v)) return true
  if (!COLOUR_PROPS.test(prop)) return false
  return (v.toLowerCase().match(/[a-z]+/g) ?? []).some((w) => NAMED_COLOURS.has(w))
}

/**
 * Rules for the `<style>` blocks of a .vue file outside `src/styles/`.
 * @param {string} text the whole .vue file
 * @param {Set<string>} defined every custom property defined anywhere under `src/`
 * @returns {Violation[]}
 */
export function scanStyleBlocks(text, defined) {
  /** @type {Violation[]} */
  const found = []
  for (const block of styleBlocks(text)) {
    const bare = blankComments(block)
    for (const m of bare.matchAll(/(?<![\w-])([a-z-]+)\s*:\s*([^;{}]+?)\s*(?=[;}])/gi)) {
      const [whole, prop, value] = m
      const line = lineOf(bare, m.index)
      const shown = whole.trim()
      if (hasColourLiteral(value, prop)) found.push({ rule: 'style-color', line, text: shown, fix: TOKEN_FIX })
      if (prop === 'z-index' && /^[+-]?\d/.test(value)) {
        found.push({ rule: 'style-z-index', line, text: shown, fix: 'use a --z-* token from src/styles/semantic.css, or calc() on one' })
      }
      if ((prop === 'font-size' || prop === 'font-weight') && /^[+-]?[\d.]/.test(value)) {
        found.push({ rule: 'style-font', line, text: shown, fix: 'use a --font-size-* / --text-size-* / --font-weight-* token from src/styles/' })
      }
    }
    for (const u of varFallbacks(bare)) {
      if (u.fallback && !/^var\(/i.test(u.fallback)) {
        found.push({ rule: 'style-var-fallback', line: lineOf(bare, u.index), text: `var(${u.name}, ${u.fallback})`, fix: 'drop the literal fallback, or make it another var()' })
      }
    }
    for (const m of bare.matchAll(/var\(\s*(--[a-z][a-z0-9-]*)/gi)) {
      if (!defined.has(m[1])) {
        found.push({ rule: 'style-var-undefined', line: lineOf(bare, m.index), text: `var(${m[1]})`, fix: `define ${m[1]} in src/styles/ (or fix the name): nothing under src/ defines it` })
      }
    }
  }
  return found
}

/**
 * Colour literals in a .vue template's `style="..."` and `:style="..."` attributes.
 * @param {string} text the whole .vue file
 * @returns {Violation[]}
 */
export function scanInlineStyles(text) {
  /** @type {Violation[]} */
  const found = []
  const template = text.replace(/<style\b[\s\S]*?<\/style>|<script\b[\s\S]*?<\/script>/gi, (m) => m.replace(/[^\n]/g, ' '))
  const bare = blankComments(template)
  for (const m of bare.matchAll(/(?<![\w-]):?style\s*=\s*("[^"]*"|'[^']*')/gi)) {
    const value = m[1].slice(1, -1)
    if (HEX.test(value.replace(/&#\d+;/g, '')) || FUNC.test(value)) {
      found.push({ rule: 'inline-style-color', line: lineOf(bare, m.index), text: m[0].trim(), fix: `${TOKEN_FIX} (in the binding, a quoted var() string)` })
    }
  }
  return found
}

/**
 * `0xRRGGBB` and quoted `'#hex'` colour literals in JavaScript.
 * @param {string} text a .js file, or the text of a .vue file
 * @returns {Violation[]}
 */
export function scanScriptColours(text) {
  /** @type {Violation[]} */
  const found = []
  const script = text.replace(/<style\b[\s\S]*?<\/style>/gi, (m) => m.replace(/[^\n]/g, ' '))
  const bare = script.replace(/\/\*[\s\S]*?\*\/|(?<![:'"`])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
  const fix = 'read the colour from the theme (src/render/theme.js) instead of hardcoding it'
  for (const m of bare.matchAll(/\b0x[0-9a-f]{6}\b/gi)) found.push({ rule: 'js-color', line: lineOf(bare, m.index), text: m[0], fix })
  for (const m of bare.matchAll(/(["'`])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\1/gi)) {
    found.push({ rule: 'js-color', line: lineOf(bare, m.index), text: m[0], fix })
  }
  return found
}

/** Files the JavaScript colour rule never reads: the theme's fallback table, and the named-colour data. */
export const JS_COLOUR_EXEMPT = ['src/render/theme.js', 'src/core/kernel/colors.js']

/**
 * Run every rule that applies to one file.
 * @param {string} relPath repo-relative, forward slashes
 * @param {string} text file contents
 * @param {Set<string>} defined every custom property defined anywhere under `src/`
 * @returns {Violation[]}
 */
export function scanFile(relPath, text, defined) {
  /** @type {Violation[]} */
  const out = []
  if (relPath.endsWith('.vue') && !relPath.startsWith('src/styles/')) {
    out.push(...scanStyleBlocks(text, defined), ...scanInlineStyles(text))
  }
  if ((relPath.startsWith('src/render/') || relPath.startsWith('src/components/')) && !JS_COLOUR_EXEMPT.includes(relPath)) {
    out.push(...scanScriptColours(text))
  }
  return out
}

/**
 * Compare found violations against the allow-list. A file over its allowance, and a file under it, both fail.
 * @param {Record<string, Record<string, number>>} allow rule -> file -> allowed count
 * @param {{ file: string, violations: Violation[] }[]} scanned
 * @returns {string[]} one message per problem; empty when the tree matches the list exactly
 */
export function compareToAllowlist(allow, scanned) {
  /** @type {string[]} */
  const errors = []
  /** @type {Map<string, Map<string, Violation[]>>} */
  const byRule = new Map()
  for (const { file, violations } of scanned) {
    for (const v of violations) {
      if (!byRule.has(v.rule)) byRule.set(v.rule, new Map())
      const files = /** @type {Map<string, Violation[]>} */ (byRule.get(v.rule))
      files.set(file, [...(files.get(file) ?? []), v])
    }
  }
  for (const rule of RULES) {
    const files = byRule.get(rule) ?? new Map()
    const allowed = allow[rule] ?? {}
    for (const file of new Set([...files.keys(), ...Object.keys(allowed)])) {
      const hits = files.get(file) ?? []
      const limit = allowed[file] ?? 0
      if (hits.length > limit) {
        const lines = hits.map((/** @type {Violation} */ h) => `  ${file}:${h.line}  ${h.text}`).join('\n')
        errors.push(`[${rule}] ${file} has ${hits.length}, allowed ${limit}. Fix: ${hits[0].fix}\n${lines}`)
      } else if (hits.length < limit) {
        errors.push(`[${rule}] ${file} has ${hits.length}, allowed ${limit}. It was migrated: lower its entry in src/styles/guard-allowlist.json to ${hits.length}${hits.length ? '' : ' (delete the entry)'}. The list only shrinks.`)
      }
    }
  }
  return errors
}

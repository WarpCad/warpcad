// SPDX-License-Identifier: AGPL-3.0-or-later
// Reads the design-token CSS files as text, for the specs that guard them (`src/styles/tokens.spec.js`,
// `build/index-html.spec.js`). Node only, never imported by the app.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

/** Absolute path of the repository root, with a trailing slash. */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** The token files, relative to `src/styles/`. `index.css` imports the others in this order. */
export const TOKEN_FILES = ['base.css', 'semantic.css', 'themes/dark.css', 'themes/light.css', 'reset.css', 'index.css']

/**
 * The text of one token file, or '' when it does not exist yet.
 * @param {string} file path relative to `src/styles/`
 * @returns {string}
 */
export function readTokenFile(file) {
  const path = `${REPO_ROOT}src/styles/${file}`
  return existsSync(path) ? readFileSync(path, 'utf-8') : ''
}

/**
 * The custom-property declarations in a CSS text, comments removed. Later declarations of a name win.
 * @param {string} css
 * @returns {Map<string, string>} name (with the leading `--`) to its raw value
 */
export function declarationsOf(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  /** @type {Map<string, string>} */
  const out = new Map()
  for (const m of bare.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) out.set(m[1], m[2].trim())
  return out
}

/**
 * The declarations inside the light scheme's `@media (prefers-color-scheme: light)` block, and
 * the ones outside it.
 * @param {string} css
 * @returns {{ light: Map<string, string>, base: Map<string, string> }}
 */
export function splitLightMedia(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const start = bare.search(/@media\s*\(\s*prefers-color-scheme:\s*light\s*\)\s*\{/)
  if (start < 0) return { light: new Map(), base: declarationsOf(bare) }
  let depth = 0
  let end = bare.length
  for (let i = bare.indexOf('{', start); i < bare.length; i++) {
    if (bare[i] === '{') depth++
    else if (bare[i] === '}' && --depth === 0) {
      end = i + 1
      break
    }
  }
  return { light: declarationsOf(bare.slice(start, end)), base: declarationsOf(bare.slice(0, start) + bare.slice(end)) }
}

/**
 * Resolve a token to its final value by following `var(--other)` references through `decls`.
 * @param {string} name token name with the leading `--`
 * @param {Map<string, string>} decls
 * @returns {string | undefined}
 */
export function resolveToken(name, decls) {
  let value = decls.get(name)
  for (let hops = 0; value !== undefined && hops < 10; hops++) {
    const ref = value.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i)
    if (!ref) return value
    value = decls.get(ref[1])
  }
  return value
}

/**
 * The resolved `--surface-0` of the dark (default) and light schemes.
 * @returns {{ dark: string | undefined, light: string | undefined }}
 */
export function surface0() {
  const all = new Map()
  for (const f of ['base.css', 'semantic.css']) for (const [k, v] of declarationsOf(readTokenFile(f))) all.set(k, v)
  const dark = new Map([...all, ...declarationsOf(readTokenFile('themes/dark.css'))])
  const lightSplit = splitLightMedia(readTokenFile('themes/light.css'))
  const light = new Map([...dark, ...lightSplit.light])
  return { dark: resolveToken('--surface-0', dark)?.toLowerCase(), light: resolveToken('--surface-0', light)?.toLowerCase() }
}

/**
 * Every source file under `dir` with one of the extensions, spec files excluded.
 * @param {string} dir absolute directory
 * @param {string[]} exts extensions with the dot
 * @returns {string[]} absolute paths
 */
export function sourceFiles(dir, exts) {
  /** @type {string[]} */
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p, exts))
    else if (exts.some((e) => name.endsWith(e)) && !/\.(spec|e2e|story)\.js$/.test(name)) out.push(p)
  }
  return out
}

/**
 * A path relative to the repository root, for messages.
 * @param {string} abs
 * @returns {string}
 */
export function rel(abs) {
  return relative(REPO_ROOT, abs)
}

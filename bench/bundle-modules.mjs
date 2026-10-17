// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Which modules the production bundle's initial JavaScript is made of (`TODO/perf-002`).
 *
 * Reads a production build that was made **with source maps** and attributes every byte of
 * each chunk's minified output to the source module its mapping points at. A segment's bytes
 * run from its generated column to the next segment's (or the end of the line); bytes with no
 * source (Rolldown's runtime glue, the chunk's import/export statements) are reported as
 * `(unmapped)`; the continuation lines of a multi-line template literal carry no mapping of their
 * own and are given to the module the literal started in. Modules are then
 * grouped: `node_modules/<package>` by package (`three/addons` separately from `three` core,
 * because the addons are the obvious deferral candidate), and `src/<dir>` by top-level
 * directory. The gzip column is each group's own bytes gzipped on their own: an *estimate* of
 * that group's share of the transfer, not an exact one (gzip's window crosses group borders).
 *
 * The "initial" set is the entry chunk in `index.html` plus every chunk it `modulepreload`s,
 * which is exactly what a browser fetches before the app can mount.
 *
 * No dependency: the VLQ decoder is the ten lines below, so this needs nothing but Node.
 *
 * Usage:
 *   npx vite build --sourcemap --outDir /tmp/warpcad-maps --emptyOutDir
 *   node bench/bundle-modules.mjs --dist /tmp/warpcad-maps            # the initial set
 *   node bench/bundle-modules.mjs --dist /tmp/warpcad-maps --all      # every chunk, one by one
 *   node bench/bundle-modules.mjs --dist /tmp/warpcad-maps --top 40 --modules  # single modules
 *   node bench/bundle-modules.mjs --dist /tmp/warpcad-maps --json out.json
 *   node bench/bundle-modules.mjs --dist /tmp/exp/dist --root /tmp/exp   # a scratch-copy build
 *
 * `--sourcemap` on the command line does not change the chunk graph (the hashes match a plain
 * `npm run build`), it only writes the `.map` files next to the chunks.
 *
 * @module bench/bundle-modules
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const args = process.argv.slice(2)
/** @param {string} flag @param {string} [fallback] */
const option = (flag, fallback) => {
  const index = args.indexOf(flag)
  return index === -1 ? fallback : args[index + 1]
}
const DIST = resolve(option('--dist', 'dist') ?? 'dist')
/** The source tree the build was made from (a scratch copy for an experimental build). */
const ROOT = resolve(option('--root', '.') ?? '.')
const TOP = Number(option('--top', '25'))
const ALL = args.includes('--all')
const MODULES = args.includes('--modules')
const JSON_OUT = option('--json')

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_VALUE = new Map([...B64].map((char, index) => [char, index]))

/**
 * Decodes one comma-free VLQ segment into its integer fields.
 *
 * @param {string} segment
 * @returns {number[]}
 */
function decodeSegment(segment) {
  const values = []
  let value = 0
  let shift = 0
  for (const char of segment) {
    const digit = /** @type {number} */ (B64_VALUE.get(char))
    value += (digit & 31) << shift
    if (digit & 32) {
      shift += 5
    } else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1)
      value = 0
      shift = 0
    }
  }
  return values
}

/**
 * Per-source byte counts (and the bytes themselves, for the gzip estimate) of one chunk.
 *
 * @param {string} code the chunk's generated code
 * @param {{ sources: string[], mappings: string }} map
 * @returns {Map<string, string[]>} source path → generated slices
 */
function attribute(code, map) {
  /** @type {Map<string, string[]>} */
  const slices = new Map()
  const push = (/** @type {string} */ source, /** @type {string} */ text) => {
    if (text.length === 0) return
    const list = slices.get(source)
    if (list) list.push(text)
    else slices.set(source, [text])
  }
  const lines = code.split('\n')
  const mappingLines = map.mappings.split(';')
  let sourceIndex = 0
  /** The source the previous line ended in: a multi-line template literal (three.js's GLSL
   * chunks, the assistant's system prompt) has mappings only on its first line, so the lines
   * after it belong to whatever module that last segment came from. */
  let carried = '(unmapped)'
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const raw = mappingLines[lineIndex] ?? ''
    /** @type {{ column: number, source: number | null }[]} */
    const segments = []
    let column = 0
    for (const segment of raw.split(',')) {
      if (segment === '') continue
      const fields = decodeSegment(segment)
      column += fields[0]
      if (fields.length >= 4) {
        sourceIndex += fields[1]
        segments.push({ column, source: sourceIndex })
      } else {
        segments.push({ column, source: null })
      }
    }
    if (segments.length === 0) {
      push(carried, line)
      continue
    }
    push(carried, line.slice(0, segments[0].column))
    for (let index = 0; index < segments.length; index += 1) {
      const start = segments[index].column
      const end = index + 1 < segments.length ? segments[index + 1].column : line.length
      const source = segments[index].source
      carried = source === null ? '(unmapped)' : map.sources[source]
      push(carried, line.slice(start, end))
    }
  }
  return slices
}

/**
 * The group a source path is reported under.
 *
 * @param {string} source
 * @returns {string}
 */
function groupOf(source) {
  const nm = source.lastIndexOf('node_modules/')
  if (nm !== -1) {
    const rest = source.slice(nm + 'node_modules/'.length).split('/')
    const pkg = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]
    if (pkg === 'three' && rest[1] === 'examples') return 'three/addons'
    if (pkg === '@jscad/modeling') return `@jscad/modeling/${rest[3] ?? ''}`.replace(/\.js$/, '')
    return pkg
  }
  if (source.startsWith('src/')) {
    const rest = source.split('/')
    return rest.length > 2 ? `${rest[0]}/${rest[1]}` : rest.join('/')
  }
  if (source === '(unmapped)') return source
  return `(other) ${source.replace(/^(\.\.\/)+/, '')}`
}

/**
 * A map source as a path relative to `ROOT`. Worker chunks' maps are written against a different
 * base than the page's, so a path that lands outside `ROOT` falls back to its last `/src/` (or
 * `node_modules/`) segment, which is all `groupOf` needs.
 *
 * @param {string} source
 * @param {string} mapPath
 * @returns {string}
 */
function rootRelative(source, mapPath) {
  if (source.startsWith('\0') || source.includes(':')) return source
  const absolute = resolve(dirname(mapPath), source)
  const inRoot = relative(ROOT, absolute)
  if (!inRoot.startsWith('..')) return inRoot
  if (absolute.includes('node_modules/')) return absolute
  const at = absolute.lastIndexOf('/src/')
  return at === -1 ? inRoot : absolute.slice(at + 1)
}

/** @param {number} bytes */
const kb = (bytes) => (bytes / 1000).toFixed(1)

/**
 * The initial chunk set: `index.html`'s module script plus its modulepreloads.
 *
 * @returns {string[]} paths relative to `DIST`
 */
function initialChunks() {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')
  const files = []
  for (const match of html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)) files.push(match[1])
  for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) files.push(match[1])
  return files.map((file) => file.replace(/^.*?assets\//, 'assets/'))
}

/**
 * @param {string[]} chunkFiles
 * @param {string} title
 */
function report(chunkFiles, title) {
  /** @type {Map<string, string[]>} */
  const bySource = new Map()
  let total = 0
  let totalGzip = 0
  for (const file of chunkFiles) {
    const path = join(DIST, file)
    const mapPath = `${path}.map`
    if (!existsSync(mapPath)) throw new Error(`${file} has no source map: build with --sourcemap`)
    const code = readFileSync(path, 'utf8').replace(/\n\/\/# sourceMappingURL=.*\s*$/, '')
    total += Buffer.byteLength(code)
    totalGzip += gzipSync(code, { level: 9 }).length
    const map = JSON.parse(readFileSync(mapPath, 'utf8'))
    // Root-relative paths, so `src/…` groups by directory whatever the build's location.
    map.sources = map.sources.map((/** @type {string} */ source) => rootRelative(source, mapPath))
    for (const [source, slices] of attribute(code, map)) {
      const list = bySource.get(source)
      if (list) list.push(...slices)
      else bySource.set(source, slices)
    }
  }
  /** @type {Map<string, string[]>} */
  const byGroup = new Map()
  for (const [source, slices] of bySource) {
    const key = MODULES ? source : groupOf(source)
    const list = byGroup.get(key)
    if (list) list.push(...slices)
    else byGroup.set(key, [...slices])
  }
  const rows = [...byGroup].map(([group, slices]) => {
    const text = slices.join('')
    return { group, bytes: Buffer.byteLength(text), gzip: gzipSync(text, { level: 9 }).length }
  })
  rows.sort((a, b) => b.bytes - a.bytes)
  console.log(`\n## ${title}: ${chunkFiles.join(' + ')}`)
  console.log(`total ${kb(total)} kB raw, ${kb(totalGzip)} kB gzip -9 (each chunk gzipped alone)\n`)
  console.log(`| ${MODULES ? 'module' : 'group'} | raw kB | share | gzip kB (alone, est.) |`)
  console.log('|---|---|---|---|')
  for (const row of rows.slice(0, TOP)) {
    console.log(`| ${row.group} | ${kb(row.bytes)} | ${((100 * row.bytes) / total).toFixed(1)} % | ${kb(row.gzip)} |`)
  }
  if (rows.length > TOP) {
    const rest = rows.slice(TOP).reduce((sum, row) => sum + row.bytes, 0)
    console.log(`| …${rows.length - TOP} more | ${kb(rest)} | ${((100 * rest) / total).toFixed(1)} % | |`)
  }
  return { title, chunks: chunkFiles, total, totalGzip, rows }
}

const results = []
if (ALL) {
  for (const file of readdirSync(join(DIST, 'assets')).filter((name) => name.endsWith('.js'))) {
    results.push(report([`assets/${file}`], file))
  }
} else {
  results.push(report(initialChunks(), 'initial JavaScript'))
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 2))

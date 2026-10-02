// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Builds the "where WarpCad came from" montage of models built with JSCAD v1 over the years.
// The picks live in `docs/montage/jscad1.json`; swap an entry there when a better example
// turns up, then regenerate. The source images are NOT in this repo — they come from the
// author's local JSCAD v1 projects tree (`sourceRoot`, overridable with $JSCAD1_ROOT or --root).
//
//   npm run docs:montage                    # regenerate docs/images/jscad1-montage.jpg
//   npm run docs:montage -- --root ~/x      # use a different projects tree
//   npm run docs:montage -- --list          # print every candidate image under the root
//
// ffmpeg is the only external tool (same as docs-gifs.mjs).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SPEC_PATH = join(repoRoot, 'docs/montage/jscad1.json')

/**
 * @typedef {{ src: string, title?: string, crop?: { x: number, y: number, w: number, h: number } }} MontageItem
 * @typedef {{
 *   output: string, sourceRoot: string, sourceRootEnv?: string, columns: number,
 *   tile: { width: number, height: number }, gap: number, background: string, quality: number,
 *   items: MontageItem[]
 * }} MontageSpec
 */

/**
 * @param {string} p a path that may start with `~/`
 * @returns {string} the path with the home directory expanded
 */
export function expandHome(p) {
  return p === '~' || p.startsWith('~/') ? join(homedir(), p.slice(1)) : p
}

/**
 * Reject a spec that would produce a broken or lopsided grid before ffmpeg ever runs.
 *
 * @param {MontageSpec} spec
 * @returns {string[]} one message per problem; empty when the spec is usable
 */
export function validateSpec(spec) {
  const problems = []
  if (!Array.isArray(spec.items) || spec.items.length === 0) problems.push('items: need at least one image')
  if (!Number.isInteger(spec.columns) || spec.columns < 1) problems.push('columns: must be a positive integer')
  else if (Array.isArray(spec.items) && spec.items.length % spec.columns !== 0) {
    problems.push(`items: ${spec.items.length} images do not fill a ${spec.columns}-column grid — add or remove ${spec.columns - (spec.items.length % spec.columns)} (or change columns)`)
  }
  for (const it of spec.items ?? []) {
    const c = it.crop
    if (c && !(c.x >= 0 && c.y >= 0 && c.w > 0 && c.h > 0 && c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001)) {
      problems.push(`${it.src}: crop must be fractions of the image inside 0..1`)
    }
  }
  return problems
}

/**
 * Per-tile filter: optional fractional crop, then scale-to-cover and centre-crop to the tile,
 * then pad the right/bottom edge so `xstack` leaves a uniform gap.
 *
 * @param {number} index input stream index
 * @param {MontageItem} item
 * @param {MontageSpec} spec
 * @returns {string} one filtergraph chain ending in the label `[t<index>]`
 */
export function tileFilter(index, item, spec) {
  const { width: w, height: h } = spec.tile
  const crop = item.crop
    ? `crop=iw*${item.crop.w}:ih*${item.crop.h}:iw*${item.crop.x}:ih*${item.crop.y},`
    : ''
  return (
    `[${index}:v]${crop}scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,` +
    `crop=${w}:${h},pad=${w + spec.gap}:${h + spec.gap}:0:0:color=${spec.background},setsar=1[t${index}]`
  )
}

/**
 * @param {MontageSpec} spec
 * @param {string[]} inputs absolute source paths, one per item, in order
 * @param {string} output absolute output path
 * @returns {string[]} ffmpeg arguments
 */
export function buildFfmpegArgs(spec, inputs, output) {
  const { width: w, height: h } = spec.tile
  const cell = { w: w + spec.gap, h: h + spec.gap }
  const rows = Math.ceil(inputs.length / spec.columns)
  const layout = inputs.map((_, i) => `${(i % spec.columns) * cell.w}_${Math.floor(i / spec.columns) * cell.h}`).join('|')
  const tiles = inputs.map((_, i) => tileFilter(i, spec.items[i], spec)).join(';')
  const stack = `${inputs.map((_, i) => `[t${i}]`).join('')}xstack=inputs=${inputs.length}:layout=${layout}:fill=${spec.background}[grid]`
  // xstack output is cols*cell wide with the gap only on the right/bottom; add the leading edge.
  const frame = `[grid]pad=${spec.columns * cell.w + spec.gap}:${rows * cell.h + spec.gap}:${spec.gap}:${spec.gap}:color=${spec.background}`
  return [
    '-y',
    ...inputs.flatMap((p) => ['-i', p]),
    '-filter_complex',
    `${tiles};${stack};${frame}`,
    '-frames:v',
    '1',
    '-q:v',
    String(spec.quality),
    output,
  ]
}

/** @param {string} dir @returns {string[]} image files under `dir`, skipping node_modules/dist/.git */
function walkImages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', '.git', 'dist', '.vitepress'].includes(e.name)) return []
    const full = join(dir, e.name)
    if (e.isDirectory()) return walkImages(full)
    return /\.(png|jpe?g)$/i.test(e.name) && statSync(full).size > 20 * 1024 ? [full] : []
  })
}

/** @param {string[]} argv @returns {{ root?: string, list: boolean }} */
function parseArgs(argv) {
  const out = { list: false, root: undefined }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--list') out.list = true
    else if (argv[i] === '--root') out.root = argv[++i]
  }
  return out
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  /** @type {MontageSpec} */
  const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf-8'))
  const root = resolve(expandHome(args.root ?? process.env[spec.sourceRootEnv ?? ''] ?? spec.sourceRoot))

  if (!existsSync(root)) {
    console.error(`JSCAD v1 projects tree not found: ${root}\nPass --root <dir> or set $${spec.sourceRootEnv}.`)
    process.exit(1)
  }
  if (args.list) {
    for (const f of walkImages(root)) console.log(relative(root, f))
    return
  }

  const problems = validateSpec(spec)
  const inputs = spec.items.map((it) => join(root, it.src))
  for (const p of inputs) if (!existsSync(p)) problems.push(`missing source image: ${p}`)
  if (problems.length) {
    console.error(problems.map((p) => `  - ${p}`).join('\n'))
    process.exit(1)
  }

  const output = join(repoRoot, spec.output)
  mkdirSync(dirname(output), { recursive: true })
  const run = spawnSync('ffmpeg', buildFfmpegArgs(spec, inputs, output), { encoding: 'utf-8' })
  if (run.error?.code === 'ENOENT') {
    console.error('ffmpeg not found on PATH — install it (e.g. `brew install ffmpeg`).')
    process.exit(1)
  }
  if (run.status !== 0) {
    console.error(run.stderr)
    process.exit(run.status ?? 1)
  }
  console.log(`${spec.output}  ${(statSync(output).size / 1024).toFixed(0)} KB  (${spec.items.length} images)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

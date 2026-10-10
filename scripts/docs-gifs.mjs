// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Converts the movies recorded by `e2e/docs/*.docs.js` (see `startMovie`/`endMovie` in
// `e2e/docs/support.js`) into looping GIFs under `docs/media/`, and records each one in
// `docs/media/manifest.json` (source spec, spec content hash, byte size, duration).
//
//   npm run docs:movies   # record  -> .docs-movies/<name>.webm + <name>.json
//   npm run docs:gifs     # convert -> docs/media/<name>.gif + manifest.json
//   npm run docs:media    # stills + movies + gifs
//
// ffmpeg/ffprobe are the only external tools (gifsicle is deliberately not used).
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Per-GIF limits. Over budget is a failure, not a silent oversize commit. */
export const BUDGET = { maxSeconds: 18, maxBytes: 2.25 * 1024 * 1024 }

/**
 * The one recorded relaxation of the duration limit (`TODO/docs-019`: the README tour). A movie
 * may ask for more time by setting `maxSeconds` in its sidecar (`endMovie(..., { maxSeconds })`);
 * the request is honoured only up to this ceiling, and the size limit is never relaxed. An
 * allowance is written into the manifest so it stays visible in review.
 */
export const EXCEPTION_MAX_SECONDS = 30

/** The two knobs the conversion exposes; the defaults are what the budget was sized for. */
export const DEFAULTS = { fps: 15, width: 800, holdSeconds: 1.5 }

/**
 * @typedef {{ status: number | null, stdout?: string, error?: Error & { code?: string } }} RunResult
 * @typedef {(cmd: string, args: string[]) => RunResult} Runner
 */

/**
 * Two-pass palette conversion: trim, hold the last frame, loop forever.
 *
 * @param {{ input: string, output: string, trim?: number, fps?: number, width?: number, holdSeconds?: number }} options
 * @returns {string[]} ffmpeg arguments
 */
export function buildFfmpegArgs({ input, output, trim = 0, fps = DEFAULTS.fps, width = DEFAULTS.width, holdSeconds = DEFAULTS.holdSeconds }) {
  const filter =
    `fps=${fps},scale=${width}:-1:flags=lanczos,tpad=stop_mode=clone:stop_duration=${holdSeconds},` +
    'split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4'
  return ['-y', '-ss', String(trim), '-i', input, '-vf', filter, '-loop', '0', output]
}

/**
 * @param {number | undefined} requested a movie's own `maxSeconds`
 * @returns {number} the duration limit that applies: the default, or the request clamped to the ceiling
 */
export function allowedSeconds(requested) {
  if (typeof requested !== 'number' || !(requested > BUDGET.maxSeconds)) return BUDGET.maxSeconds
  return Math.min(requested, EXCEPTION_MAX_SECONDS)
}

/**
 * @param {{ bytes: number, seconds: number, maxSeconds?: number }} measured `maxSeconds` is the
 *   movie's own requested allowance; it can lengthen the duration limit up to
 *   {@link EXCEPTION_MAX_SECONDS}, never shorten it
 * @returns {string[]} one actionable message per limit exceeded; empty when within budget
 */
export function checkBudget({ bytes, seconds, maxSeconds }) {
  const limit = allowedSeconds(maxSeconds)
  const problems = []
  if (bytes > BUDGET.maxBytes) {
    problems.push(
      `over budget: ${(bytes / 1024 / 1024).toFixed(2)} MB > ${(BUDGET.maxBytes / 1024 / 1024).toFixed(1)} MB — lower fps or width in DEFAULTS, or record a shorter movie`,
    )
  }
  if (seconds > limit) {
    problems.push(
      `over budget: ${seconds.toFixed(1)} s > ${limit} s — record a shorter duration (fewer drag steps or less dwell time)`,
    )
  }
  return problems
}

/**
 * @param {Record<string, object>} manifest
 * @param {string} gifName
 * @param {object} entry
 * @returns {Record<string, object>} a new manifest; other entries untouched
 */
export function updateManifest(manifest, gifName, entry) {
  return { ...manifest, [gifName]: entry }
}

/** @type {Runner} */
const defaultRun = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' })

/**
 * @param {string} path
 * @returns {string} sha256 hex of the file's bytes
 */
function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * Convert every recorded movie in `moviesDir`.
 *
 * @param {{ moviesDir: string, outDir: string, root: string, run?: Runner }} options
 *   `root` resolves the spec paths stored in each movie's sidecar JSON.
 * @returns {{ name: string, ok: boolean, problems: string[] }[]}
 */
export function convertMovies({ moviesDir, outDir, root, run = defaultRun }) {
  const movies = existsSync(moviesDir) ? readdirSync(moviesDir).filter((f) => f.endsWith('.webm')) : []
  if (movies.length === 0) {
    throw new Error(`No recorded movies in ${moviesDir} — run \`npm run docs:movies\` first.`)
  }
  const probe = run('ffmpeg', ['-version'])
  if (probe.error || probe.status !== 0) {
    throw new Error('ffmpeg was not found on PATH — install it (macOS: `brew install ffmpeg`) and re-run.')
  }

  mkdirSync(outDir, { recursive: true })
  const manifestPath = join(outDir, 'manifest.json')
  let manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
  let manifestDirty = false

  const results = movies.map((file) => {
    const base = file.replace(/\.webm$/, '')
    const gifName = `${base}.gif`
    const gifPath = join(outDir, gifName)
    const meta = JSON.parse(readFileSync(join(moviesDir, `${base}.json`), 'utf8'))

    const converted = run('ffmpeg', buildFfmpegArgs({ input: join(moviesDir, file), output: gifPath, trim: meta.trim ?? 0, fps: meta.fps, width: meta.width }))
    if (converted.status !== 0) {
      return { name: gifName, ok: false, problems: [`ffmpeg failed (exit ${converted.status})`] }
    }
    const bytes = statSync(gifPath).size
    const seconds = Number.parseFloat(
      run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', gifPath]).stdout ?? '',
    )
    const problems = checkBudget({ bytes, seconds, maxSeconds: meta.maxSeconds })
    if (problems.length > 0) {
      rmSync(gifPath, { force: true })
      return { name: gifName, ok: false, problems }
    }
    manifest = updateManifest(manifest, gifName, {
      spec: meta.spec,
      specHash: hashFile(resolve(root, meta.spec)),
      bytes,
      seconds,
      // Recorded only for the rare movie allowed past the default duration limit.
      ...(allowedSeconds(meta.maxSeconds) > BUDGET.maxSeconds ? { maxSeconds: allowedSeconds(meta.maxSeconds) } : {}),
    })
    manifestDirty = true
    return { name: gifName, ok: true, problems: [] }
  })

  if (manifestDirty) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return results
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd()
  try {
    const results = convertMovies({ moviesDir: join(root, '.docs-movies'), outDir: join(root, 'docs', 'media'), root })
    for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.problems.map((p) => `\n     ${p}`).join('')}`)
    if (results.some((r) => !r.ok)) process.exit(1)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

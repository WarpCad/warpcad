// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUDGET, EXCEPTION_MAX_SECONDS, allowedSeconds, buildFfmpegArgs, checkBudget, convertMovies, updateManifest } from './docs-gifs.mjs'

/**
 * `scripts/docs-gifs.mjs` (TODO/docs-006). ffmpeg is mocked at the boundary: the injected
 * `run` writes a fake GIF of a chosen size and answers ffprobe with a chosen duration.
 */

let root
let moviesDir
let outDir

/**
 * @param {{ gifBytes?: number, seconds?: number, missing?: boolean }} [opts]
 */
function fakeRun({ gifBytes = 1000, seconds = 5, missing = false } = {}) {
  /** @type {{ cmd: string, args: string[] }[]} */
  const calls = []
  const run = (cmd, args) => {
    calls.push({ cmd, args })
    if (missing) return { status: null, error: Object.assign(new Error('spawn'), { code: 'ENOENT' }), stdout: '' }
    if (cmd === 'ffprobe') return { status: 0, stdout: `${seconds}\n` }
    if (args[0] === '-version') return { status: 0, stdout: 'ffmpeg version x' }
    writeFileSync(args[args.length - 1], Buffer.alloc(gifBytes))
    return { status: 0, stdout: '' }
  }
  return { run, calls }
}

function addMovie(name, trim = 0, extra = {}) {
  writeFileSync(join(moviesDir, `${name}.webm`), 'video')
  writeFileSync(join(moviesDir, `${name}.json`), JSON.stringify({ name, spec: 'e2e/docs/x.docs.js', trim, ...extra }))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'docs-gifs-'))
  moviesDir = join(root, 'movies')
  outDir = join(root, 'media')
  mkdirSync(moviesDir)
  mkdirSync(join(root, 'e2e', 'docs'), { recursive: true })
  writeFileSync(join(root, 'e2e', 'docs', 'x.docs.js'), 'spec source')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('buildFfmpegArgs', () => {
  it('trims, holds the last frame, and loops forever', () => {
    const args = buildFfmpegArgs({ input: 'in.webm', output: 'out.gif', trim: 1.25 })
    expect(args.join(' ')).toContain('-ss 1.25')
    expect(args.join(' ')).toContain('tpad=stop_mode=clone:stop_duration=1.5')
    expect(args.join(' ')).toContain('palettegen')
    expect(args.join(' ')).toContain('-loop 0')
    expect(args[args.length - 1]).toBe('out.gif')
  })
})

describe('checkBudget', () => {
  it('passes a small short GIF', () => {
    expect(checkBudget({ bytes: 1000, seconds: 5 })).toEqual([])
  })

  it('names the knob to turn for each overrun', () => {
    const problems = checkBudget({ bytes: BUDGET.maxBytes + 1, seconds: BUDGET.maxSeconds + 1 })
    expect(problems).toHaveLength(2)
    expect(problems.join(' ')).toMatch(/fps|width/)
    expect(problems.join(' ')).toMatch(/shorter|duration/)
  })
})

describe('duration exception (docs-019)', () => {
  it('keeps 12 s as the default and never shortens it', () => {
    expect(allowedSeconds(undefined)).toBe(BUDGET.maxSeconds)
    expect(allowedSeconds(5)).toBe(BUDGET.maxSeconds)
    expect(checkBudget({ bytes: 1000, seconds: 15 })).toHaveLength(1)
  })

  it('lets a movie that asks for more time have it, up to the ceiling', () => {
    expect(checkBudget({ bytes: 1000, seconds: 18, maxSeconds: 20 })).toEqual([])
    expect(checkBudget({ bytes: 1000, seconds: 21, maxSeconds: 20 })[0]).toMatch(/> 20 s/)
  })

  it('clamps an allowance above the ceiling, and never relaxes the size limit', () => {
    expect(allowedSeconds(60)).toBe(EXCEPTION_MAX_SECONDS)
    expect(checkBudget({ bytes: 1000, seconds: 25, maxSeconds: 60 })).toHaveLength(1)
    expect(checkBudget({ bytes: BUDGET.maxBytes + 1, seconds: 18, maxSeconds: 20 })).toHaveLength(1)
  })

  it('converts an 18 s movie that asks for 20 s, recording the allowance in the manifest', () => {
    addMovie('tour', 0, { maxSeconds: 20 })
    const results = convertMovies({ moviesDir, outDir, root, run: fakeRun({ seconds: 18 }).run })
    expect(results[0].ok).toBe(true)
    expect(JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'))['tour.gif'].maxSeconds).toBe(20)
  })

  it('fails the same 18 s movie when it did not ask, and omits the field for ordinary movies', () => {
    addMovie('plain')
    const failed = convertMovies({ moviesDir, outDir, root, run: fakeRun({ seconds: 18 }).run })
    expect(failed[0].ok).toBe(false)
    const ok = convertMovies({ moviesDir, outDir, root, run: fakeRun({ seconds: 5 }).run })
    expect(ok[0].ok).toBe(true)
    expect(JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'))['plain.gif']).not.toHaveProperty('maxSeconds')
  })
})

describe('updateManifest', () => {
  it('adds and replaces entries by file name without touching the others', () => {
    const first = updateManifest({}, 'a.gif', { bytes: 1 })
    const second = updateManifest(first, 'b.gif', { bytes: 2 })
    const third = updateManifest(second, 'a.gif', { bytes: 3 })
    expect(third).toEqual({ 'a.gif': { bytes: 3 }, 'b.gif': { bytes: 2 } })
  })
})

describe('convertMovies', () => {
  it('writes the GIF and a manifest entry with spec hash, size and duration', () => {
    addMovie('demo')
    const { run } = fakeRun({ gifBytes: 4096, seconds: 6.5 })
    const results = convertMovies({ moviesDir, outDir, root, run })
    expect(results).toEqual([{ name: 'demo.gif', ok: true, problems: [] }])
    expect(existsSync(join(outDir, 'demo.gif'))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'))
    expect(manifest['demo.gif']).toMatchObject({ spec: 'e2e/docs/x.docs.js', bytes: 4096, seconds: 6.5 })
    expect(manifest['demo.gif'].specHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('fails an over-budget GIF, deletes it, and keeps it out of the manifest', () => {
    addMovie('big')
    const { run } = fakeRun({ gifBytes: BUDGET.maxBytes + 10 })
    const results = convertMovies({ moviesDir, outDir, root, run })
    expect(results[0].ok).toBe(false)
    expect(results[0].problems[0]).toMatch(/budget/i)
    expect(existsSync(join(outDir, 'big.gif'))).toBe(false)
    expect(existsSync(join(outDir, 'manifest.json'))).toBe(false)
  })

  it('explains how to install ffmpeg when it is missing', () => {
    addMovie('demo')
    const { run } = fakeRun({ missing: true })
    expect(() => convertMovies({ moviesDir, outDir, root, run })).toThrow(/ffmpeg.*brew install ffmpeg/is)
  })

  it('tells the contributor to record first when there are no movies', () => {
    const { run } = fakeRun()
    expect(() => convertMovies({ moviesDir, outDir, root, run })).toThrow(/docs:movies/)
  })
})

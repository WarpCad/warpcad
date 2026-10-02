// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Export-path benchmark (`TODO/perf-001`), per `.claude/prompts/perf-benchmark.md`.
 *
 * Measures the work `File ▾ → Export…` does on the main thread, split into its parts,
 * so a change can be attributed rather than guessed at:
 *
 * - `watertight` — `makeWatertight` alone, summed over the scene's bodies. This is the
 *   cost `io-004` added and `perf-001` is about.
 * - `stl` / `obj` — the whole of `exportBodies`, repair included: what the click costs.
 * - `glb` — the whole of `exportGltf`, repair included (`io-005` put the repair here too).
 * - `clone` — `structuredClone` of the scene's polygon arrays, both ways. This is the
 *   price of *moving* the work to a worker, and it is measured rather than assumed
 *   because a Geom3's polygons are plain arrays with no transferable buffer.
 *
 * Usage:
 *   node bench/export-benchmark.mjs                # all scenes, 20 runs each
 *   node bench/export-benchmark.mjs --runs 30
 *   node bench/export-benchmark.mjs --scene large-solid --json out.json
 *
 * Reports min / median / p95 / p99 / worst, per `perf-benchmark.md`'s rule 3 — a mean
 * hides exactly the hitch this task exists to remove. Node, not the browser: this is
 * pure CPU-bound serialization with no GPU involvement, and it is the same method the
 * `io-004` / `io-005` "before" columns in `TODO/perf-001` were taken with, so the
 * columns are comparable. The browser half (production build, CPU throttling, the
 * pending-state threshold) is driven separately from `e2e/`.
 *
 * @module bench/export-benchmark
 */

import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'

import { exportBodies } from '../src/core/export.js'
import { makeWatertight } from '../src/core/kernel/watertight.js'
import { toGeom3 } from '../src/core/kernel/group.js'
import { SCENES } from './fixtures/export-scenes.js'

// `GLTFExporter`'s binary path needs `FileReader`, which a browser and jsdom have and
// Node 24 does not. This shim is only used to read a Blob this process just created.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null
      this.onloadend = null
      this.onerror = null
    }

    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = buffer
          this.onloadend?.()
        })
        .catch((error) => this.onerror?.(error))
    }
  }
}

const args = process.argv.slice(2)
/** @param {string} flag @param {string | undefined} fallback */
function option(flag, fallback) {
  const index = args.indexOf(flag)
  return index === -1 ? fallback : args[index + 1]
}

const RUNS = Number(option('--runs', '20'))
const ONLY = option('--scene', undefined)
const JSON_OUT = option('--json', undefined)
const LABEL = option('--label', 'run')

/**
 * @param {number[]} samples
 * @returns {{ n: number, min: number, median: number, p95: number, p99: number, worst: number }}
 */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  /** @param {number} q */
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  return {
    n: sorted.length,
    min: sorted[0],
    median: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    worst: sorted[sorted.length - 1],
  }
}

/** @param {number} ms */
const ms = (value) => value.toFixed(2)

/**
 * Time `fn` `RUNS` times after five discarded warm-up runs (`perf-benchmark.md`: warm
 * up, then report the spread — a single run is an anecdote).
 *
 * @param {() => unknown | Promise<unknown>} fn
 * @returns {Promise<{ samples: number[], last: any }>}
 */
async function time(fn) {
  let last
  for (let index = 0; index < 5; index += 1) last = await fn()
  /** @type {number[]} */
  const samples = []
  for (let index = 0; index < RUNS; index += 1) {
    const started = performance.now()
    last = await fn()
    samples.push(performance.now() - started)
  }
  return { samples, last }
}

/** @param {readonly any[]} bodies */
function solidsOf(bodies) {
  return bodies.map((body) => toGeom3(body.geometry))
}

/** @param {readonly any[]} solids Total polygons across the scene, before repair. */
function polygonCount(solids) {
  return solids.reduce((sum, solid) => sum + solid.polygons.length, 0)
}

/**
 * What a worker boundary would actually have to move: every body's polygons, as the
 * plain `{ vertices: [[x,y,z], …] }` objects `@jscad/modeling` uses. Measured in both
 * directions — the geometry going out, and the finished bytes coming back (the bytes
 * are a `Uint8Array`, which IS transferable, so that half is nearly free and is
 * reported separately).
 *
 * @param {readonly any[]} solids
 */
async function cloneCost(solids) {
  const payload = solids.map((solid) => ({ polygons: solid.polygons.map((polygon) => polygon.vertices) }))
  const out = await time(() => structuredClone(payload))
  return out
}

const results = []
const names = ONLY ? [ONLY] : Object.keys(SCENES)

for (const name of names) {
  const scene = SCENES[name]
  if (!scene) throw new Error(`unknown scene "${name}" — one of ${Object.keys(SCENES).join(', ')}`)

  const buildStarted = performance.now()
  const bodies = scene.build()
  const buildMs = performance.now() - buildStarted
  const solids = solidsOf(bodies)
  const polygons = polygonCount(solids)

  const watertight = await time(() => solids.map((solid) => makeWatertight(solid)))
  const stl = await time(() => exportBodies(bodies, 'stl'))
  const obj = await time(() => exportBodies(bodies, 'obj'))

  const { exportGltf } = await import('../src/render/export.js')
  const glb = await time(() => exportGltf(bodies))

  const clone = await cloneCost(solids)

  const row = {
    scene: name,
    label: scene.label,
    bodies: bodies.length,
    polygonsIn: polygons,
    buildMs,
    trianglesOut: { stl: stl.last.triangleCount, glb: glb.last.triangleCount },
    bytes: { stl: stl.last.bytes.byteLength, obj: obj.last.bytes.byteLength, glb: glb.last.bytes.byteLength },
    watertight: stats(watertight.samples),
    stl: stats(stl.samples),
    obj: stats(obj.samples),
    glb: stats(glb.samples),
    clone: stats(clone.samples),
  }
  results.push(row)

  console.log(`\n## ${scene.label}  [${name}]`)
  console.log(
    `bodies ${row.bodies} · polygons in ${row.polygonsIn} · triangles out ${row.trianglesOut.stl} (stl) / ${row.trianglesOut.glb} (glb) · build ${ms(buildMs)} ms`
  )
  console.log(`bytes: stl ${row.bytes.stl} · obj ${row.bytes.obj} · glb ${row.bytes.glb}`)
  console.log('| stage | n | min | median | p95 | p99 | worst |')
  console.log('|---|---|---|---|---|---|---|')
  for (const stage of /** @type {const} */ (['watertight', 'stl', 'obj', 'glb', 'clone'])) {
    const s = row[stage]
    console.log(
      `| ${stage} | ${s.n} | ${ms(s.min)} | ${ms(s.median)} | ${ms(s.p95)} | ${ms(s.p99)} | ${ms(s.worst)} |`
    )
  }
}

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ label: LABEL, node: process.version, runs: RUNS, results }, null, 2))
  console.log(`\nwrote ${JSON_OUT}`)
}

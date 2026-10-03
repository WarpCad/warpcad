// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What one snap search costs per pointer event (`TODO/sketch-007`), and whether it allocates.
 *
 * The sketch editor runs `snapPoint` once per `pointermove` while a draw tool is armed, against
 * targets `snapTargets` built once per change of the slice's outlines. CLAUDE.md's Performance
 * rule says the pointer path allocates nothing, so this measures exactly that on the scene the
 * TODO names: a **400-point** closed outline (a traced shape), plus a rectangle and a circle.
 *
 * - **Time**: per-search wall time over many pointer positions sweeping across the outline,
 *   reported as p50 / p95 / p99 / worst of batched samples.
 * - **Allocation**: heap growth across N searches with a reused result object, with the young
 *   generation made large enough (`--max-semi-space-size`) that no scavenge runs mid-loop, so
 *   the heap delta *is* what the loop allocated. A **control** loop calls `snapPoint` without
 *   the reused result — one small object and array per hit — to prove the measurement can see
 *   allocation at all.
 *
 * Plain Node, no browser: the search is framework-free (`src/sketch/snap.js`).
 *
 * Usage:
 *   node --expose-gc --max-semi-space-size=256 bench/snap-search.mjs [--searches 200000] [--points 400]
 */
import { performance } from 'node:perf_hooks'

import { createSnapResult, snapPoint, snapTargets } from '../src/sketch/snap.js'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? Number(args[at + 1]) : fallback
}
const SEARCHES = arg('searches', 200000)
const POINTS = arg('points', 400)
const gc = /** @type {any} */ (globalThis).gc
if (typeof gc !== 'function') {
  console.error('run with --expose-gc (and --max-semi-space-size=256) — see the header')
  process.exit(1)
}

// A wobbly closed outline of POINTS points, ~60 mm across, like a traced part.
const traced = {
  id: 'traced',
  kind: 'polyline',
  role: 'solid',
  closed: true,
  pointsMm: Array.from({ length: POINTS }, (_, i) => {
    const a = (i / POINTS) * Math.PI * 2
    const r = 30 + 3 * Math.sin(7 * a) + 1.5 * Math.cos(13 * a)
    return [r * Math.cos(a), r * Math.sin(a)]
  }),
}
const profiles = [
  traced,
  { id: 'r', kind: 'rect', role: 'solid', centerMm: [50, 0], widthMm: 20, heightMm: 10 },
  { id: 'c', kind: 'circle', role: 'hole', centerMm: [0, 0], radiusMm: 8 },
]

let start = performance.now()
const targets = snapTargets(profiles)
const buildMs = performance.now() - start

// Pointer positions: a sweep across the whole outline, at the editor's opening zoom (~2.2 px/mm,
// so the 12 px snap radius is ~5.5 mm).
const RADIUS_MM = 12 / 2.2
const pointer = [0, 0]
/** @param {number} i */
function place(i) {
  const t = (i % 4000) / 4000
  pointer[0] = -45 + 110 * t
  pointer[1] = 32 * Math.sin(t * Math.PI * 6)
}

// Warm up both paths so the JIT has settled before anything is measured.
const out = createSnapResult()
let hits = 0
for (let i = 0; i < 20000; i += 1) {
  place(i)
  if (snapPoint(pointer, targets, RADIUS_MM, out)) hits += 1
  snapPoint(pointer, targets, RADIUS_MM)
}

/** Where the control loop's results escape to, so V8 cannot scalar-replace them away. */
let sink = /** @type {unknown} */ (null)

/**
 * Heap growth over SEARCHES iterations of one loop body. Each loop runs twice and the second
 * pass is reported, so on-stack-replacement compiling is not counted as the loop's allocation.
 *
 * @param {'baseline' | 'reused' | 'control'} mode
 */
function allocated(mode) {
  let bytes = 0
  let count = 0
  for (let pass = 0; pass < 2; pass += 1) {
    gc()
    gc()
    const before = process.memoryUsage().heapUsed
    count = 0
    for (let i = 0; i < SEARCHES; i += 1) {
      place(i)
      if (mode === 'baseline') continue
      const hit = mode === 'reused' ? snapPoint(pointer, targets, RADIUS_MM, out) : snapPoint(pointer, targets, RADIUS_MM)
      if (hit) {
        count += 1
        if (mode === 'control') sink = hit
      }
    }
    bytes = process.memoryUsage().heapUsed - before
  }
  return { bytes, hits: count }
}
const baseline = allocated('baseline')
const reused = allocated('reused')
const control = allocated('control')

// Time: batches of 100 searches, so each sample is well above timer resolution.
const BATCH = 100
const samples = []
for (let b = 0; b < SEARCHES / BATCH; b += 1) {
  start = performance.now()
  for (let i = 0; i < BATCH; i += 1) {
    place(b * BATCH + i)
    snapPoint(pointer, targets, RADIUS_MM, out)
  }
  samples.push(((performance.now() - start) * 1000) / BATCH)
}
samples.sort((a, b) => a - b)
const q = (/** @type {number} */ p) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))]

console.log(`node ${process.version} · ${process.platform}/${process.arch}`)
console.log(`outline ${POINTS} points + rect + circle → ${targets.points.length / 3} point targets, ${targets.segments.length / 4} segments, ${targets.circles.length / 3} circles; built once in ${buildMs.toFixed(2)} ms`)
console.log(`per search (µs, batches of ${BATCH}): p50 ${q(0.5).toFixed(2)} · p95 ${q(0.95).toFixed(2)} · p99 ${q(0.99).toFixed(2)} · worst ${samples[samples.length - 1].toFixed(2)}`)
console.log(`allocation over ${SEARCHES} iterations, baseline (pointer only, no search): ${baseline.bytes} bytes`)
console.log(`allocation over ${SEARCHES} searches, reused result: ${reused.bytes} bytes (${(reused.bytes / SEARCHES).toFixed(3)} B/search, ${reused.hits} hits)`)
console.log(`allocation over ${SEARCHES} searches, control (new result per hit): ${control.bytes} bytes (${(control.bytes / SEARCHES).toFixed(3)} B/search, ${control.hits} hits)`)
console.log(`warm-up hits ${hits}; control's last result kept: ${sink !== null}`)

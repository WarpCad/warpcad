// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the assistant's geometry checks cost on the shape `TODO/ai-007` names as the risk: a
 * **100-slice lofted wing** (a NACA 2412-like section, 40 points a slice, chord tapering
 * 150 → 90 mm over a 600 mm span).
 *
 * The tools run synchronously inside the tool registry (its header says why), so every number
 * here is main-thread time during an AI turn — not during a frame. Measured:
 *
 * - `analyseGeometry` (volume, area, centre of mass, bounds);
 * - `wallThickness` at the default 4000-ray budget — through `meshQuery.js`'s hierarchy
 *   (**after**) and, for the same rays, a flat scan of every triangle (**before**: what the
 *   check costs without the hierarchy);
 * - `openEdgesOf(makeWatertight(solid))`, the watertight check;
 * - `minimumDistance` between the wing and a copy 5 mm away (`check_clearance`'s gap path).
 *
 * Median and worst of N runs, after one warm-up. Plain Node, no browser.
 *
 * Usage: node bench/ai-007-analysis.mjs [--runs 7] [--slices 100] [--points 40]
 */
import { performance } from 'node:perf_hooks'

import modeling from '@jscad/modeling'

import { evaluateOp } from '../src/core/kernel/index.js'
import { analyseGeometry, minimumDistance, wallThickness } from '../src/core/kernel/measure.js'
import { triangleSoup } from '../src/core/kernel/meshQuery.js'
import { makeWatertight, openEdgesOf } from '../src/core/kernel/watertight.js'

const { extrusions, transforms } = modeling

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? Number(args[at + 1]) : fallback
}
const RUNS = arg('runs', 7)
const SLICES = arg('slices', 100)
const POINTS = arg('points', 40)

/** A NACA 4-digit-like section, closed, `count` points, chord along X, in mm. */
function airfoil(chordMm, count) {
  const m = 0.02
  const p = 0.4
  const t = 0.12
  const upper = []
  const lower = []
  const half = count / 2
  for (let i = 0; i < half; i += 1) {
    const x = 0.5 * (1 - Math.cos((Math.PI * (i + 0.5)) / half))
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
    const yc = x < p ? (m / p ** 2) * (2 * p * x - x * x) : (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x)
    upper.push([(x - 0.5) * chordMm, (yc + yt) * chordMm])
    lower.push([(x - 0.5) * chordMm, (yc - yt) * chordMm])
  }
  return [...lower, ...upper.reverse()]
}

// `primitive.sketch` caps a Loft at 64 slices (`src/sketch/profile.js`), so the 100-slice wing
// is built here with exactly the construction its Loft branch uses (`registry.js`'s
// `buildSketch`: one `slice.fromPoints` per ring, walled by `extrudeFromSlices`). The 64-slice
// version the app can build is measured too.
/** @param {number} count */
function loftWing(count) {
  const sections = []
  for (let s = 0; s < count; s += 1) {
    const f = s / (count - 1)
    sections.push(extrusions.slice.fromPoints(airfoil(150 - 60 * f, POINTS).map(([x, y]) => [x, y, f * 600])))
  }
  return extrusions.extrudeFromSlices(
    { numberOfSlices: sections.length, capStart: true, capEnd: true, callback: (_t, index) => sections[index] },
    sections[0]
  )
}
const wing = loftWing(SLICES)
const appWing = evaluateOp('primitive.sketch', {
  center: [0, 0, 0],
  slices: Array.from({ length: 64 }, (_, s) => ({
    id: `s${s}`,
    zMm: (s / 63) * 600,
    profiles: [{ id: `p${s}`, kind: 'polyline', role: 'solid', closed: true, pointsMm: airfoil(150 - 60 * (s / 63), POINTS) }],
  })),
  extrusion: { method: 'loft', resolution: 0 },
})
const soup = triangleSoup(/** @type {any} */ (wing))

/** @param {string} label @param {() => unknown} fn */
function time(label, fn) {
  fn()
  const samples = []
  let last
  for (let run = 0; run < RUNS; run += 1) {
    const start = performance.now()
    last = fn()
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  console.log(`${label.padEnd(44)} median ${samples[samples.length >> 1].toFixed(1).padStart(8)} ms   worst ${samples.at(-1).toFixed(1).padStart(8)} ms`)
  return last
}

/** The "before": the same rays as `wallThickness`, against every triangle. */
function flatScanThickness(maxSamples) {
  const { positions: p, normals: n, count } = soup
  let best = Infinity
  const step = Math.max(1, Math.floor(count / maxSamples))
  for (let tri = 0; tri < count; tri += step) {
    const o = tri * 9
    const ox = (p[o] + p[o + 3] + p[o + 6]) / 3
    const oy = (p[o + 1] + p[o + 4] + p[o + 7]) / 3
    const oz = (p[o + 2] + p[o + 5] + p[o + 8]) / 3
    const dx = -n[tri * 3]
    const dy = -n[tri * 3 + 1]
    const dz = -n[tri * 3 + 2]
    for (let other = 0; other < count; other += 1) {
      if (other === tri) continue
      const q = other * 9
      const e1x = p[q + 3] - p[q], e1y = p[q + 4] - p[q + 1], e1z = p[q + 5] - p[q + 2]
      const e2x = p[q + 6] - p[q], e2y = p[q + 7] - p[q + 1], e2z = p[q + 8] - p[q + 2]
      const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x
      const det = e1x * hx + e1y * hy + e1z * hz
      if (det > -1e-14 && det < 1e-14) continue
      const inv = 1 / det
      const sx = ox - p[q], sy = oy - p[q + 1], sz = oz - p[q + 2]
      const u = (sx * hx + sy * hy + sz * hz) * inv
      if (u < 0 || u > 1) continue
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x
      const v = (dx * qx + dy * qy + dz * qz) * inv
      if (v < 0 || u + v > 1) continue
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv
      if (t > 1e-9 && t < best) best = t
    }
  }
  return best
}

console.log(`wing: ${SLICES} slices × ${POINTS} points → ${soup.count} triangles; node ${process.version}; ${RUNS} runs`)
const analysis = time('analyseGeometry', () => analyseGeometry(/** @type {any} */ (wing)))
console.log(`  volume ${analysis.volumeMm3.toFixed(0)} mm³, area ${analysis.surfaceAreaMm2.toFixed(0)} mm²`)
const thickness = time('wallThickness (4000 rays, hierarchy) — after', () => wallThickness(/** @type {any} */ (wing), { belowMm: 1.2 }))
console.log(`  thinnest ${thickness.minMm?.toFixed(3)} mm over ${thickness.samples} rays; ${thickness.thin.length} thin spots under 1.2 mm`)
time('same rays, flat scan — before', () => flatScanThickness(4000))
const open = time('openEdgesOf(makeWatertight(wing))', () => openEdgesOf(makeWatertight(/** @type {any} */ (wing))))
console.log(`  open edges: ${open.openEdges}`)
const copy = transforms.translate([0, 0, 605], wing)
const gap = time('minimumDistance(wing, copy 5 mm above)', () => minimumDistance(/** @type {any} */ (wing), /** @type {any} */ (copy)))
console.log(`  gap ${gap.distanceMm?.toFixed(3)} mm`)
console.log(`app-buildable 64-slice loft: ${triangleSoup(/** @type {any} */ (appWing)).count} triangles`)
time('wallThickness, 64-slice primitive.sketch loft', () => wallThickness(/** @type {any} */ (appWing), { belowMm: 1.2 }))

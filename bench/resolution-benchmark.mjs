/**
 * Design resolution / export resolution benchmark (`TODO/core-035`), per
 * `.claude/prompts/perf-benchmark.md`.
 *
 * Two scenes, both built from the document's own action records through
 * `createDocument` — the 24-body scene (`bench/fixtures/export-scenes.js`'s layout:
 * 12 `raspberrypi.bplus` + 12 m10 bolts) and one Ø100 sphere — and four measurements:
 *
 * - `stl@design` — the export the app already did before `core-035`: the scene's
 *   evaluated bodies packed and handed to `runExportJob` (what the export worker runs).
 *   On HEAD and on this tree it must cost the same; this is the regression check.
 * - `stl@print` — the Print override: `runExportJob` given the **records**, folding them
 *   at Print, then the unchanged repair + serialize. All of it is what runs in the
 *   export worker, off the main thread.
 * - `setResolution` — the design-level change, which re-folds the document **on the main
 *   thread** like every other row action (`core-031`'s cache cannot help: every curve
 *   really is new geometry). Reported so the cost of "Print for the whole design" is
 *   known, not guessed.
 * - `refold@cached` — a row action (suppress + unsuppress one step) on the 24-body
 *   scene, where the `core-031` fold cache serves almost everything. The policy was added
 *   to its key; this shows the hit path did not get slower.
 *
 * Run against HEAD by extracting HEAD's `src/` and `bench/` elsewhere and running this
 * same file there: the `core-035` measurements are skipped when the modules they need
 * are absent, so the design-resolution columns are directly comparable.
 *
 * Usage:
 *   node bench/resolution-benchmark.mjs [--runs 10]
 *
 * @module bench/resolution-benchmark
 */

import { performance } from 'node:perf_hooks'

import { createDocument } from '../src/core/document.js'
import * as exportJob from '../src/core/exportJob.js'
import { packBodies } from '../src/core/kernel/transport.js'

const args = process.argv.slice(2)
const runs = Number(args[args.indexOf('--runs') + 1] ?? 10) || 10
const hasResolution = typeof exportJob.refoldRequestOf === 'function'

/** @param {number} index */
const slot = (index) => [(index % 4) * 120, Math.floor(index / 4) * 120, 0]

/** @returns {any[]} */
function twentyFourBodyRecords() {
  const records = []
  for (let index = 0; index < 12; index += 1) {
    records.push({ id: `pi${index}`, op: 'raspberrypi.bplus', name: `Raspberry Pi ${index + 1}`, params: {} })
    records.push({ id: `pit${index}`, op: 'transform.translate', target: `pi${index}`, supersedes: `pi${index}`, params: { vector: slot(index) } })
    records.push({ id: `bolt${index}`, op: 'hardware.bolt', name: `Bolt ${index + 1}`, params: { spec: 'm10 hex', length: 30 } })
    records.push({
      id: `boltt${index}`,
      op: 'transform.translate',
      target: `bolt${index}`,
      supersedes: `bolt${index}`,
      params: { vector: [slot(index)[0] + 60, slot(index)[1], 0] },
    })
  }
  return records
}

const SCENES = {
  '24-bodies': twentyFourBodyRecords,
  'sphere-100': () => [{ id: 'sph', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 100 } }],
}

/**
 * @param {any[]} records
 * @param {string} [resolution]
 */
function documentOf(records, resolution) {
  const document = createDocument(resolution === undefined ? {} : { resolution })
  for (const record of records) document.append(record, { origin: 'local' })
  return document
}

/** @param {number[]} samples */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return {
    min: sorted[0],
    median: at(0.5),
    p95: at(0.95),
    worst: sorted[sorted.length - 1],
  }
}

/** @param {() => any} fn */
function time(fn) {
  const samples = []
  let last
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now()
    last = fn()
    samples.push(performance.now() - start)
  }
  return { ...stats(samples), last }
}

/** @param {number} ms */
const fmt = (ms) => ms.toFixed(1).padStart(8)

console.log(`node ${process.version}, ${runs} runs each, core-035 modules ${hasResolution ? 'present' : 'absent (HEAD)'}`)
console.log('scene       measurement        min   median      p95    worst   triangles')
for (const [name, build] of Object.entries(SCENES)) {
  const records = build()
  // The design at its default: legacy on HEAD (the only thing HEAD has), and on this tree
  // too, so the two `stl@design` rows are the same work.
  const design = documentOf(records)
  const packed = () => packBodies(design.bodies())
  const atDesign = time(() => exportJob.runExportJob({ format: 'stl', bodies: packed() }))
  console.log(
    `${name.padEnd(11)} stl@design     ${fmt(atDesign.min)} ${fmt(atDesign.median)} ${fmt(atDesign.p95)} ${fmt(atDesign.worst)}   ${atDesign.last.triangleCount}`
  )
  if (!hasResolution) continue

  for (const preset of ['normal', 'print']) {
    const job = time(() =>
      exportJob.runExportJob({ format: 'stl', bodies: [], refold: exportJob.refoldRequestOf(design, preset, []) })
    )
    console.log(
      `${name.padEnd(11)} stl@${preset.padEnd(11)}${fmt(job.min)} ${fmt(job.median)} ${fmt(job.p95)} ${fmt(job.worst)}   ${job.last.triangleCount}`
    )
  }

  // Timed around the call alone: building the fresh document each run is setup.
  const changeSamples = []
  for (let run = 0; run < runs; run += 1) {
    const document = documentOf(records, 'normal')
    const start = performance.now()
    document.setResolution('print', { origin: 'local' })
    changeSamples.push(performance.now() - start)
  }
  const changeStats = stats(changeSamples)
  console.log(
    `${name.padEnd(11)} setResolution  ${fmt(changeStats.min)} ${fmt(changeStats.median)} ${fmt(changeStats.p95)} ${fmt(changeStats.worst)}   (normal → print, main thread)`
  )
}

// The cache-hit path, on HEAD and here alike: suppress + unsuppress one Pi on the 24-body
// scene, every other record served from the fold cache.
{
  const document = documentOf(twentyFourBodyRecords())
  const cached = time(() => {
    document.setSuppressed('pit5', true, { origin: 'local' })
    document.setSuppressed('pit5', false, { origin: 'local' })
  })
  console.log(
    `24-bodies   refold@cached  ${fmt(cached.min)} ${fmt(cached.median)} ${fmt(cached.p95)} ${fmt(cached.worst)}   (suppress+unsuppress, 2 re-folds)`
  )
}

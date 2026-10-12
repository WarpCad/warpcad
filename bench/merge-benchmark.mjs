// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the replica metadata costs (`TODO/data-010`): the per-mutation price of stamping, and
 * what `mergeFrom` spends re-folding a merged document.
 *
 * Two parts. **Mutation** timings run on any build, so the same script run in a checkout of
 * the commit before `data-010` gives the baseline to compare. **Merge** timings need
 * `mergeFrom` and are skipped when it is absent. `mergeFrom` is measured twice: the default
 * fold cache and `foldCache: null` (the uncached fold).
 *
 * Usage: `node bench/merge-benchmark.mjs [--runs 21] [--json out.json]`
 *
 * @module bench/merge-benchmark
 */

import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

import { createDocument } from '../src/core/document.js'

const args = process.argv.slice(2)
/** @param {string} flag @param {string} [fallback] */
const option = (flag, fallback) => {
  const index = args.indexOf(flag)
  return index === -1 ? fallback : args[index + 1]
}
const RUNS = Number(option('--runs', '21'))
const JSON_OUT = option('--json')

/** @param {number[]} samples */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (/** @type {number} */ q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  return { n: sorted.length, min: +sorted[0].toFixed(3), median: +at(0.5).toFixed(3), p95: +at(0.95).toFixed(3), worst: +sorted[sorted.length - 1].toFixed(3) }
}

/** `data-004`'s fixture: four records per body, so 50 bodies is the 200-record row. */
function filletScene(/** @type {number} */ bodies) {
  const records = []
  for (let index = 0; index < bodies; index += 1) {
    const at = [(index % 10) * 40, Math.floor(index / 10) * 40, 0]
    records.push({ id: `c${index}`, op: 'primitive.cuboid', name: `Cube ${index + 1}`, params: { size: [20, 20, 20], center: [0, 0, 10] } })
    records.push({ id: `t${index}`, op: 'transform.translate', target: `c${index}`, supersedes: `c${index}`, params: { vector: at } })
    records.push({ id: `f${index}`, op: 'modify.filletRim', target: `t${index}`, supersedes: `t${index}`, params: { face: 'top', radius: 4 } })
    records.push({ id: `u${index}`, op: 'transform.translate', target: `f${index}`, supersedes: `f${index}`, params: { vector: [0, 0, 5] } })
  }
  return records
}

/** `perf-001`'s 24-body scene: 12 Pi boards and 12 bolts. */
function twentyFourScene() {
  return Array.from({ length: 12 }, (unused, index) => {
    const at = [(index % 4) * 150, Math.floor(index / 4) * 150, 0]
    return [
      { id: `pi${index}`, op: 'raspberrypi.bplus', name: `Board ${index + 1}`, params: {} },
      { id: `pit${index}`, op: 'transform.translate', name: `Board ${index + 1}`, target: `pi${index}`, consumes: [`pi${index}`], params: { vector: at } },
      { id: `bolt${index}`, op: 'hardware.bolt', name: `Bolt ${index + 1}`, params: { spec: 'm10 hex', length: 30 } },
      { id: `boltt${index}`, op: 'transform.translate', name: `Bolt ${index + 1}`, target: `bolt${index}`, consumes: [`bolt${index}`], params: { vector: [at[0] + 70, at[1], 0] } },
    ]
  }).flat()
}

const SCENES = /** @type {Record<string, any[]>} */ ({
  'fillet-50 (data-004, 200 records)': filletScene(50),
  '24-bodies (perf-001)': twentyFourScene(),
})

/** @param {any[]} records @param {any} [options] */
const open = (records, options = {}) => createDocument({ actions: records.map((r) => structuredClone(r)), ...options })

/** @param {() => void} fn */
function time(fn) {
  const start = performance.now()
  fn()
  return performance.now() - start
}

const results = /** @type {Record<string, any>} */ ({})
const extra = { id: 'bench-extra', op: 'primitive.cuboid', name: 'Extra', params: { size: [5, 5, 5], center: [900, 900, 2] } }

for (const [name, records] of Object.entries(SCENES)) {
  const row = /** @type {Record<string, any>} */ ({ records: records.length })
  const lastId = records[records.length - 1].id

  // Mutation cost: append one body, and toggle suppression of the last row (a cheap register write).
  const append = []
  const suppress = []
  for (let run = 0; run < RUNS; run += 1) {
    const doc = open(records)
    append.push(time(() => doc.append(structuredClone(extra), { origin: 'local' })))
    suppress.push(time(() => doc.setSuppressed(lastId, true, { origin: 'local' })))
  }
  row.append = stats(append)
  row.setSuppressed = stats(suppress)

  if (typeof createDocument().mergeFrom === 'function') {
    for (const [label, options] of [['cached', {}], ['uncached', { foldCache: null }]]) {
      const merge = []
      for (let run = 0; run < RUNS; run += 1) {
        const human = open(records, { replica: 'hhhhhh', ...options })
        const other = open(records, { replica: 'oooooo', ...options })
        other.append(structuredClone(extra), { origin: 'local' })
        other.setSuppressed(lastId, true, { origin: 'local' })
        const state = other.mergeState()
        merge.push(time(() => human.mergeFrom(state, { origin: 'merge' })))
      }
      row[`mergeFrom ${label}`] = stats(merge)
    }
  }
  results[name] = row
}

console.log(JSON.stringify(results, null, 2))
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 2))

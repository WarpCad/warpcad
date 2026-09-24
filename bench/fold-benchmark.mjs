/**
 * Where the main thread's kernel time goes on every document mutation (`TODO/core-029`).
 *
 * `export-benchmark.mjs` measured export; this measures **evaluation** — the work every
 * drag-place, boolean, Inspector edit and Undo does today, synchronously, before the
 * next frame can paint. It answers the question `core-029` was filed to answer with
 * numbers rather than taste: *which* of the two candidate worker boundaries moves the
 * cost that actually exists?
 *
 * For each interaction it splits the main-thread cost into three parts:
 *
 * - **fold** — the document mutation itself (`appendAll` / `undo` / `replaceRecord`),
 *   which is `evaluate()` plus the command layer's bookkeeping.
 * - **summary** — what `stores/document.js`'s `refresh()` then does to every body on the
 *   main thread: its real `summarizeBody`. Before `core-029` that was `boundsOf` +
 *   `volumeOf`, each running `toGeom3` — for a composite, `combine()`, a real kernel
 *   union. Measured with a worker that never answers, so a composite's volume is
 *   *pending* and only the main thread's share is timed; the cache is cold every run
 *   (a fresh fold), so this is the worst case — what an Undo pays.
 * - **worker** — what the evaluation worker then spends measuring the composites that
 *   were pending (`measureGeometry` on each), i.e. the work moved off the main thread.
 * - **transport** — what shipping every body's geometry back across a worker boundary
 *   would cost (pack + structuredClone + unpack), i.e. the price of option 1.
 *
 * And, for option 2's "measured threshold", the cost of each op kind evaluated alone.
 *
 * Usage:
 *   node bench/fold-benchmark.mjs                 # all scenes, 11 runs each
 *   node bench/fold-benchmark.mjs --runs 21 --json /tmp/fold.json
 *
 * @module bench/fold-benchmark
 */

import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

import { createDocument } from '../src/core/document.js'
import { setEvaluationWorkerFactory } from '../src/core/kernel/evaluationClient.js'
import { isGroup } from '../src/core/kernel/group.js'
import { evaluate } from '../src/core/kernel/index.js'
import { registry } from '../src/core/kernel/registry.js'
import { measureGeometry } from '../src/core/kernel/measure.js'
import { packGeometry, unpackGeometry } from '../src/core/kernel/transport.js'
import { summarizeBody } from '../src/stores/document.js'

const args = process.argv.slice(2)
/** @param {string} flag @param {string} [fallback] */
const option = (flag, fallback) => {
  const index = args.indexOf(flag)
  return index === -1 ? fallback : args[index + 1]
}
const RUNS = Number(option('--runs', '11'))
const JSON_OUT = option('--json')

/** @param {number[]} samples */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (/** @type {number} */ q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  return { n: sorted.length, min: sorted[0], median: at(0.5), p95: at(0.95), worst: sorted[sorted.length - 1] }
}

/**
 * `data-004`'s fixture: `bodies` cuboids, each moved, filleted and moved again — four
 * records per body, so 50 bodies is its 200-record row.
 *
 * @param {number} bodies
 */
function filletScene(bodies) {
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

/** `perf-001`'s 24-body scene: 12 Pi boards and 12 bolts on a 150 mm grid. */
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

const SCENES = {
  'fillet-50 (data-004, 200 records)': filletScene(50),
  '24-bodies (perf-001)': twentyFourScene(),
}

/** @param {readonly any[]} records */
function seeded(records) {
  const document = createDocument()
  document.appendAll(records, { origin: 'remote' })
  return document
}

// A worker that accepts requests and never answers: the store then treats every
// composite's volume as pending, which is exactly the main-thread path in the app.
setEvaluationWorkerFactory(() => /** @type {any} */ ({ addEventListener() {}, removeEventListener() {}, postMessage() {}, terminate() {} }))

/** The store's real per-refresh summary, main-thread share only. */
function summarize(/** @type {any} */ document) {
  for (const body of document.bodies()) summarizeBody(body)
}

/** What the worker spends on the composites the summary left pending. */
function workerShare(/** @type {any} */ document) {
  for (const body of document.bodies()) if (isGroup(body.geometry)) measureGeometry(body.geometry)
}

/** pack → structuredClone → unpack of every body: option 1's per-fold return cost. */
function roundTrip(/** @type {any} */ document) {
  const packed = document.bodies().map((/** @type {any} */ body) => ({ id: body.id, geometry: packGeometry(body.geometry) }))
  const cloned = structuredClone(packed)
  cloned.map((/** @type {any} */ body) => unpackGeometry(body.geometry))
}

/**
 * @param {string} label
 * @param {() => any} setup Fresh state per run, not timed.
 * @param {(state: any) => void} act The mutation, timed as "fold".
 */
function measureInteraction(label, setup, act) {
  const fold = []
  const summary = []
  const worker = []
  const transport = []
  for (let run = 0; run < RUNS; run += 1) {
    const state = setup()
    let started = performance.now()
    act(state)
    fold.push(performance.now() - started)
    started = performance.now()
    summarize(state.document)
    summary.push(performance.now() - started)
    started = performance.now()
    workerShare(state.document)
    worker.push(performance.now() - started)
    started = performance.now()
    roundTrip(state.document)
    transport.push(performance.now() - started)
  }
  return { label, fold: stats(fold), summary: stats(summary), worker: stats(worker), transport: stats(transport) }
}

const rows = []
for (const [sceneName, records] of Object.entries(SCENES)) {
  const base = seeded(records)
  const firstId = records[0].id
  const last = base.bodies().at(-1)
  const lastTwo = base.bodies().slice(-2)

  rows.push({ scene: sceneName, ...measureInteraction(
    'drag-place (append one cuboid)',
    () => ({ document: seeded(records) }),
    ({ document }) => document.appendAll([{ id: 'new', op: 'primitive.cuboid', name: 'New', params: { size: [20, 20, 20], center: [900, 900, 10] } }], { origin: 'local' }),
  ) })
  rows.push({ scene: sceneName, ...measureInteraction(
    'boolean (union the last two bodies)',
    () => ({ document: seeded(records) }),
    ({ document }) => document.appendAll([{ id: 'bool', op: 'boolean.union', name: 'Union', target: lastTwo[0].recordId, operands: [lastTwo[1].recordId], consumes: lastTwo.map((/** @type {any} */ b) => b.recordId) }], { origin: 'local' }),
  ) })
  rows.push({ scene: sceneName, ...measureInteraction(
    'Inspector-style move (translate last body)',
    () => ({ document: seeded(records) }),
    ({ document }) => document.appendAll([{ id: 'mv', op: 'transform.translate', target: last.recordId, supersedes: last.recordId, params: { vector: [5, 0, 0] } }], { origin: 'local' }),
  ) })
  rows.push({ scene: sceneName, ...measureInteraction(
    'Undo (the placement above)',
    () => {
      const document = seeded(records)
      document.appendAll([{ id: 'new', op: 'primitive.cuboid', name: 'New', params: { size: [20, 20, 20], center: [900, 900, 10] } }], { origin: 'local' })
      return { document }
    },
    ({ document }) => document.undo(),
  ) })
  rows.push({ scene: sceneName, ...measureInteraction(
    'edit the FIRST row (full re-fold, data-004 headline)',
    () => ({ document: seeded(records) }),
    ({ document }) => document.replaceRecord(firstId, { ...records[0], params: { ...records[0].params } }, { origin: 'local' }),
  ) })
  // `TODO/core-030` rows: the other half of the history, and the fallback.
  rows.push({ scene: sceneName, ...measureInteraction(
    'Redo (the placement, after its Undo)',
    () => {
      const document = seeded(records)
      document.appendAll([{ id: 'new', op: 'primitive.cuboid', name: 'New', params: { size: [20, 20, 20], center: [900, 900, 10] } }], { origin: 'local' })
      document.undo()
      return { document }
    },
    ({ document }) => document.redo(),
  ) })
  rows.push({ scene: sceneName, ...measureInteraction(
    'Undo of the first-row edit',
    () => {
      const document = seeded(records)
      document.replaceRecord(firstId, { ...records[0], params: { ...records[0].params } }, { origin: 'local' })
      return { document }
    },
    ({ document }) => document.undo(),
  ) })
  rows.push({ scene: sceneName, ...measureInteraction(
    'Undo after a remote record arrived (fold fallback)',
    () => {
      const document = seeded(records)
      document.appendAll([{ id: 'new', op: 'primitive.cuboid', name: 'New', params: { size: [20, 20, 20], center: [900, 900, 10] } }], { origin: 'local' })
      document.appendAll([{ id: 'theirs', op: 'primitive.cuboid', name: 'Theirs', params: { size: [20, 20, 20], center: [-900, 900, 10] } }], { origin: 'mcp' })
      return { document }
    },
    ({ document }) => document.undo(),
  ) })
}

const fixed = (/** @type {number} */ value) => value.toFixed(1).padStart(7)
console.log(`fold-benchmark · node ${process.version} · ${RUNS} runs per cell · medians (p95) in ms\n`)
console.log('scene                              | interaction                                          |    fold (p95)      |  summary (p95)     | worker, off-thread | transport (p95)')
for (const row of rows) {
  console.log(
    `${row.scene.padEnd(34)} | ${row.label.padEnd(52)} | ${fixed(row.fold.median)} (${fixed(row.fold.p95)}) | ${fixed(row.summary.median)} (${fixed(row.summary.p95)}) | ${fixed(row.worker.median)} (${fixed(row.worker.p95)}) | ${fixed(row.transport.median)} (${fixed(row.transport.p95)})`,
  )
}

// Option 2's threshold: each op kind alone, against a fresh fold.
const OPS = {
  'primitive.cuboid': [{ id: 'a', op: 'primitive.cuboid', params: { size: [20, 20, 20] } }],
  'primitive.cylinder': [{ id: 'a', op: 'primitive.cylinder', params: { diameter: 20, height: 20 } }],
  'primitive.sphere': [{ id: 'a', op: 'primitive.sphere', params: { diameter: 20 } }],
  'transform.translate (cuboid)': [
    { id: 'a', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
    { id: 'b', op: 'transform.translate', target: 'a', params: { vector: [1, 2, 3] } },
  ],
  'boolean.union (2 cuboids)': [
    { id: 'a', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
    { id: 'b', op: 'primitive.cuboid', params: { size: [20, 20, 20], center: [10, 10, 10] } },
    { id: 'c', op: 'boolean.union', target: 'a', operands: ['b'] },
  ],
  'boolean.subtract (cuboid - sphere)': [
    { id: 'a', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
    { id: 'b', op: 'primitive.sphere', params: { diameter: 20, center: [10, 10, 10] } },
    { id: 'c', op: 'boolean.subtract', target: 'a', operands: ['b'] },
  ],
  'modify.filletRim (cuboid)': [
    { id: 'a', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
    { id: 'b', op: 'modify.filletRim', target: 'a', params: { face: 'top', radius: 4 } },
  ],
  'hardware.bolt (recipe)': [{ id: 'a', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 30 } }],
  'raspberrypi.bplus (recipe)': [{ id: 'a', op: 'raspberrypi.bplus', params: {} }],
}
console.log('\nper-op cost, evaluated alone (option 2 threshold) — median (p95) ms')
const opRows = []
for (const [name, opRecords] of Object.entries(OPS)) {
  const samples = []
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now()
    evaluate(opRecords)
    samples.push(performance.now() - started)
  }
  const result = stats(samples)
  opRows.push({ op: name, ...result })
  console.log(`${name.padEnd(36)} ${fixed(result.median)} (${fixed(result.p95)})`)
}

// ---------------------------------------------------------------------------
// `TODO/core-030` option 2: how much real use does "restore, don't re-fold" cover?
//
// Every Undo/Redo press in a scripted session is classified by whether the kernel
// ran at all — counted at the registry boundary (a Proxy over the real registry
// counting op lookups), not inferred from timing. A press with zero lookups was
// served by restoring the captured state; anything else re-folded.
// ---------------------------------------------------------------------------

function countingRegistry() {
  const counter = { lookups: 0 }
  const proxied = new Proxy(registry, {
    get(target, key, receiver) {
      if (typeof key === 'string' && key.includes('.')) counter.lookups += 1
      return Reflect.get(target, key, receiver)
    },
  })
  return { registry: proxied, counter }
}

const local = { origin: 'local' }
const cube = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }
const chamfer = (/** @type {number} */ radius) => ({ id: 'cube-1-chamfer', op: 'modify.chamferRim', target: 'cube-1', supersedes: 'cube-1', params: { radius } })
const sphere = { id: 'sphere-1', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 16, center: [40, 0, 8] } }
const cone = { id: 'cone-1', op: 'primitive.cone', name: 'Cone 1', params: { diameter: 10, height: 12, center: [-40, 0, 6] } }

/** @type {Record<string, Array<[string, (d: any) => unknown]>>} */
const SESSIONS = {
  // TODO/ACCEPTANCE.md scenario 12, steps 1-11, as the command layer sees them.
  'scenario 12 (edit, suppress, roll back, insert, move — with their Undo/Redo)': [
    ['act', (d) => d.append(cube, local)],
    ['act', (d) => d.append(chamfer(5), local)],
    ['act', (d) => d.append(sphere, local)],
    ['act', (d) => d.replaceRecord('cube-1-chamfer', chamfer(3), local)],
    ['press', (d) => d.undo()],
    ['press', (d) => d.redo()],
    ['act', (d) => d.setSuppressed('cube-1-chamfer', true, local)],
    ['act', (d) => d.setSuppressed('cube-1-chamfer', false, local)],
    ['act', (d) => d.rollBackTo('cube-1-chamfer', local)],
    ['act', (d) => d.append(cone, local)],
    ['act', (d) => d.rollForward(local)],
    ['act', (d) => d.moveStep('sphere-1', -1, local)],
    ['press', (d) => d.undo()],
  ],
  'build 10 steps, Undo all 10, Redo 5, Undo 5': [
    ...Array.from({ length: 5 }, (unused, index) => [
      /** @type {['act', (d: any) => unknown]} */ (['act', (d) => d.append({ id: `b${index}`, op: 'primitive.cuboid', name: `B${index}`, params: { size: [10, 10, 10], center: [index * 20, 0, 5] } }, local)]),
      /** @type {['act', (d: any) => unknown]} */ (['act', (d) => d.append({ id: `b${index}-mv`, op: 'transform.translate', target: `b${index}`, supersedes: `b${index}`, params: { vector: [0, 5, 0] } }, local)]),
    ]).flat(),
    ...Array.from({ length: 10 }, () => /** @type {['press', (d: any) => unknown]} */ (['press', (d) => d.undo()])),
    ...Array.from({ length: 5 }, () => /** @type {['press', (d: any) => unknown]} */ (['press', (d) => d.redo()])),
    ...Array.from({ length: 5 }, () => /** @type {['press', (d: any) => unknown]} */ (['press', (d) => d.undo()])),
  ],
  'an MCP write lands between two local steps, then Undo x2, Redo x2': [
    ['act', (d) => d.append(cube, local)],
    ['act', (d) => d.append(sphere, { origin: 'mcp' })],
    ['act', (d) => d.append(cone, local)],
    ['press', (d) => d.undo()],
    ['press', (d) => d.undo()],
    ['press', (d) => d.redo()],
    ['press', (d) => d.redo()],
  ],
}

console.log('\ncore-030 coverage — Undo/Redo presses served by restore (zero kernel lookups) vs re-fold')
const coverage = []
for (const [name, script] of Object.entries(SESSIONS)) {
  const { registry: proxied, counter } = countingRegistry()
  const document = createDocument({ registry: /** @type {any} */ (proxied) })
  let restored = 0
  let folded = 0
  for (const [kind, act] of script) {
    counter.lookups = 0
    act(document)
    if (kind !== 'press') continue
    if (counter.lookups === 0) restored += 1
    else folded += 1
  }
  coverage.push({ session: name, restored, folded })
  console.log(`${name.padEnd(78)} restored ${String(restored).padStart(2)} · re-folded ${folded}`)
}

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ runs: RUNS, node: process.version, rows, opRows, coverage }, null, 2))

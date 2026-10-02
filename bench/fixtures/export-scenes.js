// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Reproducible export fixtures (`TODO/perf-001`).
 *
 * Every scene below is generated from the document's own action records through
 * `src/core/kernel/index.js`'s `evaluate` — the same path the app takes — so a number
 * measured here is a number the app actually pays. The generation parameters are the
 * code: there are no binary fixture files to go stale, and re-running the benchmark
 * six months from now rebuilds exactly these shapes.
 *
 * The first three scenes are the three rows of `TODO/perf-001`'s own Problem table, so
 * its "before `io-004`" / "after `io-004`" columns and this benchmark's columns are
 * measuring the same thing. `24-bodies` doubles as `io-005`'s glTF row.
 *
 * @module bench/fixtures/export-scenes
 */

import { evaluate } from '../../src/core/kernel/index.js'

/** @typedef {import('../../src/core/export.js').ExportBody} ExportBody */

/**
 * Grid placement for the multi-body scenes: 12 items, 4 columns, 120 mm apart, so no
 * two bodies overlap and each one's repair is independent of its neighbours'.
 *
 * @param {number} index
 * @returns {[number, number, number]}
 */
function slot(index) {
  return [(index % 4) * 120, Math.floor(index / 4) * 120, 0]
}

/**
 * `TODO/perf-001` row 1: one `raspberrypi.bplus` (778 → 802 triangles).
 *
 * @returns {ExportBody[]}
 */
export function onePiBoard() {
  const { byId } = evaluate([{ id: 'pi', op: 'raspberrypi.bplus', params: {} }])
  return [{ id: 'pi', name: 'Raspberry Pi 1', geometry: byId.get('pi') }]
}

/**
 * `TODO/perf-001` row 2 (and `io-005`'s glTF row): 24 bodies — 12 `raspberrypi.bplus`
 * boards and 12 `hardware.bolt`s (m10 hex, 30 long), laid out on a 120 mm grid.
 *
 * @returns {ExportBody[]}
 */
export function twentyFourBodies() {
  /** @type {any[]} */
  const records = []
  for (let index = 0; index < 12; index += 1) {
    records.push({ id: `pi${index}`, op: 'raspberrypi.bplus', params: {} })
    records.push({ id: `pit${index}`, op: 'transform.translate', target: `pi${index}`, params: { vector: slot(index) } })
    records.push({ id: `bolt${index}`, op: 'hardware.bolt', params: { spec: 'm10 hex', length: 30 } })
    records.push({
      id: `boltt${index}`,
      op: 'transform.translate',
      target: `bolt${index}`,
      params: { vector: [slot(index)[0] + 60, slot(index)[1], 0] },
    })
  }
  const { byId } = evaluate(records)
  /** @type {ExportBody[]} */
  const bodies = []
  for (let index = 0; index < 12; index += 1) {
    bodies.push({ id: `pit${index}`, name: `Raspberry Pi ${index + 1}`, geometry: byId.get(`pit${index}`) })
    bodies.push({ id: `boltt${index}`, name: `Bolt ${index + 1}`, geometry: byId.get(`boltt${index}`) })
  }
  return bodies
}

/**
 * `TODO/perf-001` row 3: one large single solid — a Ø80 sphere at `segments: 96`
 * unioned with a 60 mm cube offset into it, ~9k triangles in ONE body. This is the row
 * that matters most, because `makeWatertight`'s old cost is super-linear in a single
 * body's polygon count rather than in the body count.
 *
 * @returns {ExportBody[]}
 */
export function oneLargeSolid() {
  const { byId } = evaluate([
    { id: 'sph', op: 'primitive.sphere', params: { diameter: 80, segments: 96 } },
    { id: 'cube', op: 'primitive.cuboid', params: { size: [60, 60, 60], center: [30, 30, 30] } },
    { id: 'u', op: 'boolean.union', target: 'sph', operands: ['cube'] },
  ])
  return [{ id: 'u', name: 'Union 1', geometry: byId.get('u') }]
}

/**
 * Deliberately larger than anything expected in real use (`perf-benchmark.md` asks for
 * one): a Ø120 sphere at `segments: 192` unioned with a cube — ~37k triangles in one
 * body — which is where a super-linear repair becomes impossible to miss.
 *
 * @returns {ExportBody[]}
 */
export function oneHugeSolid() {
  const { byId } = evaluate([
    { id: 'sph', op: 'primitive.sphere', params: { diameter: 120, segments: 192 } },
    { id: 'cube', op: 'primitive.cuboid', params: { size: [90, 90, 90], center: [45, 45, 45] } },
    { id: 'u', op: 'boolean.union', target: 'sph', operands: ['cube'] },
  ])
  return [{ id: 'u', name: 'Union 1', geometry: byId.get('u') }]
}

/**
 * The scenes, by the name the results table uses.
 *
 * @type {Record<string, { label: string, build: () => ExportBody[] }>}
 */
export const SCENES = {
  'pi-board': { label: 'one raspberrypi.bplus', build: onePiBoard },
  '24-bodies': { label: '24 bodies (12 Pi boards + 12 bolts)', build: twentyFourBodies },
  'large-solid': { label: 'one large single solid (sphere segments:96 ∪ cube)', build: oneLargeSolid },
  'huge-solid': { label: 'one huge single solid (sphere segments:192 ∪ cube)', build: oneHugeSolid },
}

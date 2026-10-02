// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Measuring a body's geometry — the one implementation, on either side of the worker
 * (`TODO/core-029`).
 *
 * The UI reads two measurements off every body after every mutation: its world-axis
 * box (`BodySummary.center`/`bounds` — the Objects list, viewport framing, the scene
 * list's `data-body-*` attributes) and its volume (`data-body-volume`, the one signal
 * that proves a rim fillet removed material, `TODO/ui-027`). `core-029` measured that
 * reading them was the single largest piece of kernel work on the main thread: both
 * went through `toGeom3`, which for a composite body is a `booleans.union` of every
 * part — 97-144 ms per mutation on `perf-001`'s 24-body scene, even for a drag-place of
 * one Cube, because every *unchanged* body was re-unioned on every refresh.
 *
 * Two fixes, because the two measurements are different kinds of question:
 *
 * - **A box needs no union** — see `boundsOf` in `./group.js`, which now measures a
 *   hole-free group's visible parts directly. Cheap enough to stay synchronous.
 * - **A volume does**: overlapping parts are counted once only after a union. So
 *   {@link measureGeometry} is what the evaluation worker runs
 *   (`./evaluationJob.js`), and it is also exactly what the no-worker fallback runs on
 *   the main thread — one function, so the worker's answer and the fallback's cannot
 *   drift apart (the failure `io-004`/`io-005` were about, for export).
 *
 * The cache is keyed by the **geometry object**. Every kernel value in this project is
 * immutable — a move, an edit or a re-fold produces a new object — so identity is
 * exactly "this body has not changed", and an unchanged body is never measured twice.
 * A `WeakMap`, so a body that leaves the document takes its entry with it.
 *
 * Framework-free and DOM-free (CLAUDE.md, Project Structure).
 *
 * @module core/kernel/measure
 */

import { boundsOf, volumeOf } from './group.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./group.js').Group} Group */
/** @typedef {import('./group.js').BoundsMm} BoundsMm */

/**
 * @typedef {object} Measurement
 * @property {BoundsMm} bounds World-axis-aligned `[min, max]`, millimetres.
 * @property {number} volumeMm3 Cubic millimetres; overlapping parts counted once.
 */

/** @type {WeakMap<object, Measurement>} */
const cache = new WeakMap()

/**
 * Measure one body's geometry. Runs a kernel union for a composite (its volume needs
 * one), so on the main thread it is the *fallback*, not the normal path.
 *
 * @param {Geom3 | Group} geometry
 * @returns {Measurement}
 */
export function measureGeometry(geometry) {
  return { bounds: boundsOf(geometry), volumeMm3: volumeOf(geometry) }
}

/**
 * @param {Geom3 | Group} geometry
 * @returns {Measurement | undefined} What this exact geometry object measured, if known.
 */
export function cachedMeasurementOf(geometry) {
  return cache.get(geometry)
}

/**
 * Record a measurement for a geometry object — from the worker, or from the fallback.
 *
 * @param {Geom3 | Group} geometry
 * @param {Measurement} measurement
 */
export function rememberMeasurement(geometry, measurement) {
  cache.set(geometry, measurement)
}

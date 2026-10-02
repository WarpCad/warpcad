// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The differential harness's comparison, shared (`TODO/core-030`, reused by `TODO/core-032`).
 *
 * `historyRestore.spec.js` first wrote these to prove a restored Undo is identical to a
 * re-fold; `stores/openPending.spec.js` uses the very same comparison to prove an announced
 * Open leaves exactly the document a plain synchronous fold of the same file would. One
 * definition, so "identical" means the same thing in both.
 *
 * @module core/__fixtures__/documentObservation
 */

import { geometries } from '@jscad/modeling'

const { geom3 } = geometries

/**
 * A geometry value as the solid it *is*, not the representation it happens to be in.
 *
 * `@jscad/modeling` stores a transform lazily (`transforms` beside untransformed
 * `polygons`) and **applies it in place** — caching each polygon's `plane` too — the
 * first time anything reads the polygons. A restored state hands back the very
 * objects the earlier fold built, which something (a boolean, a measurement) may
 * already have normalised that way; a fresh fold's objects may not have been yet.
 * Both are the same solid, so they are compared as `toPolygons` vertices —
 * exact, no tolerance — rather than as object shape. Groups and plain fake-registry
 * values are walked structurally.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value
  const object = /** @type {Record<string, any>} */ (value)
  if (Array.isArray(object.polygons) && object.transforms !== undefined) {
    return { solid: geom3.toPolygons(/** @type {any} */ (object)).map((polygon) => polygon.vertices.map((vertex) => [...vertex])) }
  }
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const key of Object.keys(object).sort()) out[key] = canonical(object[key])
  return out
}

/**
 * Everything a caller can read off a document, as plain data, with geometry in
 * {@link canonical} form — compared exactly, not by a measurement that two
 * different solids could share.
 *
 * @param {any} document
 * @param {{ history?: boolean }} [options] Compare the stacks too (not against a
 *   fresh fold, whose stacks are empty by construction).
 */
export function observe(document, options = {}) {
  const ids = document.entries.map((/** @type {any} */ entry) => entry.record.id)
  return {
    entries: document.entries.map((/** @type {any} */ entry) => ({
      record: entry.record,
      origin: entry.origin,
      suppressed: entry.suppressed === true,
    })),
    rollbackAt: document.rollbackAt(),
    bodies: canonical(document.bodies()),
    timeline: document.timeline(),
    brokenSteps: document.brokenSteps(),
    byIdKeys: [...document.scene.byId.keys()],
    byId: canonical([...document.scene.byId.values()]),
    group: canonical(document.scene.group),
    errors: document.scene.errors,
    perId: ids.map((/** @type {string} */ id) => ({
      id,
      rootOf: document.rootOf(id),
      currentIdOf: document.currentIdOf(id),
      originOf: document.originOf(id),
      lineageOf: document.lineageOf(id),
    })),
    ...(options.history
      ? {
          canUndo: document.canUndo(),
          canRedo: document.canRedo(),
          undoLabel: document.pendingUndo()?.label,
          redoLabel: document.pendingRedo()?.label,
          version: document.version,
        }
      : {}),
  }
}

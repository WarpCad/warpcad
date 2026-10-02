// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one adapter between a transform *trigger* and the document.
 *
 * Both of `TODO/ui-012`'s triggers — a gizmo handle drag in the viewport, and a
 * typed value in the Inspector's Transform section — call the functions here, and
 * neither knows how a `transform.*` record is shaped. The record-building itself
 * is framework-free in `src/core/transform.js`; this is the thin reactive layer
 * that hands the result to the document store, so that "either path results in
 * the same underlying mutation" (`docs/decisions/interaction-model-qa.md` control
 * 4) is structurally true rather than a claim two handlers have to keep agreeing
 * on.
 *
 * @module composables/useTransformCommands
 */

import {
  alignToOriginRecord,
  moveToRecord,
  positionOf,
  rotateRecord,
  rotateToRecord,
  rotationOf,
  translateRecord,
  withAxis,
} from '../core/transform.js'
import { useDocumentStore } from '../stores/document.js'

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {import('../core/transform.js').AlignSpec} AlignSpec */

/**
 * @returns {{
 *   translateBy: (bodyId: string, deltaMm: Vec3) => void,
 *   rotateBy: (bodyId: string, deltaDeg: Vec3) => void,
 *   setPositionAxis: (bodyId: string, axisIndex: number, valueMm: number) => void,
 *   setRotationAxis: (bodyId: string, axisIndex: number, valueDeg: number) => void,
 *   alignToOrigin: (bodyId: string, spec: AlignSpec) => void,
 * }}
 */
export function useTransformCommands() {
  const documentStore = useDocumentStore()

  /**
   * Every mutation goes through the command layer inside an origin-tagged
   * transaction (CLAUDE.md Architecture). `'local'` because both triggers are
   * this user's own hands — a programmatic or remote edit would say so, which is
   * what lets a future undo stack stay scoped to the local user.
   *
   * @param {import('../core/kernel/registry.js').OpRecord} record
   */
  function commit(record) {
    documentStore.append(record, { origin: 'local' })
  }

  return {
    /**
     * Move a body by a millimetre delta — the gizmo translate-arm drag's commit.
     *
     * A drag that ended where it started is not a mutation: appending a
     * zero-vector record would put a no-op line in the document (and, later, a
     * do-nothing step in the undo stack) every time a user brushed a handle.
     */
    translateBy(bodyId, deltaMm) {
      if (deltaMm.every((value) => value === 0)) return
      commit(translateRecord(documentStore.raw, bodyId, deltaMm))
    },

    /** Turn a body by a degree delta — the gizmo rotate-ring drag's commit. */
    rotateBy(bodyId, deltaDeg) {
      if (deltaDeg.every((value) => value === 0)) return
      commit(rotateRecord(documentStore.raw, bodyId, deltaDeg))
    },

    /** Commit one typed Position field: an absolute millimetre value on one axis. */
    setPositionAxis(bodyId, axisIndex, valueMm) {
      const current = positionOf(documentStore.raw, bodyId)
      if (current[axisIndex] === valueMm) return
      commit(moveToRecord(documentStore.raw, bodyId, withAxis(current, axisIndex, valueMm)))
    },

    /** Commit one typed Rotation field: an absolute degree value on one axis. */
    setRotationAxis(bodyId, axisIndex, valueDeg) {
      const current = rotationOf(documentStore.raw, bodyId)
      if (current[axisIndex] === valueDeg) return
      commit(rotateToRecord(documentStore.raw, bodyId, withAxis(current, axisIndex, valueDeg)))
    },

    /**
     * Commit the Inspector's Align-to-origin row: one axis-button tap, or the
     * "Center on origin, sit on grid" shortcut (`TODO/ui-050`).
     *
     * `alignToOriginRecord` itself decides whether anything actually moves —
     * a no-op tap (already aligned within 1e-6 mm) returns `null`, and this
     * appends nothing for it, the same "don't fill Undo with invisible steps"
     * contract {@link translateBy}/{@link rotateBy} already keep for a drag
     * that ends where it started.
     */
    alignToOrigin(bodyId, spec) {
      const record = alignToOriginRecord(documentStore.raw, bodyId, spec)
      if (record) commit(record)
    },
  }
}

/**
 * The one adapter between a sketch *trigger* and the document.
 *
 * Exactly the shape `useTransformCommands.js` already established for 3D
 * transforms, for exactly the same reason: `TODO/ui-020` has three triggers that
 * must produce the same mutation —
 *
 * - the draw gesture in the viewport (pointer-down, drag, release),
 * - an endpoint handle dragged on the committed line,
 * - a coordinate typed into the Inspector's sketch fields,
 *
 * — and `docs/decisions/interaction-model-qa.md` section 7's Q14 requires the
 * last two to stay in sync, "the same contract control 4 already established for
 * 3D transforms, applied to endpoint coordinates". Routing all three through one
 * module makes that structurally true rather than a claim three handlers have to
 * keep agreeing on.
 *
 * The record shape itself is framework-free in `src/sketch/entity.js`; this is
 * the thin reactive layer that hands the result to the document store.
 *
 * @module composables/useSketchCommands
 */

import { SKETCH_LINE_OP, lineParams, moveEndpoint } from '../sketch/entity.js'
import { useDocumentStore } from '../stores/document.js'

/** @typedef {import('../sketch/entity.js').Vec2Mm} Vec2Mm */

/**
 * @returns {{
 *   drawLine: (startMm: Vec2Mm, endMm: Vec2Mm) => string | null,
 *   moveEndpointTo: (entityId: string, which: 'start' | 'end', pointMm: Vec2Mm) => void,
 *   setEndpointAxis: (entityId: string, which: 'start' | 'end', axisIndex: number, valueMm: number) => void,
 * }}
 */
export function useSketchCommands() {
  const documentStore = useDocumentStore()

  /**
   * The entity as the document currently has it, or `undefined`.
   *
   * @param {string} entityId
   */
  function entityOf(entityId) {
    return documentStore.sketchEntities.find((entity) => entity.id === entityId)
  }

  /**
   * Append a record that replaces `entityId`'s current geometry.
   *
   * `supersedes` names the **terminal** record, not the lineage root — the
   * document refuses a supersession of anything else outright, precisely so a
   * second endpoint drag builds on the first rather than forking the entity into
   * two live copies on screen (`src/core/document.js`'s supersession note).
   *
   * @param {import('../stores/document.js').SketchEntitySummary} entity
   * @param {Vec2Mm} startMm
   * @param {Vec2Mm} endMm
   */
  function supersede(entity, startMm, endMm) {
    documentStore.append(
      {
        id: documentStore.raw.nextId('sketch'),
        op: entity.op,
        supersedes: entity.recordId,
        params: lineParams(startMm, endMm),
      },
      { origin: 'local' },
    )
  }

  /**
   * Move one endpoint to an absolute point — the handle drag's commit, and
   * (through `setEndpointAxis`) a typed field's commit too. A plain function
   * rather than a method so the typed path can call it without depending on
   * `this`, which a destructured `const { setEndpointAxis } = ...` would lose.
   *
   * @param {string} entityId
   * @param {'start' | 'end'} which
   * @param {Vec2Mm} pointMm
   */
  function moveEndpointTo(entityId, which, pointMm) {
    const entity = entityOf(entityId)
    if (!entity) return
    const moved = moveEndpoint(
      { id: entity.id, startMm: entity.startMm, endMm: entity.endMm },
      which,
      pointMm,
    )
    // A drag that ended where it started is not a mutation — the same reason
    // `translateBy` refuses a zero vector: a no-op record would be a
    // do-nothing step in the undo stack every time a handle was brushed.
    if (
      moved.startMm[0] === entity.startMm[0] &&
      moved.startMm[1] === entity.startMm[1] &&
      moved.endMm[0] === entity.endMm[0] &&
      moved.endMm[1] === entity.endMm[1]
    ) {
      return
    }
    supersede(entity, moved.startMm, moved.endMm)
  }

  return {
    /**
     * Commit one drawn line. Returns the new entity's id, or `null` when there
     * was nothing to commit.
     *
     * The degenerate guard lives in the *caller* (`Viewport.vue`, which knows
     * the gesture's pixel slop), not here — this is the command layer, and a
     * programmatic or AI-driven caller asking for a legitimate sub-millimetre
     * line should not be second-guessed by it.
     */
    drawLine(startMm, endMm) {
      const record = {
        id: documentStore.raw.nextId('sketch'),
        op: SKETCH_LINE_OP,
        name: documentStore.raw.nextName('Line'),
        params: lineParams(startMm, endMm),
      }
      documentStore.append(record, { origin: 'local' })
      return record.id
    },

    moveEndpointTo,

    /** Commit one typed endpoint field: an absolute millimetre value on one axis. */
    setEndpointAxis(entityId, which, axisIndex, valueMm) {
      const entity = entityOf(entityId)
      if (!entity || (axisIndex !== 0 && axisIndex !== 1)) return
      const current = which === 'start' ? entity.startMm : entity.endMm
      if (current[axisIndex] === valueMm) return
      /** @type {Vec2Mm} */
      const next = axisIndex === 0 ? [valueMm, current[1]] : [current[0], valueMm]
      // Straight through the same helper the handle drag uses, so typing `40`
      // and dragging to 40 mm cannot produce different records.
      moveEndpointTo(entityId, which, next)
    },
  }
}

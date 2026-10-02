// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one adapter between the sketch editor and the document (`TODO/sketch-001`).
 *
 * The editor edits a draft (`src/stores/sketchEditor.js`); this is where a session
 * starts and where it ends. **Done** turns the draft into exactly one document change:
 *
 * - a brand-new sketch → one `primitive.sketch` creation record, appended like any
 *   dropped primitive, and then selected;
 * - an existing sketch → one in-place revision of its creation record's `slices` and
 *   `extrusion`, through `useParamCommands`' replace path (`TODO/data-007`), so every
 *   later record — a move, a turn, a fillet — re-folds against the new solid and the pose
 *   survives. One editing session, one Undo step, either way.
 *
 * **Cancel** changes nothing at all: for a new sketch that means no body is ever created.
 *
 * @module composables/useSketchEditorCommands
 */

import { toRaw } from 'vue'

import { frameAtOrigin, sketchFrameOf } from '../core/kernel/sketchFrame.js'
import { canEditParams, currentParamsOf } from '../core/paramEdit.js'
import { emptySketchParams } from '../sketch/profile.js'
import { useDocumentStore } from '../stores/document.js'
import { useSelectionStore } from '../stores/selection.js'
import { useSketchEditorStore } from '../stores/sketchEditor.js'
import { useParamCommands } from './useParamCommands.js'

export const SKETCH_OP = 'primitive.sketch'

/**
 * @returns {{
 *   openNew: (originMm: [number, number, number]) => void,
 *   canEdit: (bodyId: string) => { editable: boolean, reason: string },
 *   openEdit: (bodyId: string) => boolean,
 *   done: () => boolean,
 *   cancel: () => void,
 * }}
 */
export function useSketchEditorCommands() {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const editor = useSketchEditorStore()
  const paramCommands = useParamCommands()

  /** @param {string} bodyId */
  function canEdit(bodyId) {
    const raw = toRaw(documentStore.raw)
    const root = raw.recordOf(bodyId)
    if (root?.op !== SKETCH_OP) return { editable: false, reason: 'Not a sketch' }
    const verdict = canEditParams(raw, bodyId)
    if (!verdict.editable) {
      return { editable: false, reason: `This sketch can't be rebuilt from its outlines — it is a ${verdict.blockedBy}` }
    }
    return { editable: true, reason: '' }
  }

  return {
    openNew(originMm) {
      // A sketch and a body selection are different modes of attention: entering with a
      // body selected would leave its gizmo floating over the drawing plane.
      selection.clear()
      editor.open({ bodyId: null, params: emptySketchParams(), frame: frameAtOrigin(originMm), originMm })
    },

    canEdit,

    openEdit(bodyId) {
      if (!canEdit(bodyId).editable) return false
      const raw = toRaw(documentStore.raw)
      const params = currentParamsOf(raw, bodyId)
      editor.open({ bodyId, params: /** @type {any} */ (params), frame: sketchFrameOf(raw.lineageOf(bodyId)) })
      selection.clear()
      return true
    },

    done() {
      if (!editor.active || editor.doneProblem) return false
      const draft = JSON.parse(JSON.stringify(toRaw(editor.draft)))
      try {
        if (editor.bodyId === null) {
          const raw = toRaw(documentStore.raw)
          const record = {
            id: raw.nextId('sketch'),
            op: SKETCH_OP,
            name: raw.nextName('Sketch'),
            params: { center: [...editor.originMm], slices: draft.slices, extrusion: draft.extrusion },
          }
          // May throw: the document's trial fold refuses a sketch the kernel can't build.
          documentStore.append(record, { origin: 'local' })
          editor.close()
          selection.select(record.id)
          return true
        }
        const id = editor.bodyId
        if (editor.changed) paramCommands.setParams(id, { slices: draft.slices, extrusion: draft.extrusion })
        editor.close()
        selection.select(id)
        return true
      } catch (error) {
        // Nothing was committed — `append` and `revise` are atomic. Say why, and stay open.
        editor.commitError = error instanceof Error ? error.message : String(error)
        return false
      }
    },

    cancel() {
      // An edit cancelled hands the selection back to the body it started from, so the
      // user is exactly where they were before Edit sketch; a new sketch leaves nothing.
      const id = editor.bodyId
      editor.close()
      if (id !== null) selection.select(id)
    },
  }
}

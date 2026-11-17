// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The viewport's Library drop target (`TODO/ui-108`): the contract the placement store drives
 * while a row is dragged (`contains`, `preview`, `clearPreview`, `commit`), bound to the placement
 * ghost, the document and the selection.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Free of Vue: every dependency is handed
 * in, so the hit test and the commit's branches run in plain Node.
 *
 * @module composables/useViewportDropTarget
 */
import { libraryRow, recordsForDrop, variantKey } from '../core/library.js'

/**
 * @typedef {object} ViewportDropTargetDeps
 * @property {() => (Element | null | undefined)} root The viewport's root element.
 * @property {{ left: number, top: number, width: number, height: number }} rect The viewport's rectangle in client pixels (read live).
 * @property {() => boolean} hasViewport Is the 3D view mounted?
 * @property {{ preview: Function, clear: () => void, dropPoint: Function }} placementGhost
 * @property {() => void} scheduleRender
 * @property {() => boolean} isPreviewing Is a timeline preview showing (no mutation allowed)?
 * @property {() => boolean} isSketching Is the sketch editor open?
 * @property {{ openNew: (originMm: [number, number, number]) => void }} sketchCommands
 * @property {{ raw: any, appendAll: (records: any[], options: { origin: string }) => void }} documentStore
 * @property {{ select: (id: string) => void }} selection
 * @property {() => void} syncBodies
 * @property {(x: number, y: number) => (Element | null)} [elementFromPoint] Defaults to `document.elementFromPoint`.
 */

/**
 * @param {ViewportDropTargetDeps} deps
 * @returns {import('../stores/placement.js').DropTarget}
 */
export function createViewportDropTarget(deps) {
  const { placementGhost, documentStore, selection, sketchCommands, rect } = deps
  return {
    contains(clientXPx, clientYPx) {
      const root = deps.root()
      if (!root || rect.width === 0) return false
      if (
        clientXPx < rect.left ||
        clientXPx > rect.left + rect.width ||
        clientYPx < rect.top ||
        clientYPx > rect.top + rect.height
      ) {
        return false
      }
      // The rect alone is not enough, and this is not a theoretical edge case: at
      // phone width the Library panel is a bottom *sheet overlaying the viewport*,
      // so a press on a row, and a release back onto one, is geometrically
      // inside the viewport's rect while being visually on top of it. Rect-only
      // hit-testing showed the ghost the instant a row was pressed and placed a
      // body underneath the sheet on release. Asking the document what is actually
      // under the pointer respects the stacking the user can see. The drag icon is
      // `pointer-events: none`, so it never answers this question about itself.
      const under = (deps.elementFromPoint ?? ((x, y) => document.elementFromPoint(x, y)))(clientXPx, clientYPx)
      return under !== null && under !== undefined && root.contains(under)
    },

    preview(op, clientXPx, clientYPx, overrides = {}) {
      if (!deps.hasViewport() || !op) return
      // The variant, not the op: two models of one board are two different meshes, so the
      // ghost's caches are keyed by what actually decides the geometry (`TODO/ui-031`).
      placementGhost.preview(op, variantKey(op, overrides), overrides, clientXPx, clientYPx)
      deps.scheduleRender()
    },

    clearPreview() {
      placementGhost.clear()
      deps.scheduleRender()
    },

    commit(op, clientXPx, clientYPx, overrides = {}, place = undefined) {
      const point = placementGhost.dropPoint(op, variantKey(op, overrides), overrides, clientXPx, clientYPx)
      if (!point) return null
      // `TODO/ui-107`: an import's armed session (or a dropped model file) commits through its own
      // `place` (the definition and the records in one transaction) at the same snapped point a
      // Library drop would use. It selects what it placed.
      if (place !== undefined) {
        if (deps.isPreviewing()) return null
        const placedId = place({ x: point.x, y: point.y })
        deps.syncBodies()
        return placedId
      }
      // Every document mutation goes through the command layer, inside a transaction with an
      // origin (CLAUDE.md Architecture). The component never touches the action log itself.
      //
      // One drop can be more than one record (`TODO/ui-030`): a composite recipe has no position
      // param, so placing one is its own record plus a trailing `transform.translate` that
      // supersedes it. This stays ignorant of which case it is in: it appends what
      // `recordsForDrop` hands back, in order, and the **first** record is the body's lineage
      // root either way, which is the id the document reports and therefore the id to select.
      // `overrides` is the variant chosen on the row before the drag (ui-031), the same object
      // the preview above was built from, so the board that lands is the board that was shown.
      // Guarded here as well as on the Library's rows: this is the line that actually mutates the
      // log, and a drop that slipped through during a preview would append to the latest
      // document, out of the user's sight.
      if (deps.isPreviewing()) return null
      // A Sketch row (`TODO/sketch-001`) has no geometry until it is drawn, so its drop commits
      // nothing: it opens the editor with the sketch's origin at the drop point, and Done appends
      // the one record. Cancel leaves no body at all.
      if (libraryRow(op).editor === 'sketch') {
        if (deps.isSketching()) return null
        sketchCommands.openNew([point.x, point.y, 0])
        return null
      }
      const records = recordsForDrop(op, { x: point.x, y: point.y }, documentStore.raw, overrides)
      // `appendAll`, not a loop of `append` (`TODO/data-003`): a composite's two records are one
      // *drag*, and undo's granularity is one user-meaningful action. Appending them separately
      // would cost two presses of Undo for one drop, the second of which would briefly leave the
      // part sitting at its un-translated origin.
      documentStore.appendAll(records, { origin: 'local' })
      const rootId = records[0].id ?? null
      if (rootId) selection.select(rootId)
      deps.syncBodies()
      return rootId
    },
  }
}

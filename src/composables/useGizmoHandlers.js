// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The transform gizmo's four template handlers and the toolbar keep-out box (`TODO/ui-012`,
 * `ui-064`, `ui-065`, `ui-131`), moved out of `Viewport.vue` without a behaviour change
 * (`TODO/ui-152`). The drag itself is `src/render/gizmoDrag.js`, built here; the viewport keeps the
 * selection guard before a drag and the `transform.*` commit after it.
 *
 * @module composables/useGizmoHandlers
 */
import { createGizmoDrag } from '../render/gizmoDrag.js'

/**
 * @typedef {object} GizmoHandlersDeps
 * @property {() => (HTMLElement | null)} root The viewport's root element, to find the operations toolbar in.
 * @property {{ left: number, top: number, width: number, height: number }} viewportRect
 * @property {() => ({ body: any } | any)} selected The selected body's description (`useSelectedBody().value`).
 * @property {{ translateBy: (id: string, by: any) => void, rotateBy: (id: string, by: any) => void }} transformCommands
 * @property {() => void} syncBodies Re-sync the body meshes after a commit.
 * @property {(clientXPx: number, clientYPx: number, additive?: boolean) => void} pickAt The pointer's pick.
 * @property {Omit<Parameters<typeof createGizmoDrag>[0], 'keepOut' | 'viewportRect'>} drag The gizmo drag's own
 *   dependencies (meshes, preview, annotations, orbit, size, scheduler, clock); the keep-out is supplied here.
 */

/**
 * Build the gizmo drag and the handlers the `Gizmo` component's events bind to.
 *
 * @param {GizmoHandlersDeps} deps
 */
export function useGizmoHandlers({ root, viewportRect, selected, transformCommands, syncBodies, pickAt, drag }) {
  /**
   * The operations toolbar's box in viewport pixels, for the rotate dial's readout to stay clear of
   * (`TODO/ui-131`). One reused object, refreshed when a gizmo drag begins, so the per-frame path
   * allocates nothing. `active` is false when the toolbar is not mounted.
   */
  const toolbarKeepOut = { active: false, left: 0, top: 0, right: 0, bottom: 0 }

  function refreshToolbarKeepOut() {
    const el = root()?.querySelector('[data-testid="operations-toolbar"]')
    if (!el) {
      toolbarKeepOut.active = false
      return
    }
    const r = el.getBoundingClientRect()
    toolbarKeepOut.active = r.width > 0 && r.height > 0
    toolbarKeepOut.left = r.left - viewportRect.left
    toolbarKeepOut.right = r.right - viewportRect.left
    toolbarKeepOut.top = r.top - viewportRect.top
    toolbarKeepOut.bottom = r.bottom - viewportRect.top
  }

  const gizmoDrag = createGizmoDrag({
    ...drag,
    viewportRect,
    keepOut: () => (toolbarKeepOut.active ? toolbarKeepOut : null),
  })

  return {
    gizmoDrag,
    toolbarKeepOut,
    refreshToolbarKeepOut,

    /** @param {import('../render/gizmoDrag.js').GizmoDownEvent} event */
    onGizmoHandleDown(event) {
      const body = selected().body
      // Exactly one body, per control 4's precondition. The gizmo is not drawn in
      // any other state, so this is a guard rather than a branch. Nor on a part or a repeat
      // body (`TODO/ui-069`), where it is hidden.
      if (!body || body.subPart || body.moveRefusal) return
      refreshToolbarKeepOut()
      gizmoDrag.begin(event, body)
    },

    /** @param {{ clientX: number, clientY: number, shiftKey?: boolean, pointerType?: string }} event */
    onGizmoHandleMove(event) {
      gizmoDrag.move(event)
    },

    /** @param {{ cancelled: boolean }} event */
    onGizmoHandleUp(event) {
      // `end` has already dropped the preview, so the record's baked geometry and the object's
      // own transform are never both applied for a frame.
      const commit = gizmoDrag.end(event)
      if (!commit) return
      if (commit.kind === 'translate') transformCommands.translateBy(commit.bodyId, commit.translate)
      else transformCommands.rotateBy(commit.bodyId, commit.rotate)
      syncBodies()
    },

    /** @param {{ clientX: number, clientY: number }} event */
    onGizmoHandleClick(event) {
      // A press on a handle that never moved: pick what is underneath, so the gizmo
      // is not a dead zone over the solid it is attached to.
      pickAt(event.clientX, event.clientY, false)
    },
  }
}

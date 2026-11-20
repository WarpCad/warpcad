// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Raycast picking and the marquee (`TODO/ui-144`, split out of `pointerGestures.js`; the behaviour
 * is `TODO/ui-016`, `ui-024`, `ui-089`, `ui-132`, `core-035`): what is under a screen point, the
 * click that selects it, and the marquee release that selects everything a dragged rectangle
 * touches.
 *
 * Moved without a behaviour change. Framework-free: the orbit camera, the three.js viewport (a
 * getter), the body group and map, the viewport's rect and size, the stores this reads and writes
 * and the reactive marquee rectangle are handed in. The raycast runs once per click or once per
 * gesture, never per move (CLAUDE.md's Performance rule).
 *
 * @module render/picking
 */
import { Raycaster, Vector2 } from 'three'
import { createBoxScreenBounds, marqueeIntersectsBox, updateBoxScreenBounds, updateMarqueeRect } from './annotate.js'
import { drawnBoundsOf } from './mesh.js'
import { LABEL_PICK_PAD_PX, PICK_OFFSETS_PX, firstDrawnHit, isDrawn, ndcFromClient, pointInScreenBox } from './pick.js'

/**
 * @typedef {object} PickingDeps
 * @property {any} orbit The orbit camera (`src/render/camera.js`).
 * @property {() => ({ graph: { camera: import('three').Camera } } | null)} viewport The three.js
 *   viewport, or `null` before mount or after WebGL failed.
 * @property {import('three').Object3D} bodiesGroup The committed bodies' group, raycast recursively.
 * @property {Map<string, any>} bodyMeshes The committed bodies, by id.
 * @property {{ left: number, top: number, width: number, height: number }} viewportRect
 * @property {() => number} widthPx
 * @property {() => number} heightPx
 * @property {() => boolean} isSketching Whether the sketch editor is open.
 * @property {() => boolean} isPreviewing Whether the History panel (or Watch) is previewing.
 * @property {any} selection The selection store.
 * @property {() => Iterable<any>} documentBodies The live document's bodies, for the marquee.
 * @property {any} marqueeRect The reactive marquee rectangle (`createMarqueeRect`).
 */

/**
 * @typedef {object} Picking
 * @property {(clientXPx: number, clientYPx: number) => boolean} hitsBodyAt Whether a point lands on a body.
 * @property {(clientXPx: number, clientYPx: number, additive?: boolean) => void} pickAt Select what is under a point.
 * @property {(additive: boolean, startXPx: number, startYPx: number, clientXPx: number, clientYPx: number) => void} finishMarquee
 *   Select what the dragged rectangle touches.
 */

/**
 * Create the picking and marquee controller.
 *
 * @param {PickingDeps} deps
 * @returns {Picking}
 */
export function createPicking(deps) {
  const { orbit, viewportRect, bodiesGroup, bodyMeshes, selection, marqueeRect } = deps

  // Scratch values reused by the click path — CLAUDE.md's Performance rule.
  const scratchNdc = { x: 0, y: 0 }
  const pickNdc = new Vector2()
  const raycaster = new Raycaster()
  /** Scratch for a marquee release's body-vs-rectangle test (`TODO/ui-024`). */
  const boxScreenBounds = createBoxScreenBounds()

  /**
   * Whether a screen point lands on a body's mesh — the marquee's own
   * "started on empty space" precondition (`decideGestureKind` above), and the
   * same raycast {@link pickAt} performs on click, factored out so both share
   * one implementation rather than two that could drift apart.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {boolean}
   */
  function hitsBodyAt(clientXPx, clientYPx) {
    return raycastBodyId(clientXPx, clientYPx) !== null
  }

  /**
   * What is under a screen point: the body, and — for a Group-valued body, whose
   * scene object is a container of per-part meshes (`TODO/ui-016`) — which of its
   * named parts the ray actually landed on.
   *
   * **Recursive**, unlike the flat intersect this replaced: a group's part meshes
   * are children of its container, and a non-recursive test would intersect the
   * container itself (which has no geometry) and report nothing at all. That is
   * the one line that would silently make every grouped body unpickable.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {{ bodyId: string, partName?: string } | null} Nearest hit, or
   *   `null` when nothing is there (including when there is no viewport yet).
   */
  function raycastHit(clientXPx, clientYPx) {
    const viewport = deps.viewport()
    if (!viewport || bodyMeshes.size === 0) return null
    // The exact point first; only a miss tries the quarter-pixel neighbours, so a ray that
    // fell through the zero-width crack on a shared triangle edge still finds the body
    // (`PICK_OFFSETS_PX`, found by `TODO/core-035`). Click-time only, never per frame.
    for (const [dxPx, dyPx] of PICK_OFFSETS_PX) {
      ndcFromClient(clientXPx + dxPx, clientYPx + dyPx, viewportRect, scratchNdc)
      pickNdc.set(scratchNdc.x, scratchNdc.y)
      raycaster.setFromCamera(pickNdc, viewport.graph.camera)
      // `TODO/ui-089`: the raycaster reports hidden meshes too; a click goes through them.
      const hit = firstDrawnHit(raycaster.intersectObjects(bodiesGroup.children, true))
      if (hit === null) continue
      const object = hit.object
      return { bodyId: object.name, partName: object.userData.partName }
    }
    return labelBoxHit(clientXPx, clientYPx)
  }

  /**
   * A click inside a text label's on-screen box, which the stroke raycast above misses
   * (`TODO/ui-132`): a label is thin letter strokes with gaps, so only 38% of its own box hit.
   * Runs only after every real hit missed, so a body in front of or behind a label keeps its
   * click; the nearest label box wins by being first found. Click-time only.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {{ bodyId: string } | null}
   */
  function labelBoxHit(clientXPx, clientYPx) {
    for (const body of deps.documentBodies()) {
      if (body.op !== 'text.label') continue
      const mesh = bodyMeshes.get(body.id)
      if (mesh && !isDrawn(mesh)) continue
      const bounds = drawnBoundsOf([body])
      if (bounds === null) continue
      updateBoxScreenBounds(orbit, bounds[0], bounds[1], deps.widthPx(), deps.heightPx(), boxScreenBounds)
      if (pointInScreenBox(boxScreenBounds, clientXPx - viewportRect.left, clientYPx - viewportRect.top, LABEL_PICK_PAD_PX)) {
        return { bodyId: body.id }
      }
    }
    return null
  }

  /**
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {string | null} The id of the body under the point, nearest first.
   */
  function raycastBodyId(clientXPx, clientYPx) {
    return raycastHit(clientXPx, clientYPx)?.bodyId ?? null
  }

  /**
   * Select the body under a screen point, narrow to one of its parts, or clear the
   * selection when the click lands on empty space.
   *
   * Raycasting only on click, never per pointermove: this is the one place an
   * allocation-bearing three.js call is acceptable, because it runs once per tap.
   *
   * ## Pick depth (`TODO/ui-016`, interaction-model-qa control 6)
   *
   * A click on a group's member mesh means one of two different things depending
   * on what is already selected, and that is the whole feature:
   *
   * - **The group is not already the single selection** → select the whole group.
   *   A first click never jumps straight to a sub-part; a user who wants the
   *   assembly must not have to fight their way back out to it.
   * - **The group is already the single selection** → narrow to the clicked part.
   *   This covers re-targeting to a *sibling* too: clicking a different member
   *   while drilled in goes straight there rather than stepping up first, since
   *   the group is still the selected body throughout.
   *
   * The Shift/marquee-additive path is untouched: an additive click operates on
   * whole bodies, because a sub-part is a display depth, not a second selectable
   * thing to add to a set.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @param {boolean} [additive] Add to the selection rather than replacing it.
   */
  function pickAt(clientXPx, clientYPx, additive = false) {
    // §14, point 4: body selection is cleared on entering preview and the
    // Inspector reads `(nothing selected)` throughout. Letting a click select a
    // *previewed* body would put the Inspector and a disabled gizmo on an object
    // that is not in the document — the looks-live-but-isn't case again.
    if (deps.isPreviewing()) return
    // While the sketch editor is open a tap picks outlines (`pickSketchProfile`), never
    // a solid: a body in the selection would light a Union button in a mode where that
    // toolbar is not even on screen.
    if (deps.isSketching()) return
    if (!deps.viewport() || bodyMeshes.size === 0) {
      selection.clear()
      return
    }
    const hit = raycastHit(clientXPx, clientYPx)
    // Empty space always clears outright, even with the modifier held: it is the
    // gesture that dismisses the whole selection response — inspector, gizmo and
    // dimension lines — and an additive version of "nothing" has no meaning.
    if (!hit) {
      selection.clear()
      return
    }
    if (additive) {
      selection.toggle(hit.bodyId)
      return
    }
    const alreadyThisBody = selection.ids.length === 1 && selection.ids[0] === hit.bodyId
    if (hit.partName && alreadyThisBody) selection.drillInto(hit.partName)
    else selection.select(hit.bodyId)
  }

  /**
   * Finish a marquee-select drag (`TODO/ui-024`): intersect every body's world
   * bounding box against the dragged rectangle — partial overlap counts as
   * enclosed, per this task's own Testing section — and hand the resulting id
   * list to the selection store, replacing or adding to the current selection
   * per `additive`.
   *
   * @param {boolean} additive
   * @param {number} startXPx Press position — the marquee's first corner.
   * @param {number} startYPx
   * @param {number} clientXPx Pointer-up position — the marquee's second corner.
   * @param {number} clientYPx
   */
  function finishMarquee(additive, startXPx, startYPx, clientXPx, clientYPx) {
    updateMarqueeRect(
      startXPx - viewportRect.left,
      startYPx - viewportRect.top,
      clientXPx - viewportRect.left,
      clientYPx - viewportRect.top,
      marqueeRect,
    )
    const enclosed = []
    if (deps.viewport()) {
      for (const body of deps.documentBodies()) {
        // `TODO/ui-089`: a hidden body is never marqueed, and a body with hidden parts is
        // judged by the parts still drawn.
        const bounds = drawnBoundsOf([body])
        if (bounds === null) continue
        const [minMm, maxMm] = bounds
        updateBoxScreenBounds(orbit, minMm, maxMm, deps.widthPx(), deps.heightPx(), boxScreenBounds)
        if (marqueeIntersectsBox(marqueeRect, boxScreenBounds)) enclosed.push(body.id)
      }
    }
    selection.selectMany(enclosed, additive)
  }

  return { hitsBodyAt, pickAt, finishMarquee }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The per-frame overlay sync (`TODO/ui-108`): the camera mirror the grid readout and the
 * orientation gizmo read, the selection overlays (transform gizmo and dimension lines,
 * `TODO/ui-011`, `ui-017`, `ui-023`), and the Split sheet's cut plane (`TODO/io-007`).
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free: the reactive
 * structures the overlay components draw from are allocated by the viewport and handed in,
 * along with the orbit camera, the viewport size (getters, since it changes on resize), the
 * selected body (a getter, since the selection changes), the body-view lookup, the Split sheet
 * store, and the gizmo drag's re-projection hooks.
 *
 * Called from the render callback rather than from a watcher, because the gizmo and the
 * dimension lines have to track the camera: an overlay that only updated when the *selection*
 * changed would slide off its own solid the moment the user orbited. That is the same
 * one-camera-two-views trap `render-001` avoided, and it is why this reads the very orbit
 * state the frame was rendered with.
 *
 * Allocates nothing per frame beyond the camera-target readout string the viewport has always
 * built: `annotate.js` and `cutPlane.js` write into the structures handed in.
 *
 * @module render/overlaySync
 */
import {
  createOrientedBox,
  gizmoSizeForBounds,
  updateDimensionAnnotation,
  updateGizmoAnnotation,
} from './annotate.js'
import { updateCutPlaneAnnotation } from './cutPlane.js'
import { isBodyDrawn, isPartDrawn } from '../core/visibility.js'

/** How far clear of the solid a dimension line is drawn. */
const DIMENSION_OFFSET_PX = 28
/** Dimension arrowhead length. */
const DIMENSION_ARROW_PX = 9

/**
 * The camera mirror the viewport's template reads. `minorMm` and `majorMm` belong to the grid
 * and are written by the viewport, not here.
 *
 * @typedef {object} CameraOverlay
 * @property {number} azimuthDeg
 * @property {number} elevationDeg
 * @property {number} distanceMm
 * @property {string} target `x,y,z` in mm, two decimals.
 * @property {number} mmPerPixel
 */

/**
 * What this module reads of the selected body (`src/core/inspector.js`'s `BodyDescription`).
 *
 * @typedef {object} OverlayBody
 * @property {string} id
 * @property {[number, number, number]} positionMm
 * @property {[number, number, number]} rotationDeg
 * @property {[[number, number, number], [number, number, number]]} boundsMm World-axis box.
 * @property {[[number, number, number], [number, number, number]]} localBoundsMm The body's own box.
 * @property {{ groupName: string, partName: string }} [subPart]
 * @property {string} [moveRefusal]
 */

/**
 * What this module reads of the Split sheet store (`src/stores/splitSheet.js`).
 *
 * @typedef {object} OverlaySplitSheet
 * @property {boolean} isOpen
 * @property {any} previewBounds `[min, max]` in mm, or `null`.
 * @property {number} axisIndex
 * @property {number} cutMm
 */

/**
 * @typedef {object} OverlaySyncDeps
 * @property {import('./camera.js').OrbitCamera} orbit
 * @property {CameraOverlay} overlay Mutated in place.
 * @property {import('./annotate.js').GizmoAnnotation} gizmo Mutated in place.
 * @property {{ visible: boolean }} dial The rotate dial (`TODO/ui-064`), hidden with no body.
 * @property {{ visible: boolean }} ruler The translate ruler (`TODO/ui-065`), hidden with no body.
 * @property {any[]} dimensions Three dimension annotations, X, Y, Z. Mutated in place.
 * @property {any} cutPlane The cut-plane annotation (`createCutPlaneAnnotation`). Mutated in place.
 * @property {() => (OverlayBody | null | undefined)} selectedBody The one selected body, or none.
 * @property {(id: string) => (import('../core/visibility.js').BodyView | undefined)} bodyView
 *   The drawn mesh's view state for a body, or `undefined` with no mesh yet.
 * @property {OverlaySplitSheet} splitSheet
 * @property {{ syncDial: () => void, syncRuler: () => void, state?: { active: boolean, kind: string, moved?: boolean } }} gizmoDrag
 * @property {() => number} widthPx Viewport width, CSS pixels.
 * @property {() => number} heightPx Viewport height, CSS pixels.
 */

/**
 * @typedef {object} OverlaySync
 * @property {() => void} sync The whole pass: camera mirror, selection overlays, cut plane.
 * @property {() => void} syncAnnotations Re-project the selection overlays only.
 * @property {() => void} syncCutPlane Re-project the cut plane only.
 */

/**
 * Create the overlay sync controller.
 *
 * @param {OverlaySyncDeps} deps
 * @returns {OverlaySync}
 */
export function createOverlaySync(deps) {
  const {
    orbit,
    overlay,
    gizmo: gizmoAnnotation,
    dial: dialAnnotation,
    ruler: rulerAnnotation,
    dimensions: dimensionAnnotations,
    cutPlane: cutPlaneAnnotation,
    selectedBody,
    bodyView,
    splitSheet,
    gizmoDrag,
  } = deps

  /**
   * The selected body's own box, in its own frame (`TODO/ui-023`).
   *
   * Deliberately **not** reactive and allocated exactly once: `syncAnnotations()` repoints its
   * four fields at the description's existing arrays each frame, which is a reference
   * assignment rather than an allocation, per CLAUDE.md's no-per-frame-allocation rule.
   */
  const dimensionBox = createOrientedBox()

  function sync() {
    const heightPx = deps.heightPx()
    overlay.azimuthDeg = orbit.state.azimuthDeg
    overlay.elevationDeg = orbit.state.elevationDeg
    overlay.distanceMm = orbit.state.distanceMm
    const t = orbit.state.target
    overlay.target = `${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)}`
    overlay.mmPerPixel = orbit.getMmPerPixel(heightPx)
    syncAnnotations()
    syncCutPlane()
  }

  /** Project the Split sheet's cut plane for the frame just drawn, or hide it. */
  function syncCutPlane() {
    if (!splitSheet.isOpen) {
      cutPlaneAnnotation.visible = false
      return
    }
    updateCutPlaneAnnotation(
      orbit,
      splitSheet.previewBounds,
      splitSheet.axisIndex,
      splitSheet.cutMm,
      deps.widthPx(),
      deps.heightPx(),
      cutPlaneAnnotation,
    )
  }

  /**
   * Re-project the selection overlays for the frame just drawn.
   *
   * Allocates nothing: `annotate.js` writes into the structures handed in.
   */
  function syncAnnotations() {
    const body = selectedBody()
    // `TODO/ui-089`: a selected body the user hid (or a drilled part they hid) has nothing on
    // screen to attach a gizmo or dimension lines to. Allocation-free: a map lookup and a scan.
    const view = body ? bodyView(body.id) : undefined
    const hidden = view !== undefined && (body?.subPart ? !isPartDrawn(view, body.subPart.partName) : !isBodyDrawn(view))
    if (!body || hidden) {
      // Nothing selected, or two or more — either way there is no single body to
      // attach a gizmo to, and leaving the last one drawn would point at a solid
      // the user is no longer working on.
      gizmoAnnotation.visible = false
      dialAnnotation.visible = false
      rulerAnnotation.visible = false
      for (const annotation of dimensionAnnotations) annotation.visible = false
      return
    }
    const widthPx = deps.widthPx()
    const heightPx = deps.heightPx()
    if (body.subPart || body.moveRefusal) {
      // `TODO/ui-069`: a repeat body (`moveRefusal`) is never moved on its own — its members
      // follow their source and seed (`core-061` decision 6) — so no gizmo either; the Inspector
      // says what to move instead.
      // Drilled into one named part of a group (`TODO/ui-016`). The dimension
      // lines below still draw — they *measure*, and measuring the clicked part is
      // the point of the feature — but the gizmo does not, because it is a drag
      // handle and there is no record a `transform.*` op could target that means
      // "just this part". An attached gizmo here would move the whole group while
      // the Inspector named the part, which is precisely the "gizmo and numeric
      // fields drive the same transform" contract CLAUDE.md requires and this
      // state cannot satisfy. See `src/core/inspector.js`'s `subPart` field.
      gizmoAnnotation.visible = false
    } else {
      const [minMm, maxMm] = body.boundsMm
      // `TODO/ui-017`: sized to the selected body's own on-screen bounding box —
      // `overlay.mmPerPixel` is current because `sync` sets it immediately
      // before calling here — rather than the fixed 58px/40px `ui-011` originally
      // used, so the rings and arms always extend clear of the rendered object.
      const { armPx, ringPx } = gizmoSizeForBounds(minMm, maxMm, overlay.mmPerPixel)
      updateGizmoAnnotation(
        orbit,
        body.positionMm[0],
        body.positionMm[1],
        body.positionMm[2],
        widthPx,
        heightPx,
        armPx,
        ringPx,
        gizmoAnnotation,
      )
    }
    gizmoDrag.syncDial()
    gizmoDrag.syncRuler()
    // `TODO/ui-023`: the dimension lines measure the body's **own** box, not the
    // world-axis shadow the gizmo above is sized against. The two genuinely want
    // different measurements — the gizmo has to clear the tilted part's whole
    // on-screen silhouette, while the numbers have to be the part's real size.
    // `TODO/ui-139`: while a rotate-ring drag is turning the body the lines would annotate a box
    // that is no longer there (true turned bounds need the kernel, which the preview avoids per
    // frame), so they hide until release and come back on the committed, turned body. A translate
    // drag tracks exactly and keeps them.
    const turning = gizmoDrag.state?.active === true && gizmoDrag.state.kind === 'rotate' && gizmoDrag.state.moved === true
    if (turning) {
      for (const annotation of dimensionAnnotations) annotation.visible = false
      return
    }
    dimensionBox.minMm = body.localBoundsMm[0]
    dimensionBox.maxMm = body.localBoundsMm[1]
    dimensionBox.rotationDeg = body.rotationDeg
    dimensionBox.pivotMm = body.positionMm
    for (let axis = 0; axis < 3; axis += 1) {
      updateDimensionAnnotation(
        orbit,
        dimensionBox,
        axis,
        widthPx,
        heightPx,
        DIMENSION_OFFSET_PX,
        DIMENSION_ARROW_PX,
        dimensionAnnotations[axis],
      )
    }
  }

  return { sync, syncAnnotations, syncCutPlane }
}

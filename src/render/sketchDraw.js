// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The sketch editor's draw gesture, the Line chain, and profile pick and hover (`TODO/ui-108`,
 * extraction 4c; the behaviour is `TODO/sketch-001`, `sketch-005`, `sketch-006` and `ui-020`):
 * the outline dragged out by a circle, rectangle, polygon or curve; the Line tool's vertices, live
 * segment and close-on-first-point; and the outline under a tap or a hover while Select is armed.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free: the orbit camera, the
 * sketch editor's state, the active slice's height, the viewport's size, the projection, the snap,
 * the reactive chain and draft overlays, and the frame scheduler are handed in. Viewport.vue keeps
 * the pointer gesture that decides which of these a press becomes, the Shift re-snap, and the
 * camera-facing aim.
 *
 * The drag and the live Line end are plain objects the pointer code reads (`drag`, `live`). Every
 * pointer path here allocates nothing: the projection and the chain's geometry reuse scratch arrays
 * (CLAUDE.md's Performance rule).
 */
import { circleFromDrag, polygonFromDrag, profileAtPoint, rectFromDrag, toPointsMm } from '../sketch/profile.js'
import { isDegenerate } from '../sketch/entity.js'
import { formatMmValue } from '../core/units.js'
import { createScreenPoint, sketchPointToScreen, updateSketchPath } from './annotate.js'

/** The pick/snap tolerance, in screen pixels: how forgiving a pick is. */
const SKETCH_PICK_TOLERANCE_PX = 14
/**
 * The close-the-outline radius for a finger, in screen pixels. A fingertip scatters about 13 px (sigma)
 * around its target, so 14 px closed only 45 % of taps; about 2.45 sigma closes 95 % (`TODO/sketch-009`).
 * A mouse keeps the tighter radius so a distant click cannot close a shape by accident.
 */
const SKETCH_CLOSE_TOLERANCE_TOUCH_PX = 32
/**
 * Below this, a sketch drag committed nothing: the Interaction model's explicit degenerate case.
 * Expressed in pixels and converted to millimetres at the moment of the check, so the threshold
 * means the same thing to the user's hand at every zoom level.
 */
const SKETCH_MIN_LENGTH_PX = 3
/** A second Line click within this of a fix, on the same spot, finishes the chain (ms). */
const SKETCH_DOUBLE_TAP_MS = 450
/** A scratch point for the chain's overlay projections, reused across every move. */
const scratchTip = createScreenPoint()

/**
 * What this module reads of the sketch editor store (`src/stores/sketchEditor.js`).
 *
 * @typedef {object} SketchDrawEditor
 * @property {boolean} active
 * @property {string} tool
 * @property {boolean} chainLive
 * @property {string} chainId
 * @property {readonly number[] | null} chainStartMm
 * @property {{ profiles: readonly any[] } | null} slice
 * @property {readonly any[]} frame
 * @property {string} hoverProfileId
 * @property {number} hoverVertex
 * @property {number} polygonSides
 * @property {any} pendingCurve
 * @property {(end: number[]) => number[][]} curvePreviewPoints
 * @property {(end: number[]) => void} placeCurve
 * @property {(profile: any) => void} addToActiveSlice
 * @property {() => string} nextProfileId
 * @property {(pointMm: readonly number[], options: { closeToleranceMm: number, minLengthMm: number }) => 'started' | 'added' | 'closed' | 'ignored'} fixChainVertex
 * @property {() => void} finishChain
 * @property {(id: string) => void} selectProfile
 */

/**
 * The outline being dragged out, in sketch millimetres.
 *
 * @typedef {object} SketchDrag
 * @property {boolean} active
 * @property {number} startXMm
 * @property {number} startYMm
 * @property {number} endXMm
 * @property {number} endYMm
 */

/**
 * The Line chain's live end, in sketch millimetres.
 *
 * @typedef {object} SketchLive
 * @property {boolean} has
 * @property {number} xMm
 * @property {number} yMm
 */

/**
 * @typedef {object} SketchDrawDeps
 * @property {any} orbit
 * @property {SketchDrawEditor} editor
 * @property {() => number} sliceZ
 * @property {() => number} widthPx
 * @property {() => number} heightPx
 * @property {(clientXPx: number, clientYPx: number) => number[] | null} project
 *   The pointer's point on the active slice's plane, sketch mm, or `null`.
 * @property {(pointMm: number[], shiftKey: boolean, touch: boolean) => boolean} snap
 * @property {() => void} hideSnap
 * @property {() => boolean} isTouchPress
 * @property {() => void} scheduleRender
 * @property {any} chain The reactive Line-chain overlay the component draws.
 * @property {any} draft The reactive draft outline the component draws.
 */

/**
 * @typedef {object} SketchDraw
 * @property {SketchDrag} drag
 * @property {SketchLive} live
 * @property {(clientXPx: number, clientYPx: number, shiftKey: boolean, touch: boolean) => boolean} begin
 * @property {(clientXPx: number, clientYPx: number, shiftKey?: boolean) => void} update
 * @property {(cancelled: boolean) => void} end
 * @property {(clientXPx: number, clientYPx: number, shiftKey?: boolean, touch?: boolean) => void} lineTap
 * @property {(clientXPx: number, clientYPx: number, shiftKey?: boolean) => void} trackChain
 * @property {() => void} drawChain
 * @property {(clientXPx: number, clientYPx: number) => void} pick
 * @property {(clientXPx: number, clientYPx: number) => void} hoverProfile
 * @property {() => void} forgetHover
 * @property {() => number} toleranceMm
 */

/**
 * Create the sketch draw controller.
 *
 * @param {SketchDrawDeps} deps
 * @returns {SketchDraw}
 */
export function createSketchDraw(deps) {
  const { orbit, editor, chain, draft } = deps
  /** The outline being dragged out right now. Allocated once, like every pointer structure. */
  const drag = { active: false, startXMm: 0, startYMm: 0, endXMm: 0, endYMm: 0 }
  /** Where the pointer is on the sketch plane while a Line chain is live (the end of the live segment). */
  const live = { has: false, xMm: 0, yMm: 0 }
  /** `performance.now()` of the last vertex fix and what it did: double-click detection. */
  let lastFixAt = -1e9
  let lastFixResult = ''
  /** Where the last hover was resolved, so a mouse that barely moved resolves nothing. */
  let hoverX = -1e9
  let hoverY = -1e9

  /** The pick/snap tolerance in sketch millimetres at the current zoom. */
  function toleranceMm() {
    return SKETCH_PICK_TOLERANCE_PX * (orbit.getMmPerPixel(deps.heightPx()) || 1)
  }

  /** Whether the pointer last seen on the Line chain was a finger. */
  let chainTouch = false

  /** The close-the-outline radius in sketch millimetres: wider for a finger than for a mouse. */
  function closeToleranceMm() {
    const px = chainTouch ? SKETCH_CLOSE_TOLERANCE_TOUCH_PX : SKETCH_PICK_TOLERANCE_PX
    return px * (orbit.getMmPerPixel(deps.heightPx()) || 1)
  }

  /** The profile the drag in progress would commit, or `null` for the Line tool. */
  function draggedProfile() {
    const start = /** @type {[number, number]} */ ([drag.startXMm, drag.startYMm])
    const end = /** @type {[number, number]} */ ([drag.endXMm, drag.endYMm])
    if (editor.tool === 'circle') return circleFromDrag('draft', start, end)
    if (editor.tool === 'rect') return rectFromDrag('draft', start, end)
    if (editor.tool === 'polygon') return polygonFromDrag('draft', start, end, editor.polygonSides)
    if (editor.tool === 'curve' && editor.pendingCurve) {
      // The armed curve rides on the pointer: its origin (an airfoil's leading edge, an ellipse's
      // centre) is wherever the drag is now (`TODO/sketch-008`'s placement rule).
      return { id: 'draft', kind: /** @type {const} */ ('polyline'), role: /** @type {const} */ ('solid'), closed: /** @type {const} */ (true), pointsMm: /** @type {import('../sketch/profile.js').Vec2Mm[]} */ (editor.curvePreviewPoints(end)) }
    }
    return null
  }

  /** Redraw the live preview of the drag in progress. */
  function redraw() {
    if (editor.tool === 'line') {
      drawChain()
      return
    }
    const profile = draggedProfile()
    const points = profile ? toPointsMm(profile, 64) : []
    updateSketchPath(orbit, editor.frame, points, deps.sliceZ(), profile !== null, deps.widthPx(), deps.heightPx(), draft)
  }

  /**
   * The vertex the live segment starts from: the chain's last fixed vertex, or, on the very first
   * drag before any vertex is fixed, where the press began.
   *
   * @returns {readonly number[] | null}
   */
  function chainAnchorMm() {
    const start = editor.chainStartMm
    if (start) return start
    const profile = editor.chainId ? editor.slice?.profiles.find((candidate) => candidate.id === editor.chainId) : null
    if (profile && profile.kind === 'polyline' && !profile.closed) return profile.pointsMm[profile.pointsMm.length - 1]
    if (drag.active) return [drag.startXMm, drag.startYMm]
    return null
  }

  /**
   * Draw the Line tool's live furniture (`TODO/sketch-006`): the dashed segment from the last vertex to
   * the pointer with its length in mm, the last-vertex dot, and the first vertex, pulsing when the
   * pointer is within the close tolerance.
   */
  function drawChain() {
    const anchor = editor.active && editor.tool === 'line' ? chainAnchorMm() : null
    if (!anchor) {
      chain.visible = false
      if (!drag.active || editor.tool === 'line') draft.visible = false
      return
    }
    const zMm = deps.sliceZ()
    const frame = editor.frame
    const widthPx = deps.widthPx()
    const heightPx = deps.heightPx()
    const last = sketchPointToScreen(orbit, frame, anchor[0], anchor[1], zMm, widthPx, heightPx, scratchTip)
    chain.lastXPx = last.x
    chain.lastYPx = last.y
    chain.visible = last.visible
    const profile = editor.chainId ? editor.slice?.profiles.find((candidate) => candidate.id === editor.chainId) : null
    const chainPoints = profile && profile.kind === 'polyline' ? profile.pointsMm : null
    chain.showFirst = chainPoints !== null && chainPoints.length >= 3
    if (chainPoints) {
      const first = sketchPointToScreen(orbit, frame, chainPoints[0][0], chainPoints[0][1], zMm, widthPx, heightPx, scratchTip)
      chain.firstXPx = first.x
      chain.firstYPx = first.y
    }
    if (!live.has) {
      draft.visible = false
      chain.label = ''
      chain.closeNear = false
      return
    }
    const end = [live.xMm, live.yMm]
    updateSketchPath(orbit, frame, [anchor, end], zMm, false, widthPx, heightPx, draft)
    const lengthMm = Math.hypot(end[0] - anchor[0], end[1] - anchor[1])
    const tolerance = toleranceMm()
    chain.closeNear = chain.showFirst && chainPoints !== null && Math.hypot(end[0] - chainPoints[0][0], end[1] - chainPoints[0][1]) <= closeToleranceMm()
    if (lengthMm > tolerance * 0.5) {
      const tip = sketchPointToScreen(orbit, frame, end[0], end[1], zMm, widthPx, heightPx, scratchTip)
      chain.labelXPx = (chain.lastXPx + tip.x) / 2
      chain.labelYPx = (chain.lastYPx + tip.y) / 2 - 8
      chain.label = `${formatMmValue(lengthMm)} mm`
    } else {
      chain.label = ''
    }
  }

  /**
   * Track the pointer as the live end of the Line chain (mouse hover, or a finger that is down).
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @param {boolean} [shiftKey]
   */
  function trackChain(clientXPx, clientYPx, shiftKey = false) {
    if (editor.tool !== 'line' || !editor.chainLive) return
    chainTouch = deps.isTouchPress()
    const point = deps.project(clientXPx, clientYPx)
    if (!point) return
    // The rubber band ends where the click would fix the vertex: snapped, so what you see is what you get.
    deps.snap(point, shiftKey, false)
    live.has = true
    live.xMm = point[0]
    live.yMm = point[1]
    drawChain()
    deps.scheduleRender()
  }

  /**
   * The Line tool's one vertex-fix step: every click, tap and drag-release lands here with the
   * sketch-local point it fixes.
   *
   * @param {readonly number[]} pointMm Sketch-local millimetres.
   * @returns {'started' | 'added' | 'closed' | 'ignored'}
   */
  function fixVertex(pointMm) {
    const mmPerPx = orbit.getMmPerPixel(deps.heightPx()) || 1
    const result = editor.fixChainVertex(pointMm, {
      closeToleranceMm: closeToleranceMm(),
      minLengthMm: SKETCH_MIN_LENGTH_PX * mmPerPx,
    })
    if (result !== 'ignored') {
      lastFixAt = performance.now()
      lastFixResult = result
    }
    return result
  }

  return {
    drag,
    live,

    /**
     * Begin drawing, from the point the press started at: the press point, not where travel first
     * crossed the slop threshold.
     *
     * @returns {boolean} False when the press point does not meet the sketch plane.
     */
    begin(clientXPx, clientYPx, shiftKey, touch) {
      chainTouch = touch
      const point = deps.project(clientXPx, clientYPx)
      if (!point) return false
      // The press point is the first point fixed: a circle's centre, a rectangle's corner.
      deps.snap(point, shiftKey, touch)
      drag.active = true
      drag.startXMm = point[0]
      drag.startYMm = point[1]
      drag.endXMm = point[0]
      drag.endYMm = point[1]
      return true
    },

    /**
     * @param {number} clientXPx
     * @param {number} clientYPx
     * @param {boolean} [shiftKey] Held: the live end goes exactly where the pointer is, unsnapped.
     */
    update(clientXPx, clientYPx, shiftKey = false) {
      if (!drag.active) return
      const point = deps.project(clientXPx, clientYPx)
      if (!point) return
      // The live end (a circle's radius point, a rectangle's far corner, a Line vertex) snaps too.
      deps.snap(point, shiftKey, deps.isTouchPress())
      drag.endXMm = point[0]
      drag.endYMm = point[1]
      if (editor.tool === 'line') {
        live.has = true
        live.xMm = point[0]
        live.yMm = point[1]
      }
      redraw()
      deps.scheduleRender()
    },

    /**
     * Finish a draw gesture: add one outline to the draft, unless it was cancelled or never really
     * moved. Nothing reaches the document; that waits for Done.
     *
     * For the Line tool a drag fixes vertices. With no chain yet, the press point is the first vertex
     * and the release the second; with a chain live, only the release point matters.
     *
     * @param {boolean} cancelled
     */
    end(cancelled) {
      if (!drag.active) return
      const start = /** @type {[number, number]} */ ([drag.startXMm, drag.startYMm])
      const end = /** @type {[number, number]} */ ([drag.endXMm, drag.endYMm])
      drag.active = false
      draft.visible = false
      deps.hideSnap()
      deps.scheduleRender()
      if (editor.tool === 'line') {
        if (!cancelled) {
          if (!editor.chainLive) fixVertex(start)
          fixVertex(end)
        }
        drawChain()
        return
      }
      if (cancelled) return
      if (editor.tool === 'curve') {
        // A curve lands where the drag is released, wherever it started (`TODO/sketch-008`).
        editor.placeCurve(end)
        return
      }
      // The degenerate case: a release that never really moved adds nothing at all.
      if (isDegenerate(start, end, SKETCH_MIN_LENGTH_PX * (orbit.getMmPerPixel(deps.heightPx()) || 1))) return

      const profile = draggedProfile()
      // Deliberately **not** auto-selected (ui-020's finding #3): drawing several outlines in a row
      // is the point of the editor, and a selection would only get in the way.
      if (profile) editor.addToActiveSlice({ ...profile, id: editor.nextProfileId() })
    },

    /**
     * A click or tap with the Line armed: fix a vertex there. A second click right on the vertex just
     * fixed (a double-click / double-tap) finishes the chain instead, and a click straight after a
     * close is swallowed so the double-click that closed an outline does not also start the next one.
     *
     * @param {number} clientXPx
     * @param {number} clientYPx
     * @param {boolean} [shiftKey] Held: the vertex goes exactly where clicked, unsnapped.
     * @param {boolean} [touch]
     */
    lineTap(clientXPx, clientYPx, shiftKey = false, touch = false) {
      chainTouch = touch
      const point = deps.project(clientXPx, clientYPx)
      if (!point) return
      deps.snap(point, shiftKey, touch)
      // A finger has lifted: nothing is in hand any more, so no marker either.
      if (touch) deps.hideSnap()
      const sincePrevious = performance.now() - lastFixAt
      if (sincePrevious < SKETCH_DOUBLE_TAP_MS && lastFixResult === 'closed') return
      const result = fixVertex([point[0], point[1]])
      if (result === 'ignored' && editor.chainLive && sincePrevious < SKETCH_DOUBLE_TAP_MS) editor.finishChain()
      live.has = true
      live.xMm = point[0]
      live.yMm = point[1]
      drawChain()
      deps.scheduleRender()
    },

    trackChain,

    drawChain,

    /**
     * A tap in the editor: pick the outline under it in the active slice, or clear.
     *
     * @param {number} clientXPx
     * @param {number} clientYPx
     */
    pick(clientXPx, clientYPx) {
      const point = deps.project(clientXPx, clientYPx)
      if (!point) {
        editor.selectProfile('')
        return
      }
      const profiles = editor.slice?.profiles ?? []
      editor.selectProfile(profileAtPoint(profiles, [point[0], point[1]], toleranceMm()) ?? '')
    },

    /**
     * Highlight the outline under a mouse that has nothing pressed, only while Select is armed. Hover is
     * a highlight, never a selection (`TODO/sketch-005`). Skipped for sub-2 px moves: `profileAtPoint`
     * samples every outline.
     *
     * @param {number} clientXPx
     * @param {number} clientYPx
     */
    hoverProfile(clientXPx, clientYPx) {
      if (editor.tool !== 'select') {
        if (editor.hoverProfileId) editor.hoverProfileId = ''
        return
      }
      if (Math.abs(clientXPx - hoverX) < 2 && Math.abs(clientYPx - hoverY) < 2) return
      hoverX = clientXPx
      hoverY = clientYPx
      const point = deps.project(clientXPx, clientYPx)
      const id = point ? profileAtPoint(editor.slice?.profiles ?? [], [point[0], point[1]], toleranceMm()) ?? '' : ''
      if (id !== editor.hoverProfileId) editor.hoverProfileId = id
    },

    /** Forget the last hover, so the next mouse move is resolved again (the mouse has left). */
    forgetHover() {
      hoverX = -1e9
      hoverY = -1e9
    },

    toleranceMm,
  }
}

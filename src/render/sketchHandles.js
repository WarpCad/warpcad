// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The selected outline's point and midpoint handles, the press that lands on one, and the drag
 * that moves it (`TODO/ui-108`, extraction 4b; the behaviour is `TODO/sketch-002`, `TODO/ui-020`
 * and `TODO/sketch-007`'s snap on a dragged point): the dots laid out in screen pixels, the
 * hit test at press time, the drag that keeps the grab where it was on the dot, and the hover
 * highlight.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free: the orbit camera, the
 * sketch editor's state, the active slice's height, the viewport's rect and size, the reactive
 * layout the overlay draws, and the projection, snap and preview are handed in. Viewport.vue keeps
 * the pointer gesture that decides a press is a handle press (and what a tap does with it), the
 * Shift re-snap, and the watcher that resets the drag.
 *
 * The press slot and the drag are plain objects the pointer code reads and writes through the
 * controller (`press`, `drag`). The hit-test and drag allocate nothing; only a layout pass builds
 * the dot arrays, and only when the camera, the draft or the selection changed.
 */
import { segmentCountOf } from '../sketch/profile.js'
import { createScreenPoint, sketchPointToScreen } from './annotate.js'

/**
 * A point handle's touch target, across (`TODO/sketch-002`): the 44 px minimum tap target, drawn
 * as a much smaller dot. A press within half of this of a dot grabs it.
 */
const SKETCH_HANDLE_TARGET_PX = 44
/** Midpoint dots show only on segments at least this long on screen — two targets. */
const SKETCH_MIDPOINT_MIN_SEGMENT_PX = 2 * SKETCH_HANDLE_TARGET_PX

/**
 * What this module reads of the sketch editor store (`src/stores/sketchEditor.js`).
 *
 * @typedef {object} SketchHandlesEditor
 * @property {string} tool
 * @property {any} selectedProfile
 * @property {readonly any[]} frame
 * @property {number} selectedVertex
 * @property {number} hoverVertex
 * @property {readonly number[] | null} selectedVertexMm
 * @property {any} draft
 * @property {(index: number) => number} insertVertexOn
 * @property {(index: number) => void} selectVertex
 * @property {(index: number, pointMm: number[]) => void} moveVertex
 * @property {(draft: any) => void} setDraft
 */

/**
 * The point drag in progress. `offset*Mm` keeps the grab where it was on the dot, so a press
 * 12 px off a point's centre does not make the point jump under the finger. `before*` is what a
 * `pointercancel` puts back.
 *
 * @typedef {object} VertexDrag
 * @property {boolean} active
 * @property {number} index
 * @property {number} offsetXMm
 * @property {number} offsetYMm
 * @property {any} beforeDraft
 * @property {number} beforeVertex
 */

/**
 * @typedef {object} SketchHandlesDeps
 * @property {any} orbit The orbit camera.
 * @property {SketchHandlesEditor} editor The sketch editor store's state.
 * @property {() => number} sliceZ The active slice's height in mm.
 * @property {() => number} widthPx
 * @property {() => number} heightPx
 * @property {{ left: number, top: number }} viewport The viewport's rect, read on press.
 * @property {{ vertices: any[], midpoints: any[] }} layout The reactive dots the overlay draws.
 * @property {(clientXPx: number, clientYPx: number) => number[] | null} projectToSketch
 * @property {(pointMm: number[], shiftKey: boolean, touch: boolean) => boolean} snap
 * @property {() => void} hideSnap
 * @property {() => boolean} isTouchPress Whether the press in hand came from a finger.
 * @property {() => void} requestPreview
 */

/**
 * @typedef {object} SketchHandles
 * @property {{ kind: '' | 'vertex' | 'midpoint', index: number }} press
 *   The handle the last press landed on, decided by {@link SketchHandles#hitTest}.
 * @property {VertexDrag} drag
 * @property {() => void} clear Empty the dots.
 * @property {() => void} sync Lay the dots out for the selected outline.
 * @property {(clientXPx: number, clientYPx: number) => boolean} hitTest
 * @property {(clientXPx: number, clientYPx: number) => boolean} beginDrag
 * @property {(clientXPx: number, clientYPx: number, shiftKey?: boolean) => void} updateDrag
 * @property {(cancelled: boolean) => void} endDrag
 * @property {(clientXPx: number, clientYPx: number) => void} hover
 * @property {() => void} forgetHover
 */

/**
 * Create the sketch handles controller.
 *
 * @param {SketchHandlesDeps} deps
 * @returns {SketchHandles}
 */
export function createSketchHandles(deps) {
  const { orbit, editor, layout, viewport } = deps
  /** Plain numbers, `[x, y, index, …]`, for the press-time hit test so it never walks a reactive array. */
  const hits = { vertices: /** @type {number[]} */ ([]), midpoints: /** @type {number[]} */ ([]) }
  const press = /** @type {{ kind: '' | 'vertex' | 'midpoint', index: number }} */ ({ kind: '', index: -1 })
  /** @type {VertexDrag} */
  const drag = { active: false, index: -1, offsetXMm: 0, offsetYMm: 0, beforeDraft: null, beforeVertex: -1 }
  const scratchVertexMm = [0, 0]
  const scratchPoint = createScreenPoint()
  /** Where the last point hover was resolved, so a mouse that barely moved resolves nothing. */
  let hoverX = -1e9
  let hoverY = -1e9

  function clear() {
    if (layout.vertices.length > 0) layout.vertices = []
    if (layout.midpoints.length > 0) layout.midpoints = []
    hits.vertices.length = 0
    hits.midpoints.length = 0
  }

  /**
   * Lay out the selected polyline's point handles: a dot on every point, and a midpoint dot on every
   * segment at least {@link SKETCH_MIDPOINT_MIN_SEGMENT_PX} long on screen.
   *
   * **Only while Select is armed.** On a dense outline the 44 px targets cover the whole stroke, so
   * with a drawing tool armed a press that began on the stroke would grab a point instead of drawing
   * (ui-020 finding #1). A drawing tool's press therefore always draws.
   */
  function sync() {
    const profile = editor.selectedProfile
    // A curve's outline (`TODO/sketch-008`) has no free points until Convert to outline.
    if (editor.tool !== 'select' || !profile || profile.kind !== 'polyline' || profile.source || profile.pointsMm.length === 0) {
      clear()
      return
    }
    const zMm = deps.sliceZ()
    const frame = editor.frame
    /** @type {any[]} */
    const vertices = []
    /** @type {any[]} */
    const midpoints = []
    const vertexHits = hits.vertices
    const midpointHits = hits.midpoints
    vertexHits.length = 0
    midpointHits.length = 0
    const points = profile.pointsMm
    for (let index = 0; index < points.length; index += 1) {
      const point = sketchPointToScreen(orbit, frame, points[index][0], points[index][1], zMm, deps.widthPx(), deps.heightPx(), scratchPoint)
      if (!point.visible) continue
      vertexHits.push(point.x, point.y, index)
      vertices.push({
        index,
        x: point.x,
        y: point.y,
        xMm: points[index][0],
        yMm: points[index][1],
        selected: index === editor.selectedVertex,
        hover: index === editor.hoverVertex,
      })
    }
    const segments = segmentCountOf(profile)
    for (let segment = 0; segment < segments; segment += 1) {
      const a = points[segment]
      const b = points[(segment + 1) % points.length]
      const start = sketchPointToScreen(orbit, frame, a[0], a[1], zMm, deps.widthPx(), deps.heightPx(), scratchPoint)
      const startX = start.x
      const startY = start.y
      const startVisible = start.visible
      const end = sketchPointToScreen(orbit, frame, b[0], b[1], zMm, deps.widthPx(), deps.heightPx(), scratchPoint)
      if (!startVisible || !end.visible) continue
      // A dense outline doesn't become a wall of handles: the fix there is zoom or Simplify.
      if (Math.hypot(end.x - startX, end.y - startY) < SKETCH_MIDPOINT_MIN_SEGMENT_PX) continue
      const x = (startX + end.x) / 2
      const y = (startY + end.y) / 2
      midpointHits.push(x, y, segment)
      midpoints.push({ segment, x, y })
    }
    layout.vertices = vertices
    layout.midpoints = midpoints
  }

  /**
   * Which handle a client point lands on: the nearest point dot within half a target, else the
   * nearest midpoint dot within half a target. The result is left in {@link press}.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {boolean} Whether a handle was hit.
   */
  function hitTest(clientXPx, clientYPx) {
    press.kind = ''
    press.index = -1
    const x = clientXPx - viewport.left
    const y = clientYPx - viewport.top
    const reach = SKETCH_HANDLE_TARGET_PX / 2
    let best = reach
    const vertexHits = hits.vertices
    for (let at = 0; at < vertexHits.length; at += 3) {
      const distance = Math.hypot(vertexHits[at] - x, vertexHits[at + 1] - y)
      if (distance <= best) {
        best = distance
        press.kind = 'vertex'
        press.index = vertexHits[at + 2]
      }
    }
    if (press.kind) return true
    const midpointHits = hits.midpoints
    for (let at = 0; at < midpointHits.length; at += 3) {
      const distance = Math.hypot(midpointHits[at] - x, midpointHits[at + 1] - y)
      if (distance <= best) {
        best = distance
        press.kind = 'midpoint'
        press.index = midpointHits[at + 2]
      }
    }
    return press.kind !== ''
  }

  /**
   * Start dragging a point: the pressed one, or, from a midpoint dot, a new one inserted on that
   * segment. Either way it becomes the picked point.
   *
   * @param {number} clientXPx The press's start.
   * @param {number} clientYPx
   * @returns {boolean} False when the press point does not meet the sketch plane.
   */
  function beginDrag(clientXPx, clientYPx) {
    const pressed = deps.projectToSketch(clientXPx, clientYPx)
    if (!pressed) return false
    const pressXMm = pressed[0]
    const pressYMm = pressed[1]
    drag.beforeDraft = editor.draft
    drag.beforeVertex = editor.selectedVertex
    let index = press.index
    if (press.kind === 'midpoint') index = editor.insertVertexOn(press.index)
    else editor.selectVertex(index)
    const point = editor.selectedVertexMm
    if (index < 0 || !point) return false
    drag.active = true
    drag.index = index
    drag.offsetXMm = point[0] - pressXMm
    drag.offsetYMm = point[1] - pressYMm
    return true
  }

  /**
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @param {boolean} [shiftKey] Held: the point goes exactly where it is dragged, unsnapped.
   */
  function updateDrag(clientXPx, clientYPx, shiftKey = false) {
    if (!drag.active) return
    const point = deps.projectToSketch(clientXPx, clientYPx)
    if (!point) return
    scratchVertexMm[0] = point[0] + drag.offsetXMm
    scratchVertexMm[1] = point[1] + drag.offsetYMm
    deps.snap(scratchVertexMm, shiftKey, deps.isTouchPress())
    editor.moveVertex(drag.index, scratchVertexMm)
  }

  /**
   * Finish a point drag. A `pointercancel` puts the draft (and the picked point) back exactly as
   * they were; a release keeps the move and builds the preview once.
   *
   * @param {boolean} cancelled
   */
  function endDrag(cancelled) {
    if (!drag.active) return
    drag.active = false
    deps.hideSnap()
    if (cancelled && drag.beforeDraft) {
      editor.setDraft(drag.beforeDraft)
      editor.selectVertex(drag.beforeVertex)
    }
    drag.beforeDraft = null
    deps.requestPreview()
  }

  /**
   * Highlight the point dot under a mouse with nothing pressed. The dots are there whenever Select is
   * armed and an outline with points is picked (`TODO/sketch-002`).
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   */
  function hover(clientXPx, clientYPx) {
    if (hits.vertices.length === 0) {
      if (editor.hoverVertex !== -1) editor.hoverVertex = -1
      return
    }
    if (Math.abs(clientXPx - hoverX) < 2 && Math.abs(clientYPx - hoverY) < 2) return
    hoverX = clientXPx
    hoverY = clientYPx
    const index = hitTest(clientXPx, clientYPx) && press.kind === 'vertex' ? press.index : -1
    press.kind = ''
    press.index = -1
    if (index !== editor.hoverVertex) editor.hoverVertex = index
  }

  return {
    press,
    drag,
    clear,
    sync,
    hitTest,
    beginDrag,
    updateDrag,
    endDrag,
    hover,
    /** Forget the last hover, so the next mouse move is resolved again (the mouse has left). */
    forgetHover() {
      hoverX = -1e9
      hoverY = -1e9
    },
  }
}

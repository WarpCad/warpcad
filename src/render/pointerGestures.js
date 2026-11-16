// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The viewport's pointer gestures (`TODO/ui-108`, extraction 5b; the behaviour is `TODO/render-001`,
 * `ui-018`, `ui-019`, `ui-024`, `ui-045`, `ui-016`, `ui-020`, `sketch-002` to `sketch-007`): which
 * gesture a press becomes, the orbit and pan a drag applies, two-finger pinch and pan, raycast
 * picking, the marquee, the sketch editor's hover and Shift re-snap, and Set scale's and
 * Auto-trace's taps and drags.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free: the orbit camera, the
 * three.js viewport (a getter, since it is built on mount and can be replaced), the body group and
 * map, the viewport's rect and size, the drag-mode toggle, the stores this reads and writes, the
 * sketch controllers, the reactive marquee rectangle, and the frame scheduler are handed in.
 *
 * The pointer bookkeeping is plain numbers, allocated once; `pointerdown` allocates one entry per
 * contact and `pointermove` allocates nothing (CLAUDE.md's Performance rule). The raycast runs once
 * per click or once per gesture, never per move.
 */
import { Raycaster, Vector2 } from 'three'
import { createBoxScreenBounds, marqueeIntersectsBox, updateBoxScreenBounds, updateMarqueeRect } from './annotate.js'
import { drawnBoundsOf } from './mesh.js'
import { PICK_OFFSETS_PX, firstDrawnHit, ndcFromClient, projectToSketchPlane, projectToWorkingPlane } from './pick.js'

/** Degrees of orbit per pixel of drag. */
export const ORBIT_DEG_PER_PX = 0.4
/**
 * Total pointer travel, in pixels, below which a press counts as a click rather
 * than a drag. A tap on a touch screen always wanders a pixel or two.
 */
export const CLICK_SLOP_PX = 5

/**
 * What the single-pointer gesture in progress has resolved to. `''` before it has (or for a click).
 *
 * @typedef {'' | 'orbit' | 'pan' | 'select' | 'marquee' | 'sketch' | 'sketch-idle' | 'sketch-vertex' | 'sketch-scale' | 'sketch-trace'} GestureKind
 */

/**
 * The pointer fields this module reads. A `PointerEvent` satisfies it; a test passes a plain object.
 *
 * @typedef {object} GesturePointerEvent
 * @property {number} pointerId
 * @property {number} clientX
 * @property {number} clientY
 * @property {number} button
 * @property {boolean} shiftKey
 * @property {boolean} ctrlKey
 * @property {boolean} metaKey
 * @property {string} pointerType
 * @property {string} type `'pointercancel'` abandons the gesture.
 * @property {() => void} preventDefault
 */

/**
 * @typedef {object} PointerGesturesDeps
 * @property {any} orbit The orbit camera (`src/render/camera.js`).
 * @property {() => ({ graph: { camera: import('three').Camera } } | null)} viewport The three.js
 *   viewport, or `null` before mount or after WebGL failed.
 * @property {import('three').Object3D} bodiesGroup The committed bodies' group, raycast recursively.
 * @property {Map<string, any>} bodyMeshes The committed bodies, by id.
 * @property {{ left: number, top: number, width: number, height: number }} viewportRect
 * @property {() => number} widthPx
 * @property {() => number} heightPx
 * @property {() => (HTMLCanvasElement | null)} canvas The canvas pointer capture is taken on.
 * @property {() => 'orbit' | 'pan' | 'select'} getMode The chrome's drag-mode toggle.
 * @property {() => string} mouseNavPreset `settings.mouseNavPreset` (`TODO/ui-019`).
 * @property {() => boolean} isSketching Whether the sketch editor is open.
 * @property {() => boolean} isPreviewing Whether the History panel (or Watch) is previewing.
 * @property {() => number} sliceZ The active slice's offset along the sketch's own Z.
 * @property {any} sketchEditor The sketch editor store.
 * @property {any} selection The selection store.
 * @property {() => Iterable<any>} documentBodies The live document's bodies, for the marquee.
 * @property {any} sketchHandler `src/render/sketchHandles.js`.
 * @property {any} sketchDraw `src/render/sketchDraw.js`.
 * @property {{ snap: (pointMm: number[], shiftKey: boolean, touch: boolean) => void, hide: () => void }} sketchSnapper
 * @property {any} referenceImage The reference photo's view (`useReferenceImageView`).
 * @property {any} marqueeRect The reactive marquee rectangle (`createMarqueeRect`).
 * @property {(dragging: boolean) => void} setDragging Mirrors "a pointer is down" for `data-dragging`.
 * @property {() => void} scheduleRender
 */

/**
 * @typedef {object} PointerGestures
 * @property {(event: GesturePointerEvent) => void} down `pointerdown` on the canvas.
 * @property {(event: GesturePointerEvent) => void} move `pointermove` on the canvas.
 * @property {(event: GesturePointerEvent) => void} up `pointerup` and `pointercancel` on the canvas.
 * @property {() => void} leave `pointerleave`: the sketch hover and the snap marker go.
 * @property {(event: KeyboardEvent) => void} shiftKey Shift pressed or released: re-snap in place.
 * @property {(clientXPx: number, clientYPx: number, additive?: boolean) => void} pickAt Select what is under a point.
 * @property {(clientXPx: number, clientYPx: number) => ({ x: number, y: number, z: number } | null)} projectToWorkingPlane
 *   A client point on the working plane (the scratch point), or `null` when the plane is not under it.
 * @property {(clientXPx: number, clientYPx: number) => (number[] | null)} projectToSketch
 *   A client point on the active slice's plane, sketch-local mm (the scratch pair), or `null`.
 * @property {() => boolean} isTouchPress Whether the tracked press is a touch.
 * @property {() => GestureKind} gestureKind What the press in progress has resolved to.
 * @property {() => void} cancelScaleDrag Forget a Set scale drag (the editor closed under it).
 */

/**
 * Create the pointer gesture controller.
 *
 * @param {PointerGesturesDeps} deps
 * @returns {PointerGestures}
 */
export function createPointerGestures(deps) {
  const {
    orbit,
    viewportRect,
    bodiesGroup,
    bodyMeshes,
    sketchEditor,
    selection,
    sketchHandler,
    sketchDraw,
    sketchSnapper,
    referenceImage,
    marqueeRect,
    scheduleRender,
  } = deps

  // Scratch values reused by the pointer path — CLAUDE.md's Performance rule.
  const scratchNdc = { x: 0, y: 0 }
  const scratchPoint = { x: 0, y: 0, z: 0 }
  const pickNdc = new Vector2()
  const raycaster = new Raycaster()
  /** Scratch for one projected pointer, sketch-local `[x, y]` mm. */
  const scratchSketchMm = [0, 0]
  /** Scratch for a marquee release's body-vs-rectangle test (`TODO/ui-024`). */
  const boxScreenBounds = createBoxScreenBounds()
  /** The last pointer over the canvas, so pressing or releasing Shift can re-snap in place. */
  const snapPointer = { has: false, xPx: 0, yPx: 0 }

  // Pointer bookkeeping. Entries are allocated on pointerdown and mutated in
  // place on move, so pointermove itself allocates nothing.
  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map()
  let primaryId = -1
  let secondaryId = -1
  let pinchDistancePx = 0
  // Click-vs-drag discrimination for selection picking.
  let pressId = -1
  let pressTravelPx = 0
  // Desktop drag-mode override (`TODO/ui-018`, mapping made a stored preference
  // by `TODO/ui-019`): the button, Shift state and pointer type at the *start*
  // of the tracked press, captured once like `pressId`/`pressTravelPx` above, so
  // a Shift key released mid-drag can't flip the gesture back to orbit halfway
  // through — see `effectiveDragMode()` below.
  let pressButton = -1
  let pressShiftKey = false
  /** @type {string} `PointerEvent.pointerType` at press start: `'mouse'`, `'touch'`, `'pen'`, or `''` between gestures. */
  let pressPointerType = ''
  // Marquee-select bookkeeping (`TODO/ui-024`), captured at press start like the
  // pan-override fields above and for the same reason: a modifier released
  // mid-drag must not flip the gesture's meaning halfway through.
  let pressCtrlKey = false
  let pressMetaKey = false
  let pressStartClientX = 0
  let pressStartClientY = 0
  /**
   * What the single-pointer gesture in progress has resolved to, decided once
   * — by {@link decideGestureKind} — the moment its travel first exceeds
   * `CLICK_SLOP_PX`, and left `''` for the rest of a press that never becomes a
   * drag at all (an ordinary click). Sticky for the life of the gesture, same
   * discipline as `effectiveDragMode()`'s own note on `pressShiftKey`.
   * `'sketch-idle'` is a drag under the sketch editor's Select tool: it never draws and never
   * moves the camera (`TODO/sketch-005`).
   * `'sketch-vertex'` is a drag that began on a point handle of the selected outline: it moves
   * that point (or, from a midpoint dot, a newly inserted one) and never draws (`TODO/sketch-002`).
   * `'sketch-scale'` is Set scale's press-and-drag along a ruler (`TODO/sketch-003`).
   * `'sketch-trace'` is a press that wobbled past the tap slop while Auto-trace is armed
   * (`TODO/sketch-004`): it moves nothing, and its press point still traces on release.
   * @type {GestureKind}
   */
  let gestureKind = ''
  /** Whether the in-progress marquee adds to the selection rather than replacing it. */
  let marqueeAdditive = false

  // --- projection -----------------------------------------------------------

  /**
   * Project a client point onto the working plane.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {{ x: number, y: number, z: number } | null}
   */
  function projectPointer(clientXPx, clientYPx) {
    ndcFromClient(clientXPx, clientYPx, viewportRect, scratchNdc)
    const aspect = viewportRect.height > 0 ? viewportRect.width / viewportRect.height : 1
    return projectToWorkingPlane(orbit, scratchNdc.x, scratchNdc.y, aspect, scratchPoint)
  }

  /**
   * Project a client point onto the active slice's plane, in sketch millimetres.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {number[] | null} `scratchSketchMm`, or `null` if the plane is not under it.
   */
  function projectToSketch(clientXPx, clientYPx) {
    ndcFromClient(clientXPx, clientYPx, viewportRect, scratchNdc)
    const aspect = viewportRect.height > 0 ? viewportRect.width / viewportRect.height : 1
    return projectToSketchPlane(orbit, scratchNdc.x, scratchNdc.y, aspect, sketchEditor.frame, deps.sliceZ(), scratchSketchMm)
  }

  // --- the reference photo (TODO/sketch-003) --------------------------------

  /** A Set scale press-and-drag along the ruler: its first point, in image px. */
  const scaleDrag = { active: false, aPx: /** @type {[number, number] | null} */ (null) }

  /** @returns {boolean} False when the press is not on the photo's plane. */
  function beginScaleDrag() {
    const px = referenceImage.clientToImagePx(pressStartClientX, pressStartClientY)
    if (!px) return false
    scaleDrag.active = true
    scaleDrag.aPx = px
    // A drag defines both points; a tapped first point it replaces is simply forgotten.
    sketchEditor.scaleAPx = null
    sketchEditor.scaleBPx = null
    sketchEditor.addScalePoint(px)
    return true
  }

  /**
   * @param {number} clientXPx
   * @param {number} clientYPx
   */
  function updateScaleDrag(clientXPx, clientYPx) {
    if (!scaleDrag.active) return
    referenceImage.trackLiveEnd(clientXPx, clientYPx)
    scheduleRender()
  }

  /**
   * @param {boolean} cancelled
   * @param {number} clientXPx
   * @param {number} clientYPx
   */
  function endScaleDrag(cancelled, clientXPx, clientYPx) {
    if (!scaleDrag.active) return
    scaleDrag.active = false
    referenceImage.clearLiveEnd()
    const end = cancelled ? null : referenceImage.clientToImagePx(clientXPx, clientYPx)
    if (!end || !scaleDrag.aPx) {
      sketchEditor.scaleAPx = null
      sketchEditor.scaleBPx = null
    } else {
      sketchEditor.setScaleLine(scaleDrag.aPx, end)
    }
    scaleDrag.aPx = null
    referenceImage.syncOverlay()
    scheduleRender()
  }

  /**
   * A tap while Set scale is armed fixes the next point — the first, then the second.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   */
  function scaleTap(clientXPx, clientYPx) {
    const px = referenceImage.clientToImagePx(clientXPx, clientYPx)
    if (!px) return
    sketchEditor.addScalePoint(px)
    referenceImage.clearLiveEnd()
    referenceImage.syncOverlay()
    scheduleRender()
  }

  /**
   * A tap while Auto-trace is armed (`TODO/sketch-004`): trace the region under it, in the
   * worker. The answer lands in the draft (or the banner says why it did not).
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   */
  function traceTap(clientXPx, clientYPx) {
    const px = referenceImage.clientToImagePx(clientXPx, clientYPx)
    // Off the slice's plane altogether: the trace itself reports "Tap on the photo".
    sketchEditor.traceAt(px ?? [Number.NaN, Number.NaN])
  }

  // --- the sketch hover (TODO/sketch-007) -----------------------------------

  /**
   * A mouse over the canvas with a drawing tool armed and nothing pressed: show where a press
   * would land, so the marker and its label appear *before* the click. The live Line chain's
   * rubber band does the same in {@link trackChainPointer}.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @param {boolean} shiftKey
   */
  function hoverSketchSnap(clientXPx, clientYPx, shiftKey) {
    const tool = sketchEditor.tool
    if (tool === 'select') {
      sketchSnapper.hide()
      return
    }
    if (tool === 'line' && sketchEditor.chainLive) return
    const point = projectToSketch(clientXPx, clientYPx)
    if (!point) {
      sketchSnapper.hide()
      return
    }
    sketchSnapper.snap(point, shiftKey, false)
  }

  /**
   * Shift pressed or released with the pointer still: re-place the point in hand at once, rather
   * than waiting for the next move — "hold Shift" should read as instant.
   *
   * @param {KeyboardEvent} event
   */
  function onSnapShiftKey(event) {
    if (event.key !== 'Shift' || !deps.isSketching() || !snapPointer.has) return
    const shiftKey = event.type === 'keydown'
    if (sketchHandler.drag.active) sketchHandler.updateDrag(snapPointer.xPx, snapPointer.yPx, shiftKey)
    else if (sketchDraw.drag.active) sketchDraw.update(snapPointer.xPx, snapPointer.yPx, shiftKey)
    else if (pointers.size === 0) {
      hoverSketchSnap(snapPointer.xPx, snapPointer.yPx, shiftKey)
      sketchDraw.trackChain(snapPointer.xPx, snapPointer.yPx, shiftKey)
    }
  }

  function clearSketchHover() {
    snapPointer.has = false
    if (!sketchDraw.drag.active && !sketchHandler.drag.active) sketchSnapper.hide()
    if (sketchDraw.live.has && !sketchDraw.drag.active) {
      sketchDraw.live.has = false
      sketchDraw.drawChain()
      scheduleRender()
    }
    sketchDraw.forgetHover()
    sketchHandler.forgetHover()
    if (sketchEditor.hoverProfileId) sketchEditor.hoverProfileId = ''
    if (sketchEditor.hoverVertex !== -1) sketchEditor.hoverVertex = -1
  }

  // --- pointer input --------------------------------------------------------

  /**
   * Desktop mouse-button/modifier overrides for the single-pointer gesture in
   * progress, layered on top of the chrome's own `Orbit`/`Pan` toggle
   * (`TODO/ui-018`), keyed by `settings.mouseNavPreset` (`TODO/ui-019` made
   * `ui-018`'s mapping a stored preference rather than a hardcoded one). Adding
   * a future preset only ever means adding a branch here, never touching the
   * pointer-handling functions that call `effectiveDragMode()`.
   *
   * Gated on `pressPointerType === 'mouse'`: every branch below reads
   * `pressButton`, and a touch `PointerEvent` reports `button: 0` too, so
   * without this gate the `left-pans` preset would start panning on an
   * ordinary one-finger touch orbit. `TODO/ui-019`'s own Interaction model
   * section is explicit that the preset choice is "moot on touch" — touch
   * always falls through to the chrome's `dragMode` toggle, regardless of
   * which mouse preset is selected.
   *
   * @param {string} preset A `MouseNavPresetId` from `src/stores/settings.js`.
   * @returns {'orbit' | 'pan' | null} `null` means "no override — fall through
   *   to the chrome toggle", so the caller only has one fallback to reason about.
   */
  function mouseDragOverride(preset) {
    if (preset === 'left-pans') {
      // The alternate preset: plain left-drag pans, right-drag orbits — the
      // mirror image of the default below. No Shift/slop gating is needed on
      // the left-button branch for the same reason the default's plain-left
      // (no Shift) case needs none: a press that never exceeds `CLICK_SLOP_PX`
      // still resolves as a click in `onPointerUp`, independent of what this
      // function returned while its travel was under that threshold.
      if (pressButton === 0) return 'pan'
      if (pressButton === 2) return 'orbit'
      return null
    }
    // Default (`shift-or-right-pans`, `ui-018`'s original scheme). Right mouse
    // button always pans, no modifier needed — there is no competing
    // "right-click" meaning elsewhere in this component, unlike Shift+left. A
    // Shift+left press only counts as a pan override once its travel has
    // exceeded `CLICK_SLOP_PX`: below that threshold the press is still a
    // *candidate click*, and `onPointerUp`'s own `isClick` check is what fires
    // the Shift-click additive-select path — a Shift+left press that never
    // exceeds the slop must reach that path undisturbed, not be swallowed as a
    // pan.
    if (pressButton === 2) return 'pan'
    if (pressButton === 0 && pressShiftKey && pressTravelPx > CLICK_SLOP_PX) return 'pan'
    return null
  }

  /**
   * The drag mode for the single-pointer gesture in progress.
   *
   * `pressButton`, `pressShiftKey` and `pressPointerType` are captured once at
   * `pointerdown` and `pressTravelPx` only ever grows for the life of the
   * gesture (see the bookkeeping above), so once this starts returning `'pan'`
   * for a gesture it keeps returning `'pan'` for the rest of that gesture even
   * if, say, Shift is released before the pointer comes up — the mode is
   * decided once, at the point travel first crosses whatever threshold the
   * active preset uses, not re-evaluated every move.
   *
   * The drag mode can also be `'select'` (`TODO/ui-024`'s marquee toggle):
   * `decideGestureKind` above intercepts that case into a marquee before ever
   * reaching here in the ordinary flow, but a press that starts *on* a body
   * while `'select'` is active still falls through to this function (there is
   * no separate "drag a body directly" gesture, so it behaves like any other
   * non-`'pan'` mode and orbits — see `applyDrag`'s `!== 'pan'` check).
   *
   * @returns {'orbit' | 'pan' | 'select'}
   */
  function effectiveDragMode() {
    if (pressPointerType === 'mouse') {
      const override = mouseDragOverride(deps.mouseNavPreset())
      if (override) return override
    }
    return deps.getMode()
  }

  /**
   * @param {number} dx horizontal pixels travelled
   * @param {number} dy vertical pixels travelled (screen-down positive)
   */
  function applyDrag(dx, dy) {
    // Orbit is suspended while sketching, and a plain drag is already claimed by
    // `decideGestureKind`. This guard covers the sub-slop remainder — the few
    // pixels of travel before the gesture resolves — so the locked camera cannot
    // drift a degree or two on the way into every line.
    if (deps.isSketching()) return
    if (effectiveDragMode() === 'pan') orbit.panByPixels(dx, dy, deps.heightPx())
    // Dragging "grabs" the scene: pulling right swings the camera left, pulling
    // down tips the top of the scene toward the viewer.
    else orbit.orbit(-dx * ORBIT_DEG_PER_PX, dy * ORBIT_DEG_PER_PX)
    scheduleRender()
  }

  /**
   * Decide, once per single-pointer gesture, whether a drag orbits, pans, or
   * starts a marquee-select rectangle (`TODO/ui-024`).
   *
   * Marquee needs a way to claim a gesture without colliding with `ui-018`'s
   * pan overrides (Shift+left-drag, right-drag) or the plain-left-drag orbit
   * default those gestures — and their regression specs — already depend on.
   * Recorded in `docs/decisions/interaction-model-qa.md`'s marquee addendum:
   * two paths reach marquee, checked *before* falling through to
   * {@link effectiveDragMode}, so neither disturbs its existing behaviour when
   * neither path applies:
   *
   * - **Mouse**: Ctrl or Cmd held at press-down — a modifier `mouseDragOverride`
   *   never reads — with the press having started on empty space (not on a
   *   body's mesh; a gizmo handle never reaches this component at all, since
   *   `Gizmo.vue`'s own hit targets sit above the canvas and stop the event
   *   there).
   * - **Any pointer type, including touch**: the chrome's own `dragMode` toggle
   *   set to `'select'` — the touch equivalent this control needs, since touch
   *   has no modifier key, mirroring the existing Orbit/Pan toggle.
   *
   * Either path sets {@link marqueeAdditive} from `pressShiftKey` — additive
   * marquee is desktop-only for now (stated explicitly, per this task's own
   * Interaction model section, rather than left implicit): touch has no
   * keyboard, so `pressShiftKey` is simply never true for a touch gesture and
   * a touch marquee always replaces the selection, with no special-casing
   * needed here.
   *
   * The empty-space test is a raycast, deferred to the moment travel first
   * crosses `CLICK_SLOP_PX` (not to every `pointerdown`) so an ordinary click
   * never pays for it — the same "once per gesture, not once per frame" cost
   * class {@link pickAt}'s own click-time raycast already pays.
   *
   * Sketch mode short-circuits all of it (`TODO/ui-020`): while it is active a
   * plain drag **draws**, on mouse and touch alike, and orbit is suspended
   * entirely. That is what removes the gesture collision the marquee needed a
   * modifier key to resolve — section 7's Q16 calls this out as a genuine
   * simplification rather than one more special case. Two-finger pinch-zoom and
   * two-finger pan are untouched (they never reach this function), because you
   * still have to be able to get around the plane you are drawing on.
   *
   * Inside the editor, with Select armed, a press that landed on a point handle of the selected
   * outline drags that point (`TODO/sketch-002`) — the handles exist only under Select; a press anywhere else — including on the
   * outline's stroke *between* dots — draws (or, under Select, does nothing), exactly as before.
   *
   * @returns {'orbit' | 'pan' | 'select' | 'marquee' | 'sketch' | 'sketch-idle' | 'sketch-vertex' | 'sketch-scale' | 'sketch-trace'}
   */
  function decideGestureKind() {
    if (deps.isSketching()) {
      // Set scale armed (`TODO/sketch-003`): a drag draws the calibration line, nothing else.
      if (sketchEditor.imageTool === 'scale') return 'sketch-scale'
      // Auto-trace armed (`TODO/sketch-004`): a drag does nothing; two fingers still pan/zoom.
      if (sketchEditor.imageTool === 'trace') return 'sketch-trace'
      if (sketchHandler.press.kind) return 'sketch-vertex'
      return sketchEditor.tool === 'select' ? 'sketch-idle' : 'sketch'
    }
    const marqueeModifier = pressPointerType === 'mouse' && (pressCtrlKey || pressMetaKey)
    const marqueeToggle = deps.getMode() === 'select'
    // Never while previewing (a History step, a Watch, `TODO/io-016`'s Shared view): the box is judged
    // against the *live* document, so it would select bodies that are not on screen — the same reason
    // `pickAt` returns in preview.
    if (!deps.isPreviewing() && (marqueeModifier || marqueeToggle) && !hitsBodyAt(pressStartClientX, pressStartClientY)) {
      marqueeAdditive = pressShiftKey
      return 'marquee'
    }
    return effectiveDragMode()
  }

  /** @param {GesturePointerEvent} event */
  function onPointerDown(event) {
    const canvas = deps.canvas()
    if (!canvas) return
    // `TODO/ui-045`: without this, a **trusted** touch press leaves WebKit free
    // to synthesise its compatibility mouse sequence (`mousedown`/`mouseup`/
    // `click`) once the touch ends — nothing here listens for it, but its mere
    // dispatch is enough to disturb the browser's own hit-testing/gesture state
    // for whichever real touch tap lands on the canvas next, which is exactly
    // the "a trusted tap selects nothing" symptom the finding describes.
    // Calling `preventDefault()` on the *initiating* `pointerdown` is what the
    // Pointer Events spec uses to suppress that compatibility sequence
    // entirely — a synthetic `PointerEvent` in a test has no such sequence to
    // suppress, which is exactly why every existing spec's synthetic taps never
    // surfaced this.
    event.preventDefault()
    try {
      canvas.setPointerCapture?.(event.pointerId)
    } catch {
      // Capture is an optimisation, not a requirement — and it throws outright on
      // a pointer id the browser doesn't consider active (synthetic events in
      // tests, some assistive tooling). Losing capture only means a drag ends when
      // the pointer leaves the canvas.
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (primaryId === -1) primaryId = event.pointerId
    else if (secondaryId === -1) {
      secondaryId = event.pointerId
      pinchDistancePx = pointerSeparation()
    }
    if (pointers.size === 1) {
      pressId = event.pointerId
      pressTravelPx = 0
      pressButton = event.button
      pressShiftKey = event.shiftKey
      pressCtrlKey = event.ctrlKey
      pressMetaKey = event.metaKey
      pressPointerType = event.pointerType
      pressStartClientX = event.clientX
      pressStartClientY = event.clientY
      gestureKind = ''
      marqueeAdditive = false
      sketchHandler.press.kind = ''
      sketchHandler.press.index = -1
      if (deps.isSketching()) sketchHandler.hitTest(event.clientX, event.clientY)
      // Defensive: a marquee only ever ends (release or cancel) with this
      // cleared already, but a fresh press is the right place to guarantee it
      // regardless of how the previous gesture ended.
      marqueeRect.visible = false
    } else {
      // A second contact means this is a gesture, not a click — and never a
      // marquee: abandon one already in progress rather than leave its
      // rectangle stuck on screen.
      pressId = -1
      pressButton = -1
      pressPointerType = ''
      if (gestureKind === 'marquee') marqueeRect.visible = false
      // A second finger turns a point drag into a pinch: put the point back.
      if (gestureKind === 'sketch-vertex') sketchHandler.endDrag(true)
      // …and a Set scale drag into a pan: the line is abandoned, the tool stays armed.
      if (gestureKind === 'sketch-scale') endScaleDrag(true, 0, 0)
      gestureKind = ''
      sketchHandler.press.kind = ''
    }
    deps.setDragging(true)
  }

  function pointerSeparation() {
    const a = pointers.get(primaryId)
    const b = pointers.get(secondaryId)
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  /** @param {GesturePointerEvent} event */
  function onPointerMove(event) {
    const previous = pointers.get(event.pointerId)
    if (!previous) {
      // A mouse moving over the canvas with nothing pressed: the sketch Select tool's hover.
      if (deps.isSketching() && event.pointerType === 'mouse' && sketchEditor.imageTool === 'scale') {
        // Set scale: the line's free end follows the mouse once the first mark is fixed.
        referenceImage.trackLiveEnd(event.clientX, event.clientY)
        scheduleRender()
        return
      }
      if (deps.isSketching() && event.pointerType === 'mouse') {
        snapPointer.has = true
        snapPointer.xPx = event.clientX
        snapPointer.yPx = event.clientY
        sketchDraw.hoverProfile(event.clientX, event.clientY)
        sketchHandler.hover(event.clientX, event.clientY)
        // Where a press would land, snapped (`TODO/sketch-007`).
        hoverSketchSnap(event.clientX, event.clientY, event.shiftKey)
        // The Line chain's rubber band follows the cursor (`TODO/sketch-006`).
        sketchDraw.trackChain(event.clientX, event.clientY, event.shiftKey)
      }
      return
    }
    const dx = event.clientX - previous.x
    const dy = event.clientY - previous.y
    previous.x = event.clientX
    previous.y = event.clientY
    if (dx === 0 && dy === 0) return
    if (event.pointerId === pressId) pressTravelPx += Math.abs(dx) + Math.abs(dy)

    if (pointers.size >= 2) {
      // Two-finger gesture: pinch to zoom, and drag to pan regardless of the
      // active drag mode — the standard touch idiom, and the only way to zoom by
      // gesture on a device with no wheel. Never a marquee (see onPointerDown).
      const separation = pointerSeparation()
      if (separation > 0 && pinchDistancePx > 0) {
        orbit.dolly(pinchDistancePx / separation)
        pinchDistancePx = separation
      }
      // Only one pointer moved, so its travel is half the gesture's translation.
      orbit.panByPixels(dx / 2, dy / 2, deps.heightPx())
      scheduleRender()
      return
    }

    if (event.pointerId === pressId) {
      if (gestureKind === '' && pressTravelPx > CLICK_SLOP_PX) {
        gestureKind = decideGestureKind()
        if (gestureKind === 'marquee') marqueeRect.visible = true
        // Anchored at the press point, not here — see `beginSketchDrag`. A press
        // point that does not meet the working plane has no line to start, so the
        // gesture falls back to doing nothing rather than orbiting the locked
        // camera out from under the user.
        if (gestureKind === 'sketch' && !sketchDraw.begin(pressStartClientX, pressStartClientY, pressShiftKey, pressPointerType === 'touch')) gestureKind = ''
        if (gestureKind === 'sketch-vertex' && !sketchHandler.beginDrag(pressStartClientX, pressStartClientY)) gestureKind = ''
        if (gestureKind === 'sketch-scale' && !beginScaleDrag()) gestureKind = ''
      }
      if (gestureKind === 'sketch-scale') {
        updateScaleDrag(event.clientX, event.clientY)
        return
      }
      if (gestureKind === 'sketch-vertex' || gestureKind === 'sketch') {
        snapPointer.has = true
        snapPointer.xPx = event.clientX
        snapPointer.yPx = event.clientY
      }
      if (gestureKind === 'sketch-vertex') {
        sketchHandler.updateDrag(event.clientX, event.clientY, event.shiftKey)
        return
      }
      if (gestureKind === 'sketch') {
        sketchDraw.update(event.clientX, event.clientY, event.shiftKey)
        return
      }
      // Select never draws, and the locked camera stays put (`TODO/sketch-005`) — nor does an
      // Auto-trace press that wobbled (`TODO/sketch-004`).
      if (gestureKind === 'sketch-idle' || gestureKind === 'sketch-trace') return
      if (gestureKind === 'marquee') {
        updateMarqueeRect(
          pressStartClientX - viewportRect.left,
          pressStartClientY - viewportRect.top,
          event.clientX - viewportRect.left,
          event.clientY - viewportRect.top,
          marqueeRect,
        )
        return
      }
    }

    applyDrag(dx, dy)
  }

  /** @param {GesturePointerEvent} event */
  function onPointerUp(event) {
    const wasTracked = pointers.delete(event.pointerId)
    try {
      deps.canvas()?.releasePointerCapture?.(event.pointerId)
    } catch {
      // Same as capture above: never let cleanup throw out of a pointer handler.
    }
    if (event.pointerId === primaryId) primaryId = secondaryId
    if (event.pointerId === secondaryId || primaryId === secondaryId) secondaryId = -1
    if (pointers.size < 2) pinchDistancePx = 0
    if (pointers.size === 0) {
      primaryId = -1
      secondaryId = -1
      deps.setDragging(false)
    }
    const wasPressPointer = wasTracked && event.pointerId === pressId
    // A press that barely moved is a click: pick whatever is under it. A pointer
    // this component never saw go down belongs to something else (a placement drag
    // released over the canvas) and must not be read as a click here.
    const isClick = wasPressPointer && pressTravelPx <= CLICK_SLOP_PX
    const wasMarquee = wasPressPointer && gestureKind === 'marquee'
    const wasSketch = wasPressPointer && gestureKind === 'sketch'
    const wasSketchIdle = wasPressPointer && gestureKind === 'sketch-idle'
    const wasVertexDrag = wasPressPointer && gestureKind === 'sketch-vertex'
    const wasScaleDrag = wasPressPointer && gestureKind === 'sketch-scale'
    const wasTraceWobble = wasPressPointer && gestureKind === 'sketch-trace'
    const tappedVertex = isClick && sketchHandler.press.kind === 'vertex' ? sketchHandler.press.index : -1
    sketchHandler.press.kind = ''
    sketchHandler.press.index = -1
    const pressX = pressStartClientX
    const pressY = pressStartClientY
    pressId = -1
    gestureKind = ''

    if (wasVertexDrag) {
      sketchHandler.endDrag(event.type === 'pointercancel')
      return
    }

    if (wasScaleDrag) {
      endScaleDrag(event.type === 'pointercancel', event.clientX, event.clientY)
      return
    }

    if (wasTraceWobble) {
      // A finger that wobbled past the tap slop still means "here": trace at the press point.
      if (event.type !== 'pointercancel') traceTap(pressX, pressY)
      return
    }

    if (wasSketch) {
      // `pointercancel` (bound to this same handler) abandons the line rather
      // than committing a gesture the user never finished — the same rule the
      // marquee and the gizmo drag already follow.
      sketchDraw.end(event.type === 'pointercancel')
      return
    }

    if (wasSketchIdle) {
      // A drag under Select drew nothing; the *press* still picks whatever it landed on, so a
      // finger that wobbled past the tap slop selects instead of doing nothing at all.
      if (event.type !== 'pointercancel') sketchDraw.pick(pressX, pressY)
      return
    }

    if (wasMarquee) {
      marqueeRect.visible = false
      // `pointercancel` (bound to this same handler) means the gesture was
      // interrupted rather than deliberately released — abandon it with no
      // selection change, the same as a cancelled gizmo drag.
      if (event.type !== 'pointercancel') finishMarquee(marqueeAdditive, event.clientX, event.clientY)
      return
    }
    // Shift (or the platform's Cmd/Ctrl) adds to the selection instead of
    // replacing it — the minimum multi-select `ui-011` needs to reach the "2+
    // selected" Inspector state. A touch-only equivalent gesture belongs with the
    // Operations toolbar that actually consumes multi-selection (`ui-014`), not
    // here, where there would be nothing to do with it yet.
    if (isClick && deps.isSketching() && sketchEditor.imageTool === 'scale') {
      // Set scale (`TODO/sketch-003`): a tap fixes a ruler mark. Mouse and touch alike, no modifier.
      if (event.type !== 'pointercancel') scaleTap(event.clientX, event.clientY)
      return
    }
    if (isClick && deps.isSketching() && sketchEditor.imageTool === 'trace') {
      // Auto-trace (`TODO/sketch-004`): a tap traces the part under it. Mouse and touch alike.
      if (event.type !== 'pointercancel') traceTap(event.clientX, event.clientY)
      return
    }
    if (isClick && deps.isSketching() && sketchEditor.tool === 'line') {
      // Line: a tap or click fixes the next vertex — no hover, no modifier, any pointer type
      // (`TODO/sketch-006`). Picking an outline is Select's job; a cancelled press does nothing.
      if (event.type !== 'pointercancel') sketchDraw.lineTap(event.clientX, event.clientY, event.shiftKey, event.pointerType === 'touch')
      return
    }
    if (isClick && deps.isSketching()) {
      // A tap on a point dot picks the point (`TODO/sketch-002`); anywhere else picks an outline.
      if (tappedVertex >= 0 && event.type !== 'pointercancel') sketchEditor.selectVertex(tappedVertex)
      else sketchDraw.pick(event.clientX, event.clientY)
      return
    }
    if (isClick) pickAt(event.clientX, event.clientY, event.shiftKey || event.metaKey || event.ctrlKey)
  }

  // --- picking and the marquee ----------------------------------------------

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
   * per {@link marqueeAdditive}.
   *
   * @param {boolean} additive
   * @param {number} clientXPx Pointer-up position — the marquee's second corner.
   * @param {number} clientYPx
   */
  function finishMarquee(additive, clientXPx, clientYPx) {
    updateMarqueeRect(
      pressStartClientX - viewportRect.left,
      pressStartClientY - viewportRect.top,
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

  return {
    down: onPointerDown,
    move: onPointerMove,
    up: onPointerUp,
    leave: clearSketchHover,
    shiftKey: onSnapShiftKey,
    pickAt,
    projectToWorkingPlane: projectPointer,
    projectToSketch,
    isTouchPress: () => pressPointerType === 'touch',
    gestureKind: () => gestureKind,
    cancelScaleDrag() {
      scaleDrag.active = false
    },
  }
}

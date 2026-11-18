// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The transform gizmo's drag (`TODO/ui-108`, extraction 2; the behaviour is `TODO/ui-012`,
 * `ui-064` and `ui-065`): the live preview transform on the dragged body's mesh, the rotate
 * dial's and translate ruler's steps, the speed bands and the stall timer that settles a
 * stopped pointer into the fine step.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free: the body meshes, the
 * transform-preview store, the three overlay structures, the camera, the viewport's rect and size,
 * the frame scheduler, the clock and the timers are handed in. Viewport.vue keeps the wiring: the
 * selection guard before a drag begins, and the `transform.*` commit after it ends, which
 * {@link GizmoDrag#end} hands back rather than performing.
 *
 * The pointer path allocates nothing: the drag state, the two speed trackers and the preview's
 * scratch Euler and vector are allocated once, here (CLAUDE.md's Performance rule). Only the
 * release allocates, once per gesture, for the commit it returns.
 */
import { Euler, Vector3 } from 'three'
import {
  axisFacing,
  placeDialReadout,
  placeRulerReadout,
  ringParamDeg,
  translateDeltaMm,
  updateDialAnnotation,
  updateRulerAnnotation,
} from './annotate.js'
import {
  SPEED_STALL_MS,
  accumulateTurnDeg,
  createSpeedTracker,
  isFingerPointer,
  rotateStepDeg,
  snapDeg,
  stepForSpeed,
} from './rotateSnap.js'
import { createScalarSpeedTracker } from './dragSteps.js'
import { snapMm, translateSpeedStepMm, translateStepMm } from './translateSnap.js'

/** @typedef {import('three').Object3D} Object3D */

/**
 * What this module reads and writes of the transform-preview store
 * (`src/stores/transformPreview.js`): the running delta, and the calls that set it.
 *
 * @typedef {object} TransformPreview
 * @property {number} txMm
 * @property {number} tyMm
 * @property {number} tzMm
 * @property {number} rxDeg
 * @property {number} ryDeg
 * @property {number} rzDeg
 * @property {(id: string) => void} begin
 * @property {(xMm: number, yMm: number, zMm: number) => void} setTranslate
 * @property {(xDeg: number, yDeg: number, zDeg: number) => void} setRotate
 * @property {() => void} clear
 */

/**
 * @typedef {object} GizmoDragDeps
 * @property {Map<string, Object3D>} meshes Body objects by lineage-root id (`bodyMeshes.js`'s
 *   `meshes`). Read only: the drag writes the found object's `position` and `quaternion`.
 * @property {TransformPreview} preview
 * @property {import('./annotate.js').GizmoAnnotation} gizmo The gizmo the frame drew.
 * @property {import('./annotate.js').DialAnnotation} dial Mutated in place.
 * @property {import('./annotate.js').RulerAnnotation} ruler Mutated in place.
 * @property {{ state: { azimuthDeg: number, elevationDeg: number }, getMmPerPixel: (heightPx: number) => number }} orbit
 * @property {{ left: number, top: number }} viewportRect The canvas's client rect, kept current
 *   by the viewport; read on every event, so a mutated object stays in step.
 * @property {() => number} widthPx The canvas's width, px.
 * @property {() => number} heightPx The canvas's height, px.
 * @property {() => import('./annotate.js').KeepOutRect | null} [keepOut] Chrome the dial's
 *   readout must stay clear of (the operations toolbar), viewport pixels; the same object each
 *   call. `TODO/ui-131`.
 * @property {() => void} scheduleRender
 * @property {() => number} now Monotonic clock, ms (`() => performance.now()` in the app).
 * @property {{ setTimeout: (fn: () => void, ms: number) => any, clearTimeout: (id: any) => void }} [timers]
 *   Defaults to the global timers, looked up on every call.
 */

/**
 * A gizmo handle press, as `TransformGizmo.vue`'s `handle-down` reports it.
 *
 * @typedef {{ kind: 'translate' | 'rotate', axisIndex: number, clientX: number, clientY: number,
 *   pointerType?: string, shiftKey?: boolean }} GizmoDownEvent
 */

/**
 * What a finished drag commits: the whole gesture's delta, as one `transform.*` record.
 *
 * @typedef {object} GizmoCommit
 * @property {'translate' | 'rotate'} kind
 * @property {string} bodyId
 * @property {[number, number, number]} translate Millimetres.
 * @property {[number, number, number]} rotate Degrees.
 */

/** @type {NonNullable<GizmoDragDeps['timers']>} */
const GLOBAL_TIMERS = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
}

/**
 * Build the gizmo-drag controller. Nothing happens until {@link GizmoDrag#begin}.
 *
 * @param {GizmoDragDeps} deps
 */
export function createGizmoDrag(deps) {
  const {
    meshes: bodyMeshes,
    preview,
    gizmo: gizmoAnnotation,
    dial: dialAnnotation,
    ruler: rulerAnnotation,
    orbit,
    viewportRect,
    scheduleRender,
  } = deps
  const timers = deps.timers ?? GLOBAL_TIMERS

  /**
   * The gizmo drag in progress (`TODO/ui-012`).
   *
   * Allocated once and mutated, like every other pointer structure here: a drag
   * writes into it on every `pointermove`, and CLAUDE.md's Performance rule is
   * explicit that the pointer path allocates nothing.
   *
   * `centre*Mm` and `originPx` are captured at `pointerdown` and deliberately not
   * refreshed: a rotation is measured against where the drag *started*, so the
   * sweep stays stable even as the preview turns the solid underneath it.
   */
  const gizmoDrag = {
    active: false,
    /** @type {'translate' | 'rotate'} */
    kind: 'translate',
    axisIndex: 0,
    bodyId: '',
    startXPx: 0,
    startYPx: 0,
    originXPx: 0,
    originYPx: 0,
    facing: 1,
    centreXMm: 0,
    centreYMm: 0,
    centreZMm: 0,
    // --- rotate dial (`TODO/ui-064`) ---
    /** `PointerEvent.pointerType` of the press: a finger or pen gets the readout moved clear of it. */
    pointerType: 'mouse',
    /** Shift held right now: tracked on every move *and* on keydown/keyup mid-drag. */
    shift: false,
    /** Whether the pointer has moved since the press, so a plain click never flashes the dial. */
    moved: false,
    /** Ring parameter of the grab, degrees: where the start hand points. */
    startParamDeg: 0,
    /** The pointer's turn from the start, unwrapped past ±180°, before snapping. */
    rawTurnDeg: 0,
    /** `rawTurnDeg` snapped to `stepDeg`: the one number the preview, dial, field and commit share. */
    turnedDeg: 0,
    /** The active step, degrees; `0` only before the first move. */
    stepDeg: 0,
    /** The touch/pen speed band's step, carried for hysteresis; `0` before the first sample. */
    speedStep: 0,
    /** The pointer now, viewport pixels, for placing the readout clear of a finger. */
    pointerXPx: 0,
    pointerYPx: 0,
    // --- translate ruler (`TODO/ui-065`) ---
    /** Where the drag began, viewport pixels: the ruler's start mark. */
    pressXPx: 0,
    pressYPx: 0,
    /** The viewport's mm-per-px at the last move, which the ruler is drawn at. */
    mmPerPixel: 0,
    /** `translateDeltaMm` of the pointer from the start, before snapping. */
    rawMm: 0,
    /** `rawMm` snapped to `stepMm`: the one number the preview, ruler, field and commit share. */
    distanceMm: 0,
    /** The active step, millimetres. */
    stepMm: 0,
    /** The speed band's step, carried for hysteresis; `0` before the first sample. */
    speedStepMm: 0,
  }

  /** The ring-drag pointer's tangential speed, for the touch/pen step. Allocated once. */
  const rotateSpeed = createSpeedTracker(deps.now)

  /**
   * The arm-drag pointer's speed along the arm (`TODO/ui-065`), on every pointer
   * type. Only the projection on the arm counts, so sliding across it is not
   * speed. Allocated once.
   */
  const armSpeed = createScalarSpeedTracker(deps.now)

  /**
   * Fires once a speed-stepped gizmo drag (a touch/pen ring drag, or any arm
   * drag) has gone quiet for longer than the speed tracker's stall window, so a
   * pointer that stops settles into the fine step *visibly*, not only at
   * release. `0` when not armed.
   *
   * @type {any}
   */
  let gizmoStallTimer = 0

  // Scratch for the preview transform below — allocated once, never per frame.
  const previewEuler = new Euler()
  const previewCentre = new Vector3()

  /**
   * Show the drag in progress on the mesh itself, without touching the document.
   *
   * The transform is `p → centre + R·(p − centre) + t`: a body's geometry is baked
   * in world millimetres, so turning the object about its own origin would spin it
   * around the world origin instead — a body 300 mm out would fly across the
   * scene. Written to the three.js object as `quaternion = R` and
   * `position = centre − R·centre + t`, which is that same transform.
   *
   * Nothing here is a document mutation: exactly one `transform.*` record is
   * appended, on release, with the whole gesture's delta. See
   * `src/stores/transformPreview.js` for why.
   */
  function applyPreviewTransform() {
    const mesh = bodyMeshes.get(gizmoDrag.bodyId)
    if (!mesh) return
    // 'ZYX' matches `@jscad/modeling`'s own Tait-Bryan order, so the preview turns
    // the same way the committed geometry will.
    previewEuler.set(
      (preview.rxDeg * Math.PI) / 180,
      (preview.ryDeg * Math.PI) / 180,
      (preview.rzDeg * Math.PI) / 180,
      'ZYX',
    )
    mesh.quaternion.setFromEuler(previewEuler)
    previewCentre.set(gizmoDrag.centreXMm, gizmoDrag.centreYMm, gizmoDrag.centreZMm)
    previewCentre.applyQuaternion(mesh.quaternion)
    mesh.position.set(
      gizmoDrag.centreXMm - previewCentre.x + preview.txMm,
      gizmoDrag.centreYMm - previewCentre.y + preview.tyMm,
      gizmoDrag.centreZMm - previewCentre.z + preview.tzMm,
    )
    scheduleRender()
  }

  /** Put the dragged mesh back where the document says it is. */
  function clearPreviewTransform() {
    const mesh = bodyMeshes.get(gizmoDrag.bodyId)
    if (mesh) {
      mesh.position.set(0, 0, 0)
      mesh.quaternion.identity()
    }
    preview.clear()
    gizmoDrag.active = false
    gizmoDrag.bodyId = ''
    gizmoDrag.moved = false
    // Everything the dial or the ruler drew vanishes with the drag, release or
    // cancel alike.
    dialAnnotation.visible = false
    rulerAnnotation.visible = false
    clearGizmoStall()
    scheduleRender()
  }

  /**
   * Lay out the rotate dial for the drag in progress, or hide it (`TODO/ui-064`).
   * Called from `syncAnnotations`, so the dial is drawn from the same ring the
   * frame drew. Allocates nothing.
   *
   * @returns {void}
   */
  function syncDial() {
    if (!gizmoDrag.active || gizmoDrag.kind !== 'rotate' || !gizmoDrag.moved || !gizmoAnnotation.visible) {
      if (dialAnnotation.visible) dialAnnotation.visible = false
      return
    }
    const ring = gizmoAnnotation.rings[gizmoDrag.axisIndex]
    updateDialAnnotation(
      ring,
      gizmoDrag.startParamDeg,
      gizmoDrag.turnedDeg,
      gizmoAnnotation.originX,
      gizmoAnnotation.originY,
      dialAnnotation,
    )
    dialAnnotation.stepDeg = gizmoDrag.stepDeg
    placeDialReadout(
      ring,
      gizmoAnnotation.originX,
      gizmoAnnotation.originY,
      gizmoDrag.pointerXPx,
      gizmoDrag.pointerYPx,
      isFingerPointer(gizmoDrag.pointerType),
      deps.widthPx(),
      deps.heightPx(),
      dialAnnotation,
      deps.keepOut ? deps.keepOut() : null,
    )
  }

  /**
   * Quantise the ring drag's turn and show it (`TODO/ui-064`).
   *
   * Done once, here: pick the step (Shift → 5°, otherwise the speed band, on every
   * pointer type), snap the raw unwrapped turn to it, and hand *that* to the
   * preview. The dial, readout, preview mesh, Inspector field and commit then all
   * read the same number, so release commits exactly what was displayed.
   */
  function applyRotateStep() {
    gizmoDrag.stepDeg = rotateStepDeg(gizmoDrag.shift, gizmoDrag.speedStep)
    const turned = snapDeg(gizmoDrag.rawTurnDeg, gizmoDrag.stepDeg)
    gizmoDrag.turnedDeg = turned
    preview.setRotate(
      gizmoDrag.axisIndex === 0 ? turned : 0,
      gizmoDrag.axisIndex === 1 ? turned : 0,
      gizmoDrag.axisIndex === 2 ? turned : 0,
    )
    applyPreviewTransform()
  }

  /**
   * Lay out the translate ruler for the drag in progress, or hide it
   * (`TODO/ui-065`). Called from `syncAnnotations`, so the ruler follows the arm
   * the frame drew. Allocates nothing.
   *
   * @returns {void}
   */
  function syncRuler() {
    if (!gizmoDrag.active || gizmoDrag.kind !== 'translate' || !gizmoDrag.moved || !gizmoAnnotation.visible) {
      if (rulerAnnotation.visible) rulerAnnotation.visible = false
      return
    }
    updateRulerAnnotation(
      gizmoAnnotation,
      gizmoDrag.axisIndex,
      gizmoDrag.pressXPx,
      gizmoDrag.pressYPx,
      gizmoDrag.distanceMm,
      gizmoDrag.mmPerPixel,
      gizmoDrag.stepMm,
      rulerAnnotation,
    )
    placeRulerReadout(
      gizmoDrag.pointerXPx,
      gizmoDrag.pointerYPx,
      isFingerPointer(gizmoDrag.pointerType),
      deps.widthPx(),
      deps.heightPx(),
      rulerAnnotation,
    )
  }

  /**
   * Quantise the arm drag's distance and show it (`TODO/ui-065`).
   *
   * Done once, here: pick the step (Shift → 1 mm, otherwise the speed band, on
   * every pointer type), snap the raw distance to it, and hand *that* to the
   * preview. The ruler, readout, preview mesh, Inspector field and commit then all
   * read the same number, so release commits exactly what was displayed.
   */
  function applyTranslateStep() {
    gizmoDrag.stepMm = translateStepMm(gizmoDrag.shift, gizmoDrag.speedStepMm)
    const moved = snapMm(gizmoDrag.rawMm, gizmoDrag.stepMm)
    gizmoDrag.distanceMm = moved
    preview.setTranslate(
      gizmoDrag.axisIndex === 0 ? moved : 0,
      gizmoDrag.axisIndex === 1 ? moved : 0,
      gizmoDrag.axisIndex === 2 ? moved : 0,
    )
    applyPreviewTransform()
  }

  /** Re-read the arm drag's speed band, decayed by the time since the last move. */
  function refreshArmSpeedStep() {
    gizmoDrag.speedStepMm = translateSpeedStepMm(armSpeed.speed(), gizmoDrag.speedStepMm)
  }

  /**
   * Re-read the ring's speed band, decayed by the time since the last move.
   * "Stalling counts as slow": `pointermove` stops firing when a pointer stops.
   */
  function refreshSpeedStep() {
    gizmoDrag.speedStep = stepForSpeed(rotateSpeed.speed(), gizmoDrag.speedStep)
  }

  /**
   * Cancel a pending stall settle. Also called by the viewport on unmount.
   *
   * @returns {void}
   */
  function clearGizmoStall() {
    if (gizmoStallTimer) timers.clearTimeout(gizmoStallTimer)
    gizmoStallTimer = 0
  }

  function onGizmoStall() {
    gizmoStallTimer = 0
    if (!gizmoDrag.active || !gizmoDrag.moved) return
    if (gizmoDrag.kind === 'translate') {
      refreshArmSpeedStep()
      applyTranslateStep()
      return
    }
    refreshSpeedStep()
    applyRotateStep()
  }

  /** (Re)arm the stall timer after a speed-stepped move. */
  function armGizmoStall() {
    clearGizmoStall()
    gizmoStallTimer = timers.setTimeout(onGizmoStall, SPEED_STALL_MS + 10)
  }

  /**
   * Shift pressed or released mid gizmo drag, ring or arm: snap (or unsnap) at
   * once, without waiting for the pointer to move. Same idea as the sketch's
   * `onSnapShiftKey`. A stable reference, so the viewport can add and remove it
   * as a `keydown`/`keyup` listener.
   *
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  function onGizmoShiftKey(event) {
    if (event.key !== 'Shift' || !gizmoDrag.active) return
    const shift = event.type === 'keydown'
    if (shift === gizmoDrag.shift) return
    gizmoDrag.shift = shift
    if (!gizmoDrag.moved) return
    if (gizmoDrag.kind === 'translate') applyTranslateStep()
    else applyRotateStep()
  }

  /**
   * Begin a drag on a handle. The caller has already checked the precondition (exactly one
   * movable body selected); this only captures the press.
   *
   * @param {GizmoDownEvent} event
   * @param {{ id: string, positionMm: readonly number[] }} body The selected body.
   * @returns {void}
   */
  function onGizmoHandleDown(event, body) {
    const heightPx = deps.heightPx()
    gizmoDrag.active = true
    gizmoDrag.kind = event.kind
    gizmoDrag.axisIndex = event.axisIndex
    gizmoDrag.bodyId = body.id
    gizmoDrag.startXPx = event.clientX
    gizmoDrag.startYPx = event.clientY
    gizmoDrag.originXPx = gizmoAnnotation.originX
    gizmoDrag.originYPx = gizmoAnnotation.originY
    gizmoDrag.facing = axisFacing(orbit.state.azimuthDeg, orbit.state.elevationDeg, event.axisIndex)
    gizmoDrag.centreXMm = body.positionMm[0]
    gizmoDrag.centreYMm = body.positionMm[1]
    gizmoDrag.centreZMm = body.positionMm[2]
    gizmoDrag.pointerType = event.pointerType || 'mouse'
    gizmoDrag.shift = event.shiftKey === true
    gizmoDrag.moved = false
    gizmoDrag.rawTurnDeg = 0
    gizmoDrag.turnedDeg = 0
    gizmoDrag.stepDeg = 0
    gizmoDrag.speedStep = 0
    gizmoDrag.pointerXPx = event.clientX - viewportRect.left
    gizmoDrag.pointerYPx = event.clientY - viewportRect.top
    gizmoDrag.pressXPx = gizmoDrag.pointerXPx
    gizmoDrag.pressYPx = gizmoDrag.pointerYPx
    gizmoDrag.mmPerPixel = orbit.getMmPerPixel(heightPx)
    gizmoDrag.rawMm = 0
    gizmoDrag.distanceMm = 0
    gizmoDrag.stepMm = 0
    gizmoDrag.speedStepMm = 0
    gizmoDrag.startParamDeg =
      event.kind === 'rotate'
        ? ringParamDeg(
            gizmoAnnotation.rings[event.axisIndex],
            gizmoAnnotation.originX,
            gizmoAnnotation.originY,
            gizmoDrag.pointerXPx,
            gizmoDrag.pointerYPx,
          )
        : 0
    rotateSpeed.begin(gizmoDrag.pointerXPx, gizmoDrag.pointerYPx)
    armSpeed.begin(0)
    clearGizmoStall()
    preview.begin(body.id)
  }

  /**
   * One `pointermove` of the drag in progress. Allocates nothing.
   *
   * @param {{ clientX: number, clientY: number, shiftKey?: boolean, pointerType?: string }} event
   * @returns {void}
   */
  function onGizmoHandleMove(event) {
    if (!gizmoDrag.active) return
    const dxPx = event.clientX - gizmoDrag.startXPx
    const dyPx = event.clientY - gizmoDrag.startYPx

    if (gizmoDrag.kind === 'translate') {
      // Arm (`TODO/ui-065`): the pointer's projection on the arm, in px, is both
      // what the speed tracker measures and, scaled, `translateDeltaMm` itself, so
      // the ruler's speed, its distance and the body's move are one reading.
      // Then quantise once in `applyTranslateStep`.
      const mmPerPixel = orbit.getMmPerPixel(deps.heightPx())
      const alongPx = translateDeltaMm(gizmoAnnotation, gizmoDrag.axisIndex, dxPx, dyPx, 1)
      gizmoDrag.moved = true
      gizmoDrag.pointerXPx = event.clientX - viewportRect.left
      gizmoDrag.pointerYPx = event.clientY - viewportRect.top
      gizmoDrag.shift = event.shiftKey === true
      gizmoDrag.mmPerPixel = mmPerPixel
      gizmoDrag.rawMm = alongPx * mmPerPixel
      armSpeed.sample(alongPx)
      refreshArmSpeedStep()
      armGizmoStall()
      applyTranslateStep()
      return
    }

    // Rotate (`TODO/ui-064`): accumulate the unwrapped turn, track speed for
    // touch/pen, then quantise once in `applyRotateStep`.
    const xPx = event.clientX - viewportRect.left
    const yPx = event.clientY - viewportRect.top
    gizmoDrag.moved = true
    gizmoDrag.pointerXPx = xPx
    gizmoDrag.pointerYPx = yPx
    gizmoDrag.shift = event.shiftKey === true
    gizmoDrag.rawTurnDeg = accumulateTurnDeg(
      gizmoDrag.rawTurnDeg,
      gizmoDrag.originXPx,
      gizmoDrag.originYPx,
      gizmoDrag.startXPx - viewportRect.left,
      gizmoDrag.startYPx - viewportRect.top,
      xPx,
      yPx,
      gizmoDrag.facing,
    )
    rotateSpeed.sample(xPx, yPx, gizmoDrag.originXPx, gizmoDrag.originYPx)
    refreshSpeedStep()
    armGizmoStall()
    applyRotateStep()
  }

  /**
   * End the drag: settle the step, drop the preview, and say what to commit.
   *
   * The preview is dropped *before* the caller commits, so the record's baked geometry and
   * the object's own transform are never both applied for a frame — which would show the body
   * at twice the distance it was dragged.
   *
   * @param {{ cancelled: boolean }} event
   * @returns {GizmoCommit | null} `null` for no drag in progress, or a cancelled one.
   */
  function onGizmoHandleUp(event) {
    if (!gizmoDrag.active) return null
    clearGizmoStall()
    // A drag that ends with a pause lands at the fine step it has slowed into,
    // not the coarse one it was in before the pointer stopped (any pointer type).
    if (!event.cancelled && gizmoDrag.kind === 'rotate' && gizmoDrag.moved) {
      refreshSpeedStep()
      applyRotateStep()
    }
    // The same for an arm drag, on every pointer type (`TODO/ui-065`).
    if (!event.cancelled && gizmoDrag.kind === 'translate' && gizmoDrag.moved) {
      refreshArmSpeedStep()
      applyTranslateStep()
    }
    const bodyId = gizmoDrag.bodyId
    const kind = gizmoDrag.kind
    /** @type {[number, number, number]} */
    const translate = [preview.txMm, preview.tyMm, preview.tzMm]
    /** @type {[number, number, number]} */
    const rotate = [preview.rxDeg, preview.ryDeg, preview.rzDeg]

    clearPreviewTransform()
    if (event.cancelled) return null
    return { kind, bodyId, translate, rotate }
  }

  return {
    /** The drag state. Read-only for callers. */
    state: gizmoDrag,
    begin: onGizmoHandleDown,
    move: onGizmoHandleMove,
    end: onGizmoHandleUp,
    shiftKey: onGizmoShiftKey,
    syncDial,
    syncRuler,
    clearStall: clearGizmoStall,
  }
}

/** @typedef {ReturnType<typeof createGizmoDrag>} GizmoDrag */

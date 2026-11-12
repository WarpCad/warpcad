// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The viewport's chrome navigation (`TODO/ui-108`, extraction 5a; the behaviour is `TODO/ui-018`,
 * `ui-019` and the sketch camera lock of `TODO/ui-020`): the direction pad, the zoom buttons, the
 * standard-view snaps, reset, the drag-mode toggle, and the mouse wheel.
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free: the orbit camera, the
 * drag mode (a getter and setter, so the component keeps its ref), whether the sketch editor has
 * the camera locked, the viewport's height, and the frame scheduler are handed in. The pointer
 * drag stays in Viewport.vue, because its mode depends on the press in progress.
 *
 * Nothing here allocates per call beyond the camera's own maths.
 */

/** Degrees of orbit per press of a direction button. */
const ORBIT_STEP_DEG = 15
/** Pixels of pan per press of a direction button. */
const PAN_STEP_PX = 60
/** Multiplier per press of a zoom button. */
const ZOOM_STEP = 1.25

/**
 * @typedef {object} CameraNavigationDeps
 * @property {any} orbit The orbit camera.
 * @property {() => string} getMode The current drag mode, `'orbit'`, `'pan'` or `'select'`.
 * @property {(mode: 'orbit' | 'pan') => void} setMode
 * @property {() => boolean} isSketching True while the sketch editor has the camera locked.
 * @property {() => number} heightPx
 * @property {() => void} scheduleRender
 */

/**
 * @typedef {object} CameraNavigation
 * @property {(direction: string) => void} step The direction pad: pan or orbit by one press.
 * @property {(direction: string) => void} zoom The zoom buttons: `'in'` or `'out'`.
 * @property {(view: string) => void} snapView Snap to a standard view (ignored while sketching).
 * @property {() => void} reset Back to the home view.
 * @property {(mode: 'orbit' | 'pan') => void} setMode The drag-mode toggle (ignored while sketching).
 * @property {(event: WheelEvent) => void} wheel Dolly on the wheel, without scrolling the page.
 */

/**
 * Create the camera navigation controller.
 *
 * @param {CameraNavigationDeps} deps
 * @returns {CameraNavigation}
 */
export function createCameraNavigation(deps) {
  const { orbit } = deps

  return {
    step(direction) {
      // While sketching, the pad pans whatever the drag-mode toggle says: orbit is suspended, and a
      // pad that quietly orbited would break the camera lock the mode is built on.
      if (deps.isSketching() || deps.getMode() === 'pan') {
        const stepMm = PAN_STEP_PX * (orbit.getMmPerPixel(deps.heightPx()) || 1)
        if (direction === 'up') orbit.pan(0, stepMm)
        else if (direction === 'down') orbit.pan(0, -stepMm)
        else if (direction === 'left') orbit.pan(-stepMm, 0)
        else if (direction === 'right') orbit.pan(stepMm, 0)
      } else if (direction === 'up') orbit.orbit(0, ORBIT_STEP_DEG)
      else if (direction === 'down') orbit.orbit(0, -ORBIT_STEP_DEG)
      else if (direction === 'left') orbit.orbit(-ORBIT_STEP_DEG, 0)
      else if (direction === 'right') orbit.orbit(ORBIT_STEP_DEG, 0)
      deps.scheduleRender()
    },

    zoom(direction) {
      orbit.dolly(direction === 'in' ? 1 / ZOOM_STEP : ZOOM_STEP)
      deps.scheduleRender()
    },

    snapView(view) {
      // Unreachable while sketching (the gizmo's buttons are disabled), but guarded here too: snapping
      // to an edge-on view would leave every subsequent drag projecting onto nothing at all.
      if (deps.isSketching()) return
      orbit.snapTo(view)
      deps.scheduleRender()
    },

    reset() {
      orbit.reset()
      deps.scheduleRender()
    },

    setMode(mode) {
      if (deps.isSketching()) return
      deps.setMode(mode)
    },

    wheel(event) {
      event.preventDefault()
      orbit.dolly(Math.exp(event.deltaY * 0.0015))
      deps.scheduleRender()
    },
  }
}

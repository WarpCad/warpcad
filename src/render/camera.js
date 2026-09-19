/**
 * Orbit-camera model — the single source of truth for camera state.
 *
 * Framework-free on purpose: no three.js, no DOM, no Vue. Pointer-drag input and
 * the on-screen navigation chrome both call the *same* functions here, so there
 * is one camera state rather than two parallel input paths (TODO/render-001's
 * Proposed fix, and the direct answer to SECOND-ATTEMPT.md's "clicking dragging
 * in the 3D viewport just rotates the base grid").
 *
 * Conventions, per CLAUDE.md: millimetres, doubles, **Z-up**.
 *
 * Spherical parameterisation, with the camera position on a sphere around a
 * target point:
 *
 *   dir = (cos(el)·cos(az), cos(el)·sin(az), sin(el))
 *   position = target + distance · dir
 *
 * The up vector is d(dir)/d(elevation), which is unit-length and exactly
 * perpendicular to `dir` at every elevation **including the poles** — so a
 * straight-down top view (elevation +90°) is well-defined instead of degenerate.
 * That avoids the usual "world up is parallel to the view direction" gimbal
 * blow-up without needing an epsilon clamp away from ±90°.
 */

const DEG = Math.PI / 180

/** @typedef {{ x: number, y: number, z: number }} Vec3 */

/**
 * @typedef {object} StandardView
 * @property {number} azimuthDeg
 * @property {number} elevationDeg
 */

/**
 * The camera orientations the orientation gizmo snaps to.
 *
 * Z-up sanity checks (easy sign-flip bugs, so they are asserted in the specs):
 * `top` puts the camera on +Z looking straight down the Z axis with +Y up the
 * screen; `front` puts it on −Y looking toward +Y with +X right and +Z up.
 *
 * @type {Readonly<Record<string, StandardView>>}
 */
export const STANDARD_VIEWS = Object.freeze({
  top: { azimuthDeg: -90, elevationDeg: 90 },
  bottom: { azimuthDeg: -90, elevationDeg: -90 },
  front: { azimuthDeg: -90, elevationDeg: 0 },
  back: { azimuthDeg: 90, elevationDeg: 0 },
  right: { azimuthDeg: 0, elevationDeg: 0 },
  left: { azimuthDeg: 180, elevationDeg: 0 },
  // Isometric: equal foreshortening on all three axes (atan(1/√2) ≈ 35.264°).
  home: { azimuthDeg: -45, elevationDeg: 35.264389682754654 },
})

export const MIN_DISTANCE_MM = 5
export const MAX_DISTANCE_MM = 100000
/** Breathing room around framed content: 1.25× the exact fit. */
const FRAME_MARGIN = 1.25
export const MIN_ELEVATION_DEG = -90
export const MAX_ELEVATION_DEG = 90

/**
 * Wrap an angle into (-180, 180] so azimuth never grows without bound.
 * @param {number} deg
 * @returns {number}
 */
export function wrapDegrees(deg) {
  let wrapped = ((deg + 180) % 360 + 360) % 360 - 180
  // ((-180 % 360) + 360) % 360 - 180 === -180; normalise that to +180 so the
  // range is half-open at one end only.
  if (wrapped === -180) wrapped = 180
  return wrapped
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value
}

/**
 * Camera position for a spherical orientation, written into `out`.
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @param {number} distanceMm
 * @param {Vec3} target
 * @param {Vec3} out mutated in place — no allocation, per CLAUDE.md's Performance rule
 * @returns {Vec3} `out`
 */
export function positionFromSpherical(azimuthDeg, elevationDeg, distanceMm, target, out) {
  const az = azimuthDeg * DEG
  const el = elevationDeg * DEG
  const cosEl = Math.cos(el)
  out.x = target.x + distanceMm * cosEl * Math.cos(az)
  out.y = target.y + distanceMm * cosEl * Math.sin(az)
  out.z = target.z + distanceMm * Math.sin(el)
  return out
}

/**
 * Camera up vector — d(direction)/d(elevation). Unit length and perpendicular to
 * the view direction at every elevation, poles included.
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @param {Vec3} out mutated in place
 * @returns {Vec3} `out`
 */
export function upFromSpherical(azimuthDeg, elevationDeg, out) {
  const az = azimuthDeg * DEG
  const el = elevationDeg * DEG
  const sinEl = Math.sin(el)
  out.x = -sinEl * Math.cos(az)
  out.y = -sinEl * Math.sin(az)
  out.z = Math.cos(el)
  return out
}

/**
 * Screen-right vector (forward × up, with forward pointing camera → target).
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @param {Vec3} out mutated in place
 * @returns {Vec3} `out`
 */
export function rightFromSpherical(azimuthDeg, elevationDeg, out) {
  // forward = -dir, up = d(dir)/d(el); the cross product simplifies to a pure
  // horizontal vector that depends on azimuth alone.
  const az = azimuthDeg * DEG
  out.x = -Math.sin(az)
  out.y = Math.cos(az)
  out.z = 0
  return out
}

/**
 * World millimetres covered by one screen pixel, measured on the plane through
 * the camera target (perspective projection).
 * @param {number} distanceMm camera-to-target distance
 * @param {number} fovDeg vertical field of view
 * @param {number} viewportHeightPx
 * @returns {number} mm per pixel, or 0 for a zero-height viewport
 */
export function mmPerPixel(distanceMm, fovDeg, viewportHeightPx) {
  if (viewportHeightPx <= 0) return 0
  return (2 * distanceMm * Math.tan((fovDeg * DEG) / 2)) / viewportHeightPx
}

const NICE_STEPS = [1, 2, 5]

/**
 * Pick a round real-world length for the on-screen scale bar — the largest
 * 1/2/5×10ⁿ mm value whose bar is no wider than `maxPx`.
 *
 * This is what makes the grid's dimensions readable without opening an
 * inspector, per CLAUDE.md's grid rule.
 *
 * @param {number} mmPerPx
 * @param {number} maxPx widest the bar may be drawn
 * @returns {{ lengthMm: number, lengthPx: number, label: string }}
 */
export function chooseScaleBar(mmPerPx, maxPx) {
  if (!(mmPerPx > 0) || !(maxPx > 0)) return { lengthMm: 0, lengthPx: 0, label: '—' }
  const maxMm = mmPerPx * maxPx
  const decade = Math.floor(Math.log10(maxMm))
  let lengthMm = NICE_STEPS[0] * 10 ** decade
  for (let d = decade - 1; d <= decade + 1; d += 1) {
    for (const step of NICE_STEPS) {
      const candidate = step * 10 ** d
      if (candidate <= maxMm && candidate > lengthMm) lengthMm = candidate
    }
  }
  return {
    lengthMm,
    lengthPx: lengthMm / mmPerPx,
    label: lengthMm >= 1000 ? `${lengthMm / 1000} m` : `${Number(lengthMm.toFixed(3))} mm`,
  }
}

/**
 * @typedef {object} OrbitCameraState
 * @property {number} azimuthDeg
 * @property {number} elevationDeg
 * @property {number} distanceMm
 * @property {Vec3} target
 */

/**
 * @typedef {object} OrbitCamera
 * @property {OrbitCameraState} state live, plain (non-reactive) state
 * @property {number} version bumps on every change — a render-loop dirty flag
 * @property {number} fovDeg
 * @property {(deltaAzimuthDeg: number, deltaElevationDeg: number) => void} orbit
 * @property {(dxPx: number, dyPx: number, viewportHeightPx: number) => void} panByPixels
 * @property {(rightMm: number, upMm: number) => void} pan
 * @property {(factor: number) => void} dolly
 * @property {(view: string) => boolean} snapTo
 * @property {() => void} reset
 * @property {(min: readonly number[], max: readonly number[], aspect?: number) => void} frameBounds
 * @property {(out: Vec3) => Vec3} getPosition
 * @property {(out: Vec3) => Vec3} getUp
 * @property {(viewportHeightPx: number) => number} getMmPerPixel
 */

/**
 * Create the camera model.
 *
 * @param {object} [options]
 * @param {number} [options.azimuthDeg]
 * @param {number} [options.elevationDeg]
 * @param {number} [options.distanceMm]
 * @param {Vec3} [options.target]
 * @param {number} [options.fovDeg]
 * @returns {OrbitCamera}
 */
export function createOrbitCamera(options = {}) {
  const initial = {
    azimuthDeg: options.azimuthDeg ?? STANDARD_VIEWS.home.azimuthDeg,
    elevationDeg: options.elevationDeg ?? STANDARD_VIEWS.home.elevationDeg,
    distanceMm: options.distanceMm ?? 420,
    target: {
      x: options.target?.x ?? 0,
      y: options.target?.y ?? 0,
      z: options.target?.z ?? 0,
    },
  }

  /** @type {OrbitCameraState} */
  const state = {
    azimuthDeg: initial.azimuthDeg,
    elevationDeg: initial.elevationDeg,
    distanceMm: initial.distanceMm,
    target: { ...initial.target },
  }

  // Pre-allocated scratch vectors: `pan` runs on every pointermove, and
  // CLAUDE.md's Performance section forbids per-frame allocation in the pointer
  // path.
  const scratchRight = { x: 0, y: 0, z: 0 }
  const scratchUp = { x: 0, y: 0, z: 0 }

  /** @type {OrbitCamera} */
  const camera = {
    state,
    version: 0,
    fovDeg: options.fovDeg ?? 45,

    orbit(deltaAzimuthDeg, deltaElevationDeg) {
      if (deltaAzimuthDeg === 0 && deltaElevationDeg === 0) return
      state.azimuthDeg = wrapDegrees(state.azimuthDeg + deltaAzimuthDeg)
      state.elevationDeg = clamp(
        state.elevationDeg + deltaElevationDeg,
        MIN_ELEVATION_DEG,
        MAX_ELEVATION_DEG,
      )
      camera.version += 1
    },

    pan(rightMm, upMm) {
      if (rightMm === 0 && upMm === 0) return
      rightFromSpherical(state.azimuthDeg, state.elevationDeg, scratchRight)
      upFromSpherical(state.azimuthDeg, state.elevationDeg, scratchUp)
      state.target.x += scratchRight.x * rightMm + scratchUp.x * upMm
      state.target.y += scratchRight.y * rightMm + scratchUp.y * upMm
      state.target.z += scratchRight.z * rightMm + scratchUp.z * upMm
      camera.version += 1
    },

    panByPixels(dxPx, dyPx, viewportHeightPx) {
      const scale = mmPerPixel(state.distanceMm, camera.fovDeg, viewportHeightPx)
      if (scale === 0) return
      // Dragging the pointer right pushes the scene right, so the camera target
      // travels left; dragging down (dy > 0 in screen space) pushes the scene
      // down, so the target travels up.
      camera.pan(-dxPx * scale, dyPx * scale)
    },

    dolly(factor) {
      if (!(factor > 0) || factor === 1) return
      const next = clamp(state.distanceMm * factor, MIN_DISTANCE_MM, MAX_DISTANCE_MM)
      if (next === state.distanceMm) return
      state.distanceMm = next
      camera.version += 1
    },

    snapTo(view) {
      const preset = STANDARD_VIEWS[view]
      if (!preset) return false
      state.azimuthDeg = preset.azimuthDeg
      state.elevationDeg = preset.elevationDeg
      camera.version += 1
      return true
    },

    frameBounds(min, max, aspect = 1) {
      if (![...min, ...max].every(Number.isFinite)) return
      const cx = (min[0] + max[0]) / 2
      const cy = (min[1] + max[1]) / 2
      const cz = (min[2] + max[2]) / 2
      const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2
      // The bounding *sphere* fits whatever orientation the camera is in, so the
      // framing does not change under the user when they orbit. The narrower of the
      // two fields of view decides: on a portrait phone that is the horizontal one.
      const halfV = (camera.fovDeg * DEG) / 2
      const halfH = Math.atan(Math.tan(halfV) * (aspect > 0 ? aspect : 1))
      const fit = Math.min(halfV, halfH)
      state.target.x = cx
      state.target.y = cy
      state.target.z = cz
      state.distanceMm = clamp((radius / Math.sin(fit)) * FRAME_MARGIN, MIN_DISTANCE_MM, MAX_DISTANCE_MM)
      camera.version += 1
    },

    reset() {
      state.azimuthDeg = initial.azimuthDeg
      state.elevationDeg = initial.elevationDeg
      state.distanceMm = initial.distanceMm
      state.target.x = initial.target.x
      state.target.y = initial.target.y
      state.target.z = initial.target.z
      camera.version += 1
    },

    getPosition(out) {
      return positionFromSpherical(
        state.azimuthDeg,
        state.elevationDeg,
        state.distanceMm,
        state.target,
        out,
      )
    },

    getUp(out) {
      return upFromSpherical(state.azimuthDeg, state.elevationDeg, out)
    },

    getMmPerPixel(viewportHeightPx) {
      return mmPerPixel(state.distanceMm, camera.fovDeg, viewportHeightPx)
    },
  }

  return camera
}

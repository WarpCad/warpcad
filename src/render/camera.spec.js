import { describe, it, expect } from 'vitest'
import {
  createOrbitCamera,
  chooseScaleBar,
  clamp,
  mmPerPixel,
  positionFromSpherical,
  rightFromSpherical,
  upFromSpherical,
  wrapDegrees,
  STANDARD_VIEWS,
  MIN_DISTANCE_MM,
  MAX_DISTANCE_MM,
} from './camera.js'

const v = () => ({ x: 0, y: 0, z: 0 })

/**
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 */
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

describe('spherical → camera basis (Z-up)', () => {
  it('places the top view straight up the Z axis, looking down it', () => {
    const { azimuthDeg, elevationDeg } = STANDARD_VIEWS.top
    const pos = positionFromSpherical(azimuthDeg, elevationDeg, 100, { x: 0, y: 0, z: 0 }, v())
    expect(pos.x).toBeCloseTo(0, 9)
    expect(pos.y).toBeCloseTo(0, 9)
    expect(pos.z).toBeCloseTo(100, 9)
  })

  it('keeps the top view non-degenerate: up is perpendicular to the view direction at the pole', () => {
    const { azimuthDeg, elevationDeg } = STANDARD_VIEWS.top
    const pos = positionFromSpherical(azimuthDeg, elevationDeg, 100, { x: 0, y: 0, z: 0 }, v())
    const up = upFromSpherical(azimuthDeg, elevationDeg, v())
    // A naive world-up of (0,0,1) would be parallel to `pos` here — the classic
    // gimbal blow-up this parameterisation exists to avoid.
    expect(dot(pos, up)).toBeCloseTo(0, 9)
    expect(Math.hypot(up.x, up.y, up.z)).toBeCloseTo(1, 12)
    // +Y is up the screen in a standard top view.
    expect(up.x).toBeCloseTo(0, 9)
    expect(up.y).toBeCloseTo(1, 9)
    expect(up.z).toBeCloseTo(0, 9)
  })

  it('orients the front view with +X right and +Z up, camera on −Y', () => {
    const { azimuthDeg, elevationDeg } = STANDARD_VIEWS.front
    const pos = positionFromSpherical(azimuthDeg, elevationDeg, 250, { x: 0, y: 0, z: 0 }, v())
    expect(pos.y).toBeCloseTo(-250, 9)
    expect(pos.x).toBeCloseTo(0, 9)
    expect(pos.z).toBeCloseTo(0, 9)

    const up = upFromSpherical(azimuthDeg, elevationDeg, v())
    expect(up.z).toBeCloseTo(1, 9)

    const right = rightFromSpherical(azimuthDeg, elevationDeg, v())
    expect(right.x).toBeCloseTo(1, 9)
    expect(right.y).toBeCloseTo(0, 9)
  })

  it('orients the right view looking down −X with +Y right', () => {
    const { azimuthDeg, elevationDeg } = STANDARD_VIEWS.right
    const pos = positionFromSpherical(azimuthDeg, elevationDeg, 10, { x: 0, y: 0, z: 0 }, v())
    expect(pos.x).toBeCloseTo(10, 9)
    const right = rightFromSpherical(azimuthDeg, elevationDeg, v())
    expect(right.y).toBeCloseTo(1, 9)
  })

  it('keeps the basis orthonormal at every standard view, poles included', () => {
    for (const [name, view] of Object.entries(STANDARD_VIEWS)) {
      const dir = positionFromSpherical(view.azimuthDeg, view.elevationDeg, 1, { x: 0, y: 0, z: 0 }, v())
      const up = upFromSpherical(view.azimuthDeg, view.elevationDeg, v())
      const right = rightFromSpherical(view.azimuthDeg, view.elevationDeg, v())
      expect(Math.hypot(dir.x, dir.y, dir.z), name).toBeCloseTo(1, 12)
      expect(dot(dir, up), name).toBeCloseTo(0, 12)
      expect(dot(dir, right), name).toBeCloseTo(0, 12)
      expect(dot(up, right), name).toBeCloseTo(0, 12)
    }
  })

  it('offsets from the target rather than from the world origin', () => {
    const pos = positionFromSpherical(0, 0, 5, { x: 100, y: -20, z: 7 }, v())
    expect(pos.x).toBeCloseTo(105, 9)
    expect(pos.y).toBeCloseTo(-20, 9)
    expect(pos.z).toBeCloseTo(7, 9)
  })
})

describe('angle helpers', () => {
  it('wraps azimuth into (-180, 180]', () => {
    expect(wrapDegrees(0)).toBe(0)
    expect(wrapDegrees(370)).toBeCloseTo(10, 12)
    expect(wrapDegrees(-370)).toBeCloseTo(-10, 12)
    expect(wrapDegrees(180)).toBe(180)
    expect(wrapDegrees(-180)).toBe(180)
    expect(wrapDegrees(540)).toBe(180)
  })

  it('clamps at both ends and passes through the middle', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe('createOrbitCamera', () => {
  it('starts at the isometric home view', () => {
    const camera = createOrbitCamera()
    expect(camera.state.azimuthDeg).toBeCloseTo(STANDARD_VIEWS.home.azimuthDeg, 9)
    expect(camera.state.elevationDeg).toBeCloseTo(STANDARD_VIEWS.home.elevationDeg, 9)
    expect(camera.version).toBe(0)
  })

  it('orbits, wrapping azimuth and clamping elevation to the poles', () => {
    const camera = createOrbitCamera({ azimuthDeg: 170, elevationDeg: 80 })
    camera.orbit(30, 40)
    expect(camera.state.azimuthDeg).toBeCloseTo(-160, 9)
    expect(camera.state.elevationDeg).toBe(90)
    camera.orbit(0, -300)
    expect(camera.state.elevationDeg).toBe(-90)
  })

  it('does not bump the version for a zero-length drag', () => {
    const camera = createOrbitCamera()
    camera.orbit(0, 0)
    camera.pan(0, 0)
    camera.dolly(1)
    expect(camera.version).toBe(0)
  })

  it('clamps dolly distance at both limits', () => {
    const camera = createOrbitCamera({ distanceMm: 400 })
    camera.dolly(0.5)
    expect(camera.state.distanceMm).toBeCloseTo(200, 9)
    for (let i = 0; i < 50; i += 1) camera.dolly(0.5)
    expect(camera.state.distanceMm).toBe(MIN_DISTANCE_MM)
    for (let i = 0; i < 100; i += 1) camera.dolly(2)
    expect(camera.state.distanceMm).toBe(MAX_DISTANCE_MM)
  })

  it('ignores a non-positive dolly factor rather than inverting the camera', () => {
    const camera = createOrbitCamera({ distanceMm: 400 })
    camera.dolly(0)
    camera.dolly(-2)
    camera.dolly(Number.NaN)
    expect(camera.state.distanceMm).toBe(400)
    expect(camera.version).toBe(0)
  })

  it('pans the target in the camera plane, never along the view direction', () => {
    const camera = createOrbitCamera({ azimuthDeg: -45, elevationDeg: 30, distanceMm: 300 })
    const before = camera.getPosition(v())
    const dir = { x: before.x, y: before.y, z: before.z }
    camera.pan(25, -10)
    const moved = {
      x: camera.state.target.x,
      y: camera.state.target.y,
      z: camera.state.target.z,
    }
    // Movement is perpendicular to the view direction: the camera-to-target
    // distance is unchanged.
    expect(dot(moved, dir) / Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(0, 9)
    expect(Math.hypot(moved.x, moved.y, moved.z)).toBeCloseTo(Math.hypot(25, 10), 9)
    expect(camera.state.distanceMm).toBe(300)
  })

  it('pans by pixels in the direction the pointer travelled', () => {
    // Front view: screen-right is +X, screen-up is +Z.
    const camera = createOrbitCamera({ ...STANDARD_VIEWS.front, distanceMm: 300 })
    const scale = camera.getMmPerPixel(600)
    camera.panByPixels(10, 0, 600)
    // Dragging right pushes the scene right, so the target travels −X.
    expect(camera.state.target.x).toBeCloseTo(-10 * scale, 9)
    camera.panByPixels(0, 10, 600)
    // Dragging down pushes the scene down, so the target travels +Z.
    expect(camera.state.target.z).toBeCloseTo(10 * scale, 9)
  })

  it('ignores a pan against a zero-height viewport', () => {
    const camera = createOrbitCamera()
    camera.panByPixels(100, 100, 0)
    expect(camera.version).toBe(0)
    expect(camera.state.target.x).toBe(0)
  })

  it('snaps to each named standard view and rejects unknown names', () => {
    const camera = createOrbitCamera()
    expect(camera.snapTo('top')).toBe(true)
    expect(camera.state.elevationDeg).toBe(90)
    expect(camera.snapTo('nonsense')).toBe(false)
    expect(camera.state.elevationDeg).toBe(90)
  })

  it('keeps the pan target when snapping, and restores everything on reset', () => {
    const camera = createOrbitCamera({ distanceMm: 400 })
    camera.pan(50, 50)
    camera.dolly(2)
    camera.snapTo('front')
    expect(camera.state.target.x).not.toBe(0)
    camera.reset()
    expect(camera.state.target).toEqual({ x: 0, y: 0, z: 0 })
    expect(camera.state.distanceMm).toBe(400)
    expect(camera.state.azimuthDeg).toBeCloseTo(STANDARD_VIEWS.home.azimuthDeg, 9)
  })

  it('writes into caller-supplied vectors so the render loop allocates nothing', () => {
    const camera = createOrbitCamera()
    const out = v()
    expect(camera.getPosition(out)).toBe(out)
    expect(camera.getUp(out)).toBe(out)
  })
})

describe('mmPerPixel / chooseScaleBar', () => {
  it('scales linearly with distance and inversely with viewport height', () => {
    const a = mmPerPixel(100, 45, 500)
    expect(a).toBeCloseTo((2 * 100 * Math.tan((45 * Math.PI) / 360)) / 500, 12)
    expect(mmPerPixel(200, 45, 500)).toBeCloseTo(a * 2, 12)
    expect(mmPerPixel(100, 45, 1000)).toBeCloseTo(a / 2, 12)
  })

  it('returns 0 for a zero-height viewport instead of dividing by zero', () => {
    expect(mmPerPixel(100, 45, 0)).toBe(0)
    expect(Number.isFinite(mmPerPixel(100, 45, 0))).toBe(true)
  })

  it('picks a round 1/2/5×10ⁿ length that fits the bar', () => {
    // 1 mm per pixel, 120px max → 100mm is the largest round value that fits.
    expect(chooseScaleBar(1, 120)).toMatchObject({ lengthMm: 100, label: '100 mm' })
    expect(chooseScaleBar(1, 250).lengthMm).toBe(200)
    expect(chooseScaleBar(1, 600).lengthMm).toBe(500)
    expect(chooseScaleBar(0.1, 120).lengthMm).toBe(10)
    expect(chooseScaleBar(10, 120).lengthMm).toBe(1000)
  })

  it('never draws a bar wider than the allowance', () => {
    for (const mmPerPx of [0.001, 0.017, 0.5, 3.3, 42, 900]) {
      const bar = chooseScaleBar(mmPerPx, 120)
      expect(bar.lengthPx, `${mmPerPx} mm/px`).toBeLessThanOrEqual(120)
      expect(bar.lengthPx, `${mmPerPx} mm/px`).toBeGreaterThan(0)
    }
  })

  it('switches the label to metres past 1000mm', () => {
    expect(chooseScaleBar(10, 120).label).toBe('1 m')
    expect(chooseScaleBar(100, 120).label).toBe('10 m')
  })

  it('degrades to a placeholder rather than NaN for a degenerate viewport', () => {
    expect(chooseScaleBar(0, 120)).toMatchObject({ lengthMm: 0, label: '—' })
    expect(chooseScaleBar(1, 0)).toMatchObject({ lengthMm: 0, label: '—' })
  })
})

describe('frameBounds — frame loaded content (TODO/io-001)', () => {
  it('targets the centre of the box and keeps the current orientation', () => {
    const camera = createOrbitCamera({ azimuthDeg: 30, elevationDeg: 20 })
    camera.frameBounds([100, 200, 0], [140, 260, 10])
    expect(camera.state.target).toEqual({ x: 120, y: 230, z: 5 })
    expect(camera.state.azimuthDeg).toBe(30)
    expect(camera.state.elevationDeg).toBe(20)
  })

  it('backs off far enough that the whole bounding sphere fits the field of view, with margin', () => {
    const camera = createOrbitCamera()
    camera.frameBounds([-50, -50, -50], [50, 50, 50])
    const radius = Math.sqrt(3) * 50
    const needed = radius / Math.sin((camera.fovDeg * Math.PI) / 360)
    expect(camera.state.distanceMm).toBeGreaterThan(needed)
    expect(camera.state.distanceMm).toBeLessThan(needed * 1.6)
  })

  it('backs off further for a portrait viewport, where the horizontal field of view is the narrow one', () => {
    const wide = createOrbitCamera()
    const tall = createOrbitCamera()
    wide.frameBounds([-50, -50, 0], [50, 50, 10], 1.6)
    tall.frameBounds([-50, -50, 0], [50, 50, 10], 390 / 700)
    expect(tall.state.distanceMm).toBeGreaterThan(wide.state.distanceMm)
  })

  it('never zooms in past the minimum distance for a tiny or degenerate box', () => {
    const camera = createOrbitCamera()
    camera.frameBounds([1, 1, 1], [1, 1, 1])
    expect(camera.state.distanceMm).toBeGreaterThanOrEqual(MIN_DISTANCE_MM)
    expect(camera.state.target).toEqual({ x: 1, y: 1, z: 1 })
  })

  it('clamps at the maximum distance for an enormous box', () => {
    const camera = createOrbitCamera()
    camera.frameBounds([0, 0, 0], [1e9, 1e9, 1e9])
    expect(camera.state.distanceMm).toBe(MAX_DISTANCE_MM)
  })

  it('ignores non-finite bounds rather than sending the camera to NaN', () => {
    const camera = createOrbitCamera()
    const before = { ...camera.state, target: { ...camera.state.target } }
    camera.frameBounds([NaN, 0, 0], [1, 1, 1])
    expect(camera.state).toEqual(before)
  })

  it('bumps the version so the render loop redraws', () => {
    const camera = createOrbitCamera()
    camera.frameBounds([0, 0, 0], [10, 10, 10])
    expect(camera.version).toBe(1)
  })
})

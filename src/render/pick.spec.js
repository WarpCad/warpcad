import { describe, expect, it } from 'vitest'

import { createOrbitCamera, STANDARD_VIEWS } from './camera.js'
import { PICK_OFFSETS_PX, nearestOnPlane, ndcFromClient, projectToWorkingPlane } from './pick.js'

/** @param {Record<string, any>} [options] */
function camera(options = {}) {
  return createOrbitCamera({ distanceMm: 400, ...options })
}

const out = { x: 0, y: 0, z: 0 }

describe('ndcFromClient', () => {
  const rect = { left: 100, top: 50, width: 800, height: 400 }

  it('maps the centre of the rect to the origin of NDC', () => {
    const ndc = ndcFromClient(500, 250, rect, { x: 0, y: 0 })
    expect(ndc.x).toBeCloseTo(0, 12)
    expect(ndc.y).toBeCloseTo(0, 12)
  })

  it('maps the corners to ±1, with screen-down becoming NDC-negative', () => {
    expect(ndcFromClient(100, 50, rect, { x: 0, y: 0 })).toEqual({ x: -1, y: 1 })
    expect(ndcFromClient(900, 450, rect, { x: 0, y: 0 })).toEqual({ x: 1, y: -1 })
  })

  it('reports positions outside the rect as out-of-range rather than clamping', () => {
    const ndc = ndcFromClient(1000, 250, rect, { x: 0, y: 0 })
    expect(ndc.x).toBeGreaterThan(1)
  })

  it('survives a zero-sized rect without dividing by zero', () => {
    const ndc = ndcFromClient(10, 10, { left: 0, top: 0, width: 0, height: 0 }, { x: 0, y: 0 })
    expect(Number.isFinite(ndc.x)).toBe(true)
    expect(Number.isFinite(ndc.y)).toBe(true)
  })
})

describe('projectToWorkingPlane — screen point to a millimetre point on Z=0', () => {
  it('puts the centre of the screen on the camera target', () => {
    const orbit = camera()
    const hit = projectToWorkingPlane(orbit, 0, 0, 16 / 9, out)
    expect(hit).toBe(out)
    expect(out.x).toBeCloseTo(0, 6)
    expect(out.y).toBeCloseTo(0, 6)
    expect(out.z).toBeCloseTo(0, 12)
  })

  it('always lands exactly on the working plane, whatever the pointer position', () => {
    const orbit = camera()
    for (const [nx, ny] of [
      [0.5, 0.5],
      [-0.9, 0.2],
      [0.1, -0.75],
    ]) {
      expect(projectToWorkingPlane(orbit, nx, ny, 1.6, out)).toBe(out)
      expect(out.z).toBeCloseTo(0, 12)
    }
  })

  it('walks the hit along screen-right and screen-up, in world millimetres', () => {
    // Default (isometric "home") view: azimuth −45°, so screen-right is the
    // +X+Y diagonal and screen-up walks the hit away from the camera, into −X+Y.
    const orbit = camera()
    const left = { x: 0, y: 0, z: 0 }
    const right = { x: 0, y: 0, z: 0 }
    projectToWorkingPlane(orbit, -0.4, 0, 1, left)
    projectToWorkingPlane(orbit, 0.4, 0, 1, right)
    expect(right.x).toBeGreaterThan(left.x)
    expect(right.y).toBeGreaterThan(left.y)

    const near = { x: 0, y: 0, z: 0 }
    const far = { x: 0, y: 0, z: 0 }
    projectToWorkingPlane(orbit, 0, -0.3, 1, near)
    projectToWorkingPlane(orbit, 0, 0.3, 1, far)
    expect(far.x).toBeLessThan(near.x)
    expect(far.y).toBeGreaterThan(near.y)
  })

  it('scales with distance: zooming out spreads the same pointer travel over more mm', () => {
    const near = createOrbitCamera({ distanceMm: 100 })
    const far = createOrbitCamera({ distanceMm: 1000 })
    const a = { x: 0, y: 0, z: 0 }
    const b = { x: 0, y: 0, z: 0 }
    projectToWorkingPlane(near, 0.5, 0, 1, a)
    projectToWorkingPlane(far, 0.5, 0, 1, b)
    expect(Math.hypot(b.x, b.y)).toBeGreaterThan(Math.hypot(a.x, a.y) * 5)
  })

  it('is exact from directly overhead', () => {
    const orbit = createOrbitCamera({ ...STANDARD_VIEWS.top, distanceMm: 400, fovDeg: 90 })
    // tan(45°) === 1, so at NDC 1 the ray covers exactly `distance` mm of plane.
    projectToWorkingPlane(orbit, 1, 0, 1, out)
    expect(out.x).toBeCloseTo(400, 6)
    expect(out.y).toBeCloseTo(0, 6)
    expect(out.z).toBeCloseTo(0, 12)
  })

  it('follows the camera target when the view is panned', () => {
    const orbit = camera()
    orbit.snapTo('top')
    orbit.pan(50, 0)
    projectToWorkingPlane(orbit, 0, 0, 1, out)
    expect(out.x).toBeCloseTo(orbit.state.target.x, 6)
    expect(out.y).toBeCloseTo(orbit.state.target.y, 6)
  })

  it('returns null when the ray never reaches the plane, instead of an infinity', () => {
    // Dead-level camera sitting on the plane itself: the view ray is parallel to Z=0.
    const parallel = createOrbitCamera({ elevationDeg: 0, azimuthDeg: 0, distanceMm: 400 })
    expect(projectToWorkingPlane(parallel, 0, 0, 1, out)).toBeNull()

    // Camera above the plane, tilted to look up and away from it: the plane is
    // behind the viewer, and a negative ray parameter is not a drop position.
    const lookingUp = createOrbitCamera({
      elevationDeg: -45,
      distanceMm: 400,
      target: { x: 0, y: 0, z: 500 },
    })
    expect(projectToWorkingPlane(lookingUp, 0, 0, 1, out)).toBeNull()
  })

  it('writes into the vector it is handed rather than allocating a new one', () => {
    const orbit = camera()
    const target = { x: 1, y: 2, z: 3 }
    expect(projectToWorkingPlane(orbit, 0.25, 0.25, 1.5, target)).toBe(target)
  })
})

describe('nearestOnPlane — which existing item a placement drag snaps against', () => {
  /**
   * @param {number[][]} centroids
   * @returns {{ centroidMm: readonly number[] }[]}
   */
  const items = (centroids) => centroids.map((centroidMm) => ({ centroidMm }))

  it('has nothing to snap to in an empty scene', () => {
    // TODO/ui-013's precondition, stated rather than left implicit: with zero
    // existing items a drag behaves exactly as `ui-010` already built it — no
    // guides, no snap, no "nearest" item to invent.
    expect(nearestOnPlane([], 0, 0)).toBe(-1)
  })

  it('picks the closest centroid, measured in the working plane', () => {
    const scene = items([
      [200, 0, 20],
      [30, 40, 20],
      [-500, -500, 20],
    ])
    expect(nearestOnPlane(scene, 0, 0)).toBe(1)
    expect(nearestOnPlane(scene, 190, 5, )).toBe(0)
    expect(nearestOnPlane(scene, -480, -520)).toBe(2)
  })

  it('ignores height: a tall body is not further away for being tall', () => {
    // The distance is deliberately the *working-plane* (world XY) one, not a 3D
    // one and not a screen-space one — a drag places on the plane, so how tall
    // a candidate happens to be says nothing about how near the drop is to it.
    const scene = items([
      [10, 0, 2000],
      [80, 0, 5],
    ])
    expect(nearestOnPlane(scene, 0, 0)).toBe(0)
  })

  it('breaks an exact tie toward the first item, deterministically', () => {
    const scene = items([
      [10, 0, 20],
      [-10, 0, 20],
    ])
    expect(nearestOnPlane(scene, 0, 0)).toBe(0)
  })
})

describe('PICK_OFFSETS_PX (a ray that falls through a shared triangle edge, TODO/core-035)', () => {
  it('tries the exact point first, so every hit that already worked is unchanged', () => {
    expect(PICK_OFFSETS_PX[0]).toEqual([0, 0])
  })

  it('then a quarter pixel each way — never far enough to pick something a user did not tap', () => {
    const rest = PICK_OFFSETS_PX.slice(1)
    expect(rest).toHaveLength(4)
    for (const [dx, dy] of rest) expect(Math.hypot(dx, dy)).toBeCloseTo(0.25, 12)
    expect(new Set(rest.map((offset) => offset.join(','))).size).toBe(4)
  })
})

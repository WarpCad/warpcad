import { describe, expect, it } from 'vitest'

import { createOrbitCamera } from './camera.js'
import { projectToWorkingPlane } from './pick.js'
import {
  RING_SEGMENTS,
  createDimensionAnnotation,
  createGizmoAnnotation,
  createRingPoints,
  createScreenPoint,
  ringPoints,
  updateDimensionAnnotation,
  updateGizmoAnnotation,
  worldToScreen,
} from './annotate.js'

/**
 * The selection overlay's maths (TODO/ui-011).
 *
 * All of it lives here rather than in `DimensionLines.vue`/`Gizmo.vue` because
 * CLAUDE.md is explicit that "geometry logic belongs in `src/core/`, not in
 * components" and that "a component doing coordinate math beyond laying out its
 * own pixels is a bug waiting to happen". `src/render/` is the framework-free
 * half of that rule for render-space maths, exactly like `camera.js` and
 * `pick.js` already are — so every number an overlay draws is asserted here, in
 * plain Node, with no GPU and no DOM.
 *
 * Numerical assertions carry an explicit tolerance and the degenerate cases are
 * covered (a zero-size box, an axis seen exactly end-on, a point behind the
 * camera), per CLAUDE.md's "numerical code needs numerical tests".
 */

const WIDTH_PX = 800
const HEIGHT_PX = 600

/**
 * @param {object} [options]
 * @returns {import('./camera.js').OrbitCamera}
 */
function cameraAt(options = {}) {
  return createOrbitCamera({ distanceMm: 420, ...options })
}

describe('worldToScreen', () => {
  it('puts the camera target dead centre of the viewport', () => {
    const orbit = cameraAt()
    const out = createScreenPoint()
    worldToScreen(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, out)

    expect(out.visible).toBe(true)
    expect(out.x).toBeCloseTo(WIDTH_PX / 2, 6)
    expect(out.y).toBeCloseTo(HEIGHT_PX / 2, 6)
    // Depth is the distance along the view direction — the orbit radius, here.
    expect(out.depth).toBeCloseTo(420, 6)
  })

  it('is the exact inverse of pick.js projectToWorkingPlane', () => {
    // The two directions must not drift: the ghost preview is positioned by
    // `projectToWorkingPlane` and the dimension lines are drawn by this, so a
    // sign flip in either would show up as an overlay that misses its own solid.
    const orbit = cameraAt({ azimuthDeg: 24, elevationDeg: 31, distanceMm: 260 })
    const aspect = WIDTH_PX / HEIGHT_PX
    const world = { x: 0, y: 0, z: 0 }
    const screen = createScreenPoint()

    for (const [ndcX, ndcY] of [
      [0, 0],
      [0.5, 0.25],
      [-0.8, 0.6],
      [0.33, -0.71],
    ]) {
      const hit = projectToWorkingPlane(orbit, ndcX, ndcY, aspect, world)
      expect(hit).not.toBeNull()
      worldToScreen(orbit, world.x, world.y, world.z, WIDTH_PX, HEIGHT_PX, screen)
      expect(screen.x).toBeCloseTo(((ndcX + 1) / 2) * WIDTH_PX, 6)
      expect(screen.y).toBeCloseTo(((1 - ndcY) / 2) * HEIGHT_PX, 6)
    }
  })

  it('maps +X right and +Z up the screen from the front view (Z-up convention)', () => {
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 0 })
    const centre = createScreenPoint()
    const right = createScreenPoint()
    const above = createScreenPoint()
    worldToScreen(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, centre)
    worldToScreen(orbit, 50, 0, 0, WIDTH_PX, HEIGHT_PX, right)
    worldToScreen(orbit, 0, 0, 50, WIDTH_PX, HEIGHT_PX, above)

    expect(right.x).toBeGreaterThan(centre.x)
    expect(right.y).toBeCloseTo(centre.y, 6)
    // SVG/screen Y grows downward, so "up" is a *smaller* y.
    expect(above.y).toBeLessThan(centre.y)
    expect(above.x).toBeCloseTo(centre.x, 6)
  })

  it('maps +X right and +Y up the screen from the top view', () => {
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 90 })
    const centre = createScreenPoint()
    const east = createScreenPoint()
    const north = createScreenPoint()
    worldToScreen(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, centre)
    worldToScreen(orbit, 50, 0, 0, WIDTH_PX, HEIGHT_PX, east)
    worldToScreen(orbit, 0, 50, 0, WIDTH_PX, HEIGHT_PX, north)

    expect(east.x).toBeGreaterThan(centre.x)
    expect(north.y).toBeLessThan(centre.y)
  })

  it('foreshortens with distance — a further point sits nearer the centre', () => {
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 0 })
    const near = createScreenPoint()
    const far = createScreenPoint()
    // -Y is toward the camera at azimuth -90, +Y is away from it.
    worldToScreen(orbit, 40, -100, 0, WIDTH_PX, HEIGHT_PX, near)
    worldToScreen(orbit, 40, 100, 0, WIDTH_PX, HEIGHT_PX, far)

    expect(near.depth).toBeLessThan(far.depth)
    expect(Math.abs(near.x - WIDTH_PX / 2)).toBeGreaterThan(Math.abs(far.x - WIDTH_PX / 2))
  })

  it('reports a point behind the camera as not visible rather than mirroring it', () => {
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 0, distanceMm: 100 })
    const out = createScreenPoint()
    // The camera sits at y = -100 looking toward +Y; this is well behind it.
    worldToScreen(orbit, 0, -400, 0, WIDTH_PX, HEIGHT_PX, out)

    expect(out.visible).toBe(false)
    expect(out.depth).toBeLessThan(0)
  })

  it('survives a zero-height viewport without producing NaN', () => {
    const orbit = cameraAt()
    const out = createScreenPoint()
    worldToScreen(orbit, 10, 10, 10, 0, 0, out)

    expect(out.visible).toBe(false)
    expect(Number.isFinite(out.x)).toBe(true)
    expect(Number.isFinite(out.y)).toBe(true)
  })

  it('writes into the caller\'s point and allocates nothing', () => {
    const orbit = cameraAt()
    const out = createScreenPoint()
    expect(worldToScreen(orbit, 1, 2, 3, WIDTH_PX, HEIGHT_PX, out)).toBe(out)
  })
})

describe('updateGizmoAnnotation', () => {
  it('anchors the gizmo at the body origin and gives each axis an arm of the requested screen length', () => {
    const orbit = cameraAt()
    const out = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 44, out)

    expect(out.visible).toBe(true)
    expect(out.originX).toBeCloseTo(WIDTH_PX / 2, 6)
    expect(out.originY).toBeCloseTo(HEIGHT_PX / 2, 6)
    expect(out.arrows).toHaveLength(3)
    expect(out.arrows.map((arrow) => arrow.axis)).toEqual(['X', 'Y', 'Z'])
    for (const arrow of out.arrows) {
      // Screen-constant size: a gizmo that shrank with the body would be
      // unusable on a small part and enormous on a large one.
      const armPx = Math.hypot(arrow.tipX - out.originX, arrow.tipY - out.originY)
      expect(armPx).toBeCloseTo(60, 6)
    }
  })

  it('points +Z up the screen and +X right from the front view', () => {
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 0 })
    const out = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 44, out)

    const [x, y, z] = out.arrows
    expect(x.tipX).toBeGreaterThan(out.originX)
    expect(z.tipY).toBeLessThan(out.originY)
    // +Y points straight away from the camera here: it has no screen direction
    // at all, so it is hidden rather than drawn as a zero-length stub.
    expect(y.visible).toBe(false)
    expect(x.visible).toBe(true)
    expect(z.visible).toBe(true)
  })

  it('draws each rotate ring from the two world axes it spans', () => {
    // Top view: the Z ring lies in the screen plane, so it is a true circle of
    // the requested radius; the X and Y rings are seen exactly edge-on and
    // collapse to lines. Both are correct — and both are easy to get backwards.
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 90 })
    const out = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 44, out)

    const [ringX, ringY, ringZ] = out.rings
    expect(out.rings.map((ring) => ring.axis)).toEqual(['X', 'Y', 'Z'])

    expect(Math.hypot(ringZ.ux, ringZ.uy)).toBeCloseTo(44, 6)
    expect(Math.hypot(ringZ.vx, ringZ.vy)).toBeCloseTo(44, 6)
    // Perpendicular conjugate diameters: a genuine circle, not a sheared blob.
    expect(ringZ.ux * ringZ.vx + ringZ.uy * ringZ.vy).toBeCloseTo(0, 6)

    // Edge-on rings: one of the two spanning directions has no screen extent.
    for (const ring of [ringX, ringY]) {
      const u = Math.hypot(ring.ux, ring.uy)
      const v = Math.hypot(ring.vx, ring.vy)
      expect(Math.min(u, v)).toBeCloseTo(0, 6)
      expect(Math.max(u, v)).toBeCloseTo(44, 6)
    }
  })

  it('gives every arrow a three-point head that sits behind its tip', () => {
    const orbit = cameraAt()
    const out = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 44, out)

    for (const arrow of out.arrows) {
      if (!arrow.visible) continue
      const toTipX = arrow.tipX - out.originX
      const toTipY = arrow.tipY - out.originY
      for (const corner of [
        [arrow.h1x, arrow.h1y],
        [arrow.h2x, arrow.h2y],
      ]) {
        // Both base corners project *behind* the tip along the arm direction.
        const along = (corner[0] - arrow.tipX) * toTipX + (corner[1] - arrow.tipY) * toTipY
        expect(along).toBeLessThan(0)
      }
    }
  })

  it('hides itself when the body origin is behind the camera', () => {
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 0, distanceMm: 100 })
    const out = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, -400, 0, WIDTH_PX, HEIGHT_PX, 60, 44, out)

    expect(out.visible).toBe(false)
  })

  it('reuses the caller\'s nested arrow and ring objects across updates', () => {
    // CLAUDE.md's Performance rule: this runs from the render callback, so the
    // update must mutate in place rather than rebuild the structure per frame.
    const orbit = cameraAt()
    const out = createGizmoAnnotation()
    const firstArrow = out.arrows[0]
    const firstRing = out.rings[0]
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 44, out)
    orbit.orbit(20, 5)
    updateGizmoAnnotation(orbit, 10, 10, 10, WIDTH_PX, HEIGHT_PX, 60, 44, out)

    expect(out.arrows[0]).toBe(firstArrow)
    expect(out.rings[0]).toBe(firstRing)
  })
})

describe('ringPoints', () => {
  it('samples a face-on ring as a circle of the requested radius', () => {
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 90 })
    const gizmo = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 44, gizmo)

    const points = createRingPoints()
    ringPoints(gizmo.rings[2], gizmo.originX, gizmo.originY, points)

    expect(points).toHaveLength(RING_SEGMENTS)
    for (const point of points) {
      expect(Math.hypot(point.x - gizmo.originX, point.y - gizmo.originY)).toBeCloseTo(44, 6)
    }
  })

  it('samples an edge-on ring as a visible line rather than nothing', () => {
    // The case an SVG <ellipse> under a non-invertible transform would silently
    // drop — and the orientation gizmo's standard-view snaps land on it exactly.
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 90 })
    const gizmo = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 44, gizmo)

    const points = createRingPoints()
    ringPoints(gizmo.rings[0], gizmo.originX, gizmo.originY, points)
    const spread = Math.max(...points.map((point) => Math.hypot(point.x - gizmo.originX, point.y - gizmo.originY)))

    expect(spread).toBeCloseTo(44, 6)
  })

  it('reuses the caller\'s point buffer', () => {
    const orbit = cameraAt()
    const gizmo = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 44, gizmo)
    const points = createRingPoints()
    const first = points[0]

    ringPoints(gizmo.rings[1], gizmo.originX, gizmo.originY, points)
    expect(points[0]).toBe(first)
  })
})

describe('updateDimensionAnnotation', () => {
  const MIN = [-20, -20, 0]
  const MAX = [20, 20, 50]

  it('measures each axis extent of the bounding box in millimetres', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()

    updateDimensionAnnotation(orbit, MIN, MAX, 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.axis).toBe('X')
    expect(out.lengthMm).toBeCloseTo(40, 9)
    expect(out.label).toBe('40 mm')

    updateDimensionAnnotation(orbit, MIN, MAX, 2, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.axis).toBe('Z')
    expect(out.lengthMm).toBeCloseTo(50, 9)
    expect(out.label).toBe('50 mm')
  })

  it('labels a fractional extent without a wall of decimals', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, [0, 0, 0], [12.5, 1, 1], 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    expect(out.label).toBe('12.5 mm')
  })

  it('offsets the dimension line clear of the solid it measures', () => {
    // §7b's dimension lines read *outside* the silhouette. A line drawn straight
    // down the box edge would be invisible against the solid.
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, MIN, MAX, 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    const centre = createScreenPoint()
    worldToScreen(orbit, 0, 0, 25, WIDTH_PX, HEIGHT_PX, centre)
    const footDistance = Math.hypot(out.a1x - centre.x, out.a1y - centre.y)
    const lineDistance = Math.hypot(out.x1 - centre.x, out.y1 - centre.y)
    expect(lineDistance).toBeGreaterThan(footDistance)

    // The extension line runs from the measured corner out past the dimension
    // line, which is what ties the number to the feature it describes.
    expect(Math.hypot(out.e1x - out.a1x, out.e1y - out.a1y)).toBeGreaterThan(26)
  })

  it('keeps the drawn line parallel to the projected axis it measures', () => {
    const orbit = cameraAt({ azimuthDeg: 18, elevationDeg: 27 })
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, MIN, MAX, 2, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    // The offset is applied perpendicular-ish, so the line must still run
    // between the two measured corners' directions, not skew across them.
    const drawnX = out.x2 - out.x1
    const drawnY = out.y2 - out.y1
    const measuredX = out.a2x - out.a1x
    const measuredY = out.a2y - out.a1y
    const cross = drawnX * measuredY - drawnY * measuredX
    const scale = Math.hypot(drawnX, drawnY) * Math.hypot(measuredX, measuredY)
    expect(Math.abs(cross) / scale).toBeCloseTo(0, 6)
  })

  it('puts an arrowhead at each end, tips on the line ends', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, MIN, MAX, 1, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    expect(out.h1).toHaveLength(3)
    expect(out.h2).toHaveLength(3)
    expect(out.h1[0].x).toBeCloseTo(out.x1, 9)
    expect(out.h1[0].y).toBeCloseTo(out.y1, 9)
    expect(out.h2[0].x).toBeCloseTo(out.x2, 9)
    expect(out.h2[0].y).toBeCloseTo(out.y2, 9)
    // Heads point outward, away from each other, so the pair reads as a span:
    // each head's body lies *inward* along the line from its own tip.
    const lineX = out.x2 - out.x1
    const lineY = out.y2 - out.y1
    expect((out.h1[1].x - out.x1) * lineX + (out.h1[1].y - out.y1) * lineY).toBeGreaterThan(0)
    expect((out.h2[1].x - out.x2) * lineX + (out.h2[1].y - out.y2) * lineY).toBeLessThan(0)
  })

  it('parks the label on the dimension line, not on the solid', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, MIN, MAX, 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    const midX = (out.x1 + out.x2) / 2
    const midY = (out.y1 + out.y2) / 2
    expect(Math.hypot(out.labelX - midX, out.labelY - midY)).toBeLessThan(30)
  })

  it('handles a degenerate zero-size box without NaN', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, [5, 5, 5], [5, 5, 5], 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    expect(out.lengthMm).toBe(0)
    for (const value of [out.x1, out.y1, out.x2, out.y2, out.labelX, out.labelY]) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('hides the annotation when the box is behind the camera', () => {
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 0, distanceMm: 100 })
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, [-10, -420, -10], [10, -400, 10], 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    expect(out.visible).toBe(false)
  })

  it('reuses the caller\'s arrowhead point objects across updates', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    const head = out.h1[0]
    updateDimensionAnnotation(orbit, MIN, MAX, 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    orbit.orbit(30, 10)
    updateDimensionAnnotation(orbit, MIN, MAX, 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    expect(out.h1[0]).toBe(head)
  })
})

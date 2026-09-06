import { describe, expect, it } from 'vitest'

import { createOrbitCamera } from './camera.js'
import { projectToWorkingPlane } from './pick.js'
import {
  RING_SEGMENTS,
  axisFacing,
  createDimensionAnnotation,
  createGizmoAnnotation,
  createRingPoints,
  createScreenPoint,
  gizmoSizeForBounds,
  ringPoints,
  rotateDeltaDeg,
  screenDirection,
  translateDeltaMm,
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

describe('gizmoSizeForBounds (TODO/ui-017)', () => {
  it('gives a zero-size bounding box the floor size, not NaN or zero', () => {
    const { armPx, ringPx } = gizmoSizeForBounds([0, 0, 0], [0, 0, 0], 1)
    expect(armPx).toBeGreaterThan(0)
    expect(ringPx).toBeGreaterThan(0)
    expect(Number.isNaN(armPx)).toBe(false)
    expect(Number.isNaN(ringPx)).toBe(false)
    // The floor is today's fixed constants: a tiny object must not shrink below
    // what ui-012 already tuned as comfortably grabbable.
    expect(armPx).toBeCloseTo(58, 6)
    expect(ringPx).toBeCloseTo(40, 6)
  })

  it('stays at the floor for a small object that fits well inside it', () => {
    // A 10mm cube at 1mm/px projects to a 10px half-diagonal — far smaller than
    // the floor, so the floor should win rather than shrinking further.
    const { armPx, ringPx } = gizmoSizeForBounds([0, 0, 0], [10, 10, 10], 1)
    expect(armPx).toBeCloseTo(58, 6)
    expect(ringPx).toBeCloseTo(40, 6)
  })

  it('grows past the floor for a body whose on-screen half-diagonal exceeds it', () => {
    // A 300mm cube at 1mm/px has a half-diagonal of 150*sqrt(3) ≈ 259.8px screen
    // half-diagonal — comfortably past the floor, so the size must grow to clear
    // the body's own silhouette.
    const { armPx, ringPx } = gizmoSizeForBounds([0, 0, 0], [300, 300, 300], 1)
    expect(armPx).toBeGreaterThan(58)
    expect(ringPx).toBeGreaterThan(40)
    // The arm must stay outside the ring, matching today's 58 > 40 ordering, so
    // rings never poke out past the translate arms that anchor them.
    expect(armPx).toBeGreaterThan(ringPx)
  })

  it('grows monotonically with a larger bounding box, at a few mmPerPixel values', () => {
    for (const mmPerPixel of [0.5, 1, 4]) {
      const small = gizmoSizeForBounds([0, 0, 0], [20, 20, 20], mmPerPixel)
      const large = gizmoSizeForBounds([0, 0, 0], [400, 400, 400], mmPerPixel)
      expect(large.armPx).toBeGreaterThanOrEqual(small.armPx)
      expect(large.ringPx).toBeGreaterThanOrEqual(small.ringPx)
    }
  })

  it('shrinks toward the floor, not below it, as mmPerPixel grows (zoomed out)', () => {
    // The same real-world body reads as fewer screen pixels the further the
    // camera zooms out, so its gizmo should shrink toward the floor but never
    // past it.
    const zoomedIn = gizmoSizeForBounds([0, 0, 0], [300, 300, 300], 0.5)
    const zoomedOut = gizmoSizeForBounds([0, 0, 0], [300, 300, 300], 50)
    expect(zoomedOut.armPx).toBeLessThan(zoomedIn.armPx)
    expect(zoomedOut.armPx).toBeCloseTo(58, 6)
    expect(zoomedOut.ringPx).toBeCloseTo(40, 6)
  })

  it('caps the growth so an enormous body does not run the gizmo off screen', () => {
    const { armPx, ringPx } = gizmoSizeForBounds([0, 0, 0], [1e6, 1e6, 1e6], 1)
    expect(Number.isFinite(armPx)).toBe(true)
    expect(Number.isFinite(ringPx)).toBe(true)
    expect(armPx).toBeLessThan(500)
    expect(ringPx).toBeLessThan(500)
  })

  it('treats a non-finite mmPerPixel (e.g. a degenerate camera state) as the floor', () => {
    const { armPx, ringPx } = gizmoSizeForBounds([0, 0, 0], [300, 300, 300], 0)
    expect(armPx).toBeCloseTo(58, 6)
    expect(ringPx).toBeCloseTo(40, 6)
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

/**
 * An {@link import('./annotate.js').OrientedBox} for a test, defaulting to an
 * unrotated one whose local frame is anchored at its own centre — i.e. exactly
 * the world-axis-aligned box every pre-`ui-023` call passed as `min`/`max`.
 *
 * @param {readonly number[]} minMm Local-frame minimum.
 * @param {readonly number[]} maxMm Local-frame maximum.
 * @param {readonly number[]} [rotationDeg]
 * @param {readonly number[]} [pivotMm] Point the local frame is anchored at;
 *   defaults to the local box's own centre.
 * @returns {import('./annotate.js').OrientedBox}
 */
function box(minMm, maxMm, rotationDeg = [0, 0, 0], pivotMm = undefined) {
  return {
    minMm,
    maxMm,
    rotationDeg,
    pivotMm: pivotMm ?? [
      (minMm[0] + maxMm[0]) / 2,
      (minMm[1] + maxMm[1]) / 2,
      (minMm[2] + maxMm[2]) / 2,
    ],
  }
}

describe('updateDimensionAnnotation', () => {
  const MIN = [-20, -20, 0]
  const MAX = [20, 20, 50]

  it('measures each axis extent of the bounding box in millimetres', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()

    updateDimensionAnnotation(orbit, box(MIN, MAX), 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.axis).toBe('X')
    expect(out.lengthMm).toBeCloseTo(40, 9)
    expect(out.label).toBe('40 mm')

    updateDimensionAnnotation(orbit, box(MIN, MAX), 2, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.axis).toBe('Z')
    expect(out.lengthMm).toBeCloseTo(50, 9)
    expect(out.label).toBe('50 mm')
  })

  it('labels a fractional extent without a wall of decimals', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, box([0, 0, 0], [12.5, 1, 1]), 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    expect(out.label).toBe('12.5 mm')
  })

  it('offsets the dimension line clear of the solid it measures', () => {
    // §7b's dimension lines read *outside* the silhouette. A line drawn straight
    // down the box edge would be invisible against the solid.
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, box(MIN, MAX), 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

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
    updateDimensionAnnotation(orbit, box(MIN, MAX), 2, WIDTH_PX, HEIGHT_PX, 26, 9, out)

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
    updateDimensionAnnotation(orbit, box(MIN, MAX), 1, WIDTH_PX, HEIGHT_PX, 26, 9, out)

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
    updateDimensionAnnotation(orbit, box(MIN, MAX), 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    const midX = (out.x1 + out.x2) / 2
    const midY = (out.y1 + out.y2) / 2
    expect(Math.hypot(out.labelX - midX, out.labelY - midY)).toBeLessThan(30)
  })

  it('handles a degenerate zero-size box without NaN', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, box([5, 5, 5], [5, 5, 5]), 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    expect(out.lengthMm).toBe(0)
    for (const value of [out.x1, out.y1, out.x2, out.y2, out.labelX, out.labelY]) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('hides the annotation when the box is behind the camera', () => {
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 0, distanceMm: 100 })
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, box([-10, -420, -10], [10, -400, 10]), 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    expect(out.visible).toBe(false)
  })

  it('reuses the caller\'s arrowhead point objects across updates', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    const head = out.h1[0]
    updateDimensionAnnotation(orbit, box(MIN, MAX), 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    orbit.orbit(30, 10)
    updateDimensionAnnotation(orbit, box(MIN, MAX), 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    expect(out.h1[0]).toBe(head)
  })
})

describe('updateDimensionAnnotation on a rotated body (TODO/ui-023)', () => {
  /**
   * A rotated body's dimension lines must read the part's **own** extents, not
   * the world-axis-aligned box its tilted silhouette happens to fit inside.
   *
   * The finding's own example: tilt a cylinder 30° about X and the world AABB is
   * bigger on two axes than the part is, and carries no readable "diameter" or
   * "length" figure at all. Every assertion below therefore compares against the
   * part's known local size and, where the two differ, explicitly asserts the
   * shadow's number is *not* what comes out.
   *
   * The rotation convention is `@jscad/modeling`'s `transforms.rotate` — active,
   * intrinsic Tait-Bryan in z-y-x order, so `R = Rz(z)·Ry(y)·Rx(x)` — which is
   * what `src/core/kernel/registry.js`'s `transform.rotate` op applies.
   * {@link rotatedPoint} below re-derives it independently of `annotate.js`, so
   * the geometric assertions are a real cross-check rather than a tautology.
   */

  /** A ⌀40 × 50 cylinder resting on the grid, in its own local frame. */
  const CYL_MIN = [-20, -20, 0]
  const CYL_MAX = [20, 20, 50]
  const CYL_PIVOT = [0, 0, 25]

  /**
   * Rotate a local-frame point into world millimetres, about `pivotMm`.
   *
   * @param {readonly number[]} rotationDeg
   * @param {readonly number[]} pivotMm
   * @param {readonly number[]} pointMm Local-frame point.
   * @returns {[number, number, number]}
   */
  function rotatedPoint(rotationDeg, pivotMm, pointMm) {
    /** @param {number} deg @returns {number} */
    const rad = (deg) => (deg * Math.PI) / 180
    const [cx, sx] = [Math.cos(rad(rotationDeg[0])), Math.sin(rad(rotationDeg[0]))]
    const [cy, sy] = [Math.cos(rad(rotationDeg[1])), Math.sin(rad(rotationDeg[1]))]
    const [cz, sz] = [Math.cos(rad(rotationDeg[2])), Math.sin(rad(rotationDeg[2]))]
    const vx = pointMm[0] - pivotMm[0]
    const vy = pointMm[1] - pivotMm[1]
    const vz = pointMm[2] - pivotMm[2]
    // Rx, then Ry, then Rz — the z-y-x intrinsic order, applied outermost-last.
    const y1 = cx * vy - sx * vz
    const z1 = sx * vy + cx * vz
    const x2 = cy * vx + sy * z1
    const z2 = -sy * vx + cy * z1
    return [pivotMm[0] + cz * x2 - sz * y1, pivotMm[1] + sz * x2 + cz * y1, pivotMm[2] + z2]
  }

  it('reads a 90°-tilted cylinder s own diameter and length, not its world box', () => {
    // Tilted 90° about X, the cylinder lies down: its world AABB is 40 × 50 × 40,
    // so the Y line would read the *length* and the Z line the *diameter* if the
    // measurement still came off the shadow. Both must stay in the part's frame.
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    const lying = box(CYL_MIN, CYL_MAX, [90, 0, 0], CYL_PIVOT)

    updateDimensionAnnotation(orbit, lying, 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.lengthMm).toBeCloseTo(40, 6)

    updateDimensionAnnotation(orbit, lying, 1, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.lengthMm).toBeCloseTo(40, 6)
    expect(out.lengthMm).not.toBeCloseTo(50, 3)

    updateDimensionAnnotation(orbit, lying, 2, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.lengthMm).toBeCloseTo(50, 6)
    expect(out.lengthMm).not.toBeCloseTo(40, 3)
    expect(out.label).toBe('50 mm')
  })

  it('reads the finding s own 30°-about-X cylinder correctly', () => {
    // The world AABB here is 40 × 59.641 × 63.301 — larger on two axes than the
    // part, and neither number is the diameter or the length.
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    const tilted = box(CYL_MIN, CYL_MAX, [30, 0, 0], CYL_PIVOT)
    const shadowY = 40 * Math.cos(Math.PI / 6) + 50 * Math.sin(Math.PI / 6)
    const shadowZ = 40 * Math.sin(Math.PI / 6) + 50 * Math.cos(Math.PI / 6)

    updateDimensionAnnotation(orbit, tilted, 1, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.lengthMm).toBeCloseTo(40, 6)
    expect(out.lengthMm).not.toBeCloseTo(shadowY, 3)

    updateDimensionAnnotation(orbit, tilted, 2, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.lengthMm).toBeCloseTo(50, 6)
    expect(out.lengthMm).not.toBeCloseTo(shadowZ, 3)
  })

  it('holds up when the body is rotated on all three axes at once', () => {
    // A 20 × 40 × 60 block, so a mixed-up axis order cannot hide behind equal
    // extents the way a cube's would.
    const orbit = cameraAt({ azimuthDeg: 18, elevationDeg: 27 })
    const out = createDimensionAnnotation()
    const tumbled = box([-10, -20, 0], [10, 20, 60], [30, 40, 50], [0, 0, 30])

    for (const [axis, expected] of [
      [0, 20],
      [1, 40],
      [2, 60],
    ]) {
      updateDimensionAnnotation(orbit, tumbled, axis, WIDTH_PX, HEIGHT_PX, 26, 9, out)
      expect(out.lengthMm).toBeCloseTo(expected, 6)
      expect(out.visible).toBe(true)
    }
  })

  it('draws each line along the body s rotated axis, not the world axis', () => {
    // Measuring the right number but drawing it along the wrong edge would still
    // be wrong. Lying the cylinder down maps its local Z onto world −Y, so the
    // "length" line must now run front-to-back rather than up.
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    const lying = box(CYL_MIN, CYL_MAX, [90, 0, 0], CYL_PIVOT)
    updateDimensionAnnotation(orbit, lying, 2, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    // The local-Z axis through the pivot, projected independently of the module.
    const near = createScreenPoint()
    const far = createScreenPoint()
    const [nx, ny, nz] = rotatedPoint([90, 0, 0], CYL_PIVOT, [0, 0, 0])
    const [fx, fy, fz] = rotatedPoint([90, 0, 0], CYL_PIVOT, [0, 0, 50])
    worldToScreen(orbit, nx, ny, nz, WIDTH_PX, HEIGHT_PX, near)
    worldToScreen(orbit, fx, fy, fz, WIDTH_PX, HEIGHT_PX, far)

    const drawnX = out.a2x - out.a1x
    const drawnY = out.a2y - out.a1y
    const axisX = far.x - near.x
    const axisY = far.y - near.y
    const cross = drawnX * axisY - drawnY * axisX
    const scale = Math.hypot(drawnX, drawnY) * Math.hypot(axisX, axisY)
    // Not exactly parallel, and correctly so: the edge actually dimensioned is
    // an outer one, offset 20 mm from the axis through the pivot, and at 420 mm
    // the perspective divide foreshortens the two by different amounts. The
    // world-axis check below is an order of magnitude away, so this still
    // discriminates the two candidates decisively.
    expect(Math.abs(cross) / scale).toBeLessThan(0.1)

    // And it is genuinely a *different* direction from the world Z the old
    // axis-aligned code would have drawn, so the check above can discriminate.
    const worldNear = createScreenPoint()
    const worldFar = createScreenPoint()
    worldToScreen(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, worldNear)
    worldToScreen(orbit, 0, 0, 50, WIDTH_PX, HEIGHT_PX, worldFar)
    const worldAxisX = worldFar.x - worldNear.x
    const worldAxisY = worldFar.y - worldNear.y
    const worldCross = drawnX * worldAxisY - drawnY * worldAxisX
    const worldScale = Math.hypot(drawnX, drawnY) * Math.hypot(worldAxisX, worldAxisY)
    expect(Math.abs(worldCross) / worldScale).toBeGreaterThan(0.5)
  })

  it('says which frame it measured in, so the overlay can label it honestly', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()

    updateDimensionAnnotation(orbit, box(CYL_MIN, CYL_MAX), 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.frame).toBe('world')

    updateDimensionAnnotation(
      orbit,
      box(CYL_MIN, CYL_MAX, [0, 0, 45], CYL_PIVOT),
      0,
      WIDTH_PX,
      HEIGHT_PX,
      26,
      9,
      out
    )
    expect(out.frame).toBe('local')
  })

  it('degenerate: two local axes projecting to the same screen direction', () => {
    // A 40 mm cube turned 45° about Z, viewed from dead level (elevation 0).
    // Screen-up is world Z there, so *every* vector in the world XY plane — both
    // the body's local X and its local Y — projects to a purely horizontal screen
    // direction. The two dimension lines therefore become parallel, which is the
    // honest picture; what must not happen is a wrong number, a NaN, or a line
    // that silently vanishes.
    const orbit = cameraAt({ azimuthDeg: 0, elevationDeg: 0 })
    const turned = box([-20, -20, 0], [20, 20, 40], [0, 0, 45], [0, 0, 20])
    const x = createDimensionAnnotation()
    const y = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, turned, 0, WIDTH_PX, HEIGHT_PX, 26, 9, x)
    updateDimensionAnnotation(orbit, turned, 1, WIDTH_PX, HEIGHT_PX, 26, 9, y)

    for (const out of [x, y]) {
      expect(out.visible).toBe(true)
      expect(out.lengthMm).toBeCloseTo(40, 6)
      expect(out.label).toBe('40 mm')
      for (const value of [out.a1x, out.a1y, out.a2x, out.a2y, out.x1, out.y1, out.x2, out.y2, out.labelX, out.labelY]) {
        expect(Number.isFinite(value)).toBe(true)
      }
    }

    // The degeneracy itself, asserted rather than assumed: from this camera the
    // body's local X and local Y have the *identical* screen direction — this is
    // the same affine projection the gizmo's own handles are built from, and it
    // is where the collapse genuinely happens.
    const dirX = { x: 0, y: 0 }
    const dirY = { x: 0, y: 0 }
    const half = Math.SQRT1_2
    screenDirection(0, 0, half, half, 0, dirX)
    screenDirection(0, 0, -half, half, 0, dirY)
    const cross = dirX.x * dirY.y - dirX.y * dirY.x
    expect(Math.abs(cross) / (Math.hypot(dirX.x, dirX.y) * Math.hypot(dirY.x, dirY.y))).toBeCloseTo(0, 9)

    // The drawn edges are nonetheless not literally coincident, because the two
    // are dimensioned at different depths and the perspective divide separates
    // them — which is why the lines stay individually readable rather than
    // stacking into one. Worth pinning: it is the only thing keeping this
    // degenerate view usable.
    expect(Math.hypot(x.labelX - y.labelX, x.labelY - y.labelY)).toBeGreaterThan(1)
  })

  it('degenerate: a local axis pointing dead-on at the camera', () => {
    // Same 45°-about-Z cube, but now viewed straight down its own local X: the
    // camera's view direction *is* that axis, so it has no screen direction at
    // all. The measurement must not depend on the projection — the number is the
    // body's own extent either way — and nothing may come out non-finite.
    const orbit = cameraAt({ azimuthDeg: 45, elevationDeg: 0 })
    const turned = box([-20, -20, 0], [20, 20, 40], [0, 0, 45], [0, 0, 20])
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, turned, 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    expect(out.lengthMm).toBeCloseTo(40, 6)
    for (const value of [out.a1x, out.a1y, out.a2x, out.a2y, out.x1, out.y1, out.x2, out.y2, out.labelX, out.labelY]) {
      expect(Number.isFinite(value)).toBe(true)
    }
    for (const head of [out.h1, out.h2]) {
      for (const point of head) {
        expect(Number.isFinite(point.x)).toBe(true)
        expect(Number.isFinite(point.y)).toBe(true)
      }
    }

    // The other two axes are unaffected by their neighbour's degeneracy.
    updateDimensionAnnotation(orbit, turned, 1, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.visible).toBe(true)
    expect(out.lengthMm).toBeCloseTo(40, 6)
    updateDimensionAnnotation(orbit, turned, 2, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    expect(out.visible).toBe(true)
    expect(out.lengthMm).toBeCloseTo(40, 6)
  })

  it('allocates nothing new per call, the same as the axis-aligned path', () => {
    const orbit = cameraAt()
    const out = createDimensionAnnotation()
    const head = out.h1[0]
    const tumbled = box([-10, -20, 0], [10, 20, 60], [30, 40, 50], [0, 0, 30])
    updateDimensionAnnotation(orbit, tumbled, 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)
    orbit.orbit(30, 10)
    updateDimensionAnnotation(orbit, tumbled, 0, WIDTH_PX, HEIGHT_PX, 26, 9, out)

    expect(out.h1[0]).toBe(head)
  })
})

describe('gizmo drag maths (TODO/ui-012)', () => {
  /**
   * The gizmo's handles became draggable in `ui-012`, and the arithmetic that
   * turns a pointer path into millimetres and degrees lives here for the same
   * reason everything else in this module does: a component doing coordinate
   * maths is a bug waiting to happen, and this is the maths a user feels most
   * directly — a drag that moves the wrong distance or turns the wrong way is
   * obvious to a human and invisible to a screenshot.
   */

  it('projects a pointer delta onto an axis arm, in millimetres', () => {
    const orbit = cameraAt()
    const gizmo = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 58, 40, gizmo)

    const arrow = gizmo.arrows[0]
    const armX = arrow.tipX - gizmo.originX
    const armY = arrow.tipY - gizmo.originY
    const armLength = Math.hypot(armX, armY)
    const ux = armX / armLength
    const uy = armY / armLength

    // Dragging exactly along the arm by 100 px, at 0.5 mm/px, is 50 mm along X.
    expect(translateDeltaMm(gizmo, 0, ux * 100, uy * 100, 0.5)).toBeCloseTo(50, 6)
    // Backwards along it is the same distance, negated.
    expect(translateDeltaMm(gizmo, 0, -ux * 100, -uy * 100, 0.5)).toBeCloseTo(-50, 6)
    // Perpendicular to it contributes nothing: dragging across an axis handle
    // must not slide the body along it.
    expect(translateDeltaMm(gizmo, 0, -uy * 100, ux * 100, 0.5)).toBeCloseTo(0, 6)
  })

  it('gives an axis with no screen direction a zero delta rather than NaN', () => {
    // Straight down the Z axis: Z has no screen image at all, so a drag on a
    // handle that is not being drawn must be inert, not a division by zero.
    const orbit = cameraAt()
    orbit.snapTo('top')
    const gizmo = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 58, 40, gizmo)

    expect(gizmo.arrows[2].visible).toBe(false)
    expect(translateDeltaMm(gizmo, 2, 40, 40, 0.5)).toBe(0)
  })

  it('measures a rotate ring drag as a signed screen-space sweep', () => {
    // A quarter sweep counter-clockwise on screen (screen Y grows *down*, so
    // "up" is -y) about an axis pointing at the viewer is +90°.
    expect(rotateDeltaDeg(100, 100, 110, 100, 100, 90, 1)).toBeCloseTo(90, 6)
    // The same sweep about an axis pointing away from the viewer is -90°: the
    // ring the user is grabbing is the far side of the same circle.
    expect(rotateDeltaDeg(100, 100, 110, 100, 100, 90, -1)).toBeCloseTo(-90, 6)
    // And the reverse sweep negates.
    expect(rotateDeltaDeg(100, 100, 100, 90, 110, 100, 1)).toBeCloseTo(-90, 6)
  })

  it('wraps a rotate sweep across the ±180° seam rather than jumping a full turn', () => {
    // Crossing the seam is the classic bug: a naive difference reports -350°
    // for a 10° nudge, and the body spins.
    const delta = rotateDeltaDeg(0, 0, Math.cos(3.0), Math.sin(3.0), Math.cos(-3.0), Math.sin(-3.0), 1)
    expect(Math.abs(delta)).toBeLessThan(90)
  })

  it('reports a drag of no distance as no rotation', () => {
    expect(rotateDeltaDeg(100, 100, 120, 100, 120, 100, 1)).toBe(0)
    // A pointer exactly on the hub has no angle at all — inert, not NaN.
    expect(rotateDeltaDeg(100, 100, 100, 100, 130, 100, 1)).toBe(0)
  })

  it('knows which way each axis faces the camera', () => {
    const orbit = cameraAt()
    orbit.snapTo('top')
    // Looking down from +Z, the Z axis points straight at the viewer.
    expect(axisFacing(orbit.state.azimuthDeg, orbit.state.elevationDeg, 2)).toBe(1)
    orbit.snapTo('bottom')
    expect(axisFacing(orbit.state.azimuthDeg, orbit.state.elevationDeg, 2)).toBe(-1)
  })
})

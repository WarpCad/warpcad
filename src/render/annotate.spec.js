// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createOrbitCamera } from './camera.js'
import { projectToSketchPlane, projectToWorkingPlane } from './pick.js'
import {
  DIAL_HAND_RATIO,
  DIAL_READOUT_FONT_PX,
  DIAL_READOUT_HEIGHT_PX,
  DIAL_READOUT_WIDTH_PX,
  DIAL_SECTOR_POINTS,
  DIAL_TICK_COUNT,
  GIZMO_ARM_FLOOR_PX,
  GIZMO_HEAD_MAX_PX,
  RING_SEGMENTS,
  RULER_MAX_TICKS,
  RULER_MIN_TICK_PX,
  RULER_READOUT_FONT_PX,
  RULER_READOUT_HEIGHT_PX,
  RULER_READOUT_WIDTH_PX,
  axisFacing,
  axisToward,
  createDialAnnotation,
  createDimensionAnnotation,
  createRulerAnnotation,
  placeDialReadout,
  placeRulerReadout,
  updateRulerAnnotation,
  ringParamDeg,
  updateDialAnnotation,
  createGizmoAnnotation,
  createRingArrowheads,
  createRingPoints,
  createScreenPoint,
  createSketchPath,
  createSnapGuideAnnotations,
  distanceToSegmentPx,
  gizmoHeadPx,
  gizmoSizeForBounds,
  ringArrowheads,
  ringPoints,
  rotateDeltaDeg,
  screenDirection,
  translateDeltaMm,
  updateDimensionAnnotation,
  updateGizmoAnnotation,
  updateSketchPath,
  updateSnapGuideAnnotations,
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

describe('translate arrowheads and cone bases (TODO/ui-048)', () => {
  /**
   * @param {{ tipX: number, tipY: number, baseX: number, baseY: number }} arrow
   * @returns {number}
   */
  function headLength(arrow) {
    return Math.hypot(arrow.tipX - arrow.baseX, arrow.tipY - arrow.baseY)
  }

  it('keeps the head a small, near-fixed size instead of 0.26 of the arm', () => {
    // At ui-017's old 220px cap the head used to be 0.26 * 220 ≈ 57px long: a
    // sign, not a handle. The cap-sized head must now be no bigger than the
    // floor-sized head was (0.26 * 58 ≈ 15px), give or take the small growth.
    expect(gizmoHeadPx(220)).toBeLessThanOrEqual(GIZMO_HEAD_MAX_PX + 1e-6)
    expect(GIZMO_HEAD_MAX_PX).toBeLessThanOrEqual(16)
    expect(gizmoHeadPx(220)).not.toBeCloseTo(220 * 0.26, 1)
    expect(gizmoHeadPx(GIZMO_ARM_FLOOR_PX)).toBeGreaterThanOrEqual(12)
    // Monotonic, never shrinking as the arm grows.
    expect(gizmoHeadPx(220)).toBeGreaterThanOrEqual(gizmoHeadPx(GIZMO_ARM_FLOOR_PX))
  })

  it('draws the head at gizmoHeadPx from its tip, whatever the arm length', () => {
    const orbit = cameraAt()
    for (const armPx of [58, 120, 198]) {
      const out = createGizmoAnnotation()
      updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, armPx, armPx - 18, out)
      for (const arrow of out.arrows) {
        if (!arrow.visible) continue
        expect(headLength(arrow)).toBeCloseTo(gizmoHeadPx(armPx), 6)
        // The two base corners sit either side of the base centre, a cone's
        // width apart.
        expect(Math.hypot(arrow.h1x - arrow.baseX, arrow.h1y - arrow.baseY)).toBeCloseTo(arrow.coneRx, 6)
        expect(Math.hypot(arrow.h2x - arrow.baseX, arrow.h2y - arrow.baseY)).toBeCloseTo(arrow.coneRx, 6)
        expect(2 * arrow.coneRx).toBeLessThanOrEqual(12)
      }
    }
  })

  it('gives axisToward the signed component of each axis along the view direction', () => {
    expect(axisToward(-90, 90, 2)).toBeCloseTo(1, 6)
    expect(axisToward(-90, 0, 2)).toBeCloseTo(0, 6)
    expect(axisToward(-90, 0, 1)).toBeCloseTo(-1, 6)
    expect(axisToward(0, 45, 0)).toBeCloseTo(Math.SQRT1_2, 6)
    // axisFacing is the sign of the same number.
    expect(axisFacing(0, 45, 0)).toBe(1)
    expect(axisFacing(-90, 0, 1)).toBe(-1)
  })

  it('foreshortens the cone base by how far the axis points toward the camera', () => {
    // Front view, elevation 0: Z lies flat across the screen, so its base disc
    // is seen exactly edge-on — a line, no depth at all.
    const flat = createGizmoAnnotation()
    updateGizmoAnnotation(cameraAt({ azimuthDeg: -90, elevationDeg: 0 }), 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 42, flat)
    const zFlat = flat.arrows[2]
    expect(zFlat.visible).toBe(true)
    expect(zFlat.coneRy).toBeCloseTo(0, 6)

    // 45° elevation: Z is half toward the camera, so the disc is squashed by
    // exactly cos 45°.
    const tilted = createGizmoAnnotation()
    updateGizmoAnnotation(cameraAt({ azimuthDeg: -90, elevationDeg: 45 }), 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 42, tilted)
    const zTilted = tilted.arrows[2]
    expect(zTilted.coneRy).toBeCloseTo(zTilted.coneRx * Math.SQRT1_2, 6)
    expect(zTilted.facing).toBe(1)

    // Almost straight down on Z: the arm is still (barely) visible, and its base
    // is almost a full disc.
    const nearlyTop = createGizmoAnnotation()
    updateGizmoAnnotation(cameraAt({ azimuthDeg: -90, elevationDeg: 89.9 }), 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 42, nearlyTop)
    const zTop = nearlyTop.arrows[2]
    expect(zTop.visible).toBe(true)
    expect(zTop.coneRy).toBeCloseTo(zTop.coneRx, 4)

    // The disc's major axis lies across the arm: its angle is the arm's
    // perpendicular, so for the vertical Z arm it is horizontal.
    const angle = ((zTilted.coneAngleDeg % 180) + 180) % 180
    expect(Math.min(angle, 180 - angle)).toBeCloseTo(0, 6)
  })

  it('reports an arm pointing away from the camera as facing -1', () => {
    // From the front (azimuth -90), +Y points straight away; nudge the camera
    // up so Y has a screen direction but still points away.
    const out = createGizmoAnnotation()
    updateGizmoAnnotation(cameraAt({ azimuthDeg: -80, elevationDeg: 20 }), 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 42, out)
    expect(out.arrows[1].visible).toBe(true)
    expect(out.arrows[1].facing).toBe(-1)
    expect(out.arrows[0].facing).toBe(1)
  })

  it('runs each shaft and cone shading line across its arm, bright side up-left', () => {
    for (const [azimuthDeg, elevationDeg] of [[-90, 0], [-60, 30], [30, 60], [150, -20]]) {
      const out = createGizmoAnnotation()
      updateGizmoAnnotation(cameraAt({ azimuthDeg, elevationDeg }), 0, 0, 0, WIDTH_PX, HEIGHT_PX, 80, 60, out)
      for (const arrow of out.arrows) {
        if (!arrow.visible) continue
        const armX = arrow.tipX - out.originX
        const armY = arrow.tipY - out.originY
        const shadeX = arrow.s2x - arrow.s1x
        const shadeY = arrow.s2y - arrow.s1y
        // Across the arm, never along it: this is what makes the highlight run
        // down one flank of the rod instead of cutting it at a fixed diagonal.
        expect(armX * shadeX + armY * shadeY).toBeCloseTo(0, 6)
        expect(Math.hypot(shadeX, shadeY)).toBeGreaterThan(0)
        // Never a zero-extent paint box: even a perfectly vertical shaft gets a
        // real horizontal gradient line (the objectBoundingBox trap).
        // Bright end (s1) is the up-left flank: moving s1 → s2 goes down-right.
        expect(shadeX + shadeY).toBeGreaterThanOrEqual(-1e-9)
        // Cone line h1 → h2 is across the arm too, and on the same bright side.
        const coneX = arrow.h2x - arrow.h1x
        const coneY = arrow.h2y - arrow.h1y
        expect(armX * coneX + armY * coneY).toBeCloseTo(0, 6)
        expect(coneX * shadeX + coneY * shadeY).toBeGreaterThan(0)
      }
    }
  })

  it('hides an end-on arm without a NaN anywhere in its fields', () => {
    // Top view: Z points straight at the camera and has no screen direction.
    const out = createGizmoAnnotation()
    updateGizmoAnnotation(cameraAt({ azimuthDeg: -90, elevationDeg: 90 }), 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 42, out)
    const z = out.arrows[2]
    expect(z.visible).toBe(false)
    for (const [key, value] of Object.entries(z)) {
      if (typeof value === 'number') expect(Number.isFinite(value), key).toBe(true)
    }
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

  it('keeps the arm just outside the ring at every size — floor, mid-range and cap (TODO/ui-048)', () => {
    const cases = [
      gizmoSizeForBounds([0, 0, 0], [0, 0, 0], 1),
      gizmoSizeForBounds([0, 0, 0], [10, 10, 10], 1),
      gizmoSizeForBounds([0, 0, 0], [120, 120, 120], 1),
      gizmoSizeForBounds([0, 0, 0], [1e6, 1e6, 1e6], 1),
      gizmoSizeForBounds([0, 0, 0], [300, 300, 300], 0),
      gizmoSizeForBounds([0, 0, 0], [300, 300, 300], Number.NaN),
    ]
    for (const { armPx, ringPx } of cases) {
      expect(Number.isFinite(armPx)).toBe(true)
      expect(armPx).toBeGreaterThan(ringPx)
      // Derived from the ring, not sized independently of it: the arrow tip
      // sits a short fixed reach past its ring, never ~40px plus a head beyond.
      expect(armPx - ringPx).toBeCloseTo(18, 6)
    }
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

describe('ringArrowheads', () => {
  it('places both arrowhead tips on the ring itself (TODO/ui-022)', () => {
    // A bare ring reads as decoration; the tip of each chevron must sit
    // exactly where ringPoints() would sample the ring at that same
    // parameter, or the arrowheads would float off the circle they are
    // supposed to be decorating.
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 90 })
    const gizmo = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 44, gizmo)

    const heads = createRingArrowheads()
    ringArrowheads(gizmo.rings[2], gizmo.originX, gizmo.originY, heads)

    expect(heads).toHaveLength(2)
    for (const head of heads) {
      expect(head).toHaveLength(3)
      const [tip] = head
      // The Z ring here is a true circle of radius 44 (same fixture as
      // ringPoints' own "face-on ring" test above), so every point on it —
      // including each arrowhead's tip — sits exactly 44px from the origin.
      expect(Math.hypot(tip.x - gizmo.originX, tip.y - gizmo.originY)).toBeCloseTo(44, 6)
    }
    // The quarter-turn and three-quarters-turn tips are on opposite sides of
    // the ring, not the same spot.
    const [tip1] = heads[0]
    const [tip2] = heads[1]
    expect(Math.hypot(tip1.x - tip2.x, tip1.y - tip2.y)).toBeGreaterThan(80)
  })

  it('points each arrowhead tangent to the ring, not radially outward', () => {
    // A generic (non-axis-aligned) view, so ring.ux/uy/vx/vy are a real
    // ellipse rather than the top-view's convenient perpendicular circle —
    // the case the TODO calls out where the tangent is the derivative
    // `-u*sin(t) + v*cos(t)`, not just "perpendicular to the radius".
    const orbit = cameraAt({ azimuthDeg: 24, elevationDeg: 31 })
    const gizmo = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 44, gizmo)

    for (const ring of gizmo.rings) {
      const heads = createRingArrowheads()
      ringArrowheads(ring, gizmo.originX, gizmo.originY, heads)

      const params = [Math.PI / 2, (3 * Math.PI) / 2]
      heads.forEach((head, index) => {
        const [tip, base1, base2] = head
        const t = params[index]
        const cos = Math.cos(t)
        const sin = Math.sin(t)

        // The tip is the exact point ringPoints() would sample at this t.
        expect(tip.x).toBeCloseTo(gizmo.originX + ring.ux * cos + ring.vx * sin, 6)
        expect(tip.y).toBeCloseTo(gizmo.originY + ring.uy * cos + ring.vy * sin, 6)

        // The chevron's base sits behind the tip along the analytic tangent
        // direction, the same "base corners project behind the tip" contract
        // the translate arrows' own heads already carry.
        let tangentX = -ring.ux * sin + ring.vx * cos
        let tangentY = -ring.uy * sin + ring.vy * cos
        const tangentLength = Math.hypot(tangentX, tangentY)
        if (tangentLength > 1e-6) {
          tangentX /= tangentLength
          tangentY /= tangentLength
          const midX = (base1.x + base2.x) / 2
          const midY = (base1.y + base2.y) / 2
          const along = (midX - tip.x) * tangentX + (midY - tip.y) * tangentY
          expect(along).toBeGreaterThan(0)
        }
      })
    }
  })

  it('reuses the caller\'s nested triangle buffers', () => {
    const orbit = cameraAt()
    const gizmo = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, 60, 44, gizmo)
    const heads = createRingArrowheads()
    const firstTriangle = heads[0]
    const firstPoint = heads[0][0]

    ringArrowheads(gizmo.rings[2], gizmo.originX, gizmo.originY, heads)
    expect(heads[0]).toBe(firstTriangle)
    expect(heads[0][0]).toBe(firstPoint)
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

describe('updateSnapGuideAnnotations — the dashed placement guides (TODO/ui-013)', () => {
  /**
   * @param {Partial<import('../core/library.js').SnapGuide>} [overrides]
   * @returns {import('../core/library.js').SnapGuide[]}
   */
  function guides(overrides = {}) {
    return [
      {
        axis: 0,
        visible: true,
        kind: 'center',
        x1Mm: 0,
        y1Mm: -20,
        x2Mm: 0,
        y2Mm: 120,
        zMm: 0,
        ...overrides,
      },
      { axis: 1, visible: false, kind: 'edge', x1Mm: 0, y1Mm: 0, x2Mm: 0, y2Mm: 0, zMm: 0 },
    ]
  }

  it('projects both millimetre endpoints of a guide to screen pixels', () => {
    const orbit = cameraAt()
    const out = createSnapGuideAnnotations()
    updateSnapGuideAnnotations(orbit, guides(), WIDTH_PX, HEIGHT_PX, out)

    expect(out[0].visible).toBe(true)
    expect(out[0].axis).toBe('X')
    expect(out[0].kind).toBe('center')
    // Same projection the rest of the overlay uses, so the guide lands on the
    // solid it is drawn against rather than near it.
    const near = createScreenPoint()
    worldToScreen(orbit, 0, -20, 0, WIDTH_PX, HEIGHT_PX, near)
    expect(out[0].x1).toBeCloseTo(near.x, 9)
    expect(out[0].y1).toBeCloseTo(near.y, 9)
    const far = createScreenPoint()
    worldToScreen(orbit, 0, 120, 0, WIDTH_PX, HEIGHT_PX, far)
    expect(out[0].x2).toBeCloseTo(far.x, 9)
    expect(out[0].y2).toBeCloseTo(far.y, 9)
    // The second guide was not snapped, so it is not drawn.
    expect(out[1].visible).toBe(false)
  })

  it('hides a guide whose endpoints fall behind the camera', () => {
    // The camera sits at y = -100 looking toward +Y; this guide is well behind
    // it, where the projection is valid but mirrored.
    const orbit = cameraAt({ azimuthDeg: -90, elevationDeg: 0, distanceMm: 100 })
    const out = createSnapGuideAnnotations()
    updateSnapGuideAnnotations(
      orbit,
      guides({ x1Mm: -20, y1Mm: -400, x2Mm: 20, y2Mm: -400 }),
      WIDTH_PX,
      HEIGHT_PX,
      out,
    )
    expect(out[0].visible).toBe(false)
  })

  it('mutates its output rather than allocating a new one per frame', () => {
    const orbit = cameraAt()
    const out = createSnapGuideAnnotations()
    const first = out[0]
    updateSnapGuideAnnotations(orbit, guides(), WIDTH_PX, HEIGHT_PX, out)
    expect(out[0]).toBe(first)
  })
})

describe('sketch paths (TODO/sketch-001)', () => {
  /** @param {number} x @param {number} y @param {number} z */
  const IDENTITY_AT = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]

  it('projects a closed outline in the body frame through the same camera the frame used', () => {
    const orbit = createOrbitCamera()
    orbit.snapTo('top')
    const out = createSketchPath()
    updateSketchPath(orbit, IDENTITY_AT(0, 0, 0), [[-20, -10], [20, -10], [20, 10], [-20, 10]], 0, true, 800, 600, out)
    expect(out.visible).toBe(true)
    expect(out.d.startsWith('M')).toBe(true)
    expect(out.d.trim().endsWith('Z')).toBe(true)
    expect(out.d.match(/[ML]/g)).toHaveLength(4)
    // Centred on the origin, so the outline's box is centred on the viewport.
    expect((out.minXPx + out.maxXPx) / 2).toBeCloseTo(400, 6)
  })

  it('round-trips against pick.js’s projectToSketchPlane — what a drag drew is where it is drawn', () => {
    const orbit = createOrbitCamera()
    const frame = IDENTITY_AT(30, -12, 0)
    const aspect = 800 / 600
    const local = projectToSketchPlane(orbit, -0.4, 0.25, aspect, frame, 0, [0, 0])
    if (!local) throw new Error('the default camera must see the sketch plane')
    const out = createSketchPath()
    updateSketchPath(orbit, frame, [local, [local[0] + 1, local[1]]], 0, false, 800, 600, out)
    expect(out.firstXPx).toBeCloseTo(((-0.4 + 1) / 2) * 800, 6)
    expect(out.firstYPx).toBeCloseTo(((1 - 0.25) / 2) * 600, 6)
  })

  it('projects onto a slice above the base plane, in the body frame', () => {
    const orbit = createOrbitCamera()
    orbit.snapTo('top')
    const local = projectToSketchPlane(orbit, 0, 0, 800 / 600, IDENTITY_AT(5, 7, 0), 100, [0, 0])
    // Straight down through the camera target (the origin) onto a plane whose own origin
    // is at (5, 7): the hit is (-5, -7) in the plane's frame.
    expect(local?.[0]).toBeCloseTo(-5, 6)
    expect(local?.[1]).toBeCloseTo(-7, 6)
  })

  it('hides an outline any of whose points fall behind the camera', () => {
    const orbit = createOrbitCamera({ distanceMm: 100, target: { x: 0, y: 0, z: 0 } })
    const out = createSketchPath()
    updateSketchPath(orbit, IDENTITY_AT(0, 0, 0), [[0, 0], [100000, 0], [0, 10]], 0, true, 800, 600, out)
    expect(out.visible).toBe(false)
  })

  it('measures distance to a segment, not to the infinite line through it', () => {
    // Perpendicular, inside the span.
    expect(distanceToSegmentPx(50, 10, 0, 0, 100, 0)).toBeCloseTo(10, 9)
    // Past the end: the nearest point on the segment is the endpoint itself,
    // so this is 10 (not 0, which an unclamped projection would report).
    expect(distanceToSegmentPx(110, 0, 0, 0, 100, 0)).toBeCloseTo(10, 9)
    expect(distanceToSegmentPx(-6, 8, 0, 0, 100, 0)).toBeCloseTo(10, 9)
    // On the segment.
    expect(distanceToSegmentPx(30, 0, 0, 0, 100, 0)).toBeCloseTo(0, 9)
    // Degenerate segment: distance to the one point, no division by zero.
    expect(distanceToSegmentPx(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 9)
  })
})

describe('the rotate dial (TODO/ui-064)', () => {
  /**
   * While a rotate ring is dragged, a dial is drawn in that ring's own plane: the
   * ring's own `origin + u·cos t + v·sin t` at a smaller radius, so it is right
   * under any camera with no second projection. The trap the spec names is sign
   * and facing — the readout is just a number and looks perfect while a hand
   * swings the wrong way — so the hand is checked against an independent
   * world-space rotation, not against the dial's own arithmetic.
   */

  const RING_PX = 80
  const AXIS_NAMES = ['X', 'Y', 'Z']

  /** World unit vector of axis `index`. @param {number} index */
  const unit = (index) => [index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0]

  /** The two world axes each ring spans, in `annotate.js`'s own order. */
  const SPANS = [
    [1, 2],
    [0, 2],
    [0, 1],
  ]

  /**
   * Rodrigues: turn `p` about unit axis `k` by `deg`, right-handed.
   *
   * @param {number[]} p
   * @param {number[]} k
   * @param {number} deg
   */
  function rotateAbout(p, k, deg) {
    const a = (deg * Math.PI) / 180
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const cross = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]]
    const dot = k[0] * p[0] + k[1] * p[1] + k[2] * p[2]
    return [0, 1, 2].map((i) => p[i] * cos + cross[i] * sin + k[i] * dot * (1 - cos))
  }

  /**
   * A gizmo at the screen centre under a camera, plus a helper projecting a
   * world direction to a gizmo-scaled screen point.
   *
   * @param {number} azimuthDeg
   * @param {number} elevationDeg
   */
  function rig(azimuthDeg, elevationDeg) {
    const orbit = cameraAt({ azimuthDeg, elevationDeg })
    const gizmo = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, RING_PX + 18, RING_PX, gizmo)
    /** @param {number[]} world @param {number} scale */
    const project = (world, scale) => {
      const dir = { x: 0, y: 0 }
      screenDirection(azimuthDeg, elevationDeg, world[0], world[1], world[2], dir)
      return { x: gizmo.originX + dir.x * RING_PX * scale, y: gizmo.originY + dir.y * RING_PX * scale }
    }
    return { orbit, gizmo, project }
  }

  /**
   * The screen point at ring parameter `deg` and radius `scale` (1 = on the ring).
   *
   * @param {import('./annotate.js').GizmoRing} ring
   * @param {{ originX: number, originY: number }} gizmo
   * @param {number} deg
   * @param {number} [scale]
   */
  function onRing(ring, gizmo, deg, scale = 1) {
    const t = (deg * Math.PI) / 180
    return {
      x: gizmo.originX + scale * (ring.ux * Math.cos(t) + ring.vx * Math.sin(t)),
      y: gizmo.originY + scale * (ring.uy * Math.cos(t) + ring.vy * Math.sin(t)),
    }
  }

  /**
   * The ring parameter and radius of a screen point, by inverting `[u v]` — an
   * independent reading of where a dial point sits in the ring's own plane.
   *
   * @param {import('./annotate.js').GizmoRing} ring
   * @param {{ originX: number, originY: number }} gizmo
   * @param {number} x
   * @param {number} y
   */
  function inPlane(ring, gizmo, x, y) {
    const dx = x - gizmo.originX
    const dy = y - gizmo.originY
    const det = ring.ux * ring.vy - ring.vx * ring.uy
    const c = (dx * ring.vy - ring.vx * dy) / det
    const s = (ring.ux * dy - dx * ring.uy) / det
    return { radius: Math.hypot(c, s), deg: (Math.atan2(s, c) * 180) / Math.PI }
  }

  /** Signed difference `a − b` wrapped to (−180, 180]. @param {number} a @param {number} b */
  function angleDiff(a, b) {
    let d = (a - b) % 360
    if (d > 180) d -= 360
    if (d <= -180) d += 360
    return d
  }

  /** Cameras that between them put every axis both toward and away from the viewer. */
  const CAMERAS = [
    { az: 30, el: 30 },
    { az: 30, el: 60 },
    { az: 200, el: -40 },
    { az: -120, el: 25 },
    { az: 120, el: -60 },
    { az: -60, el: 50 },
  ]

  describe('ringParamDeg — where on the ring the drag began', () => {
    it('recovers the grab parameter on a face-on ring', () => {
      const { gizmo } = rig(-90, 90)
      const ring = gizmo.rings[2]
      for (const deg of [0, 37, 90, 155, -120]) {
        const p = onRing(ring, gizmo, deg)
        expect(angleDiff(ringParamDeg(ring, gizmo.originX, gizmo.originY, p.x, p.y), deg)).toBeCloseTo(0, 6)
      }
    })

    it('recovers the parameter, not the screen angle, on a foreshortened ring (30° and 60° elevation)', () => {
      for (const elevationDeg of [30, 60]) {
        const { gizmo } = rig(25, elevationDeg)
        const ring = gizmo.rings[2]
        for (const deg of [20, 70, 135, 200, 300]) {
          // A grab lands somewhere in the fat hit band, not exactly on the line.
          const p = onRing(ring, gizmo, deg, 1.15)
          const recovered = ringParamDeg(ring, gizmo.originX, gizmo.originY, p.x, p.y)
          expect(angleDiff(recovered, deg)).toBeCloseTo(0, 6)
          // And this is genuinely not the same as the screen polar angle there,
          // or the test would prove nothing about foreshortening.
          const screenDeg = (Math.atan2(-(p.y - gizmo.originY), p.x - gizmo.originX) * 180) / Math.PI
          if (deg === 70) expect(Math.abs(angleDiff(screenDeg, deg))).toBeGreaterThan(1)
        }
      }
    })

    it('returns a finite angle on an edge-on ring and on the hub itself', () => {
      const { gizmo } = rig(-90, 90)
      const edgeOn = gizmo.rings[0]
      const p = onRing(edgeOn, gizmo, 60)
      expect(Number.isFinite(ringParamDeg(edgeOn, gizmo.originX, gizmo.originY, p.x, p.y))).toBe(true)
      expect(Number.isFinite(ringParamDeg(gizmo.rings[2], gizmo.originX, gizmo.originY, gizmo.originX, gizmo.originY))).toBe(true)
    })
  })

  describe('updateDialAnnotation', () => {
    it('draws a tick every 15°, a longer one every 45°, all in the ring\'s own plane', () => {
      const { gizmo } = rig(25, 35)
      const ring = gizmo.rings[2]
      const dial = createDialAnnotation()
      updateDialAnnotation(ring, 10, 0, gizmo.originX, gizmo.originY, dial)

      expect(dial.visible).toBe(true)
      expect(dial.degenerate).toBe(false)
      expect(DIAL_TICK_COUNT).toBe(24)
      expect(dial.ticks).toHaveLength(24)

      const outer = inPlane(ring, gizmo, dial.ticks[0].x2, dial.ticks[0].y2).radius
      // The dial is bigger than the ring, and the ring already clears the part:
      // the whole tick band (and both hands) sit outside the part.
      expect(outer).toBeGreaterThan(1.2)
      expect(outer).toBeLessThanOrEqual(1.5)
      for (let index = 0; index < 24; index += 1) {
        const tick = dial.ticks[index]
        expect(tick.major).toBe(index % 3 === 0)
        const tip = inPlane(ring, gizmo, tick.x2, tick.y2)
        const foot = inPlane(ring, gizmo, tick.x1, tick.y1)
        // Every outer end on the same circle in the ring's plane — i.e. on an
        // ellipse concentric with the ring on screen.
        expect(tip.radius).toBeCloseTo(outer, 6)
        // Radial: both ends at the same ring parameter, 15° apart round the dial.
        expect(angleDiff(foot.deg, tip.deg)).toBeCloseTo(0, 6)
        expect(Math.abs(angleDiff(tip.deg, 10 + index * 15 * (ring.axis === 'Y' ? -1 : 1)))).toBeCloseTo(0, 6)
        // Majors reach further in.
        expect(foot.radius).toBeLessThan(tip.radius)
        if (tick.major) expect(foot.radius).toBeLessThan(inPlane(ring, gizmo, dial.ticks[1].x1, dial.ticks[1].y1).radius)
      }
    })

    it('draws the hands and every tick clear of the ring, i.e. outside the part it was sized to clear', () => {
      const { gizmo } = rig(25, 35)
      for (const ring of gizmo.rings) {
        const dial = createDialAnnotation()
        updateDialAnnotation(ring, 10, 33, gizmo.originX, gizmo.originY, dial)
        expect(inPlane(ring, gizmo, dial.liveX, dial.liveY).radius).toBeGreaterThan(1)
        expect(inPlane(ring, gizmo, dial.startX, dial.startY).radius).toBeGreaterThan(1)
        for (const tick of dial.ticks) {
          expect(inPlane(ring, gizmo, tick.x1, tick.y1).radius).toBeGreaterThanOrEqual(1)
        }
      }
    })

    it('labels 0 at the grab and 90/180/270 a turn of that much further round', () => {
      const { gizmo } = rig(25, 35)
      for (const ring of gizmo.rings) {
        const dial = createDialAnnotation()
        updateDialAnnotation(ring, 40, 0, gizmo.originX, gizmo.originY, dial)
        expect(dial.labels.map((label) => label.text)).toEqual(['0', '90', '180', '270'])
        const sense = ring.axis === 'Y' ? -1 : 1
        dial.labels.forEach((label, index) => {
          const where = inPlane(ring, gizmo, label.x, label.y)
          expect(Math.abs(angleDiff(where.deg, 40 + sense * index * 90))).toBeCloseTo(0, 5)
        })
      }
    })

    it('keeps the start hand at the grab and swings the live hand exactly where the body takes that point — every axis, facing +1 and -1', () => {
      /** @type {Record<string, Set<number>>} */
      const facingsSeen = { X: new Set(), Y: new Set(), Z: new Set() }
      for (const { az, el } of CAMERAS) {
        const { gizmo, project } = rig(az, el)
        for (let axis = 0; axis < 3; axis += 1) {
          if (Math.abs(axisToward(az, el, axis)) < 0.3) continue
          facingsSeen[AXIS_NAMES[axis]].add(axisFacing(az, el, axis))
          const ring = gizmo.rings[axis]
          const [a, b] = SPANS[axis]
          const startDeg = 50
          const t0 = (startDeg * Math.PI) / 180
          // The world point on the ring's circle at the grab parameter.
          const world = [0, 1, 2].map((i) => Math.cos(t0) * unit(a)[i] + Math.sin(t0) * unit(b)[i])

          for (const turnedDeg of [30, -70, 135]) {
            const dial = createDialAnnotation()
            updateDialAnnotation(ring, startDeg, turnedDeg, gizmo.originX, gizmo.originY, dial)

            const start = project(world, DIAL_HAND_RATIO)
            expect(dial.startX).toBeCloseTo(start.x, 6)
            expect(dial.startY).toBeCloseTo(start.y, 6)

            // Turn that same point about the world axis by the turned angle —
            // what the preview mesh does to it — and project it independently.
            const expected = project(rotateAbout(world, unit(axis), turnedDeg), DIAL_HAND_RATIO)
            expect(dial.liveX).toBeCloseTo(expected.x, 6)
            expect(dial.liveY).toBeCloseTo(expected.y, 6)
          }
        }
      }
      for (const axis of AXIS_NAMES) expect([...facingsSeen[axis]].sort()).toEqual([-1, 1])
    })

    it('swings the live hand the same way round the screen as the pointer that turned it, for either facing', () => {
      // The pointer half of the same contract: `rotateDeltaDeg` turns a screen
      // sweep into degrees with `facing`, and the hand turns those degrees back
      // into a screen sweep. Get either backwards and they disagree here.
      let checked = 0
      for (const { az, el } of CAMERAS) {
        const { gizmo } = rig(az, el)
        for (let axis = 0; axis < 3; axis += 1) {
          if (Math.abs(axisToward(az, el, axis)) < 0.3) continue
          const ring = gizmo.rings[axis]
          const facing = axisFacing(az, el, axis)
          for (const delta of [12, -12]) {
            const from = onRing(ring, gizmo, 80)
            const to = onRing(ring, gizmo, 80 + delta)
            const turned = rotateDeltaDeg(gizmo.originX, gizmo.originY, from.x, from.y, to.x, to.y, facing)
            const startDeg = ringParamDeg(ring, gizmo.originX, gizmo.originY, from.x, from.y)
            const dial = createDialAnnotation()
            updateDialAnnotation(ring, startDeg, turned, gizmo.originX, gizmo.originY, dial)

            const cross = (/** @type {number} */ x1, /** @type {number} */ y1, /** @type {number} */ x2, /** @type {number} */ y2) =>
              (x1 - gizmo.originX) * (y2 - gizmo.originY) - (y1 - gizmo.originY) * (x2 - gizmo.originX)
            const pointerSense = Math.sign(cross(from.x, from.y, to.x, to.y))
            const handSense = Math.sign(cross(dial.startX, dial.startY, dial.liveX, dial.liveY))
            expect(handSense).toBe(pointerSense)
            // Only the *direction* is asserted: `rotateDeltaDeg` measures the
            // pointer's screen angle, which on a foreshortened ring is not the
            // ring parameter, so the hand (which turns with the body) can run a
            // little ahead of or behind the pointer — but never the other way.
            checked += 1
          }
        }
      }
      expect(checked).toBeGreaterThan(20)
    })

    it('puts a 3-point arrowhead on the live hand, tip at the hand\'s end, pointing outward', () => {
      const { gizmo } = rig(25, 35)
      const dial = createDialAnnotation()
      updateDialAnnotation(gizmo.rings[2], 0, 60, gizmo.originX, gizmo.originY, dial)
      expect(dial.liveHead).toHaveLength(3)
      expect(dial.liveHead[0].x).toBeCloseTo(dial.liveX, 9)
      expect(dial.liveHead[0].y).toBeCloseTo(dial.liveY, 9)
      const baseX = (dial.liveHead[1].x + dial.liveHead[2].x) / 2
      const baseY = (dial.liveHead[1].y + dial.liveHead[2].y) / 2
      // The base sits between the hub and the tip.
      expect(Math.hypot(baseX - gizmo.originX, baseY - gizmo.originY)).toBeLessThan(
        Math.hypot(dial.liveX - gizmo.originX, dial.liveY - gizmo.originY),
      )
    })

    it('fills a 270° sweep with a 270° sector, not a -90° one', () => {
      const { gizmo } = rig(-90, 90)
      for (const ring of [gizmo.rings[2]]) {
        const dial = createDialAnnotation()
        updateDialAnnotation(ring, 0, 270, gizmo.originX, gizmo.originY, dial)
        expect(dial.sectorVisible).toBe(true)
        expect(dial.sector).toHaveLength(DIAL_SECTOR_POINTS)
        expect(dial.sectorSweepDeg).toBeCloseTo(270, 9)

        // Walk the arc: every step goes the same way, and they add up to 270.
        let total = 0
        for (let index = 1; index < dial.sector.length; index += 1) {
          const prev = inPlane(ring, gizmo, dial.sector[index - 1].x, dial.sector[index - 1].y).deg
          const next = inPlane(ring, gizmo, dial.sector[index].x, dial.sector[index].y).deg
          const step = angleDiff(next, prev)
          expect(step).toBeGreaterThan(0)
          total += step
        }
        expect(total).toBeCloseTo(270, 6)
        // The middle of the sector is at 135°, on the far side from where a
        // -90° wedge would be.
        const middle = dial.sector[(DIAL_SECTOR_POINTS - 1) / 2]
        expect(inPlane(ring, gizmo, middle.x, middle.y).deg).toBeCloseTo(135, 6)
      }
    })

    it('a sweep past a full turn fills the whole disc rather than wrapping round again', () => {
      const { gizmo } = rig(-90, 90)
      const dial = createDialAnnotation()
      updateDialAnnotation(gizmo.rings[2], 0, -400, gizmo.originX, gizmo.originY, dial)
      expect(dial.sectorSweepDeg).toBeCloseTo(-360, 9)
      expect(dial.turnedDeg).toBeCloseTo(-400, 9)
    })

    it('a zero sweep draws no sector and carries +0, not -0', () => {
      const { gizmo } = rig(25, 35)
      const dial = createDialAnnotation()
      updateDialAnnotation(gizmo.rings[2], 30, -0, gizmo.originX, gizmo.originY, dial)
      expect(dial.sectorVisible).toBe(false)
      expect(Object.is(dial.turnedDeg, 0)).toBe(true)
      // The two hands coincide.
      expect(dial.liveX).toBeCloseTo(dial.startX, 9)
      expect(dial.liveY).toBeCloseTo(dial.startY, 9)
    })

    it('an edge-on ring takes the degenerate path: live hand only, no 24 ticks on a line', () => {
      // Top view: the X and Y rings are seen exactly edge-on.
      const { gizmo } = rig(-90, 90)
      const dial = createDialAnnotation()
      updateDialAnnotation(gizmo.rings[0], 30, 45, gizmo.originX, gizmo.originY, dial)
      expect(dial.visible).toBe(true)
      expect(dial.degenerate).toBe(true)
      expect(dial.sectorVisible).toBe(false)
      expect(Number.isFinite(dial.liveX)).toBe(true)
      expect(Number.isFinite(dial.liveY)).toBe(true)

      // Nearly edge-on (a couple of degrees off) is still degenerate… The Y
      // ring, not X: at azimuth -90 the X axis lies across the screen at every
      // elevation, so the X ring never tilts away from edge-on there.
      const nearly = rig(-90, 88)
      updateDialAnnotation(nearly.gizmo.rings[1], 30, 45, nearly.gizmo.originX, nearly.gizmo.originY, dial)
      expect(dial.degenerate).toBe(true)
      // …and a comfortably tilted ring is not, with the same buffers.
      const tilted = rig(-90, 40)
      updateDialAnnotation(tilted.gizmo.rings[1], 30, 45, tilted.gizmo.originX, tilted.gizmo.originY, dial)
      expect(dial.degenerate).toBe(false)
      expect(dial.sectorVisible).toBe(true)
    })

    it('mutates the caller\'s buffers rather than allocating new ones', () => {
      const { gizmo } = rig(25, 35)
      const dial = createDialAnnotation()
      const tick = dial.ticks[3]
      const head = dial.liveHead[1]
      const arc = dial.sector[5]
      const label = dial.labels[2]
      updateDialAnnotation(gizmo.rings[2], 0, 30, gizmo.originX, gizmo.originY, dial)
      updateDialAnnotation(gizmo.rings[1], 90, -120, gizmo.originX, gizmo.originY, dial)
      expect(dial.ticks[3]).toBe(tick)
      expect(dial.liveHead[1]).toBe(head)
      expect(dial.sector[5]).toBe(arc)
      expect(dial.labels[2]).toBe(label)
      expect(dial.axis).toBe('Y')
    })
  })

  describe('placeDialReadout', () => {
    const PHONE = { width: 390, height: 844 }

    /** @param {import('./annotate.js').DialAnnotation} dial */
    function box(dial) {
      return {
        left: dial.readoutX - DIAL_READOUT_WIDTH_PX / 2,
        right: dial.readoutX + DIAL_READOUT_WIDTH_PX / 2,
        top: dial.readoutY - DIAL_READOUT_HEIGHT_PX / 2,
        bottom: dial.readoutY + DIAL_READOUT_HEIGHT_PX / 2,
      }
    }

    it('uses legible text: at least 14 px', () => {
      expect(DIAL_READOUT_FONT_PX).toBeGreaterThanOrEqual(14)
    })

    it('with a mouse, sits clear above the ring, centred on the hub', () => {
      const { gizmo } = rig(25, 35)
      const ring = gizmo.rings[2]
      const dial = createDialAnnotation()
      updateDialAnnotation(ring, 0, 30, gizmo.originX, gizmo.originY, dial)
      placeDialReadout(ring, gizmo.originX, gizmo.originY, gizmo.originX + 60, gizmo.originY, false, WIDTH_PX, HEIGHT_PX, dial)
      const b = box(dial)
      expect(dial.readoutX).toBeCloseTo(gizmo.originX, 6)
      // Above the ring's own top edge on screen.
      expect(b.bottom).toBeLessThan(gizmo.originY - Math.hypot(ring.uy, ring.vy))
    })

    it('on touch, sits up and away from the fingertip so the finger never covers it', () => {
      const { gizmo } = rig(25, 35)
      const ring = gizmo.rings[2]
      const dial = createDialAnnotation()
      const finger = { x: gizmo.originX + 70, y: gizmo.originY + 40 }
      placeDialReadout(ring, gizmo.originX, gizmo.originY, finger.x, finger.y, true, WIDTH_PX, HEIGHT_PX, dial)
      const b = box(dial)
      // Wholly above the finger, with a fingertip's worth of clearance.
      expect(b.bottom).toBeLessThanOrEqual(finger.y - 40)
    })

    it('stays inside the viewport at phone width, wherever the finger is', () => {
      const dial = createDialAnnotation()
      const { gizmo } = rig(25, 35)
      const ring = gizmo.rings[2]
      for (const [x, y] of [
        [2, 2],
        [388, 2],
        [2, 842],
        [388, 842],
        [195, 30],
        [380, 420],
      ]) {
        for (const touch of [true, false]) {
          placeDialReadout(ring, x, y, x, y, touch, PHONE.width, PHONE.height, dial)
          const b = box(dial)
          expect(b.left).toBeGreaterThanOrEqual(0)
          expect(b.top).toBeGreaterThanOrEqual(0)
          expect(b.right).toBeLessThanOrEqual(PHONE.width)
          expect(b.bottom).toBeLessThanOrEqual(PHONE.height)
        }
      }
    })

    it('near the top edge on touch, moves beside the finger rather than under it', () => {
      const dial = createDialAnnotation()
      const { gizmo } = rig(25, 35)
      const ring = gizmo.rings[2]
      const finger = { x: 120, y: 30 }
      placeDialReadout(ring, 200, 200, finger.x, finger.y, true, PHONE.width, PHONE.height, dial)
      const b = box(dial)
      const coversFinger =
        finger.x > b.left - 20 && finger.x < b.right + 20 && finger.y > b.top - 20 && finger.y < b.bottom + 20
      expect(coversFinger).toBe(false)
    })
  })
})

describe('the translate ruler (TODO/ui-065)', () => {
  /**
   * While a translate arm is dragged, a ruler lies along that arm's screen line
   * from where the drag began: ticks, a fixed start mark, a live marker at the
   * snapped distance and a span between them. The trap the spec names is sign:
   * a ruler that runs the opposite way to the body still reads plausibly, so the
   * direction is checked against the arm's tip and the world axis, and the
   * marker against `translateDeltaMm`, the function that moves the body.
   */

  const ARM_PX = 98
  const RING_PX = 80
  const MM_PER_PX = 0.5

  /**
   * A gizmo at the screen centre under a camera.
   *
   * @param {number} azimuthDeg
   * @param {number} elevationDeg
   */
  function armRig(azimuthDeg, elevationDeg) {
    const orbit = cameraAt({ azimuthDeg, elevationDeg })
    const gizmo = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 0, WIDTH_PX, HEIGHT_PX, ARM_PX, RING_PX, gizmo)
    return { orbit, gizmo }
  }

  /**
   * The arm's unit screen direction, read off the drawn arm.
   *
   * @param {import('./annotate.js').GizmoAnnotation} gizmo
   * @param {number} axis
   */
  function tipward(gizmo, axis) {
    const arrow = gizmo.arrows[axis]
    const x = arrow.tipX - gizmo.originX
    const y = arrow.tipY - gizmo.originY
    const length = Math.hypot(x, y)
    return { x: x / length, y: y / length }
  }

  /**
   * A grab point part-way along an arm, where the hit target actually is.
   *
   * @param {import('./annotate.js').GizmoAnnotation} gizmo
   * @param {number} axis
   */
  function grabOn(gizmo, axis) {
    const dir = tipward(gizmo, axis)
    return { x: gizmo.originX + dir.x * ARM_PX * 0.7, y: gizmo.originY + dir.y * ARM_PX * 0.7 }
  }

  /** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
  const dot = (a, b) => a.x * b.x + a.y * b.y

  /** The rendering cases the sign test runs: a diagonal arm and a horizontal one. */
  const SIGN_CASES = [
    { name: 'diagonal X arm', az: 25, el: 35, axis: 0 },
    { name: 'diagonal Y arm', az: 25, el: 35, axis: 1 },
    { name: 'horizontal X arm', az: -90, el: 40, axis: 0 },
  ]

  describe('updateRulerAnnotation', () => {
    it('puts every tick on the arm\'s screen line, across it, at whole multiples of the tick spacing', () => {
      const { gizmo } = armRig(25, 35)
      const start = grabOn(gizmo, 0)
      const dir = tipward(gizmo, 0)
      const ruler = createRulerAnnotation()
      updateRulerAnnotation(gizmo, 0, start.x, start.y, 23.4, MM_PER_PX, 1, ruler)

      expect(ruler.visible).toBe(true)
      expect(ruler.axis).toBe('X')
      expect(ruler.degenerate).toBe(false)
      expect(ruler.tickCount).toBeGreaterThan(3)
      for (let index = 0; index < ruler.tickCount; index += 1) {
        const tick = ruler.ticks[index]
        const mid = { x: (tick.x1 + tick.x2) / 2 - start.x, y: (tick.y1 + tick.y2) / 2 - start.y }
        // On the line through the start along the arm: no component across it.
        expect(mid.x * dir.y - mid.y * dir.x).toBeCloseTo(0, 6)
        // Drawn across the line, not along it.
        expect(dot({ x: tick.x2 - tick.x1, y: tick.y2 - tick.y1 }, dir)).toBeCloseTo(0, 6)
        // At its own value, measured the way the body is moved.
        expect(translateDeltaMm(gizmo, 0, mid.x, mid.y, MM_PER_PX)).toBeCloseTo(tick.valueMm, 6)
        expect(tick.valueMm / ruler.tickMm).toBeCloseTo(Math.round(tick.valueMm / ruler.tickMm), 6)
        // Every fifth tick, counted from the start, is labelled.
        expect(tick.labelled).toBe(Math.round(tick.valueMm / ruler.tickMm) % 5 === 0)
      }
      // The bar runs the length of the ticks and contains both the start and the live marker.
      const along = (/** @type {number} */ x, /** @type {number} */ y) => dot({ x: x - start.x, y: y - start.y }, dir)
      const barLo = Math.min(along(ruler.barX1, ruler.barY1), along(ruler.barX2, ruler.barY2))
      const barHi = Math.max(along(ruler.barX1, ruler.barY1), along(ruler.barX2, ruler.barY2))
      expect(barLo).toBeLessThan(0)
      expect(barHi).toBeGreaterThan(along(ruler.liveX, ruler.liveY))
    })

    for (const { name, az, el, axis } of SIGN_CASES) {
      it(`sign: toward the tip reads positive and the span runs tipward; away is the mirror (${name})`, () => {
        const { gizmo } = armRig(az, el)
        const dir = tipward(gizmo, axis)
        if (name.startsWith('horizontal')) expect(Math.abs(dir.y)).toBeLessThan(1e-9)
        else expect(Math.min(Math.abs(dir.x), Math.abs(dir.y))).toBeGreaterThan(0.2)
        // The world axis, projected independently of the gizmo's own arm.
        const world = { x: 0, y: 0 }
        screenDirection(az, el, axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0, world)
        const start = grabOn(gizmo, axis)
        const tip = { x: gizmo.arrows[axis].tipX, y: gizmo.arrows[axis].tipY }

        for (const sign of [1, -1]) {
          // Along the arm, with some wobble across it that must not count.
          const pointer = {
            x: start.x + sign * dir.x * 40 - dir.y * 13,
            y: start.y + sign * dir.y * 40 + dir.x * 13,
          }
          const distanceMm = translateDeltaMm(gizmo, axis, pointer.x - start.x, pointer.y - start.y, MM_PER_PX)
          expect(Math.sign(distanceMm)).toBe(sign)
          expect(Math.abs(distanceMm)).toBeCloseTo(40 * MM_PER_PX, 6)

          const ruler = createRulerAnnotation()
          updateRulerAnnotation(gizmo, axis, start.x, start.y, distanceMm, MM_PER_PX, 0.1, ruler)
          const live = { x: ruler.liveX - start.x, y: ruler.liveY - start.y }

          // The live marker sits on the pointer's projection onto the arm…
          expect(ruler.liveX).toBeCloseTo(start.x + sign * dir.x * 40, 6)
          expect(ruler.liveY).toBeCloseTo(start.y + sign * dir.y * 40, 6)
          // …which is the same distance the body is moved by.
          expect(translateDeltaMm(gizmo, axis, live.x, live.y, MM_PER_PX)).toBeCloseTo(distanceMm, 6)
          // Toward the tip for +, away from it for −, in screen and in the world.
          const fromTip = Math.hypot(ruler.liveX - tip.x, ruler.liveY - tip.y)
          const startFromTip = Math.hypot(start.x - tip.x, start.y - tip.y)
          expect(Math.sign(startFromTip - fromTip)).toBe(sign)
          expect(Math.sign(dot(live, world))).toBe(sign)

          // The span runs from the start mark to the live marker, the same way.
          expect(ruler.spanVisible).toBe(true)
          const near = { x: (ruler.span[0].x + ruler.span[3].x) / 2, y: (ruler.span[0].y + ruler.span[3].y) / 2 }
          const far = { x: (ruler.span[1].x + ruler.span[2].x) / 2, y: (ruler.span[1].y + ruler.span[2].y) / 2 }
          expect(near.x).toBeCloseTo(start.x, 6)
          expect(near.y).toBeCloseTo(start.y, 6)
          expect(far.x).toBeCloseTo(ruler.liveX, 6)
          expect(far.y).toBeCloseTo(ruler.liveY, 6)
          expect(Math.sign(dot({ x: far.x - near.x, y: far.y - near.y }, world))).toBe(sign)

          // Tick labels carry the body's sign: positive ticks on the tip side.
          let positive = 0
          let negative = 0
          for (let index = 0; index < ruler.tickCount; index += 1) {
            const tick = ruler.ticks[index]
            const side = dot({ x: (tick.x1 + tick.x2) / 2 - start.x, y: (tick.y1 + tick.y2) / 2 - start.y }, world)
            if (tick.valueMm > 0) {
              positive += 1
              expect(side).toBeGreaterThan(0)
            } else if (tick.valueMm < 0) {
              negative += 1
              expect(side).toBeLessThan(0)
            }
          }
          expect(sign > 0 ? positive : negative).toBeGreaterThan(0)

          // The live marker points the way it travelled: its base trails behind.
          const base = {
            x: (ruler.liveHead[1].x + ruler.liveHead[2].x) / 2 - ruler.liveX,
            y: (ruler.liveHead[1].y + ruler.liveHead[2].y) / 2 - ruler.liveY,
          }
          expect(ruler.liveHead[0].x).toBeCloseTo(ruler.liveX, 9)
          expect(ruler.liveHead[0].y).toBeCloseTo(ruler.liveY, 9)
          expect(Math.sign(dot(base, world))).toBe(-sign)
        }
      })
    }

    it('keeps the start mark exactly where the drag began, across updates', () => {
      const { gizmo } = armRig(25, 35)
      const start = grabOn(gizmo, 1)
      const ruler = createRulerAnnotation()
      updateRulerAnnotation(gizmo, 1, start.x, start.y, 10, MM_PER_PX, 1, ruler)
      const mark = [ruler.markX1, ruler.markY1, ruler.markX2, ruler.markY2]
      expect((mark[0] + mark[2]) / 2).toBeCloseTo(start.x, 9)
      expect((mark[1] + mark[3]) / 2).toBeCloseTo(start.y, 9)
      updateRulerAnnotation(gizmo, 1, start.x, start.y, -37.5, MM_PER_PX, 5, ruler)
      updateRulerAnnotation(gizmo, 1, start.x, start.y, 2.3, MM_PER_PX, 0.1, ruler)
      expect([ruler.markX1, ruler.markY1, ruler.markX2, ruler.markY2]).toEqual(mark)
      expect(ruler.startX).toBe(start.x)
      expect(ruler.startY).toBe(start.y)
    })

    it('a distance of zero draws no span and carries +0, not -0; the marker sits on the start', () => {
      const { gizmo } = armRig(25, 35)
      const start = grabOn(gizmo, 0)
      const ruler = createRulerAnnotation()
      // The pointer exactly on the start point is a zero distance, by translateDeltaMm.
      const distanceMm = translateDeltaMm(gizmo, 0, 0, 0, MM_PER_PX)
      updateRulerAnnotation(gizmo, 0, start.x, start.y, -distanceMm, MM_PER_PX, 0.1, ruler)
      expect(ruler.spanVisible).toBe(false)
      expect(Object.is(ruler.distanceMm, 0)).toBe(true)
      expect(ruler.liveX).toBeCloseTo(start.x, 9)
      expect(ruler.liveY).toBeCloseTo(start.y, 9)
      // A zero ruler still shows where 0 is: the start mark and its ticks.
      expect(ruler.tickCount).toBeGreaterThan(0)
    })

    it('widens the tick spacing at the fine step so no more than ~40 ticks are drawn, never closer than a few px', () => {
      const { gizmo } = armRig(25, 35)
      const start = grabOn(gizmo, 0)
      const ruler = createRulerAnnotation()
      for (const [distanceMm, mmPerPixel] of [
        [12.4, 0.5],
        [75, 0.5], // a single move that jumps more than 50 mm
        [-140, 0.25],
        [2000, 2],
        [3.2, 0.05],
      ]) {
        updateRulerAnnotation(gizmo, 0, start.x, start.y, distanceMm, mmPerPixel, 0.1, ruler)
        expect(ruler.tickCount).toBeGreaterThan(0)
        expect(ruler.tickCount).toBeLessThanOrEqual(RULER_MAX_TICKS)
        expect(RULER_MAX_TICKS).toBeLessThanOrEqual(41)
        expect(ruler.tickMm / mmPerPixel).toBeGreaterThanOrEqual(RULER_MIN_TICK_PX - 1e-9)
        // The ticks land on values the step can reach.
        expect(ruler.tickMm / 0.1).toBeCloseTo(Math.round(ruler.tickMm / 0.1), 6)
        // And they cover the whole travel, start to live.
        const values = ruler.ticks.slice(0, ruler.tickCount).map((tick) => tick.valueMm)
        expect(Math.min(...values)).toBeLessThanOrEqual(Math.min(0, distanceMm) + ruler.tickMm)
        expect(Math.min(...values)).toBeLessThanOrEqual(0)
        expect(Math.max(...values)).toBeGreaterThanOrEqual(Math.max(0, distanceMm) - ruler.tickMm)
        expect(Number.isFinite(ruler.liveX) && Number.isFinite(ruler.liveY)).toBe(true)
      }
    })

    it('at a coarse step, the ticks are the step itself while they fit', () => {
      const { gizmo } = armRig(25, 35)
      const start = grabOn(gizmo, 0)
      const ruler = createRulerAnnotation()
      updateRulerAnnotation(gizmo, 0, start.x, start.y, 30, 0.5, 5, ruler)
      expect(ruler.tickMm).toBeCloseTo(5, 9)
      updateRulerAnnotation(gizmo, 0, start.x, start.y, 30, 0.5, 1, ruler)
      expect(ruler.tickMm).toBeCloseTo(5, 9) // 1 mm is 2 px apart at 0.5 mm/px: widened
      updateRulerAnnotation(gizmo, 0, start.x, start.y, 8, 0.1, 1, ruler)
      expect(ruler.tickMm).toBeCloseTo(1, 9)
    })

    it('an edge-on arm takes the degenerate path: only the live marker, no ticks, no span', () => {
      // A couple of degrees off the Y axis's own line of sight.
      const { gizmo } = armRig(-90, 5)
      expect(gizmo.arrows[1].visible).toBe(true)
      const start = grabOn(gizmo, 1)
      const ruler = createRulerAnnotation()
      updateRulerAnnotation(gizmo, 1, start.x, start.y, 12, MM_PER_PX, 1, ruler)
      expect(ruler.visible).toBe(true)
      expect(ruler.degenerate).toBe(true)
      expect(ruler.tickCount).toBe(0)
      expect(ruler.spanVisible).toBe(false)
      expect(Number.isFinite(ruler.liveX) && Number.isFinite(ruler.liveY)).toBe(true)
      expect(ruler.distanceMm).toBeCloseTo(12, 9)

      // A comfortably tilted arm is not, with the same buffers.
      const tilted = armRig(-90, 40)
      const grab = grabOn(tilted.gizmo, 1)
      updateRulerAnnotation(tilted.gizmo, 1, grab.x, grab.y, 12, MM_PER_PX, 1, ruler)
      expect(ruler.degenerate).toBe(false)
      expect(ruler.tickCount).toBeGreaterThan(0)
      expect(ruler.spanVisible).toBe(true)
    })

    it('a zero-length or hidden arm reads zero, like translateDeltaMm, and stays finite', () => {
      const { gizmo } = armRig(25, 35)
      // Zero length: tip on the hub.
      gizmo.arrows[0].tipX = gizmo.originX
      gizmo.arrows[0].tipY = gizmo.originY
      expect(translateDeltaMm(gizmo, 0, 30, 30, MM_PER_PX)).toBe(0)
      const ruler = createRulerAnnotation()
      updateRulerAnnotation(gizmo, 0, 400, 300, 25, MM_PER_PX, 1, ruler)
      expect(ruler.degenerate).toBe(true)
      expect(Object.is(ruler.distanceMm, 0)).toBe(true)
      expect(ruler.liveX).toBeCloseTo(400, 9)
      expect(ruler.liveY).toBeCloseTo(300, 9)
      for (const point of ruler.liveHead) expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)

      // Hidden: the top view hides the Z arm outright.
      const top = cameraAt()
      top.snapTo('top')
      const hidden = createGizmoAnnotation()
      updateGizmoAnnotation(top, 0, 0, 0, WIDTH_PX, HEIGHT_PX, ARM_PX, RING_PX, hidden)
      expect(hidden.arrows[2].visible).toBe(false)
      updateRulerAnnotation(hidden, 2, 400, 300, 25, MM_PER_PX, 1, ruler)
      expect(ruler.degenerate).toBe(true)
      expect(Object.is(ruler.distanceMm, 0)).toBe(true)
      expect(ruler.axis).toBe('Z')
    })

    it('a non-positive scale is degenerate, never NaN', () => {
      const { gizmo } = armRig(25, 35)
      const ruler = createRulerAnnotation()
      for (const scale of [0, -1, Number.NaN]) {
        updateRulerAnnotation(gizmo, 0, 400, 300, 5, scale, 1, ruler)
        expect(ruler.degenerate).toBe(true)
        expect(Number.isFinite(ruler.liveX) && Number.isFinite(ruler.liveY)).toBe(true)
      }
    })

    it('mutates the caller\'s buffers rather than allocating new ones', () => {
      const { gizmo } = armRig(25, 35)
      const ruler = createRulerAnnotation()
      const tick = ruler.ticks[3]
      const head = ruler.liveHead[1]
      const corner = ruler.span[2]
      expect(ruler.ticks).toHaveLength(RULER_MAX_TICKS)
      updateRulerAnnotation(gizmo, 0, 400, 300, 12, MM_PER_PX, 1, ruler)
      updateRulerAnnotation(gizmo, 2, 400, 300, -80, MM_PER_PX, 0.1, ruler)
      expect(ruler.ticks[3]).toBe(tick)
      expect(ruler.liveHead[1]).toBe(head)
      expect(ruler.span[2]).toBe(corner)
      expect(ruler.ticks).toHaveLength(RULER_MAX_TICKS)
      expect(ruler.axis).toBe('Z')
    })
  })

  describe('placeRulerReadout', () => {
    const PHONE = { width: 390, height: 844 }

    /** @param {import('./annotate.js').RulerAnnotation} ruler */
    function box(ruler) {
      return {
        left: ruler.readoutX - RULER_READOUT_WIDTH_PX / 2,
        right: ruler.readoutX + RULER_READOUT_WIDTH_PX / 2,
        top: ruler.readoutY - RULER_READOUT_HEIGHT_PX / 2,
        bottom: ruler.readoutY + RULER_READOUT_HEIGHT_PX / 2,
      }
    }

    it('uses legible text: at least 14 px', () => {
      expect(RULER_READOUT_FONT_PX).toBeGreaterThanOrEqual(14)
    })

    it('with a mouse, sits beside the start mark, clear of the ruler line', () => {
      for (const { az, el, axis } of SIGN_CASES) {
        const { gizmo } = armRig(az, el)
        const start = grabOn(gizmo, axis)
        const dir = tipward(gizmo, axis)
        const ruler = createRulerAnnotation()
        updateRulerAnnotation(gizmo, axis, start.x, start.y, 20, MM_PER_PX, 1, ruler)
        placeRulerReadout(ruler.liveX, ruler.liveY, false, WIDTH_PX, HEIGHT_PX, ruler)
        const b = box(ruler)
        // Near the start…
        expect(Math.hypot(ruler.readoutX - start.x, ruler.readoutY - start.y)).toBeLessThan(110)
        // …and no corner of the pill on the far side of, or on, the ruler's line.
        const across = [
          [b.left, b.top],
          [b.right, b.top],
          [b.left, b.bottom],
          [b.right, b.bottom],
        ].map(([x, y]) => (x - start.x) * dir.y - (y - start.y) * dir.x)
        const sides = new Set(across.map((value) => Math.sign(value)))
        expect(sides.size).toBe(1)
        expect(Math.min(...across.map(Math.abs))).toBeGreaterThan(4)
      }
    })

    it('on touch, sits up and away from the fingertip so the finger never covers it', () => {
      const { gizmo } = armRig(25, 35)
      const ruler = createRulerAnnotation()
      updateRulerAnnotation(gizmo, 0, 400, 300, 20, MM_PER_PX, 1, ruler)
      const finger = { x: 380, y: 340 }
      placeRulerReadout(finger.x, finger.y, true, WIDTH_PX, HEIGHT_PX, ruler)
      expect(box(ruler).bottom).toBeLessThanOrEqual(finger.y - 40)
    })

    it('stays inside the viewport at phone width, wherever the finger is', () => {
      const { gizmo } = armRig(25, 35)
      const ruler = createRulerAnnotation()
      for (const [x, y] of [
        [2, 2],
        [388, 2],
        [2, 842],
        [388, 842],
        [195, 30],
        [380, 420],
      ]) {
        for (const touch of [true, false]) {
          updateRulerAnnotation(gizmo, 0, x, y, 20, MM_PER_PX, 1, ruler)
          placeRulerReadout(x, y, touch, PHONE.width, PHONE.height, ruler)
          const b = box(ruler)
          expect(b.left).toBeGreaterThanOrEqual(0)
          expect(b.top).toBeGreaterThanOrEqual(0)
          expect(b.right).toBeLessThanOrEqual(PHONE.width)
          expect(b.bottom).toBeLessThanOrEqual(PHONE.height)
        }
      }
    })

    it('near the top edge on touch, moves beside the finger rather than under it', () => {
      const { gizmo } = armRig(25, 35)
      const ruler = createRulerAnnotation()
      const finger = { x: 120, y: 30 }
      updateRulerAnnotation(gizmo, 0, 200, 40, 20, MM_PER_PX, 1, ruler)
      placeRulerReadout(finger.x, finger.y, true, PHONE.width, PHONE.height, ruler)
      const b = box(ruler)
      const coversFinger =
        finger.x > b.left - 20 && finger.x < b.right + 20 && finger.y > b.top - 20 && finger.y < b.bottom + 20
      expect(coversFinger).toBe(false)
    })
  })
})

import { describe, expect, it } from 'vitest'

import { createOrbitCamera } from './camera.js'
import {
  createBoxScreenBounds,
  createMarqueeRect,
  marqueeIntersectsBox,
  updateBoxScreenBounds,
  updateMarqueeRect,
} from './annotate.js'

/**
 * The marquee-select overlay's maths (`TODO/ui-024`): rectangle normalisation
 * and the body-vs-rectangle intersection test, alongside `annotate.spec.js`'s
 * coverage of the rest of `src/render/annotate.js` per that file's own header.
 *
 * Framework-free, unit-tested in plain Node with no GPU and no DOM, per
 * CLAUDE.md's "geometry logic belongs in `src/core/`... a component doing
 * coordinate math beyond laying out its own pixels is a bug waiting to
 * happen" — `Viewport.vue` only calls these, it does no maths of its own.
 */

const WIDTH_PX = 800
const HEIGHT_PX = 600

/** A camera looking along +Y (the `front` preset), for predictable projection. */
function frontCamera() {
  return createOrbitCamera({ azimuthDeg: -90, elevationDeg: 0, distanceMm: 420 })
}

describe('updateMarqueeRect', () => {
  it('normalises a drag toward the top-left into a positive-size rect', () => {
    const rect = createMarqueeRect()
    updateMarqueeRect(50, 80, 10, 20, rect)
    expect(rect.x).toBe(10)
    expect(rect.y).toBe(20)
    expect(rect.width).toBe(40)
    expect(rect.height).toBe(60)
  })

  it('normalises a drag toward the bottom-right the same way', () => {
    const rect = createMarqueeRect()
    updateMarqueeRect(10, 20, 50, 80, rect)
    expect(rect.x).toBe(10)
    expect(rect.y).toBe(20)
    expect(rect.width).toBe(40)
    expect(rect.height).toBe(60)
  })

  it('a degenerate zero-travel drag produces a zero-size rectangle, not a crash', () => {
    // The case Viewport.vue's own CLICK_SLOP_PX gating keeps out of this
    // function in practice (a real click falls through to ordinary
    // click-select, per this task's Testing section) — but the pure helper
    // still has to stay well-defined for it.
    const rect = createMarqueeRect()
    updateMarqueeRect(120, 90, 120, 90, rect)
    expect(rect.x).toBe(120)
    expect(rect.y).toBe(90)
    expect(rect.width).toBe(0)
    expect(rect.height).toBe(0)
  })
})

describe('updateBoxScreenBounds + marqueeIntersectsBox', () => {
  it('a body fully inside the marquee is enclosed', () => {
    const orbit = frontCamera()
    const bounds = createBoxScreenBounds()
    updateBoxScreenBounds(orbit, [-5, -5, -5], [5, 5, 5], WIDTH_PX, HEIGHT_PX, bounds)
    expect(bounds.visible).toBe(true)

    const rect = { x: 0, y: 0, width: WIDTH_PX, height: HEIGHT_PX }
    expect(marqueeIntersectsBox(rect, bounds)).toBe(true)
  })

  it('a body fully outside the marquee is not enclosed', () => {
    const orbit = frontCamera()
    const bounds = createBoxScreenBounds()
    updateBoxScreenBounds(orbit, [-5, -5, -5], [5, 5, 5], WIDTH_PX, HEIGHT_PX, bounds)

    const rect = { x: bounds.maxX + 50, y: bounds.maxY + 50, width: 20, height: 20 }
    expect(marqueeIntersectsBox(rect, bounds)).toBe(false)
  })

  it('a body only partially overlapping the marquee still counts as enclosed', () => {
    // TODO/ui-024's own stated choice: partial overlap counts, matching most
    // CAD/DCC tools' marquee convention.
    const orbit = frontCamera()
    const bounds = createBoxScreenBounds()
    updateBoxScreenBounds(orbit, [-5, -5, -5], [5, 5, 5], WIDTH_PX, HEIGHT_PX, bounds)

    const midX = (bounds.minX + bounds.maxX) / 2
    const rect = {
      x: bounds.minX - 15,
      y: bounds.minY - 15,
      // Reaches only the left half of the box's screen bounds.
      width: midX - bounds.minX + 15,
      height: bounds.maxY - bounds.minY + 30,
    }
    expect(rect.x + rect.width).toBeLessThan(bounds.maxX)
    expect(marqueeIntersectsBox(rect, bounds)).toBe(true)
  })

  it('a body behind the camera has no screen bounds and is never enclosed', () => {
    const orbit = frontCamera()
    const bounds = createBoxScreenBounds()
    // The front camera sits at world Y = -420 looking toward +Y; a box beyond
    // that, at Y < -420, projects entirely behind it.
    updateBoxScreenBounds(orbit, [-5, -1010, -5], [5, -990, 5], WIDTH_PX, HEIGHT_PX, bounds)
    expect(bounds.visible).toBe(false)

    const rect = { x: 0, y: 0, width: WIDTH_PX, height: HEIGHT_PX }
    expect(marqueeIntersectsBox(rect, bounds)).toBe(false)
  })
})

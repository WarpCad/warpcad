// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Object3D, Vector3 } from 'three'

import { createDialAnnotation, createGizmoAnnotation, createRulerAnnotation } from './annotate.js'
import { SPEED_STALL_MS } from './dragSteps.js'
import { createGizmoDrag } from './gizmoDrag.js'

/**
 * `createGizmoDrag` writes a preview transform onto a three.js object and lays out two SVG
 * overlays. An `Object3D` has the same `position` and `quaternion` a `Mesh` has and needs no GL
 * context, so the WebGL boundary is never crossed. The clock is the fake timers' `Date.now`, so
 * `vi.advanceTimersByTime` moves the speed trackers' clock and fires the stall timer together.
 */

const HUB_X = 200
const HUB_Y = 200
const RECT_LEFT = 10
const RECT_TOP = 20
const MM_PER_PX = 0.5
const DT_MS = 16
const RING_PX = 100

function makePreview() {
  return {
    bodyId: '',
    txMm: 0,
    tyMm: 0,
    tzMm: 0,
    rxDeg: 0,
    ryDeg: 0,
    rzDeg: 0,
    begin: vi.fn(function (/** @type {string} */ id) {
      this.bodyId = id
      this.txMm = this.tyMm = this.tzMm = this.rxDeg = this.ryDeg = this.rzDeg = 0
    }),
    setTranslate: vi.fn(function (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) {
      this.txMm = x
      this.tyMm = y
      this.tzMm = z
    }),
    setRotate: vi.fn(function (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) {
      this.rxDeg = x
      this.ryDeg = y
      this.rzDeg = z
    }),
    clear: vi.fn(function () {
      this.bodyId = ''
      this.txMm = this.tyMm = this.tzMm = this.rxDeg = this.ryDeg = this.rzDeg = 0
    }),
  }
}

/** @param {{ centre?: [number, number, number] }} [options] */
function setup({ centre = [0, 0, 0] } = {}) {
  const gizmo = createGizmoAnnotation()
  gizmo.visible = true
  gizmo.originX = HUB_X
  gizmo.originY = HUB_Y
  // X arm points screen-right, 100 px long.
  gizmo.arrows[0].visible = true
  gizmo.arrows[0].tipX = HUB_X + 100
  gizmo.arrows[0].tipY = HUB_Y
  // The Y arm is hidden: an axis pointing at the camera.
  gizmo.arrows[1].visible = false
  // The Z ring lies flat in screen space.
  gizmo.rings[2].visible = true
  gizmo.rings[2].ux = RING_PX
  gizmo.rings[2].uy = 0
  gizmo.rings[2].vx = 0
  gizmo.rings[2].vy = RING_PX
  const dial = createDialAnnotation()
  const ruler = createRulerAnnotation()
  const mesh = new Object3D()
  const meshes = new Map([['b1', mesh]])
  const preview = makePreview()
  const orbit = { state: { azimuthDeg: 30, elevationDeg: 20 }, getMmPerPixel: vi.fn(() => MM_PER_PX) }
  const scheduleRender = vi.fn()
  const drag = createGizmoDrag({
    meshes,
    preview,
    gizmo,
    dial,
    ruler,
    orbit,
    viewportRect: { left: RECT_LEFT, top: RECT_TOP },
    widthPx: () => 800,
    heightPx: () => 600,
    scheduleRender,
    now: () => Date.now(),
  })
  const body = { id: 'b1', positionMm: centre }
  return { drag, gizmo, dial, ruler, mesh, meshes, preview, orbit, scheduleRender, body }
}

/** Viewport px → client px. */
function client(/** @type {number} */ xPx, /** @type {number} */ yPx) {
  return { clientX: xPx + RECT_LEFT, clientY: yPx + RECT_TOP }
}

/**
 * Press the X arm at the hub and drag along it at a constant speed.
 *
 * @param {ReturnType<typeof setup>} ctx
 * @param {number} speedPxPerS
 * @param {{ steps?: number, shiftKey?: boolean, pointerType?: string }} [options]
 */
function armDrag(ctx, speedPxPerS, { steps = 30, shiftKey = false, pointerType = 'mouse' } = {}) {
  ctx.drag.begin({ kind: 'translate', axisIndex: 0, ...client(HUB_X, HUB_Y), pointerType, shiftKey }, ctx.body)
  for (let i = 1; i <= steps; i += 1) {
    vi.advanceTimersByTime(DT_MS)
    ctx.drag.move({ ...client(HUB_X + (speedPxPerS * DT_MS * i) / 1000, HUB_Y), shiftKey })
  }
}

/**
 * Press the Z ring and drag round it at a constant tangential speed.
 *
 * @param {ReturnType<typeof setup>} ctx
 * @param {number} speedPxPerS
 * @param {{ steps?: number, shiftKey?: boolean, pointerType?: string, totalRad?: number }} [options]
 */
function ringDrag(ctx, speedPxPerS, { steps = 30, shiftKey = false, pointerType = 'mouse', totalRad } = {}) {
  ctx.drag.begin({ kind: 'rotate', axisIndex: 2, ...client(HUB_X + RING_PX, HUB_Y), pointerType, shiftKey }, ctx.body)
  const stepRad = totalRad === undefined ? (speedPxPerS * DT_MS) / 1000 / RING_PX : totalRad / steps
  for (let i = 1; i <= steps; i += 1) {
    vi.advanceTimersByTime(DT_MS)
    const angle = stepRad * i
    ctx.drag.move({ ...client(HUB_X + RING_PX * Math.cos(angle), HUB_Y + RING_PX * Math.sin(angle)), shiftKey })
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now: 10_000 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createGizmoDrag: begin', () => {
  it('captures the press in viewport pixels and starts the preview on the body', () => {
    const ctx = setup({ centre: [5, 6, 7] })
    ctx.drag.begin({ kind: 'translate', axisIndex: 0, ...client(150, 120), pointerType: 'touch' }, ctx.body)
    const state = ctx.drag.state
    expect(state.active).toBe(true)
    expect(state.kind).toBe('translate')
    expect(state.bodyId).toBe('b1')
    expect(state.pressXPx).toBeCloseTo(150, 9)
    expect(state.pressYPx).toBeCloseTo(120, 9)
    expect([state.centreXMm, state.centreYMm, state.centreZMm]).toEqual([5, 6, 7])
    expect(state.pointerType).toBe('touch')
    expect(state.mmPerPixel).toBeCloseTo(MM_PER_PX, 9)
    expect(state.moved).toBe(false)
    expect(ctx.preview.begin).toHaveBeenCalledWith('b1')
  })

  it('defaults a missing pointer type to mouse', () => {
    const ctx = setup()
    ctx.drag.begin({ kind: 'rotate', axisIndex: 2, ...client(HUB_X + RING_PX, HUB_Y) }, ctx.body)
    expect(ctx.drag.state.pointerType).toBe('mouse')
  })

  it('reads the ring parameter of a rotate grab, and 0 for an arm', () => {
    const ctx = setup()
    ctx.drag.begin({ kind: 'rotate', axisIndex: 2, ...client(HUB_X, HUB_Y + RING_PX) }, ctx.body)
    expect(ctx.drag.state.startParamDeg).toBeCloseTo(90, 6)
    ctx.drag.end({ cancelled: true })
    ctx.drag.begin({ kind: 'translate', axisIndex: 0, ...client(HUB_X, HUB_Y + RING_PX) }, ctx.body)
    expect(ctx.drag.state.startParamDeg).toBe(0)
  })
})

describe('createGizmoDrag: translate steps', () => {
  it('a zero-length arm drag previews zero and leaves the mesh at rest', () => {
    const ctx = setup({ centre: [40, 0, 0] })
    ctx.drag.begin({ kind: 'translate', axisIndex: 0, ...client(HUB_X, HUB_Y) }, ctx.body)
    vi.advanceTimersByTime(DT_MS)
    ctx.drag.move(client(HUB_X, HUB_Y))
    expect(ctx.drag.state.moved).toBe(true)
    expect(ctx.drag.state.rawMm).toBe(0)
    expect(ctx.drag.state.distanceMm).toBe(0)
    expect(Object.is(ctx.drag.state.distanceMm, -0)).toBe(false)
    expect(ctx.drag.state.stepMm).toBeCloseTo(0.1, 9)
    expect(ctx.preview.setTranslate).toHaveBeenLastCalledWith(0, 0, 0)
    expect(ctx.mesh.position.x).toBeCloseTo(0, 9)
    expect(ctx.mesh.position.y).toBeCloseTo(0, 9)
    expect(ctx.mesh.position.z).toBeCloseTo(0, 9)
  })

  it.each([
    [20, 0.1],
    [150, 1],
    [600, 5],
    [2500, 10],
  ])('an arm dragged at %d px/s snaps to %d mm', (speed, stepMm) => {
    const ctx = setup()
    armDrag(ctx, speed)
    const state = ctx.drag.state
    expect(state.stepMm).toBeCloseTo(stepMm, 9)
    expect(state.rawMm).toBeCloseTo((speed * DT_MS * 30 * MM_PER_PX) / 1000, 6)
    expect(state.distanceMm).toBeCloseTo(Math.round(state.rawMm / stepMm) * stepMm, 6)
    expect(ctx.preview.txMm).toBe(state.distanceMm)
    expect(ctx.preview.tyMm).toBe(0)
    expect(ctx.preview.tzMm).toBe(0)
    expect(ctx.mesh.position.x).toBeCloseTo(state.distanceMm, 6)
  })

  it('Shift wins over speed: a fast Shift drag is 1 mm', () => {
    const ctx = setup()
    armDrag(ctx, 2500, { shiftKey: true })
    expect(ctx.drag.state.stepMm).toBe(1)
    expect(Number.isInteger(ctx.drag.state.distanceMm)).toBe(true)
  })

  it('dragging across a hidden arm moves nothing', () => {
    const ctx = setup()
    ctx.drag.begin({ kind: 'translate', axisIndex: 1, ...client(HUB_X, HUB_Y) }, ctx.body)
    vi.advanceTimersByTime(DT_MS)
    ctx.drag.move(client(HUB_X + 80, HUB_Y - 60))
    expect(ctx.drag.state.rawMm).toBe(0)
    expect(ctx.preview.tyMm).toBe(0)
  })

  it('only travel along the arm counts: a drag across it moves nothing', () => {
    const ctx = setup()
    ctx.drag.begin({ kind: 'translate', axisIndex: 0, ...client(HUB_X, HUB_Y) }, ctx.body)
    vi.advanceTimersByTime(DT_MS)
    ctx.drag.move(client(HUB_X, HUB_Y + 90))
    expect(ctx.drag.state.rawMm).toBeCloseTo(0, 9)
    expect(ctx.drag.state.distanceMm).toBe(0)
  })
})

describe('createGizmoDrag: rotate steps', () => {
  it.each([
    [20, 0.1],
    [150, 1],
    [500, 5],
    [2500, 15],
  ])('a ring dragged at %d px/s snaps to %d°', (speed, stepDeg) => {
    const ctx = setup()
    ringDrag(ctx, speed)
    const state = ctx.drag.state
    expect(state.stepDeg).toBeCloseTo(stepDeg, 9)
    expect(state.turnedDeg).toBeCloseTo(Math.round(state.rawTurnDeg / stepDeg) * stepDeg, 6)
    expect(ctx.preview.rzDeg).toBe(state.turnedDeg)
    expect(ctx.preview.rxDeg).toBe(0)
    expect(ctx.preview.ryDeg).toBe(0)
  })

  it('a quarter turn reads 90° in magnitude, Shift-snapped to 5°', () => {
    const ctx = setup()
    ringDrag(ctx, 0, { totalRad: Math.PI / 2, steps: 12, shiftKey: true })
    expect(ctx.drag.state.stepDeg).toBe(5)
    expect(Math.abs(ctx.drag.state.rawTurnDeg)).toBeCloseTo(90, 6)
    expect(Math.abs(ctx.drag.state.turnedDeg)).toBe(90)
  })

  it('a pointer on the hub holds the turn rather than jumping', () => {
    const ctx = setup()
    ringDrag(ctx, 0, { totalRad: Math.PI / 4, steps: 4, shiftKey: true })
    const before = ctx.drag.state.rawTurnDeg
    vi.advanceTimersByTime(DT_MS)
    ctx.drag.move({ ...client(HUB_X + 1, HUB_Y), shiftKey: true })
    expect(ctx.drag.state.rawTurnDeg).toBe(before)
  })

  it('turns the mesh about the body centre, not the world origin', () => {
    const centre = /** @type {[number, number, number]} */ ([300, -40, 25])
    const ctx = setup({ centre })
    ringDrag(ctx, 0, { totalRad: Math.PI / 2, steps: 12, shiftKey: true })
    expect(Math.abs(ctx.preview.rzDeg)).toBe(90)
    ctx.mesh.updateMatrix()
    const mapped = new Vector3(...centre).applyMatrix4(ctx.mesh.matrix)
    expect(mapped.x).toBeCloseTo(centre[0], 6)
    expect(mapped.y).toBeCloseTo(centre[1], 6)
    expect(mapped.z).toBeCloseTo(centre[2], 6)
    // A point 10 mm out along +X from the centre swings onto the ±Y side of it.
    const arm = new Vector3(centre[0] + 10, centre[1], centre[2]).applyMatrix4(ctx.mesh.matrix)
    expect(arm.x).toBeCloseTo(centre[0], 6)
    expect(Math.abs(arm.y - centre[1])).toBeCloseTo(10, 6)
  })
})

describe('createGizmoDrag: stall detection', () => {
  it('a fast arm drag that stops settles to the fine step once the stall timer fires', () => {
    const ctx = setup()
    armDrag(ctx, 2500)
    expect(ctx.drag.state.stepMm).toBe(10)
    const raw = ctx.drag.state.rawMm
    vi.advanceTimersByTime(SPEED_STALL_MS)
    expect(ctx.drag.state.stepMm).toBe(10)
    vi.advanceTimersByTime(10)
    expect(ctx.drag.state.stepMm).toBeCloseTo(0.1, 9)
    expect(ctx.drag.state.rawMm).toBe(raw)
    expect(ctx.drag.state.distanceMm).toBeCloseTo(Math.round(raw / 0.1) * 0.1, 6)
    expect(ctx.preview.txMm).toBe(ctx.drag.state.distanceMm)
  })

  it('a fast ring drag that stops settles to the fine step once the stall timer fires', () => {
    const ctx = setup()
    ringDrag(ctx, 2500)
    expect(ctx.drag.state.stepDeg).toBe(15)
    vi.advanceTimersByTime(SPEED_STALL_MS + 10)
    expect(ctx.drag.state.stepDeg).toBeCloseTo(0.1, 9)
    expect(ctx.preview.rzDeg).toBe(ctx.drag.state.turnedDeg)
  })

  it('a steady drag keeps re-arming the timer, so it never settles mid-motion', () => {
    const ctx = setup()
    armDrag(ctx, 2500, { steps: 60 })
    expect(ctx.drag.state.stepMm).toBe(10)
  })

  it('a press that never moves does not settle anything when the timer would fire', () => {
    const ctx = setup()
    ctx.drag.begin({ kind: 'translate', axisIndex: 0, ...client(HUB_X, HUB_Y) }, ctx.body)
    vi.advanceTimersByTime(SPEED_STALL_MS * 3)
    expect(ctx.preview.setTranslate).not.toHaveBeenCalled()
  })

  it('release clears the timer: nothing changes after the drag ends', () => {
    const ctx = setup()
    armDrag(ctx, 2500)
    ctx.drag.end({ cancelled: false })
    ctx.preview.setTranslate.mockClear()
    vi.advanceTimersByTime(SPEED_STALL_MS * 3)
    expect(ctx.preview.setTranslate).not.toHaveBeenCalled()
  })

  it('clearStall stops a pending settle', () => {
    const ctx = setup()
    armDrag(ctx, 2500)
    ctx.drag.clearStall()
    vi.advanceTimersByTime(SPEED_STALL_MS * 3)
    expect(ctx.drag.state.stepMm).toBe(10)
  })

  it('a release after a pause, before the timer fires, lands on the fine step', () => {
    const ctx = setup()
    armDrag(ctx, 2500)
    vi.advanceTimersByTime(SPEED_STALL_MS + 5)
    expect(ctx.drag.state.stepMm).toBe(10)
    const raw = ctx.drag.state.rawMm
    const commit = ctx.drag.end({ cancelled: false })
    expect(commit?.translate[0]).toBeCloseTo(Math.round(raw / 0.1) * 0.1, 6)
  })
})

describe('createGizmoDrag: Shift mid-drag', () => {
  it('pressing and releasing Shift re-snaps at once, without a move', () => {
    const ctx = setup()
    armDrag(ctx, 2500)
    ctx.drag.shiftKey(/** @type {any} */ ({ key: 'Shift', type: 'keydown' }))
    expect(ctx.drag.state.shift).toBe(true)
    expect(ctx.drag.state.stepMm).toBe(1)
    ctx.drag.shiftKey(/** @type {any} */ ({ key: 'Shift', type: 'keyup' }))
    expect(ctx.drag.state.stepMm).toBe(10)
  })

  it('ignores other keys, a drag that has not moved, and no drag at all', () => {
    const ctx = setup()
    ctx.drag.shiftKey(/** @type {any} */ ({ key: 'Shift', type: 'keydown' }))
    expect(ctx.drag.state.shift).toBe(false)
    ctx.drag.begin({ kind: 'rotate', axisIndex: 2, ...client(HUB_X + RING_PX, HUB_Y) }, ctx.body)
    ctx.drag.shiftKey(/** @type {any} */ ({ key: 'a', type: 'keydown' }))
    expect(ctx.drag.state.shift).toBe(false)
    ctx.drag.shiftKey(/** @type {any} */ ({ key: 'Shift', type: 'keydown' }))
    expect(ctx.drag.state.shift).toBe(true)
    expect(ctx.preview.setRotate).not.toHaveBeenCalled()
  })
})

describe('createGizmoDrag: end', () => {
  it('returns the whole gesture as one translate commit and resets the mesh first', () => {
    const ctx = setup()
    armDrag(ctx, 150)
    const distance = ctx.drag.state.distanceMm
    const commit = ctx.drag.end({ cancelled: false })
    expect(commit).toEqual({ kind: 'translate', bodyId: 'b1', translate: [distance, 0, 0], rotate: [0, 0, 0] })
    expect(ctx.mesh.position.x).toBe(0)
    expect(ctx.mesh.quaternion.w).toBe(1)
    expect(ctx.preview.clear).toHaveBeenCalled()
    expect(ctx.drag.state.active).toBe(false)
    expect(ctx.drag.state.bodyId).toBe('')
  })

  it('returns a rotate commit for a ring drag', () => {
    const ctx = setup()
    ringDrag(ctx, 0, { totalRad: Math.PI / 2, steps: 12, shiftKey: true })
    const commit = ctx.drag.end({ cancelled: false })
    expect(commit?.kind).toBe('rotate')
    expect(Math.abs(/** @type {any} */ (commit).rotate[2])).toBe(90)
  })

  it('a cancelled drag clears the preview and commits nothing', () => {
    const ctx = setup()
    armDrag(ctx, 150)
    ctx.dial.visible = true
    ctx.ruler.visible = true
    expect(ctx.drag.end({ cancelled: true })).toBeNull()
    expect(ctx.preview.clear).toHaveBeenCalled()
    expect(ctx.mesh.position.x).toBe(0)
    expect(ctx.dial.visible).toBe(false)
    expect(ctx.ruler.visible).toBe(false)
  })

  it('move and end are no-ops with no drag in progress', () => {
    const ctx = setup()
    ctx.drag.move(client(HUB_X + 50, HUB_Y))
    expect(ctx.drag.end({ cancelled: false })).toBeNull()
    expect(ctx.preview.setTranslate).not.toHaveBeenCalled()
    expect(ctx.preview.clear).not.toHaveBeenCalled()
  })

  it('a body with no mesh previews in the store without touching the scene', () => {
    const ctx = setup()
    ctx.meshes.clear()
    armDrag(ctx, 150)
    expect(ctx.preview.txMm).toBe(ctx.drag.state.distanceMm)
    expect(ctx.scheduleRender).not.toHaveBeenCalled()
    expect(ctx.drag.end({ cancelled: false })?.bodyId).toBe('b1')
  })
})

describe('createGizmoDrag: dial and ruler', () => {
  it('the ruler shows only once an arm drag has moved, and hides with the gizmo', () => {
    const ctx = setup()
    ctx.drag.begin({ kind: 'translate', axisIndex: 0, ...client(HUB_X, HUB_Y) }, ctx.body)
    ctx.drag.syncRuler()
    expect(ctx.ruler.visible).toBe(false)
    vi.advanceTimersByTime(DT_MS)
    ctx.drag.move(client(HUB_X + 40, HUB_Y))
    ctx.drag.syncRuler()
    ctx.drag.syncDial()
    expect(ctx.ruler.visible).toBe(true)
    expect(ctx.dial.visible).toBe(false)
    ctx.gizmo.visible = false
    ctx.drag.syncRuler()
    expect(ctx.ruler.visible).toBe(false)
  })

  it('the dial shows only once a ring drag has moved, carrying the active step', () => {
    const ctx = setup()
    ctx.drag.begin({ kind: 'rotate', axisIndex: 2, ...client(HUB_X + RING_PX, HUB_Y) }, ctx.body)
    ctx.drag.syncDial()
    expect(ctx.dial.visible).toBe(false)
    ringDrag(ctx, 0, { totalRad: Math.PI / 3, steps: 6, shiftKey: true })
    ctx.drag.syncDial()
    ctx.drag.syncRuler()
    expect(ctx.dial.visible).toBe(true)
    expect(ctx.dial.stepDeg).toBe(5)
    expect(ctx.ruler.visible).toBe(false)
  })
})

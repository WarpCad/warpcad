// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import modeling from '@jscad/modeling'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three'

import { createMarqueeRect } from './annotate.js'
import { createOrbitCamera } from './camera.js'
import { CLICK_SLOP_PX, ORBIT_DEG_PER_PX, createPointerGestures } from './pointerGestures.js'

const { primitives } = modeling

/**
 * `createPointerGestures` is framework-free: the real orbit camera, projections, raycaster and
 * marquee maths run, and the stores, the sketch controllers and the canvas are plain objects. No
 * WebGL: the three.js camera is only ever used for its matrices.
 */

const WIDTH_PX = 800
const HEIGHT_PX = 600
const CENTRE_X = WIDTH_PX / 2
const CENTRE_Y = HEIGHT_PX / 2

/** An identity frame: sketch X/Y on world X/Y, sketch Z on world Z. */
const FRAME = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

/**
 * A full `PointerEvent`-shaped object.
 *
 * @param {Partial<import('./pointerGestures.js').GesturePointerEvent>} fields
 * @returns {import('./pointerGestures.js').GesturePointerEvent}
 */
function pointerEvent(fields) {
  return {
    pointerId: 1,
    clientX: CENTRE_X,
    clientY: CENTRE_Y,
    button: 0,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    pointerType: 'mouse',
    type: 'pointermove',
    preventDefault: () => {},
    ...fields,
  }
}

/**
 * A three.js camera placed where `scene.js`'s `applyCamera` would put it for this orbit.
 *
 * @param {ReturnType<typeof createOrbitCamera>} orbit
 */
function cameraFor(orbit) {
  const camera = new PerspectiveCamera(orbit.fovDeg, WIDTH_PX / HEIGHT_PX, 0.1, 100000)
  const scratch = { x: 0, y: 0, z: 0 }
  orbit.getPosition(scratch)
  camera.position.set(scratch.x, scratch.y, scratch.z)
  orbit.getUp(scratch)
  camera.up.set(scratch.x, scratch.y, scratch.z)
  const target = orbit.state.target
  camera.lookAt(target.x, target.y, target.z)
  camera.updateMatrixWorld()
  return camera
}

/**
 * @param {object} [options]
 * @param {'orbit' | 'pan' | 'select'} [options.mode]
 * @param {string} [options.preset]
 * @param {boolean} [options.sketching]
 * @param {boolean} [options.previewing]
 * @param {string} [options.tool]
 * @param {boolean} [options.withViewport] Build a camera and a 20 mm box at the origin, id `b1`.
 * @param {any[]} [options.bodies] The document's bodies, for the marquee.
 */
function setup({ mode = 'orbit', preset = 'shift-or-right-pans', sketching = false, previewing = false, tool = 'rect', withViewport = false, bodies = [] } = {}) {
  const orbit = createOrbitCamera()
  const bodiesGroup = new Group()
  /** @type {Map<string, any>} */
  const bodyMeshes = new Map()
  /** @type {any} */
  let viewport = null
  if (withViewport) {
    orbit.snapTo('top')
    const box = new Mesh(new BoxGeometry(20, 20, 20), new MeshBasicMaterial())
    box.name = 'b1'
    bodiesGroup.add(box)
    bodiesGroup.updateMatrixWorld(true)
    bodyMeshes.set('b1', box)
    viewport = { graph: { camera: cameraFor(orbit) } }
  }
  const state = { mode, sketching, previewing, dragging: false }
  const sketchEditor = {
    tool,
    imageTool: '',
    chainLive: false,
    frame: FRAME,
    hoverProfileId: '',
    hoverVertex: -1,
    scaleAPx: null,
    scaleBPx: null,
    selectVertex: vi.fn(),
    addScalePoint: vi.fn(),
    setScaleLine: vi.fn(),
    traceAt: vi.fn(),
  }
  const selection = {
    ids: /** @type {string[]} */ ([]),
    clear: vi.fn(),
    toggle: vi.fn(),
    select: vi.fn(),
    drillInto: vi.fn(),
    selectMany: vi.fn(),
  }
  const sketchHandler = {
    press: { kind: '', index: -1 },
    drag: { active: false },
    hitTest: vi.fn(),
    beginDrag: vi.fn(() => true),
    updateDrag: vi.fn(),
    endDrag: vi.fn(),
    hover: vi.fn(),
    forgetHover: vi.fn(),
  }
  const sketchDraw = {
    drag: { active: false },
    live: { has: false },
    begin: vi.fn(() => true),
    update: vi.fn(),
    end: vi.fn(),
    pick: vi.fn(),
    lineTap: vi.fn(),
    hoverProfile: vi.fn(),
    trackChain: vi.fn(),
    drawChain: vi.fn(),
    forgetHover: vi.fn(),
  }
  const sketchSnapper = { snap: vi.fn(), hide: vi.fn() }
  const referenceImage = {
    clientToImagePx: vi.fn(() => /** @type {[number, number]} */ ([5, 5])),
    trackLiveEnd: vi.fn(),
    clearLiveEnd: vi.fn(),
    syncOverlay: vi.fn(),
  }
  const canvas = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() }
  const marqueeRect = createMarqueeRect()
  const scheduleRender = vi.fn()
  const gestures = createPointerGestures({
    orbit,
    viewport: () => viewport,
    bodiesGroup,
    bodyMeshes,
    viewportRect: { left: 0, top: 0, width: WIDTH_PX, height: HEIGHT_PX },
    widthPx: () => WIDTH_PX,
    heightPx: () => HEIGHT_PX,
    canvas: () => /** @type {any} */ (canvas),
    getMode: () => state.mode,
    mouseNavPreset: () => preset,
    isSketching: () => state.sketching,
    isPreviewing: () => state.previewing,
    sliceZ: () => 0,
    sketchEditor,
    selection,
    documentBodies: () => bodies,
    sketchHandler,
    sketchDraw,
    sketchSnapper,
    referenceImage,
    marqueeRect,
    setDragging: (dragging) => {
      state.dragging = dragging
    },
    scheduleRender,
  })
  return { gestures, orbit, state, sketchEditor, selection, sketchHandler, sketchDraw, sketchSnapper, referenceImage, canvas, marqueeRect, scheduleRender }
}

/**
 * Press, move by `(dx, dy)` in one step, and optionally release.
 *
 * @param {ReturnType<typeof createPointerGestures>} gestures
 * @param {Partial<import('./pointerGestures.js').GesturePointerEvent>} press
 * @param {number} dx
 * @param {number} dy
 */
function drag(gestures, press, dx, dy) {
  const start = pointerEvent({ type: 'pointerdown', ...press })
  gestures.down(start)
  gestures.move(pointerEvent({ ...press, clientX: start.clientX + dx, clientY: start.clientY + dy }))
  return start
}

describe('createPointerGestures: one pointer', () => {
  it('a plain left drag past the slop orbits, grabbing the scene', () => {
    const { gestures, orbit, scheduleRender, state } = setup()
    const before = orbit.state.azimuthDeg
    drag(gestures, {}, 20, 0)
    expect(gestures.gestureKind()).toBe('orbit')
    expect(state.dragging).toBe(true)
    // Pulling right swings the camera left by ORBIT_DEG_PER_PX a pixel.
    expect(orbit.state.azimuthDeg).toBeCloseTo(before - 20 * ORBIT_DEG_PER_PX, 9)
    expect(scheduleRender).toHaveBeenCalled()
  })

  it('a right drag pans and leaves the orbit angles alone', () => {
    const { gestures, orbit } = setup()
    const azimuth = orbit.state.azimuthDeg
    const target = { ...orbit.state.target }
    drag(gestures, { button: 2 }, 30, 0)
    expect(gestures.gestureKind()).toBe('pan')
    expect(orbit.state.azimuthDeg).toBeCloseTo(azimuth, 9)
    expect(Math.hypot(orbit.state.target.x - target.x, orbit.state.target.y - target.y)).toBeGreaterThan(0)
  })

  it('Shift+left pans only once past the slop; below it the press is still a Shift-click', () => {
    const { gestures, selection } = setup()
    drag(gestures, { shiftKey: true }, 20, 0)
    expect(gestures.gestureKind()).toBe('pan')

    const other = setup()
    other.gestures.down(pointerEvent({ type: 'pointerdown', shiftKey: true }))
    other.gestures.move(pointerEvent({ shiftKey: true, clientX: CENTRE_X + CLICK_SLOP_PX }))
    expect(other.gestures.gestureKind()).toBe('')
    other.gestures.up(pointerEvent({ type: 'pointerup', shiftKey: true, clientX: CENTRE_X + CLICK_SLOP_PX }))
    // No viewport: a click on nothing clears, additive or not.
    expect(other.selection.clear).toHaveBeenCalledTimes(1)
    expect(selection.clear).not.toHaveBeenCalled()
  })

  it('the left-pans preset is moot on touch: a one-finger drag still orbits', () => {
    const { gestures } = setup({ preset: 'left-pans' })
    drag(gestures, { pointerType: 'touch' }, 20, 0)
    expect(gestures.gestureKind()).toBe('orbit')

    const mouse = setup({ preset: 'left-pans' })
    drag(mouse.gestures, {}, 20, 0)
    expect(mouse.gestures.gestureKind()).toBe('pan')
  })

  it('a zero-length move does nothing, and the release is a click', () => {
    const { gestures, orbit, scheduleRender, selection, state } = setup()
    const azimuth = orbit.state.azimuthDeg
    const elevation = orbit.state.elevationDeg
    gestures.down(pointerEvent({ type: 'pointerdown' }))
    gestures.move(pointerEvent({}))
    expect(gestures.gestureKind()).toBe('')
    expect(scheduleRender).not.toHaveBeenCalled()
    expect(orbit.state.azimuthDeg).toBeCloseTo(azimuth, 12)
    expect(orbit.state.elevationDeg).toBeCloseTo(elevation, 12)
    gestures.up(pointerEvent({ type: 'pointerup' }))
    expect(state.dragging).toBe(false)
    expect(selection.clear).toHaveBeenCalledTimes(1)
  })

  it('a pointer it never saw go down is not a click', () => {
    const { gestures, selection } = setup()
    gestures.up(pointerEvent({ type: 'pointerup', pointerId: 9 }))
    expect(selection.clear).not.toHaveBeenCalled()
  })
})

describe('createPointerGestures: two pointers', () => {
  it('a second contact pinches to zoom and pans by half the moving finger, never a marquee', () => {
    const { gestures, orbit, marqueeRect } = setup({ mode: 'select', withViewport: true })
    const distance = orbit.state.distanceMm
    // First finger well away from the box, dragged into a marquee.
    gestures.down(pointerEvent({ type: 'pointerdown', pointerType: 'touch', clientX: 50, clientY: 50 }))
    gestures.move(pointerEvent({ pointerType: 'touch', clientX: 70, clientY: 50 }))
    expect(gestures.gestureKind()).toBe('marquee')
    expect(marqueeRect.visible).toBe(true)

    // A second finger 100 px to the right abandons it.
    gestures.down(pointerEvent({ type: 'pointerdown', pointerType: 'touch', pointerId: 2, clientX: 170, clientY: 50 }))
    expect(gestures.gestureKind()).toBe('')
    expect(marqueeRect.visible).toBe(false)

    // Spread to 200 px: the pinch halves the distance.
    gestures.move(pointerEvent({ pointerType: 'touch', pointerId: 2, clientX: 270, clientY: 50 }))
    expect(orbit.state.distanceMm).toBeCloseTo(distance / 2, 6)
    expect(gestures.gestureKind()).toBe('')
  })

  it('lifting both fingers ends the gesture without a click', () => {
    const { gestures, selection, state } = setup()
    gestures.down(pointerEvent({ type: 'pointerdown', pointerType: 'touch' }))
    gestures.down(pointerEvent({ type: 'pointerdown', pointerType: 'touch', pointerId: 2, clientX: CENTRE_X + 50 }))
    gestures.up(pointerEvent({ type: 'pointerup', pointerType: 'touch', pointerId: 2, clientX: CENTRE_X + 50 }))
    expect(state.dragging).toBe(true)
    gestures.up(pointerEvent({ type: 'pointerup', pointerType: 'touch' }))
    expect(state.dragging).toBe(false)
    expect(selection.clear).not.toHaveBeenCalled()
  })

  it('a second finger puts a point drag back', () => {
    const { gestures, sketchHandler } = setup({ sketching: true, tool: 'select' })
    sketchHandler.hitTest.mockImplementation(() => {
      sketchHandler.press.kind = 'vertex'
      sketchHandler.press.index = 2
    })
    drag(gestures, { pointerType: 'touch' }, 20, 0)
    expect(gestures.gestureKind()).toBe('sketch-vertex')
    gestures.down(pointerEvent({ type: 'pointerdown', pointerType: 'touch', pointerId: 2, clientX: 10 }))
    expect(sketchHandler.endDrag).toHaveBeenCalledWith(true)
  })
})

describe('createPointerGestures: the marquee', () => {
  const body = { id: 'b1', geometry: primitives.cuboid({ size: [20, 20, 20] }) }

  it('Ctrl-drag from empty space selects what the rectangle overlaps, Shift adding', () => {
    const { gestures, selection, marqueeRect } = setup({ withViewport: true, bodies: [body] })
    gestures.down(pointerEvent({ type: 'pointerdown', ctrlKey: true, shiftKey: true, clientX: 300, clientY: 200 }))
    gestures.move(pointerEvent({ ctrlKey: true, shiftKey: true, clientX: 500, clientY: 400 }))
    expect(gestures.gestureKind()).toBe('marquee')
    gestures.up(pointerEvent({ type: 'pointerup', clientX: 500, clientY: 400 }))
    expect(marqueeRect.visible).toBe(false)
    expect(selection.selectMany).toHaveBeenCalledWith(['b1'], true)
  })

  it('a press that starts on a body orbits instead', () => {
    const { gestures } = setup({ withViewport: true, mode: 'select' })
    drag(gestures, {}, 20, 0)
    expect(gestures.gestureKind()).toBe('select')
  })

  it('never while previewing', () => {
    const { gestures } = setup({ withViewport: true, previewing: true })
    drag(gestures, { ctrlKey: true, clientX: 50, clientY: 50 }, 20, 0)
    expect(gestures.gestureKind()).toBe('orbit')
  })

  it('a cancelled marquee changes nothing', () => {
    const { gestures, selection, marqueeRect } = setup({ withViewport: true, mode: 'select', bodies: [body] })
    drag(gestures, { clientX: 50, clientY: 50 }, 600, 500)
    gestures.up(pointerEvent({ type: 'pointercancel', clientX: 650, clientY: 550 }))
    expect(marqueeRect.visible).toBe(false)
    expect(selection.selectMany).not.toHaveBeenCalled()
  })
})

describe('createPointerGestures: picking', () => {
  it('a click on the body selects it; on empty space clears', () => {
    const { gestures, selection } = setup({ withViewport: true })
    gestures.pickAt(CENTRE_X, CENTRE_Y)
    expect(selection.select).toHaveBeenCalledWith('b1')
    gestures.pickAt(5, 5)
    expect(selection.clear).toHaveBeenCalledTimes(1)
  })

  it('a modified click toggles, and a click while previewing or sketching does nothing', () => {
    const { gestures, selection, state } = setup({ withViewport: true })
    gestures.down(pointerEvent({ type: 'pointerdown', metaKey: true }))
    gestures.up(pointerEvent({ type: 'pointerup', metaKey: true }))
    expect(selection.toggle).toHaveBeenCalledWith('b1')

    state.previewing = true
    gestures.pickAt(CENTRE_X, CENTRE_Y)
    state.previewing = false
    state.sketching = true
    gestures.pickAt(CENTRE_X, CENTRE_Y)
    expect(selection.select).not.toHaveBeenCalled()
    expect(selection.clear).not.toHaveBeenCalled()
  })
})

describe('createPointerGestures: projection', () => {
  it('a ray parallel to the working plane meets nothing', () => {
    const { gestures, orbit } = setup()
    orbit.snapTo('front')
    expect(orbit.state.elevationDeg).toBeCloseTo(0, 12)
    expect(gestures.projectToWorkingPlane(CENTRE_X, CENTRE_Y)).toBeNull()
    expect(gestures.projectToSketch(CENTRE_X, CENTRE_Y)).toBeNull()
  })

  it('looking straight down, the centre projects onto the target', () => {
    const { gestures, orbit } = setup()
    orbit.snapTo('top')
    const point = gestures.projectToWorkingPlane(CENTRE_X, CENTRE_Y)
    expect(point?.x).toBeCloseTo(orbit.state.target.x, 6)
    expect(point?.y).toBeCloseTo(orbit.state.target.y, 6)
    expect(point?.z).toBeCloseTo(0, 12)
    const sketch = gestures.projectToSketch(CENTRE_X, CENTRE_Y)
    expect(sketch?.[0]).toBeCloseTo(orbit.state.target.x, 6)
    expect(sketch?.[1]).toBeCloseTo(orbit.state.target.y, 6)
  })
})

describe('createPointerGestures: the sketch editor', () => {
  it('a drag draws from the press point and never moves the locked camera', () => {
    const { gestures, orbit, sketchDraw } = setup({ sketching: true })
    const azimuth = orbit.state.azimuthDeg
    drag(gestures, { pointerType: 'touch' }, 20, 0)
    expect(gestures.gestureKind()).toBe('sketch')
    expect(sketchDraw.begin).toHaveBeenCalledWith(CENTRE_X, CENTRE_Y, false, true)
    expect(sketchDraw.update).toHaveBeenCalledWith(CENTRE_X + 20, CENTRE_Y, false)
    gestures.up(pointerEvent({ type: 'pointerup', clientX: CENTRE_X + 20 }))
    expect(sketchDraw.end).toHaveBeenCalledWith(false)
    expect(orbit.state.azimuthDeg).toBeCloseTo(azimuth, 12)
  })

  it('a press off the plane starts nothing, and the camera still stays put', () => {
    const { gestures, orbit, sketchDraw } = setup({ sketching: true })
    sketchDraw.begin.mockReturnValue(false)
    const azimuth = orbit.state.azimuthDeg
    drag(gestures, {}, 20, 0)
    expect(gestures.gestureKind()).toBe('')
    expect(orbit.state.azimuthDeg).toBeCloseTo(azimuth, 12)
  })

  it('under Select a drag is idle and its press still picks', () => {
    const { gestures, sketchDraw } = setup({ sketching: true, tool: 'select' })
    drag(gestures, {}, 20, 0)
    expect(gestures.gestureKind()).toBe('sketch-idle')
    gestures.up(pointerEvent({ type: 'pointerup', clientX: CENTRE_X + 20 }))
    expect(sketchDraw.pick).toHaveBeenCalledWith(CENTRE_X, CENTRE_Y)
  })

  it('a Line tap fixes a vertex', () => {
    const { gestures, sketchDraw } = setup({ sketching: true, tool: 'line' })
    gestures.down(pointerEvent({ type: 'pointerdown', pointerType: 'touch' }))
    gestures.up(pointerEvent({ type: 'pointerup', pointerType: 'touch' }))
    expect(sketchDraw.lineTap).toHaveBeenCalledWith(CENTRE_X, CENTRE_Y, false, true)
  })

  it('Set scale: a drag sets the ruler from the press to the release', () => {
    const { gestures, sketchEditor, referenceImage } = setup({ sketching: true })
    sketchEditor.imageTool = 'scale'
    referenceImage.clientToImagePx.mockReturnValueOnce([1, 2]).mockReturnValueOnce([30, 40])
    drag(gestures, {}, 20, 0)
    expect(gestures.gestureKind()).toBe('sketch-scale')
    expect(sketchEditor.addScalePoint).toHaveBeenCalledWith([1, 2])
    gestures.up(pointerEvent({ type: 'pointerup', clientX: CENTRE_X + 20 }))
    expect(sketchEditor.setScaleLine).toHaveBeenCalledWith([1, 2], [30, 40])
  })

  it('Auto-trace: a press that wobbled past the slop traces at the press point', () => {
    const { gestures, sketchEditor, referenceImage } = setup({ sketching: true })
    sketchEditor.imageTool = 'trace'
    referenceImage.clientToImagePx.mockReturnValue([7, 8])
    drag(gestures, {}, 20, 0)
    gestures.up(pointerEvent({ type: 'pointerup', clientX: CENTRE_X + 20 }))
    expect(referenceImage.clientToImagePx).toHaveBeenLastCalledWith(CENTRE_X, CENTRE_Y)
    expect(sketchEditor.traceAt).toHaveBeenCalledWith([7, 8])
  })

  it('Shift re-snaps the hover in place, and leaving the canvas hides the marker', () => {
    const { gestures, sketchSnapper, sketchDraw } = setup({ sketching: true })
    gestures.move(pointerEvent({}))
    expect(sketchSnapper.snap).toHaveBeenCalledTimes(1)
    gestures.shiftKey(/** @type {KeyboardEvent} */ ({ key: 'Shift', type: 'keydown' }))
    expect(sketchSnapper.snap).toHaveBeenCalledTimes(2)
    expect(sketchSnapper.snap.mock.calls[1][1]).toBe(true)
    expect(sketchDraw.trackChain).toHaveBeenLastCalledWith(CENTRE_X, CENTRE_Y, true)
    gestures.leave()
    expect(sketchSnapper.hide).toHaveBeenCalled()
    gestures.shiftKey(/** @type {KeyboardEvent} */ ({ key: 'Shift', type: 'keyup' }))
    expect(sketchSnapper.snap).toHaveBeenCalledTimes(2)
  })
})

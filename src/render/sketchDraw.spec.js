// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createOrbitCamera } from './camera.js'
import { createSketchDraw } from './sketchDraw.js'

/**
 * `createSketchDraw` is framework-free: the real orbit camera and profile helpers run, and the
 * sketch editor, the snap, the projection and the overlays are plain objects. The clock is the one
 * thing faked, so the double-click windows are exact.
 */

/** An identity frame: sketch X/Y on world X/Y, sketch Z on world Z. */
const FRAME = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

/** A closed 10 mm square with its corner at the origin. */
const SQUARE = { id: 'a', kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [10, 0], [10, 10], [0, 10]] }

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * @param {object} [options]
 * @param {string} [options.tool]
 * @param {number[] | null} [options.project] The point the pointer projects to; `null` misses the plane.
 * @param {any[]} [options.profiles]
 * @param {boolean} [options.chainLive]
 * @param {string} [options.chainId]
 */
function setup({ tool = 'rect', project = [20, 20], profiles = [SQUARE], chainLive = false, chainId = '' } = {}) {
  const orbit = createOrbitCamera()
  const editor = {
    active: true,
    tool,
    chainLive,
    chainId,
    chainStartMm: null,
    slice: { profiles },
    frame: FRAME,
    hoverProfileId: '',
    hoverVertex: -1,
    polygonSides: 6,
    pendingCurve: null,
    curvePreviewPoints: vi.fn(() => []),
    placeCurve: vi.fn(),
    addToActiveSlice: vi.fn(),
    nextProfileId: vi.fn(() => 'p1'),
    // Typed loosely: a test sets the next outcome (`added`, `closed`, `ignored`) on the mock.
    fixChainVertex: /** @type {any} */ (vi.fn(() => 'added')),
    finishChain: vi.fn(),
    selectProfile: vi.fn(),
  }
  const chain = { visible: false, lastXPx: 0, lastYPx: 0, firstXPx: 0, firstYPx: 0, showFirst: false, closeNear: false, label: '', labelXPx: 0, labelYPx: 0 }
  const draft = { visible: false, d: '' }
  const deps = {
    orbit,
    editor,
    sliceZ: () => 0,
    widthPx: () => 800,
    heightPx: () => 600,
    project: vi.fn(() => (project ? [project[0], project[1]] : null)),
    snap: vi.fn(() => false),
    hideSnap: vi.fn(),
    isTouchPress: vi.fn(() => false),
    scheduleRender: vi.fn(),
    chain,
    draft,
  }
  const draw = createSketchDraw(deps)
  return { draw, deps, editor, chain, draft }
}

describe('createSketchDraw: the drag', () => {
  it('a press starts a drag at the press point, snapped', () => {
    const { draw, deps } = setup({ project: [20, 20] })
    expect(draw.begin(5, 5, false, false)).toBe(true)
    expect(draw.drag.active).toBe(true)
    expect(draw.drag.startXMm).toBe(20)
    expect(draw.drag.endXMm).toBe(20)
    expect(deps.snap).toHaveBeenCalled()
  })

  it('a press off the sketch plane starts nothing', () => {
    const { draw } = setup({ project: null })
    expect(draw.begin(5, 5, false, false)).toBe(false)
    expect(draw.drag.active).toBe(false)
  })

  it('a move updates the far end and asks for a redraw', () => {
    const { draw, deps } = setup({ project: [20, 20] })
    draw.begin(5, 5, false, false)
    deps.project.mockReturnValue([35, 40])
    draw.update(9, 9)
    expect(draw.drag.endXMm).toBe(35)
    expect(draw.drag.endYMm).toBe(40)
    expect(deps.scheduleRender).toHaveBeenCalled()
  })

  it('a release that moved adds one outline to the active slice, unselected', () => {
    const { draw, deps, editor } = setup({ tool: 'rect', project: [20, 20] })
    draw.begin(0, 0, false, false)
    deps.project.mockReturnValue([40, 30])
    draw.update(0, 0)
    draw.end(false)
    expect(draw.drag.active).toBe(false)
    expect(editor.addToActiveSlice).toHaveBeenCalledTimes(1)
    const added = editor.addToActiveSlice.mock.calls[0][0]
    expect(added.id).toBe('p1')
    // A rectangle drag makes a `rect` profile, not a polyline.
    expect(added.kind).toBe('rect')
  })

  it('a release that never moved adds nothing (the degenerate case)', () => {
    const { draw, editor } = setup({ tool: 'rect', project: [20, 20] })
    draw.begin(0, 0, false, false)
    draw.end(false)
    expect(editor.addToActiveSlice).not.toHaveBeenCalled()
  })

  it('a cancelled drag adds nothing', () => {
    const { draw, deps, editor } = setup({ tool: 'rect', project: [20, 20] })
    draw.begin(0, 0, false, false)
    deps.project.mockReturnValue([40, 30])
    draw.update(0, 0)
    draw.end(true)
    expect(editor.addToActiveSlice).not.toHaveBeenCalled()
  })

  it('a curve lands where the drag is released, wherever it started', () => {
    const { draw, deps, editor } = setup({ tool: 'curve', project: [20, 20] })
    draw.begin(0, 0, false, false)
    deps.project.mockReturnValue([50, 60])
    draw.update(0, 0)
    draw.end(false)
    expect(editor.placeCurve).toHaveBeenCalledWith([50, 60])
    expect(editor.addToActiveSlice).not.toHaveBeenCalled()
  })

  it('the Line tool fixes both the press and the release when no chain is live yet', () => {
    const { draw, deps, editor } = setup({ tool: 'line', project: [20, 20] })
    draw.begin(0, 0, false, false)
    deps.project.mockReturnValue([40, 30])
    draw.update(0, 0)
    draw.end(false)
    expect(editor.fixChainVertex).toHaveBeenCalledTimes(2)
  })

  it('the Line tool fixes only the release once a chain is live', () => {
    const { draw, deps, editor } = setup({ tool: 'line', project: [20, 20], chainLive: true })
    draw.begin(0, 0, false, false)
    deps.project.mockReturnValue([40, 30])
    draw.update(0, 0)
    draw.end(false)
    expect(editor.fixChainVertex).toHaveBeenCalledTimes(1)
  })
})

describe('createSketchDraw: the Line chain', () => {
  it('a tap fixes a vertex and leaves the live end where the tap was', () => {
    const { draw, editor, deps } = setup({ tool: 'line', project: [12, 7] })
    draw.lineTap(1, 1)
    expect(editor.fixChainVertex).toHaveBeenCalledTimes(1)
    expect(draw.live.has).toBe(true)
    expect(draw.live.xMm).toBe(12)
    expect(deps.scheduleRender).toHaveBeenCalled()
  })

  it('a second tap on the same spot inside the double-tap window finishes the chain', () => {
    const clock = vi.spyOn(performance, 'now')
    const { draw, editor } = setup({ tool: 'line', project: [12, 7], chainLive: true })
    clock.mockReturnValue(1000)
    editor.fixChainVertex.mockReturnValueOnce('added')
    draw.lineTap(1, 1)
    clock.mockReturnValue(1100)
    editor.fixChainVertex.mockReturnValueOnce('ignored')
    draw.lineTap(1, 1)
    expect(editor.finishChain).toHaveBeenCalledTimes(1)
  })

  it('a click straight after a close is swallowed, so it starts nothing', () => {
    const clock = vi.spyOn(performance, 'now')
    const { draw, editor } = setup({ tool: 'line', project: [12, 7] })
    clock.mockReturnValue(1000)
    editor.fixChainVertex.mockReturnValueOnce('closed')
    draw.lineTap(1, 1)
    clock.mockReturnValue(1100)
    draw.lineTap(1, 1)
    expect(editor.fixChainVertex).toHaveBeenCalledTimes(1)
  })

  it('a tap with the pointer off the plane does nothing', () => {
    const { draw, editor } = setup({ tool: 'line', project: null })
    draw.lineTap(1, 1)
    expect(editor.fixChainVertex).not.toHaveBeenCalled()
  })

  it('tracking the pointer is ignored unless a chain is live', () => {
    const { draw, deps } = setup({ tool: 'line', chainLive: false, project: [12, 7] })
    draw.trackChain(1, 1)
    expect(draw.live.has).toBe(false)
    expect(deps.snap).not.toHaveBeenCalled()
  })

  it('tracking the pointer with a chain live moves the rubber band end, snapped', () => {
    const { draw, deps } = setup({ tool: 'line', chainLive: true, project: [12, 7] })
    draw.trackChain(1, 1, true)
    expect(draw.live.has).toBe(true)
    expect(draw.live.xMm).toBe(12)
    expect(deps.snap).toHaveBeenCalledWith(expect.any(Array), true, false)
  })

  it('draw with no anchor hides the chain overlay', () => {
    const { draw, chain } = setup({ tool: 'rect' })
    draw.drawChain()
    expect(chain.visible).toBe(false)
  })
})

describe('createSketchDraw: pick and hover', () => {
  it('a tap inside an outline selects it', () => {
    const { draw, editor } = setup({ tool: 'select', project: [5, 5] })
    draw.pick(1, 1)
    expect(editor.selectProfile).toHaveBeenCalledWith('a')
  })

  it('a tap in empty space clears the selection', () => {
    const { draw, editor } = setup({ tool: 'select', project: [50, 50] })
    draw.pick(1, 1)
    expect(editor.selectProfile).toHaveBeenCalledWith('')
  })

  it('a tap off the plane clears the selection', () => {
    const { draw, editor } = setup({ tool: 'select', project: null })
    draw.pick(1, 1)
    expect(editor.selectProfile).toHaveBeenCalledWith('')
  })

  it('hovering an outline under Select highlights it', () => {
    const { draw, editor } = setup({ tool: 'select', project: [5, 5] })
    draw.hoverProfile(1, 1)
    expect(editor.hoverProfileId).toBe('a')
  })

  it('hover does nothing under a drawing tool, and clears any highlight', () => {
    const { draw, editor } = setup({ tool: 'rect', project: [5, 5] })
    editor.hoverProfileId = 'a'
    draw.hoverProfile(1, 1)
    expect(editor.hoverProfileId).toBe('')
  })

  it('forgetHover lets the next move at the same spot resolve again', () => {
    const { draw, editor } = setup({ tool: 'select', project: [5, 5] })
    draw.hoverProfile(1, 1)
    editor.hoverProfileId = ''
    draw.hoverProfile(1, 1)
    expect(editor.hoverProfileId).toBe('')
    draw.forgetHover()
    draw.hoverProfile(1, 1)
    expect(editor.hoverProfileId).toBe('a')
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { createSketchHover } from './sketchHover.js'

/**
 * @param {object} [options]
 * @param {string} [options.tool]
 * @param {boolean} [options.chainLive]
 * @param {boolean} [options.sketching]
 * @param {number} [options.pointers]
 * @param {number[] | null} [options.point]
 */
function setup({ tool = 'rect', chainLive = false, sketching = true, pointers = 0, point = [1, 2] } = {}) {
  const sketchEditor = { tool, chainLive, hoverProfileId: 'p', hoverVertex: 3 }
  const sketchHandler = { drag: { active: false }, updateDrag: vi.fn(), forgetHover: vi.fn() }
  const sketchDraw = {
    drag: { active: false },
    live: { has: false },
    update: vi.fn(),
    trackChain: vi.fn(),
    drawChain: vi.fn(),
    forgetHover: vi.fn(),
  }
  const sketchSnapper = { snap: vi.fn(), hide: vi.fn() }
  const scheduleRender = vi.fn()
  const hover = createSketchHover({
    sketchEditor,
    sketchHandler,
    sketchDraw,
    sketchSnapper,
    isSketching: () => sketching,
    pointerCount: () => pointers,
    projectToSketch: () => point,
    scheduleRender,
  })
  return { sketchEditor, sketchHandler, sketchDraw, sketchSnapper, scheduleRender, hover }
}

/** @param {string} type */
const shift = (type) => /** @type {KeyboardEvent} */ (/** @type {unknown} */ ({ key: 'Shift', type }))

describe('createSketchHover', () => {
  it('snaps the projected point for a drawing tool', () => {
    const { hover, sketchSnapper } = setup()
    hover.hoverSnap(5, 6, true)
    expect(sketchSnapper.snap).toHaveBeenCalledWith([1, 2], true, false)
  })

  it('hides the marker for Select, and when the point is off the plane', () => {
    const select = setup({ tool: 'select' })
    select.hover.hoverSnap(5, 6, false)
    expect(select.sketchSnapper.hide).toHaveBeenCalled()
    expect(select.sketchSnapper.snap).not.toHaveBeenCalled()
    const off = setup({ point: null })
    off.hover.hoverSnap(5, 6, false)
    expect(off.sketchSnapper.hide).toHaveBeenCalled()
  })

  it('leaves a live Line chain to its own rubber band', () => {
    const { hover, sketchSnapper } = setup({ tool: 'line', chainLive: true })
    hover.hoverSnap(5, 6, false)
    expect(sketchSnapper.snap).not.toHaveBeenCalled()
    expect(sketchSnapper.hide).not.toHaveBeenCalled()
  })

  it('Shift does nothing before a pointer was seen, or for another key', () => {
    const { hover, sketchSnapper, sketchDraw } = setup()
    hover.onShiftKey(shift('keydown'))
    hover.remember(7, 8)
    hover.onShiftKey(/** @type {KeyboardEvent} */ (/** @type {unknown} */ ({ key: 'a', type: 'keydown' })))
    expect(sketchSnapper.snap).not.toHaveBeenCalled()
    expect(sketchDraw.trackChain).not.toHaveBeenCalled()
  })

  it('Shift re-snaps the hover and the chain in place when nothing is pressed', () => {
    const { hover, sketchSnapper, sketchDraw } = setup()
    hover.remember(7, 8)
    hover.onShiftKey(shift('keydown'))
    expect(sketchSnapper.snap).toHaveBeenCalledWith([1, 2], true, false)
    expect(sketchDraw.trackChain).toHaveBeenCalledWith(7, 8, true)
    hover.onShiftKey(shift('keyup'))
    expect(sketchDraw.trackChain).toHaveBeenLastCalledWith(7, 8, false)
  })

  it('Shift re-applies to a drag in progress instead of the hover', () => {
    const handle = setup()
    handle.hover.remember(7, 8)
    handle.sketchHandler.drag.active = true
    handle.hover.onShiftKey(shift('keydown'))
    expect(handle.sketchHandler.updateDrag).toHaveBeenCalledWith(7, 8, true)
    expect(handle.sketchSnapper.snap).not.toHaveBeenCalled()
    const draw = setup()
    draw.hover.remember(7, 8)
    draw.sketchDraw.drag.active = true
    draw.hover.onShiftKey(shift('keydown'))
    expect(draw.sketchDraw.update).toHaveBeenCalledWith(7, 8, true)
  })

  it('Shift is ignored outside the editor and while a pointer is down', () => {
    const closed = setup({ sketching: false })
    closed.hover.remember(1, 1)
    closed.hover.onShiftKey(shift('keydown'))
    expect(closed.sketchSnapper.snap).not.toHaveBeenCalled()
    const pressed = setup({ pointers: 1 })
    pressed.hover.remember(1, 1)
    pressed.hover.onShiftKey(shift('keydown'))
    expect(pressed.sketchSnapper.snap).not.toHaveBeenCalled()
  })

  it('clear hides the marker, ends the live chain, and forgets every hover', () => {
    const { hover, sketchEditor, sketchSnapper, sketchDraw, sketchHandler, scheduleRender } = setup()
    sketchDraw.live.has = true
    hover.remember(1, 1)
    hover.clear()
    expect(sketchSnapper.hide).toHaveBeenCalled()
    expect(sketchDraw.live.has).toBe(false)
    expect(sketchDraw.drawChain).toHaveBeenCalled()
    expect(scheduleRender).toHaveBeenCalled()
    expect(sketchDraw.forgetHover).toHaveBeenCalled()
    expect(sketchHandler.forgetHover).toHaveBeenCalled()
    expect(sketchEditor.hoverProfileId).toBe('')
    expect(sketchEditor.hoverVertex).toBe(-1)
    // And the remembered pointer is gone: Shift no longer re-snaps.
    sketchSnapper.snap.mockClear()
    hover.onShiftKey(shift('keydown'))
    expect(sketchSnapper.snap).not.toHaveBeenCalled()
  })

  it('clear keeps the marker while a drag is in progress', () => {
    const { hover, sketchDraw, sketchSnapper } = setup()
    sketchDraw.drag.active = true
    hover.clear()
    expect(sketchSnapper.hide).not.toHaveBeenCalled()
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { createCameraNavigation } from './cameraNavigation.js'

/**
 * `createCameraNavigation` is framework-free. The orbit camera is a stub that records the calls it
 * is given, so each rule is asserted as the exact camera move it makes.
 */

/** @param {{ mode?: string, sketching?: boolean, heightPx?: number, mmPerPixel?: number }} [options] */
function setup({ mode = 'orbit', sketching = false, heightPx = 600, mmPerPixel = 0.5 } = {}) {
  const orbit = {
    getMmPerPixel: vi.fn(() => mmPerPixel),
    pan: vi.fn(),
    orbit: vi.fn(),
    dolly: vi.fn(),
    snapTo: vi.fn(),
    reset: vi.fn(),
  }
  const state = { mode }
  const deps = {
    orbit,
    getMode: () => state.mode,
    setMode: vi.fn((next) => {
      state.mode = next
    }),
    isSketching: () => sketching,
    heightPx: () => heightPx,
    scheduleRender: vi.fn(),
  }
  const nav = createCameraNavigation(deps)
  return { nav, orbit, deps, state }
}

describe('createCameraNavigation: the direction pad', () => {
  it('orbits by one step in orbit mode', () => {
    const { nav, orbit, deps } = setup({ mode: 'orbit' })
    nav.step('up')
    expect(orbit.orbit).toHaveBeenCalledWith(0, 15)
    nav.step('left')
    expect(orbit.orbit).toHaveBeenLastCalledWith(-15, 0)
    expect(deps.scheduleRender).toHaveBeenCalled()
  })

  it('pans by one step, in millimetres, in pan mode', () => {
    const { nav, orbit } = setup({ mode: 'pan', mmPerPixel: 0.5 })
    nav.step('right')
    // 60 px at 0.5 mm per pixel.
    expect(orbit.pan).toHaveBeenCalledWith(30, 0)
    expect(orbit.orbit).not.toHaveBeenCalled()
  })

  it('pans even in orbit mode while sketching, so the camera lock holds', () => {
    const { nav, orbit } = setup({ mode: 'orbit', sketching: true, mmPerPixel: 1 })
    nav.step('down')
    expect(orbit.pan).toHaveBeenCalledWith(0, -60)
    expect(orbit.orbit).not.toHaveBeenCalled()
  })

  it('falls back to one millimetre per pixel when the camera reports no scale', () => {
    const { nav, orbit } = setup({ mode: 'pan', mmPerPixel: 0 })
    nav.step('up')
    expect(orbit.pan).toHaveBeenCalledWith(0, 60)
  })
})

describe('createCameraNavigation: zoom, views and reset', () => {
  it('zooms in by a fixed step and out by its inverse', () => {
    const { nav, orbit } = setup()
    nav.zoom('in')
    expect(orbit.dolly).toHaveBeenLastCalledWith(1 / 1.25)
    nav.zoom('out')
    expect(orbit.dolly).toHaveBeenLastCalledWith(1.25)
  })

  it('snaps to a standard view', () => {
    const { nav, orbit, deps } = setup()
    nav.snapView('top')
    expect(orbit.snapTo).toHaveBeenCalledWith('top')
    expect(deps.scheduleRender).toHaveBeenCalled()
  })

  it('ignores a standard-view snap while sketching, since it would leave drags projecting onto nothing', () => {
    const { nav, orbit } = setup({ sketching: true })
    nav.snapView('front')
    expect(orbit.snapTo).not.toHaveBeenCalled()
  })

  it('resets to the home view', () => {
    const { nav, orbit, deps } = setup()
    nav.reset()
    expect(orbit.reset).toHaveBeenCalledTimes(1)
    expect(deps.scheduleRender).toHaveBeenCalled()
  })
})

describe('createCameraNavigation: the drag-mode toggle and the wheel', () => {
  it('sets the drag mode', () => {
    const { nav, state } = setup({ mode: 'orbit' })
    nav.setMode('pan')
    expect(state.mode).toBe('pan')
  })

  it('refuses to change the drag mode while sketching', () => {
    const { nav, deps, state } = setup({ mode: 'orbit', sketching: true })
    nav.setMode('pan')
    expect(deps.setMode).not.toHaveBeenCalled()
    expect(state.mode).toBe('orbit')
  })

  it('dollies on the wheel, exponentially in the wheel delta, without scrolling the page', () => {
    const { nav, orbit } = setup()
    const event = { deltaY: 100, preventDefault: vi.fn() }
    nav.wheel(/** @type {any} */ (event))
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(orbit.dolly).toHaveBeenCalledWith(Math.exp(100 * 0.0015))
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSceneThemeSync } from './sceneThemeSync.js'
import { sceneThemeOf } from './theme.js'

afterEach(() => vi.unstubAllGlobals())

/** @param {{ viewport?: any }} [options] */
function setup({ viewport = null } = {}) {
  const bodyScene = { applyMaterialTheme: vi.fn() }
  const placementGhost = { setColor: vi.fn() }
  const sketchPreview = { setColor: vi.fn() }
  const scheduleRender = vi.fn()
  const sync = createSceneThemeSync({
    scheme: () => 'dark',
    getViewport: () => viewport,
    bodyScene,
    placementGhost,
    sketchPreview,
    scheduleRender,
  })
  return { sync, bodyScene, placementGhost, sketchPreview, scheduleRender }
}

describe('createSceneThemeSync', () => {
  it('falls back to the scheme palette (never black) when no stylesheet can be read', () => {
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('getComputedStyle', () => {
      throw new Error('no styles')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sync } = setup()
    expect(sync.read()).toEqual(sceneThemeOf('dark'))
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('recolours the bodies, the ghost and the preview, themes the viewport and schedules a frame', () => {
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('getComputedStyle', () => {
      throw new Error('no styles')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const viewport = { graph: { setTheme: vi.fn() } }
    const { sync, bodyScene, placementGhost, sketchPreview, scheduleRender } = setup({ viewport })
    sync.onThemeChange()
    const colors = sceneThemeOf('dark')
    expect(placementGhost.setColor).toHaveBeenCalledWith(colors.bodyGhost)
    expect(sketchPreview.setColor).toHaveBeenCalledWith(colors.bodyGhost)
    expect(bodyScene.applyMaterialTheme).toHaveBeenCalledWith(colors)
    expect(viewport.graph.setTheme).toHaveBeenCalledWith(colors)
    expect(scheduleRender).toHaveBeenCalled()
  })

  it('tolerates a missing viewport (before mount)', () => {
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('getComputedStyle', () => {
      throw new Error('x')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sync, scheduleRender } = setup()
    expect(() => sync.onThemeChange()).not.toThrow()
    expect(scheduleRender).toHaveBeenCalled()
  })
})

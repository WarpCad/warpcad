// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { Color, Light, LineSegments } from 'three'
import { createSceneGraph, VIEWPORT_COLORS, VIEWPORT_THEMES } from './scene.js'
import { createOrbitCamera, STANDARD_VIEWS } from './camera.js'

/**
 * Only `createSceneGraph` is covered here — it is deliberately WebGL-free so it
 * runs in plain Node. `createViewport`'s renderer half needs a real GL context
 * and is covered by `e2e/viewport-scaffold.e2e.js` against all three engines,
 * per CLAUDE.md's "mock at the boundary" rule.
 */
describe('createSceneGraph', () => {
  it('has light sources — the render-009 regression guard', () => {
    const graph = createSceneGraph()
    const lights = graph.scene.children.filter((child) => child instanceof Light)
    // SECOND-ATTEMPT.md: "the scene is very dark" shipped twice, the second time
    // three days after it was marked fixed. This asserts the fix at the source.
    expect(lights.length).toBeGreaterThanOrEqual(2)
    expect(lights.some((light) => light.intensity > 0)).toBe(true)
    graph.dispose()
  })

  it('uses a dark but non-black background', () => {
    const graph = createSceneGraph()
    const background = graph.scene.background
    expect(background).toBeInstanceOf(Color)
    const { r, g, b } = /** @type {Color} */ (background)
    expect(r + g + b).toBeGreaterThan(0)
    // Dark-mode primary: still clearly a dark ground, not a light theme.
    expect(Math.max(r, g, b)).toBeLessThan(0.5)
    graph.dispose()
  })

  it('draws both grid tiers plus two axis lines, all with distinct colours', () => {
    const graph = createSceneGraph()
    const tiers = graph.grid.children.filter((child) => child instanceof LineSegments)
    expect(tiers).toHaveLength(4)
    const colors = new Set(
      tiers.map((tier) => /** @type {import('three').LineBasicMaterial} */ (tier.material).color.getHex()),
    )
    expect(colors.size).toBe(4)
    expect(colors.has(VIEWPORT_COLORS.gridMinor)).toBe(true)
    expect(colors.has(VIEWPORT_COLORS.gridMajor)).toBe(true)
    graph.dispose()
  })

  it('exposes the grid spacing so the on-screen readout can label it', () => {
    const graph = createSceneGraph()
    expect(graph.gridLines.minorMm).toBe(10)
    expect(graph.gridLines.majorMm).toBe(50)
    graph.dispose()
  })

  it('starts the three.js camera Z-up', () => {
    const graph = createSceneGraph()
    expect(graph.camera.up.z).toBe(1)
    graph.dispose()
  })

  it('applies the orbit model to the three camera, including at the top-view pole', () => {
    const graph = createSceneGraph()
    const orbit = createOrbitCamera({ distanceMm: 300 })
    orbit.snapTo('top')
    graph.applyCamera(orbit)

    expect(graph.camera.position.x).toBeCloseTo(0, 6)
    expect(graph.camera.position.y).toBeCloseTo(0, 6)
    expect(graph.camera.position.z).toBeCloseTo(300, 6)
    // Looking straight down Z would be degenerate with a naive (0,0,1) up.
    expect(graph.camera.up.y).toBeCloseTo(1, 6)

    // The resulting view matrix must be finite — a gimbal-locked lookAt produces
    // NaNs here, which render as a blank canvas rather than an error.
    graph.camera.updateMatrixWorld(true)
    for (const value of graph.camera.matrixWorldInverse.elements) {
      expect(Number.isFinite(value)).toBe(true)
    }
    graph.dispose()
  })

  it('tracks the pan target rather than always looking at the origin', () => {
    const graph = createSceneGraph()
    const orbit = createOrbitCamera({ ...STANDARD_VIEWS.front, distanceMm: 100 })
    orbit.pan(40, 0)
    graph.applyCamera(orbit)
    expect(graph.camera.position.x).toBeCloseTo(orbit.state.target.x, 6)
    graph.dispose()
  })

  it('updates the projection only when the aspect actually changes', () => {
    const graph = createSceneGraph()
    graph.setAspect(2)
    expect(graph.camera.aspect).toBe(2)
    graph.setAspect(0)
    graph.setAspect(Number.NaN)
    expect(graph.camera.aspect).toBe(2)
    graph.dispose()
  })

  it('builds a light scene when the browser asks for one', () => {
    // The canvas has to follow `prefers-color-scheme` too — light DOM chrome
    // around a hardcoded dark scene is a visual bug no DOM assertion can see.
    const graph = createSceneGraph({ theme: 'light' })
    const { r, g, b } = /** @type {Color} */ (graph.scene.background)
    expect((r + g + b) / 3).toBeGreaterThan(0.5)
    graph.dispose()
  })

  it('repaints background and every grid tier when the theme changes', () => {
    const graph = createSceneGraph({ theme: 'dark' })
    const tierColor = () =>
      graph.grid.children
        .filter((child) => child instanceof LineSegments)
        .map((tier) => /** @type {import('three').LineBasicMaterial} */ (tier.material).color.getHex())

    expect(tierColor()).toEqual([
      VIEWPORT_THEMES.dark.gridMinor,
      VIEWPORT_THEMES.dark.gridMajor,
      VIEWPORT_THEMES.dark.axisX,
      VIEWPORT_THEMES.dark.axisY,
    ])

    expect(graph.setTheme('light')).toBe(true)
    expect(graph.theme).toBe('light')
    expect(/** @type {Color} */ (graph.scene.background).getHex()).toBe(
      VIEWPORT_THEMES.light.background,
    )
    expect(tierColor()).toEqual([
      VIEWPORT_THEMES.light.gridMinor,
      VIEWPORT_THEMES.light.gridMajor,
      VIEWPORT_THEMES.light.axisX,
      VIEWPORT_THEMES.light.axisY,
    ])

    // Idempotent, and unknown names are ignored rather than blanking the scene.
    expect(graph.setTheme('light')).toBe(false)
    expect(graph.setTheme('solarized')).toBe(false)
    expect(graph.theme).toBe('light')
    graph.dispose()
  })

  it('keeps both palettes legible: grid tiers contrast with their background', () => {
    // Measured on the authored sRGB bytes, not three.js `Color` channels —
    // `setHex` converts to linear working space, which squashes the difference
    // between two dark colours to near nothing and would make this check pass or
    // fail for reasons that have nothing to do with what a user sees.
    /** @param {number} hex @returns {[number, number, number]} */
    const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
    /** @param {number} a @param {number} b */
    const contrast = (a, b) => {
      const [ar, ag, ab] = rgb(a)
      const [br, bg, bb] = rgb(b)
      return (Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb)) / 255
    }

    for (const [name, palette] of Object.entries(VIEWPORT_THEMES)) {
      const tiers = /** @type {const} */ ([
        ['gridMinor', palette.gridMinor],
        ['gridMajor', palette.gridMajor],
        ['axisX', palette.axisX],
        ['axisY', palette.axisY],
      ])
      for (const [tier, color] of tiers) {
        expect(contrast(color, palette.background), `${name}.${tier}`).toBeGreaterThan(0.15)
      }
      // Major lines must read as brighter/stronger than minor ones, or the grid
      // has no readable 50mm rhythm.
      expect(
        contrast(palette.gridMajor, palette.background),
        `${name}: major vs minor emphasis`,
      ).toBeGreaterThan(contrast(palette.gridMinor, palette.background))
    }
  })

  it('empties the scene on dispose', () => {
    const graph = createSceneGraph()
    graph.dispose()
    expect(graph.scene.children).toHaveLength(0)
  })
})

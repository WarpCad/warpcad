// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ mounted: /** @type {(() => void)[]} */ ([]), unmount: /** @type {(() => void)[]} */ ([]) }))
vi.mock('vue', async (importOriginal) => ({
  ...(await importOriginal()),
  onMounted: (/** @type {() => void} */ fn) => void hooks.mounted.push(fn),
  onBeforeUnmount: (/** @type {() => void} */ fn) => void hooks.unmount.push(fn),
}))

const fakeViewport = vi.hoisted(() => ({
  graph: { scene: { add: vi.fn() }, gridLines: { minorMm: 5, majorMm: 25 } },
  renderer: {},
  dispose: vi.fn(),
}))
vi.mock('../render/scene.js', () => ({ createViewport: vi.fn(() => fakeViewport) }))
vi.mock('../render/offscreenCapture.js', () => ({
  createOffscreenCapture: vi.fn(() => ({ capture: true })),
  setViewportCapture: vi.fn(),
}))
vi.mock('./useViewportWatchers.js', () => ({ registerViewportWatchers: vi.fn(() => [vi.fn(), vi.fn()]) }))
vi.mock('./useOverlayStack.js', () => ({ registerEscapeYield: vi.fn(() => vi.fn()) }))
vi.mock('./useTheme.js', () => ({ useTheme: () => ({ onChange: vi.fn(() => vi.fn()) }) }))

import { createViewport } from '../render/scene.js'
import { setViewportCapture } from '../render/offscreenCapture.js'
import { registerViewportWatchers } from './useViewportWatchers.js'
import { useViewportLifecycle } from './useViewportLifecycle.js'

function setup({ canvas = /** @type {any} */ ({}), frame = false } = {}) {
  /** @type {any} */
  let viewport = null
  const calls = /** @type {string[]} */ ([])
  const d = /** @type {any} */ ({
    rootEl: { value: { id: 'root' } },
    canvasEl: { value: canvas },
    webglError: { value: '' },
    orbit: { fovDeg: 45 },
    overlay: { minorMm: 10, majorMm: 50 },
    getViewport: () => viewport,
    setViewport: (/** @type {any} */ v) => {
      viewport = v
    },
    readCurrentSceneTheme: () => ({ bodyGhost: 'g' }),
    bodyScene: { createMaterials: vi.fn(), dispose: vi.fn(() => void calls.push('bodyScene.dispose')) },
    bodiesGroup: { id: 'group' },
    sketchPreview: { createMaterial: vi.fn(), clear: vi.fn(), dispose: vi.fn() },
    placementGhost: { setColor: vi.fn(), dispose: vi.fn() },
    referenceImage: { attach: vi.fn(), dispose: vi.fn() },
    placement: { registerTarget: vi.fn(() => vi.fn()) },
    dropTarget: { id: 'drop' },
    sketchEditor: { close: vi.fn() },
    pointer: { shiftKey: vi.fn() },
    gizmoDrag: { shiftKey: vi.fn(), clearStall: vi.fn() },
    contextRecovery: { dispose: vi.fn() },
    attachContextListeners: vi.fn(),
    detachContextListeners: vi.fn(),
    watcherDeps: { w: 1 },
    onSketchChainKey: vi.fn(),
    isChainLive: () => false,
    measure: vi.fn(() => void calls.push('measure')),
    onThemeChange: vi.fn(),
    syncBodies: vi.fn(() => void calls.push('syncBodies')),
    cancelFrame: vi.fn(),
    shouldFrameOnMount: () => frame,
    frameLoadedContent: vi.fn(() => void calls.push('frame')),
  })
  useViewportLifecycle(d)
  return { d, calls, viewport: () => viewport }
}

beforeEach(() => {
  hooks.mounted.length = 0
  hooks.unmount.length = 0
  vi.clearAllMocks()
})

describe('useViewportLifecycle', () => {
  it('registers exactly one mount and one unmount hook', () => {
    setup()
    expect(hooks.mounted).toHaveLength(1)
    expect(hooks.unmount).toHaveLength(1)
  })

  it('does nothing on mount when there is no canvas', () => {
    const { d } = setup({ canvas: null })
    hooks.mounted[0]()
    expect(createViewport).not.toHaveBeenCalled()
    expect(d.measure).not.toHaveBeenCalled()
  })

  it('builds the viewport, labels the grid, registers the target and watchers, then measures and syncs in order', () => {
    const { d, calls, viewport } = setup()
    hooks.mounted[0]()
    expect(createViewport).toHaveBeenCalledWith(d.canvasEl.value, { fovDeg: 45, theme: { bodyGhost: 'g' } })
    expect(viewport()).toBe(fakeViewport)
    expect(fakeViewport.graph.scene.add).toHaveBeenCalledWith(d.bodiesGroup)
    expect(d.referenceImage.attach).toHaveBeenCalledWith(fakeViewport.graph.scene)
    expect(d.overlay).toEqual({ minorMm: 5, majorMm: 25 })
    expect(d.attachContextListeners).toHaveBeenCalledWith(d.canvasEl.value)
    expect(d.placement.registerTarget).toHaveBeenCalledWith(d.dropTarget)
    expect(registerViewportWatchers).toHaveBeenCalledWith(d.watcherDeps)
    expect(calls).toEqual(['measure', 'syncBodies'])
  })

  it('frames the loaded content only when asked to', () => {
    const a = setup({ frame: true })
    hooks.mounted[0]()
    expect(a.calls).toEqual(['measure', 'syncBodies', 'frame'])
  })

  it('reports a WebGL failure and keeps going', () => {
    vi.mocked(createViewport).mockImplementationOnce(() => {
      throw new Error('no gl')
    })
    const { d, calls, viewport } = setup()
    hooks.mounted[0]()
    expect(d.webglError.value).toContain('This browser could not start WebGL')
    expect(viewport()).toBeNull()
    expect(calls).toEqual(['measure', 'syncBodies'])
  })

  it('binds and then removes the window listeners', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { d } = setup()
    hooks.mounted[0]()
    for (const [type, fn] of [
      ['keydown', d.onSketchChainKey],
      ['keydown', d.pointer.shiftKey],
      ['keyup', d.pointer.shiftKey],
      ['keydown', d.gizmoDrag.shiftKey],
      ['keyup', d.gizmoDrag.shiftKey],
      ['resize', d.measure],
    ]) {
      expect(add).toHaveBeenCalledWith(type, fn)
    }
    expect(add).toHaveBeenCalledWith('scroll', d.measure, { passive: true })
    hooks.unmount[0]()
    for (const [type, fn] of [
      ['keydown', d.onSketchChainKey],
      ['keydown', d.pointer.shiftKey],
      ['keyup', d.pointer.shiftKey],
      ['keydown', d.gizmoDrag.shiftKey],
      ['keyup', d.gizmoDrag.shiftKey],
      ['resize', d.measure],
      ['scroll', d.measure],
    ]) {
      expect(remove).toHaveBeenCalledWith(type, fn)
    }
    add.mockRestore()
    remove.mockRestore()
  })

  it('tears everything down on unmount and clears the viewport', () => {
    const { d, viewport } = setup()
    hooks.mounted[0]()
    hooks.unmount[0]()
    expect(setViewportCapture).toHaveBeenLastCalledWith(null)
    expect(d.sketchEditor.close).toHaveBeenCalled()
    expect(d.sketchPreview.clear).toHaveBeenCalled()
    expect(d.sketchPreview.dispose).toHaveBeenCalled()
    expect(d.referenceImage.dispose).toHaveBeenCalled()
    expect(d.cancelFrame).toHaveBeenCalled()
    expect(d.gizmoDrag.clearStall).toHaveBeenCalled()
    expect(d.detachContextListeners).toHaveBeenCalledWith(d.canvasEl.value)
    expect(d.contextRecovery.dispose).toHaveBeenCalled()
    expect(d.bodyScene.dispose).toHaveBeenCalled()
    expect(d.placementGhost.dispose).toHaveBeenCalled()
    expect(fakeViewport.dispose).toHaveBeenCalled()
    expect(viewport()).toBeNull()
  })

  it('unmounts safely when mount never built a viewport', () => {
    const { viewport } = setup({ canvas: null })
    hooks.mounted[0]()
    expect(() => hooks.unmount[0]()).not.toThrow()
    expect(viewport()).toBeNull()
  })
})

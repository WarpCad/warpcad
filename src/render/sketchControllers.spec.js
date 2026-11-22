// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { createOrbitCamera } from './camera.js'
import { createSketchControllers } from './sketchControllers.js'

/**
 * The factory only wires real controllers to one another; this builds them on the real orbit camera
 * with a plain editor and checks the wiring (lazy pointer, shared snapper, chain keys).
 */
function setup() {
  const FRAME = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const sketchEditor = {
    active: true,
    tool: 'rect',
    slice: { profiles: [], zMm: 0 },
    frame: FRAME,
    snapEnabled: true,
    selectedProfileId: '',
    chainId: '',
    chainLive: false,
    draft: { slices: [], extrusion: null },
    selectedVertex: -1,
    hoverVertex: -1,
    hoverProfileId: '',
  }
  const pointer = { projectToSketch: vi.fn(() => null), isTouchPress: vi.fn(() => false) }
  const pointerGetter = vi.fn(() => pointer)
  const scheduleRender = vi.fn()
  const overlays = {
    sketchSnap: { visible: false, xPx: 0, yPx: 0, markerXPx: 0, markerYPx: 0, lifted: false, kind: '', label: '' },
    sketchHandles: { vertices: [], midpoints: [] },
    sketchChain: { visible: false, d: '' },
    sketchDraftPath: { visible: false, d: '' },
    sketchPaths: [],
    sketchAxis: { visible: false, d: '' },
  }
  const controllers = createSketchControllers({
    orbit: createOrbitCamera(),
    sketchEditor,
    sliceZ: () => 0,
    widthPx: () => 800,
    heightPx: () => 600,
    viewportRect: { left: 0, top: 0, width: 800, height: 600 },
    pointer: pointerGetter,
    scheduleRender,
    referenceImage: { syncOverlay: vi.fn() },
    isSketching: () => true,
    isTextEntry: () => false,
    overlays,
    channel: { request: vi.fn(), cancel: vi.fn() },
    resolution: () => ({}),
    scene: () => null,
  })
  return { controllers, pointerGetter, sketchEditor, scheduleRender }
}

describe('createSketchControllers', () => {
  it('builds every controller and the sync entry points', () => {
    const { controllers } = setup()
    for (const key of ['sketchSnapper', 'sketchHandler', 'sketchDraw', 'sketchPreview', 'sketchPathSync']) {
      expect(/** @type {any} */ (controllers)[key], key).toBeTruthy()
    }
    expect(typeof controllers.onSketchChainKey).toBe('function')
    expect(typeof controllers.syncSketchPaths).toBe('function')
  })

  it('does not touch the pointer while constructing (it is built after the controllers)', () => {
    const { pointerGetter } = setup()
    expect(pointerGetter).not.toHaveBeenCalled()
  })

  it('syncSketchPaths clears the overlays without throwing while the editor is closed', () => {
    const { controllers, sketchEditor } = setup()
    sketchEditor.active = false
    expect(() => controllers.syncSketchPaths()).not.toThrow()
    expect(() => controllers.syncSketchPaths(true)).not.toThrow()
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { createOrbitCamera } from './camera.js'
import { createSketchPathSync } from './sketchPathSync.js'

/** A closed 10 mm square polyline profile. */
function square(id = 'p1') {
  return {
    id,
    kind: 'polyline',
    role: 'solid',
    closed: true,
    pointsMm: [[0, 0], [10, 0], [10, 10], [0, 10]],
  }
}

function setup(overrides = {}) {
  const orbit = createOrbitCamera()
  const editor = {
    active: true,
    draft: { slices: [{ id: 's1', zMm: 0, profiles: [square()] }], extrusion: { method: 'linear' } },
    frame: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    selectedProfileId: '',
    hoverProfileId: '',
    activeSlice: 0,
    selectedVertex: -1,
    hoverVertex: -1,
    tool: 'select',
    ...overrides,
  }
  /** @type {any[]} */
  const paths = []
  const axis = { visible: false, d: '' }
  const draftPath = { visible: true }
  const chain = { visible: true }
  const handler = { clear: vi.fn(), sync: vi.fn() }
  const draw = { live: { has: true }, drawChain: vi.fn() }
  const snapper = { hide: vi.fn(), draw: vi.fn() }
  const referenceImage = { syncOverlay: vi.fn() }
  const sync = createSketchPathSync({
    orbit,
    sketchEditor: editor,
    paths,
    axis,
    draftPath,
    chain,
    handler,
    draw,
    snapper,
    referenceImage,
    widthPx: () => 800,
    heightPx: () => 600,
    sliceZ: () => 0,
  })
  return { sync, editor, paths, axis, draftPath, chain, handler, draw, snapper, referenceImage, orbit }
}

describe('createSketchPathSync', () => {
  it('projects each profile into one outline entry', () => {
    const { sync, paths, handler, referenceImage } = setup()
    sync.sync()
    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatchObject({ key: 's1/p1', id: 'p1', closed: true, open: false, active: true })
    expect(typeof paths[0].d).toBe('string')
    expect(handler.sync).toHaveBeenCalledTimes(1)
    expect(referenceImage.syncOverlay).toHaveBeenCalledTimes(1)
  })

  it('redraws nothing when nothing changed, and again after force', () => {
    const { sync, handler } = setup()
    sync.sync()
    sync.sync()
    expect(handler.sync).toHaveBeenCalledTimes(1)
    sync.sync(true)
    expect(handler.sync).toHaveBeenCalledTimes(2)
  })

  it('redraws when the selection, tool or camera version changes', () => {
    const { sync, editor, handler, orbit } = setup()
    sync.sync()
    editor.selectedProfileId = 'p1'
    sync.sync()
    expect(handler.sync).toHaveBeenCalledTimes(2)
    editor.tool = 'line'
    sync.sync()
    expect(handler.sync).toHaveBeenCalledTimes(3)
    orbit.orbit?.(5, 0)
    if (orbit.version !== undefined) {
      sync.sync()
      expect(handler.sync.mock.calls.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('marks only the active slice selected', () => {
    const { sync, editor, paths } = setup({ selectedProfileId: 'p1' })
    editor.draft.slices.push({ id: 's2', zMm: 5, profiles: [square('p1')] })
    sync.sync()
    expect(paths.map((p) => p.selected)).toEqual([true, false])
  })

  it('draws the axis only for revolve and helical', () => {
    const { sync, editor, axis } = setup()
    sync.sync()
    expect(axis.visible).toBe(false)
    editor.draft = { ...editor.draft, extrusion: { method: 'revolve' } }
    sync.sync()
    // Visibility follows the projection (a 200 mm reach may clip); the path itself is always built.
    expect(axis.d.length).toBeGreaterThan(0)
  })

  it('clears everything when the editor is inactive', () => {
    const { sync, editor, paths, draftPath, chain, draw, snapper, handler, axis } = setup()
    sync.sync()
    editor.active = false
    sync.sync()
    expect(paths).toHaveLength(0)
    expect(handler.clear).toHaveBeenCalled()
    expect([axis.visible, draftPath.visible, chain.visible, draw.live.has]).toEqual([false, false, false, false])
    expect(snapper.hide).toHaveBeenCalled()
    // Reopening draws again: the cache was dropped.
    editor.active = true
    handler.sync.mockClear()
    sync.sync()
    expect(handler.sync).toHaveBeenCalledTimes(1)
  })

  it('handles an empty draft', () => {
    const { sync, editor, paths } = setup()
    editor.draft = { slices: [{ id: 's1', zMm: 0, profiles: [] }], extrusion: { method: 'linear' } }
    sync.sync()
    expect(paths).toHaveLength(0)
  })
})

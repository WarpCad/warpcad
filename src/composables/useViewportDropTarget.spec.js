// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { libraryRow } from '../core/library.js'
import { createViewportDropTarget } from './useViewportDropTarget.js'

const CUBE = 'primitive.cuboid'
const SKETCH = 'primitive.sketch'

/** @param {{ previewing?: boolean, sketching?: boolean, point?: any, mounted?: boolean }} [opts] */
function setup({ previewing = false, sketching = false, point = { x: 12, y: 34 }, mounted = true } = {}) {
  const root = { contains: vi.fn((el) => el === 'inside') }
  const rect = { left: 100, top: 50, width: 400, height: 300 }
  const placementGhost = { preview: vi.fn(), clear: vi.fn(), dropPoint: vi.fn(() => point) }
  const sketchCommands = { openNew: vi.fn() }
  const documentStore = { raw: { nextId: vi.fn(() => 'cuboid-1'), nextName: vi.fn(() => 'Cube 1') }, appendAll: vi.fn() }
  const selection = { select: vi.fn() }
  const syncBodies = vi.fn()
  const scheduleRender = vi.fn()
  const elementFromPoint = vi.fn(() => /** @type {any} */ ('inside'))
  const target = createViewportDropTarget({
    root: () => /** @type {any} */ (root),
    rect,
    hasViewport: () => mounted,
    placementGhost,
    scheduleRender,
    isPreviewing: () => previewing,
    isSketching: () => sketching,
    sketchCommands,
    documentStore,
    selection,
    syncBodies,
    elementFromPoint,
  })
  return { target, rect, root, placementGhost, sketchCommands, documentStore, selection, syncBodies, scheduleRender, elementFromPoint }
}

describe('createViewportDropTarget.contains', () => {
  it('is true for a point inside the rect with the viewport on top', () => {
    expect(setup().target.contains(200, 100)).toBe(true)
  })

  it('is false outside the rect, on its edges excluded', () => {
    const { target } = setup()
    expect(target.contains(99, 100)).toBe(false)
    expect(target.contains(501, 100)).toBe(false)
    expect(target.contains(200, 49)).toBe(false)
    expect(target.contains(200, 351)).toBe(false)
    // The edge itself still counts, as it always did.
    expect(target.contains(100, 50)).toBe(true)
  })

  it('is false with no root or a zero-width rect', () => {
    const none = setup()
    none.rect.width = 0
    expect(none.target.contains(200, 100)).toBe(false)
  })

  it('is false when another element (a bottom sheet) is on top', () => {
    const { target, elementFromPoint } = setup()
    elementFromPoint.mockReturnValue(/** @type {any} */ ('sheet'))
    expect(target.contains(200, 100)).toBe(false)
    elementFromPoint.mockReturnValue(null)
    expect(target.contains(200, 100)).toBe(false)
  })
})

describe('createViewportDropTarget.preview and clearPreview', () => {
  it('previews through the ghost and schedules a frame', () => {
    const { target, placementGhost, scheduleRender } = setup()
    target.preview(CUBE, 10, 20, {})
    expect(placementGhost.preview).toHaveBeenCalledTimes(1)
    expect(placementGhost.preview.mock.calls[0][0]).toBe(CUBE)
    expect(scheduleRender).toHaveBeenCalledTimes(1)
  })

  it('does nothing before the view is mounted', () => {
    const { target, placementGhost } = setup({ mounted: false })
    target.preview(CUBE, 10, 20, {})
    expect(placementGhost.preview).not.toHaveBeenCalled()
  })

  it('clears the ghost', () => {
    const { target, placementGhost, scheduleRender } = setup()
    target.clearPreview()
    expect(placementGhost.clear).toHaveBeenCalledTimes(1)
    expect(scheduleRender).toHaveBeenCalledTimes(1)
  })
})

describe('createViewportDropTarget.commit', () => {
  it('appends the drop records in one call, selects the first and syncs', () => {
    const { target, documentStore, selection, syncBodies } = setup()
    const id = target.commit(CUBE, 10, 20, {})
    expect(documentStore.appendAll).toHaveBeenCalledTimes(1)
    const [records, options] = documentStore.appendAll.mock.calls[0]
    expect(options).toEqual({ origin: 'local' })
    expect(records[0].id).toBe('cuboid-1')
    expect(id).toBe('cuboid-1')
    expect(selection.select).toHaveBeenCalledWith('cuboid-1')
    expect(syncBodies).toHaveBeenCalledTimes(1)
  })

  it('returns null and appends nothing when there is no drop point', () => {
    const { target, documentStore } = setup({ point: null })
    expect(target.commit(CUBE, 10, 20, {})).toBeNull()
    expect(documentStore.appendAll).not.toHaveBeenCalled()
  })

  it('appends nothing while a timeline preview is showing', () => {
    const { target, documentStore } = setup({ previewing: true })
    expect(target.commit(CUBE, 10, 20, {})).toBeNull()
    expect(documentStore.appendAll).not.toHaveBeenCalled()
  })

  it('hands the snapped point to an armed session instead of appending', () => {
    const { target, documentStore, syncBodies } = setup()
    const place = vi.fn(() => 'imported-1')
    expect(target.commit(CUBE, 10, 20, {}, place)).toBe('imported-1')
    expect(place).toHaveBeenCalledWith({ x: 12, y: 34 })
    expect(documentStore.appendAll).not.toHaveBeenCalled()
    expect(syncBodies).toHaveBeenCalledTimes(1)
  })

  it('refuses an armed session while previewing', () => {
    const { target } = setup({ previewing: true })
    const place = vi.fn()
    expect(target.commit(CUBE, 10, 20, {}, place)).toBeNull()
    expect(place).not.toHaveBeenCalled()
  })

  it('a Sketch row opens the editor at the drop point and commits nothing', () => {
    expect(libraryRow(SKETCH).editor).toBe('sketch')
    const { target, sketchCommands, documentStore } = setup()
    expect(target.commit(SKETCH, 10, 20, {})).toBeNull()
    expect(sketchCommands.openNew).toHaveBeenCalledWith([12, 34, 0])
    expect(documentStore.appendAll).not.toHaveBeenCalled()
  })

  it('a Sketch row does nothing while the editor is already open', () => {
    const { target, sketchCommands } = setup({ sketching: true })
    expect(target.commit(SKETCH, 10, 20, {})).toBeNull()
    expect(sketchCommands.openNew).not.toHaveBeenCalled()
  })
})

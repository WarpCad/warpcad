// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { registerViewportWatchers } from './useViewportWatchers.js'

function setup({ presentation = false } = {}) {
  const calls = /** @type {string[]} */ ([])
  const fn = (/** @type {string} */ name) => vi.fn(() => void calls.push(name))
  const sketchHandler = { drag: { active: false, beforeDraft: /** @type {any} */ (null) }, endDrag: vi.fn() }
  const deps = {
    documentStore: reactive({ version: 0, loadRevision: 0 }),
    timeline: reactive({ previewStep: 0, watchRevision: 0 }),
    hiddenPartVisibility: reactive({ shown: new Set() }),
    sketchEditor: reactive({
      active: false,
      draft: { id: 'a' },
      activeSlice: 0,
      selectedProfileId: '',
      hoverProfileId: '',
      selectedVertex: -1,
      hoverVertex: -1,
      tool: 'select',
      chainPointCount: 0,
      snapEnabled: true,
      assetsVersion: 0,
      frame: [1],
      imageTool: 'none',
      scaleAPx: null,
      scaleBPx: null,
    }),
    selection: reactive({ ids: /** @type {string[]} */ ([]), subPart: null }),
    alignReference: reactive({ originOnly: false }),
    hoverHighlight: reactive({ target: null, many: null }),
    repeatSession: reactive({ seed: null, outlined: /** @type {string[]} */ ([]) }),
    colorPreview: reactive({ bodyId: null, subPart: null, color: null }),
    presentation: () => presentation,
    sketchDraw: { end: vi.fn() },
    sketchHandler,
    sketchPreview: { clear: fn('preview.clear'), request: fn('preview.request') },
    sketchSnapper: { hide: fn('snap.hide') },
    pointer: { cancelScaleDrag: fn('pointer.cancelScale') },
    referenceImage: { release: fn('image.release'), sync: fn('image.sync'), syncOverlay: fn('image.overlay') },
    syncBodies: fn('syncBodies'),
    frameLoadedContent: fn('frame'),
    aimAtSketch: fn('aim'),
    applySketchBodyVisibility: fn('sketchBodies'),
    syncSketchPaths: fn('paths'),
    scheduleRender: fn('render'),
    applySelectionMaterial: fn('selectionMaterial'),
    applyHover: fn('hover'),
    applyRepeatOutlines: fn('repeatOutlines'),
    paintBodies: fn('paint'),
  }
  const stops = registerViewportWatchers(/** @type {any} */ (deps))
  return { deps, calls, stops }
}

describe('registerViewportWatchers', () => {
  it('returns one stop handle per watcher, and stopping them silences everything', async () => {
    const { deps, stops } = setup()
    expect(stops.length).toBeGreaterThan(10)
    for (const stop of stops) stop()
    deps.documentStore.version += 1
    deps.selection.ids.push('a')
    await nextTick()
    expect(deps.syncBodies).not.toHaveBeenCalled()
    expect(deps.applySelectionMaterial).not.toHaveBeenCalled()
  })

  it('a document edit, a preview step and a Watch revision each sync the bodies', async () => {
    const { deps } = setup()
    deps.documentStore.version += 1
    await nextTick()
    expect(deps.syncBodies).toHaveBeenCalledTimes(1)
    deps.timeline.previewStep += 1
    await nextTick()
    expect(deps.syncBodies).toHaveBeenCalledTimes(2)
    deps.timeline.watchRevision += 1
    await nextTick()
    expect(deps.syncBodies).toHaveBeenCalledTimes(3)
  })

  it('toggling hidden-part visibility re-syncs, even though the Set is the same object', async () => {
    const { deps } = setup()
    deps.hiddenPartVisibility.shown.add('x')
    await nextTick()
    expect(deps.syncBodies).toHaveBeenCalledTimes(1)
  })

  it('a loaded document frames the camera after the bodies sync', async () => {
    const { deps, calls } = setup()
    deps.documentStore.version += 1
    deps.documentStore.loadRevision += 1
    await nextTick()
    expect(calls.indexOf('syncBodies')).toBeGreaterThanOrEqual(0)
    expect(calls).toContain('frame')
    expect(calls.indexOf('syncBodies')).toBeLessThan(calls.indexOf('frame'))
  })

  it('a Watch revision frames only in the Shared view', async () => {
    const plain = setup()
    plain.deps.timeline.watchRevision += 1
    await nextTick()
    expect(plain.deps.frameLoadedContent).not.toHaveBeenCalled()
    const shared = setup({ presentation: true })
    shared.deps.timeline.watchRevision += 1
    await nextTick()
    expect(shared.deps.frameLoadedContent).toHaveBeenCalledTimes(1)
  })

  it('opening the sketch editor aims the camera and re-projects the outlines', async () => {
    const { deps } = setup()
    deps.sketchEditor.active = true
    await nextTick()
    expect(deps.sketchDraw.end).toHaveBeenCalledWith(true)
    expect(deps.sketchHandler.endDrag).toHaveBeenCalledWith(true)
    expect(deps.aimAtSketch).toHaveBeenCalledTimes(1)
    expect(deps.applySketchBodyVisibility).toHaveBeenCalled()
    expect(deps.syncSketchPaths).toHaveBeenCalledWith(true)
    expect(deps.sketchPreview.request).toHaveBeenCalled()
  })

  it('closing the editor clears the preview, the drag and the reference photo', async () => {
    const { deps } = setup()
    deps.sketchEditor.active = true
    await nextTick()
    deps.sketchHandler.drag.active = true
    deps.sketchHandler.drag.beforeDraft = {}
    deps.sketchEditor.active = false
    await nextTick()
    expect(deps.sketchHandler.drag.active).toBe(false)
    expect(deps.sketchHandler.drag.beforeDraft).toBeNull()
    expect(deps.sketchPreview.clear).toHaveBeenCalledTimes(1)
    expect(deps.pointer.cancelScaleDrag).toHaveBeenCalledTimes(1)
    expect(deps.referenceImage.release).toHaveBeenCalledTimes(1)
    expect(deps.aimAtSketch).toHaveBeenCalledTimes(1)
  })

  it('a draft edit asks for a preview, except while a point is being dragged', async () => {
    const { deps } = setup()
    deps.sketchEditor.draft = { id: 'b' }
    await nextTick()
    expect(deps.syncSketchPaths).toHaveBeenCalledWith(true)
    expect(deps.sketchPreview.request).toHaveBeenCalledTimes(1)
    deps.sketchHandler.drag.active = true
    deps.sketchEditor.draft = { id: 'c' }
    await nextTick()
    expect(deps.sketchPreview.request).toHaveBeenCalledTimes(1)
    expect(deps.scheduleRender).toHaveBeenCalled()
  })

  it('a tool, slice, or snap change hides the snap marker', async () => {
    const { deps } = setup()
    deps.sketchEditor.tool = 'line'
    await nextTick()
    expect(deps.sketchSnapper.hide).toHaveBeenCalledTimes(1)
  })

  it('selection, align, hover, repeat outlines, colour preview and pick depth each have their own trigger', async () => {
    const { deps } = setup()
    deps.selection.ids.push('a')
    await nextTick()
    expect(deps.applySelectionMaterial).toHaveBeenCalledTimes(1)
    deps.alignReference.originOnly = true
    await nextTick()
    expect(deps.applySelectionMaterial).toHaveBeenCalledTimes(2)
    deps.hoverHighlight.target = /** @type {any} */ ({ id: 'a' })
    await nextTick()
    expect(deps.applyHover).toHaveBeenCalledTimes(1)
    deps.repeatSession.outlined.push('b')
    await nextTick()
    expect(deps.applyRepeatOutlines).toHaveBeenCalledTimes(1)
    deps.colorPreview.color = /** @type {any} */ ('#fff')
    await nextTick()
    expect(deps.paintBodies).toHaveBeenCalledTimes(1)
    const before = deps.scheduleRender.mock.calls.length
    deps.selection.subPart = /** @type {any} */ ({ partName: 'p' })
    await nextTick()
    expect(deps.scheduleRender.mock.calls.length).toBeGreaterThan(before)
  })
})

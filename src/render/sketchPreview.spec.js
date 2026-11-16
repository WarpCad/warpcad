// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import modeling from '@jscad/modeling'
import { Scene } from 'three'

import { packGeometry } from '../core/kernel/transport.js'
import { createSketchPreview } from './sketchPreview.js'

const { primitives } = modeling

/**
 * `createSketchPreview` is framework-free: the real unpacking and triangulation run, and the
 * evaluation channel is a stub that answers what each test says. No WebGL: a three.js `Scene`
 * is only a container here.
 */

const FRAME = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1])

/**
 * @param {object} [options]
 * @param {any} [options.outcome] What the channel resolves with.
 * @param {string} [options.doneProblem]
 * @param {boolean} [options.withScene]
 */
function setup({ outcome = undefined, doneProblem = '', withScene = true } = {}) {
  const editor = {
    active: true,
    draft: { slices: [{ id: 's', zMm: 0, profiles: [] }], extrusion: { method: 'linear', heightMm: 10 } },
    doneProblem,
    previewStatus: 'idle',
    previewError: '',
    frame: FRAME,
  }
  const request = vi.fn(() => Promise.resolve(outcome))
  const scene = new Scene()
  const scheduleRender = vi.fn()
  const preview = createSketchPreview({
    editor,
    channel: { request },
    resolution: () => 32,
    scene: () => (withScene ? scene : null),
    scheduleRender,
  })
  preview.createMaterial(0x336699)
  return { preview, editor, request, scene, scheduleRender }
}

/** A built 10 mm cube, as the worker would answer. */
function built() {
  return { superseded: false, result: { geometry: packGeometry(primitives.cuboid({ size: [10, 10, 10] })) } }
}

describe('createSketchPreview', () => {
  it('builds the draft in the worker and draws it in the sketch frame', async () => {
    const { preview, editor, request, scene, scheduleRender } = setup({ outcome: built() })
    preview.request()
    expect(editor.previewStatus).toBe('building')
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ kind: 'build', op: 'primitive.sketch', resolution: 32 }))
    await vi.waitFor(() => expect(editor.previewStatus).toBe('ok'))
    const mesh = scene.getObjectByName('sketch-preview')
    expect(mesh).toBeDefined()
    expect(mesh?.matrix.elements[12]).toBeCloseTo(5, 12)
    expect(mesh?.matrix.elements[14]).toBeCloseTo(7, 12)
    expect(scheduleRender).toHaveBeenCalled()

    preview.clear()
    expect(scene.getObjectByName('sketch-preview')).toBeUndefined()
  })

  it('a statically unbuildable draft asks nothing and clears', () => {
    const { preview, editor, request } = setup({ doneProblem: 'Close an outline first' })
    preview.request()
    expect(request).not.toHaveBeenCalled()
    expect(editor.previewStatus).toBe('idle')
  })

  it('a superseded answer, or one for an older draft, never lands', async () => {
    const stale = setup({ outcome: { superseded: true } })
    stale.preview.request()
    await Promise.resolve()
    await Promise.resolve()
    expect(stale.scene.getObjectByName('sketch-preview')).toBeUndefined()
    expect(stale.editor.previewStatus).toBe('building')

    const edited = setup({ outcome: built() })
    edited.preview.request()
    edited.editor.draft = { ...edited.editor.draft }
    await Promise.resolve()
    await Promise.resolve()
    expect(edited.scene.getObjectByName('sketch-preview')).toBeUndefined()
  })

  it('a build error is reported and draws nothing', async () => {
    const { preview, editor, scene } = setup({ outcome: { superseded: false, result: { error: 'Outline crosses the axis' } } })
    preview.request()
    await vi.waitFor(() => expect(editor.previewStatus).toBe('error'))
    expect(editor.previewError).toBe('Outline crosses the axis')
    expect(scene.getObjectByName('sketch-preview')).toBeUndefined()
  })

  it('with no viewport the answer is dropped', async () => {
    const { preview, editor } = setup({ outcome: built(), withScene: false })
    preview.request()
    await vi.waitFor(() => expect(editor.previewStatus).toBe('ok'))
  })

  it('does nothing while the editor is closed', () => {
    const { preview, editor, request } = setup()
    editor.active = false
    preview.request()
    expect(request).not.toHaveBeenCalled()
  })
})

/**
 * The design resolution as document state (`TODO/core-035`): `setResolution` is one
 * undoable, origin-scoped step, and neither the `core-031` fold cache nor the `core-030`
 * undo-restore snapshots can ever hand back geometry tessellated at the old setting.
 *
 * Its own file for the reason `history.spec.js` gives for being its own: this is a new
 * kind of step over the log, not another property of appending to it. Real kernel
 * geometry throughout, because every claim here is about how many sides a circle has.
 */
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { createDocument } from './document.js'
import { isGroup, toGeom3 } from './kernel/group.js'

const { geometries } = modeling

const local = { origin: 'local' }

/**
 * Distinct vertices on a solid's top face — a z-axis cylinder's segment count.
 *
 * @param {any} value
 */
function rim(value) {
  const solid = isGroup(value) ? toGeom3(value) : value
  const vertices = geometries.geom3.toPolygons(solid).flatMap((polygon) => polygon.vertices)
  const top = Math.max(...vertices.map((v) => v[2]))
  const onFace = vertices.filter((v) => Math.abs(v[2] - top) < 1e-6)
  // jscad caps a cylinder as a fan around a centre vertex; that one is not on the rim.
  // A regular polygon's vertices average to its centre, so the mean of the distinct face
  // points (rim plus centre) is the centre at any n, odd or even.
  const distinct = [...new Map(onFace.map((v) => [`${v[0].toFixed(5)},${v[1].toFixed(5)}`, v])).values()]
  const cx = distinct.reduce((sum, v) => sum + v[0], 0) / distinct.length
  const cy = distinct.reduce((sum, v) => sum + v[1], 0) / distinct.length
  return distinct.filter((v) => Math.hypot(v[0] - cx, v[1] - cy) > 1e-4).length
}

/**
 * The Ø50 cylinder's current segment count, read from the document's bodies.
 *
 * @param {any} document
 * @param {string} [name]
 */
function cylinderSides(document, name = 'Cylinder 1') {
  const body = document.bodies().find((/** @type {any} */ candidate) => candidate.name === name)
  if (!body) throw new Error(`no body ${name}`)
  return rim(body.geometry)
}

/** @param {Record<string, any>} [options] */
function withCylinder(options = {}) {
  const document = createDocument({ resolution: 'normal', ...options })
  document.append({ id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 50, height: 10 } }, local)
  return document
}

describe('createDocument resolution', () => {
  it('defaults to legacy in core, so every existing caller folds exactly as before', () => {
    expect(createDocument().resolution()).toBe('legacy')
  })

  it('takes a starting resolution, and folds at it', () => {
    const document = withCylinder()
    expect(document.resolution()).toBe('normal')
    expect(cylinderSides(document)).toBe(52)
  })

  it('refuses an unknown preset', () => {
    expect(() => createDocument({ resolution: 'ultra' })).toThrow(/ultra/)
  })
})

describe('setResolution — one undoable step', () => {
  it('re-facets every curved body, and is one Undo, labelled with the change', () => {
    const document = withCylinder()
    document.setResolution('fine', local)
    expect(document.resolution()).toBe('fine')
    expect(cylinderSides(document)).toBe(80)
    expect(document.pendingUndo()?.label).toBe('Resolution → Fine')

    document.undo()
    expect(document.resolution()).toBe('normal')
    expect(cylinderSides(document)).toBe(52)
    expect(document.pendingRedo()?.label).toBe('Resolution → Fine')

    document.redo()
    expect(document.resolution()).toBe('fine')
    expect(cylinderSides(document)).toBe(80)
  })

  it('bumps the version so watchers re-read the document', () => {
    const document = withCylinder()
    const before = document.version
    document.setResolution('print', local)
    expect(document.version).toBeGreaterThan(before)
  })

  it('choosing the value already set is a no-op, with no undo step', () => {
    const document = withCylinder()
    document.clearHistory()
    document.setResolution('normal', local)
    expect(document.canUndo()).toBe(false)
  })

  it('refuses an unknown preset and leaves the document exactly as it was', () => {
    const document = withCylinder()
    const version = document.version
    expect(() => document.setResolution('ultra', local)).toThrow(/ultra/)
    expect(document.resolution()).toBe('normal')
    expect(document.version).toBe(version)
    expect(cylinderSides(document)).toBe(52)
  })

  it('is origin-scoped: a non-local change never lands on the local undo stack', () => {
    const document = createDocument({ resolution: 'normal' })
    document.append({ id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 50, height: 10 } }, { origin: 'mcp' })
    document.setResolution('fine', { origin: 'mcp' })
    expect(document.canUndo()).toBe(false)
    expect(document.resolution()).toBe('fine')
    expect(cylinderSides(document)).toBe(80)
  })

  it('a local undo past a remote resolution change keeps the remote setting', () => {
    const document = withCylinder()
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [5, 5, 5], center: [60, 0, 0] } }, local)
    document.setResolution('print', { origin: 'mcp' })
    document.undo() // the local cube
    expect(document.bodies().map((/** @type {any} */ b) => b.name)).toEqual(['Cylinder 1'])
    expect(document.resolution()).toBe('print')
    expect(cylinderSides(document)).toBe(112)
  })

  it('works while rolled back, keeping the marker', () => {
    const document = withCylinder()
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [5, 5, 5], center: [60, 0, 0] } }, local)
    document.rollBackTo('cyl-1', local)
    document.setResolution('draft', local)
    expect(document.rollbackAt()).toBe(1)
    expect(cylinderSides(document)).toBe(36)
    document.undo()
    expect(document.rollbackAt()).toBe(1)
    expect(cylinderSides(document)).toBe(52)
  })
})

describe('a fold-cache hit after the change never returns the old tessellation (core-031)', () => {
  it('a row action after a resolution change re-folds at the new setting', () => {
    const document = withCylinder()
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [5, 5, 5], center: [60, 0, 0] } }, local)
    document.setResolution('fine', local)
    document.setSuppressed('cube-1', true, local)
    expect(cylinderSides(document)).toBe(80)
    document.setSuppressed('cube-1', false, local)
    expect(cylinderSides(document)).toBe(80)
  })

  it('a prefix document sharing the live cache folds at its own resolution', () => {
    const live = withCylinder()
    live.setResolution('print', local)
    const preview = createDocument({ foldCache: live.foldCache, resolution: live.resolution() })
    preview.loadEntries(live.entries.map((entry) => ({ record: entry.record, origin: entry.origin })), null)
    expect(cylinderSides(preview)).toBe(112)
    // …and one at a different resolution on the same cache gets its own answer, not the live one.
    const other = createDocument({ foldCache: live.foldCache, resolution: 'draft' })
    other.loadEntries(live.entries.map((entry) => ({ record: entry.record, origin: entry.origin })), null)
    expect(cylinderSides(other)).toBe(36)
    expect(cylinderSides(live)).toBe(112)
  })
})

describe('undo-restore snapshots carry the resolution (core-030)', () => {
  /**
   * The same script against a restoring document and an always-fold twin, compared
   * after every action: restore is only allowed to be faster, never different.
   */
  it('matches the always-fold twin step for step, including across resolution changes', () => {
    const restoring = withCylinder()
    const folding = withCylinder({ restorableSteps: 0 })
    /** @type {((document: any) => void)[]} */
    const script = [
      (d) => d.setResolution('fine', local),
      (d) => d.append({ id: 'cyl-2', op: 'primitive.cylinder', name: 'Cylinder 2', params: { diameter: 50, height: 5, center: [80, 0, 0] } }, local),
      (d) => d.setResolution('print', local),
      (d) => d.undo(),
      (d) => d.undo(),
      (d) => d.redo(),
      (d) => d.undo(),
      (d) => d.undo(),
      (d) => d.redo(),
      (d) => d.redo(),
      (d) => d.redo(),
    ]
    for (const [index, action] of script.entries()) {
      action(restoring)
      action(folding)
      expect(restoring.resolution(), `after action ${index}`).toBe(folding.resolution())
      const sides = (/** @type {any} */ d) => d.bodies().map((/** @type {any} */ b) => rim(b.geometry))
      expect(sides(restoring), `after action ${index}`).toEqual(sides(folding))
    }
    expect(restoring.resolution()).toBe('print')
    expect(cylinderSides(restoring, 'Cylinder 2')).toBe(112)
  })

  it('undoing an append made after a resolution change keeps the new resolution', () => {
    const document = withCylinder()
    document.setResolution('fine', local)
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [5, 5, 5], center: [60, 0, 0] } }, local)
    document.undo()
    expect(document.resolution()).toBe('fine')
    expect(cylinderSides(document)).toBe(80)
  })
})

describe('the ui-051 delete paths fold under the resolution', () => {
  it('Remove part re-folds the group at the design resolution', () => {
    const document = createDocument({ resolution: 'print' })
    document.append({ id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 12, fit: 'tap' } }, local)
    document.removePart('bolt-1', 'tap', local)
    const bolt = /** @type {any} */ (document.bodies()[0].geometry)
    expect(Object.keys(bolt.parts)).not.toContain('tap')
    expect(rim(bolt.parts.thread)).toBeGreaterThan(32)
    document.setResolution('legacy', local)
    expect(rim(/** @type {any} */ (document.bodies()[0].geometry).parts.thread)).toBe(32)
  })

  it('a deleted body stays deleted across a resolution change, and Undo brings it back re-faceted', () => {
    const document = withCylinder()
    document.deleteBodies(['cyl-1'], local)
    document.setResolution('fine', local)
    expect(document.bodies()).toEqual([])
    document.undo()
    document.undo()
    expect(document.resolution()).toBe('normal')
    expect(cylinderSides(document)).toBe(52)
  })
})

describe('loadEntries takes the resolution with the log', () => {
  it('sets it, and clears history like every load', () => {
    const source = withCylinder()
    source.setResolution('print', local)
    const target = createDocument({ resolution: 'normal' })
    target.loadEntries(source.entries, null, 'print')
    expect(target.resolution()).toBe('print')
    expect(cylinderSides(target)).toBe(112)
    expect(target.canUndo()).toBe(false)
  })

  it('refuses an unknown preset atomically', () => {
    const target = withCylinder()
    expect(() => target.loadEntries([], null, 'ultra')).toThrow(/ultra/)
    expect(target.resolution()).toBe('normal')
    expect(target.bodies()).toHaveLength(1)
  })
})

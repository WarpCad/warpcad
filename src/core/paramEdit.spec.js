// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import {
  paramEditRecord,
  paramEditability,
  canEditParams,
  currentParamsOf,
  withComponent,
} from './paramEdit.js'

/**
 * A fake registry, per CLAUDE.md's "always mock at the boundary". The op *names*
 * are the real ones rather than `fake.*`, because the read-only guard under test
 * keys on the `transform.` prefix — renaming them would test nothing.
 *
 * @type {any}
 */
const fakeRegistry = Object.freeze({
  'primitive.cylinder': Object.freeze({
    kind: 'native',
    operandCount: 0,
    build: (/** @type {any} */ { params }) => ({ tag: 'cylinder', ...params }),
  }),
  'primitive.cuboid': Object.freeze({
    kind: 'native',
    operandCount: 0,
    build: (/** @type {any} */ { params }) => ({ tag: 'cuboid', ...params }),
  }),
  'transform.translate': Object.freeze({
    kind: 'native',
    operandCount: 1,
    build: (/** @type {any} */ { params, inputs }) => ({ ...inputs[0], moved: params.vector }),
  }),
  'transform.rotate': Object.freeze({
    kind: 'native',
    operandCount: 1,
    build: (/** @type {any} */ { params, inputs }) => ({ ...inputs[0], turned: params.angles }),
  }),
  'modify.filletRim': Object.freeze({
    kind: 'native',
    operandCount: 1,
    build: (/** @type {any} */ { params, inputs }) => ({ ...inputs[0], rounded: params.radius }),
  }),
  'boolean.union': Object.freeze({
    kind: 'native',
    operandCount: '2+',
    build: (/** @type {any} */ { inputs }) => ({ tag: 'union', of: inputs.length }),
  }),
})

/** @param {object} [options] */
function doc(options = {}) {
  return createDocument({ registry: fakeRegistry, ...options })
}

/**
 * A document holding one cylinder, optionally with a history stacked on top.
 *
 * @param {readonly import('./kernel/registry.js').OpRecord[]} [history]
 */
function withCylinder(history = []) {
  const document = doc()
  document.append(
    {
      id: 'cyl-1',
      op: 'primitive.cylinder',
      name: 'Cylinder 1',
      params: { diameter: 40, height: 50, center: [0, 0, 25], segments: 32 },
    },
    { origin: 'local' }
  )
  for (const record of history) document.append(record, { origin: 'local' })
  return document
}

describe('paramEditRecord — the replacement creation record (TODO/data-007)', () => {
  it('keeps the record\'s id, op and name, and overrides only the edited key', () => {
    const document = withCylinder()
    const record = paramEditRecord(document, 'cyl-1', { diameter: 10 })

    // A replacement, not an append: same id, so `document.reviseRecords` swaps it in
    // place and every later record re-folds against it.
    expect(record).not.toBeNull()
    expect(record?.id).toBe('cyl-1')
    expect(record?.op).toBe('primitive.cylinder')
    expect(record?.name).toBe('Cylinder 1')
    expect(record?.supersedes).toBeUndefined()
    // Every other param is carried across untouched — including the ones the
    // Inspector never shows (`center`, `segments`), which are what keep the
    // resized solid the same shape and in the same place in every respect the edit
    // did not name.
    expect(record?.params).toEqual({ diameter: 10, height: 50, center: [0, 0, 25], segments: 32 })
  })

  it('appends nothing when the value is unchanged — translateBy\'s no-op convention', () => {
    const document = withCylinder()
    expect(paramEditRecord(document, 'cyl-1', { diameter: 40 })).toBeNull()
    // ... including a vector compared element-wise rather than by reference.
    document.append(
      { id: 'box-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40] } },
      { origin: 'local' }
    )
    expect(paramEditRecord(document, 'box-1', { size: [40, 40, 40] })).toBeNull()
    expect(paramEditRecord(document, 'box-1', { size: [15, 40, 40] })).not.toBeNull()
  })

  it('does not touch the transforms stacked on top — they stay in the log and replay', () => {
    const document = withCylinder([
      {
        id: 'cyl-1-move-1',
        op: 'transform.translate',
        target: 'cyl-1',
        supersedes: 'cyl-1',
        params: { vector: [10, 0, 0], rotation: [0, 0, 0] },
      },
      {
        id: 'cyl-1-turn-1',
        op: 'transform.rotate',
        target: 'cyl-1',
        supersedes: 'cyl-1-move-1',
        params: { angles: [0, 0, 30], center: [0, 0, 25], rotation: [0, 0, 30] },
      },
    ])
    const record = paramEditRecord(document, 'cyl-1', { height: 20 })
    expect(record?.id).toBe('cyl-1')
    // The replacement describes the *shape* only; the pose is not folded in.
    expect(record?.params?.rotation).toBeUndefined()
    expect(record?.params?.vector).toBeUndefined()
  })

  it('edits one component of a vector param, leaving the others alone', () => {
    const document = doc()
    document.append(
      { id: 'box-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40] } },
      { origin: 'local' }
    )
    const current = currentParamsOf(document, 'box-1').size
    const record = paramEditRecord(document, 'box-1', { size: withComponent(current, 0, 15) })
    expect(record?.params?.size).toEqual([15, 40, 40])
  })

  it('refuses a param the Inspector deliberately never offers as a dimension', () => {
    const document = withCylinder()
    // `center` is the body's *position* (the Transform section owns it), `segments`
    // is a tessellation detail, and `rotation` is the pose carried on a transform
    // record. Writing any of them through this path would fight the pose-restore
    // step in `useParamCommands.js` rather than resize anything.
    for (const key of ['center', 'segments', 'rotation']) {
      expect(() => paramEditRecord(document, 'cyl-1', { [key]: 1 })).toThrow(/reserved/i)
    }
  })

  it('refuses a value that is not a finite number', () => {
    const document = withCylinder()
    expect(() => paramEditRecord(document, 'cyl-1', { diameter: Number.NaN })).toThrow(/finite/i)
    expect(() => paramEditRecord(document, 'cyl-1', { diameter: Infinity })).toThrow(/finite/i)
    expect(() => paramEditRecord(document, 'cyl-1', { size: [1, Number.NaN, 3] })).toThrow(/finite/i)
  })

  it('refuses a body it cannot find', () => {
    expect(() => paramEditRecord(withCylinder(), 'nope', { diameter: 10 })).toThrow(/nope/)
  })
})

describe('paramEditRecord — a string param (TODO/render-002)', () => {
  /** @returns {ReturnType<typeof createDocument>} */
  function withLabel() {
    const document = createDocument({ registry: { ...fakeRegistry, 'text.label': fakeRegistry['primitive.cuboid'] } })
    document.append(
      { id: 'text-1', op: 'text.label', name: 'Text 1', params: { text: 'Label', size: 10, strokeWidth: 1.5, height: 2 } },
      { origin: 'local' }
    )
    return document
  }

  it('accepts a new non-empty `text` and keeps every other param', () => {
    const record = paramEditRecord(withLabel(), 'text-1', { text: 'Hello' })
    expect(record?.params).toEqual({ text: 'Hello', size: 10, strokeWidth: 1.5, height: 2 })
  })

  it('refuses an empty `text`, and a string for a numeric key', () => {
    expect(() => paramEditRecord(withLabel(), 'text-1', { text: '' })).toThrow(/text/)
    expect(() => paramEditRecord(withLabel(), 'text-1', { size: 'big' })).toThrow(/finite number/)
  })
})

describe('paramEditRecord — a sketch body’s structured params (TODO/sketch-001)', () => {
  // Edit sketch → Done is one in-place revision of `slices` and `extrusion` together. They
  // are plain JSON objects, not numbers, so the finite-number check walks them instead.
  const SLICES = [{ id: 's1', zMm: 0, profiles: [{ id: 'p1', kind: 'circle', role: 'solid', centerMm: [0, 0], radiusMm: 20 }] }]
  /** @returns {ReturnType<typeof createDocument>} */
  function withSketch() {
    const document = createDocument({ registry: { ...fakeRegistry, 'primitive.sketch': fakeRegistry['primitive.cuboid'] } })
    document.append(
      {
        id: 'sketch-1',
        op: 'primitive.sketch',
        name: 'Sketch 1',
        params: { center: [0, 0, 0], slices: SLICES, extrusion: { method: 'linear', heightMm: 30, twistDeg: 0, twistSteps: 1 } },
      },
      { origin: 'local' }
    )
    return document
  }

  it('replaces slices and extrusion in one record, keeping centre', () => {
    const extrusion = { method: 'linear', heightMm: 45, twistDeg: 0, twistSteps: 1 }
    const record = paramEditRecord(withSketch(), 'sketch-1', /** @type {any} */ ({ slices: SLICES, extrusion }))
    expect(record?.params).toEqual({ center: [0, 0, 0], slices: SLICES, extrusion })
  })

  it('is a no-op when the structured params are deep-equal', () => {
    const record = paramEditRecord(withSketch(), 'sketch-1', /** @type {any} */ ({
      slices: JSON.parse(JSON.stringify(SLICES)),
      extrusion: { method: 'linear', heightMm: 30, twistDeg: 0, twistSteps: 1 },
    }))
    expect(record).toBeNull()
  })

  it('refuses a NaN buried anywhere in the structure', () => {
    const bad = [{ ...SLICES[0], profiles: [{ ...SLICES[0].profiles[0], radiusMm: Number.NaN }] }]
    expect(() => paramEditRecord(withSketch(), 'sketch-1', /** @type {any} */ ({ slices: bad }))).toThrow(/finite number/)
  })
})

describe('the editability guard — which roots have params of their own (TODO/ui-029, TODO/data-007)', () => {
  it('allows a lineage of nothing but transforms on a plain creation record', () => {
    expect(
      paramEditability([
        { id: 'a', op: 'primitive.cylinder', params: { diameter: 40 } },
        { id: 'b', op: 'transform.translate', supersedes: 'a', params: {} },
        { id: 'c', op: 'transform.rotate', supersedes: 'b', params: {} },
      ])
    ).toEqual({ editable: true, blockedBy: null, path: 'replace' })
  })

  it('allows a lineage carrying a fillet — the replace path re-runs it (TODO/data-007)', () => {
    // `ui-029` froze this: appending a rebuilt creation record would have thrown the
    // rim away. The replace path keeps the fillet record in the log and re-folds it, so
    // nothing is discarded; a rim that no longer fits is reported by the impact check.
    expect(
      paramEditability([
        { id: 'a', op: 'primitive.cuboid', params: { size: [40, 40, 40] } },
        { id: 'b', op: 'transform.translate', supersedes: 'a', params: {} },
        { id: 'c', op: 'modify.filletRim', supersedes: 'b', params: { radius: 5 } },
      ])
    ).toEqual({ editable: true, blockedBy: null, path: 'replace' })
  })

  it('allows a fillet or chamfer with a transform stacked on top of it afterwards', () => {
    expect(
      paramEditability([
        { id: 'a', op: 'primitive.cuboid', params: { size: [40, 40, 40] } },
        { id: 'b', op: 'modify.chamferRim', supersedes: 'a', params: { radius: 5 } },
        { id: 'c', op: 'transform.translate', supersedes: 'b', params: {} },
      ]).editable
    ).toBe(true)
  })

  it('refuses a root that was built from other bodies rather than from its own params', () => {
    // A Union/Group result has no params a rebuild could be derived from: its
    // geometry *is* its operands. Reported as blocked by its own op.
    expect(
      paramEditability([
        { id: 'u', op: 'boolean.union', consumes: ['a', 'b'], params: {} },
        { id: 'v', op: 'transform.translate', supersedes: 'u', params: {} },
      ])
    ).toEqual({ editable: false, blockedBy: 'boolean.union' })
  })

  it('refuses a composite recipe root with no editable-param schema — the fail-safe default (TODO/ui-052)', () => {
    // `ui-030` froze every composite; `ui-052` lifts that only where the registry says
    // which values a param may take (`paramOptions`). A recipe nobody has described stays
    // frozen, reported as blocked by its own op.
    expect(
      paramEditability([
        { id: 'hat-1', op: 'raspberrypi.hat', params: {} },
        { id: 'hat-1-drop-2', op: 'transform.translate', supersedes: 'hat-1', params: {} },
      ])
    ).toEqual({ editable: false, blockedBy: 'raspberrypi.hat' })
  })

  it('a composite WITH a schema is editable on the replace path, whatever sits above it (TODO/ui-052)', () => {
    // The replace path re-folds every later record, so a fillet above a bolt is re-run
    // and reported if it no longer fits — nothing is discarded, so nothing freezes.
    expect(
      paramEditability([
        { id: 'bolt-1', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20 } },
        { id: 'bolt-1-rim', op: 'modify.filletRim', supersedes: 'bolt-1', target: 'bolt-1', params: { radius: 2 } },
      ])
    ).toEqual({ editable: true, blockedBy: null, path: 'replace' })
  })

  it('refuses an empty lineage rather than reporting it editable', () => {
    expect(paramEditability([])).toEqual({ editable: false, blockedBy: null })
  })

  it('allows a lineage carrying a colour override (TODO/data-005) — nothing is lost by rebuilding past it', () => {
    // `style.recolor` never touches geometry, and `document.js`'s `colorOverridesOf`
    // reads it off every record in the walked lineage, so a replaced creation record
    // keeps it.
    expect(
      paramEditability([
        { id: 'a', op: 'primitive.cylinder', params: { diameter: 40 } },
        { id: 'b', op: 'style.recolor', target: 'a', supersedes: 'a', colorOverride: 0xff0000 },
        { id: 'c', op: 'transform.translate', supersedes: 'b', params: {} },
      ])
    ).toEqual({ editable: true, blockedBy: null, path: 'replace' })
  })

  it('reads the same verdict straight off a live document', () => {
    const editable = withCylinder([
      {
        id: 'cyl-1-move-1',
        op: 'transform.translate',
        target: 'cyl-1',
        supersedes: 'cyl-1',
        params: { vector: [10, 0, 0], rotation: [0, 0, 0] },
      },
    ])
    expect(canEditParams(editable, 'cyl-1')).toEqual({ editable: true, blockedBy: null, path: 'replace' })

    const filleted = withCylinder([
      {
        id: 'cyl-1-fillet',
        op: 'modify.filletRim',
        target: 'cyl-1',
        supersedes: 'cyl-1',
        params: { radius: 5, orientation: 'z+' },
      },
    ])
    expect(canEditParams(filleted, 'cyl-1')).toEqual({ editable: true, blockedBy: null, path: 'replace' })
    expect(canEditParams(filleted, 'nope')).toEqual({ editable: false, blockedBy: null })
  })

  it('refuses to build a record for a root the guard has blocked — fail safe', () => {
    const document = doc()
    document.append({ id: 'a', op: 'primitive.cuboid', name: 'A', params: { size: [1, 1, 1] } }, { origin: 'local' })
    document.append({ id: 'b', op: 'primitive.cuboid', name: 'B', params: { size: [1, 1, 1] } }, { origin: 'local' })
    document.append(
      { id: 'u', op: 'boolean.union', target: 'a', operands: ['b'], consumes: ['a', 'b'], params: {} },
      { origin: 'local' }
    )
    expect(() => paramEditRecord(document, 'u', { size: [2, 2, 2] })).toThrow(/boolean\.union/)
  })
})

describe('withComponent', () => {
  it('replaces one index and copies the rest', () => {
    expect(withComponent([1, 2, 3], 1, 9)).toEqual([1, 9, 3])
    expect(withComponent([1, 2, 3], 0, 9)).not.toBe(undefined)
  })

  it('refuses an index that is not in the vector', () => {
    expect(() => withComponent([1, 2, 3], 5, 9)).toThrow()
  })
})

describe('chained edits — the second one builds on the first (TODO/ui-029, TODO/data-007)', () => {
  it('a second edit spreads from the first\'s params, because the first replaced the record', () => {
    const document = withCylinder()
    const first = paramEditRecord(document, 'cyl-1', { diameter: 10 })
    document.replaceRecord('cyl-1', /** @type {any} */ (first), { origin: 'local' })

    expect(currentParamsOf(document, 'cyl-1')).toEqual({
      diameter: 10,
      height: 50,
      center: [0, 0, 25],
      segments: 32,
    })

    const second = paramEditRecord(document, 'cyl-1', { height: 20 })
    // Still 10, not back to 40.
    expect(second?.params).toEqual({ diameter: 10, height: 20, center: [0, 0, 25], segments: 32 })
    // A no-op is judged against the current value too, not the original one.
    expect(paramEditRecord(document, 'cyl-1', { diameter: 10 })).toBeNull()
    expect(paramEditRecord(document, 'cyl-1', { diameter: 40 })).not.toBeNull()
  })

  it('replaces the newest same-op record of a document written before data-007', () => {
    // Older documents hold an *appended* rebuild (`supersedes` the terminal). The panel
    // shows that record's numbers, so the next edit has to replace it, not the root.
    const document = withCylinder()
    document.append(
      {
        id: 'cyl-1-param-1',
        op: 'primitive.cylinder',
        supersedes: 'cyl-1',
        params: { diameter: 10, height: 50, center: [0, 0, 25], segments: 32 },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'cyl-1-move-1',
        op: 'transform.translate',
        target: 'cyl-1',
        supersedes: 'cyl-1-param-1',
        params: { vector: [10, 0, 0], rotation: [0, 0, 0] },
      },
      { origin: 'local' }
    )

    expect(currentParamsOf(document, 'cyl-1').diameter).toBe(10)
    expect(currentParamsOf(document, 'cyl-1').vector).toBeUndefined()
    const third = paramEditRecord(document, 'cyl-1', { height: 20 })
    expect(third?.id).toBe('cyl-1-param-1')
    expect(third?.supersedes).toBe('cyl-1')
    expect(third?.params?.diameter).toBe(10)
    expect(canEditParams(document, 'cyl-1').editable).toBe(true)
  })
})

describe('compositeParamEditRecord — the replace-path edit of a composite (TODO/ui-052)', () => {
  const LOCAL = { origin: 'local' }

  /** @param {Record<string, any>} params */
  async function boltDocument(params = { spec: 'm10 hex', length: 20, fit: 'loose' }) {
    const { createDocument } = await import('./document.js')
    const document = createDocument()
    document.append({ id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params }, LOCAL)
    document.append(
      { id: 'bolt-1-move', op: 'transform.translate', target: 'bolt-1', supersedes: 'bolt-1', params: { vector: [5, 0, 0], rotation: [0, 0, 0] } },
      LOCAL,
    )
    return document
  }

  it('builds the creation record with new params, same id — a replacement, not an append', async () => {
    const { compositeParamEditRecord } = await import('./paramEdit.js')
    const document = await boltDocument()
    const record = compositeParamEditRecord(document, 'bolt-1', { spec: '1/4 socket', length: 12 })
    expect(record).toEqual({
      id: 'bolt-1',
      op: 'hardware.bolt',
      name: 'Bolt 1',
      params: { spec: '1/4 socket', length: 12, fit: 'loose' },
    })
  })

  it('rejects an enum value outside the schema by name — the MCP surface cannot write an invalid model', async () => {
    const { compositeParamEditRecord } = await import('./paramEdit.js')
    const document = await boltDocument()
    expect(() => compositeParamEditRecord(document, 'bolt-1', { spec: 'm2.5 hex' })).toThrow(/m2\.5 hex/)
    expect(() => compositeParamEditRecord(document, 'bolt-1', { spec: 'm2.5 hex' })).toThrow(/m10 hex/)
    expect(() => compositeParamEditRecord(document, 'bolt-1', { fit: 'snug' })).toThrow(/fit.*snug/)
  })

  it('rejects a number that is not a positive size, and a key the schema does not name', async () => {
    const { compositeParamEditRecord } = await import('./paramEdit.js')
    const document = await boltDocument()
    expect(() => compositeParamEditRecord(document, 'bolt-1', { length: 0 })).toThrow(/length/)
    expect(() => compositeParamEditRecord(document, 'bolt-1', { length: Number.NaN })).toThrow(/length/)
    expect(() => compositeParamEditRecord(document, 'bolt-1', { head: 3 })).toThrow(/head/)
  })

  it('still refuses center and rotation on a composite', async () => {
    const { compositeParamEditRecord } = await import('./paramEdit.js')
    const document = await boltDocument()
    expect(() => compositeParamEditRecord(document, 'bolt-1', { center: [0, 0, 0] })).toThrow(/center/)
    expect(() => compositeParamEditRecord(document, 'bolt-1', { rotation: [0, 0, 90] })).toThrow(/rotation/)
  })

  it('returns null for an edit that changes nothing', async () => {
    const { compositeParamEditRecord } = await import('./paramEdit.js')
    const document = await boltDocument()
    expect(compositeParamEditRecord(document, 'bolt-1', { spec: 'm10 hex' })).toBeNull()
  })

  it('refuses a composite with no schema, and a primitive (which has its own builder, paramEditRecord)', async () => {
    const { compositeParamEditRecord } = await import('./paramEdit.js')
    const { createDocument } = await import('./document.js')
    const document = createDocument()
    document.append({ id: 'hat-1', op: 'raspberrypi.hat', name: 'HAT 1', params: {} }, LOCAL)
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [4, 4, 4] } }, LOCAL)
    expect(() => compositeParamEditRecord(document, 'hat-1', { anything: 1 })).toThrow(/raspberrypi\.hat/)
    expect(() => compositeParamEditRecord(document, 'cube-1', { size: [5, 5, 5] })).toThrow(/primitive\.cuboid/)
  })

  it('a primitive\'s resize is on the replace path too (TODO/data-007)', async () => {
    const { canEditParams } = await import('./paramEdit.js')
    const { createDocument } = await import('./document.js')
    const document = createDocument()
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [4, 4, 4] } }, LOCAL)
    expect(canEditParams(document, 'cube-1')).toEqual({ editable: true, blockedBy: null, path: 'replace' })
  })
})

describe('project variables and the step editor (TODO/core-050)', () => {
  const LOCAL = { origin: 'local' }
  it('a variable definition is not a step the param editor rewrites — setVariable is', async () => {
    const { stepParamEditability } = await import('./paramEdit.js')
    expect(stepParamEditability({ id: 'v', op: 'var.define', params: { name: 'wall', kind: 'number', value: 2 } }).editable).toBe(false)
  })

  it('editing one param of a composite leaves a bound sibling alone instead of refusing it', async () => {
    const { compositeParamEditRecord } = await import('./paramEdit.js')
    const { createDocument } = await import('./document.js')
    const { defineVariable } = await import('./variables.js')
    const document = createDocument()
    defineVariable(document, { name: 'piModel', kind: 'enum', value: 4, options: [{ value: 4, label: 'Pi 4' }, { value: 5, label: 'Pi 5' }] }, LOCAL)
    document.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: { $var: 'piModel' } } }, LOCAL)
    const record = compositeParamEditRecord(document, 'pi-1', { clearance: 7 })
    expect(record?.params).toEqual({ model: { $var: 'piModel' }, clearance: 7 })
  })
})

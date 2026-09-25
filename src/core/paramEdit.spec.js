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

describe('paramEditRecord — rebuilding a creation record with new params (TODO/ui-029)', () => {
  it('copies the root\'s op, overrides only the edited key, and supersedes the terminal', () => {
    const document = withCylinder()
    const record = paramEditRecord(document, 'cyl-1', { diameter: 10 })

    expect(record).not.toBeNull()
    expect(record?.op).toBe('primitive.cylinder')
    expect(record?.supersedes).toBe('cyl-1')
    expect(record?.id).toBeDefined()
    expect(record?.id).not.toBe('cyl-1')
    // Every other param is carried across untouched — including the ones the
    // Inspector never shows (`center`, `segments`), which are what keep the
    // rebuilt solid the same shape in every respect the edit did not name.
    expect(record?.params).toEqual({ diameter: 10, height: 50, center: [0, 0, 25], segments: 32 })
  })

  it('carries no `name`, following the established supersedes-record precedent', () => {
    // `src/core/transform.js`'s "Why transform records are unnamed" section, and
    // `ui-027`'s own retirement note: `Body.name` is read from a lineage's *root*
    // record, so a name here is inert at best and a `combine()` duplicate at worst.
    const record = paramEditRecord(withCylinder(), 'cyl-1', { diameter: 10 })
    expect(record?.name).toBeUndefined()
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

  it('supersedes the newest transform, not the root, on a body that has been moved', () => {
    const document = withCylinder([
      {
        id: 'cyl-1-move-1',
        op: 'transform.translate',
        target: 'cyl-1',
        supersedes: 'cyl-1',
        params: { vector: [10, 0, 0], rotation: [0, 0, 0] },
      },
    ])
    expect(paramEditRecord(document, 'cyl-1', { height: 20 })?.supersedes).toBe('cyl-1-move-1')
  })

  it('supersedes the newest transform on a rotate-only history too', () => {
    const document = withCylinder([
      {
        id: 'cyl-1-turn-1',
        op: 'transform.rotate',
        target: 'cyl-1',
        supersedes: 'cyl-1',
        params: { angles: [0, 0, 30], center: [0, 0, 25], rotation: [0, 0, 30] },
      },
    ])
    const record = paramEditRecord(document, 'cyl-1', { height: 20 })
    expect(record?.supersedes).toBe('cyl-1-turn-1')
    // The rebuilt record describes the *shape* only. Re-applying the pose is the
    // caller's second and third append (`useParamCommands.js`), deliberately not
    // folded in here — those are `transform.js`'s already-proven builders.
    expect(record?.params?.rotation).toBeUndefined()
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

describe('the read-only guard — never silently discard a downstream op (TODO/ui-029)', () => {
  it('allows a lineage of nothing but transforms on a plain creation record', () => {
    expect(
      paramEditability([
        { id: 'a', op: 'primitive.cylinder', params: { diameter: 40 } },
        { id: 'b', op: 'transform.translate', supersedes: 'a', params: {} },
        { id: 'c', op: 'transform.rotate', supersedes: 'b', params: {} },
      ])
    ).toEqual({ editable: true, blockedBy: null })
  })

  it('refuses a lineage carrying a fillet — rebuilding would throw the rim away', () => {
    // The whole reason this task is `model: opus`: getting this backwards is
    // silent data loss, not a visible error. Hand-built entries, per the
    // Testing section, so nothing about the real kernel can mask it.
    expect(
      paramEditability([
        { id: 'a', op: 'primitive.cuboid', params: { size: [40, 40, 40] } },
        { id: 'b', op: 'transform.translate', supersedes: 'a', params: {} },
        { id: 'c', op: 'modify.filletRim', supersedes: 'b', params: { radius: 5 } },
      ])
    ).toEqual({ editable: false, blockedBy: 'modify.filletRim' })
  })

  it('refuses a fillet even when a transform is stacked on top of it afterwards', () => {
    expect(
      paramEditability([
        { id: 'a', op: 'primitive.cuboid', params: { size: [40, 40, 40] } },
        { id: 'b', op: 'modify.chamferRim', supersedes: 'a', params: { radius: 5 } },
        { id: 'c', op: 'transform.translate', supersedes: 'b', params: {} },
      ]).editable
    ).toBe(false)
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

  it('refuses a composite recipe root — its params are a catalogue choice, not dimensions (TODO/ui-030)', () => {
    // A bolt's `spec` is an enum keyed into a size table and its `fit` is a
    // clearance class; neither is a millimetre a numeric field can parse, and a
    // rebuild from a half-typed spec string throws inside the recipe. So the
    // whole section stays read-only until the dropdown `ui-029` scoped out
    // exists — reported as blocked by the recipe's own op, which is the honest
    // answer to "why can't I type here".
    expect(
      paramEditability([
        { id: 'bolt-1', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20 } },
        { id: 'bolt-1-drop-2', op: 'transform.translate', supersedes: 'bolt-1', params: {} },
      ])
    ).toEqual({ editable: false, blockedBy: 'hardware.bolt' })
  })

  it('refuses an empty lineage rather than reporting it editable', () => {
    expect(paramEditability([])).toEqual({ editable: false, blockedBy: null })
  })

  it('allows a lineage carrying a colour override (TODO/data-005) — nothing is lost by rebuilding past it', () => {
    // Unlike `modify.filletRim` above, `style.recolor` never touches geometry —
    // `document.js`'s `colorOverridesOf` reads it off every record in the walked
    // lineage, not just the terminal's own build — so a rebuilt creation record
    // does not discard it the way a fillet's rounded rim would be discarded.
    expect(
      paramEditability([
        { id: 'a', op: 'primitive.cylinder', params: { diameter: 40 } },
        { id: 'b', op: 'style.recolor', target: 'a', supersedes: 'a', colorOverride: 0xff0000 },
        { id: 'c', op: 'transform.translate', supersedes: 'b', params: {} },
      ])
    ).toEqual({ editable: true, blockedBy: null })
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
    expect(canEditParams(editable, 'cyl-1')).toEqual({ editable: true, blockedBy: null })

    const filleted = withCylinder([
      {
        id: 'cyl-1-fillet',
        op: 'modify.filletRim',
        target: 'cyl-1',
        supersedes: 'cyl-1',
        params: { radius: 5, orientation: 'z+' },
      },
    ])
    expect(canEditParams(filleted, 'cyl-1')).toEqual({
      editable: false,
      blockedBy: 'modify.filletRim',
    })
    expect(canEditParams(filleted, 'nope')).toEqual({ editable: false, blockedBy: null })
  })

  it('refuses to build a record for a lineage the guard has blocked — fail safe, not fail loud-after-the-fact', () => {
    const filleted = withCylinder([
      {
        id: 'cyl-1-fillet',
        op: 'modify.filletRim',
        target: 'cyl-1',
        supersedes: 'cyl-1',
        params: { radius: 5, orientation: 'z+' },
      },
    ])
    expect(() => paramEditRecord(filleted, 'cyl-1', { diameter: 10 })).toThrow(/modify\.filletRim/)
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

describe('chained edits — the second one builds on the first (TODO/ui-029)', () => {
  it('spreads from the body\'s current params, never back from the stale root', () => {
    // The defect this pins was found by this task's own e2e run, not designed
    // for up front: spreading from the *root* meant a second edit silently
    // resurrected every value the first edit had changed.
    const document = withCylinder()
    const first = paramEditRecord(document, 'cyl-1', { diameter: 10 })
    document.append(/** @type {any} */ (first), { origin: 'local' })

    expect(currentParamsOf(document, 'cyl-1')).toEqual({
      diameter: 10,
      height: 50,
      center: [0, 0, 25],
      segments: 32,
    })

    const second = paramEditRecord(document, 'cyl-1', { height: 20 })
    expect(second?.params).toEqual({
      // Still 10, not back to the root's 40.
      diameter: 10,
      height: 20,
      center: [0, 0, 25],
      segments: 32,
    })
    expect(second?.supersedes).toBe(first?.id)
    // A no-op is judged against the current value too, not the original one.
    expect(paramEditRecord(document, 'cyl-1', { diameter: 10 })).toBeNull()
    expect(paramEditRecord(document, 'cyl-1', { diameter: 40 })).not.toBeNull()
  })

  it('reads through a transform stacked on top of an earlier edit', () => {
    const document = withCylinder()
    const first = paramEditRecord(document, 'cyl-1', { diameter: 10 })
    document.append(/** @type {any} */ (first), { origin: 'local' })
    document.append(
      {
        id: 'cyl-1-move-1',
        op: 'transform.translate',
        target: /** @type {string} */ (first?.id),
        supersedes: /** @type {string} */ (first?.id),
        params: { vector: [10, 0, 0], rotation: [0, 0, 0] },
      },
      { origin: 'local' }
    )

    // The newest *creation* record's params, skipping the translate's `vector`.
    expect(currentParamsOf(document, 'cyl-1').diameter).toBe(10)
    expect(currentParamsOf(document, 'cyl-1').vector).toBeUndefined()
    const third = paramEditRecord(document, 'cyl-1', { height: 20 })
    expect(third?.params?.diameter).toBe(10)
    expect(third?.supersedes).toBe('cyl-1-move-1')
  })

  it('a rebuilt lineage is still editable — a param edit is not one-shot', () => {
    const document = withCylinder()
    document.append(
      /** @type {any} */ (paramEditRecord(document, 'cyl-1', { diameter: 10 })),
      { origin: 'local' }
    )
    expect(canEditParams(document, 'cyl-1')).toEqual({ editable: true, blockedBy: null })
  })
})

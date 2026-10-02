// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { applyAction, emptyScene, replay } from './replay.js'
import { combine } from './kernel/group.js'
import { registry as kernelRegistry } from './kernel/registry.js'
import { parseNdjson, serializeNdjson } from './ndjson.js'

const { measurements } = modeling

/**
 * A fake registry, deliberately with no `@jscad/modeling` dependency, per
 * CLAUDE.md's "always mock at the boundary" convention — this module never
 * needs a real kernel to be correct, only the fold/error-handling logic
 * around whatever registry it's handed. Its `build`/`recipe` functions return
 * plain marker objects, not real `Geom3` values, on purpose — hence `any`
 * rather than the production `RegistryEntry` type.
 *
 * @type {any}
 */
const fakeRegistry = Object.freeze({
  'test.create': {
    kind: 'native',
    operandCount: 0,
    build: (/** @type {any} */ { params }) => {
      if (params.size !== undefined && params.size <= 0) {
        throw new Error(`test.create: size must be positive, got ${params.size}`)
      }
      return { kind: 'solid', size: params.size ?? 1 }
    },
  },
  'test.combine': {
    kind: 'native',
    operandCount: '2+',
    build: (/** @type {any} */ { inputs }) => ({ kind: 'combined', of: inputs }),
  },
  'test.move': {
    kind: 'native',
    operandCount: 1,
    build: (/** @type {any} */ { params, inputs }) => ({
      kind: 'moved',
      vector: params.vector,
      of: inputs[0],
    }),
  },
  'test.recipe': {
    kind: 'composite',
    operandCount: 0,
    recipe: (/** @type {any} */ params) => [
      { id: `${params.baseId}.a`, op: 'test.create', params: { size: 1 } },
      { id: `${params.baseId}.b`, op: 'test.create', params: { size: 2 } },
      {
        id: params.baseId,
        op: 'test.combine',
        operands: [`${params.baseId}.a`, `${params.baseId}.b`],
        name: params.baseId,
      },
    ],
  },
})

describe('emptyScene', () => {
  it('starts with nothing and no errors', () => {
    const scene = emptyScene()
    expect(scene.byId.size).toBe(0)
    expect(scene.errors).toEqual([])
  })
})

describe('applyAction — native ops', () => {
  it('binds a created value to its id', () => {
    const scene = applyAction(emptyScene(), { id: 'a', op: 'test.create', params: {} }, fakeRegistry)
    expect(scene.byId.get('a')).toEqual({ kind: 'solid', size: 1 })
    expect(scene.errors).toEqual([])
  })

  it('resolves target/operands against ids from earlier actions in the same fold', () => {
    let scene = emptyScene()
    scene = applyAction(scene, { id: 'a', op: 'test.create', params: { size: 5 } }, fakeRegistry)
    scene = applyAction(scene, { id: 'b', op: 'test.move', params: { vector: [1, 2, 3] }, target: 'a' }, fakeRegistry)
    expect(scene.byId.get('b')).toEqual({ kind: 'moved', vector: [1, 2, 3], of: { kind: 'solid', size: 5 } })
  })

  it('adds a named action to the resulting group', () => {
    const scene = applyAction(
      emptyScene(),
      { id: 'a', op: 'test.create', params: {}, name: 'thing' },
      fakeRegistry
    )
    expect(scene.group.names).toContain('thing')
    expect(scene.group.parts.thing).toEqual({ kind: 'solid', size: 1 })
  })

  it('does not mutate the scene it was given — returns a new one', () => {
    const before = emptyScene()
    const after = applyAction(before, { id: 'a', op: 'test.create', params: {} }, fakeRegistry)
    expect(before.byId.size).toBe(0)
    expect(after.byId.size).toBe(1)
    expect(after).not.toBe(before)
  })
})

describe('applyAction — composite ops', () => {
  it('expands through the same fold, without needing its own build function', () => {
    const scene = applyAction(
      emptyScene(),
      { id: 'x', op: 'test.recipe', params: { baseId: 'x' }, name: 'x' },
      fakeRegistry
    )
    // A composite op's bound value is its own expansion's resulting Group (same
    // contract as core-001's evaluate) — the recipe's last record names its
    // combined result 'x', so it lands at that part rather than being the value
    // bound to the composite's own id directly.
    const bound = /** @type {import('./kernel/group.js').Group} */ (scene.byId.get('x'))
    expect(bound.parts.x).toEqual({
      kind: 'combined',
      of: [{ kind: 'solid', size: 1 }, { kind: 'solid', size: 2 }],
    })
  })
})

describe('applyAction — resilience (never throws, never halts the fold)', () => {
  it('reports an unknown op and leaves the scene otherwise unchanged', () => {
    const before = emptyScene()
    const after = applyAction(before, { id: 'a', op: 'bogus.nonexistent', params: {} }, fakeRegistry)
    expect(after.byId.size).toBe(0)
    expect(after.errors).toHaveLength(1)
    expect(after.errors[0].id).toBe('a')
    expect(after.errors[0].message).toMatch(/bogus\.nonexistent/)
  })

  it('never executes a malicious op string — it is an inert, unrecognized key', () => {
    const action = { id: 'a', op: 'constructor.constructor("return 1")()', params: {} }
    const after = applyAction(emptyScene(), action, fakeRegistry)
    expect(after.errors).toHaveLength(1)
    expect(after.byId.size).toBe(0)
  })

  it('reports a reference to a nonexistent target id and skips the record', () => {
    const after = applyAction(
      emptyScene(),
      { id: 'b', op: 'test.move', params: { vector: [0, 0, 0] }, target: 'missing' },
      fakeRegistry
    )
    expect(after.byId.size).toBe(0)
    expect(after.errors).toHaveLength(1)
    expect(after.errors[0].message).toMatch(/missing/)
  })

  it('reports a nonexistent operand id among several without halting later records', () => {
    let scene = emptyScene()
    scene = applyAction(scene, { id: 'a', op: 'test.create', params: {} }, fakeRegistry)
    scene = applyAction(
      scene,
      { id: 'bad', op: 'test.combine', operands: ['a', 'missing'] },
      fakeRegistry
    )
    scene = applyAction(scene, { id: 'c', op: 'test.create', params: { size: 9 } }, fakeRegistry)
    expect(scene.byId.has('bad')).toBe(false)
    expect(scene.byId.get('c')).toEqual({ kind: 'solid', size: 9 })
    expect(scene.errors).toHaveLength(1)
  })

  it('replays a zero-size record without crashing — reported, not thrown', () => {
    const after = applyAction(
      emptyScene(),
      { id: 'a', op: 'test.create', params: { size: 0 } },
      fakeRegistry
    )
    expect(after.byId.has('a')).toBe(false)
    expect(after.errors).toHaveLength(1)
    expect(after.errors[0].message).toMatch(/positive/)
  })
})

describe('replay — the top-level fold over a whole document', () => {
  it('folds every action in order, resolving cross-references as it goes', () => {
    const actions = [
      { id: 'a', op: 'test.create', params: { size: 3 }, name: 'a' },
      { id: 'b', op: 'test.create', params: { size: 4 }, name: 'b' },
      { id: 'c', op: 'test.combine', operands: ['a', 'b'], name: 'result' },
    ]
    const scene = replay(actions, fakeRegistry)
    expect(scene.group.names).toEqual(['a', 'b', 'result'])
    expect(scene.errors).toEqual([])
  })

  it('one bad record in the middle does not prevent later valid ones from replaying', () => {
    const actions = [
      { id: 'a', op: 'test.create', params: {}, name: 'a' },
      { id: 'bad', op: 'nonexistent.op', params: {} },
      { id: 'b', op: 'test.create', params: {}, name: 'b' },
    ]
    const scene = replay(actions, fakeRegistry)
    expect(scene.group.names).toEqual(['a', 'b'])
    expect(scene.errors).toHaveLength(1)
  })
})

describe('wired against the real core-001 kernel registry', () => {
  it('replays a real document — primitives, a composite hardware op, and a boolean', () => {
    // Only the final result of a chain carries a `name` — an intermediate record
    // (the un-cut cuboid here) stays unnamed, referenced by `id` only, matching
    // core-001's own "coerces a composite result... " test convention. Naming
    // both would double-add 'case' to the group's names, which is a document
    // authoring mistake this test isn't about.
    const document = [
      { id: 'a7f3', op: 'primitive.cuboid', params: { size: [40, 20, 10] } },
      { id: 'b112', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20 } },
      { id: 'e558', op: 'boolean.subtract', target: 'a7f3', operands: ['b112'], name: 'case' },
    ]
    const scene = replay(document, kernelRegistry)
    expect(scene.errors).toEqual([])
    expect(scene.group.names).toEqual(['case'])
    // the bolt's tap-clearance carved a hole — the result is not just the plain cuboid
    const bounds = measurements.measureBoundingBox(scene.group.parts.case)
    expect(bounds[1][2]).toBeCloseTo(5, 9)
  })

  it('a composite applied one record at a time keeps only its own parts (TODO/core-020)', () => {
    // The incremental path — one `applyAction` per record, the scene so far
    // threaded in — is what the command layer uses on every append. A composite
    // folded that way used to assemble its expansion into the accumulated scene
    // group, so the bolt ended up owning every body placed before it and spanning
    // the whole scene. Pinned here, at the replay boundary, as well as at the
    // command layer, because both callers depend on it.
    let scene = emptyScene()
    scene = applyAction(
      scene,
      { id: 'shell', op: 'primitive.cuboid', name: 'Shell 1', params: { size: [40, 40, 6], center: [0, 0, 3] } },
      kernelRegistry
    )
    scene = applyAction(
      scene,
      { id: 'lug', op: 'primitive.cuboid', name: 'Lug 1', params: { size: [8, 8, 8], center: [30, 0, 4] } },
      kernelRegistry
    )
    scene = applyAction(
      scene,
      { id: 'bolt1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 20, fit: 'close' } },
      kernelRegistry
    )
    expect(scene.errors).toEqual([])

    const bolt = /** @type {import('./kernel/group.js').Group} */ (scene.byId.get('bolt1'))
    // `tap` is hidden by default as of TODO/render-004 (2026-09-26); it's still in
    // `parts` (checked below alongside `tap-*`), just not in visible `names`.
    expect(bolt.names).toEqual(['head', 'thread'])
    // `parts` legitimately also holds the recipe's hidden `tap`/`tap-*` sub-parts,
    // so what is asserted is that nothing from the surrounding scene got in.
    expect(Object.keys(bolt.parts)).not.toContain('Shell 1')
    expect(Object.keys(bolt.parts)).not.toContain('Lug 1')
    // the scene group still holds all three bodies, each under its own name
    expect(scene.group.names).toEqual(['Shell 1', 'Lug 1', 'Bolt 1'])

    // and the bolt measures like a bolt: an m10 head is well under 40 mm across,
    // so a bolt that had swallowed the shell would fail this outright
    const [min, max] = measurements.measureBoundingBox(combine(bolt))
    expect(min[0]).toBeGreaterThan(-15)
    expect(max[0]).toBeLessThan(15)
    // Default combine() is head+thread only now (TODO/render-004): 26.5, not the
    // old tap-inclusive 27 — see `hardware.bolt.spec.js`'s own V1-diff test for
    // the derivation (headHeightMm 6.5 + length 20, independent of `fit`).
    expect(max[2]).toBeCloseTo(26.5, 6)
  })

  it('a document round-tripped through NDJSON still replays cleanly against the real kernel', () => {
    const original = [
      { id: 'x', op: 'primitive.cuboid', params: { size: [2, 2, 2] }, name: 'x' },
    ]
    const { records } = parseNdjson(serializeNdjson(original))
    // ndjson.js is deliberately generic — it has no notion of OpRecord. A real
    // caller (src/storage/, eventually) validates parsed JSON into OpRecord
    // shape before handing it to replay(); this test asserts that boundary
    // rather than re-implements it.
    const scene = replay(/** @type {import('./kernel/registry.js').OpRecord[]} */ (records), kernelRegistry)
    expect(scene.errors).toEqual([])
    expect(scene.group.names).toEqual(['x'])
  })

  it('remote-load safety (Initial design.md §9 scenario 8): a bogus op never executes, and the rest of the document still loads', () => {
    const maliciousText =
      '{"id":"a","op":"primitive.cuboid","params":{"size":[2,2,2]},"name":"a"}\n' +
      '{"id":"b","op":"constructor.constructor(\\"return 1\\")()","params":{}}\n' +
      '{"id":"c","op":"primitive.cuboid","params":{"size":[3,3,3]},"name":"c"}\n'
    const { records, errors: parseErrors } = parseNdjson(maliciousText)
    expect(parseErrors).toEqual([])
    const scene = replay(/** @type {import('./kernel/registry.js').OpRecord[]} */ (records), kernelRegistry)
    expect(scene.group.names).toEqual(['a', 'c'])
    expect(scene.errors).toHaveLength(1)
    expect(scene.errors[0].id).toBe('b')
  })
})

describe('a delete and a part removal survive Save → NDJSON → Open (TODO/ui-051)', () => {
  it('the deleted body stays deleted and the removed part stays removed after reload', async () => {
    const { createDocument } = await import('./document.js')
    const { serializeProject, parseProject } = await import('./project.js')

    const original = createDocument()
    original.append(
      { id: 'c1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } },
      { origin: 'local' }
    )
    original.append(
      { id: 'c2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [20, 20, 20], center: [60, 0, 10] } },
      { origin: 'local' }
    )
    original.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } }, { origin: 'local' })
    original.deleteBodies(['c2'], { origin: 'local' })
    original.removePart('pi', 'usb1', { origin: 'local' })

    const text = serializeProject(original)
    expect(text).toContain('"op":"body.delete"')
    const reopened = createDocument()
    reopened.loadEntries(parseProject(text).entries)

    const bodies = reopened.bodies()
    expect(bodies.map((body) => body.name)).toEqual(['Cube 1', 'Raspberry Pi 1'])
    const pi = /** @type {any} */ (bodies[1].geometry)
    expect(pi.names).not.toContain('usb1')
    expect(Object.keys(pi.parts)).not.toContain('usb1')
    expect(reopened.records).toEqual(original.records)
  })
})

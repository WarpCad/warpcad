// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { ReplayRejection, createDocument } from './document.js'
import { boundsOf } from './kernel/group.js'
import { stepParamEditRecord, stepParamEditability } from './paramEdit.js'

/**
 * `TODO/data-004` — editing, suppressing, reordering and rolling back a step
 * that is **not** the log's terminal, with every later step replayed against it.
 *
 * Kept out of `document.spec.js` (which is already 1100 lines of append/lineage
 * rules) and out of `history.spec.js` (`data-003`'s undo/redo), matching the
 * one-file-per-feature-area precedent `history.spec.js` itself set. The undo of
 * each revision is tested *here*, next to the revision, rather than there.
 *
 * Most of it runs against a fake registry per CLAUDE.md's "always mock at the
 * boundary" — the mechanism under test is log bookkeeping, not geometry. The
 * handful of cases that only mean something against real solids (`core-020`'s
 * repro, the numerical tolerance checks) say so and use the real kernel.
 */

/**
 * `fake.rim` is the point of this fixture: a one-operand op whose validity
 * depends on the *size of the thing it is applied to*, the way
 * `modify.filletRim`'s `assertRadiusFits` really does. That is what makes
 * "editing an earlier step breaks a later one" reproducible without the kernel.
 *
 * @type {any}
 */
const fakeRegistry = Object.freeze({
  'fake.box': Object.freeze({
    kind: 'native',
    operandCount: 0,
    build: (/** @type {any} */ { params }) => ({ tag: 'box', size: params.size ?? 10 }),
  }),
  'fake.move': Object.freeze({
    kind: 'native',
    operandCount: 1,
    build: (/** @type {any} */ { params, inputs }) => ({
      tag: 'moved',
      size: inputs[0].size,
      by: params.by ?? 0,
    }),
  }),
  'fake.rim': Object.freeze({
    kind: 'native',
    operandCount: 1,
    build: (/** @type {any} */ { params, inputs }) => {
      const radius = params.radius ?? 0
      const limit = inputs[0].size / 2
      if (radius > limit) {
        throw new Error(`radius ${radius} does not fit a ${inputs[0].size} box`)
      }
      return { tag: 'rim', size: inputs[0].size, radius }
    },
  }),
  'fake.merge': Object.freeze({
    kind: 'native',
    operandCount: '2+',
    build: (/** @type {any} */ { inputs }) => ({ tag: 'merged', of: inputs.length }),
  }),
})

/** @param {object} [options] */
function doc(options = {}) {
  return createDocument({ registry: fakeRegistry, ...options })
}

/**
 * The scenario-12 shape in miniature: a box, a rim op on it that *fits*, and an
 * independently placed second box afterwards that depends on neither.
 *
 * @returns {ReturnType<typeof createDocument>}
 */
function scenarioTwelve() {
  const document = doc()
  document.append(
    { id: 'cube', op: 'fake.box', name: 'Cube 1', params: { size: 10 } },
    { origin: 'local' }
  )
  document.append(
    {
      id: 'cube-rim',
      op: 'fake.rim',
      target: 'cube',
      supersedes: 'cube',
      params: { radius: 5 },
    },
    { origin: 'local' }
  )
  document.append(
    { id: 'sphere', op: 'fake.box', name: 'Sphere 1', params: { size: 4 } },
    { origin: 'local' }
  )
  return document
}

describe('editing a past step in place (interaction-model-qa §15)', () => {
  it('replays every later step against the new value, leaving unrelated bodies identical', () => {
    const document = scenarioTwelve()
    const before = JSON.stringify(document.bodies().find((body) => body.id === 'sphere'))
    const countBefore = document.bodies().length

    const edited = stepParamEditRecord(document, 'cube-rim', { radius: 3 })
    document.replaceRecord('cube-rim', /** @type {any} */ (edited), { origin: 'local' })

    // (a) the edited body reflects the new value...
    const cube = document.bodies().find((body) => body.id === 'cube')
    expect(/** @type {any} */ (cube?.geometry).radius).toBe(3)
    // (b) ...the later, unrelated body is byte-identical...
    expect(JSON.stringify(document.bodies().find((body) => body.id === 'sphere'))).toBe(before)
    // (c) ...and the body count is unchanged.
    expect(document.bodies()).toHaveLength(countBefore)
  })

  it('edits a step that a later step in the same lineage builds on', () => {
    const document = doc()
    document.append(
      { id: 'cube', op: 'fake.box', name: 'Cube 1', params: { size: 10 } },
      { origin: 'local' }
    )
    document.append(
      { id: 'cube-move', op: 'fake.move', target: 'cube', supersedes: 'cube', params: { by: 7 } },
      { origin: 'local' }
    )

    const edited = stepParamEditRecord(document, 'cube', { size: 20 })
    document.replaceRecord('cube', /** @type {any} */ (edited), { origin: 'local' })

    // The later transform still applied, and it applied to the *new* solid.
    const [body] = document.bodies()
    expect(body.recordId).toBe('cube-move')
    expect(/** @type {any} */ (body.geometry)).toEqual({ tag: 'moved', size: 20, by: 7 })
  })

  it('edits a step that a later boolean consumed', () => {
    const document = doc()
    document.append(
      { id: 'a', op: 'fake.box', name: 'A', params: { size: 10 } },
      { origin: 'local' }
    )
    document.append(
      { id: 'b', op: 'fake.box', name: 'B', params: { size: 4 } },
      { origin: 'local' }
    )
    document.append(
      { id: 'cut', op: 'fake.merge', name: 'Cut 1', operands: ['a', 'b'], consumes: ['a', 'b'] },
      { origin: 'local' }
    )

    const edited = stepParamEditRecord(document, 'a', { size: 25 })
    document.replaceRecord('a', /** @type {any} */ (edited), { origin: 'local' })

    // One body still — the merge re-consumed both operands on the replay rather
    // than leaving the edited one loose on screen.
    expect(document.bodies().map((body) => body.name)).toEqual(['Cut 1'])
    expect(/** @type {any} */ (document.scene.byId.get('a'))).toEqual({ tag: 'box', size: 25 })
  })

  it('edits the last step, which is just the degenerate case of the same path', () => {
    const document = scenarioTwelve()
    const edited = stepParamEditRecord(document, 'sphere', { size: 9 })
    document.replaceRecord('sphere', /** @type {any} */ (edited), { origin: 'local' })
    expect(/** @type {any} */ (document.bodies()[1].geometry).size).toBe(9)
  })

  it('rejects the whole edit, atomically and by name, when a later step can no longer build', () => {
    const document = scenarioTwelve()
    // A rim of 5 fits a 10 box. Shrink the box to 6 and it no longer does.
    const sceneBefore = document.scene
    const versionBefore = document.version
    const recordsBefore = JSON.stringify(document.records)

    const edited = stepParamEditRecord(document, 'cube', { size: 6 })
    let thrown
    try {
      document.replaceRecord('cube', /** @type {any} */ (edited), { origin: 'local' })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ReplayRejection)
    const rejection = /** @type {ReplayRejection} */ (thrown)
    // The contract `ui-032` consumes: which row, by number and by label, and why.
    expect(rejection.step.id).toBe('cube-rim')
    expect(rejection.step.step).toBe(2)
    expect(rejection.step.reason).toMatch(/does not fit/)
    expect(rejection.message).toMatch(/^Step 2 \(/)

    // Atomic, including every derived index — not just `records`.
    expect(JSON.stringify(document.records)).toBe(recordsBefore)
    expect(document.scene).toBe(sceneBefore)
    expect(document.version).toBe(versionBefore)
    expect(document.bodies()).toHaveLength(2)
    expect(document.currentIdOf('cube')).toBe('cube-rim')
  })

  it('refuses a replacement that changes anything other than the step’s own params', () => {
    const document = scenarioTwelve()
    const original = /** @type {any} */ (document.recordOf('cube-rim'))
    expect(() =>
      document.replaceRecord('cube-rim', { ...original, id: 'something-else' }, { origin: 'local' })
    ).toThrow(/id/)
    expect(() =>
      document.replaceRecord('cube-rim', { ...original, op: 'fake.move' }, { origin: 'local' })
    ).toThrow(/op/)
    expect(() =>
      document.replaceRecord('cube-rim', { ...original, supersedes: undefined }, { origin: 'local' })
    ).toThrow(/supersedes/)
  })

  it('undoes and redoes an edit as one step', () => {
    const document = scenarioTwelve()
    const edited = stepParamEditRecord(document, 'cube-rim', { radius: 3 })
    document.replaceRecord('cube-rim', /** @type {any} */ (edited), { origin: 'local' })
    expect(/** @type {any} */ (document.scene.byId.get('cube-rim')).radius).toBe(3)

    expect(document.pendingUndo()?.label).toBe('Edit step 2')
    document.undo()
    expect(/** @type {any} */ (document.scene.byId.get('cube-rim')).radius).toBe(5)
    expect(document.recordOf('cube-rim')?.params?.radius).toBe(5)

    document.redo()
    expect(/** @type {any} */ (document.scene.byId.get('cube-rim')).radius).toBe(3)
    expect(document.recordOf('cube-rim')?.params?.radius).toBe(3)
  })

  it('appends nothing for a no-op edit', () => {
    const document = scenarioTwelve()
    expect(stepParamEditRecord(document, 'cube-rim', { radius: 5 })).toBeNull()
  })

  it('names the step when there is no such record', () => {
    const document = doc()
    expect(() => document.replaceRecord('nope', { id: 'nope', op: 'fake.box' }, { origin: 'local' }))
      .toThrow(/nope/)
  })
})

describe('suppressing a step (interaction-model-qa §16)', () => {
  it('re-evaluates as if the step never happened, and unsuppress restores it exactly', () => {
    const document = scenarioTwelve()
    const before = JSON.stringify(document.bodies())

    document.setSuppressed('cube-rim', true, { origin: 'local' })
    const [cube] = document.bodies()
    expect(/** @type {any} */ (cube.geometry)).toEqual({ tag: 'box', size: 10 })
    expect(cube.recordId).toBe('cube')
    // Non-destructive: the row is still in the log.
    expect(document.records).toHaveLength(3)
    expect(document.timeline()[1].suppressed).toBe(true)

    document.setSuppressed('cube-rim', false, { origin: 'local' })
    expect(JSON.stringify(document.bodies())).toBe(before)
  })

  it('refuses by name, atomically, when a later step needs the suppressed one', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Cube 1' }, { origin: 'local' })
    document.append({ id: 'b', op: 'fake.box', name: 'Cube 2' }, { origin: 'local' })
    document.append(
      { id: 'u', op: 'fake.merge', name: 'Union 1', operands: ['a', 'b'], consumes: ['a', 'b'] },
      { origin: 'local' }
    )
    const sceneBefore = document.scene

    let thrown
    try {
      document.setSuppressed('a', true, { origin: 'local' })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ReplayRejection)
    const rejection = /** @type {ReplayRejection} */ (thrown)
    // Section 16's shape: `Step 3 (Union) needs Cube 1`. The parenthesised label
    // is `labelFor`'s deliberately shallow one (`ui-032` renders the rich one),
    // so the claim here is the step number and the named missing body.
    expect(rejection.message).toMatch(/^Step 3 \(.*\) needs Cube 1$/)
    expect(rejection.step.step).toBe(3)
    expect(rejection.step.reason).toBe('needs Cube 1')
    expect(document.timeline()[0].suppressed).toBe(false)
    expect(document.scene).toBe(sceneBefore)
    expect(document.bodies().map((body) => body.name)).toEqual(['Union 1'])
  })

  it('undoes and redoes a suppress as one step', () => {
    const document = scenarioTwelve()
    document.setSuppressed('cube-rim', true, { origin: 'local' })
    expect(document.pendingUndo()?.label).toMatch(/^Suppress /)

    document.undo()
    expect(document.timeline()[1].suppressed).toBe(false)
    expect(/** @type {any} */ (document.bodies()[0].geometry).tag).toBe('rim')

    document.redo()
    expect(document.timeline()[1].suppressed).toBe(true)
    expect(/** @type {any} */ (document.bodies()[0].geometry).tag).toBe('box')
  })
})

describe('reordering steps (interaction-model-qa §17)', () => {
  it('refuses the first step’s Move up and the last step’s Move down', () => {
    const document = scenarioTwelve()
    expect(document.canMove('cube', -1).allowed).toBe(false)
    expect(document.canMove('sphere', 1).allowed).toBe(false)
    // `sphere` depends on nothing, so it may move either way.
    expect(document.canMove('sphere', -1).allowed).toBe(true)
  })

  it('refuses, statically, a move that would put a step above one it uses', () => {
    const document = scenarioTwelve()
    // `cube-rim` targets `cube`, so `cube` cannot move down past it.
    const verdict = document.canMove('cube', 1)
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBe("Step 2 uses step 1's result")
    // The same swap seen from the other row is the same refusal, with the same
    // reason — the check is about the pair, not about which row was pressed.
    expect(document.canMove('cube-rim', -1)).toEqual(verdict)
  })

  it('swaps two independent steps and replays, leaving the geometry identical', () => {
    const document = scenarioTwelve()
    const before = JSON.stringify(document.bodies().map((body) => body.geometry))

    expect(document.canMove('sphere', -1).allowed).toBe(true)
    document.moveStep('sphere', -1, { origin: 'local' })

    expect(document.timeline().map((row) => row.id)).toEqual(['cube', 'sphere', 'cube-rim'])
    expect(JSON.stringify(document.bodies().map((body) => body.geometry))).toBe(before)
  })

  it('changes nothing when an illegal move is attempted anyway', () => {
    const document = scenarioTwelve()
    const sceneBefore = document.scene
    expect(() => document.moveStep('cube', 1, { origin: 'local' })).toThrow(/uses step/)
    expect(document.timeline().map((row) => row.id)).toEqual(['cube', 'cube-rim', 'sphere'])
    expect(document.scene).toBe(sceneBefore)
  })

  it('undoes and redoes a reorder as one step', () => {
    const document = scenarioTwelve()
    document.moveStep('sphere', -1, { origin: 'local' })
    expect(document.pendingUndo()?.label).toMatch(/^Move step 3 up$/)

    document.undo()
    expect(document.timeline().map((row) => row.id)).toEqual(['cube', 'cube-rim', 'sphere'])
    document.redo()
    expect(document.timeline().map((row) => row.id)).toEqual(['cube', 'sphere', 'cube-rim'])
  })
})

describe('rollback, insert-at-the-marker and the tail shadow check (interaction-model-qa §18)', () => {
  it('stops evaluating past the marker without deleting anything', () => {
    const document = scenarioTwelve()
    document.rollBackTo('cube-rim', { origin: 'local' })

    expect(document.rollbackAt()).toBe(2)
    expect(document.bodies().map((body) => body.name)).toEqual(['Cube 1'])
    expect(document.records).toHaveLength(3)
    const rows = document.timeline()
    expect(rows.map((row) => row.active)).toEqual([true, true, false])
  })

  it('inserts a new step at the marker and advances it, leaving the tail in order', () => {
    const document = scenarioTwelve()
    document.rollBackTo('cube-rim', { origin: 'local' })

    document.append(
      { id: 'cone', op: 'fake.box', name: 'Cone 1', params: { size: 3 } },
      { origin: 'local' }
    )

    expect(document.timeline().map((row) => row.id)).toEqual([
      'cube',
      'cube-rim',
      'cone',
      'sphere',
    ])
    expect(document.rollbackAt()).toBe(3)
    expect(document.timeline().map((row) => row.active)).toEqual([true, true, true, false])
    expect(document.bodies().map((body) => body.name)).toEqual(['Cube 1', 'Cone 1'])
  })

  it('flags an inactive tail row the insert broke, informationally, without failing the insert', () => {
    const document = doc()
    document.append(
      { id: 'cube', op: 'fake.box', name: 'Cube 1', params: { size: 10 } },
      { origin: 'local' }
    )
    document.append(
      { id: 'sphere', op: 'fake.box', name: 'Sphere 1', params: { size: 4 } },
      { origin: 'local' }
    )
    document.append(
      { id: 'cube-rim', op: 'fake.rim', target: 'cube', supersedes: 'cube', params: { radius: 5 } },
      { origin: 'local' }
    )
    // Roll back so the rim row is inactive, then supersede the record it targets.
    document.rollBackTo('sphere', { origin: 'local' })
    document.append(
      { id: 'cube-move', op: 'fake.move', target: 'cube', supersedes: 'cube', params: { by: 2 } },
      { origin: 'local' }
    )

    // The insert itself succeeded — it was the user's intent.
    expect(document.bodies().map((body) => body.name)).toEqual(['Cube 1', 'Sphere 1'])
    const broken = document.brokenSteps()
    expect(broken).toHaveLength(1)
    expect(broken[0].id).toBe('cube-rim')
    expect(document.timeline().find((row) => row.id === 'cube-rim')?.broken).toBeTruthy()
    // The untouched tail row — there isn't one here — but the *active* rows are
    // never flagged, since a failure there is an atomic rejection instead.
    expect(document.timeline().filter((row) => row.active).every((row) => row.broken === null)).toBe(
      true
    )
  })

  it('leaves a tail row the insert did not touch unflagged', () => {
    const document = scenarioTwelve()
    document.rollBackTo('cube-rim', { origin: 'local' })
    document.append(
      { id: 'cone', op: 'fake.box', name: 'Cone 1', params: { size: 3 } },
      { origin: 'local' }
    )
    expect(document.brokenSteps()).toEqual([])
  })

  it('rolls forward by replaying the tail after whatever was inserted', () => {
    const document = scenarioTwelve()
    document.rollBackTo('cube-rim', { origin: 'local' })
    document.append(
      { id: 'cone', op: 'fake.box', name: 'Cone 1', params: { size: 3 } },
      { origin: 'local' }
    )
    document.rollForward({ origin: 'local' })

    expect(document.rollbackAt()).toBeNull()
    expect(document.timeline().every((row) => row.active)).toBe(true)
    expect(document.bodies().map((body) => body.name)).toEqual(['Cube 1', 'Cone 1', 'Sphere 1'])
  })

  it('refuses to roll forward, atomically and by name, when a tail row cannot be built', () => {
    const document = doc()
    document.append(
      { id: 'cube', op: 'fake.box', name: 'Cube 1', params: { size: 10 } },
      { origin: 'local' }
    )
    document.append(
      { id: 'sphere', op: 'fake.box', name: 'Sphere 1', params: { size: 4 } },
      { origin: 'local' }
    )
    document.append(
      { id: 'cube-rim', op: 'fake.rim', target: 'cube', supersedes: 'cube', params: { radius: 5 } },
      { origin: 'local' }
    )
    document.rollBackTo('sphere', { origin: 'local' })
    // Shrink the cube while rolled back, so the inactive rim no longer fits.
    const edited = stepParamEditRecord(document, 'cube', { size: 6 })
    document.replaceRecord('cube', /** @type {any} */ (edited), { origin: 'local' })
    expect(document.brokenSteps().map((step) => step.id)).toEqual(['cube-rim'])

    const sceneBefore = document.scene
    let thrown
    try {
      document.rollForward({ origin: 'local' })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ReplayRejection)
    expect(/** @type {ReplayRejection} */ (thrown).step.id).toBe('cube-rim')
    expect(document.rollbackAt()).toBe(2)
    expect(document.scene).toBe(sceneBefore)
  })

  it('refuses to move a step across the marker', () => {
    const document = scenarioTwelve()
    document.rollBackTo('cube-rim', { origin: 'local' })
    const verdict = document.canMove('cube-rim', 1)
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toMatch(/Roll forward/)
  })

  it('suppresses an inactive row without evaluating it', () => {
    const document = scenarioTwelve()
    document.rollBackTo('cube-rim', { origin: 'local' })
    document.setSuppressed('sphere', true, { origin: 'local' })
    expect(document.timeline()[2].suppressed).toBe(true)
    document.rollForward({ origin: 'local' })
    expect(document.bodies().map((body) => body.name)).toEqual(['Cube 1'])
  })

  it('undoes an insert-at-the-marker, moving the marker back with it', () => {
    const document = scenarioTwelve()
    document.rollBackTo('cube-rim', { origin: 'local' })
    document.append(
      { id: 'cone', op: 'fake.box', name: 'Cone 1', params: { size: 3 } },
      { origin: 'local' }
    )
    expect(document.rollbackAt()).toBe(3)

    document.undo()
    expect(document.rollbackAt()).toBe(2)
    expect(document.timeline().map((row) => row.id)).toEqual(['cube', 'cube-rim', 'sphere'])

    document.redo()
    expect(document.rollbackAt()).toBe(3)
    expect(document.timeline().map((row) => row.id)).toEqual([
      'cube',
      'cube-rim',
      'cone',
      'sphere',
    ])
  })

  it('undoes and redoes a rollback itself', () => {
    const document = scenarioTwelve()
    document.rollBackTo('cube-rim', { origin: 'local' })
    expect(document.pendingUndo()?.label).toMatch(/^Roll back/)

    document.undo()
    expect(document.rollbackAt()).toBeNull()
    expect(document.bodies()).toHaveLength(2)

    document.redo()
    expect(document.rollbackAt()).toBe(2)
    expect(document.bodies()).toHaveLength(1)
  })

  it('refuses to roll back to the last row, which is not a rollback at all', () => {
    const document = scenarioTwelve()
    expect(() => document.rollBackTo('sphere', { origin: 'local' })).toThrow(/last/)
  })
})

describe('the timeline() row contract ui-032 consumes', () => {
  it('reports step number, label, origin, suppressed, active and broken for every row', () => {
    const document = scenarioTwelve()
    document.append(
      { id: 'remote', op: 'fake.box', name: 'Remote 1' },
      { origin: 'mcp' }
    )
    document.rollBackTo('cube-rim', { origin: 'local' })

    const rows = document.timeline()
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({
      step: 1,
      id: 'cube',
      origin: 'local',
      label: 'Place Cube 1',
      suppressed: false,
      active: true,
      broken: null,
    })
    expect(rows[3]).toMatchObject({ step: 4, id: 'remote', origin: 'mcp', active: false })
    expect(rows[1].record).toBe(document.recordOf('cube-rim'))
  })

  it('answers for an unknown id without throwing', () => {
    const document = doc()
    expect(document.recordOf('nope')).toBeUndefined()
    expect(document.timeline()).toEqual([])
    expect(document.brokenSteps()).toEqual([])
    expect(document.rollbackAt()).toBeNull()
    expect(document.canMove('nope', 1).allowed).toBe(false)
  })
})

describe('what may be edited on a past step (paramEdit, revisiting ui-029’s guard)', () => {
  it('allows editing a step whose lineage carries a rim op — the whole point of this task', () => {
    const document = scenarioTwelve()
    // `ui-029`'s append-path guard freezes this lineage, because *appending* a
    // rebuilt creation record would discard the rim. Replacing the row in place
    // does not: the rim record is still there and replays.
    const record = document.recordOf('cube')
    expect(stepParamEditability(/** @type {any} */ (record)).editable).toBe(true)
  })

  it('refuses a boolean/group row, which has no params of its own', () => {
    const record = { id: 'u', op: 'fake.merge', operands: ['a', 'b'], consumes: ['a', 'b'] }
    expect(stepParamEditability(/** @type {any} */ (record))).toEqual({
      editable: false,
      blockedBy: 'fake.merge',
    })
  })

  it('refuses a composite recipe row that has no editable-param schema (TODO/ui-052)', () => {
    const record = { id: 'h', op: 'raspberrypi.hat', params: {} }
    expect(stepParamEditability(/** @type {any} */ (record))).toEqual({
      editable: false,
      blockedBy: 'raspberrypi.hat',
    })
  })

  it('allows a composite row whose params the registry describes, and validates it against the schema (TODO/ui-052)', () => {
    const record = { id: 'b', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20, fit: 'loose' } }
    expect(stepParamEditability(/** @type {any} */ (record))).toEqual({ editable: true, blockedBy: null })
    const document = createDocument()
    document.append(/** @type {any} */ (record), { origin: 'local' })
    expect(() => stepParamEditRecord(document, 'b', { spec: 'm2.5 socket' })).toThrow(/m2\.5 socket/)
    expect(stepParamEditRecord(document, 'b', { spec: '1/4 socket' })?.params?.spec).toBe('1/4 socket')
  })

  it('refuses a rotate row, whose only param is the carried absolute pose', () => {
    const record = { id: 'r', op: 'transform.rotate', target: 'a', params: { rotation: [0, 0, 90] } }
    expect(stepParamEditability(/** @type {any} */ (record)).editable).toBe(false)
  })

  it('allows a translate row, whose vector is a real editable number', () => {
    const record = {
      id: 't',
      op: 'transform.translate',
      target: 'a',
      params: { vector: [5, 0, 0], rotation: [0, 0, 0] },
    }
    expect(stepParamEditability(/** @type {any} */ (record)).editable).toBe(true)
  })

  it('keeps every lineage-shaping field and refuses a reserved param', () => {
    const document = scenarioTwelve()
    const next = stepParamEditRecord(document, 'cube-rim', { radius: 3 })
    expect(next).toMatchObject({
      id: 'cube-rim',
      op: 'fake.rim',
      target: 'cube',
      supersedes: 'cube',
      params: { radius: 3 },
    })
    expect(() => stepParamEditRecord(document, 'cube', { rotation: [0, 0, 90] })).toThrow(
      /rotation/
    )
    expect(() => stepParamEditRecord(document, 'cube', { size: Number.NaN })).toThrow(/finite/)
  })
})

describe('against the real kernel — geometry, tolerances and core-020', () => {
  it('a composite still holds only its own parts after a mid-history edit (TODO/core-020)', () => {
    const document = createDocument()
    document.append(
      {
        id: 'shell',
        op: 'primitive.cuboid',
        name: 'Shell 1',
        params: { size: [40, 40, 6], center: [0, 0, 3] },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'lug',
        op: 'primitive.cuboid',
        name: 'Lug 1',
        params: { size: [8, 8, 8], center: [30, 0, 4] },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'bolt1',
        op: 'hardware.bolt',
        name: 'Bolt 1',
        params: { spec: 'm10 hex', length: 20, fit: 'close' },
      },
      { origin: 'local' }
    )

    // Edit a step BEFORE the composite placement and replay through it.
    const edited = stepParamEditRecord(document, 'shell', { size: [50, 50, 6] })
    document.replaceRecord('shell', /** @type {any} */ (edited), { origin: 'local' })

    const bolt = /** @type {import('./kernel/group.js').Group} */ (document.scene.byId.get('bolt1'))
    // `tap` is hidden by default as of TODO/render-004 (2026-09-26).
    expect(bolt.names).toEqual(['head', 'thread'])
    expect(Object.keys(bolt.parts)).not.toContain('Shell 1')
    expect(Object.keys(bolt.parts)).not.toContain('Lug 1')
    expect(document.bodies().map((body) => body.name)).toEqual(['Shell 1', 'Lug 1', 'Bolt 1'])

    const [min, max] = boundsOf(document.bodies()[0].geometry)
    expect(max[0] - min[0]).toBeCloseTo(50, 6)
    const [bMin, bMax] = boundsOf(document.bodies()[2].geometry)
    expect(bMin[0]).toBeGreaterThan(-15)
    expect(bMax[0]).toBeLessThan(15)
  })

  it('replays a real translate on top of an edited creation record, to tolerance', () => {
    const document = createDocument()
    document.append(
      {
        id: 'cube-1',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [10, 10, 10], center: [0, 0, 5] },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'cube-1-move-1',
        op: 'transform.translate',
        target: 'cube-1',
        supersedes: 'cube-1',
        params: { vector: [25, 0, 0], rotation: [0, 0, 0] },
      },
      { origin: 'local' }
    )

    const edited = stepParamEditRecord(document, 'cube-1', { size: [20, 20, 20] })
    document.replaceRecord('cube-1', /** @type {any} */ (edited), { origin: 'local' })

    const [min, max] = boundsOf(document.bodies()[0].geometry)
    expect(max[0] - min[0]).toBeCloseTo(20, 6)
    // The move still applied, and on top of the *new* solid.
    expect((min[0] + max[0]) / 2).toBeCloseTo(25, 6)
  })

  it('reports the failing row when a real fillet no longer fits after a mid-history edit', () => {
    const document = createDocument()
    document.append(
      {
        id: 'cube-1',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [20, 20, 20], center: [0, 0, 10] },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'cube-1-fillet',
        op: 'modify.filletRim',
        target: 'cube-1',
        supersedes: 'cube-1',
        params: { face: 'top', radius: 4 },
      },
      { origin: 'local' }
    )

    const edited = stepParamEditRecord(document, 'cube-1', { size: [2, 2, 20] })
    expect(() =>
      document.replaceRecord('cube-1', /** @type {any} */ (edited), { origin: 'local' })
    ).toThrow(ReplayRejection)
    // Unchanged: still the 20 mm cube with its 4 mm fillet. Three decimals, not
    // six: a filleted rim is tessellated, so its bounds overshoot the nominal
    // size by ~1.2e-4 mm — a real number, not a replay error.
    const [min, max] = boundsOf(document.bodies()[0].geometry)
    expect(max[0] - min[0]).toBeCloseTo(20, 3)
  })
})

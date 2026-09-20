import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useDocumentStore } from '../stores/document.js'
import { useSelectionStore } from '../stores/selection.js'
import { useTimelineStore } from '../stores/timeline.js'
import { useTimelineCommands } from './useTimelineCommands.js'

/**
 * The reactive adapter over `data-004`'s five row actions (`TODO/ui-032`).
 *
 * Every one of these is already unit-proven in `src/core/timeline.spec.js`
 * against the document itself. What this file pins down is the half `data-004`
 * deliberately left to `ui-032`: that a refusal **arrives at the panel as
 * something it can render** rather than as a thrown error some `catch`
 * swallows, that the document is genuinely untouched when one is refused, and
 * that the store the viewport reads is refreshed when one succeeds. The second
 * attempt's whole failure mode was a control that looked live and silently
 * wasn't, so "the error reaches the user" is the contract under test here, not
 * a nicety.
 */
describe('useTimelineCommands (TODO/ui-032)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** Scenario 12's own opening: a cube, a 5 mm top chamfer on it, then a sphere. */
  function seedScenario12() {
    const doc = useDocumentStore()
    doc.append(
      {
        id: 'cuboid-1',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [40, 40, 40], center: [0, 0, 20] },
      },
      { origin: 'local' }
    )
    doc.append(
      {
        id: 'chamfer-2',
        op: 'modify.chamferRim',
        target: 'cuboid-1',
        supersedes: 'cuboid-1',
        params: { radius: 5, orientation: 'z+' },
      },
      { origin: 'local' }
    )
    doc.append(
      {
        id: 'sphere-3',
        op: 'primitive.sphere',
        name: 'Sphere 1',
        params: { diameter: 30, center: [120, 0, 15] },
      },
      { origin: 'local' }
    )
    return doc
  }

  /** @param {ReturnType<typeof useDocumentStore>} doc @param {string} name */
  function body(doc, name) {
    const found = doc.bodies.find((entry) => entry.name === name)
    if (!found) throw new Error(`no body named ${name}`)
    return found
  }

  // --- section 15: edit in place -----------------------------------------

  it('edits a past step and replays every step after it, leaving the rest byte-identical', () => {
    const doc = seedScenario12()
    const timeline = useTimelineCommands()

    const cubeBefore = body(doc, 'Cube 1').volumeMm3
    const sphereBefore = JSON.stringify(body(doc, 'Sphere 1'))

    const result = timeline.applyEdit('chamfer-2', { radius: 3 })

    expect(result.ok).toBe(true)
    // Scenario 12's step 7: the chamfer is *visibly smaller*, so less material
    // came off and the cube's volume goes **up** towards the unchamfered 64000.
    expect(body(doc, 'Cube 1').volumeMm3).toBeGreaterThan(cubeBefore)
    expect(body(doc, 'Cube 1').volumeMm3).toBeLessThan(64000)
    // "The sphere is untouched — still present, same position, same size."
    expect(JSON.stringify(body(doc, 'Sphere 1'))).toBe(sphereBefore)
    expect(doc.bodies).toHaveLength(2)
  })

  it('relabels the edited row, so the list shows the new value (scenario 12 step 7)', () => {
    seedScenario12()
    const store = useTimelineStore()
    const timeline = useTimelineCommands()

    expect(store.rows[1].text).toBe('Chamfer Top (+Z) 5 mm on Cube 1')
    timeline.applyEdit('chamfer-2', { radius: 3 })
    expect(store.rows[1].text).toBe('Chamfer Top (+Z) 3 mm on Cube 1')
  })

  it('is one undoable step: Undo puts 5 mm back and leaves the sphere alone', () => {
    const doc = seedScenario12()
    const timeline = useTimelineCommands()
    const sphereBefore = JSON.stringify(body(doc, 'Sphere 1'))
    const cubeAt5 = body(doc, 'Cube 1').volumeMm3

    timeline.applyEdit('chamfer-2', { radius: 3 })
    expect(doc.canUndo).toBe(true)

    doc.undo()
    expect(body(doc, 'Cube 1').volumeMm3).toBeCloseTo(cubeAt5, 6)
    expect(JSON.stringify(body(doc, 'Sphere 1'))).toBe(sphereBefore)

    doc.redo()
    expect(body(doc, 'Cube 1').volumeMm3).toBeGreaterThan(cubeAt5)
  })

  it('reports a broken downstream step by name and changes nothing at all', () => {
    const doc = useDocumentStore()
    doc.append(
      {
        id: 'cube-1',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [20, 20, 20], center: [0, 0, 10] },
      },
      { origin: 'local' }
    )
    doc.append(
      {
        id: 'cube-1-fillet',
        op: 'modify.filletRim',
        target: 'cube-1',
        supersedes: 'cube-1',
        params: { face: 'top', radius: 4 },
      },
      { origin: 'local' }
    )
    const timeline = useTimelineCommands()
    const before = JSON.stringify(doc.bodies)

    const result = timeline.applyEdit('cube-1', { size: [2, 2, 20] })

    expect(result.ok).toBe(false)
    // §15: the panel chips *that exact row*, so it needs the typed step, not a
    // string to parse.
    expect(result.broken).toMatchObject({ id: 'cube-1-fillet', step: 2 })
    expect(result.broken?.reason).toMatch(/^can't be built: /)
    expect(result.message).toMatch(/^Step 2 \(/)
    // Atomic: "if any record in the replay throws, nothing changes."
    expect(JSON.stringify(doc.bodies)).toBe(before)
    expect(doc.raw.recordOf('cube-1')?.params?.size).toEqual([20, 20, 20])
  })

  it('refuses a no-op edit without pretending something happened', () => {
    seedScenario12()
    const timeline = useTimelineCommands()
    const result = timeline.applyEdit('chamfer-2', { radius: 5 })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/nothing to apply|no change/i)
  })

  it('says a boolean row has no parameters rather than showing an empty form (§15)', () => {
    const doc = useDocumentStore()
    doc.append({ id: 'a', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10] } }, { origin: 'local' })
    doc.append(
      { id: 'b', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 10 } },
      { origin: 'local' }
    )
    doc.append(
      { id: 'u', op: 'boolean.union', name: 'Union 1', operands: ['a', 'b'], consumes: ['a', 'b'] },
      { origin: 'local' }
    )
    const timeline = useTimelineCommands()
    const verdict = timeline.editability('u')
    expect(verdict.editable).toBe(false)
    expect(verdict.reason).toBe('This step has no parameters')
  })

  it('states the rotation gap honestly instead of offering an empty form', () => {
    // `data-004`'s retirement note: `core-004` carries rotation **absolutely**
    // on every later transform record, so editing one row's copy would be
    // silently overwritten by the next. A `transform.rotate` row's only param
    // *is* that value, so the row is not editable at all today — and `ui-032`
    // was asked by name to disable Edit with that reason rather than render a
    // form with no fields in it. Making it editable is `core-004`'s successor,
    // not a tweak here.
    const doc = useDocumentStore()
    doc.append({ id: 'a', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10] } }, { origin: 'local' })
    doc.append(
      {
        id: 'spin',
        op: 'transform.rotate',
        target: 'a',
        supersedes: 'a',
        params: { rotation: [0, 0, 45] },
      },
      { origin: 'local' }
    )
    const timeline = useTimelineCommands()
    const verdict = timeline.editability('spin')
    expect(verdict.editable).toBe(false)
    expect(verdict.reason).toMatch(/rotation is carried/i)
  })

  it('offers only the editable params of a row, never the reserved ones', () => {
    seedScenario12()
    const timeline = useTimelineCommands()
    const fields = timeline.fieldsFor('chamfer-2')
    expect(fields.map((field) => field.key).sort()).toEqual(['orientation', 'radius'])
    expect(fields.find((field) => field.key === 'radius')).toMatchObject({ kind: 'number', value: 5 })
    // A face is a catalogue choice with real labels, not free text.
    const face = fields.find((field) => field.key === 'orientation')
    expect(face?.kind).toBe('choice')
    expect(face?.choices?.find((choice) => choice.value === 'z+')?.label).toBe('Top (+Z)')
  })

  // --- section 16: suppress ----------------------------------------------

  it('suppresses a step: the cube reverts, the sphere stays, nothing is deleted', () => {
    const doc = seedScenario12()
    const timeline = useTimelineCommands()
    const sphereBefore = JSON.stringify(body(doc, 'Sphere 1'))

    expect(timeline.setSuppressed('chamfer-2', true).ok).toBe(true)

    // Scenario 12 step 9: "an unchamfered cube with the sphere untouched."
    expect(body(doc, 'Cube 1').volumeMm3).toBeCloseTo(64000, 3)
    expect(JSON.stringify(body(doc, 'Sphere 1'))).toBe(sphereBefore)
    // Non-destructive — the row is still in the log and still in the list.
    expect(doc.raw.entries).toHaveLength(3)
    expect(useTimelineStore().rows[1].suppressed).toBe(true)

    expect(timeline.setSuppressed('chamfer-2', false).ok).toBe(true)
    expect(body(doc, 'Cube 1').volumeMm3).toBeLessThan(64000)
  })

  it('refuses to suppress a step a later step needs, by name, with the row unchanged', () => {
    const doc = useDocumentStore()
    doc.append({ id: 'a', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10] } }, { origin: 'local' })
    doc.append(
      { id: 'b', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 10 } },
      { origin: 'local' }
    )
    doc.append(
      { id: 'u', op: 'boolean.union', name: 'Union 1', operands: ['a', 'b'], consumes: ['a', 'b'] },
      { origin: 'local' }
    )
    const timeline = useTimelineCommands()

    const result = timeline.setSuppressed('a', true)
    expect(result.ok).toBe(false)
    // §16's own worked example, verbatim in shape: `Step 3 (Union) needs Cube 1`.
    expect(result.message).toContain('needs Cube 1')
    expect(result.broken?.step).toBe(3)
    expect(useTimelineStore().rows[0].suppressed).toBe(false)
  })

  // --- section 17: reorder ------------------------------------------------

  it('disables a move that would put a step above the step it builds on (§17)', () => {
    seedScenario12()
    const timeline = useTimelineCommands()
    // The chamfer supersedes the cube, so it can never precede it.
    const verdict = timeline.canMove('chamfer-2', -1)
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBe("Step 2 uses step 1's result")
    // And the first row cannot go up at all.
    expect(timeline.canMove('cuboid-1', -1).allowed).toBe(false)
    expect(timeline.canMove('sphere-3', 1).allowed).toBe(false)
  })

  it('moves a legal step and replays, leaving the viewport identical (scenario 12 step 11)', () => {
    const doc = seedScenario12()
    const timeline = useTimelineCommands()
    const store = useTimelineStore()
    const before = JSON.stringify(
      doc.bodies.map((entry) => [entry.name, entry.center, entry.volumeMm3])
    )

    expect(timeline.moveStep('sphere-3', -1).ok).toBe(true)
    expect(store.rows.map((row) => row.id)).toEqual(['cuboid-1', 'sphere-3', 'chamfer-2'])
    // "the rows swap and the viewport looks identical."
    expect(
      JSON.stringify(doc.bodies.map((entry) => [entry.name, entry.center, entry.volumeMm3]))
    ).toBe(before)

    doc.undo()
    expect(store.rows.map((row) => row.id)).toEqual(['cuboid-1', 'chamfer-2', 'sphere-3'])
  })

  it('refuses an illegal move rather than throwing out of the click handler', () => {
    seedScenario12()
    const timeline = useTimelineCommands()
    const result = timeline.moveStep('chamfer-2', -1)
    expect(result.ok).toBe(false)
    expect(result.message).toContain("uses step 1's result")
  })

  // --- section 18: rollback ----------------------------------------------

  it('rolls back non-destructively, inserts at the marker, and rolls forward intact', () => {
    const doc = seedScenario12()
    const timeline = useTimelineCommands()
    const store = useTimelineStore()
    const sphereBefore = JSON.stringify(body(doc, 'Sphere 1'))

    expect(timeline.rollBackTo('chamfer-2').ok).toBe(true)
    // The sphere disappears from the *evaluated* document but not from the log.
    expect(doc.bodies.map((entry) => entry.name)).toEqual(['Cube 1'])
    expect(doc.raw.entries).toHaveLength(3)
    expect(store.rollbackText).toBe('Rolled back to step 2 of 3')

    // §18: "any new local mutation is inserted immediately after the marker."
    doc.append(
      { id: 'cone-4', op: 'primitive.cone', name: 'Cone 1', params: { diameter: 20, height: 30, center: [-90, 0, 15] } },
      { origin: 'local' }
    )
    expect(store.rows.map((row) => row.id)).toEqual([
      'cuboid-1',
      'chamfer-2',
      'cone-4',
      'sphere-3',
    ])
    expect(store.rows[3].active).toBe(false)
    expect(store.rollbackText).toBe('Rolled back to step 3 of 4')
    expect(doc.bodies.map((entry) => entry.name)).toEqual(['Cube 1', 'Cone 1'])

    expect(timeline.rollForward().ok).toBe(true)
    expect(store.rolledBack).toBe(false)
    // "the Sphere reappears at exactly the position and size it had in step 3."
    expect(JSON.stringify(body(doc, 'Sphere 1'))).toBe(sphereBefore)
    expect(doc.bodies.map((entry) => entry.name)).toEqual(['Cube 1', 'Cone 1', 'Sphere 1'])
    expect(store.rows.map((row) => row.id)).toEqual([
      'cuboid-1',
      'chamfer-2',
      'cone-4',
      'sphere-3',
    ])
  })

  it('clears the body selection once, at the moment of rollback (§18)', () => {
    seedScenario12()
    const selection = useSelectionStore()
    const timeline = useTimelineCommands()
    selection.select('sphere-3')

    timeline.rollBackTo('chamfer-2')
    expect(selection.ids).toEqual([])
  })

  it('ends any preview when a row action runs, so the whole-document result is visible', () => {
    // §14: "any row action ends the preview and returns the viewport to the
    // latest state — the scenario's 'sphere is untouched' check needs the
    // sphere visible."
    seedScenario12()
    const store = useTimelineStore()
    const timeline = useTimelineCommands()
    store.selectRow('chamfer-2')
    expect(store.previewing).toBe(true)

    timeline.applyEdit('chamfer-2', { radius: 3 })
    expect(store.previewing).toBe(false)
  })

  it('only allows Suppress on an inactive row — Edit and Move say to roll forward first', () => {
    seedScenario12()
    const timeline = useTimelineCommands()
    timeline.rollBackTo('cuboid-1')

    expect(timeline.editability('sphere-3')).toMatchObject({
      editable: false,
      reason: "Roll forward first — inactive steps can't be checked yet",
    })
    expect(timeline.canMove('sphere-3', -1).allowed).toBe(false)
    // Suppress stays available, and is cheap — nothing needs evaluating.
    expect(timeline.setSuppressed('sphere-3', true).ok).toBe(true)
  })

  it('surfaces a broken inactive-tail row informationally, without refusing the insert', () => {
    const doc = useDocumentStore()
    doc.append(
      {
        id: 'cube-1',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [20, 20, 20], center: [0, 0, 10] },
      },
      { origin: 'local' }
    )
    doc.append(
      { id: 'sphere-2', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 10, center: [60, 0, 5] } },
      { origin: 'local' }
    )
    doc.append(
      {
        id: 'rim-3',
        op: 'modify.filletRim',
        target: 'cube-1',
        supersedes: 'cube-1',
        params: { face: 'top', radius: 4 },
      },
      { origin: 'local' }
    )
    const timeline = useTimelineCommands()
    const store = useTimelineStore()
    timeline.rollBackTo('sphere-2')

    // Shrink the cube while rolled back: the inactive rim no longer fits.
    const edit = timeline.applyEdit('cube-1', { size: [2, 2, 20] })
    expect(edit.ok).toBe(true) // the *active* document is fine
    expect(store.rows[2].broken).toMatch(/can't be built/)
    // §18: informational only — the row is still there and still inactive.
    expect(store.rows[2].active).toBe(false)
    expect(doc.raw.entries).toHaveLength(3)
  })

  it('refuses to roll forward over a tail row that cannot be built, and keeps the marker', () => {
    const doc = useDocumentStore()
    doc.append(
      {
        id: 'cube-1',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [20, 20, 20], center: [0, 0, 10] },
      },
      { origin: 'local' }
    )
    doc.append(
      { id: 'sphere-2', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 10, center: [60, 0, 5] } },
      { origin: 'local' }
    )
    doc.append(
      {
        id: 'rim-3',
        op: 'modify.filletRim',
        target: 'cube-1',
        supersedes: 'cube-1',
        params: { face: 'top', radius: 4 },
      },
      { origin: 'local' }
    )
    const timeline = useTimelineCommands()
    const store = useTimelineStore()
    timeline.rollBackTo('sphere-2')
    timeline.applyEdit('cube-1', { size: [2, 2, 20] })

    const result = timeline.rollForward()
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/^Can't roll forward: /)
    expect(result.broken?.step).toBe(3)
    // "nothing changes, the marker stays."
    expect(store.rolledBack).toBe(true)
    expect(doc.raw.rollbackAt()).toBe(2)
  })
})

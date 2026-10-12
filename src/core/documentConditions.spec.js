// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { LOCAL, centreOf, piAndCube, piWith, snapCubeTo, subtractAvjackClearance } from './__fixtures__/piScenes.js'
import { ReplayRejection, createDocument } from './document.js'
import { volumeOf as kernelVolumeOf } from './kernel/group.js'
import { parseProject, serializeProject } from './project.js'
import { recordLinesOf } from './__fixtures__/projectText.js'

/**
 * `TODO/ui-052` inside the fold: the replace-path proofs its Step 2 asks for, rows a user
 * chose to **leave broken**, and conditional records (`when`).
 *
 * Real kernel throughout — the whole question is what a re-fold does to a snap onto a
 * Raspberry Pi whose model changed underneath it.
 */

/** @param {import('./document.js').WarpDocument} document @param {string} id */
function volumeOf(document, id) {
  const body = document.bodies().find((candidate) => candidate.id === id)
  if (!body) throw new Error(`no body ${id}`)
  return kernelVolumeOf(body.geometry)
}

/** @param {import('./document.js').WarpDocument} document */
function bodyIds(document) {
  return document.bodies().map((body) => body.id)
}

describe('Step 2 proofs — the replace path against the real fold', () => {
  it('(a) a snap record is live: replacing the Pi re-folds it against the new board', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'ethernet')
    const onPi4 = centreOf(document, 'cube-1')

    document.reviseRecords([{ id: 'pi-1', record: piWith(document, { model: 5 }) }], LOCAL)
    const refolded = centreOf(document, 'cube-1')

    // The same log built from scratch on a Pi 5 is the reference: the re-fold must land
    // the cube exactly where a fresh Pi 5 snap would, not where the Pi 4's jack was.
    const fresh = snapCubeTo(piAndCube({ model: 5 }), 'ethernet')
    const expected = centreOf(fresh, 'cube-1')
    for (let axis = 0; axis < 3; axis += 1) expect(refolded[axis]).toBeCloseTo(expected[axis], 6)
    expect(refolded[1]).not.toBeCloseTo(onPi4[1], 1)
  })

  it('(b) a sub-part Subtract that consumed the Pi still resolves the replaced creation record', () => {
    const document = subtractAvjackClearance(piAndCube({ model: 4 }))
    const cutOnPi4 = volumeOf(document, 'bool-1')
    // Pi 4 → Pi 3: both have `clearance-avjack`? No — only the 4 does, so go 4 → 4 with a
    // bigger clearance, which the subtract must re-resolve through the consumed Pi.
    document.reviseRecords([{ id: 'pi-1', record: piWith(document, { clearance: 9 }) }], LOCAL)
    expect(volumeOf(document, 'bool-1')).toBeLessThan(cutOnPi4)
  })

  it('a change that breaks a dependent is refused atomically unless that row was left broken', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const before = serializeProject(document)
    expect(() => document.reviseRecords([{ id: 'pi-1', record: piWith(document, { model: 5 }) }], LOCAL)).toThrow(
      ReplayRejection,
    )
    expect(recordLinesOf(serializeProject(document))).toBe(recordLinesOf(before))
  })
})

describe('rows left broken (the dialog\'s "Leave broken")', () => {
  it('a broken snap renders its body at the last good pose — the snap acts as identity', () => {
    const document = piAndCube({ model: 4 })
    const preSnap = centreOf(document, 'cube-1')
    snapCubeTo(document, 'avjack')

    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'snap-1', leftBroken: true },
      ],
      LOCAL,
    )

    expect(bodyIds(document)).toContain('cube-1')
    const now = centreOf(document, 'cube-1')
    for (let axis = 0; axis < 3; axis += 1) expect(now[axis]).toBeCloseTo(preSnap[axis], 6)
    const broken = document.brokenSteps()
    expect(broken.map((step) => step.id)).toEqual(['snap-1'])
    expect(broken[0].reason).toMatch(/avjack/)
    expect(document.timeline().find((row) => row.id === 'snap-1')?.broken).toMatch(/avjack/)
  })

  it('stays flagged across an unrelated rebuild, and a later move of the body still works', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'snap-1', leftBroken: true },
      ],
      LOCAL,
    )
    document.setSuppressed('pi-1-move', true, LOCAL)
    document.setSuppressed('pi-1-move', false, LOCAL)
    expect(document.brokenSteps().map((step) => step.id)).toEqual(['snap-1'])

    const at = centreOf(document, 'cube-1')
    const current = /** @type {string} */ (document.currentIdOf('cube-1'))
    document.append(
      { id: 'cube-1-move-9', op: 'transform.translate', target: current, supersedes: current, params: { vector: [0, 0, 7], rotation: [0, 0, 0] } },
      LOCAL,
    )
    expect(centreOf(document, 'cube-1')[2]).toBeCloseTo(at[2] + 7, 6)
  })

  it('survives save and reload still flagged', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'snap-1', leftBroken: true },
      ],
      LOCAL,
    )
    const text = serializeProject(document)
    const { entries, rollbackAt, resolution, merge } = parseProject(text)
    const reloaded = createDocument()
    reloaded.loadEntries(entries, rollbackAt, resolution, { merge })
    expect(reloaded.brokenSteps().map((step) => step.id)).toEqual(['snap-1'])
    expect(serializeProject(reloaded)).toBe(text)
  })

  it('the whole revision is one Undo step that restores the log byte for byte', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const before = serializeProject(document)
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'snap-1', leftBroken: true },
      ],
      { origin: 'local', label: 'Edit Raspberry Pi 1' },
    )
    expect(document.pendingUndo()?.label).toBe('Edit Raspberry Pi 1')
    document.undo()
    expect(recordLinesOf(serializeProject(document))).toBe(recordLinesOf(before))
    expect(document.brokenSteps()).toEqual([])
    document.redo()
    expect(document.brokenSteps().map((step) => step.id)).toEqual(['snap-1'])
  })

  it('a revision may rewrite pieces and drop operands, but never re-point lineage or reach new records', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const snap = /** @type {any} */ (document.recordOf('snap-1'))
    expect(() =>
      document.reviseRecords([{ id: 'snap-1', record: { ...snap, supersedes: 'pi-1' } }], LOCAL),
    ).toThrow(/supersedes/)
    expect(() =>
      document.reviseRecords([{ id: 'snap-1', record: { ...snap, operands: [{ id: 'cube-1', pieces: 'x' }] } }], LOCAL),
    ).toThrow(/cube-1/)
    // A remap only renames the piece — allowed.
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'snap-1', record: { ...snap, operands: [{ id: snap.operands[0].id, pieces: 'usbc' }] } },
      ],
      LOCAL,
    )
    expect(document.brokenSteps()).toEqual([])
  })
})

describe('conditional records — `when` in the fold', () => {
  /** A Pi with a cube snapped to its AV jack and made conditional on the Pi being a 4. */
  function conditionedCube({ cubeFirst = false } = {}) {
    const document = snapCubeTo(piAndCube({ model: 4, cubeFirst }), 'avjack')
    const cube = /** @type {any} */ (document.recordOf('cube-1'))
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'cube-1', record: { ...cube, when: { ref: 'pi-1', param: 'model', in: [4] } } },
      ],
      LOCAL,
    )
    return document
  }

  it('a whole-body condition skips every record in that lineage, silently — no broken rows', () => {
    const document = conditionedCube()
    expect(bodyIds(document)).not.toContain('cube-1')
    expect(document.brokenSteps()).toEqual([])
    const rows = document.timeline()
    for (const id of ['cube-1', 'snap-1']) {
      const row = rows.find((candidate) => candidate.id === id)
      expect(row?.inactiveBy).toEqual({ refId: 'pi-1', param: 'model', values: [4] })
      expect(row?.condition?.refId).toBe('pi-1')
      expect(row?.broken).toBeNull()
    }
    expect(document.inactiveBodies().map((body) => body.id)).toEqual(['cube-1'])
  })

  it('the same holds when the cube was placed before the Pi', () => {
    const document = conditionedCube({ cubeFirst: true })
    expect(bodyIds(document)).not.toContain('cube-1')
    expect(document.brokenSteps()).toEqual([])
  })

  it('switching Pi 5 → 4 → 5 round-trips the scene, and the cube comes back snapped', () => {
    const reference = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const snapped = centreOf(reference, 'cube-1')

    const document = conditionedCube()
    document.reviseRecords([{ id: 'pi-1', record: piWith(document, { model: 4 }) }], LOCAL)
    const back = centreOf(document, 'cube-1')
    for (let axis = 0; axis < 3; axis += 1) expect(back[axis]).toBeCloseTo(snapped[axis], 6)
    expect(document.timeline().find((row) => row.id === 'cube-1')?.inactiveBy).toBeNull()
    expect(document.timeline().find((row) => row.id === 'cube-1')?.condition?.refId).toBe('pi-1')

    document.reviseRecords([{ id: 'pi-1', record: piWith(document, { model: 5 }) }], LOCAL)
    expect(bodyIds(document)).not.toContain('cube-1')
  })

  it('an operation-scope condition on a sub-part Subtract keeps the case, un-cut on a Pi 5 and cut on a Pi 4', () => {
    const document = subtractAvjackClearance(piAndCube({ model: 4 }))
    const caseVolume = 110 * 80 * 30
    const cutOnPi4 = volumeOf(document, 'bool-1')
    expect(cutOnPi4).toBeLessThan(caseVolume)

    const subtract = /** @type {any} */ (document.recordOf('bool-1'))
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'bool-1', record: { ...subtract, when: { ref: 'pi-1', param: 'model', in: [4] } } },
      ],
      LOCAL,
    )
    expect(bodyIds(document)).toContain('bool-1')
    expect(volumeOf(document, 'bool-1')).toBeCloseTo(caseVolume, 3)
    expect(document.brokenSteps()).toEqual([])

    document.reviseRecords([{ id: 'pi-1', record: piWith(document, { model: 4 }) }], LOCAL)
    expect(volumeOf(document, 'bool-1')).toBeCloseTo(cutOnPi4, 3)
  })

  it('a later record that uses an inactive body is broken, with the condition named in its reason', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    document.append({ id: 'sphere-1', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 8, center: [140, 20, 4] } }, LOCAL)
    const cubeNow = /** @type {string} */ (document.currentIdOf('cube-1'))
    document.append(
      { id: 'union-1', op: 'boolean.union', name: 'Union 1', target: cubeNow, operands: ['sphere-1'], consumes: [cubeNow, 'sphere-1'] },
      LOCAL,
    )
    const cube = /** @type {any} */ (document.recordOf('cube-1'))
    /** @type {any} */
    let refusal
    try {
      document.reviseRecords(
        [
          { id: 'pi-1', record: piWith(document, { model: 5 }) },
          { id: 'cube-1', record: { ...cube, when: { ref: 'pi-1', param: 'model', in: [4] } } },
        ],
        LOCAL,
      )
    } catch (error) {
      refusal = error
    }
    expect(refusal).toBeInstanceOf(ReplayRejection)
    expect(refusal.step.id).toBe('union-1')
    expect(refusal.step.reason).toMatch(/Cube 1/)
    expect(refusal.step.reason).toMatch(/only exists when Raspberry Pi 1's Model is Pi 4/)
  })

  it('removing the condition while on a Pi 5 brings the original problem back rather than hiding it', () => {
    const document = conditionedCube()
    const cube = /** @type {any} */ (document.recordOf('cube-1'))
    const { when: _dropped, ...unconditioned } = cube
    // Without leaving the snap broken, removal is refused — the snap cannot build on a Pi 5.
    expect(() => document.reviseRecords([{ id: 'cube-1', record: unconditioned }], LOCAL)).toThrow(/avjack/)
    document.reviseRecords([{ id: 'cube-1', record: unconditioned }, { id: 'snap-1', leftBroken: true }], LOCAL)
    expect(bodyIds(document)).toContain('cube-1')
    expect(document.brokenSteps().map((step) => step.id)).toEqual(['snap-1'])
  })

  it('a condition that can no longer be evaluated is broken, not read as true or false', () => {
    const document = conditionedCube()
    document.deleteBodies(['pi-1'], LOCAL)
    const cubeRow = document.timeline().find((row) => row.id === 'cube-1')
    expect(cubeRow?.broken).toMatch(/deleted/)
    expect(cubeRow?.inactiveBy).toBeNull()
    expect(bodyIds(document)).not.toContain('cube-1')
  })

  it('a condition on a Pi that is not there (yet, or any more) is reported broken, and heals when it is', () => {
    const document = createDocument()
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [6, 6, 6] } }, LOCAL)
    const cube = /** @type {any} */ (document.recordOf('cube-1'))
    // Conditioned on a Pi that does not exist yet: reported broken (never read as true or
    // false), and tolerated — a condition that cannot be evaluated is a flag, not a refusal.
    document.reviseRecords([{ id: 'cube-1', record: { ...cube, when: { ref: 'pi-1', param: 'model', in: [4] } } }], LOCAL)
    expect(document.timeline()[0].broken).toMatch(/pi-1/)
    expect(bodyIds(document)).toEqual([])
    document.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } }, LOCAL)
    expect(document.timeline()[0].broken).toBeNull()
    expect(bodyIds(document)).toEqual(['cube-1', 'pi-1'])
    // Undoing the Pi puts back exactly the state before it — the condition unevaluable
    // and reported — rather than being refused: nothing is orphaned, only flagged.
    document.undo()
    expect(document.timeline()[0].broken).toMatch(/pi-1/)
  })

  it('the condition round-trips through save and reload, inactive and chipped', () => {
    const document = conditionedCube()
    const text = serializeProject(document)
    const { entries, rollbackAt, resolution } = parseProject(text)
    const reloaded = createDocument()
    reloaded.loadEntries(entries, rollbackAt, resolution)
    expect(bodyIds(reloaded)).not.toContain('cube-1')
    expect(reloaded.timeline().find((row) => row.id === 'cube-1')?.inactiveBy?.values).toEqual([4])
  })

  it('a conditioned row may be reordered above its ref and evaluates the same (deviation: no ordering rule)', () => {
    const document = createDocument()
    document.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 5 } }, LOCAL)
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [6, 6, 6] } }, LOCAL)
    const cube = /** @type {any} */ (document.recordOf('cube-1'))
    document.reviseRecords([{ id: 'cube-1', record: { ...cube, when: { ref: 'pi-1', param: 'model', in: [4] } } }], LOCAL)
    expect(document.canMove('cube-1', -1).allowed).toBe(true)
    document.moveStep('cube-1', -1, LOCAL)
    expect(bodyIds(document)).toEqual(['pi-1'])
    expect(document.timeline()[0].inactiveBy?.values).toEqual([4])
  })
})

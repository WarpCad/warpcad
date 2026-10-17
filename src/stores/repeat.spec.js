// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { piAndTouchScreen } from '../core/__fixtures__/piScenes.js'
import { REPEAT_OP } from '../core/repeat.js'
import { useDocumentStore } from './document.js'
import { armGateOf, useRepeatStore } from './repeat.js'
import { useSelectionStore } from './selection.js'

/**
 * The Repeat session (`TODO/ui-069`): UI state only. Real kernel, real document store and the
 * user's own scene — a Pi 5 seated on a Touchscreen 2's posts — so what Apply commits is the
 * same `core-061` record the fold already proves. Millimetres, Z up.
 */

const LOCAL = Object.freeze({ origin: 'local' })

/** @typedef {ReturnType<typeof useDocumentStore>} DocumentStore */

/** The Pi seated on the screen's posts, loaded as a project (not part of anyone's undo stack). */
function seatedPi() {
  const raw = piAndTouchScreen()
  const pi = () => /** @type {string} */ (raw.currentIdOf('pi-1'))
  const screen = /** @type {string} */ (raw.currentIdOf('screen-1'))
  raw.append(
    {
      id: 'pi-align',
      op: 'group.align',
      target: { id: pi(), pieces: 'hole1' },
      supersedes: pi(),
      operands: [{ id: screen, pieces: 'piMountingPost1' }],
      params: { axes: 'xy', deltaMm: 0 },
    },
    LOCAL,
  )
  raw.append(
    {
      id: 'pi-snap',
      op: 'group.snap',
      target: { id: pi(), pieces: 'mb' },
      supersedes: pi(),
      operands: [{ id: screen, pieces: 'piMountingPost1' }],
      params: { axes: 'z', orientation: 'outside-', deltaMm: 0 },
    },
    LOCAL,
  )
  setActivePinia(createPinia())
  const documentStore = useDocumentStore()
  documentStore.load(raw.entries.map((entry) => ({ ...entry })))
  const selection = useSelectionStore()
  return { documentStore, selection, repeat: useRepeatStore() }
}

/**
 * The first screw, the user's way: dropped, turned head-up, centred on `hole1`, seated 5 mm
 * into `mb`. Each step is its own local append, as the Library, gizmo and Align popover make it.
 *
 * @param {DocumentStore} documentStore
 * @param {{ upTo?: 'drop' | 'turn' | 'align' | 'snap' }} [options]
 */
function firstScrew(documentStore, { upTo = 'snap' } = {}) {
  const pi = () => /** @type {string} */ (documentStore.raw.currentIdOf('pi-1'))
  documentStore.append(
    { id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { type: 'socket', spec: 'm2.5', length: 10, fit: 'loose' } },
    LOCAL,
  )
  if (upTo === 'drop') return
  documentStore.append(
    {
      id: 'bolt-turn',
      op: 'transform.rotate',
      target: 'bolt-1',
      supersedes: 'bolt-1',
      params: { angles: [180, 0, 0], center: [0, 0, 6.25], rotation: [180, 0, 0] },
    },
    LOCAL,
  )
  if (upTo === 'turn') return
  documentStore.append(
    {
      id: 'bolt-align',
      op: 'group.align',
      target: 'bolt-turn',
      supersedes: 'bolt-turn',
      operands: [{ id: pi(), pieces: 'hole1' }],
      params: { axes: 'xy', deltaMm: 0 },
    },
    LOCAL,
  )
  if (upTo === 'align') return
  documentStore.append(
    {
      id: 'bolt-snap',
      op: 'group.snap',
      target: 'bolt-align',
      supersedes: 'bolt-align',
      operands: [{ id: pi(), pieces: 'mb' }],
      params: { axes: 'z', orientation: 'outside-', deltaMm: -5 },
    },
    LOCAL,
  )
}

/** Drill into the Pi's `hole1` and press Repeat. */
function armOnHole1() {
  const context = seatedPi()
  context.selection.select('pi-1')
  context.selection.drillInto('hole1')
  expect(context.repeat.armGate).toEqual({ enabled: true, reason: '' })
  expect(context.repeat.arm()).toBe(true)
  return context
}

describe('arming (the ⟳ Repeat button’s gate)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('needs exactly one body, drilled into one part, with at least one other part', () => {
    const base = { count: 1, subPart: { bodyId: 'pi-1', partName: 'hole1' }, partNames: ['hole1', 'hole2'], previewing: false }
    expect(armGateOf(base)).toEqual({ enabled: true, reason: '' })
    expect(armGateOf({ ...base, count: 0, subPart: null })).toEqual({ enabled: false, reason: 'Drill into a part first, such as a hole' })
    expect(armGateOf({ ...base, subPart: null })).toEqual({ enabled: false, reason: 'Drill into a part first, such as a hole' })
    expect(armGateOf({ ...base, count: 2 })).toEqual({ enabled: false, reason: 'Drill into a part first, such as a hole' })
    expect(armGateOf({ ...base, partNames: ['hole1'] })).toEqual({ enabled: false, reason: 'This part has no others to repeat on' })
    expect(armGateOf({ ...base, previewing: true })).toEqual({ enabled: false, reason: 'Previewing history — read-only' })
  })

  it('reads the live selection: the whole Pi is not enough, its hole1 is', () => {
    const { selection, repeat } = seatedPi()
    expect(repeat.armGate.enabled).toBe(false)
    selection.select('pi-1')
    expect(repeat.armGate).toEqual({ enabled: false, reason: 'Drill into a part first, such as a hole' })
    expect(repeat.arm()).toBe(false)
    expect(repeat.armed).toBe(false)
    selection.drillInto('hole1')
    expect(repeat.armGate.enabled).toBe(true)
  })

  it('pre-ticks the seed’s name family, the seed locked, and says what it will do', () => {
    const { repeat } = armOnHole1()
    expect(repeat.armed).toBe(true)
    expect(repeat.seed).toEqual({ bodyId: 'pi-1', partName: 'hole1' })
    expect(repeat.ticked).toEqual(['hole1', 'hole2', 'hole3', 'hole4'])
    expect(repeat.partNames).toEqual(expect.arrayContaining(['hole1', 'hole2', 'hole3', 'hole4', 'mb']))
    expect(repeat.headline).toBe('Repeat on Raspberry Pi 1 › hole1 and 3 more')
    expect(repeat.status).toBe('Now make one part on hole1: drag it in, turn it, Align and Snap it as usual.')
    expect(repeat.libraryHint).toBe('Repeating on 4 targets: drag the part you want onto hole1.')
    expect(repeat.outlined).toEqual(['hole2', 'hole3', 'hole4'])

    repeat.toggleTarget('hole1')
    expect(repeat.ticked).toContain('hole1')
    repeat.toggleTarget('hole3')
    expect(repeat.ticked).toEqual(['hole1', 'hole2', 'hole4'])
    expect(repeat.headline).toBe('Repeat on Raspberry Pi 1 › hole1 and 2 more')
    repeat.toggleTarget('hole3')
    expect(repeat.ticked).toEqual(['hole1', 'hole2', 'hole3', 'hole4'])
  })
})

describe('the session watcher', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('the subject is the first body created after arming, not one that already existed', () => {
    const { documentStore, repeat } = seatedPi()
    // A cube placed before Repeat was pressed is never the subject (decision 2: start first).
    documentStore.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [5, 5, 5], center: [0, 0, 2.5] } }, LOCAL)
    const selection = useSelectionStore()
    selection.select('pi-1')
    selection.drillInto('hole1')
    repeat.arm()
    expect(repeat.subject).toBeNull()

    firstScrew(documentStore, { upTo: 'drop' })
    expect(repeat.subject).toEqual({ id: 'bolt-1', name: 'Bolt 1' })
    // A second body afterwards does not take over.
    documentStore.append({ id: 'cube-2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [5, 5, 5], center: [30, 0, 2.5] } }, LOCAL)
    expect(repeat.subject).toEqual({ id: 'bolt-1', name: 'Bolt 1' })
  })

  it('records only the subject’s own local steps, marking the ones that mention the seed', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore)
    expect(repeat.steps.map((step) => step.id)).toEqual(['bolt-turn', 'bolt-align', 'bolt-snap'])
    expect(repeat.steps.map((step) => step.mentionsSeed)).toEqual([false, true, false])
    for (const step of repeat.steps) expect(step.label.length).toBeGreaterThan(0)
    expect(repeat.status).toBe('Recording Bolt 1: 3 steps')
    expect(repeat.outside).toEqual([])
  })

  it('a step on another body, or an ai/mcp/merge step even on the subject, is "not part of the repeat"', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore)
    // The screen nudged by hand: another body.
    documentStore.append(
      { id: 'screen-nudge', op: 'transform.translate', target: /** @type {string} */ (documentStore.raw.currentIdOf('screen-1')), supersedes: /** @type {string} */ (documentStore.raw.currentIdOf('screen-1')), params: { vector: [0, 0, 0.5], rotation: [0, 0, 0] } },
      LOCAL,
    )
    // The AI recolours Bolt 1: on the subject, but not the user's own step.
    documentStore.append({ id: 'bolt-ai-color', op: 'style.recolor', target: 'bolt-snap', supersedes: 'bolt-snap', colorOverride: 0xff0000 }, { origin: 'ai' })
    expect(repeat.steps.map((step) => step.id)).toEqual(['bolt-turn', 'bolt-align', 'bolt-snap'])
    expect(repeat.outside.map((step) => step.id)).toEqual(['screen-nudge', 'bolt-ai-color'])
    expect(repeat.outside.map((step) => step.origin)).toEqual(['local', 'ai'])
    // Bolt 1's lineage now holds a step the user did not make (`TODO/core-063`): Apply is still
    // on, and that step is listed as left out of the copies, with who made it.
    expect(repeat.canApply).toBe(true)
    expect(repeat.applyReason).toBeNull()
    expect(repeat.leftOut).toEqual([{ id: 'bolt-ai-color', label: expect.any(String), reason: 'From the Assistant, so it is left out of the copies' }])
  })

  it('Apply writes the left-out step into the record, and the copies do not carry it (TODO/core-063)', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore)
    const snapId = /** @type {string} */ (documentStore.raw.currentIdOf('bolt-1'))
    documentStore.append({ id: 'bolt-ai-lift', op: 'transform.translate', target: snapId, supersedes: snapId, params: { vector: [0, 0, 3], rotation: [0, 0, 0] } }, { origin: 'mcp' })
    expect(repeat.leftOut).toEqual([{ id: 'bolt-ai-lift', label: expect.any(String), reason: 'From Claude Code, so it is left out of the copies' }])
    expect(repeat.apply()).toBe(true)
    const record = documentStore.raw.entries.find((entry) => entry.record.op === REPEAT_OP)?.record
    expect(record?.params?.skip).toEqual(['bolt-ai-lift'])
    expect(repeat.notice?.text).toBe('Repeated Bolt 1 on 3 more holes')
  })

  it('no left-out step, no `skip` in the record (TODO/core-063)', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore)
    expect(repeat.apply()).toBe(true)
    expect(documentStore.raw.entries.find((entry) => entry.record.op === REPEAT_OP)?.record.params).not.toHaveProperty('skip')
  })

  it('when the only step that points at the seed is the Assistant’s, Apply is off and says exactly that (TODO/core-063)', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore, { upTo: 'turn' })
    const turnId = /** @type {string} */ (documentStore.raw.currentIdOf('bolt-1'))
    documentStore.append(
      {
        id: 'bolt-ai-align',
        op: 'group.align',
        target: turnId,
        supersedes: turnId,
        operands: [{ id: /** @type {string} */ (documentStore.raw.currentIdOf('pi-1')), pieces: 'hole1' }],
        params: { axes: 'xy', deltaMm: 0 },
      },
      { origin: 'ai' },
    )
    expect(repeat.leftOut.map((step) => step.id)).toEqual(['bolt-ai-align'])
    expect(repeat.canApply).toBe(false)
    expect(repeat.applyReason).toBe(
      'The only step that points at hole1 is from the Assistant, and it is left out of the copies, so there is nothing to repeat. Make that step yourself.',
    )
  })

  it('deleting the subject mid-session ends the session with nothing applied', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore)
    const before = documentStore.raw.entries.length
    documentStore.deleteBodies(['bolt-1'])
    expect(repeat.armed).toBe(false)
    expect(documentStore.raw.entries.length).toBe(before + 1)
    expect(documentStore.raw.entries.some((entry) => entry.record.op === REPEAT_OP)).toBe(false)
  })

  it('Undo of the subject’s drop puts the session back to waiting rather than ending it', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore, { upTo: 'drop' })
    expect(repeat.subject?.id).toBe('bolt-1')
    documentStore.undo()
    expect(repeat.armed).toBe(true)
    expect(repeat.subject).toBeNull()
  })

  it('Cancel ends the session and undoes nothing', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore)
    const entries = documentStore.raw.entries.length
    const undoLabel = documentStore.undoLabel
    repeat.cancel()
    expect(repeat.armed).toBe(false)
    expect(repeat.seed).toBeNull()
    expect(documentStore.raw.entries.length).toBe(entries)
    expect(documentStore.undoLabel).toBe(undoLabel)
  })

  it('a loaded project ends the session', () => {
    const { documentStore, repeat } = armOnHole1()
    documentStore.load([])
    expect(repeat.armed).toBe(false)
  })
})

describe('Apply’s enabled state', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('no subject yet', () => {
    const { repeat } = armOnHole1()
    expect(repeat.canApply).toBe(false)
    expect(repeat.applyReason).toBe('Make the part on hole1 first')
  })

  it('a subject whose steps never mention the seed: the core’s own reason, live', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore, { upTo: 'turn' })
    expect(repeat.canApply).toBe(false)
    expect(repeat.applyReason).toBe("Nothing in Bolt 1's steps refers to hole1, so every repeat would land on Bolt 1")
  })

  it('only the seed ticked', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore)
    for (const target of ['hole2', 'hole3', 'hole4']) repeat.toggleTarget(target)
    expect(repeat.ticked).toEqual(['hole1'])
    expect(repeat.canApply).toBe(false)
    expect(repeat.applyReason).toBe('Tick at least one target besides hole1')
  })

  it('all good: enabled, and the label carries the count', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore)
    expect(repeat.applyReason).toBeNull()
    expect(repeat.canApply).toBe(true)
    expect(repeat.applyLabel).toBe('Apply to 3 more')
  })
})

describe('Apply', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('commits one linked repeat record — one Undo step, one History row — and selects it', () => {
    const { documentStore, selection, repeat } = armOnHole1()
    firstScrew(documentStore)
    const before = documentStore.raw.entries.length
    expect(repeat.apply()).toBe(true)

    expect(documentStore.raw.entries.length).toBe(before + 1)
    const { record, origin } = /** @type {any} */ (documentStore.raw.entries.at(-1))
    expect(origin).toBe('local')
    expect(record.op).toBe(REPEAT_OP)
    expect(record.params).toEqual({ source: 'bolt-1', seed: { id: 'pi-1', pieces: 'hole1' }, targets: ['hole2', 'hole3', 'hole4'] })
    expect(documentStore.undoLabel).toBe('Repeat → hole2, hole3, hole4')

    expect(selection.ids).toEqual([record.id])
    expect(documentStore.bodies.find((body) => body.id === record.id)?.name).toBe('Bolt 1 ×3')
    expect(repeat.armed).toBe(false)
    expect(repeat.notice).toEqual({ text: 'Repeated Bolt 1 on 3 more holes', undoLabel: 'Repeat → hole2, hole3, hole4' })

    // One Undo takes the Repeat row away and leaves Bolt 1.
    expect(documentStore.undo().ok).toBe(true)
    expect(documentStore.raw.entries.length).toBe(before)
    expect(documentStore.bodies.some((body) => body.id === 'bolt-1')).toBe(true)
    expect(documentStore.bodies.some((body) => body.id === record.id)).toBe(false)
  })

  it('applies only the ticked targets', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore)
    repeat.toggleTarget('hole3')
    expect(repeat.applyLabel).toBe('Apply to 2 more')
    expect(repeat.apply()).toBe(true)
    const record = /** @type {any} */ (documentStore.raw.entries.at(-1)).record
    expect(record.params.targets).toEqual(['hole2', 'hole4'])
    expect(repeat.notice?.text).toBe('Repeated Bolt 1 on 2 more holes')
  })

  it('is refused while it cannot apply, writing nothing', () => {
    const { documentStore, repeat } = armOnHole1()
    firstScrew(documentStore, { upTo: 'turn' })
    const before = documentStore.raw.entries.length
    expect(repeat.apply()).toBe(false)
    expect(documentStore.raw.entries.length).toBe(before)
    expect(repeat.armed).toBe(true)
  })
})

describe('the phone bottom sheet', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('minimises and expands, and a new session starts expanded', () => {
    const { repeat } = armOnHole1()
    expect(repeat.minimized).toBe(false)
    repeat.minimize()
    expect(repeat.minimized).toBe(true)
    repeat.expand()
    expect(repeat.minimized).toBe(false)
    repeat.minimize()
    repeat.cancel()
    const selection = useSelectionStore()
    selection.select('pi-1')
    selection.drillInto('hole1')
    repeat.arm()
    expect(repeat.minimized).toBe(false)
  })
})

describe('the repeat body’s own commands (document store)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** Arm, make the first screw, Apply: the repeat body selected. */
  function applied() {
    const context = armOnHole1()
    firstScrew(context.documentStore)
    context.repeat.apply()
    const id = /** @type {string} */ (context.selection.onlyId)
    return { ...context, id }
  }

  it('Detach replaces the repeat with one body per member — one Undo step — and selects them', () => {
    const { documentStore, selection, id } = applied()
    const created = documentStore.detachRepeat(id)
    expect(created).toHaveLength(3)
    expect(documentStore.bodies.some((body) => body.id === id)).toBe(false)
    expect(selection.ids).toEqual(created)
    expect(documentStore.undo().ok).toBe(true)
    expect(documentStore.bodies.some((body) => body.id === id)).toBe(true)
    for (const bodyId of created) expect(documentStore.bodies.some((body) => body.id === bodyId)).toBe(false)
  })

  it('deleting the source with its repeats is one step; leaving them broken is one step too', () => {
    const { documentStore, id } = applied()
    const steps = () => documentStore.raw.entries.length

    const before = steps()
    documentStore.deleteBodies(['bolt-1', id])
    expect(documentStore.bodies.some((body) => body.id === 'bolt-1' || body.id === id)).toBe(false)
    documentStore.undo()
    expect(steps()).toBe(before)

    documentStore.deleteBodies(['bolt-1'], { leaveBroken: [id] })
    expect(documentStore.bodies.some((body) => body.id === 'bolt-1' || body.id === id)).toBe(false)
    expect(documentStore.raw.brokenSteps().map((step) => step.id)).toContain(id)
    expect(documentStore.undo().ok).toBe(true)
    expect(steps()).toBe(before)
    expect(documentStore.raw.entries.find((entry) => entry.record.id === id)?.leftBroken).toBeUndefined()
    expect(documentStore.bodies.some((body) => body.id === id)).toBe(true)
  })
})

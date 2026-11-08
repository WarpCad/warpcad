// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — FakeWorker duck-types only the slice of `Worker` the client uses.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import modeling from '@jscad/modeling'

import { setEvaluationWorkerFactory } from '../core/kernel/evaluationClient.js'
import { runEvaluationJob } from '../core/kernel/evaluationJob.js'
import { evaluate, policyFor } from '../core/kernel/index.js'
import { useDocumentStore } from './document.js'

const { geom3 } = modeling.geometries

/**
 * A whole multi-part model as a Subtract cutter (`TODO/core-079`).
 *
 * Measured on the owner's 29-part Feather 3MF: the cut blocked the main thread for 624 ms, and
 * most of that was the union of the 29 part solids into one cutter — which the evaluation
 * worker had already built, to measure the model's volume, and thrown away. Now the worker
 * hands that union back with the measurement, and the cut reuses it.
 *
 * {@link FakeWorker} is the boundary mock `bodyMeasurements.spec.js` uses: it answers only when
 * told to, running the real job on a structured clone of what was posted.
 */
class FakeWorker {
  constructor() {
    this.listeners = { message: [], error: [] }
    this.posted = []
  }

  addEventListener(type, listener) {
    this.listeners[type]?.push(listener)
  }

  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== listener)
  }

  terminate() {}

  postMessage(message) {
    this.posted.push(structuredClone(message))
  }

  answer(index) {
    const message = this.posted[index]
    const result = structuredClone(runEvaluationJob(message.job))
    for (const listener of this.listeners.message) {
      listener({ data: { id: message.id, channel: message.channel, generation: message.generation, ok: true, result } })
    }
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Parts in the Feather 3MF the finding was measured on. */
const PART_COUNT = 29

/**
 * A Feather-shaped 29-part model: a board and 28 components standing on it, in a 7 × 4 grid,
 * then grouped. The part records are unnamed, so the group is the only body they make.
 *
 * @returns {object[]}
 */
function featherRecords() {
  const records = [{ id: 'p0', op: 'primitive.cuboid', params: { size: [50.8, 22.9, 1.6], center: [0, 0, -1.2] } }]
  for (let k = 1; k < PART_COUNT; k += 1) {
    const x = -21 + (k % 7) * 7
    const y = -8 + Math.floor(k / 7) * 5
    const height = 1 + (k % 4)
    records.push(
      k % 2 === 0
        ? { id: `p${k}`, op: 'primitive.cylinder', params: { diameter: 2.4, height, center: [x, y, -0.4 + height / 2] } }
        : { id: `p${k}`, op: 'primitive.cuboid', params: { size: [4, 3, height], center: [x, y, -0.4 + height / 2] } },
    )
  }
  const ids = records.map((record) => record.id)
  records.push({
    id: 'feather',
    op: 'group.assemble',
    name: 'Feather',
    target: ids[0],
    operands: ids.slice(1),
    params: { names: ids.map((id) => `part ${id}`) },
  })
  return records
}

/** The plate the model is sunk into, so every part cuts it. */
const PLATE = { id: 'plate', op: 'primitive.cuboid', name: 'Plate', params: { size: [70, 40, 6], center: [0, 0, -3] } }

const CUT = { id: 'cut', op: 'boolean.subtract', name: 'Cut', target: 'plate', operands: ['feather'], consumes: ['plate', 'feather'] }

/**
 * @param {import('@jscad/modeling').geometries.geom3.Geom3} solid
 * @returns {number}
 */
function triangleCount(solid) {
  return geom3.toPolygons(solid).reduce((count, polygon) => count + polygon.vertices.length - 2, 0)
}

/**
 * The cut as it always was: the 29 parts unioned, then subtracted. Its own fold, so nothing is
 * shared, at the document's own resolution so the cylinders are faceted alike.
 *
 * @param {string} resolution
 */
function expectedCut(resolution) {
  const { byId } = evaluate([...featherRecords(), PLATE, CUT], { policy: policyFor(resolution) })
  return byId.get('cut')
}

describe('a whole multi-part model as the Subtract cutter (TODO/core-079)', () => {
  /** @type {FakeWorker} */
  let worker

  beforeEach(() => {
    setActivePinia(createPinia())
    worker = undefined
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
  })

  afterEach(() => {
    setEvaluationWorkerFactory(null)
    vi.restoreAllMocks()
  })

  it('reuses the union the worker built — no union of the 29 parts on the main thread', async () => {
    const doc = useDocumentStore()
    const expected = expectedCut(doc.raw.resolution())
    doc.appendAll([...featherRecords(), PLATE])
    // The model's volume needs its union, so the worker is asked to measure it.
    expect(worker.posted).toHaveLength(1)
    worker.answer(0)
    await flush()

    const union = vi.spyOn(modeling.booleans, 'union')
    doc.append(CUT)
    expect(union).not.toHaveBeenCalled()

    const cut = doc.raw.bodies().find((body) => body.id === 'cut').geometry
    expect(modeling.measurements.measureVolume(cut)).toBeCloseTo(modeling.measurements.measureVolume(expected), 6)
    expect(triangleCount(cut)).toBe(triangleCount(expected))
    // Not merely close: the cut does not depend on whether the worker answered first.
    expect(geom3.toPolygons(cut).map((polygon) => polygon.vertices)).toEqual(
      geom3.toPolygons(expected).map((polygon) => polygon.vertices),
    )
  })

  it('cuts the same before the worker has answered — the union is then built here, as before', () => {
    const doc = useDocumentStore()
    const expected = expectedCut(doc.raw.resolution())
    doc.appendAll([...featherRecords(), PLATE])
    doc.append(CUT)
    const cut = doc.raw.bodies().find((body) => body.id === 'cut').geometry
    expect(modeling.measurements.measureVolume(cut)).toBeCloseTo(modeling.measurements.measureVolume(expected), 6)
    expect(triangleCount(cut)).toBe(triangleCount(expected))
  })

  it('a second cut with the same model unions it once, not once per cut', () => {
    const doc = useDocumentStore()
    doc.appendAll([...featherRecords(), PLATE, { ...PLATE, id: 'plate2', name: 'Plate 2', params: { size: [70, 40, 6], center: [0, 0, -3] } }])
    const union = vi.spyOn(modeling.booleans, 'union')
    doc.append({ ...CUT, consumes: ['plate'] })
    const afterFirst = union.mock.calls.length
    doc.append({ id: 'cut2', op: 'boolean.subtract', name: 'Cut 2', target: 'plate2', operands: ['feather'], consumes: ['plate2'] })
    expect(union.mock.calls.length).toBe(afterFirst)
  })
})

describe('the whole-model cut runs in the evaluation worker (TODO/core-079)', () => {
  /** @type {FakeWorker} */
  let worker

  beforeEach(() => {
    setActivePinia(createPinia())
    worker = undefined
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
  })

  afterEach(() => {
    setEvaluationWorkerFactory(null)
    vi.restoreAllMocks()
  })

  it('sends the cut as a job, shows it pending, and lands it as one local step with no boolean here', async () => {
    const doc = useDocumentStore()
    const expected = expectedCut(doc.raw.resolution())
    doc.appendAll([...featherRecords(), PLATE])
    worker.answer(0) // the model's measurement
    await flush()

    const landed = doc.appendOperation(CUT, { origin: 'local' })
    // Nothing is cut yet: the job is with the worker, and the store says so.
    expect(doc.pendingOperation).toEqual({ id: 'cut', op: 'boolean.subtract' })
    expect(doc.raw.bodies().some((body) => body.id === 'cut')).toBe(false)
    const job = worker.posted.at(-1).job
    expect(job.kind).toBe('boolean')
    expect(job.op).toBe('boolean.subtract')

    worker.answer(worker.posted.length - 1) // the worker runs the union and the subtract
    // From here on is the main thread's share: unpack and commit, no kernel boolean.
    const subtract = vi.spyOn(modeling.booleans, 'subtract')
    const union = vi.spyOn(modeling.booleans, 'union')
    await landed
    expect(subtract).not.toHaveBeenCalled()
    expect(union).not.toHaveBeenCalled()
    expect(doc.pendingOperation).toBeNull()

    const cut = doc.raw.bodies().find((body) => body.id === 'cut').geometry
    expect(modeling.measurements.measureVolume(cut)).toBeCloseTo(modeling.measurements.measureVolume(expected), 6)
    expect(triangleCount(cut)).toBe(triangleCount(expected))
    expect(geom3.toPolygons(cut).map((polygon) => polygon.vertices)).toEqual(
      geom3.toPolygons(expected).map((polygon) => polygon.vertices),
    )
    // One undoable step, through the command layer like any other.
    expect(doc.canUndo).toBe(true)
    doc.undo()
    expect(doc.raw.bodies().some((body) => body.id === 'cut')).toBe(false)
    expect(doc.raw.bodies().some((body) => body.id === 'feather')).toBe(true)
  })

  it('a cut with plain solids only is not sent anywhere — there is no union to move', async () => {
    const doc = useDocumentStore()
    doc.appendAll([PLATE, { id: 'cube', op: 'primitive.cuboid', name: 'Cube', params: { size: [5, 5, 5], center: [0, 0, 0] } }])
    const posted = worker?.posted.length ?? 0
    await doc.appendOperation({ id: 'c', op: 'boolean.subtract', name: 'Cut', target: 'plate', operands: ['cube'], consumes: ['plate', 'cube'] })
    expect(worker?.posted.length ?? 0).toBe(posted)
    expect(doc.raw.bodies().some((body) => body.id === 'c')).toBe(true)
  })

  it('with no worker to be had, cuts on this thread at once — the fallback', async () => {
    setEvaluationWorkerFactory(() => {
      throw new Error('no workers here')
    })
    const doc = useDocumentStore()
    const expected = expectedCut(doc.raw.resolution())
    doc.appendAll([...featherRecords(), PLATE])
    const landed = doc.appendOperation(CUT)
    expect(doc.raw.bodies().some((body) => body.id === 'cut')).toBe(true)
    await landed
    const cut = doc.raw.bodies().find((body) => body.id === 'cut').geometry
    expect(triangleCount(cut)).toBe(triangleCount(expected))
  })

  it('a cut the kernel refuses rejects with the kernel\'s own message, and nothing is appended', async () => {
    const doc = useDocumentStore()
    doc.appendAll([...featherRecords(), PLATE])
    const landed = doc.appendOperation({ ...CUT, operands: [{ id: 'feather', pieces: 'no such part' }] })
    worker.answer(worker.posted.length - 1)
    await expect(landed).rejects.toThrow(/no part named "no such part"/)
    expect(doc.pendingOperation).toBeNull()
    expect(doc.raw.bodies().some((body) => body.id === 'cut')).toBe(false)
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — FakeWorker duck-types only the slice of `Worker` the client uses.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import modeling from '@jscad/modeling'

import { setEvaluationWorkerFactory } from '../core/kernel/evaluationClient.js'
import { runEvaluationJob } from '../core/kernel/evaluationJob.js'
import { measureGeometry } from '../core/kernel/measure.js'
import { useDocumentStore } from './document.js'

/**
 * The document store's body summaries, with the evaluation worker in the loop
 * (`TODO/core-029`).
 *
 * `core-029` measured `refresh()` re-unioning every composite body on every mutation —
 * 97-144 ms on the 24-body scene for a drag-place of one Cube. After it:
 *
 * - no summary runs a kernel union on the main thread;
 * - a composite's volume comes from the worker, identical to the synchronous value, and
 *   is `null` — "not measured yet" — until it lands, never a guess;
 * - an unchanged body is never sent again (the cache is keyed by geometry object);
 * - an older answer arriving late never overwrites a newer one.
 *
 * {@link FakeWorker} answers only when told to, running the real job on a structured
 * clone of what was posted.
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

const PI = { id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: {} }
const CUBE = { id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [200, 0, 5] } }

describe('body summaries with the evaluation worker (TODO/core-029)', () => {
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

  it('refresh() never unions a composite on the main thread', () => {
    const doc = useDocumentStore()
    doc.append(PI)
    const union = vi.spyOn(modeling.booleans, 'union')
    doc.refresh()
    expect(union).not.toHaveBeenCalled()
  })

  it('a composite\'s volume is pending, then lands from the worker identical to the synchronous value', async () => {
    const doc = useDocumentStore()
    doc.append(PI)
    const [pending] = doc.bodies
    expect(pending.volumeMm3).toBeNull()
    // The box is exact already — it needs no union (group.js's boundsOf).
    const expected = measureGeometry(doc.raw.bodies()[0].geometry)
    expect(pending.bounds).toEqual(expected.bounds)

    expect(worker.posted).toHaveLength(1)
    worker.answer(0)
    await flush()
    expect(doc.bodies[0].volumeMm3).toBe(expected.volumeMm3)
    expect(doc.bodies[0].bounds).toEqual(expected.bounds)
  })

  it('a bare solid is measured on the spot — there is no union to move', () => {
    const doc = useDocumentStore()
    doc.append(CUBE)
    expect(doc.bodies[0].volumeMm3).toBeCloseTo(1000, 6)
    expect(worker?.posted ?? []).toHaveLength(0)
  })

  it('an unchanged body is never sent to the worker again', async () => {
    const doc = useDocumentStore()
    doc.append(PI)
    worker.answer(0)
    await flush()
    doc.append(CUBE)
    doc.refresh()
    expect(worker.posted).toHaveLength(1)
    expect(doc.bodies.find((body) => body.id === 'pi').volumeMm3).toBeGreaterThan(0)
  })

  it('a late answer about an older state never overwrites the newer one', async () => {
    const doc = useDocumentStore()
    doc.append(PI)
    // Move it: a new geometry object, so a second request goes out.
    doc.append({ id: 'pi-moved', op: 'transform.translate', target: 'pi', supersedes: 'pi', params: { vector: [0, 0, 50] } })
    expect(worker.posted).toHaveLength(2)

    worker.answer(1)
    await flush()
    const landed = doc.bodies[0]
    expect(landed.volumeMm3).toBe(measureGeometry(doc.raw.bodies()[0].geometry).volumeMm3)

    worker.answer(0)
    await flush()
    expect(doc.bodies[0]).toBe(landed)
  })
})

describe('body summaries with no worker to be had', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setEvaluationWorkerFactory(() => {
      throw new Error('no workers here')
    })
  })

  afterEach(() => {
    setEvaluationWorkerFactory(null)
  })

  it('measures a composite synchronously, exactly as before core-029', () => {
    const doc = useDocumentStore()
    doc.append(PI)
    expect(doc.bodies[0].volumeMm3).toBe(measureGeometry(doc.raw.bodies()[0].geometry).volumeMm3)
  })
})

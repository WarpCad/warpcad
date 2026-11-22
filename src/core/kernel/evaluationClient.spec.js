// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — FakeWorker duck-types only the slice of `Worker` the client uses. The
// client itself is typechecked; this file mocks its boundary (CLAUDE.md, Conventions).
import { afterEach, describe, expect, it } from 'vitest'

import {
  createEvaluationChannel,
  evaluationWorkerAvailable,
  forgetWorkerGeometry,
  noteWorkerHolds,
  setEvaluationWorkerFactory,
  workerGeometryKey,
  workerHoldsGeometry,
} from './evaluationClient.js'
import { runEvaluationJob } from './evaluationJob.js'
import { evaluateOp } from './index.js'
import { measureGeometry } from './measure.js'
import { packGeometry, transferablesOf } from './transport.js'

/**
 * The evaluation worker's main-thread client (`TODO/core-029`).
 *
 * Nothing here constructs a real `Worker`: {@link FakeWorker} answers only when the test
 * says so (`answer(index)`), in whatever order the test chooses, running the **real**
 * {@link runEvaluationJob} on a structured clone of what was posted. That is what makes
 * the two properties `core-029` names testable at all:
 *
 * 1. results identical to the synchronous path — asserted on the measured numbers;
 * 2. a superseded request never lands after the one that replaced it — asserted by
 *    answering the newer request first and the older one afterwards.
 */
class FakeWorker {
  constructor(behaviour = {}) {
    if (behaviour.fail === 'construct') throw new Error('no worker here')
    this.listeners = { message: [], error: [] }
    this.posted = []
    this.transfers = []
    this.terminated = false
  }

  addEventListener(type, listener) {
    this.listeners[type]?.push(listener)
  }

  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== listener)
  }

  terminate() {
    this.terminated = true
  }

  emit(type, event) {
    for (const listener of [...(this.listeners[type] ?? [])]) listener(event)
  }

  postMessage(message, transfer = []) {
    // What a real postMessage does to the payload: clone it, handing over (detaching) whatever
    // the transfer list names (TODO/core-085).
    this.transfers.push(transfer)
    this.posted.push(structuredClone(message, { transfer }))
  }

  /** Answer the `index`-th posted request, running the real job. */
  answer(index) {
    const message = this.posted[index]
    const result = runEvaluationJob(message.job)
    this.emit('message', {
      data: { id: message.id, channel: message.channel, generation: message.generation, ok: true, result: structuredClone(result) },
    })
  }

  /** Answer the `index`-th request as the worker's own queue would: superseded, unrun. */
  supersede(index) {
    const message = this.posted[index]
    this.emit('message', { data: { id: message.id, channel: message.channel, generation: message.generation, superseded: true } })
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** @param {any} geometry */
const measureJob = (...geometries) => ({ kind: 'measure', bodies: geometries.map((geometry) => packGeometry(geometry)) })

afterEach(() => {
  setEvaluationWorkerFactory(null)
})

describe('evaluation client — identical results', () => {
  it('lands exactly what the synchronous path measures', async () => {
    let worker
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
    const pi = evaluateOp('raspberrypi.bplus', {})
    const bolt = evaluateOp('hardware.bolt', { spec: 'm10 hex', length: 30 })
    const channel = createEvaluationChannel('scene')

    const pending = channel.request(measureJob(pi, bolt))
    expect(evaluationWorkerAvailable()).toBe(true)
    worker.answer(0)
    const outcome = await pending

    expect(outcome.superseded).toBe(false)
    // A composite's answer also carries the union it was measured on (TODO/core-079).
    const { combined: piUnion, ...piMeasured } = outcome.result.measurements[0]
    const { combined: boltUnion, ...boltMeasured } = outcome.result.measurements[1]
    expect(piMeasured).toEqual(measureGeometry(pi))
    expect(boltMeasured).toEqual(measureGeometry(bolt))
    expect(piUnion?.kind).toBe('solid')
    expect(boltUnion?.kind).toBe('solid')
  })
})

describe('evaluation client — cancellation by generation', () => {
  it('a superseded request never lands after the one that replaced it', async () => {
    let worker
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
    const small = evaluateOp('primitive.cuboid', { size: [1, 1, 1] })
    const big = evaluateOp('primitive.cuboid', { size: [3, 3, 3] })
    const channel = createEvaluationChannel('scene')

    const older = channel.request(measureJob(small))
    const newer = channel.request(measureJob(big))
    // Out of order: the newer answer arrives first, the older one after it.
    worker.answer(1)
    worker.answer(0)

    const [olderOutcome, newerOutcome] = await Promise.all([older, newer])
    expect(newerOutcome.superseded).toBe(false)
    expect(newerOutcome.result.measurements[0].volumeMm3).toBeCloseTo(27, 9)
    expect(olderOutcome.superseded).toBe(true)
    expect(olderOutcome.result).toBeUndefined()
    expect(channel.landedGeneration()).toBe(2)
  })

  it('an older answer that arrives first still lands — the newest known state is shown meanwhile', async () => {
    let worker
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
    const channel = createEvaluationChannel('scene')
    const older = channel.request(measureJob(evaluateOp('primitive.cuboid', { size: [1, 1, 1] })))
    const newer = channel.request(measureJob(evaluateOp('primitive.cuboid', { size: [2, 2, 2] })))
    worker.answer(0)
    expect((await older).superseded).toBe(false)
    worker.answer(1)
    expect((await newer).superseded).toBe(false)
    expect(channel.landedGeneration()).toBe(2)
  })

  it('a request the worker dropped unrun resolves as superseded, never hangs', async () => {
    let worker
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
    const channel = createEvaluationChannel('scene')
    const older = channel.request(measureJob(evaluateOp('primitive.cuboid', { size: [1, 1, 1] })))
    channel.request(measureJob(evaluateOp('primitive.cuboid', { size: [2, 2, 2] })))
    worker.supersede(0)
    expect((await older).superseded).toBe(true)
  })

  it('channels are independent — a preview request never supersedes the live scene', async () => {
    let worker
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
    const scene = createEvaluationChannel('scene')
    const preview = createEvaluationChannel('preview')
    const live = scene.request(measureJob(evaluateOp('primitive.cuboid', { size: [1, 1, 1] })))
    preview.request(measureJob(evaluateOp('primitive.cuboid', { size: [2, 2, 2] })))
    worker.answer(1)
    worker.answer(0)
    expect((await live).superseded).toBe(false)
  })
})

describe('evaluation client — fallback', () => {
  it('with no worker to be had, runs the same job on this thread and still answers', async () => {
    setEvaluationWorkerFactory(() => new FakeWorker({ fail: 'construct' }))
    const pi = evaluateOp('raspberrypi.bplus', {})
    const channel = createEvaluationChannel('scene')
    const outcome = await channel.request(measureJob(pi))
    expect(evaluationWorkerAvailable()).toBe(false)
    expect(outcome.superseded).toBe(false)
    const { combined, ...measured } = outcome.result.measurements[0]
    expect(measured).toEqual(measureGeometry(pi))
    expect(combined?.kind).toBe('solid')
  })

  it('a worker that dies mid-request answers its outstanding work on this thread instead', async () => {
    let worker
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
    const cube = evaluateOp('primitive.cuboid', { size: [2, 2, 2] })
    const channel = createEvaluationChannel('scene')
    const pending = channel.request(measureJob(cube))
    worker.emit('error', new Error('module failed to load'))
    const outcome = await pending
    expect(outcome.superseded).toBe(false)
    expect(outcome.result.measurements[0].volumeMm3).toBeCloseTo(8, 9)
    expect(evaluationWorkerAvailable()).toBe(false)
    expect(worker.terminated).toBe(true)
    await settle()
  })
})

describe('evaluation client — transfer lists (TODO/core-085)', () => {
  const booleanJob = () => ({
    kind: 'boolean',
    op: 'boolean.subtract',
    operands: [
      packGeometry(evaluateOp('primitive.cuboid', { size: [10, 10, 10] }), { planes: true }),
      packGeometry(evaluateOp('primitive.cuboid', { size: [4, 4, 20] }), { planes: true }),
    ],
    pieces: [undefined, undefined],
  })

  it('hands a job\'s buffers to the worker instead of cloning them, when the caller asks', async () => {
    let worker
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
    const job = booleanJob()
    const buffers = transferablesOf(job.operands)
    const pending = createEvaluationChannel('operation').request(job, { transfer: true })
    expect(buffers.length).toBeGreaterThan(0)
    expect(worker.transfers[0]).toEqual(buffers)
    expect(job.operands[0].polygons.positions.byteLength).toBe(0)
    worker.answer(0)
    const outcome = await pending
    expect(outcome.superseded).toBe(false)
    expect(outcome.result.geometry.polygons.positions.length).toBeGreaterThan(0)
  })

  it('transfers nothing by default, so a caller may post the same packed body again (the Split sheet does)', async () => {
    let worker
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
    const job = booleanJob()
    const pending = createEvaluationChannel('operation').request(job)
    expect(worker.transfers[0]).toEqual([])
    expect(job.operands[0].polygons.positions.byteLength).toBeGreaterThan(0)
    worker.answer(0)
    await pending
  })

  it('a worker that dies after a transfer redoes the job here from a fresh pack, never from the detached one', async () => {
    let worker
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
    const channel = createEvaluationChannel('operation')
    let repacked = 0
    const pending = channel.request(booleanJob(), { transfer: true, repack: () => ((repacked += 1), booleanJob()) })
    worker.emit('error', new Error('worker crashed'))
    const outcome = await pending
    expect(repacked).toBe(1)
    expect(outcome.superseded).toBe(false)
    expect(outcome.result.error).toBeUndefined()
    // 10 mm cube less a 4 x 4 mm column through it.
    const { unpackGeometry } = await import('./transport.js')
    const { measureGeometry: measure } = await import('./measure.js')
    expect(measure(unpackGeometry(outcome.result.geometry)).volumeMm3).toBeCloseTo(1000 - 160, 6)
  })

  it('a worker that dies after a transfer with no way to repack resolves superseded, so the caller builds it itself', async () => {
    let worker
    setEvaluationWorkerFactory(() => (worker = new FakeWorker()))
    const pending = createEvaluationChannel('operation').request(booleanJob(), { transfer: true })
    worker.emit('error', new Error('worker crashed'))
    expect((await pending).superseded).toBe(true)
  })

  it('answers on this thread with the buffers intact when there is no worker', async () => {
    setEvaluationWorkerFactory(() => new FakeWorker({ fail: 'construct' }))
    const job = booleanJob()
    const outcome = await createEvaluationChannel('operation').request(job, { transfer: true })
    expect(outcome.superseded).toBe(false)
    expect(outcome.result.error).toBeUndefined()
    expect(job.operands[0].polygons.positions.byteLength).toBeGreaterThan(0)
  })
})

describe('evaluation client — what the worker holds (TODO/core-086)', () => {
  it('names a geometry by identity: the same value the same key, any other value a new one', () => {
    const a = evaluateOp('primitive.cuboid', { size: [1, 1, 1] })
    const b = evaluateOp('primitive.cuboid', { size: [1, 1, 1] })
    expect(workerGeometryKey(a)).toBe(workerGeometryKey(a))
    expect(workerGeometryKey(b)).not.toBe(workerGeometryKey(a))
  })

  it('believes the worker holds a key only after being told, and never of a key it was not told of', () => {
    setEvaluationWorkerFactory(() => new FakeWorker())
    noteWorkerHolds(['k1'])
    expect(workerHoldsGeometry('k1')).toBe(true)
    expect(workerHoldsGeometry('k2')).toBe(false)
  })

  it('forgets every key, and tells the live worker to drop its cache, when asked (a different document opened)', () => {
    let made
    setEvaluationWorkerFactory(() => (made = new FakeWorker()))
    expect(evaluationWorkerAvailable()).toBe(true)
    noteWorkerHolds(['k1'])
    forgetWorkerGeometry()
    expect(workerHoldsGeometry('k1')).toBe(false)
    expect(made.posted).toEqual([{ forget: true }])
  })

  it('forgets every key when the worker is replaced or dies, since a new worker holds nothing', () => {
    setEvaluationWorkerFactory(() => new FakeWorker())
    noteWorkerHolds(['k1'])
    setEvaluationWorkerFactory(() => new FakeWorker())
    expect(workerHoldsGeometry('k1')).toBe(false)
    let made
    setEvaluationWorkerFactory(() => (made = new FakeWorker()))
    expect(evaluationWorkerAvailable()).toBe(true)
    noteWorkerHolds(['k2'])
    made.emit('error', {})
    expect(workerHoldsGeometry('k2')).toBe(false)
  })

  it('says nothing when there is no worker to tell', () => {
    setEvaluationWorkerFactory(() => {
      throw new Error('no worker here')
    })
    expect(() => forgetWorkerGeometry()).not.toThrow()
  })
})

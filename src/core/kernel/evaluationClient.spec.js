// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — FakeWorker duck-types only the slice of `Worker` the client uses. The
// client itself is typechecked; this file mocks its boundary (CLAUDE.md, Conventions).
import { afterEach, describe, expect, it } from 'vitest'

import {
  createEvaluationChannel,
  evaluationWorkerAvailable,
  setEvaluationWorkerFactory,
} from './evaluationClient.js'
import { runEvaluationJob } from './evaluationJob.js'
import { evaluateOp } from './index.js'
import { measureGeometry } from './measure.js'
import { packGeometry } from './transport.js'

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

  postMessage(message) {
    // What a real postMessage does to the payload.
    this.posted.push(structuredClone(message))
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
    expect(outcome.result.measurements[0]).toEqual(measureGeometry(pi))
    expect(outcome.result.measurements[1]).toEqual(measureGeometry(bolt))
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
    expect(outcome.result.measurements[0]).toEqual(measureGeometry(pi))
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

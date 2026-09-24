import { describe, expect, it } from 'vitest'

import { evaluate, evaluateOp } from './index.js'
import { createLatestOnlyQueue, runEvaluationJob } from './evaluationJob.js'
import { measureGeometry } from './measure.js'
import { packGeometry } from './transport.js'

/**
 * The evaluation worker's job function (`TODO/core-029`), tested with no `Worker` at all.
 *
 * What runs inside `evaluation.worker.js` is exactly {@link runEvaluationJob}; the worker
 * file only owns the message protocol. So the property that matters — **the worker's
 * answer is identical to the main thread's** — is asserted here, against geometry that
 * really crossed the transport format, with `toEqual`/`toBe` rather than a tolerance.
 */

/** Real bodies of every kind the app places: a primitive, a boolean result, two composites. */
function realBodies() {
  const { byId } = evaluate([
    { id: 'cube', op: 'primitive.cuboid', params: { size: [40, 40, 40], center: [-95, 75, 20] } },
    { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 40, height: 50, center: [-100.89, 66.93, 25] } },
    { id: 'union', op: 'boolean.union', target: 'cyl', operands: ['cube'] },
  ])
  return [
    byId.get('cube'),
    byId.get('union'),
    evaluateOp('hardware.bolt', { spec: 'm10 hex', length: 30 }),
    evaluateOp('raspberrypi.bplus', {}),
  ].map((geometry) => /** @type {any} */ (geometry))
}

describe('runEvaluationJob — measure', () => {
  it('answers exactly what measureGeometry answers on the main thread, body for body', () => {
    const bodies = realBodies()
    const result = runEvaluationJob({
      kind: 'measure',
      bodies: structuredClone(bodies.map((geometry) => packGeometry(geometry))),
    })
    expect(result.kind).toBe('measure')
    expect(result.measurements).toHaveLength(bodies.length)
    bodies.forEach((geometry, index) => {
      const expected = measureGeometry(geometry)
      const actual = result.measurements[index]
      expect(actual.error).toBeUndefined()
      expect(actual.volumeMm3).toBe(expected.volumeMm3)
      expect(actual.bounds).toEqual(expected.bounds)
    })
  })

  it('reports a body it cannot measure by index, and still measures the rest', () => {
    const cube = /** @type {any} */ (evaluateOp('primitive.cuboid', { size: [2, 2, 2] }))
    const result = runEvaluationJob({
      kind: 'measure',
      // A group with no visible parts: combine() refuses it, on either thread.
      bodies: [{ kind: 'group', name: 'empty', names: [], parts: {}, holes: [] }, packGeometry(cube)],
    })
    expect(result.measurements[0].error).toMatch(/no pieces to combine/)
    expect(result.measurements[1].volumeMm3).toBeCloseTo(8, 9)
  })

  it('refuses a job kind it does not know, by name', () => {
    expect(() => runEvaluationJob(/** @type {any} */ ({ kind: 'teleport' }))).toThrow(/teleport/)
  })
})

describe('createLatestOnlyQueue — what the worker does with work that was superseded before it started', () => {
  it('keeps only the newest request per channel and hands back the one it dropped', () => {
    const queue = createLatestOnlyQueue()
    expect(queue.enqueue({ id: 1, channel: 'scene', generation: 1 })).toBeNull()
    const dropped = queue.enqueue({ id: 2, channel: 'scene', generation: 2 })
    expect(dropped?.id).toBe(1)
    expect(queue.take()?.id).toBe(2)
    expect(queue.take()).toBeUndefined()
  })

  it('never lets an older generation displace a newer one that is already queued', () => {
    const queue = createLatestOnlyQueue()
    queue.enqueue({ id: 5, channel: 'scene', generation: 5 })
    const dropped = queue.enqueue({ id: 4, channel: 'scene', generation: 4 })
    expect(dropped?.id).toBe(4)
    expect(queue.take()?.id).toBe(5)
  })

  it('keeps channels independent — a preview never cancels the live scene', () => {
    const queue = createLatestOnlyQueue()
    queue.enqueue({ id: 1, channel: 'scene', generation: 1 })
    expect(queue.enqueue({ id: 2, channel: 'preview', generation: 1 })).toBeNull()
    const taken = [queue.take()?.id, queue.take()?.id]
    expect(taken.sort()).toEqual([1, 2])
  })
})

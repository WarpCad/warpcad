// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { combine } from './group.js'
import { evaluate, evaluateOp } from './index.js'
import { createLatestOnlyQueue, runEvaluationJob } from './evaluationJob.js'
import { measureGeometry } from './measure.js'
import { packGeometry, unpackGeometry } from './transport.js'

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
    const result = /** @type {any} */ (runEvaluationJob({
      kind: 'measure',
      bodies: structuredClone(bodies.map((geometry) => packGeometry(geometry))),
    }))
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
    const result = /** @type {any} */ (runEvaluationJob({
      kind: 'measure',
      // A group with no visible parts: combine() refuses it, on either thread.
      bodies: [{ kind: 'group', name: 'empty', names: [], parts: {}, holes: [] }, packGeometry(cube)],
    }))
    expect(result.measurements[0].error).toMatch(/no pieces to combine/)
    expect(result.measurements[1].volumeMm3).toBeCloseTo(8, 9)
  })

  it('refuses a job kind it does not know, by name', () => {
    expect(() => runEvaluationJob(/** @type {any} */ ({ kind: 'teleport' }))).toThrow(/teleport/)
  })

  // TODO/core-079: a composite's volume needs its union, so the worker hands the union back
  // rather than throw it away — the main thread then never builds it for a cut.
  it('hands back the union it built for a composite, identical to the main thread\'s', () => {
    const pi = /** @type {any} */ (evaluateOp('raspberrypi.bplus', {}))
    const cube = /** @type {any} */ (evaluateOp('primitive.cuboid', { size: [2, 2, 2] }))
    const result = /** @type {any} */ (runEvaluationJob({
      kind: 'measure',
      // With planes, as the document store sends it: the Pi's parts are boolean results, and
      // their cached planes are what the main thread's own union would read.
      bodies: structuredClone([packGeometry(pi, { planes: true }), packGeometry(cube, { planes: true })]),
    }))
    const combined = unpackGeometry(structuredClone(result.measurements[0].combined))
    const expected = modeling.geometries.geom3.toPolygons(combine(pi))
    const actual = modeling.geometries.geom3.toPolygons(/** @type {any} */ (combined))
    expect(actual.map((polygon) => polygon.vertices)).toEqual(expected.map((polygon) => polygon.vertices))
    // Planes too: JSCAD reads a polygon's cached plane, and one recomputed from the corners
    // differs in the 13th digit — enough to move a later cut's vertices.
    expect(actual.map((polygon) => modeling.geometries.poly3.plane(polygon))).toEqual(
      expected.map((polygon) => modeling.geometries.poly3.plane(polygon)),
    )
    // A bare solid is its own union: nothing to hand back.
    expect(result.measurements[1].combined).toBeUndefined()
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

describe('runEvaluationJob — build (TODO/sketch-001: the sketch editor’s preview)', () => {
  const params = {
    center: [0, 0, 0],
    slices: [{ id: 's1', zMm: 0, profiles: [{ id: 'p', kind: 'circle', role: 'solid', centerMm: [0, 0], radiusMm: 10 }] }],
    extrusion: { method: 'linear', heightMm: 5, twistDeg: 0, twistSteps: 1 },
  }

  it('builds one op off the main thread and hands back packed geometry the main thread can read', async () => {
    const { unpackGeometry } = await import('./transport.js')
    const result = /** @type {any} */ (runEvaluationJob({ kind: 'build', op: 'primitive.sketch', params: structuredClone(params), resolution: 'normal' }))
    expect(result.kind).toBe('build')
    expect(result.error).toBeUndefined()
    const geometry = unpackGeometry(/** @type {any} */ (result.geometry))
    const expected = evaluateOp('primitive.sketch', params, { policy: (await import('./index.js')).policyFor('normal') })
    expect(measureGeometry(/** @type {any} */ (geometry)).volumeMm3).toBeCloseTo(
      measureGeometry(/** @type {any} */ (expected)).volumeMm3,
      9,
    )
  })

  it('answers a build the kernel refuses with its reason instead of throwing', () => {
    const result = /** @type {any} */ (runEvaluationJob({
      kind: 'build',
      op: 'primitive.sketch',
      params: { ...params, slices: [{ id: 's1', zMm: 0, profiles: [] }] },
      resolution: 'normal',
    }))
    expect(result.geometry).toBeUndefined()
    expect(result.error).toMatch(/closed solid outline/)
  })
})

describe('runEvaluationJob splitFace (TODO/ui-067)', () => {
  it('answers what previewSplitFace answers, for geometry that crossed the transport format', async () => {
    const modeling = (await import('@jscad/modeling')).default
    const { previewSplitFace } = await import('./split.js')
    const body = modeling.primitives.cuboid({ size: [300, 40, 20], center: [150, 0, 0] })
    const params = { axis: 'x', offsetMm: 150, seed: 'pins', placements: [{ kind: 'pins', uMm: 0, vMm: 0, sizeMm: 3 }] }
    const result = /** @type {any} */ (runEvaluationJob({ kind: 'splitFace', body: packGeometry(body), params }))
    expect(result.kind).toBe('splitFace')
    expect(result.face).toEqual(previewSplitFace(body, /** @type {any} */ (params)))
  })

  it('answers a refused cut with its reason instead of throwing', async () => {
    const modeling = (await import('@jscad/modeling')).default
    const body = modeling.primitives.cuboid({ size: [300, 40, 20], center: [150, 0, 0] })
    const result = /** @type {any} */ (
      runEvaluationJob({ kind: 'splitFace', body: packGeometry(body), params: { axis: 'x', offsetMm: 999 } })
    )
    expect(result.face).toBeUndefined()
    expect(result.error).toMatch(/outside the body/)
  })
})

describe('runEvaluationJob — boolean (TODO/core-079: a whole multi-part model as the cutter)', () => {
  const PLATE = { id: 'plate', op: 'primitive.cuboid', params: { size: [90, 60, 6], center: [30, 25, 0] } }

  /**
   * The plate cut by the Pi on this thread — the fold's own path, the answer to match.
   *
   * @param {string | { id: string, pieces: string }} cutter
   */
  function cutHere(cutter) {
    const { byId } = evaluate([PLATE, { id: 'pi', op: 'raspberrypi.bplus', params: {} }, { id: 'cut', op: 'boolean.subtract', target: 'plate', operands: [cutter] }])
    return /** @type {any} */ (byId.get('cut'))
  }

  it('cuts in the worker exactly what the fold cuts here, union of the composite included', () => {
    const plate = /** @type {any} */ (evaluateOp(PLATE.op, PLATE.params))
    const pi = /** @type {any} */ (evaluateOp('raspberrypi.bplus', {}))
    const result = /** @type {any} */ (runEvaluationJob(structuredClone({
      kind: 'boolean',
      op: 'boolean.subtract',
      operands: [packGeometry(plate, { planes: true }), packGeometry(pi, { planes: true })],
      pieces: [undefined, undefined],
    })))
    expect(result.kind).toBe('boolean')
    expect(result.error).toBeUndefined()
    const cut = /** @type {any} */ (unpackGeometry(structuredClone(result.geometry)))
    const expected = cutHere('pi')
    const { geom3 } = modeling.geometries
    expect(geom3.toPolygons(cut).map((polygon) => polygon.vertices)).toEqual(geom3.toPolygons(expected).map((polygon) => polygon.vertices))
    expect(modeling.measurements.measureVolume(cut)).toBeCloseTo(modeling.measurements.measureVolume(expected), 9)
  })

  it('honours a pieces address, and reports a bad one as the kernel words it', () => {
    const plate = /** @type {any} */ (evaluateOp(PLATE.op, PLATE.params))
    const pi = /** @type {any} */ (evaluateOp('raspberrypi.bplus', {}))
    const part = /** @type {string} */ (Object.keys(pi.parts).find((name) => pi.names.includes(name)))
    /** @param {string} pieces */
    const job = (pieces) => /** @type {any} */ (structuredClone({
      kind: 'boolean',
      op: 'boolean.subtract',
      operands: [packGeometry(plate, { planes: true }), packGeometry(pi, { planes: true })],
      pieces: [undefined, pieces],
    }))
    const one = /** @type {any} */ (runEvaluationJob(job(part)))
    const expected = cutHere({ id: 'pi', pieces: part })
    expect(modeling.measurements.measureVolume(/** @type {any} */ (unpackGeometry(one.geometry)))).toBeCloseTo(modeling.measurements.measureVolume(expected), 9)
    const bad = /** @type {any} */ (runEvaluationJob(job('nope')))
    expect(bad.geometry).toBeUndefined()
    expect(bad.error).toMatch(/no part named "nope"/)
  })

  it('refuses an op that is not a boolean', () => {
    const cube = packGeometry(/** @type {any} */ (evaluateOp('primitive.cuboid', { size: [2, 2, 2] })))
    const result = /** @type {any} */ (runEvaluationJob({ kind: 'boolean', op: 'transform.translate', operands: [cube], pieces: [undefined] }))
    expect(result.error).toMatch(/not a boolean/)
  })
})

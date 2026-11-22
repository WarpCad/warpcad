// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The evaluation worker's job, as pure functions (`TODO/core-029`).
 *
 * This is everything that runs inside `./evaluation.worker.js`, kept out of the worker
 * file so it can be unit-tested — and run as the fallback — with no `Worker` involved.
 * The worker file itself only owns the message protocol, exactly as
 * `src/core/export.worker.js` does for `src/core/exportJob.js`.
 *
 * ## One RPC, several job kinds
 *
 * `core-029`'s decision (`docs/decisions/kernel-evaluation-worker.md`) is **one**
 * evaluation RPC that kernel work goes through, not a separate worker per feature. So a
 * request carries a `kind`, and this module dispatches on it. The first kind is
 * `measure` — the per-body volume the UI reads after every mutation, which needs a
 * kernel union for any composite body and was the largest measured block of kernel
 * work on the main thread. Moving the document fold itself is the next kind, filed as
 * its own task with the numbers that justify it.
 *
 * ## Same function on both sides
 *
 * A `measure` job calls {@link measureGeometry} — the very function the main thread's
 * fallback calls — on geometry that crossed `./transport.js`. There is no second
 * implementation to drift (the failure `io-004`/`io-005` were both about), and
 * `evaluationJob.spec.js` asserts the answers are identical, not merely close.
 *
 * @module core/kernel/evaluationJob
 */

import { cachedCombinedOf, createGroup, isGroup } from './group.js'
import { evaluate, evaluateOp, policyFor, PREBUILT_BOOLEAN_OPS } from './index.js'
import { measureGeometry } from './measure.js'
import { previewSplitFace } from './split.js'
import { packGeometry, transferablesOf, unpackGeometry } from './transport.js'

/** @typedef {import('./transport.js').PackedGeometry} PackedGeometry */
/** @typedef {import('./group.js').BoundsMm} BoundsMm */

/**
 * @typedef {object} MeasureJob
 * @property {'measure'} kind
 * @property {PackedGeometry[]} bodies One entry per body, in the caller's order.
 * @property {(string | undefined)[]} [keys] Index-aligned with `bodies` (`TODO/core-086`): the key the
 *   page gave each, under which the worker keeps what it unpacked, so a later cut names the body
 *   instead of being sent it again. Keys are minted by the page for geometry the page produced.
 */

/**
 * One body's answer: its measurement, or why it could not be measured. Reported per
 * body, so one unmeasurable body never costs the others their numbers.
 *
 * @typedef {object} MeasureOutcome
 * @property {BoundsMm} [bounds]
 * @property {number} [volumeMm3]
 * @property {PackedGeometry} [combined] The composite's union the volume was measured on
 *   (`TODO/core-079`), planes included so it unpacks bit-identical; absent for a bare solid or
 *   a one-part group, whose union is itself.
 * @property {string} [error]
 */

/**
 * @typedef {object} MeasureResult
 * @property {'measure'} kind
 * @property {MeasureOutcome[]} measurements Index-aligned with the job's `bodies`.
 */

/**
 * Build one op from params, off the main thread (`TODO/sketch-001`): the sketch editor's
 * live extrusion preview. Nothing is appended — the answer is drawn and thrown away, and a
 * newer request on the same channel supersedes an older one rather than queueing behind it.
 *
 * @typedef {object} BuildJob
 * @property {'build'} kind
 * @property {string} op
 * @property {Record<string, any>} params Plain JSON.
 * @property {string} resolution The design resolution to facet curves at.
 */

/**
 * @typedef {object} BuildResult
 * @property {'build'} kind
 * @property {PackedGeometry} [geometry] Present when the op built.
 * @property {string} [error] The kernel's reason when it did not.
 */

/**
 * The Split sheet's Place connectors overlay (`TODO/ui-067`): the cut face's clearance
 * field, the joint the search would place, and a verdict per hand placement — see
 * `previewSplitFace`. Its own channel, so a drag's live validation supersedes itself.
 *
 * @typedef {object} SplitFaceJob
 * @property {'splitFace'} kind
 * @property {PackedGeometry} body The uncut body.
 * @property {Record<string, any>} params `previewSplitFace`'s params, plain JSON.
 */

/**
 * @typedef {object} SplitFaceResult
 * @property {'splitFace'} kind
 * @property {import('./split.js').FacePreview} [face] Present when the cut could be previewed.
 * @property {string} [error] The kernel's reason when it could not.
 */

/**
 * A Union, Subtract or Intersect over operands that crossed the boundary (`TODO/core-079`): a
 * whole multi-part model as the cutter took 624 ms on the main thread, most of it the union of
 * its 29 parts. The worker runs **the fold itself** on a one-record document, so `pieces`
 * addressing, the union and the boolean are the very code the main thread would run.
 * @typedef {object} BooleanJob
 * @property {'boolean'} kind
 * @property {string} op One of `PREBUILT_BOOLEAN_OPS`.
 * @property {(PackedGeometry | CachedOperand)[]} operands Target first, packed with planes, or named
 *   when the worker already holds it (`TODO/core-086`).
 * @property {(string | undefined)[]} pieces Each operand's `pieces` address.
 * @property {(string | undefined)[]} [keys] Index-aligned with `operands`: the key to keep each packed
 *   operand under. Ignored for a named operand, which is already kept.
 */

/**
 * An operand the worker is asked to take from its own cache (`TODO/core-086`).
 * @typedef {object} CachedOperand
 * @property {string} cached The key a measure or boolean job stored it under.
 */

/**
 * @typedef {object} BooleanResult
 * @property {'boolean'} kind
 * @property {PackedGeometry} [geometry] The result, packed with planes, when it built.
 * @property {string[]} [missing] The keys of named operands the worker no longer holds (evicted, or
 *   never sent); nothing was built, and the caller sends those operands whole (`TODO/core-086`).
 * @property {string} [error] The kernel's reason when it did not.
 */

/** @typedef {MeasureJob | BuildJob | SplitFaceJob | BooleanJob} EvaluationJob */
/** @typedef {MeasureResult | BuildResult | SplitFaceResult | BooleanResult} EvaluationResult */

/**
 * The geometry the worker keeps between jobs (`TODO/core-086`): what it unpacked for a measure or a
 * boolean job, under the key the page named it by, least recently used out first.
 *
 * It holds **geometry the page produced and nothing from a loaded file's text** (the trust rule of
 * `docs/decisions/ai-partner.md`): a key is minted on the main thread for a value it built, and the
 * entry is a solid or group unpacked from typed arrays. Keeping the unpacked group, not just its
 * triangles, is the point: the union a measure job built to find the volume hangs off that very
 * object (`cachedCombinedOf`), so the cut that follows does not build it again.
 *
 * A bounded count, not a size, because a body is one entry whether it is a bolt or a 25-part model;
 * the dense case the cache is for is two or three entries.
 *
 * @param {number} [limit] Most entries held.
 * @returns {GeometryCache}
 */
export function createGeometryCache(limit = 8) {
  /** @type {Map<string, any>} */
  const entries = new Map()
  return {
    get(key) {
      const found = entries.get(key)
      if (found === undefined) return undefined
      entries.delete(key)
      entries.set(key, found)
      return found
    },
    set(key, geometry) {
      entries.delete(key)
      entries.set(key, geometry)
      while (entries.size > limit) entries.delete(/** @type {string} */ (entries.keys().next().value))
    },
    clear() {
      entries.clear()
    },
  }
}

/**
 * @typedef {object} GeometryCache
 * @property {(key: string) => any} get The geometry held under `key` (counting as a use), or `undefined`.
 * @property {(key: string, geometry: any) => void} set
 * @property {() => void} clear
 */

/**
 * Run one evaluation job.
 *
 * @param {EvaluationJob} job
 * @param {GeometryCache} [cache] What the worker keeps between jobs. The main-thread fallback passes
 *   none: it runs only jobs packed whole, and a named operand then comes back `missing`.
 * @returns {EvaluationResult}
 * @throws {Error} For a job kind this build does not know — a programming error, so loud.
 */
export function runEvaluationJob(job, cache) {
  if (job?.kind === 'measure') {
    return {
      kind: 'measure',
      measurements: job.bodies.map((packed, index) => {
        try {
          const geometry = unpackGeometry(packed)
          const key = job.keys?.[index]
          if (cache !== undefined && key !== undefined) cache.set(key, geometry)
          const measured = measureGeometry(geometry)
          // TODO/core-079: the volume needed the composite's union, so hand it back — the main
          // thread then cuts with it rather than union a 29-part model again. A group whose
          // union is just its one part has nothing worth the trip.
          if (!isGroup(geometry) || (geometry.names.length < 2 && geometry.holes.length === 0)) return measured
          const combined = cachedCombinedOf(geometry)
          return combined === undefined ? measured : { ...measured, combined: packGeometry(combined, { planes: true }) }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      }),
    }
  }
  if (job?.kind === 'build') {
    try {
      const geometry = evaluateOp(job.op, job.params, { policy: policyFor(job.resolution) })
      return { kind: 'build', geometry: packGeometry(/** @type {any} */ (geometry)) }
    } catch (error) {
      return { kind: 'build', error: error instanceof Error ? error.message : String(error) }
    }
  }
  if (job?.kind === 'splitFace') {
    try {
      return { kind: 'splitFace', face: previewSplitFace(unpackGeometry(job.body), /** @type {any} */ (job.params)) }
    } catch (error) {
      return { kind: 'splitFace', error: error instanceof Error ? error.message : String(error) }
    }
  }
  if (job?.kind === 'boolean') {
    try {
      if (!PREBUILT_BOOLEAN_OPS.includes(job.op)) throw new Error(`"${job.op}" is not a boolean op`)
      const missing = job.operands.flatMap((operand) => ('cached' in operand && cache?.get(operand.cached) === undefined ? [operand.cached] : []))
      if (missing.length > 0) return { kind: 'boolean', missing }
      /** @type {Map<string, any>} */
      const byId = new Map(
        job.operands.map((operand, index) => {
          if ('cached' in operand) return [`operand${index}`, cache?.get(operand.cached)]
          const geometry = unpackGeometry(operand)
          const key = job.keys?.[index]
          if (cache !== undefined && key !== undefined) cache.set(key, geometry)
          return [`operand${index}`, geometry]
        })
      )
      const refs = job.operands.map((_, index) => {
        const pieces = job.pieces?.[index]
        return pieces === undefined ? `operand${index}` : { id: `operand${index}`, pieces }
      })
      const folded = evaluate([{ id: 'result', op: job.op, target: refs[0], operands: refs.slice(1) }], {
        initial: { byId, group: createGroup('') },
      })
      return { kind: 'boolean', geometry: packGeometry(/** @type {any} */ (folded.byId.get('result')), { planes: true }) }
    } catch (error) {
      return { kind: 'boolean', error: error instanceof Error ? error.message : String(error) }
    }
  }
  throw new Error(`evaluation job: unknown kind "${/** @type {any} */ (job)?.kind}"`)
}

/**
 * The buffers a result can hand back instead of copying (`TODO/core-085`): the packed geometry
 * it carries — a boolean's result, a build's solid, a measure job's composite unions. The worker
 * builds each result for the one message that carries it, so it can always transfer them. A
 * split preview's answer is plain numbers and has none.
 *
 * @param {EvaluationResult} result
 * @returns {ArrayBuffer[]}
 */
export function resultTransferables(result) {
  if (result?.kind === 'boolean' || result?.kind === 'build') return transferablesOf(result.geometry)
  if (result?.kind === 'measure') return transferablesOf(result.measurements.map((entry) => entry.combined))
  return []
}

/**
 * @typedef {object} QueuedRequest
 * @property {number} id
 * @property {string} channel
 * @property {number} generation
 */

/**
 * The worker's queue: at most one waiting request per channel, always the newest.
 *
 * `CLAUDE.md`'s Performance rule is "a superseded rebuild is cancelled rather than
 * awaited". A worker cannot interrupt a job it is already running, but it can refuse to
 * *start* one that has been overtaken: requests that arrive while a job runs wait in the
 * event loop, and by the time the worker gets to them only the newest per channel is
 * still worth doing. Channels are independent, so a timeline preview never cancels the
 * live scene's work or the other way round.
 *
 * @template {QueuedRequest} T
 * @returns {{ enqueue: (request: T) => T | null, take: () => T | undefined }}
 *   `enqueue` returns whichever request it dropped (to be answered "superseded"), or
 *   `null`; `take` removes and returns the next request to run.
 */
export function createLatestOnlyQueue() {
  /** @type {Map<string, T>} */
  const waiting = new Map()
  return {
    enqueue(request) {
      const queued = waiting.get(request.channel)
      if (!queued) {
        waiting.set(request.channel, request)
        return null
      }
      if (request.generation >= queued.generation) {
        waiting.set(request.channel, request)
        return queued
      }
      return request
    },
    take() {
      const next = waiting.entries().next()
      if (next.done) return undefined
      waiting.delete(next.value[0])
      return next.value[1]
    },
  }
}

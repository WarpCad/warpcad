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

import { evaluateOp, policyFor } from './index.js'
import { measureGeometry } from './measure.js'
import { packGeometry, unpackGeometry } from './transport.js'

/** @typedef {import('./transport.js').PackedGeometry} PackedGeometry */
/** @typedef {import('./group.js').BoundsMm} BoundsMm */

/**
 * @typedef {object} MeasureJob
 * @property {'measure'} kind
 * @property {PackedGeometry[]} bodies One entry per body, in the caller's order.
 */

/**
 * One body's answer: its measurement, or why it could not be measured. Reported per
 * body, so one unmeasurable body never costs the others their numbers.
 *
 * @typedef {object} MeasureOutcome
 * @property {BoundsMm} [bounds]
 * @property {number} [volumeMm3]
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

/** @typedef {MeasureJob | BuildJob} EvaluationJob */
/** @typedef {MeasureResult | BuildResult} EvaluationResult */

/**
 * Run one evaluation job.
 *
 * @param {EvaluationJob} job
 * @returns {EvaluationResult}
 * @throws {Error} For a job kind this build does not know — a programming error, so loud.
 */
export function runEvaluationJob(job) {
  if (job?.kind === 'measure') {
    return {
      kind: 'measure',
      measurements: job.bodies.map((packed) => {
        try {
          return measureGeometry(unpackGeometry(packed))
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
  throw new Error(`evaluation job: unknown kind "${/** @type {any} */ (job)?.kind}"`)
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

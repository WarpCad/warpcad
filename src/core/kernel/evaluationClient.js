/**
 * Main-thread client for the kernel evaluation worker (`TODO/core-029`).
 *
 * Modelled on `src/core/exportClient.js` — the same factory seam, the same "the
 * fallback is the old path, exactly" rule — with the one thing export never needed:
 * **cancellation**. Export is one request, one answer. Evaluation is a stream: every
 * mutation asks again, a slider drag asks once a frame, and an answer to an old question
 * must never overwrite the answer to a newer one.
 *
 * ## Channels and generations
 *
 * A caller makes a {@link createEvaluationChannel} per independent stream (the live
 * scene, a timeline preview). Every request on a channel gets the next **generation**
 * number, and an answer lands only if its generation is newer than the last one that
 * landed on that channel. So:
 *
 * - answers that arrive in order all land — the newest known state is shown while even
 *   newer work is still running (`core-029`: "the previous geometry retained until the
 *   new one lands");
 * - an answer that arrives *after* a newer one has landed resolves `superseded` and is
 *   never applied — "a superseded rebuild must not land after the one that replaced it";
 * - a request the worker dropped unrun (its queue keeps only the newest per channel)
 *   resolves `superseded` too, so nothing ever waits on work nobody will read.
 *
 * ## The fallback
 *
 * If no worker can be constructed — no `Worker` (Node, where the unit suite runs), a
 * blocked module worker, a bundler that did not emit the chunk — or the worker dies,
 * the same `runEvaluationJob` runs on this thread and the request is still answered.
 * Slower, and it blocks, which is the pre-`core-029` behaviour; it never fails.
 * {@link evaluationWorkerAvailable} says which path a caller is on, so a store can do a
 * cheap job synchronously instead of deferring it when there is no worker to defer to.
 *
 * ## The boundary, for tests
 *
 * {@link setEvaluationWorkerFactory} replaces `new Worker(…)` — the seam `CLAUDE.md`'s
 * "always mock at the boundary: the kernel worker" means.
 *
 * @module core/kernel/evaluationClient
 */

import { runEvaluationJob } from './evaluationJob.js'

/** @typedef {import('./evaluationJob.js').EvaluationJob} EvaluationJob */
/** @typedef {import('./evaluationJob.js').EvaluationResult} EvaluationResult */

/**
 * @typedef {{ superseded: true, result?: undefined } | { superseded: false, result: EvaluationResult }} EvaluationOutcome
 */

/**
 * @typedef {object} PendingRequest
 * @property {EvaluationJob} job Kept so a dying worker's work can be redone here.
 * @property {number} generation
 * @property {(outcome: EvaluationOutcome) => void} resolve
 * @property {(error: Error) => void} reject
 * @property {(generation: number, result: EvaluationResult) => EvaluationOutcome} land
 */

/** @type {(() => Worker) | null} */
let factory = null
/** @type {Worker | null} */
let worker = null
/** True once constructing (or running) a worker has failed; stops retrying. */
let workerUnavailable = false
let nextId = 0
let nextChannel = 0
/** @type {Map<number, PendingRequest>} */
const pending = new Map()

/**
 * Replace how the worker is constructed. `null` restores the real one.
 *
 * @param {(() => Worker) | null} next
 */
export function setEvaluationWorkerFactory(next) {
  factory = next
  workerUnavailable = false
  disposeEvaluationWorker()
}

/**
 * Drop the current worker. Anything still outstanding resolves `superseded`: its caller
 * asks again on its next refresh, and a disposed worker would never answer.
 */
export function disposeEvaluationWorker() {
  worker?.terminate()
  worker = null
  for (const request of pending.values()) request.resolve({ superseded: true })
  pending.clear()
}

/** @returns {boolean} Whether requests are going to a worker (as opposed to the fallback). */
export function evaluationWorkerAvailable() {
  return resolveWorker() !== null
}

/** @param {MessageEvent} event */
function onMessage(event) {
  const data = event.data ?? {}
  const request = pending.get(data.id)
  if (!request) return
  pending.delete(data.id)
  if (data.superseded) request.resolve({ superseded: true })
  else if (data.ok) request.resolve(request.land(data.generation, data.result))
  else request.reject(new Error(data.error))
}

/** A worker that failed to load, or threw outside a job: answer its work here, forever after. */
function onWorkerError() {
  workerUnavailable = true
  worker?.terminate()
  worker = null
  const outstanding = [...pending.values()]
  pending.clear()
  for (const request of outstanding) answerHere(request)
}

/** @param {PendingRequest} request */
function answerHere(request) {
  try {
    request.resolve(request.land(request.generation, runEvaluationJob(request.job)))
  } catch (error) {
    request.reject(error instanceof Error ? error : new Error(String(error)))
  }
}

/** @returns {Worker | null} */
function resolveWorker() {
  if (workerUnavailable) return null
  if (worker) return worker
  try {
    worker =
      factory?.() ??
      // The form Vite understands in both the dev server and the production build.
      new Worker(new URL('./evaluation.worker.js', import.meta.url), {
        type: 'module',
        name: 'warpcad-evaluation',
      })
  } catch {
    workerUnavailable = true
    worker = null
    return null
  }
  worker.addEventListener('message', onMessage)
  worker.addEventListener('error', onWorkerError)
  return worker
}

/**
 * @typedef {object} EvaluationChannel
 * @property {(job: EvaluationJob) => Promise<EvaluationOutcome>} request Ask; the answer
 *   lands, or resolves `superseded`. Rejects only for a job the worker refused outright.
 * @property {() => number} landedGeneration The newest generation that has landed.
 * @property {() => number} requestedGeneration The newest generation asked for.
 */

/**
 * An independent stream of evaluation requests.
 *
 * @param {string} name For diagnostics only; channels are unique regardless.
 * @returns {EvaluationChannel}
 */
export function createEvaluationChannel(name) {
  const channel = `${name}#${(nextChannel += 1)}`
  let requested = 0
  let landed = 0

  /**
   * @param {number} generation
   * @param {EvaluationResult} result
   * @returns {EvaluationOutcome}
   */
  function land(generation, result) {
    if (generation <= landed) return { superseded: true }
    landed = generation
    return { superseded: false, result }
  }

  return {
    request(job) {
      const generation = (requested += 1)
      return new Promise((resolve, reject) => {
        /** @type {PendingRequest} */
        const entry = { job, generation, resolve, reject, land }
        const active = resolveWorker()
        if (!active) {
          answerHere(entry)
          return
        }
        const id = (nextId += 1)
        pending.set(id, entry)
        active.postMessage({ id, channel, generation, job })
      })
    },
    landedGeneration: () => landed,
    requestedGeneration: () => requested,
  }
}

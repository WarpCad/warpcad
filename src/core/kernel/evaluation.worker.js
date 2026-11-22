// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The kernel evaluation worker (`TODO/core-029`) — the general RPC `CLAUDE.md`'s
 * Architecture section names: "all kernel work happens off the main thread".
 *
 * A deliberately thin shell, like `src/core/export.worker.js`: it owns the message
 * protocol and the queue, and nothing else. What it runs is `./evaluationJob.js`, which
 * is unit-tested with no `Worker` at all.
 *
 * ## Protocol
 *
 * In:  `{ id, channel, generation, job }` — see `runEvaluationJob` for `job`.
 *      `{ forget: true }` — drop the geometry cache (`TODO/core-086`); no answer.
 * Out: `{ id, channel, generation, ok: true, result }` (its packed geometry transferred, `TODO/core-085`),
 *      `{ id, channel, generation, ok: false, error }`, or
 *      `{ id, channel, generation, superseded: true }` for a request that a newer one on
 *      the same channel overtook before it started — never run, always answered, so the
 *      client never waits on work nobody will read.
 *
 * ## Why a queue and a zero-delay drain
 *
 * A message handler that ran its job immediately would run every request in arrival
 * order, including ones already overtaken. Instead each request goes into
 * `createLatestOnlyQueue` and the drain is scheduled as a separate task: messages that
 * arrived while the previous job was running are all delivered (and all but the newest
 * per channel dropped) before the drain gets to run anything.
 *
 * @module core/kernel/evaluation.worker
 */

import { createGeometryCache, createLatestOnlyQueue, resultTransferables, runEvaluationJob } from './evaluationJob.js'

// `self` inside a worker is a `DedicatedWorkerGlobalScope`; the project's DOM typings
// describe the window one.
const scope = /** @type {any} */ (self)

/** @type {ReturnType<typeof createLatestOnlyQueue<any>>} */
const queue = createLatestOnlyQueue()
let draining = false
/** What the worker keeps between jobs (`TODO/core-086`): operands a later cut names instead of being sent. */
const cache = createGeometryCache()

function drain() {
  draining = false
  for (let request = queue.take(); request; request = queue.take()) {
    const { id, channel, generation, job } = request
    try {
      const result = runEvaluationJob(job, cache)
      // TODO/core-085: the result's buffers are handed over, not cloned — the main thread's
      // first read of a 220 k-triangle answer cost 80 ms when it was nested arrays.
      scope.postMessage({ id, channel, generation, ok: true, result }, resultTransferables(result))
    } catch (error) {
      scope.postMessage({ id, channel, generation, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

scope.addEventListener('message', (/** @type {MessageEvent} */ event) => {
  // A different document was opened: nothing it names is among what is held (`TODO/core-086`).
  if (event.data?.forget === true) {
    cache.clear()
    return
  }
  const dropped = queue.enqueue(event.data)
  if (dropped) {
    scope.postMessage({ id: dropped.id, channel: dropped.channel, generation: dropped.generation, superseded: true })
  }
  if (!draining) {
    draining = true
    setTimeout(drain, 0)
  }
})

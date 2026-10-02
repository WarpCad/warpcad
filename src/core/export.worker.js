// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The export worker (`TODO/perf-001`) — the first worker in this repo.
 *
 * A deliberately thin shell: it owns the message protocol and nothing else, so that
 * everything worth testing lives in `src/core/exportJob.js` and can be unit-tested
 * without a `Worker` at all (CLAUDE.md's Conventions: mock at the boundary — this file
 * *is* the boundary).
 *
 * ## Protocol
 *
 * In:  `{ id, format, bodies, refold? }` — see `runExportJob`.
 * Out: `{ id, ok: true, result }` or `{ id, ok: false, error }`.
 *
 * `id` is echoed so a client that has moved on (the user closed the popover, or pressed
 * Export again) can discard a stale answer rather than download a file nobody is
 * waiting for — the same rule `stores/exportDialog.js` already applies to its own
 * in-flight token.
 *
 * ## Why this is not the kernel's general evaluation RPC
 *
 * `CLAUDE.md`'s Architecture says all kernel work belongs off the main thread, and this
 * is the first piece of it to move. It is deliberately **export-only**: it is entered
 * from the export path alone, and no `evaluate()` caller or the document fold changes
 * because of it. Evaluation got its own worker in `TODO/core-029`
 * (`src/core/kernel/evaluation.worker.js`, one RPC for all kernel evaluation — see
 * `docs/decisions/kernel-evaluation-worker.md`), modelled on this one. Export keeps its
 * own: it is a one-shot job with a transferable answer and no need for cancellation.
 *
 * @module core/export.worker
 */

import { packError, runExportJob } from './exportJob.js'

// `self` inside a worker is a `DedicatedWorkerGlobalScope`, whose `postMessage` takes a
// transfer list; the project's DOM typings describe the window one, which does not.
const scope = /** @type {any} */ (self)

scope.addEventListener('message', (/** @type {MessageEvent} */ event) => {
  const { id, format, bodies, refold } = event.data ?? {}
  try {
    // `refold` (TODO/core-035): export at another resolution — the job folds the records.
    const result = runExportJob({ format, bodies, refold })
    // The finished file is a `Uint8Array`, which IS transferable — so the bytes move
    // rather than being copied, and only the (much smaller) glTF solid lists are cloned.
    const transfer = result.kind === 'bytes' && result.bytes ? [result.bytes.buffer] : []
    scope.postMessage({ id, ok: true, result }, transfer)
  } catch (error) {
    scope.postMessage({ id, ok: false, error: packError(error) })
  }
})

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The model-import worker (`TODO/io-009`): parse, weld, validate and hash a chosen model file
 * off the main thread, so a 25 MB file — or a hostile one — never blocks a frame. Owns only
 * the message protocol; the work is `./meshJob.js`.
 *
 * Request: `{ id, kind: 'import', file }`.
 * Answer: `{ id, ok: true, result }` — the result's preview arrays are **transferred**, never
 * copied — or `{ id, ok: false, error }`.
 *
 * Superseding is the client's job: it terminates this worker when a newer file is chosen,
 * which is a real cancellation of a long parse rather than a result discarded afterwards.
 */

import { importMeshFile } from './meshJob.js'

self.addEventListener('message', async (/** @type {MessageEvent} */ event) => {
  const { id, kind } = event.data ?? {}
  try {
    if (kind === 'import') {
      const result = await importMeshFile(event.data.file)
      const transfer = result.ok ? [result.preview.positions.buffer, result.preview.indices.buffer] : []
      self.postMessage({ id, ok: true, result }, /** @type {any} */ (transfer))
      return
    }
    self.postMessage({ id, ok: false, error: `unknown job "${String(kind)}"` })
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

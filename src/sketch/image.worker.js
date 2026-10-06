// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The image worker (`TODO/sketch-003`): import re-encoding and asset decoding, off the main
 * thread, so a slow — or hostile — decode never blocks a frame. Owns only the message
 * protocol; the work is `./imageJob.js`.
 *
 * Request: `{ id, kind: 'import', file }`, `{ id, kind: 'decode', record }` or
 * `{ id, kind: 'trace', record, seedPx, options }` (`TODO/sketch-004`).
 * Answer: `{ id, ok: true, result }` (the `ImageBitmap` is transferred, never copied) or
 * `{ id, ok: false, error }`.
 *
 * A trace that a newer tap overtook while it waited (for the photo's first decode, say) is
 * answered `{ superseded: true }` without being run — supersede, not queue. The client
 * discards a superseded answer either way.
 */

import { decodeAsset, importImage, traceAsset } from './imageJob.js'

/** The newest trace request seen. */
let latestTrace = -1

self.addEventListener('message', async (/** @type {MessageEvent} */ event) => {
  const { id, kind } = event.data ?? {}
  if (kind === 'trace') latestTrace = id
  try {
    if (kind === 'trace') {
      // Yield a whole task, so taps already queued behind this one are dispatched (and
      // `latestTrace` updated) before it runs. A microtask would not do it: queued `message`
      // events are tasks, and none of them runs until this handler's microtasks drain.
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (id !== latestTrace) {
        self.postMessage({ id, ok: true, result: { superseded: true } })
        return
      }
      const result = await traceAsset(event.data.record, event.data.seedPx, event.data.options ?? {})
      self.postMessage({ id, ok: true, result })
      return
    }
    if (kind === 'import') {
      const result = await importImage(event.data.file)
      self.postMessage({ id, ok: true, result }, /** @type {any} */ (result.ok ? [result.bitmap] : []))
      return
    }
    if (kind === 'decode') {
      const bitmap = await decodeAsset(event.data.record)
      self.postMessage({ id, ok: true, result: bitmap }, /** @type {any} */ ([bitmap]))
      return
    }
    self.postMessage({ id, ok: false, error: `unknown job "${String(kind)}"` })
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

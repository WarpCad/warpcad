// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The image worker (`TODO/sketch-003`): import re-encoding and asset decoding, off the main
 * thread, so a slow — or hostile — decode never blocks a frame. Owns only the message
 * protocol; the work is `./imageJob.js`.
 *
 * Request: `{ id, kind: 'import', file }` or `{ id, kind: 'decode', record }`.
 * Answer: `{ id, ok: true, result }` (the `ImageBitmap` is transferred, never copied) or
 * `{ id, ok: false, error }`.
 *
 * (`TODO/sketch-004`'s tracing will be a third `kind` here.)
 */

import { decodeAsset, importImage } from './imageJob.js'

self.addEventListener('message', async (/** @type {MessageEvent} */ event) => {
  const { id, kind } = event.data ?? {}
  try {
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

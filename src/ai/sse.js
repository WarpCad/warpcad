// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A Server-Sent-Events frame parser over a `ReadableStream<Uint8Array>` (`TODO/ai-004`).
 *
 * About forty lines because that is all the Messages API stream needs, and `ai-001` chose
 * raw `fetch` over an SDK for exactly that (`docs/decisions/ai-partner.md` decision 2). The
 * hard cases are the ones `client.spec.js` drives: a frame split across chunks at any byte,
 * a multi-byte UTF-8 character straddling two chunks, CRLF line endings, comment lines and
 * `ping` events.
 *
 * @module ai/sse
 */

/**
 * @typedef {object} SseFrame
 * @property {string} event The `event:` field ("message" when absent).
 * @property {string} data The `data:` lines joined with `\n`.
 */

/**
 * @param {string} block One frame's text, without its terminating blank line.
 * @returns {SseFrame | null} `null` for a comment-only or empty block.
 */
function parseFrame(block) {
  let event = 'message'
  /** @type {string[]} */
  const data = []
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return data.length === 0 ? null : { event, data: data.join('\n') }
}

/**
 * Line endings to `\n`, holding back a trailing `\r` (its `\n` may be in the next chunk;
 * converting it now would read as a blank line and end the frame early).
 *
 * @param {string} text
 * @returns {string}
 */
function normalise(text) {
  const held = text.endsWith('\r') ? '\r' : ''
  return text.slice(0, text.length - held.length).replace(/\r\n?/g, '\n') + held
}

/**
 * Read a response body as SSE frames. Releases the reader when iteration ends for any
 * reason, including the consumer breaking out early.
 *
 * @param {ReadableStream<Uint8Array>} body
 * @param {AbortSignal} [signal] Cancelling the reader on abort makes a pending read resolve
 *   at once, rather than relying on the platform to error the body of an aborted `fetch`.
 * @returns {AsyncGenerator<SseFrame, void, undefined>}
 */
export async function* readSse(body, signal) {
  const reader = body.getReader()
  const onAbort = () => void reader.cancel().catch(() => {})
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // `stream: true` holds back an incomplete multi-byte sequence until its tail arrives.
      buffer = normalise(buffer + decoder.decode(value, { stream: true }))
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const frame = parseFrame(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
        if (frame) yield frame
        boundary = buffer.indexOf('\n\n')
      }
    }
    buffer = normalise(buffer + decoder.decode()).replace(/\r$/, '\n')
    const last = parseFrame(buffer)
    if (last) yield last
  } finally {
    signal?.removeEventListener('abort', onAbort)
    try {
      await reader.cancel()
    } catch {
      /* already closed or errored */
    }
    reader.releaseLock()
  }
}

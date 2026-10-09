// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The provider client (`TODO/ai-004`, `docs/decisions/ai-partner.md` decisions 2, 8 and 9):
 * raw `fetch` to the Anthropic Messages API behind a one-method interface, with the user's
 * own key, called straight from the browser. **The agent (`ai-005`) never sees HTTP**: it
 * calls `stream()` and reads typed events.
 *
 * ## The interface
 *
 * `stream({ system, messages, tools, signal })` is an async iterable of
 *
 * | event | fields |
 * |---|---|
 * | `text` | `text` — a delta, in order |
 * | `tool_call` | `id`, `name`, `input` — one per `tool_use` block, input already parsed |
 * | `usage` | `usage: { input, cacheRead, cacheWrite, output }` — this request's token counts |
 * | `done` | `stopReason` (`end_turn`, `tool_use`, `max_tokens`, `aborted`, …), `content`, `model` |
 * | `error` | `kind`, `message`, optional `status` / `retryAfterSeconds` |
 *
 * A stream ends with **exactly one** `done` or `error`. Cancelling (the `signal`) ends it with
 * `done` / `aborted`, never an error. A `refusal` stop reason is an `error` of kind `refusal`
 * (decision 9: "shown as a plain message and the turn is discarded like any other failure").
 * `done.content` is the assistant's full content blocks as streamed — text, `tool_use` and
 * `thinking` blocks **with their signatures** — which `ai-005` must append to the history
 * unchanged (Opus 5.5 reads its own thinking blocks back).
 *
 * ## Credential rules
 *
 * - The key is read per call from `getKey()`, a closure over the credential store; it is
 *   never a field of the client, a log line or a message.
 * - It goes in the `x-api-key` header of requests to an **allowlisted origin**, checked at
 *   construction exactly as `hostedBackend.js` does, and nowhere else.
 * - **No message is built from a response body or a thrown error's text** — a server body or a
 *   `TypeError` can quote the key it rejected. Every message below is this module's own fixed
 *   wording chosen by status or failure class, and passes through {@link redactKey} on the way
 *   out as a belt to those braces.
 *
 * ## The request, built in one place
 *
 * {@link buildRequest} writes every field decision 9 lists: adaptive thinking, explicit effort
 * `high`, `tool_choice: auto`, prompt caching on the deterministic tools + frozen system
 * prefix plus top-level automatic caching for the tail, and the refusal fallback.
 * Opus 5.5 and Sonnet 5.5 return a 400 for forced tool use, `thinking: disabled` and
 * `budget_tokens`, so none of those is ever sent.
 *
 * @module ai/client
 */

import { toStrictWire } from './tools/schema.js'
import { readSse } from './sse.js'

/** The only origin a key is ever sent to. */
export const ANTHROPIC_API_ORIGIN = 'https://api.anthropic.com'
/** The `anthropic-version` header value. */
export const ANTHROPIC_VERSION = '2023-06-01'
/** The beta header the `fallbacks: "default"` refusal fallback needs (decision 9, item 5). */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
/** Streaming default from decision 9. */
export const MAX_OUTPUT_TOKENS = 64000

/**
 * @typedef {'no-key' | 'bad-key' | 'forbidden' | 'rate-limit' | 'server' | 'bad-request' | 'offline' | 'blocked' | 'interrupted' | 'bad-response' | 'refusal'} AiErrorKind
 */

/**
 * @typedef {object} TokenUsage
 * @property {number} input Uncached input tokens.
 * @property {number} cacheRead Input tokens served from the prompt cache.
 * @property {number} cacheWrite Input tokens written to the prompt cache.
 * @property {number} output Output tokens.
 */

/**
 * @typedef {{ type: 'text', text: string }
 *   | { type: 'tool_call', id: string, name: string, input: any }
 *   | { type: 'usage', usage: TokenUsage }
 *   | { type: 'done', stopReason: string, content: any[], model: string }
 *   | { type: 'error', kind: AiErrorKind, message: string, status?: number, retryAfterSeconds?: number }} AiEvent
 */

/**
 * @typedef {object} ToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {Record<string, any>} inputSchema The registry's plain JSON Schema (`toStrictWire` is applied here).
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} system The frozen system prompt; nothing document-derived (decision 7).
 * @property {any[]} messages
 * @property {ToolDefinition[]} [tools]
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {object} AiClient
 * @property {(request: StreamRequest) => AsyncGenerator<AiEvent, void, undefined>} stream
 * @property {(options?: { key?: string }) => Promise<{ ok: true, model: string } | { ok: false, kind: AiErrorKind, message: string, status?: number, retryAfterSeconds?: number }>} test
 */

/**
 * Replace every occurrence of `key` in `text`. A no-op for a missing or very short key
 * (replacing a one-character "key" would mangle ordinary text).
 *
 * @param {string} text
 * @param {string | null | undefined} key
 * @returns {string}
 */
export function redactKey(text, key) {
  if (typeof key !== 'string' || key.length < 8) return text
  return text.split(key).join('[key]')
}

/**
 * @param {{ model: string } & StreamRequest} request
 * @returns {Record<string, any>} The `POST /v1/messages` body. Pure and deterministic: the same
 *   inputs are byte-identical, which is what keeps the cached prefix stable (decision 9).
 */
export function buildRequest({ model, system, messages, tools = [] }) {
  /** @type {Record<string, any>} */
  const body = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: true,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    // Top-level automatic caching for the growing conversation tail.
    cache_control: { type: 'ephemeral' },
    // One explicit breakpoint at the end of the frozen system prompt.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    fallbacks: 'default',
    messages,
  }
  if (tools.length > 0) {
    body.tools = [...tools]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: toStrictWire(/** @type {any} */ (tool.inputSchema)),
        strict: true,
      }))
    body.tool_choice = { type: 'auto' }
  }
  return body
}

/** The fixed wording. Never extended with response text. */
const MESSAGES = {
  'no-key': 'No API key is stored. Paste one in the Assistant key sheet.',
  'bad-key': 'Anthropic rejected this key. Check that it was pasted whole, or create a new one in the Anthropic console.',
  forbidden: "This key isn't allowed to do that. Check its workspace and that it can use the chosen model.",
  'rate-limit': 'Rate limit reached. Wait a moment and try again.',
  offline: 'You appear to be offline. Reconnect and try again.',
  blocked:
    "The browser couldn't reach api.anthropic.com. The request was blocked (a CORS refusal, a content blocker or a firewall) or the connection failed.",
  interrupted: 'The connection dropped before the reply finished.',
  'bad-response': 'The reply was not in the expected format, so this turn was discarded.',
  refusal: 'The model declined this request. The turn was discarded.',
}

/**
 * @param {number | undefined} status
 * @returns {string}
 */
function serverMessage(status) {
  return status === undefined
    ? 'Anthropic is having trouble right now. Try again shortly.'
    : `Anthropic is having trouble right now (status ${status}). Try again shortly.`
}

/**
 * @param {number} status
 * @param {{ get: (name: string) => string | null }} headers
 * @returns {Extract<AiEvent, { type: 'error' }>}
 */
function errorForStatus(status, headers) {
  if (status === 401) return { type: 'error', kind: 'bad-key', status, message: MESSAGES['bad-key'] }
  if (status === 403) return { type: 'error', kind: 'forbidden', status, message: MESSAGES.forbidden }
  if (status === 429) {
    const seconds = Number.parseInt(headers.get('retry-after') ?? '', 10)
    const known = Number.isFinite(seconds) && seconds >= 0
    return {
      type: 'error',
      kind: 'rate-limit',
      status,
      ...(known ? { retryAfterSeconds: seconds } : {}),
      message: known ? `${MESSAGES['rate-limit']} (Anthropic suggests ${seconds} s.)` : MESSAGES['rate-limit'],
    }
  }
  if (status >= 500) return { type: 'error', kind: 'server', status, message: serverMessage(status) }
  return { type: 'error', kind: 'bad-request', status, message: `Anthropic refused the request as invalid (status ${status}).` }
}

/**
 * @param {string | undefined} type An Anthropic `error.type` from a stream's `error` event.
 * @returns {Extract<AiEvent, { type: 'error' }>}
 */
function errorForStreamError(type) {
  if (type === 'rate_limit_error') return { type: 'error', kind: 'rate-limit', message: MESSAGES['rate-limit'] }
  if (type === 'authentication_error') return { type: 'error', kind: 'bad-key', message: MESSAGES['bad-key'] }
  return { type: 'error', kind: 'server', message: serverMessage(undefined) }
}

/**
 * @param {any} error Whatever `fetch` threw.
 * @param {AbortSignal | undefined} signal
 * @param {() => boolean} isOnline
 * @returns {'aborted' | Extract<AiEvent, { type: 'error' }>}
 */
function classifyFetchFailure(error, signal, isOnline) {
  if (signal?.aborted || error?.name === 'AbortError') return 'aborted'
  // In a browser a CORS refusal, a CSP block and a dropped connection are the same bare
  // `TypeError`. The one thing that can be told apart is the browser's own online flag.
  return isOnline()
    ? { type: 'error', kind: 'blocked', message: MESSAGES.blocked }
    : { type: 'error', kind: 'offline', message: MESSAGES.offline }
}

/** @returns {boolean} */
function browserIsOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/**
 * @param {object} options
 * @param {() => string | null | Promise<string | null>} options.getKey Read per call; the key is never held here.
 * @param {() => string} options.getModel Read per call, so the `ai.model` setting applies to the next request.
 * @param {typeof globalThis.fetch | null} [options.fetch] The boundary every test mocks.
 * @param {() => boolean} [options.isOnline]
 * @param {string} [options.apiOrigin]
 * @param {string[]} [options.allowedOrigins]
 * @returns {AiClient}
 */
export function createAnthropicClient({
  getKey,
  getModel,
  fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
  isOnline = browserIsOnline,
  apiOrigin = ANTHROPIC_API_ORIGIN,
  allowedOrigins = [ANTHROPIC_API_ORIGIN],
} = /** @type {any} */ ({})) {
  if (!allowedOrigins.includes(apiOrigin)) {
    // Thrown at construction, before any request object exists: a misconfigured origin can
    // never be the thing that leaks the key.
    throw new Error(`the AI client refuses the origin ${apiOrigin}: a key is only ever sent to ${allowedOrigins.join(', ')}`)
  }
  if (typeof fetchImpl !== 'function') throw new Error('the AI client needs a fetch implementation')

  /**
   * @param {string} key
   * @param {string | null} beta
   */
  function headers(key, beta) {
    return {
      'content-type': 'application/json',
      // The one place the key appears. Never a query string.
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
      // Anthropic's opt-in for calling the API from a browser with the user's own key.
      'anthropic-dangerous-direct-browser-access': 'true',
      ...(beta ? { 'anthropic-beta': beta } : {}),
    }
  }

  /**
   * Run `events` through the key redaction on the way out.
   *
   * @param {AiEvent} event
   * @param {string} key
   * @returns {AiEvent}
   */
  function scrub(event, key) {
    return event.type === 'error' ? { ...event, message: redactKey(event.message, key) } : event
  }

  return {
    async *stream({ system, messages, tools = [], signal }) {
      const key = await getKey()
      if (!key) {
        yield { type: 'error', kind: 'no-key', message: MESSAGES['no-key'] }
        return
      }
      if (signal?.aborted) {
        yield { type: 'done', stopReason: 'aborted', content: [], model: getModel() }
        return
      }
      const model = getModel()

      /** @type {Response} */
      let response
      try {
        response = await /** @type {typeof fetch} */ (fetchImpl)(`${apiOrigin}/v1/messages`, {
          method: 'POST',
          headers: headers(key, FALLBACK_BETA),
          body: JSON.stringify(buildRequest({ model, system, messages, tools })),
          signal,
        })
      } catch (error) {
        const failure = classifyFetchFailure(error, signal, isOnline)
        yield failure === 'aborted' ? { type: 'done', stopReason: 'aborted', content: [], model } : scrub(failure, key)
        return
      }
      if (!response.ok) {
        yield scrub(errorForStatus(response.status, response.headers), key)
        return
      }
      if (!response.body) {
        yield { type: 'error', kind: 'bad-response', message: MESSAGES['bad-response'] }
        return
      }

      /** @type {Map<number, any>} */
      const blocks = new Map()
      /** @type {Map<number, string>} */
      const partialJson = new Map()
      /** @type {TokenUsage} */
      const usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
      let servedBy = model
      let stopReason = ''
      let refused = false
      let finished = false

      /** @param {any} raw */
      const takeUsage = (raw) => {
        if (!raw || typeof raw !== 'object') return
        if (Number.isFinite(raw.input_tokens)) usage.input = raw.input_tokens
        if (Number.isFinite(raw.cache_read_input_tokens)) usage.cacheRead = raw.cache_read_input_tokens
        if (Number.isFinite(raw.cache_creation_input_tokens)) usage.cacheWrite = raw.cache_creation_input_tokens
        if (Number.isFinite(raw.output_tokens)) usage.output = raw.output_tokens
      }

      try {
        for await (const frame of readSse(response.body, signal)) {
          /** @type {any} */
          let data
          try {
            data = JSON.parse(frame.data)
          } catch {
            yield { type: 'error', kind: 'bad-response', message: MESSAGES['bad-response'] }
            return
          }
          switch (data?.type) {
            case 'message_start':
              takeUsage(data.message?.usage)
              if (typeof data.message?.model === 'string') servedBy = data.message.model
              break
            case 'content_block_start': {
              const block = data.content_block ?? {}
              if (block.type === 'text') blocks.set(data.index, { type: 'text', text: '' })
              else if (block.type === 'tool_use') {
                blocks.set(data.index, { type: 'tool_use', id: block.id, name: block.name, input: {} })
                partialJson.set(data.index, '')
              } else if (block.type === 'thinking') {
                blocks.set(data.index, { type: 'thinking', thinking: block.thinking ?? '', signature: block.signature ?? '' })
              } else if (block.type === 'redacted_thinking') {
                blocks.set(data.index, { ...block })
              }
              // Anything else (a refusal-fallback marker, a server-tool block) is not echoed.
              break
            }
            case 'content_block_delta': {
              const block = blocks.get(data.index)
              const delta = data.delta ?? {}
              if (!block) break
              if (delta.type === 'text_delta' && block.type === 'text') {
                block.text += delta.text
                if (delta.text !== '') yield { type: 'text', text: delta.text }
              } else if (delta.type === 'input_json_delta' && block.type === 'tool_use') {
                partialJson.set(data.index, (partialJson.get(data.index) ?? '') + (delta.partial_json ?? ''))
              } else if (delta.type === 'thinking_delta' && block.type === 'thinking') {
                block.thinking += delta.thinking ?? ''
              } else if (delta.type === 'signature_delta' && block.type === 'thinking') {
                block.signature = delta.signature ?? block.signature
              }
              break
            }
            case 'content_block_stop': {
              const block = blocks.get(data.index)
              if (block?.type === 'tool_use') {
                const raw = partialJson.get(data.index) ?? ''
                try {
                  block.input = raw.trim() === '' ? {} : JSON.parse(raw)
                } catch {
                  yield { type: 'error', kind: 'bad-response', message: MESSAGES['bad-response'] }
                  return
                }
                yield { type: 'tool_call', id: block.id, name: block.name, input: block.input }
              }
              break
            }
            case 'message_delta':
              takeUsage(data.usage)
              if (typeof data.delta?.stop_reason === 'string') stopReason = data.delta.stop_reason
              break
            case 'message_stop':
              finished = true
              break
            case 'error':
              yield scrub(errorForStreamError(data.error?.type), key)
              return
            default:
              break // ping and anything newer
          }
          if (finished) break
        }
      } catch (error) {
        const failure = classifyFetchFailure(error, signal, isOnline)
        yield failure === 'aborted'
          ? { type: 'done', stopReason: 'aborted', content: [], model: servedBy }
          : { type: 'error', kind: 'interrupted', message: MESSAGES.interrupted }
        return
      }

      if (!finished) {
        yield signal?.aborted
          ? { type: 'done', stopReason: 'aborted', content: [], model: servedBy }
          : { type: 'error', kind: 'interrupted', message: MESSAGES.interrupted }
        return
      }
      refused = stopReason === 'refusal'
      yield { type: 'usage', usage: { ...usage } }
      if (refused) {
        yield { type: 'error', kind: 'refusal', message: MESSAGES.refusal }
        return
      }
      yield {
        type: 'done',
        stopReason: stopReason || 'end_turn',
        content: [...blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => block),
        model: servedBy,
      }
    },

    async test({ key: candidate } = {}) {
      const key = candidate ?? (await getKey())
      const model = getModel()
      if (!key) return { ok: false, kind: 'no-key', message: MESSAGES['no-key'] }
      try {
        const response = await /** @type {typeof fetch} */ (fetchImpl)(`${apiOrigin}/v1/messages/count_tokens`, {
          method: 'POST',
          headers: headers(key, null),
          body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }] }),
        })
        if (response.ok) return { ok: true, model }
        const { kind, message, status, retryAfterSeconds } = /** @type {any} */ (scrub(errorForStatus(response.status, response.headers), key))
        return { ok: false, kind, message, status, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) }
      } catch (error) {
        const failure = classifyFetchFailure(error, undefined, isOnline)
        const { kind, message } = /** @type {Extract<AiEvent, { type: 'error' }>} */ (failure === 'aborted' ? { kind: 'interrupted', message: MESSAGES.interrupted } : scrub(failure, key))
        return { ok: false, kind, message }
      }
    },
  }
}

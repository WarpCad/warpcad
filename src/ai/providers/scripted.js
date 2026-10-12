// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A scripted provider (`TODO/ai-010`): the `AiClient` (`src/ai/client.js`) driven from a
 * recorded or hand-written list of model replies instead of the Messages API, so a spec can
 * run the **real** agent, tool registry, document and viewport with a deterministic model, with
 * no network and no key.
 *
 * ## What this proves, and what it cannot
 *
 * The plumbing: a reply streams in chunks, a tool call lands on the real registry, the document
 * changes, the viewport shows it, Stop and Undo AI turn work. It never proves that a model's
 * *choices* are good; only the live runs of `TODO/ACCEPTANCE.md` scenarios 17 and 18 and
 * `ai-011`'s eval do (`docs/decisions/ai-partner.md`, "What a scripted run proves").
 *
 * ## Stale transcripts fail loudly
 *
 * A transcript is stamped with a hash of the input schema of every tool it calls
 * ({@link stampTranscript}). When a tool's schema changes, the stamp no longer matches and the
 * reply that would have made the call is an **error that says "re-record"** instead of a green run
 * against calls the registry would now refuse. `src/ai/providers/scripted.spec.js` also checks
 * every fixture's stamp, so the failure shows up in the unit stage, not only in a browser.
 *
 * ## Transcript format
 *
 * ```json
 * { "name": "airfoil-wing",
 *   "tools": { "create": "<hash>", "check_printability": "<hash>" },
 *   "turns": [ { "text": "…", "calls": [ { "name": "create", "input": { … } } ] } ] }
 * ```
 *
 * One `turn` is one model reply, i.e. one `stream()` call: the agent calls `stream()` again after
 * each batch of tool results, so a conversation with several tool rounds needs several turns,
 * and a follow-up message consumes the turns after the ones before it. A string in a call's
 * input that is exactly `"$last:<prefix>"` (for example `"$last:group"`) is replaced by the last
 * `<prefix>-<n>` id (or `<prefix>-<replica>-<n>`, `TODO/data-008`) in the conversation so far, and `"$all:<prefix>,<prefix>"` by the array of
 * every such id, in the order they first appear, because the app, not the script, issues body
 * ids. A turn's `delayMs` pauses between its chunks (abortable), so a spec can press Stop mid-reply.
 *
 * Framework-free: no Vue, no DOM, no network.
 */

import { createToolRegistry } from '../tools/index.js'

/** How many characters of text one `text` event carries: small enough to cross word boundaries. */
export const SCRIPTED_CHUNK_CHARS = 9

/** The model name a scripted run reports. */
export const SCRIPTED_MODEL = 'scripted'

/**
 * @typedef {object} ScriptedCall
 * @property {string} name
 * @property {any} input
 *
 * @typedef {object} ScriptedTurn
 * @property {string} [text]
 * @property {ScriptedCall[]} [calls]
 * @property {import('../client.js').TokenUsage} [usage]
 * @property {number} [delayMs] Pause before each text chunk.
 *
 * @typedef {object} ScriptedTranscript
 * @property {string} name
 * @property {Record<string, string>} tools Schema hash of every tool the turns call.
 * @property {ScriptedTurn[]} turns
 */

/**
 * Canonical JSON: object keys sorted, so a reordered schema hashes the same.
 *
 * @param {any} value
 * @returns {string}
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * A short, stable fingerprint of a tool's input schema (FNV-1a, 32 bit, hex). It is a change
 * detector, not a security measure.
 *
 * @param {any} inputSchema
 * @returns {string}
 */
export function schemaHash(inputSchema) {
  let hash = 0x811c9dc5
  for (const char of canonical(inputSchema)) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** @param {ScriptedTranscript} transcript @returns {string[]} The tool names its turns call. */
function calledTools(transcript) {
  return [...new Set(transcript.turns.flatMap((turn) => (turn.calls ?? []).map((call) => call.name)))].sort()
}

/**
 * What is wrong with a transcript against a registry: a tool it calls that no longer exists, one
 * with no stamp, one whose schema changed. Empty means current.
 *
 * @param {ScriptedTranscript} transcript
 * @param {{ definitions: (transport: any) => Array<{ name: string, inputSchema: any }> }} [registry]
 * @returns {string[]}
 */
export function staleProblems(transcript, registry = createToolRegistry()) {
  const definitions = new Map(registry.definitions('ai').map((definition) => [definition.name, definition]))
  /** @type {string[]} */
  const problems = []
  for (const name of calledTools(transcript)) {
    const definition = definitions.get(name)
    if (definition === undefined) {
      problems.push(`the tool "${name}" no longer exists`)
    } else if (transcript.tools?.[name] === undefined) {
      problems.push(`the tool "${name}" has no stamp`)
    } else if (transcript.tools[name] !== schemaHash(definition.inputSchema)) {
      problems.push(`the schema of "${name}" changed`)
    }
  }
  return problems
}

/**
 * The transcript with its stamps recomputed from the registry as it is now. Run it only after
 * checking the calls still mean what they should against the new schemas (`npm run ai:stamp`
 * says so); the browser spec that plays the transcript is the check.
 *
 * @param {ScriptedTranscript} transcript
 * @param {{ definitions: (transport: any) => Array<{ name: string, inputSchema: any }> }} [registry]
 * @returns {ScriptedTranscript}
 */
export function stampTranscript(transcript, registry = createToolRegistry()) {
  const definitions = new Map(registry.definitions('ai').map((definition) => [definition.name, definition]))
  /** @type {Record<string, string>} */
  const tools = {}
  for (const name of calledTools(transcript)) {
    const definition = definitions.get(name)
    if (definition === undefined) throw new Error(`"${transcript.name}" calls "${name}", which is not a tool`)
    tools[name] = schemaHash(definition.inputSchema)
  }
  return { ...transcript, tools }
}

/** Optional replica segment of a record id (`TODO/data-008`): `cuboid-jpxic4-2` as well as legacy `cuboid-2`. */
const REPLICA_SEGMENT = '(?:[a-z2-7]{6}-)?'

/**
 * Replace `"$last:<prefix>"` and `"$all:<prefix>,…"` strings with ids from the conversation.
 *
 * @param {any} value
 * @param {string} conversation The messages, serialised.
 * @returns {any}
 */
function resolvePlaceholders(value, conversation) {
  if (typeof value === 'string') {
    const last = /^\$last:([a-z]+)$/.exec(value)
    if (last !== null) return conversation.match(new RegExp(`\\b${last[1]}-${REPLICA_SEGMENT}\\d+`, 'g'))?.at(-1) ?? value
    const all = /^\$all:([a-z,]+)$/.exec(value)
    if (all !== null) {
      const found = conversation.match(new RegExp(`\\b(?:${all[1].split(',').join('|')})-${REPLICA_SEGMENT}\\d+`, 'g')) ?? []
      return [...new Set(found)]
    }
    return value
  }
  if (Array.isArray(value)) return value.map((item) => resolvePlaceholders(item, conversation))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolvePlaceholders(item, conversation)]))
  }
  return value
}

/**
 * @param {ScriptedTranscript} transcript
 * @param {{ registry?: { definitions: (transport: any) => Array<{ name: string, inputSchema: any }> } }} [options]
 * @returns {import('../client.js').AiClient}
 */
export function createScriptedClient(transcript, options = {}) {
  const registry = options.registry ?? createToolRegistry()
  let next = 0

  return {
    async *stream(request) {
      const turn = transcript.turns[next]
      if (turn === undefined) {
        yield { type: 'error', kind: 'bad-response', message: `The scripted transcript "${transcript.name}" has no more replies (it ran out after ${transcript.turns.length}).` }
        return
      }
      const stale = staleProblems({ ...transcript, turns: [turn] }, registry)
      if (stale.length > 0) {
        yield { type: 'error', kind: 'bad-request', message: `The scripted transcript "${transcript.name}" is stale: ${stale.join('; ')}. Re-record it (npm run ai:stamp, after checking its calls against the new schemas).` }
        return
      }
      next += 1

      const conversation = JSON.stringify(request.messages ?? [])
      /** @type {any[]} */
      const content = []
      const text = turn.text ?? ''
      for (let at = 0; at < text.length; at += SCRIPTED_CHUNK_CHARS) {
        if (turn.delayMs) await new Promise((resolve) => setTimeout(resolve, turn.delayMs))
        if (request.signal?.aborted) {
          yield { type: 'done', stopReason: 'aborted', content: [], model: SCRIPTED_MODEL }
          return
        }
        yield { type: 'text', text: text.slice(at, at + SCRIPTED_CHUNK_CHARS) }
      }
      if (text !== '') content.push({ type: 'text', text })
      for (const [index, call] of (turn.calls ?? []).entries()) {
        const input = resolvePlaceholders(call.input, conversation)
        const id = `toolu_scripted_${next}_${index}`
        content.push({ type: 'tool_use', id, name: call.name, input })
        yield { type: 'tool_call', id, name: call.name, input }
      }
      yield { type: 'usage', usage: turn.usage ?? { input: 1200, cacheRead: 0, cacheWrite: 0, output: 150 } }
      yield { type: 'done', stopReason: (turn.calls ?? []).length > 0 ? 'tool_use' : 'end_turn', content, model: SCRIPTED_MODEL }
    },
    async test() {
      return { ok: true, model: SCRIPTED_MODEL }
    },
  }
}

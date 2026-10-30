// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The prompt record (`TODO/ai-031`): the request an agent was given, stored in the project.
 *
 * `CLAUDE.md`: *"each feature carries the prompt or instruction that produced it"*. A record's
 * **intent** (`src/core/intent.js`, `ai-003`) is the right place for "why this step" — 500
 * characters, beside one entry, composed with the model's rationale. It is the wrong place for
 * the prompt itself: too short, tied to one entry, and an agent connected over MCP or WebMCP
 * never filled its request half. So a prompt is **its own record**:
 *
 * ```
 * { id: 'prompt-<replica>-<n>', text: 'a 140 × 250 mm fan duct, 1.6 mm walls', produced: ['cuboid-…', 'bool-…'] }
 * ```
 *
 * one per request, so one prompt covers many steps and a revision adds a new record rather than
 * rewriting one. `produced` names the **records** (bodies and steps) written for it — every new
 * record id, including a boolean's, so a boolean that consumes produced bodies never orphans the
 * prompt: the result is named too, and {@link promptsForBody} also follows `consumes`.
 *
 * ## Where it lives
 *
 * In the state line's merge section, as `merge.prompts: [record]` (`src/core/merge/section.js`),
 * beside `merge.gist` — not as a record line (every reader of the log would meet an op it must
 * skip, and a released build refuses an op it does not know), and not under `merge.registers`
 * (a released build refuses a register name it does not know). A released build ignores an
 * unknown section key, so it still opens the file — and, exactly as with the gist, drops the
 * field if it saves; a later merge with a copy that has the prompts restores them, because
 * prompts merge as a grow-only set ({@link joinPromptMaps}).
 *
 * ## Untrusted text
 *
 * A prompt arrives from an agent or from any file, so it is bounded and cleaned here (intent's
 * {@link cleanText}, plus the **bidi controls** intent never stripped — a reordered prompt would
 * show the reader something other than what is stored), rendered as text and never markup by the
 * UI, and given to a model only inside a labelled data block (`src/ai/documentData.js`). At load,
 * a record that fails {@link validatePromptRecord} is **dropped with a warning naming why**, never
 * repaired and never half-loaded (`src/core/merge/validate.js`); `project.js` reports it.
 *
 * Framework-free: plain data in, plain data out.
 *
 * @module core/prompt
 */

import { cleanText } from './intent.js'
import { compareStamps, isReplicaId } from './replica.js'

/** The `op` a dropped prompt's {@link import('./project.js').LoadWarning} carries. */
export const PROMPT_OP = 'note.prompt'

/** Limits enforced on prompts, in code. */
export const PROMPT_LIMITS = Object.freeze({
  /** The longest a stored prompt may be, in UTF-16 code units. Longer is cut, with `…`. */
  maxTextLength: 4000,
  /**
   * The longest prompt `record_prompt` will even clean: anything longer is refused as over the
   * cap, before any regex walks it (a 1 MB string is a mistake or an attack, not a request).
   */
  maxInputLength: 64_000,
  /** Record ids one prompt may name. */
  maxProduced: 1000,
  /** Prompts one project may hold. */
  maxPrompts: 500,
  maxIdLength: 256,
  /**
   * `TODO/ai-032`: the longest a prompt's reply may be, across all its segments together, in
   * UTF-16 code units. An append that would pass it is cut, with `…`; one after that is refused.
   */
  maxResponseLength: 20_000,
  /** `TODO/ai-032`: reply segments one prompt may hold. */
  maxResponseSegments: 100,
  /** The highest stamp counter a segment may carry: the merge section's own ceiling. */
  maxCounter: 2 ** 40,
})

/** What a prompt id and a produced id may be made of: a record id's alphabet. */
const ID = /^[A-Za-z0-9._:-]+$/

/**
 * Bidirectional-text controls: the embeddings and overrides (U+202A–U+202E), the isolates
 * (U+2066–U+2069), the marks (U+200E, U+200F) and the Arabic letter mark (U+061C).
 */
const BIDI = /[‪-‮⁦-⁩‎‏؜]/g

/**
 * `TODO/ai-032`: one piece of the reply to a prompt — what one `record_response` call (or one
 * **Add reply…**) appended. Each is its own merge entry, stamped when it was written, so two
 * replicas that both reply keep both, in stamp order.
 *
 * A segment taken back (Undo of **Add reply…**, `removePromptResponse`) stays as a **tombstone**:
 * `removed: true`, its text emptied, its id and stamp kept. Removal is grow-only — once removed,
 * removed on every replica the merge reaches — so a copy that still holds the segment cannot bring
 * it back. A tombstone is never shown and takes none of the {@link PROMPT_LIMITS.maxResponseLength}
 * characters; it does count toward {@link PROMPT_LIMITS.maxResponseSegments}. The file writes it
 * as `{ id, at, removed: true }`, with no `text`.
 *
 * @typedef {object} ResponseSegment
 * @property {string} id Unique within its prompt: `reply-<replica>-<counter>`.
 * @property {string} text Clean, never empty — `''` on a tombstone only.
 * @property {import('./replica.js').Stamp} at
 * @property {true} [removed] A tombstone.
 */

/**
 * @typedef {object} PromptRecord
 * @property {string} id
 * @property {string} text Clean, at most {@link PROMPT_LIMITS.maxTextLength}.
 * @property {string[]} produced Record ids, sorted, each once.
 * @property {{ id: string, text: string }[]} [responses] `TODO/ai-032`: the reply, in stamp
 *   order; absent when there is none.
 */

/**
 * A prompt as a file stores it, validated: its reply segments keep their stamps.
 *
 * @typedef {object} StoredPrompt
 * @property {string} id
 * @property {string} text
 * @property {string[]} produced
 * @property {ResponseSegment[]} [responses]
 */

/**
 * A prompt as the merge state holds it, keyed by id.
 *
 * @typedef {object} PromptEntry
 * @property {string} text
 * @property {string[]} produced Sorted, each once.
 * @property {ResponseSegment[]} [responses] `TODO/ai-032`: in stamp order, at most
 *   {@link PROMPT_LIMITS.maxResponseLength} characters together; absent when there is none.
 */

/**
 * Intent's {@link cleanText} with bidi controls removed first, capped at
 * {@link PROMPT_LIMITS.maxTextLength}. Idempotent, so a stored text validates as clean.
 *
 * @param {unknown} value Anything; a non-string is no text at all.
 * @returns {string}
 */
export function cleanPromptText(value) {
  if (typeof value !== 'string') return ''
  return cleanText(value.replace(BIDI, ''), PROMPT_LIMITS.maxTextLength)
}

/**
 * What `record_prompt` (and `apply_records`' `prompt`) stores, or why it refuses.
 *
 * @param {unknown} value The user's words, as the agent received them.
 * @returns {{ ok: true, text: string, truncated: boolean } | { ok: false, reason: string }}
 */
export function preparePrompt(value) {
  if (typeof value !== 'string') return { ok: false, reason: 'the prompt must be text' }
  if (value.length > PROMPT_LIMITS.maxInputLength) {
    return {
      ok: false,
      reason:
        `the prompt is ${value.length} characters, over the cap of ${PROMPT_LIMITS.maxInputLength} this tool accepts — ` +
        `send the user's words as received; the first ${PROMPT_LIMITS.maxTextLength} characters are kept`,
    }
  }
  const whole = cleanText(value.replace(BIDI, ''), Infinity)
  if (whole === '') return { ok: false, reason: 'the prompt is empty' }
  const truncated = whole.length > PROMPT_LIMITS.maxTextLength
  return { ok: true, text: truncated ? cleanText(whole, PROMPT_LIMITS.maxTextLength) : whole, truncated }
}

/**
 * `TODO/ai-032`: what `record_response` (and **Add reply…**) appends, or why it refuses. Cleaned
 * and bounded exactly as {@link preparePrompt}; cut to `room`, the characters the prompt's reply
 * has left under {@link PROMPT_LIMITS.maxResponseLength}.
 *
 * @param {unknown} value The agent's final message, or the text a person pasted.
 * @param {number} [room] Characters still free in this prompt's reply.
 * @returns {{ ok: true, text: string, truncated: boolean } | { ok: false, reason: string }}
 */
export function prepareResponse(value, room = PROMPT_LIMITS.maxResponseLength) {
  if (typeof value !== 'string') return { ok: false, reason: 'the reply must be text' }
  if (value.length > PROMPT_LIMITS.maxInputLength) {
    return {
      ok: false,
      reason: `the reply is ${value.length} characters, over the cap of ${PROMPT_LIMITS.maxInputLength} this tool accepts`,
    }
  }
  const whole = cleanText(value.replace(BIDI, ''), Infinity)
  if (whole === '') return { ok: false, reason: 'the reply is empty' }
  const free = Math.min(Math.max(0, Math.floor(room)), PROMPT_LIMITS.maxResponseLength)
  if (free === 0) {
    return { ok: false, reason: `the reply to this prompt is full: it already holds the cap of ${PROMPT_LIMITS.maxResponseLength} characters` }
  }
  const truncated = whole.length > free
  return { ok: true, text: truncated ? cleanText(whole, free) : whole, truncated }
}

/**
 * The reply as a reader sees it: the live segments joined by a blank line (`''` for none).
 *
 * @param {{ responses?: readonly { text: string, removed?: true }[] }} prompt
 * @returns {string}
 */
export function responseTextOf(prompt) {
  return (prompt.responses ?? [])
    .filter((segment) => segment.removed !== true)
    .map((segment) => segment.text)
    .join('\n\n')
}

/**
 * `TODO/ai-032`: the segment as its tombstone — text gone, id and stamp kept.
 *
 * @param {ResponseSegment} segment
 * @returns {ResponseSegment}
 */
export function tombstoneOf(segment) {
  return { id: segment.id, text: '', at: segment.at, removed: true }
}

/**
 * @param {readonly { text: string }[]} segments
 * @returns {number}
 */
function responseLength(segments) {
  let total = 0
  for (const segment of segments) total += segment.text.length
  return total
}

/**
 * @param {unknown} id
 * @returns {boolean}
 */
function isId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= PROMPT_LIMITS.maxIdLength && ID.test(id)
}

/**
 * Validate one stored prompt record — from a file, a merge, or the command layer. Strict: text
 * must already be clean (what {@link cleanPromptText} would store) and within the cap, so a
 * hostile record is refused rather than repaired. `produced` is sorted on the way out; a field
 * this build does not know is ignored.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, record: StoredPrompt } | { ok: false, reason: string }}
 */
export function validatePromptRecord(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'a prompt must be an object' }
  const record = /** @type {Record<string, unknown>} */ (raw)
  if (!isId(record.id)) {
    return { ok: false, reason: `its id must be 1-${PROMPT_LIMITS.maxIdLength} characters of letters, digits and . _ : -` }
  }
  const text = record.text
  if (typeof text !== 'string') return { ok: false, reason: 'its text must be text' }
  if (text === '') return { ok: false, reason: 'its text is empty' }
  if (text.length > PROMPT_LIMITS.maxTextLength) return { ok: false, reason: `its text is over the cap of ${PROMPT_LIMITS.maxTextLength} characters` }
  if (cleanPromptText(text) !== text) {
    return { ok: false, reason: 'its text has control or bidirectional-override characters, or is not clean' }
  }
  const produced = record.produced ?? []
  if (!Array.isArray(produced)) return { ok: false, reason: 'its produced must be a list of record ids' }
  if (produced.length > PROMPT_LIMITS.maxProduced) return { ok: false, reason: `its produced names more than ${PROMPT_LIMITS.maxProduced} records` }
  if (!produced.every(isId)) return { ok: false, reason: 'its produced must be a list of record ids' }
  if (new Set(produced).size !== produced.length) return { ok: false, reason: 'its produced names a record twice' }
  /** @type {StoredPrompt} */
  const valid = { id: /** @type {string} */ (record.id), text, produced: [...produced].sort(compareIds) }
  if (record.responses !== undefined) {
    const responses = readResponses(record.responses)
    if (!responses.ok) return responses
    if (responses.segments.length > 0) valid.responses = responses.segments
  }
  return { ok: true, record: valid }
}

/**
 * `TODO/ai-032`: a stored record's reply segments, strictly — every segment's text clean and
 * non-empty, its id once, its stamp a real one, and all of them within the cap together.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, segments: ResponseSegment[] } | { ok: false, reason: string }}
 */
function readResponses(raw) {
  if (!Array.isArray(raw)) return { ok: false, reason: 'its responses must be a list of reply segments' }
  if (raw.length > PROMPT_LIMITS.maxResponseSegments) {
    return { ok: false, reason: `its responses hold more than ${PROMPT_LIMITS.maxResponseSegments} reply segments` }
  }
  /** @type {ResponseSegment[]} */
  const segments = []
  const ids = new Set()
  for (const item of raw) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: 'a reply segment must be an object' }
    const segment = /** @type {Record<string, unknown>} */ (item)
    if (!isId(segment.id)) return { ok: false, reason: 'a reply segment’s id must be letters, digits and . _ : -' }
    if (ids.has(segment.id)) return { ok: false, reason: 'a reply segment id appears twice' }
    ids.add(segment.id)
    if (segment.removed !== undefined) {
      // A tombstone: `removed: true` and no text, exactly.
      if (segment.removed !== true) return { ok: false, reason: 'a reply segment’s removed must be true' }
      if (segment.text !== undefined) return { ok: false, reason: 'a removed reply segment must carry no text' }
      const at = readStamp(segment.at)
      if (at === null) return { ok: false, reason: 'a reply segment’s stamp must be [counter, replica]' }
      segments.push(tombstoneOf({ id: /** @type {string} */ (segment.id), text: '', at }))
      continue
    }
    if (typeof segment.text !== 'string') return { ok: false, reason: 'a reply segment’s text must be text' }
    if (segment.text === '') return { ok: false, reason: 'a reply segment is empty' }
    if (segment.text.length > PROMPT_LIMITS.maxResponseLength || cleanText(segment.text.replace(BIDI, ''), PROMPT_LIMITS.maxResponseLength) !== segment.text) {
      return { ok: false, reason: 'a reply segment has control or bidirectional-override characters, or is not clean' }
    }
    const at = readStamp(segment.at)
    if (at === null) return { ok: false, reason: 'a reply segment’s stamp must be [counter, replica]' }
    segments.push({ id: /** @type {string} */ (segment.id), text: segment.text, at })
  }
  if (responseLength(segments) > PROMPT_LIMITS.maxResponseLength) {
    return { ok: false, reason: `its reply is over the cap of ${PROMPT_LIMITS.maxResponseLength} characters` }
  }
  return { ok: true, segments: segments.sort(compareSegments) }
}

/**
 * @param {unknown} raw `[counter, replica]`, as the file writes a stamp.
 * @returns {import('./replica.js').Stamp | null}
 */
function readStamp(raw) {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  const [counter, replica] = raw
  if (!Number.isSafeInteger(counter) || counter < 1 || counter > PROMPT_LIMITS.maxCounter) return null
  if (!isReplicaId(replica)) return null
  return { counter, replica }
}

/**
 * Stamp order, then id — a total order, the same on every replica.
 *
 * @param {ResponseSegment} a
 * @param {ResponseSegment} b
 * @returns {number}
 */
function compareSegments(a, b) {
  return compareStamps(a.at, b.at) || compareIds(a.id, b.id)
}

/**
 * `TODO/ai-032`: two replies to one prompt as one. Segments are a grow-only set by id, in stamp
 * order; one id with two different segments (only a hostile file makes that) is settled by the
 * shorter text, then the smaller, then the earlier stamp — the same in every merge order. A
 * tombstone beats a live segment of its id, always: an Undone reply stays undone. Then the cap:
 * tombstones are kept and take no room; live segments are kept in order while they fit, the one
 * that crosses it is cut with `…`, the rest are left out — so a cut segment and its whole original settle on the cut one, and the
 * join stays commutative, associative and idempotent.
 *
 * @param {readonly ResponseSegment[] | undefined} a
 * @param {readonly ResponseSegment[] | undefined} b
 * @returns {ResponseSegment[]}
 */
export function joinResponses(a, b) {
  /** @type {Map<string, ResponseSegment>} */
  const byId = new Map()
  for (const segment of [...(a ?? []), ...(b ?? [])]) {
    const held = byId.get(segment.id)
    if (held === undefined || preferSegment(segment, held)) byId.set(segment.id, segment)
  }
  /** @type {ResponseSegment[]} */
  const kept = []
  /** @type {number} */
  let room = PROMPT_LIMITS.maxResponseLength
  for (const segment of [...byId.values()].sort(compareSegments)) {
    if (kept.length >= PROMPT_LIMITS.maxResponseSegments) break
    // A tombstone takes no room and is kept past the cap: dropping it would let a copy that still
    // holds the segment bring it back.
    if (segment.removed === true) {
      kept.push(segment)
      continue
    }
    if (room <= 0) continue
    if (segment.text.length <= room) {
      kept.push(segment)
      room -= segment.text.length
      continue
    }
    kept.push({ ...segment, text: cleanText(segment.text, room) })
    room = 0
  }
  return kept
}

/**
 * @param {ResponseSegment} x
 * @param {ResponseSegment} y
 * @returns {boolean} Whether `x` wins over `y` for one id.
 */
function preferSegment(x, y) {
  // Removal wins: Undo of a reply holds on every replica. Two tombstones: the earlier stamp.
  if ((x.removed === true) !== (y.removed === true)) return x.removed === true
  if (x.removed === true) return compareStamps(x.at, y.at) < 0
  if (x.text.length !== y.text.length) return x.text.length < y.text.length
  if (x.text !== y.text) return x.text < y.text
  return compareStamps(x.at, y.at) < 0
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Two sorted id lists as one, sorted, each once, at most {@link PROMPT_LIMITS.maxProduced}.
 *
 * @param {readonly string[]} a
 * @param {readonly string[]} b
 * @returns {string[]}
 */
export function unionProduced(a, b) {
  return [...new Set([...a, ...b])].sort(compareIds).slice(0, PROMPT_LIMITS.maxProduced)
}

/**
 * The merge rule (`docs/decisions/document-sync.md`): prompts are a **grow-only set** keyed by
 * id. Both sides' prompts are kept; one prompt on both sides keeps the union of what it produced.
 * Its reply segments join by {@link joinResponses} (`TODO/ai-032`), so two replicas that both
 * reply keep both. Text never changes after a prompt is recorded, so two texts under one id only come from a
 * hostile file — settled by the smaller string, the same in every merge order. Commutative,
 * associative and idempotent, and needs no stamp. Past {@link PROMPT_LIMITS.maxPrompts}, the
 * first ids in sorted order are kept.
 *
 * @param {ReadonlyMap<string, PromptEntry> | undefined} a
 * @param {ReadonlyMap<string, PromptEntry> | undefined} b
 * @returns {Map<string, PromptEntry>}
 */
export function joinPromptMaps(a, b) {
  /** @type {Map<string, PromptEntry>} */
  const joined = new Map()
  const ids = [...new Set([...(a?.keys() ?? []), ...(b?.keys() ?? [])])].sort(compareIds).slice(0, PROMPT_LIMITS.maxPrompts)
  for (const id of ids) {
    const x = a?.get(id)
    const y = b?.get(id)
    if (!x || !y) {
      joined.set(id, /** @type {PromptEntry} */ (x ?? y))
      continue
    }
    if (x === y) {
      joined.set(id, x)
      continue
    }
    const text = x.text <= y.text ? x.text : y.text
    // `TODO/ai-032`: both sides' replies, each segment kept once, in stamp order, capped.
    const responses = x.responses === undefined && y.responses === undefined ? [] : joinResponses(x.responses, y.responses)
    joined.set(id, { text, produced: unionProduced(x.produced, y.produced), ...(responses.length > 0 ? { responses } : {}) })
  }
  return joined
}

/**
 * Every record id that makes up a body: its own lineage, and — through `consumes` — the lineages
 * of the bodies a boolean or a group retired into it. A snap's reference body (an operand that is
 * not consumed) is not part of it.
 *
 * @param {Pick<import('./document.js').WarpDocument, 'lineageOf'>} document
 * @param {string} bodyId
 * @returns {Set<string>}
 */
function idsMakingUp(document, bodyId) {
  /** @type {Set<string>} */
  const ids = new Set()
  const pending = [bodyId]
  // Bounded: a hostile log cannot make this walk forever.
  for (let guard = 0; pending.length > 0 && guard < 10_000; guard += 1) {
    const next = /** @type {string} */ (pending.pop())
    if (ids.has(next)) continue
    const lineage = document.lineageOf(next)
    if (lineage.length === 0) ids.add(next)
    for (const record of lineage) {
      if (record.id !== undefined) ids.add(record.id)
      const consumes = /** @type {{ consumes?: unknown }} */ (record).consumes
      if (Array.isArray(consumes)) for (const id of consumes) if (typeof id === 'string' && !ids.has(id)) pending.push(id)
    }
  }
  return ids
}

/**
 * The prompts that produced a body — any record in its lineage, or in a body it consumed.
 *
 * @param {Pick<import('./document.js').WarpDocument, 'lineageOf' | 'prompts'>} document
 * @param {string} bodyId
 * @returns {PromptRecord[]}
 */
export function promptsForBody(document, bodyId) {
  const prompts = document.prompts()
  if (prompts.length === 0) return []
  const ids = idsMakingUp(document, bodyId)
  return prompts.filter((prompt) => prompt.produced.some((id) => ids.has(id)))
}

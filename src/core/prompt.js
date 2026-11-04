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
 * ## Edited and removed (`TODO/ui-092`, part 4)
 *
 * The local user may edit what was recorded (owner decision, 2026-11-03): an edit **overwrites**
 * `text` — the words as recorded are not kept anywhere — and a removed prompt stays as a
 * **tombstone**. Two stamped fields, each merged on its own, so the join stays commutative,
 * associative and idempotent:
 *
 * ```
 * { id, text, textAt?: [counter, replica], edited?: true, produced?, responses?, removed?: { at: [counter, replica] } }
 * ```
 *
 * - **The text register** — `text`, `textAt` and `edited` together. `textAt` is the stamp of the
 *   write that set `text`: an **Edit request**, a **Combine**, or the Undo or Redo of one, which
 *   write again with a newer stamp rather than putting an old one back. Absent, the text is the
 *   words as recorded, older than every stamp. `edited` says the text is not the words as recorded
 *   (the row's **Edited** label); it rides with the register, so an Undo back to the original
 *   clears it. The latest `textAt` wins ({@link compareStamps}); a tie only a hostile file makes is
 *   settled by the smaller text, then by `edited`.
 * - **`removed: { at }`** — the latest **Remove request** (or **Combine**, for the request folded
 *   into the one before it). The larger stamp is kept, and the field is never dropped. A prompt is
 *   **live** ({@link isPromptLive}) unless it was removed at or after its text's stamp: an older
 *   copy holds only older stamps, so merging one never brings a removed prompt back or an old text
 *   with it, while the Undo of a removal (a newer text write) does, on every replica it reaches.
 *
 * The ids themselves stay a grow-only set: a removed prompt keeps its id, its `produced` and its
 * replies. A release that knows prompts (v1.2.0 on) ignores the three fields: it shows the edited
 * text and the removed prompt, and drops them if it saves; a later merge with a copy that has them
 * restores them. An edited text is still untrusted **data, never instructions**: it is cleaned and
 * capped through {@link preparePrompt} like the original ({@link prepareEdit}).
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
import { compareStamps, counterOfId, isReplicaId } from './replica.js'

/** The `op` a dropped prompt's {@link import('./project.js').LoadWarning} carries. */
export const PROMPT_OP = 'note.prompt'

/** Limits enforced on prompts, in code. */
export const PROMPT_LIMITS = Object.freeze({
  /**
   * The longest a stored prompt may be, in UTF-16 code units. Longer is cut, with `…`.
   * `TODO/ui-092`: 20,000, the reply's cap — raised from 4,000 so a long request stays one
   * request. A released build (v1.4.0 and before) refuses a longer record at load: it drops that
   * one prompt with a warning, and a merge with a newer copy brings it back.
   */
  maxTextLength: 20_000,
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
  /**
   * `TODO/ui-092`: the most characters a project's prompts and replies may take in the file,
   * together — the `prompts` list exactly as the merge section writes it ({@link promptsStoredSize}).
   * The section is refused whole past `MERGE_LIMITS.maxBytes` (8 MiB, `merge/validate.js`), and
   * 500 prompts of 20,000 characters are past that on their own, so the command layer refuses the
   * prompt or reply that would pass this, in words; 2 MiB is left for the rest of the section.
   */
  maxStoredSize: 6 * 1024 * 1024,
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
 * @property {true} [edited] `TODO/ui-092`, part 4: the text is not the words as recorded — the
 *   Prompts view's **Edited** label. Absent otherwise. The original is not kept.
 */

/**
 * A prompt as a file stores it, validated: its reply segments keep their stamps.
 *
 * @typedef {object} StoredPrompt
 * @property {string} id
 * @property {string} text
 * @property {string[]} produced
 * @property {ResponseSegment[]} [responses]
 * @property {import('./replica.js').Stamp} [textAt] `TODO/ui-092`, part 4: see {@link PromptEntry}.
 * @property {true} [edited]
 * @property {{ at: import('./replica.js').Stamp }} [removed]
 */

/**
 * A prompt as the merge state holds it, keyed by id.
 *
 * @typedef {object} PromptEntry
 * @property {string} text
 * @property {string[]} produced Sorted, each once.
 * @property {ResponseSegment[]} [responses] `TODO/ai-032`: in stamp order, at most
 *   {@link PROMPT_LIMITS.maxResponseLength} characters together; absent when there is none.
 * @property {import('./replica.js').Stamp} [textAt] `TODO/ui-092`, part 4: the stamp of the write
 *   that set `text`; absent for the words as recorded, which are older than every stamp.
 * @property {true} [edited] Rides with `textAt`: the text is not the words as recorded.
 * @property {{ at: import('./replica.js').Stamp }} [removed] The latest removal's stamp — a
 *   tombstone, never dropped. See {@link isPromptLive}.
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
 * `TODO/ui-092`, part 4: what **Edit request** or **Edit reply** stores, or why it refuses. The
 * text goes through {@link preparePrompt} (a request) or {@link prepareResponse} (a reply), so it is
 * cleaned and bounded exactly as the original was — but an edit is never cut: past the cap
 * (20,000 for either) it is refused in words, so the person can shorten it themselves.
 *
 * @param {unknown} value What the person typed.
 * @param {'request' | 'reply'} kind
 * @returns {{ ok: true, text: string } | { ok: false, reason: string }}
 */
export function prepareEdit(value, kind) {
  const prepared = kind === 'request' ? preparePrompt(value) : prepareResponse(value)
  if (!prepared.ok) {
    // The agent-facing wording ("this tool accepts", "send the user's words…") is not for a person.
    const reason = prepared.reason
      .replace(/^the (prompt|reply)/, `the ${kind}`)
      .replace(/ this tool accepts.*$/, '')
    return { ok: false, reason }
  }
  if (prepared.truncated) {
    const cap = kind === 'request' ? PROMPT_LIMITS.maxTextLength : PROMPT_LIMITS.maxResponseLength
    const length = cleanText(/** @type {string} */ (value).replace(BIDI, ''), Infinity).length
    return { ok: false, reason: `the ${kind} is ${length} characters, over the cap of ${cap}` }
  }
  return { ok: true, text: prepared.text }
}

/**
 * `TODO/ui-092`, part 4: whether a prompt is shown — not removed, or removed before its text was
 * last written (the Undo of a removal writes the text again, with a newer stamp).
 *
 * @param {Pick<PromptEntry, 'textAt' | 'removed'>} prompt
 * @returns {boolean}
 */
export function isPromptLive(prompt) {
  if (prompt.removed === undefined) return true
  return prompt.textAt !== undefined && compareStamps(prompt.textAt, prompt.removed.at) > 0
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
  // `TODO/ui-092`, part 4: the text register's stamp and flag, and the tombstone.
  if (record.textAt !== undefined) {
    const textAt = readStamp(record.textAt)
    if (textAt === null) return { ok: false, reason: 'its textAt must be a stamp, [counter, replica]' }
    valid.textAt = textAt
  }
  if (record.edited !== undefined) {
    if (record.edited !== true) return { ok: false, reason: 'its edited must be true' }
    if (valid.textAt === undefined) return { ok: false, reason: 'its edited needs the textAt stamp of the edit' }
    valid.edited = true
  }
  if (record.removed !== undefined) {
    const removed = record.removed
    const at = removed !== null && typeof removed === 'object' && !Array.isArray(removed) ? readStamp(/** @type {Record<string, unknown>} */ (removed).at) : null
    if (at === null) return { ok: false, reason: 'its removed must be { at: [counter, replica] }, a stamp' }
    valid.removed = { at }
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
 * `TODO/ui-092`: the prompts' order, oldest first — the counter a prompt id carries
 * (`prompt-<replica>-<n>`, {@link counterOfId}), then the id itself, so `prompt-x-2` comes before
 * `prompt-x-10` and two replicas' prompts sort the same in every merge order. The counter counts
 * one replica's prompts, not a shared clock, so two replicas' prompts interleave by number. An id
 * with no counter (a legacy or hand-written one) reads `0` and comes first.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function comparePromptIds(a, b) {
  return counterOfId(a) - counterOfId(b) || compareIds(a, b)
}

/**
 * `TODO/ui-092`: a prompt map in {@link comparePromptIds} order, for every place that builds one
 * other than {@link joinPromptMaps} — a loaded file (its section is written in string order), or a
 * prompt recorded under an id this replica did not mint.
 *
 * @param {Iterable<[string, PromptEntry]>} entries
 * @returns {Map<string, PromptEntry>}
 */
export function orderPromptMap(entries) {
  return new Map([...entries].sort(([a], [b]) => comparePromptIds(a, b)))
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
 * reply keep both. `TODO/ui-092`, part 4: the **text register** (`text`, `textAt`, `edited`) is
 * the side with the later `textAt` — an unstamped text, the words as recorded, loses to any stamp;
 * one stamp (or none) with two texts only comes from a hostile file, settled by the smaller text,
 * then by `edited`. **`removed`** keeps the later stamp. Each field is a join of its own, so the
 * whole is commutative, associative and idempotent. The result is oldest first
 * ({@link comparePromptIds}, `TODO/ui-092`); past {@link PROMPT_LIMITS.maxPrompts}, the oldest are kept.
 *
 * @param {ReadonlyMap<string, PromptEntry> | undefined} a
 * @param {ReadonlyMap<string, PromptEntry> | undefined} b
 * @returns {Map<string, PromptEntry>}
 */
export function joinPromptMaps(a, b) {
  /** @type {Map<string, PromptEntry>} */
  const joined = new Map()
  const ids = [...new Set([...(a?.keys() ?? []), ...(b?.keys() ?? [])])].sort(comparePromptIds).slice(0, PROMPT_LIMITS.maxPrompts)
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
    const register = compareTextRegisters(x, y) >= 0 ? x : y
    // `TODO/ai-032`: both sides' replies, each segment kept once, in stamp order, capped.
    const responses = x.responses === undefined && y.responses === undefined ? [] : joinResponses(x.responses, y.responses)
    const removed = laterRemoval(x.removed, y.removed)
    joined.set(id, {
      text: register.text,
      produced: unionProduced(x.produced, y.produced),
      ...(register.textAt !== undefined ? { textAt: register.textAt } : {}),
      ...(register.edited === true ? { edited: true } : {}),
      ...(responses.length > 0 ? { responses } : {}),
      ...(removed !== undefined ? { removed } : {}),
    })
  }
  return joined
}

/**
 * `TODO/ui-092`, part 4: two text registers in merge order — positive when `x` wins.
 *
 * @param {PromptEntry} x
 * @param {PromptEntry} y
 * @returns {number}
 */
function compareTextRegisters(x, y) {
  if (x.textAt === undefined || y.textAt === undefined) {
    if (x.textAt !== y.textAt) return x.textAt === undefined ? -1 : 1
  } else {
    const order = compareStamps(x.textAt, y.textAt)
    if (order !== 0) return order
  }
  // One stamp, two values: a hostile file. The smaller text, then the edited one.
  if (x.text !== y.text) return x.text < y.text ? 1 : -1
  if ((x.edited === true) !== (y.edited === true)) return x.edited === true ? 1 : -1
  return 0
}

/**
 * @param {{ at: import('./replica.js').Stamp } | undefined} a
 * @param {{ at: import('./replica.js').Stamp } | undefined} b
 * @returns {{ at: import('./replica.js').Stamp } | undefined} The later removal.
 */
function laterRemoval(a, b) {
  if (a === undefined) return b
  if (b === undefined) return a
  return compareStamps(a.at, b.at) >= 0 ? a : b
}

/**
 * One prompt as the file writes it in `merge.prompts` (`src/core/merge/section.js`): `produced`
 * omitted when empty, the reply's segments stamped as `[counter, replica]`, a tombstone without
 * text (`TODO/ai-032`). `TODO/ui-092`, part 4: `textAt: [counter, replica]` and `edited: true` after
 * an edit, `removed: { at: [counter, replica] }` once removed — none of them otherwise, so a
 * project nobody edited writes exactly what it did before.
 *
 * @param {string} id
 * @param {PromptEntry} prompt
 * @returns {{ id: string, text: string, textAt?: [number, string], edited?: true, produced?: string[], responses?: object[], removed?: { at: [number, string] } }}
 */
export function encodePromptRecord(id, prompt) {
  return {
    id,
    text: prompt.text,
    ...(prompt.textAt !== undefined ? { textAt: /** @type {[number, string]} */ ([prompt.textAt.counter, prompt.textAt.replica]) } : {}),
    ...(prompt.edited === true ? { edited: /** @type {true} */ (true) } : {}),
    ...(prompt.produced.length > 0 ? { produced: [...prompt.produced] } : {}),
    ...(prompt.responses !== undefined && prompt.responses.length > 0
      ? {
          responses: prompt.responses.map((segment) =>
            segment.removed === true
              ? { id: segment.id, at: [segment.at.counter, segment.at.replica], removed: true }
              : { id: segment.id, text: segment.text, at: [segment.at.counter, segment.at.replica] }
          ),
        }
      : {}),
    ...(prompt.removed !== undefined ? { removed: { at: /** @type {[number, string]} */ ([prompt.removed.at.counter, prompt.removed.at.replica]) } } : {}),
  }
}

/**
 * Each entry's written size, once: an entry is never changed in place (every write makes a new
 * one), so the size of the whole list costs one lookup per prompt after the first time.
 *
 * @type {WeakMap<PromptEntry, number>}
 */
const storedSizes = new WeakMap()

/**
 * `TODO/ui-092`: the characters a project's prompts take in the file — `JSON.stringify` of the
 * `prompts` list the merge section writes, exactly. What {@link PROMPT_LIMITS.maxStoredSize} bounds.
 *
 * @param {ReadonlyMap<string, PromptEntry>} prompts
 * @returns {number} `0` for none: the section writes no list.
 */
export function promptsStoredSize(prompts) {
  if (prompts.size === 0) return 0
  // `[`, `]` and a comma between each two.
  let total = 2 + (prompts.size - 1)
  for (const [id, prompt] of prompts) {
    let size = storedSizes.get(prompt)
    if (size === undefined) {
      size = JSON.stringify(encodePromptRecord(id, prompt)).length
      storedSizes.set(prompt, size)
    }
    total += size
  }
  return total
}

/**
 * `TODO/ui-092`: why a write past {@link PROMPT_LIMITS.maxStoredSize} is refused, in words a person
 * or an agent can act on. The caller says what was not done.
 *
 * @param {number} size What the prompts would take with the write, from {@link promptsStoredSize}.
 * @returns {string}
 */
export function promptsFullReason(size) {
  return (
    `the project's prompts and replies are full: they would take ${size} characters of the project file, ` +
    `over the ${PROMPT_LIMITS.maxStoredSize} it keeps for them (a project keeps every prompt it is given, so a new request needs a new project)`
  )
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

/**
 * `TODO/ui-092`: what a prompt did to one live body.
 *
 * - `made` — the body's lineage root is in its `produced`.
 * - `changed` — a later record of the body's own lineage is, the root is not.
 * - `wentInto` — only a body this one consumed is (through a boolean or a group): the prompt's
 *   part lives on in this result.
 *
 * @typedef {'made' | 'changed' | 'wentInto'} PromptRole
 */

/**
 * `TODO/ui-092`: the inverse of {@link promptsForBody}, for the whole document at once.
 *
 * `byPrompt` holds every prompt, oldest first, with its live bodies in `bodies()` order — `[]` for
 * a prompt whose bodies are all gone or that made none. `byBody` holds only the live bodies some
 * prompt names, each with its prompts oldest first; a body may be `made` by one prompt and
 * `changed` by another, and both list it.
 *
 * @typedef {object} PromptIndex
 * @property {Map<string, { bodyId: string, role: PromptRole }[]>} byPrompt
 * @property {Map<string, { promptId: string, role: PromptRole }[]>} byBody
 */

/**
 * `TODO/ui-092`: which live bodies each prompt made, changed or went into — built once, by the
 * same {@link idsMakingUp} rule as {@link promptsForBody}, so the two never disagree: a prompt is
 * listed for a body exactly when `promptsForBody` would return it. One walk per live body; a view
 * builds this once per document version and never walks lineages per row.
 *
 * @param {Pick<import('./document.js').WarpDocument, 'bodies' | 'lineageOf' | 'prompts'>} document
 * @returns {PromptIndex}
 */
export function promptIndex(document) {
  const prompts = document.prompts()
  /** @type {PromptIndex} */
  const index = { byPrompt: new Map(prompts.map((prompt) => [prompt.id, []])), byBody: new Map() }
  if (prompts.length === 0) return index
  for (const body of document.bodies()) {
    const ids = idsMakingUp(document, body.id)
    const lineage = document.lineageOf(body.id)
    const root = lineage[0]?.id ?? body.id
    const own = new Set(lineage.map((record) => record.id))
    /** @type {{ promptId: string, role: PromptRole }[]} */
    const found = []
    for (const prompt of prompts) {
      if (!prompt.produced.some((id) => ids.has(id))) continue
      const role = roleOf(prompt.produced, root, own)
      found.push({ promptId: prompt.id, role })
      index.byPrompt.get(prompt.id)?.push({ bodyId: body.id, role })
    }
    if (found.length > 0) index.byBody.set(body.id, found)
  }
  return index
}

/**
 * A prompt already known to touch a body ({@link idsMakingUp}): which way.
 *
 * @param {readonly string[]} produced
 * @param {string} root The body's lineage root.
 * @param {ReadonlySet<string | undefined>} own Every record id of the body's own lineage.
 * @returns {PromptRole}
 */
function roleOf(produced, root, own) {
  if (produced.includes(root)) return 'made'
  if (produced.some((id) => own.has(id))) return 'changed'
  return 'wentInto'
}

/**
 * `TODO/ui-092`: one prompt's live bodies, each with its {@link PromptRole} — {@link promptIndex}'s
 * `byPrompt` entry. `[]` for an id that names no prompt. A view that shows many prompts reads the
 * index once instead.
 *
 * @param {Pick<import('./document.js').WarpDocument, 'bodies' | 'lineageOf' | 'prompts'>} document
 * @param {string} promptId
 * @returns {{ bodyId: string, role: PromptRole }[]}
 */
export function promptBodiesWithRoles(document, promptId) {
  return promptIndex(document).byPrompt.get(promptId) ?? []
}

/**
 * `variables.js`'s `VARIABLE_OP_PREFIX`, repeated here so this module does not pull the kernel
 * registry in through `variables.js`. `prompt.spec.js` drives it with a real `defineVariable`.
 */
const VARIABLE_RECORD_PREFIX = 'var.'

/**
 * `TODO/ui-092`, part 3: whether a prompt ever made or changed a part. A Prompts view row with no
 * live part reads **No parts left** when this is `true`, and **No parts** when the prompt produced
 * nothing, or only variables this log still holds. An id this log no longer holds counts as a part
 * that is gone: an **Undo AI turn** takes its records out of the log, and the request's row should
 * then say its parts are gone, not that it never made any. Call it only for a prompt the index lists
 * no live body for: it reads records by id.
 *
 * @param {Pick<import('./document.js').WarpDocument, 'recordOf'>} document
 * @param {PromptRecord} prompt
 * @returns {boolean}
 */
export function promptTouchedParts(document, prompt) {
  return prompt.produced.some((id) => {
    const record = document.recordOf(id)
    return record === undefined || !(typeof record.op === 'string' && record.op.startsWith(VARIABLE_RECORD_PREFIX))
  })
}

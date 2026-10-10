// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The on-storage / on-disk form of a whole document (`TODO/io-001`).
 *
 * One format, two transports: the IndexedDB autosave blob and a saved project
 * file are **the same bytes** — "a manual Save As is just the same bytes autosave
 * already writes, offered as a download". `src/core/ndjson.js` still owns line
 * serialisation; this module owns *what goes in the lines* beyond the action
 * records themselves.
 *
 * ## Why there is a state line at all
 *
 * The action log is not the whole document. Three things live on the
 * {@link import('./document.js').DocumentEntry} / the marker, not on the records:
 *
 * - **suppressed** rows (`data-004`, section 16) — in the log, out of the fold;
 * - rows **left broken** (`TODO/ui-052`) — the user committed a change that broke them
 *   and chose to fix it later, so the fold tolerates them and the History badges them.
 *   Written as `leftBroken: [ids]` beside `suppressed`, and only when there is one. A
 *   build from before this field ignores it and refuses the file by naming the broken
 *   row, which is the honest outcome — it cannot fold that row either;
 * - the **rollback marker** (section 18: "a rollback point *is* document state
 *   and is persisted");
 * - each entry's **origin** (`local`, `mcp`, …), which the History chip reads;
 * - the design **resolution** (`TODO/core-035`) — how finely curves are faceted.
 *   Absent means `legacy` (the old fixed 32), so a file saved before the setting
 *   existed reopens byte-identical; a `legacy` document therefore never writes it. An
 *   empty file has no geometry to keep, so it reads as a new document's default.
 * - each entry's design **intent** (`TODO/ai-003`), as `intents: { id: text }`, and the
 *   project's **standingInstructions** — see "Design intent" below.
 * - the printer's **buildVolume** (`TODO/io-007`), `{ widthMm, depthMm, heightMm }` — written
 *   only when it differs from the 220 × 220 × 250 mm default, so a document that never touched
 *   it keeps its bytes. Validated like any other field: a malformed volume refuses the file.
 * - the **user-part definitions** (`TODO/core-037`) the records use, as `parts: [definition]`
 *   in op order — see "User parts" below.
 *
 * A restore that dropped them would be silently unfaithful in the worst way — a
 * rolled-back document reopening fully rolled *forward* shows the user geometry
 * they had deliberately taken out of play — so they are persisted, not refused.
 * They go in **one trailing line** rather than as flags spliced into the records,
 * so every record line stays byte-identical to what the command layer appended
 * (records are the log; this is metadata about how to fold it):
 *
 * ```
 * {"warpcad":"project-state","version":1,"suppressed":["op-3"],"rollbackAt":2,"origins":{"op-5":"mcp"}}
 * ```
 *
 * The line is written **only when there is something to say**, so an ordinary
 * document is byte-identical to the plain NDJSON action log every earlier reader
 * (and `mcp/`) understands. Every field is optional.
 *
 * ## Design intent (`TODO/ai-003`)
 *
 * Both fields are untrusted text from whoever wrote the file. They go in the state line, so
 * every record line stays byte-identical (what `mcp/` and older readers rely on), and the
 * line's **version stays 1**: a build that predates them ignores a state-line field it has
 * no reader for (`project.spec.js` pins that), so it still opens the file — it just does not
 * show or keep the intent. A version bump would have made every older build refuse the file.
 *
 * The strictness rule applied to them: a wrong *type* (an intent that is not text, an
 * `intents` that is not a map, an intent naming no record, non-text instructions) is refused
 * like any other malformed state line; text that is merely too **long** is cut to its cap
 * (`src/core/intent.js`) rather than costing the user the whole file over an advisory note.
 *
 * ## User parts (`TODO/core-037`)
 *
 * A record may name a user part (`user.<slug>`), whose definition is plain-JSON op records
 * (`src/core/userPart.js`). The file carries every definition its records use — directly or
 * nested in another part — so it rebuilds on a machine whose local library has never seen
 * the part. Only those are written: a definition whose last instance was undone is dropped.
 *
 * A state-line section rather than a `library.define` record, decided by reading this file:
 * a definition builds nothing, so as a record it would be a History row, an Undo step and a
 * "body" with no geometry that every reader of the log (`document.js`'s lineage indexes,
 * `ui-032`'s panel, `mcp/`) would have to learn to skip. Here, every record line stays
 * byte-identical, and the state line's **version stays 1**: a build that predates parts
 * ignores the field (as it does `intents`) and then meets `user.…` as an op it does not
 * know — refusing the file by naming that step, the way every unknown op is refused.
 *
 * The strictness rule applied to it: `parts` that is not a list is refused like any other
 * malformed field. An individual **bad definition** is not — it is untrusted data about one
 * part, so it is skipped with a {@link LoadWarning} naming it and why, and every record that
 * uses it (or builds on one that does) loads **left broken** (`TODO/ui-052`): badged in the
 * History, out of the fold, fixable. The same goes for a part the records name but the file
 * does not carry. The local library's copy is never substituted for a project's missing or
 * bad one; that would change a placed instance without the user choosing it.
 *
 * ## Refusal, not repair
 *
 * {@link parseProject} is strict where `parseNdjson` is lenient. The lenient
 * reader exists so one bad line in a *remote* document still renders the rest;
 * Open's contract (section 10) is the opposite — "fully parsed and validated
 * before anything is replaced; a bad file leaves the current project untouched" —
 * because a half-loaded project the user then autosaves over their real one is
 * the failure to prevent. So any bad line refuses the whole file, by line number.
 *
 * Framework-free: string in, plain data out. No DOM, no storage.
 *
 * @module core/project
 */

import { DEFAULT_BUILD_VOLUME, normalizeBuildVolume, sameBuildVolume } from './buildVolume.js'
import { INSTRUCTIONS_MAX_LENGTH, INTENT_MAX_LENGTH, cleanText } from './intent.js'
import { DEFAULT_RESOLUTION, RESOLUTION_IDS, isResolution } from './kernel/tessellation.js'
import { parseNdjson, serializeNdjson } from './ndjson.js'
import { ASSET_OP, validateImageAsset } from '../sketch/imageAsset.js'
import { USER_PART_LIMITS, isUserPartOp, requiredUserParts, validateUserPartSet } from './userPart.js'

/** @typedef {import('./document.js').DocumentEntry} DocumentEntry */
/** @typedef {import('./document.js').WarpDocument} WarpDocument */

/** The `warpcad` discriminator on the one control line this format defines. */
const STATE_KIND = 'project-state'

/** The state line's own version — bumped only if its meaning changes incompatibly. */
const STATE_VERSION = 1

/** A file this build refuses to load, with a message safe to show the user as-is. */
export class ProjectFormatError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'ProjectFormatError'
  }
}

/**
 * Serialise a document to project text.
 *
 * @param {Pick<WarpDocument, 'entries' | 'rollbackAt'> & Partial<Pick<WarpDocument, 'resolution' | 'standingInstructions' | 'buildVolume' | 'userParts'>>} document
 * @returns {string} `''` for an empty document at the new-document default; otherwise
 *   newline-terminated NDJSON.
 */
export function serializeProject(document) {
  const entries = document.entries
  const rollbackAt = document.rollbackAt()
  const resolution = document.resolution?.() ?? 'legacy'
  // `legacy` is what an absent field means, so it is never written — an old document's
  // bytes do not change. Nor is the new-document default on an empty document: an
  // empty file already reads as that, and an empty document has always been `''`.
  const writesResolution =
    resolution !== 'legacy' && !(entries.length === 0 && resolution === DEFAULT_RESOLUTION)

  /** @type {string[]} */
  const suppressed = []
  /** @type {string[]} */
  const leftBroken = []
  /** @type {Record<string, string>} */
  const origins = {}
  /** @type {Record<string, string>} */
  const intents = {}
  for (const entry of entries) {
    const id = entry.record.id
    if (id === undefined) continue
    if (entry.suppressed === true) suppressed.push(id)
    if (entry.leftBroken === true) leftBroken.push(id)
    if (entry.origin !== 'local') origins[id] = entry.origin
    if (typeof entry.intent === 'string' && entry.intent !== '') intents[id] = entry.intent
  }
  const standingInstructions = document.standingInstructions?.() ?? ''
  const buildVolume = document.buildVolume?.() ?? DEFAULT_BUILD_VOLUME
  const writesBuildVolume = !sameBuildVolume(buildVolume, DEFAULT_BUILD_VOLUME)
  // `TODO/core-037`: the project's own copies only, never the registry's — a part the
  // document does not carry (one that failed to load) is not written, so reopening reports
  // it again instead of silently picking up whatever the library holds.
  const carried = new Map((document.userParts?.() ?? []).map((definition) => [definition.op, definition]))
  const parts = requiredUserParts(
    entries.map((entry) => entry.record),
    (op) => carried.get(op)
  ).definitions

  /** @type {object[]} */
  const lines = entries.map((entry) => entry.record)
  const hasOrigins = Object.keys(origins).length > 0
  const hasIntents = Object.keys(intents).length > 0
  if (
    suppressed.length > 0 ||
    leftBroken.length > 0 ||
    rollbackAt !== null ||
    hasOrigins ||
    writesResolution ||
    hasIntents ||
    standingInstructions !== '' ||
    writesBuildVolume ||
    parts.length > 0
  ) {
    lines.push({
      warpcad: STATE_KIND,
      version: STATE_VERSION,
      ...(suppressed.length > 0 ? { suppressed } : {}),
      ...(leftBroken.length > 0 ? { leftBroken } : {}),
      ...(rollbackAt !== null ? { rollbackAt } : {}),
      ...(hasOrigins ? { origins } : {}),
      ...(writesResolution ? { resolution } : {}),
      ...(hasIntents ? { intents } : {}),
      ...(standingInstructions !== '' ? { standingInstructions } : {}),
      ...(writesBuildVolume
        ? { buildVolume: { widthMm: buildVolume.widthMm, depthMm: buildVolume.depthMm, heightMm: buildVolume.heightMm } }
        : {}),
      ...(parts.length > 0 ? { parts } : {}),
    })
  }
  return serializeNdjson(lines)
}

/**
 * Ops this build no longer has, and what to tell the user about a file that still holds
 * them (`TODO/sketch-001`).
 *
 * ui-020's loose `sketch.line` records were replaced by the `primitive.sketch` body. A
 * file or autosave written in between must still open: refusing it — the loader's
 * answer to any op it does not know — would throw away every *other* body in it, which
 * is the silent-data-loss failure ui-029 exists to prevent. So these records are dropped
 * here, each one named in a warning, and nothing tries to migrate them: a loose line has
 * no role and no extrusion, so there is nothing correct to turn it into.
 *
 * Matched by prefix, so ui-020's endpoint edits (`sketch.line` records that supersede
 * another) go with the line they edited.
 *
 * @type {readonly { prefix: string, message: string }[]}
 */
const RETIRED_OPS = Object.freeze([
  Object.freeze({
    prefix: 'sketch.',
    message: 'sketch lines are no longer supported — redraw them in a Sketch primitive',
  }),
])

/**
 * @typedef {object} LoadWarning
 * @property {string} [id] The skipped record's id, when it had one.
 * @property {string} op
 * @property {string} message
 */

/**
 * @param {string} op
 * @returns {string | null} Why `op` is retired, or `null` when it is not.
 */
function retiredReason(op) {
  return RETIRED_OPS.find((retired) => op.startsWith(retired.prefix))?.message ?? null
}

/**
 * Why a reference photo is dropped on load, or `null` (`TODO/sketch-003`).
 *
 * The second deliberate exception to "an unknown or bad record refuses the whole file".
 * An `asset.image` holds untrusted bytes, and one that fails {@link validateImageAsset}
 * (an SVG, a remote URL, a MIME that lies about its bytes, a 50 000 px header) must
 * neither reach a decoder nor cost the user every *other* record in the file — the
 * sketches that reference it are fine without it. So it is dropped here with a warning
 * naming it and why, and any slice that names it loads without an image (its Slices panel
 * row says the image was removed).
 *
 * @param {Record<string, any>} record
 * @returns {string | null}
 */
function unsafeImageReason(record) {
  if (record.op !== ASSET_OP) return null
  const verdict = validateImageAsset(record)
  return verdict.ok ? null : `${IMAGE_REMOVED} (${verdict.reason})`
}

/** The start of every dropped-image warning — the same words the Slices panel row uses. */
export const IMAGE_REMOVED = "reference image removed — it couldn't be verified as a safe image"

/**
 * Parse and statically validate project text, without touching any document.
 *
 * Checks everything that can be checked from the text alone — JSON, record
 * shape, the state line, duplicate ids, references from the state line to
 * records that exist. Whether each record *folds* (an op this build does not
 * know, an operand that is missing) is the loader's job and is atomic there:
 * `WarpDocument.loadEntries` throws a `ReplayRejection` naming the step.
 *
 * A record whose op is **retired** ({@link RETIRED_OPS}) is the one exception to "the
 * loader judges every op": it is dropped here, with a {@link LoadWarning}, and the state
 * line is adjusted so it never names a record that is no longer there.
 *
 * @param {string} text
 * @returns {{ entries: DocumentEntry[], rollbackAt: number | null, resolution: string, standingInstructions: string, buildVolume: import('./buildVolume.js').BuildVolume, userParts: import('./userPart.js').UserPartDefinition[], unavailableParts: Record<string, string>, warnings: LoadWarning[] }}
 *   `standingInstructions` is `''` when the file has none (`TODO/ai-003`); `buildVolume` is the
 *   default when the file has none (`TODO/io-007`). `userParts` are the usable definitions the
 *   file carries and `unavailableParts` (op → reason) the parts its records name that are
 *   missing or bad (`TODO/core-037`) — hand both to `WarpDocument.loadEntries`.
 * @throws {ProjectFormatError} naming the line, or the offending field.
 */
export function parseProject(text) {
  const { records, errors } = parseNdjson(text)
  if (errors.length > 0) {
    const first = errors[0]
    throw new ProjectFormatError(
      `line ${first.line} is not valid JSON — this is not a WarpCad project file` +
        (errors.length > 1 ? ` (${errors.length} lines are unreadable)` : ''),
    )
  }

  // `parseNdjson` drops blank lines, which is what we want, but that means
  // `records[i]` no longer maps to line `i + 1`. Error messages should name the
  // line the user can find in an editor, so recover it by re-walking the text.
  const lineNumbers = nonBlankLineNumbers(text)

  /** @type {DocumentEntry[]} */
  const entries = []
  /** @type {Record<string, any> | undefined} */
  let state
  /** @type {Set<string>} */
  const ids = new Set()
  /** @type {LoadWarning[]} */
  const warnings = []
  /** Ids of dropped retired records — a state line may still name them. */
  /** @type {Set<string>} */
  const retiredIds = new Set()
  /** For each dropped record, how many records (kept or not) preceded it. */
  /** @type {number[]} */
  const retiredPositions = []
  let recordCount = 0

  records.forEach((raw, index) => {
    const line = lineNumbers[index]
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ProjectFormatError(`line ${line} is not an action record (expected a JSON object)`)
    }
    const record = /** @type {Record<string, any>} */ (raw)

    if (record.warpcad !== undefined) {
      if (record.warpcad !== STATE_KIND) {
        throw new ProjectFormatError(
          `line ${line} is a "${String(record.warpcad)}" entry, which this version of WarpCad ` +
            'does not know — the file was probably written by a newer version',
        )
      }
      if (state !== undefined) {
        throw new ProjectFormatError(`line ${line}: more than one project-state line`)
      }
      if (record.version !== STATE_VERSION) {
        throw new ProjectFormatError(
          `line ${line}: project-state version ${JSON.stringify(record.version)} was written by a ` +
            'newer version of WarpCad than this one',
        )
      }
      state = record
      return
    }

    if (typeof record.op !== 'string' || record.op.length === 0) {
      throw new ProjectFormatError(`line ${line} is an object with no \`op\` — not an action record`)
    }
    if (record.id !== undefined) {
      if (typeof record.id !== 'string') {
        throw new ProjectFormatError(`line ${line}: a record's \`id\` must be a string`)
      }
      if (ids.has(record.id)) {
        // A duplicate hidden behind suppression would pass the fold (suppressed rows are not
        // folded) and then collide the moment the row was unsuppressed — so it is refused here.
        throw new ProjectFormatError(`line ${line}: duplicate record id "${record.id}"`)
      }
      ids.add(record.id)
    }
    const retired = retiredReason(record.op) ?? unsafeImageReason(record)
    recordCount += 1
    if (retired !== null) {
      warnings.push({ ...(record.id !== undefined ? { id: record.id } : {}), op: record.op, message: retired })
      if (record.id !== undefined) retiredIds.add(record.id)
      retiredPositions.push(recordCount - 1)
      return
    }
    entries.push({ record: /** @type {any} */ (record), origin: 'local' })
  })

  const suppressed = state?.suppressed
  if (suppressed !== undefined) {
    if (!Array.isArray(suppressed) || !suppressed.every((id) => typeof id === 'string')) {
      throw new ProjectFormatError('project-state: `suppressed` must be a list of record ids')
    }
    for (const id of suppressed) {
      if (!ids.has(id)) {
        throw new ProjectFormatError(`project-state: suppressed step "${id}" is not in the file`)
      }
    }
  }
  const leftBroken = state?.leftBroken
  if (leftBroken !== undefined) {
    if (!Array.isArray(leftBroken) || !leftBroken.every((id) => typeof id === 'string')) {
      throw new ProjectFormatError('project-state: `leftBroken` must be a list of record ids')
    }
    for (const id of leftBroken) {
      if (!ids.has(id)) {
        throw new ProjectFormatError(`project-state: left-broken step "${id}" is not in the file`)
      }
    }
  }
  const origins = state?.origins
  if (origins !== undefined) {
    if (origins === null || typeof origins !== 'object' || Array.isArray(origins)) {
      throw new ProjectFormatError('project-state: `origins` must map record ids to origins')
    }
    for (const [id, origin] of Object.entries(origins)) {
      if (!ids.has(id) || typeof origin !== 'string' || origin.length === 0) {
        throw new ProjectFormatError(`project-state: origin for "${id}" names no record or is not text`)
      }
    }
  }

  const intents = state?.intents
  if (intents !== undefined) {
    if (intents === null || typeof intents !== 'object' || Array.isArray(intents)) {
      throw new ProjectFormatError('project-state: `intents` must map record ids to text')
    }
    for (const [id, intent] of Object.entries(intents)) {
      if (!ids.has(id) || typeof intent !== 'string') {
        throw new ProjectFormatError(`project-state: intent for "${id}" names no record or is not text`)
      }
    }
  }
  const declaredInstructions = state?.standingInstructions
  if (declaredInstructions !== undefined && typeof declaredInstructions !== 'string') {
    throw new ProjectFormatError('project-state: `standingInstructions` must be text')
  }
  const standingInstructions = cleanText(declaredInstructions, INSTRUCTIONS_MAX_LENGTH)

  /** @type {import('./buildVolume.js').BuildVolume} */
  let buildVolume = { ...DEFAULT_BUILD_VOLUME }
  if (state?.buildVolume !== undefined) {
    try {
      buildVolume = normalizeBuildVolume(state.buildVolume)
    } catch (error) {
      throw new ProjectFormatError(`project-state: buildVolume — ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const declaredRollbackAt = state?.rollbackAt ?? null
  if (
    declaredRollbackAt !== null &&
    !(Number.isInteger(declaredRollbackAt) && declaredRollbackAt >= 1 && declaredRollbackAt < recordCount)
  ) {
    throw new ProjectFormatError(
      `project-state: rollback marker ${JSON.stringify(declaredRollbackAt)} does not fit a file of ` +
        `${recordCount} steps`,
    )
  }
  // Dropping a retired record ahead of the marker moves the marker back by one. A marker
  // left with nothing active before it, or nothing inactive after, no longer marks a
  // rollback, so it is dropped rather than refusing a file that only failed to fit
  // because of records this build removed on the user's behalf.
  let rollbackAt = declaredRollbackAt
  if (rollbackAt !== null && retiredPositions.length > 0) {
    const before = retiredPositions.filter((position) => position < /** @type {number} */ (declaredRollbackAt)).length
    rollbackAt -= before
    if (!(rollbackAt >= 1 && rollbackAt < entries.length)) rollbackAt = null
  }

  const declared = state?.resolution
  if (declared !== undefined && !isResolution(declared)) {
    throw new ProjectFormatError(
      `project-state: resolution ${JSON.stringify(declared)} is not one this version of WarpCad ` +
        `knows (${RESOLUTION_IDS.join(', ')})`,
    )
  }
  const resolution = declared ?? (recordCount === 0 ? DEFAULT_RESOLUTION : 'legacy')

  const suppressedIds = new Set((suppressed ?? []).filter((/** @type {string} */ id) => !retiredIds.has(id)))
  const leftBrokenIds = new Set((leftBroken ?? []).filter((/** @type {string} */ id) => !retiredIds.has(id)))
  for (const entry of entries) {
    const id = entry.record.id
    if (id === undefined) continue
    if (suppressedIds.has(id)) entry.suppressed = true
    if (leftBrokenIds.has(id)) entry.leftBroken = true
    const origin = origins?.[id]
    if (origin !== undefined) entry.origin = origin
    const intent = cleanText(intents?.[id], INTENT_MAX_LENGTH)
    if (intent !== '') entry.intent = intent
  }

  const { userParts, unavailableParts } = readUserParts(state?.parts, entries, warnings)

  return { entries, rollbackAt, resolution, standingInstructions, buildVolume, userParts, unavailableParts, warnings }
}

/**
 * The state line's `parts` (`TODO/core-037`): validated as one set, with a warning per
 * part that cannot be used and every record depending on one flagged left broken.
 *
 * @param {unknown} declared The raw field.
 * @param {DocumentEntry[]} entries Mutated: dependents of a missing part get `leftBroken`.
 * @param {LoadWarning[]} warnings Appended to.
 * @returns {{ userParts: import('./userPart.js').UserPartDefinition[], unavailableParts: Record<string, string> }}
 * @throws {ProjectFormatError} When `parts` is not a list.
 */
function readUserParts(declared, entries, warnings) {
  if (declared !== undefined && !Array.isArray(declared)) {
    throw new ProjectFormatError('project-state: `parts` must be a list of part definitions')
  }
  const all = /** @type {unknown[]} */ (declared ?? [])
  const cap = USER_PART_LIMITS.maxPartsPerProject
  /** @type {Map<string, string>} op → reason, for the parts that cannot be used. */
  const problems = new Map()
  /** @type {Map<string, string>} op → the name to show. */
  const names = new Map()
  for (const extra of all.slice(cap)) {
    const op = isPlainRecord(extra) && typeof extra.op === 'string' ? extra.op : '(unnamed part)'
    warnings.push({ op, message: `part ${op} skipped — a project carries no more than ${cap} parts (this one has more than ${cap} parts)` })
  }
  const considered = all.slice(0, cap)
  for (const raw of considered) {
    if (isPlainRecord(raw) && typeof raw.op === 'string' && typeof raw.name === 'string') {
      names.set(raw.op, cleanText(raw.name, USER_PART_LIMITS.maxNameLength))
    }
  }
  const { definitions, problems: found } = validateUserPartSet(considered)
  const usable = new Set(definitions.map((definition) => definition.op))
  for (const problem of found) {
    const op = problem.op ?? '(unnamed part)'
    // A duplicate's first copy is still usable; only its extra copies are worth a warning.
    if (!usable.has(op) && !problems.has(op)) problems.set(op, problem.reason)
    const name = names.get(op)
    warnings.push({
      op,
      message: `part ${name === undefined ? op : `"${name}" (${op})`} can't be loaded: ${problem.reason}`,
    })
  }

  /** @type {Record<string, string>} */
  const unavailableParts = {}
  for (const entry of entries) {
    const op = entry.record.op
    if (!isUserPartOp(op) || usable.has(op) || Object.hasOwn(unavailableParts, op)) continue
    const reason = problems.get(op)
    if (reason === undefined) {
      warnings.push({ op, message: `part ${op} can't be loaded: its definition is not in the file` })
      unavailableParts[op] = 'its definition is not in the file'
    } else {
      unavailableParts[op] = reason
    }
  }

  // Flag every record that uses a part which cannot be built, or builds on one that does —
  // so the load tolerates them as broken rows instead of refusing the whole file.
  if (Object.keys(unavailableParts).length > 0) {
    /** @type {Set<string>} */
    const brokenIds = new Set()
    for (const entry of entries) {
      const { record } = entry
      const dependsOnBroken =
        Object.hasOwn(unavailableParts, record.op) || referencedIds(record).some((id) => brokenIds.has(id))
      if (!dependsOnBroken) continue
      entry.leftBroken = true
      if (record.id !== undefined) brokenIds.add(record.id)
    }
  }
  return { userParts: definitions, unavailableParts }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Every record id `record` points at: its operands, and the lineage it continues.
 *
 * @param {Record<string, any>} record
 * @returns {string[]}
 */
function referencedIds(record) {
  /** @type {string[]} */
  const ids = []
  for (const ref of [record.target, ...(Array.isArray(record.operands) ? record.operands : [])]) {
    if (typeof ref === 'string') ids.push(ref)
    else if (isPlainRecord(ref) && typeof ref.id === 'string') ids.push(ref.id)
  }
  if (typeof record.supersedes === 'string') ids.push(record.supersedes)
  if (Array.isArray(record.consumes)) ids.push(...record.consumes.filter((id) => typeof id === 'string'))
  return ids
}

/**
 * The 1-based line number of every non-blank line, in order — the same lines
 * `parseNdjson` keeps, so index `i` here is record `i` there.
 *
 * @param {string} text
 * @returns {number[]}
 */
function nonBlankLineNumbers(text) {
  /** @type {number[]} */
  const numbers = []
  text.split('\n').forEach((line, index) => {
    if (line.trim() !== '') numbers.push(index + 1)
  })
  return numbers
}

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

import { DEFAULT_RESOLUTION, RESOLUTION_IDS, isResolution } from './kernel/tessellation.js'
import { parseNdjson, serializeNdjson } from './ndjson.js'

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
 * @param {Pick<WarpDocument, 'entries' | 'rollbackAt'> & Partial<Pick<WarpDocument, 'resolution'>>} document
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
  for (const entry of entries) {
    const id = entry.record.id
    if (id === undefined) continue
    if (entry.suppressed === true) suppressed.push(id)
    if (entry.leftBroken === true) leftBroken.push(id)
    if (entry.origin !== 'local') origins[id] = entry.origin
  }

  /** @type {object[]} */
  const lines = entries.map((entry) => entry.record)
  const hasOrigins = Object.keys(origins).length > 0
  if (suppressed.length > 0 || leftBroken.length > 0 || rollbackAt !== null || hasOrigins || writesResolution) {
    lines.push({
      warpcad: STATE_KIND,
      version: STATE_VERSION,
      ...(suppressed.length > 0 ? { suppressed } : {}),
      ...(leftBroken.length > 0 ? { leftBroken } : {}),
      ...(rollbackAt !== null ? { rollbackAt } : {}),
      ...(hasOrigins ? { origins } : {}),
      ...(writesResolution ? { resolution } : {}),
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
 * @returns {{ entries: DocumentEntry[], rollbackAt: number | null, resolution: string, warnings: LoadWarning[] }}
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
    const retired = retiredReason(record.op)
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
  }

  return { entries, rollbackAt, resolution, warnings }
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

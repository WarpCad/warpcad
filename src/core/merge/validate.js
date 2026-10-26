// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Reading a project file's merge section (`TODO/data-011`, `docs/decisions/document-sync.md`).
 *
 * The section is **untrusted data from whoever wrote the file**. {@link readMergeSection}
 * checks its shape and caps in code, names the offending field when it refuses, and returns a
 * plain {@link MergeOverlay} the document applies on top of the metadata it derives from row
 * order. It never throws anything but {@link MergeSectionError}.
 *
 * Why caps matter here, not only shape: `mergeStates` assumes validated input, and a stamp
 * counter of `9e15` would win every future merge and push the clock to
 * `Number.MAX_SAFE_INTEGER`, where adding one stops changing it. So a counter is at most
 * 2^40, a replica id is the six-character alphabet (or the literal `legacy` with counter 0),
 * a position key is at most 256 characters and parses as a key, a record id is at most 256
 * characters, tombstones are at most 100 000 and the whole section serialises to at most
 * {@link MERGE_LIMITS.maxBytes}. Counts are checked **before** the size, so a hostile section
 * is refused without serialising a million entries.
 *
 * Framework-free: plain data in, plain data out.
 *
 * @module core/merge/validate
 */

import { isReplicaId } from '../replica.js'
import { REGISTER_NAMES, LEGACY_REPLICA, LEGACY_STAMP } from './state.js'
import { parseKey } from './positionKey.js'
import { viewKey } from '../visibility.js'

/** @typedef {import('../replica.js').Stamp} Stamp */

/** Limits enforced on a merge section, in code. */
export const MERGE_LIMITS = Object.freeze({
  /** A stamp counter above this is refused: it would win every merge. */
  maxCounter: 2 ** 40,
  maxKeyLength: 256,
  maxIdLength: 256,
  maxTombstones: 100_000,
  /** Live rows the section may describe (the file's own record cap bounds this in practice). */
  maxRows: 200_000,
  /** The section's serialised size, in characters. */
  maxBytes: 8 * 1024 * 1024,
  maxProjectIdLength: 64,
})

/**
 * @typedef {object} RowStamps
 * @property {Stamp} [born] Absent: the legacy stamp.
 * @property {Stamp} [rec] Absent: the row's `born`.
 * @property {Stamp} [pos] Absent: the row's `born`.
 * @property {Stamp} [sup] The `suppressed` flag's stamp; absent: derived from the state line.
 * @property {Stamp} [lb] The `leftBroken` flag's stamp; absent: derived from the state line.
 */

/**
 * @typedef {object} MergeOverlay
 * @property {string | null} projectId
 * @property {number} highest The largest stamp counter anywhere in the section, and its
 *   `clock` — what the loaded document's clock must observe.
 * @property {Map<string, string>} pos Row id → position key, only where it is not the one
 *   derived from row order.
 * @property {Map<string, RowStamps>} stamps
 * @property {Map<string, Stamp>} dead Tombstones.
 * @property {Partial<Record<(typeof REGISTER_NAMES)[number], Stamp>>} registers
 * @property {Map<string, Stamp>} partStamps User-part op → the stamp that wrote its definition.
 * @property {Map<string, Stamp>} viewStamps `TODO/ui-089`: view key (`visibility.js`'s
 *   `viewKey`) → the stamp that last hid or showed that body or part. The value is the state
 *   line's `viewHidden` (listed: hidden; not listed: shown). Only bodies the file holds.
 */

/** A merge section this build refuses, with a message that names the field. */
export class MergeSectionError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'MergeSectionError'
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {unknown} raw
 * @param {string} where
 * @returns {Stamp}
 */
function readStamp(raw, where) {
  if (!Array.isArray(raw) || raw.length !== 2) {
    throw new MergeSectionError(`merge: ${where} must be a stamp, [counter, replica]`)
  }
  const [counter, replica] = raw
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new MergeSectionError(`merge: ${where} has a counter that is not a non-negative whole number`)
  }
  if (counter > MERGE_LIMITS.maxCounter) {
    throw new MergeSectionError(`merge: ${where} has a counter above ${MERGE_LIMITS.maxCounter}, which no clock issues`)
  }
  if (replica === LEGACY_REPLICA) {
    if (counter !== 0) throw new MergeSectionError(`merge: ${where} pairs the legacy replica with a counter`)
    return LEGACY_STAMP
  }
  if (!isReplicaId(replica)) {
    throw new MergeSectionError(`merge: ${where} has a replica id that is not six characters of a-z2-7`)
  }
  return { counter, replica }
}

/**
 * @param {unknown} raw
 * @param {string} field
 * @returns {Record<string, unknown>}
 */
function readMap(raw, field) {
  if (raw === undefined) return {}
  if (!isObject(raw)) throw new MergeSectionError(`merge: \`${field}\` must be a map`)
  return raw
}

/**
 * @param {string} id
 * @param {string} field
 */
function checkId(id, field) {
  if (id.length === 0 || id.length > MERGE_LIMITS.maxIdLength) {
    throw new MergeSectionError(`merge: \`${field}\` has a record id that is empty or longer than ${MERGE_LIMITS.maxIdLength}`)
  }
}

/**
 * Validate a state line's `merge` section.
 *
 * @param {unknown} raw The field as parsed; never trusted.
 * @param {ReadonlySet<string>} recordIds The ids of the records in the file.
 * @returns {MergeOverlay}
 * @throws {MergeSectionError} Naming the field, for any shape or cap violation.
 */
export function readMergeSection(raw, recordIds) {
  if (!isObject(raw)) throw new MergeSectionError('merge: the section must be an object')

  const posRaw = readMap(raw.pos, 'pos')
  const stampsRaw = readMap(raw.stamps, 'stamps')
  const deadRaw = readMap(raw.dead, 'dead')
  const registersRaw = readMap(raw.registers, 'registers')
  const partStampsRaw = readMap(raw.partStamps, 'partStamps')
  const viewStampsRaw = readMap(raw.viewStamps, 'viewStamps')

  // Counts before anything is walked or serialised.
  const rows = Math.max(Object.keys(posRaw).length, Object.keys(stampsRaw).length)
  if (rows > MERGE_LIMITS.maxRows) {
    throw new MergeSectionError(`merge: \`pos\`/\`stamps\` describe more than ${MERGE_LIMITS.maxRows} rows`)
  }
  const tombstones = Object.keys(deadRaw).length
  if (tombstones > MERGE_LIMITS.maxTombstones) {
    throw new MergeSectionError(`merge: \`dead\` holds ${tombstones} tombstones, more than the ${MERGE_LIMITS.maxTombstones} allowed`)
  }
  if (Object.keys(partStampsRaw).length > MERGE_LIMITS.maxRows) {
    throw new MergeSectionError('merge: `partStamps` holds too many entries')
  }
  if (Object.keys(viewStampsRaw).length > MERGE_LIMITS.maxRows) {
    throw new MergeSectionError('merge: `viewStamps` holds too many entries')
  }
  if (JSON.stringify(raw).length > MERGE_LIMITS.maxBytes) {
    throw new MergeSectionError(`merge: the section is larger than ${MERGE_LIMITS.maxBytes} characters`)
  }

  let highest = 0
  /** @param {Stamp} stamp */
  const see = (stamp) => {
    if (stamp.counter > highest) highest = stamp.counter
    return stamp
  }

  /** @type {string | null} */
  let projectId = null
  if (raw.project !== undefined) {
    if (
      typeof raw.project !== 'string' ||
      raw.project.length === 0 ||
      raw.project.length > MERGE_LIMITS.maxProjectIdLength ||
      !/^[a-z0-9-]+$/.test(raw.project)
    ) {
      throw new MergeSectionError('merge: `project` must be a short lowercase id')
    }
    projectId = raw.project
  }
  if (raw.clock !== undefined) {
    if (!Number.isSafeInteger(raw.clock) || /** @type {number} */ (raw.clock) < 0) {
      throw new MergeSectionError('merge: `clock` must be a non-negative whole number')
    }
    if (/** @type {number} */ (raw.clock) > MERGE_LIMITS.maxCounter) {
      throw new MergeSectionError(`merge: \`clock\` is above ${MERGE_LIMITS.maxCounter}, which no clock reaches`)
    }
    highest = /** @type {number} */ (raw.clock)
  }

  /** @type {Map<string, string>} */
  const pos = new Map()
  for (const [id, key] of Object.entries(posRaw)) {
    checkId(id, 'pos')
    if (!recordIds.has(id)) throw new MergeSectionError(`merge: \`pos\` names "${id.slice(0, 40)}", which is not a record in the file`)
    if (typeof key !== 'string' || key.length === 0 || key.length > MERGE_LIMITS.maxKeyLength) {
      throw new MergeSectionError(`merge: the position key for "${id.slice(0, 40)}" is not text of 1-${MERGE_LIMITS.maxKeyLength} characters`)
    }
    try {
      parseKey(key)
    } catch {
      throw new MergeSectionError(`merge: the position key for "${id.slice(0, 40)}" is not a valid key`)
    }
    pos.set(id, key)
  }

  const FIELDS = /** @type {const} */ (['born', 'rec', 'pos', 'sup', 'lb'])
  /** @type {Map<string, RowStamps>} */
  const stamps = new Map()
  for (const [id, entry] of Object.entries(stampsRaw)) {
    checkId(id, 'stamps')
    if (!recordIds.has(id)) throw new MergeSectionError(`merge: \`stamps\` names "${id.slice(0, 40)}", which is not a record in the file`)
    if (!isObject(entry)) throw new MergeSectionError(`merge: the stamps for "${id.slice(0, 40)}" must be an object`)
    /** @type {RowStamps} */
    const row = {}
    for (const field of FIELDS) {
      if (entry[field] === undefined) continue
      row[field] = see(readStamp(entry[field], `\`stamps\` ${field} for "${id.slice(0, 40)}"`))
    }
    stamps.set(id, row)
  }

  /** @type {Map<string, Stamp>} */
  const dead = new Map()
  for (const [id, value] of Object.entries(deadRaw)) {
    checkId(id, 'dead')
    dead.set(id, see(readStamp(value, `\`dead\` for "${id.slice(0, 40)}"`)))
  }

  /** @type {MergeOverlay['registers']} */
  const registers = {}
  for (const name of Object.keys(registersRaw)) {
    if (!REGISTER_NAMES.includes(/** @type {any} */ (name))) {
      throw new MergeSectionError(`merge: \`registers\` names "${name.slice(0, 40)}", which is not a register`)
    }
    registers[/** @type {(typeof REGISTER_NAMES)[number]} */ (name)] = see(readStamp(registersRaw[name], `register ${name}`))
  }

  /** @type {Map<string, Stamp>} */
  const partStamps = new Map()
  for (const [op, value] of Object.entries(partStampsRaw)) {
    if (op.length === 0 || op.length > MERGE_LIMITS.maxIdLength) {
      throw new MergeSectionError('merge: `partStamps` names a part that is empty or too long')
    }
    partStamps.set(op, see(readStamp(value, `\`partStamps\` for "${op.slice(0, 40)}"`)))
  }

  // `TODO/ui-089`: by body, the body's own stamp and one per part. A body the file does not
  // hold is dropped rather than refused: a view setting must never cost the user the file, and
  // this build's own writer never names one (`section.js`).
  /** @type {Map<string, Stamp>} */
  const viewStamps = new Map()
  let viewSwitches = 0
  for (const [bodyId, entry] of Object.entries(viewStampsRaw)) {
    checkId(bodyId, 'viewStamps')
    const label = `"${bodyId.slice(0, 40)}"`
    if (!isObject(entry)) throw new MergeSectionError(`merge: the view stamps for ${label} must be an object`)
    if (entry.parts !== undefined && !isObject(entry.parts)) {
      throw new MergeSectionError(`merge: the view stamps for ${label}: \`parts\` must be a map of part names to stamps`)
    }
    const parts = Object.entries(/** @type {Record<string, unknown>} */ (entry.parts ?? {}))
    viewSwitches += parts.length + 1
    if (viewSwitches > MERGE_LIMITS.maxRows) throw new MergeSectionError('merge: `viewStamps` holds too many entries')
    const keep = recordIds.has(bodyId)
    if (entry.body !== undefined) {
      const stamp = see(readStamp(entry.body, `\`viewStamps\` body for ${label}`))
      if (keep) viewStamps.set(viewKey(bodyId), stamp)
    }
    for (const [name, value] of parts) {
      if (name.length === 0 || name.length > MERGE_LIMITS.maxIdLength) {
        throw new MergeSectionError(`merge: the view stamps for ${label} name a part name that is empty or longer than ${MERGE_LIMITS.maxIdLength}`)
      }
      const stamp = see(readStamp(value, `\`viewStamps\` part "${name.slice(0, 40)}" of ${label}`))
      if (keep) viewStamps.set(viewKey(bodyId, name), stamp)
    }
  }

  return { projectId, highest, pos, stamps, dead, registers, partStamps, viewStamps }
}

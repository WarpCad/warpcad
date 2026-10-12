// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Writing a document's merge state as the project file's `merge` section
 * (`TODO/data-011`); {@link module:core/merge/validate} reads it back.
 *
 * Compact on purpose: the section says only what a reader could not derive from the file's
 * row order and the state line's own fields.
 *
 * - a **position key** is omitted when it is the one derived from row order;
 * - a row's `born` is omitted when it is the legacy stamp, and its `rec`, `pos`, `sup` and
 *   `lb` stamps when they equal `born` (or, for the two flags, what the state line derives);
 * - a **register** is written as its stamp alone — its value is the state line's own
 *   `rollbackAt` / `resolution` / `standingInstructions` / `buildVolume`;
 * - an all-default document writes **no section**, so a legacy file opened and saved
 *   unchanged is byte-identical and still says version 1.
 *
 * @module core/merge/section
 */

import { compareStamps } from '../replica.js'
import { REGISTER_NAMES, LEGACY_STAMP, isLegacyStamp } from './state.js'
import { keysBetween } from './positionKey.js'

/** @typedef {import('../replica.js').Stamp} Stamp */
/** @typedef {import('./state.js').MergeState} MergeState */

/**
 * @param {Stamp} stamp
 * @returns {[number, string]}
 */
function encodeStamp(stamp) {
  return [stamp.counter, stamp.replica]
}

/**
 * @param {Stamp} a
 * @param {Stamp} b
 * @returns {boolean}
 */
function same(a, b) {
  return compareStamps(a, b) === 0
}

/**
 * The `merge` section for a document, or `null` when it would say nothing a legacy reader
 * could not derive.
 *
 * @param {MergeState} state The document's {@link MergeState}.
 * @param {readonly { record: { id?: string }, suppressed?: boolean, leftBroken?: boolean }[]} entries
 *   The document's rows in file order.
 * @param {number} clock The document's merge clock.
 * @param {readonly string[]} writtenParts The ops of the user-part definitions the file carries.
 * @returns {Record<string, unknown> | null}
 */
export function encodeMergeSection(state, entries, clock, writtenParts) {
  const keyed = entries.filter((entry) => entry.record.id !== undefined)
  const derived = keysBetween(null, null, keyed.length, LEGACY_STAMP)

  /** @type {Record<string, string>} */
  const pos = {}
  /** @type {Record<string, Record<string, [number, string]>>} */
  const stamps = {}
  keyed.forEach((entry, index) => {
    const id = /** @type {string} */ (entry.record.id)
    const meta = state.entries.get(id)
    if (meta === undefined) return
    if (meta.pos[0] !== derived[index]) pos[id] = meta.pos[0]
    /** @type {Record<string, [number, string]>} */
    const row = {}
    if (!isLegacyStamp(meta.born)) row.born = encodeStamp(meta.born)
    if (!same(meta.rec, meta.born)) row.rec = encodeStamp(meta.rec)
    if (!same(meta.pos[1], meta.born)) row.pos = encodeStamp(meta.pos[1])
    // The flags' values are the state line's lists; only a stamp that is not the derived
    // "true, legacy" needs saying.
    for (const [field, key, flag] of /** @type {const} */ ([
      ['suppressed', 'sup', entry.suppressed === true],
      ['leftBroken', 'lb', entry.leftBroken === true],
    ])) {
      const written = meta[field]
      if (written === undefined) continue
      if (flag && written[0] === true && isLegacyStamp(written[1])) continue
      row[key] = encodeStamp(written[1])
    }
    if (Object.keys(row).length > 0) stamps[id] = row
  })

  /** @type {Record<string, [number, string]>} */
  const dead = {}
  for (const [id, stamp] of state.dead) dead[id] = encodeStamp(stamp)

  /** @type {Record<string, [number, string]>} */
  const registers = {}
  for (const name of REGISTER_NAMES) {
    const register = state.registers[name]
    if (register !== null && !isLegacyStamp(register[1])) registers[name] = encodeStamp(register[1])
  }

  /** @type {Record<string, [number, string]>} */
  const partStamps = {}
  for (const op of writtenParts) {
    const written = state.parts.get(op)
    if (written !== undefined && !isLegacyStamp(written[1])) partStamps[op] = encodeStamp(written[1])
  }

  const empty =
    state.projectId === null &&
    Object.keys(pos).length === 0 &&
    Object.keys(stamps).length === 0 &&
    Object.keys(dead).length === 0 &&
    Object.keys(registers).length === 0 &&
    Object.keys(partStamps).length === 0
  if (empty) return null

  return {
    ...(state.projectId !== null ? { project: state.projectId } : {}),
    clock,
    ...(Object.keys(pos).length > 0 ? { pos } : {}),
    ...(Object.keys(stamps).length > 0 ? { stamps } : {}),
    ...(Object.keys(dead).length > 0 ? { dead } : {}),
    ...(Object.keys(registers).length > 0 ? { registers } : {}),
    ...(Object.keys(partStamps).length > 0 ? { partStamps } : {}),
  }
}

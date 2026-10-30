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
 * - the **gist** register (`TODO/io-017`) is the exception: `gist: [value | null, stamp]`, value
 *   and stamp together, beside `project`. Not under `registers`, whose names a released build
 *   checks and refuses when unknown; an unknown key of the section is ignored instead, so an
 *   older tab still opens a published project (and drops the field if it saves). A clear is
 *   written as `[null, stamp]`, so it keeps beating an older set after a reload;
 * - a **view switch** (`TODO/ui-089`) is written as its stamp alone, under `viewStamps` by body
 *   and part, its value being whether the state line's `viewHidden` lists it. A show is
 *   written too (that is what lets a later show beat an earlier hide after a reload); a hide
 *   the state line dropped as stale is not, so the two never disagree;
 * - the **prompts** (`TODO/ai-031`, `src/core/prompt.js`) are written whole, as `prompts: [{ id,
 *   text, produced? }]` sorted by id, beside `gist` and for the same reason: an older build ignores
 *   an unknown section key. They carry no stamp — they merge as a grow-only set — and `produced`
 *   is omitted when empty. A prompt's reply (`TODO/ai-032`) rides inside its record as
 *   `responses: [{ id, text, at: [counter, replica] }]`, each segment stamped — a released build
 *   that knows prompts ignores the field it does not know, as it ignores the section key. A
 *   segment taken back is a tombstone, `{ id, at, removed: true }`, with no text;
 * - an all-default document writes **no section**, so a legacy file opened and saved
 *   unchanged is byte-identical and still says version 1.
 *
 * @module core/merge/section
 */

import { compareStamps } from '../replica.js'
import { SECTION_REGISTER_NAMES, LEGACY_STAMP, isLegacyStamp } from './state.js'
import { keysBetween } from './positionKey.js'
import { parseViewKey, viewHiddenMapOf } from '../visibility.js'

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
 * @param {import('../visibility.js').ViewHiddenState | null} [writtenView] `TODO/ui-089`: the
 *   `viewHidden` the state line carries, after its stale switches were dropped.
 * @returns {Record<string, unknown> | null}
 */
export function encodeMergeSection(state, entries, clock, writtenParts, writtenView = null) {
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
  for (const name of SECTION_REGISTER_NAMES) {
    const register = state.registers[name]
    if (register !== null && !isLegacyStamp(register[1])) registers[name] = encodeStamp(register[1])
  }

  // `TODO/io-017`: value and stamp together; written whenever it has ever been set or cleared.
  const gistRegister = state.registers.gist
  /** @type {[unknown, [number, string]] | null} */
  const gist = gistRegister === null ? null : [gistRegister[0] ?? null, encodeStamp(gistRegister[1])]

  /** @type {Record<string, [number, string]>} */
  const partStamps = {}
  for (const op of writtenParts) {
    const written = state.parts.get(op)
    if (written !== undefined && !isLegacyStamp(written[1])) partStamps[op] = encodeStamp(written[1])
  }

  /** @type {Record<string, { body?: [number, string], parts?: Record<string, [number, string]> }>} */
  const viewStamps = {}
  const ids = new Set(keyed.map((entry) => /** @type {string} */ (entry.record.id)))
  const listed = viewHiddenMapOf(writtenView ?? {})
  const switches = [...state.viewHidden]
    .map(([key, value]) => ({ key, value, at: parseViewKey(key) }))
    .filter(({ key, value: [hidden, stamp], at }) =>
      at !== null && ids.has(at.bodyId) && !isLegacyStamp(stamp) && (!hidden || listed.has(key)))
    .sort((x, y) => {
      const a = /** @type {{ bodyId: string, partName?: string }} */ (x.at)
      const b = /** @type {{ bodyId: string, partName?: string }} */ (y.at)
      if (a.bodyId !== b.bodyId) return a.bodyId < b.bodyId ? -1 : 1
      if (a.partName === undefined || b.partName === undefined) return a.partName === undefined ? -1 : 1
      return a.partName < b.partName ? -1 : a.partName > b.partName ? 1 : 0
    })
  for (const { value, at } of switches) {
    const { bodyId, partName } = /** @type {{ bodyId: string, partName?: string }} */ (at)
    viewStamps[bodyId] ??= {}
    const body = viewStamps[bodyId]
    if (partName === undefined) {
      body.body = encodeStamp(value[1])
    } else {
      body.parts ??= {}
      body.parts[partName] = encodeStamp(value[1])
    }
  }

  // `TODO/ai-031`: whole records, by id; a prompt that produced nothing yet omits `produced`.
  const prompts = [...(state.prompts ?? new Map())]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, prompt]) => ({
      id,
      text: prompt.text,
      ...(prompt.produced.length > 0 ? { produced: [...prompt.produced] } : {}),
      // `TODO/ai-032`: the reply's segments, each with its own stamp, in stamp order.
      ...(prompt.responses !== undefined && prompt.responses.length > 0
        ? {
            responses: prompt.responses.map((/** @type {import('../prompt.js').ResponseSegment} */ segment) =>
              // A tombstone (`TODO/ai-032`: an Undone reply) carries no text.
              segment.removed === true
                ? { id: segment.id, at: encodeStamp(segment.at), removed: true }
                : { id: segment.id, text: segment.text, at: encodeStamp(segment.at) }
            ),
          }
        : {}),
    }))

  const empty =
    state.projectId === null &&
    prompts.length === 0 &&
    Object.keys(pos).length === 0 &&
    Object.keys(stamps).length === 0 &&
    Object.keys(dead).length === 0 &&
    Object.keys(registers).length === 0 &&
    Object.keys(partStamps).length === 0 &&
    Object.keys(viewStamps).length === 0 &&
    gist === null
  if (empty) return null

  return {
    ...(state.projectId !== null ? { project: state.projectId } : {}),
    ...(gist !== null ? { gist } : {}),
    clock,
    ...(Object.keys(pos).length > 0 ? { pos } : {}),
    ...(Object.keys(stamps).length > 0 ? { stamps } : {}),
    ...(Object.keys(dead).length > 0 ? { dead } : {}),
    ...(Object.keys(registers).length > 0 ? { registers } : {}),
    ...(Object.keys(partStamps).length > 0 ? { partStamps } : {}),
    ...(Object.keys(viewStamps).length > 0 ? { viewStamps } : {}),
    ...(prompts.length > 0 ? { prompts } : {}),
  }
}

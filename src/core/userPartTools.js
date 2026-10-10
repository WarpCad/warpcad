// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The rules behind the Library's *Save to library…* sheet and a My parts row's ⋯ menu
 * (`TODO/ui-055`). Framework-free: the Pinia store and the components only call these, so the
 * rules are testable in plain Node and no component does its own name or selection logic.
 *
 * - {@link saveToLibraryGate} — the enabled-state of every *Save to library…* control, by
 *   selection **count** (CLAUDE.md: a single-object tool stays disabled unless exactly one
 *   applicable object is selected).
 * - {@link partNameProblem} — the sheet's name validation: empty, over-long, a duplicate.
 * - {@link exposableParams} / {@link exposedFrom} — which numbers of a group the sheet offers
 *   as checkboxes, and how a chosen set becomes the `exposeParams` `capturePart` takes.
 * - {@link renamePart}, {@link duplicatePart}, {@link copyNameFor}, {@link usageOf} — the row menu.
 *
 * @module core/userPartTools
 */

import { labelForParam } from './inspector.js'
import { USER_PART_LIMITS, USER_PART_PREFIX, slugify } from './userPart.js'

/** @typedef {import('./userPart.js').UserPartDefinition} UserPartDefinition */
/** @typedef {import('./userPart.js').ExposedParam} ExposedParam */
/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/**
 * Whether *Save to library…* can run, and — when it cannot — the sentence that says why.
 * The same answer drives the Inspector's button, the toolbar's and the keyboard path.
 *
 * @param {object} state
 * @param {number} state.count How many bodies are selected.
 * @param {boolean} [state.previewing] A past History step is being previewed.
 * @param {boolean} [state.inactive] The one selected body is kept out of the fold by a condition.
 * @returns {{ enabled: boolean, reason: string }}
 */
export function saveToLibraryGate({ count, previewing = false, inactive = false }) {
  if (previewing) return { enabled: false, reason: 'Leave the History preview to save a part' }
  if (count === 0) return { enabled: false, reason: 'Select a group or body to save it to the library' }
  if (count > 1) {
    return { enabled: false, reason: 'Select exactly 1 — tap Combine into group to make several solids one, then save it' }
  }
  if (inactive) return { enabled: false, reason: "This step isn't built — its condition doesn't hold" }
  return { enabled: true, reason: '' }
}

/**
 * Why a part cannot take this name, or `''` when it can.
 *
 * Identity is the **slug** (`user.<slug>` is the registry key every placed instance records),
 * so "Standoff", "standoff " and "STANDOFF" are one name, and "Stand-off" is another.
 *
 * @param {string} name
 * @param {readonly { op: string, name: string }[]} taken Every part that already exists.
 * @param {{ except?: string }} [options] `except`: the op being renamed, which may keep its own name.
 * @returns {string}
 */
export function partNameProblem(name, taken, { except } = {}) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed === '') return 'Give the part a name'
  if (trimmed.length > USER_PART_LIMITS.maxNameLength) {
    return `A part name can be at most ${USER_PART_LIMITS.maxNameLength} characters (this one is ${trimmed.length})`
  }
  if (!/[a-z0-9]/i.test(trimmed.normalize('NFKD'))) return 'Use at least one letter or digit in the name'
  const op = `${USER_PART_PREFIX}${slugify(trimmed)}`
  const clash = taken.find((part) => part.op === op && part.op !== except)
  if (clash) return `A part called "${clash.name}" already exists — pick another name`
  return ''
}

/**
 * @typedef {object} ExposableParam
 * @property {string} key Stable and unique within one body: `<record id>:<path>`.
 * @property {string} recordId The document's record id the number lives in.
 * @property {string} path Dot path inside that record's `params`, e.g. `size.0`.
 * @property {string} label What the sheet calls it, e.g. `"Cylinder 1 height"`.
 * @property {number} value Its current value.
 * @property {'mm'} unit
 */

/** Creation ops whose numbers are dimensions of the part, as opposed to where or how it is moved. */
const DIMENSION_OPS = Object.freeze(['primitive.', 'hardware.', 'kit.', 'raspberrypi.', 'profile.', 'text.'])
/** Params that place or tessellate rather than size. */
const NOT_DIMENSIONS = Object.freeze(new Set(['center', 'segments', 'rotation', 'rotationDeg']))
const AXIS_LABELS = Object.freeze(['X', 'Y', 'Z'])

/**
 * @param {unknown} value
 * @returns {value is number}
 */
const isPositiveNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * The positive millimetre dimensions of a body's history that a part could expose: every
 * number in a creation record's size-like params (`size`, `height`, `diameter`, a bolt's
 * `length`, …) that the body is built from. Not a position, a rotation or a tessellation
 * detail; not a step's offset. Read from the records alone — no kernel work.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId The body's id (its lineage root) or any record id in its lineage.
 * @returns {ExposableParam[]} Empty for an unknown body.
 */
export function exposableParams(document, bodyId) {
  const rootId = document.rootOf(bodyId) ?? bodyId
  const body = document.bodies().find((candidate) => candidate.id === rootId)
  if (body === undefined) return []

  /** @type {Set<string>} */
  const wanted = new Set()
  const pending = [body.recordId]
  while (pending.length > 0) {
    const id = /** @type {string} */ (pending.pop())
    if (wanted.has(id)) continue
    const record = document.recordOf(id)
    if (record === undefined) continue
    wanted.add(id)
    for (const ref of [record.target, ...(record.operands ?? [])]) {
      const target = typeof ref === 'string' ? ref : ref && typeof ref === 'object' ? /** @type {any} */ (ref).id : undefined
      if (typeof target === 'string') pending.push(target)
    }
  }

  /** @type {ExposableParam[]} */
  const found = []
  for (const record of document.records) {
    if (record.id === undefined || !wanted.has(record.id)) continue
    if (!DIMENSION_OPS.some((prefix) => record.op.startsWith(prefix))) continue
    const subject = record.name ?? record.id
    for (const [key, value] of Object.entries(record.params ?? {})) {
      if (NOT_DIMENSIONS.has(key)) continue
      const label = `${subject} ${labelForParam(key).toLowerCase()}`
      if (isPositiveNumber(value)) {
        found.push({ key: `${record.id}:${key}`, recordId: record.id, path: key, label, value, unit: 'mm' })
      } else if (Array.isArray(value) && value.length > 0 && value.length <= 3 && value.every(isPositiveNumber)) {
        value.forEach((entry, index) => {
          found.push({
            key: `${record.id}:${key}.${index}`,
            recordId: /** @type {string} */ (record.id),
            path: `${key}.${index}`,
            label: `${label} ${value.length === 3 ? AXIS_LABELS[index] : index + 1}`,
            value: entry,
            unit: 'mm',
          })
        })
      }
    }
  }
  return found
}

/**
 * Turn the candidates the person ticked into `capturePart`'s `exposeParams`: a unique,
 * valid parameter name for each, and a range from a tenth to ten times its current value
 * (capped at the ±1,000,000 the format allows) — wide enough to resize the part, narrow
 * enough that a typo cannot ask the kernel for a kilometre-wide bolt.
 *
 * @param {readonly ExposableParam[]} chosen
 * @returns {ExposedParam[]}
 */
export function exposedFrom(chosen) {
  const limit = USER_PART_LIMITS.maxParamNameLength
  /** @type {Set<string>} */
  const used = new Set()
  return chosen.map((candidate) => {
    let base = slugify(candidate.label)
    if (!/^[a-z]/.test(base)) base = `p-${base}`
    base = base.slice(0, limit).replace(/-+$/, '')
    let name = base
    for (let n = 2; used.has(name); n += 1) {
      const suffix = `-${n}`
      name = `${base.slice(0, limit - suffix.length).replace(/-+$/, '')}${suffix}`
    }
    used.add(name)
    const max = Math.min(USER_PART_LIMITS.maxAbsParamValue, Number((candidate.value * 10).toPrecision(6)))
    const min = Math.min(candidate.value, Number((candidate.value / 10).toPrecision(3)))
    return {
      name,
      unit: candidate.unit,
      default: candidate.value,
      min,
      max: Math.max(max, candidate.value),
      binds: [{ record: candidate.recordId, path: candidate.path }],
    }
  })
}

/**
 * The part with a new label. The **op stays** — placed instances record it, so changing it
 * would orphan them — and so does the version: nothing that builds geometry changed.
 *
 * @param {UserPartDefinition} definition
 * @param {string} name
 * @returns {UserPartDefinition}
 */
export function renamePart(definition, name) {
  return { ...definition, name: name.trim() }
}

/**
 * A separate part with the same records under a new name: its own op, from the new name, and
 * version 1. Nothing is shared with the original afterwards.
 *
 * @param {UserPartDefinition} definition
 * @param {string} name
 * @returns {UserPartDefinition}
 */
export function duplicatePart(definition, name) {
  const trimmed = name.trim()
  return { ...definition, op: `${USER_PART_PREFIX}${slugify(trimmed)}`, name: trimmed, version: 1 }
}

/**
 * The first free name for a copy: `"Standoff copy"`, then `"Standoff copy 2"`, … — within the
 * name-length limit.
 *
 * @param {string} name
 * @param {readonly { op: string, name: string }[]} taken
 * @returns {string}
 */
export function copyNameFor(name, taken) {
  const room = USER_PART_LIMITS.maxNameLength - ' copy 99'.length
  const base = name.trim().slice(0, room).trim()
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? `${base} copy` : `${base} copy ${n}`
    if (partNameProblem(candidate, taken) === '') return candidate
  }
  return `${base} copy`
}

/**
 * How many of `records` are placed instances of `op`.
 *
 * @param {readonly OpRecord[]} records
 * @param {string} op
 * @returns {number}
 */
export function usageOf(records, op) {
  let count = 0
  for (const record of records) if (record.op === op) count += 1
  return count
}

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * User-defined library parts (`TODO/core-037`): a group of bodies saved as a named,
 * versioned, **plain-JSON** list of op records the registry can rebuild.
 *
 * ## Data, not code
 *
 * A part is the same vocabulary the action log already uses — `{ id, op, params, target,
 * operands }` records, with ids local to the part — plus a handful of exposed numeric
 * parameters, each bound to one or more number-valued paths inside those records' params.
 * Expanding a part copies its records and writes the parameter values into the bound
 * paths. There is no `eval`, no function body and no expression language anywhere, so a
 * part that arrives in an untrusted file is exactly as safe as the project it came in
 * (`ACCEPTANCE.md` scenario 8; `docs/decisions/user-library.md`).
 *
 * ## One mechanism
 *
 * A valid part is registered at runtime as a `kind: 'composite'` entry under `user.<slug>`
 * (`kernel/registry.js`'s runtime table) with `ui` metadata, so the fold, the Library's
 * listing, ghost preview and composite drop (`library.js`'s `recordsForDrop`: the part
 * record plus a trailing translate) all handle it through the code that already handles
 * `hardware.bolt`. Its value is its `result` record's value, parts intact (the registry's
 * `resultId`), which is what keeps sub-part names (`board`, `usb-a`, `mount-hole-1`).
 *
 * ## Two layers, and the version rule
 *
 * A definition can come from the open **project** (its state line — `project.js`) or from
 * the user's local **library** (IndexedDB — `storage/userLibrary.js`). The project layer
 * always wins: a placed instance is rebuilt from the definition the file carries, never
 * from whatever the library holds today, and a project part that failed to load **blocks**
 * the library copy rather than letting it stand in silently. The Library reads
 * {@link userPartStatus} to say "newer version available".
 *
 * ## Hostile input
 *
 * Every cap is a constant in {@link USER_PART_LIMITS} and is enforced here, in code:
 * records per part, nesting depth, total expanded size (so a fan-out of nested parts cannot
 * hang the fold), parameter count and range, name length, an allowed-ops list, and "no
 * reference outside the part". A bad part is a named reason, never a throw out of
 * {@link validateUserPart}; `project.js` turns it into a `LoadWarning`.
 *
 * Framework-free: no Vue, no DOM, no storage.
 *
 * @module core/userPart
 */

import modeling from '@jscad/modeling'

import { evaluate, isGroup } from './kernel/index.js'
import { RUNTIME_OP_PREFIX, lookupEntry, registry, setRuntimeEntries } from './kernel/registry.js'
import { policyFor } from './kernel/tessellation.js'
import { foldColorOverrides } from './colorOverride.js'

const { geom3 } = modeling.geometries

/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('./kernel/registry.js').RegistryEntry} RegistryEntry */

/**
 * @typedef {object} UserPartBinding
 * @property {string} record A record id local to the part.
 * @property {string} path Dot path **inside that record's `params`** to a number, e.g.
 *   `size.0`. Never reaches `op`, `id` or a reference.
 */

/**
 * @typedef {object} UserPartParam
 * @property {string} name
 * @property {'mm' | 'deg' | ''} unit
 * @property {number} default
 * @property {number} min
 * @property {number} max
 * @property {UserPartBinding[]} binds
 */

/**
 * @typedef {object} UserPartDefinition
 * @property {string} op `user.<slug>` — the registry key and the instance records' `op`.
 * @property {string} name Display name, the Library row's label.
 * @property {number} version A positive whole number; higher is newer.
 * @property {string} result The id of the record whose value the part is.
 * @property {OpRecord[]} records In fold order, ids local to the part.
 * @property {UserPartParam[]} params
 */

/** @typedef {{ ok: true, definition: UserPartDefinition } | { ok: false, op: string | null, reason: string }} UserPartVerdict */
/** @typedef {{ op: string | null, reason: string }} UserPartProblem */

/** The namespace every user part lives under — the registry's runtime namespace. */
export const USER_PART_PREFIX = RUNTIME_OP_PREFIX

/**
 * The hostile-input caps, in one place. Starting values, chosen so a realistic part (a Pi
 * enclosure kit is ~60 records) is far inside every one of them while a malicious file
 * cannot make the fold do unbounded work.
 */
export const USER_PART_LIMITS = Object.freeze({
  /** Records in one part's own list. */
  maxRecords: 500,
  /** Levels of part-inside-part, counting the outer part as 1. */
  maxNestingDepth: 4,
  /** Records one part expands to once every nested part is expanded too. */
  maxExpandedRecords: 20000,
  maxParams: 16,
  maxBindsPerParam: 16,
  maxNameLength: 80,
  maxSlugLength: 48,
  maxIdLength: 64,
  maxParamNameLength: 32,
  maxPathSegments: 8,
  /** No parameter range may reach beyond ± this (mm or degrees). */
  maxAbsParamValue: 1e6,
  maxVersion: 1e6,
  /** Definitions one project file may carry. */
  maxPartsPerProject: 64,
  /** One definition's JSON size, in UTF-16 code units. */
  maxDefinitionBytes: 1_000_000,
})

/**
 * Op namespaces a part may use: creation, transform, boolean, group, modify and style.
 * Deliberately absent: `body.delete` (a document tombstone), `asset.image` (document data),
 * `library.*`, and anything this list has not heard of. An op must also be one this build
 * knows (or another `user.*` part the same set carries).
 */
export const ALLOWED_OP_PREFIXES = Object.freeze([
  'primitive.',
  'profile.',
  'text.',
  'hardware.',
  'kit.',
  'raspberrypi.',
  'transform.',
  'boolean.',
  'group.',
  'modify.',
  'style.',
  USER_PART_PREFIX,
])

const DEFINITION_FIELDS = new Set(['op', 'name', 'version', 'result', 'records', 'params'])
const RECORD_FIELDS = new Set(['id', 'op', 'params', 'target', 'operands'])
/** The op a user colour override is, and the extra fields only it may carry (`TODO/core-054`). */
const RECOLOR_OP = 'style.recolor'
const RECOLOR_FIELDS = new Set(['colorOverride', 'colorAlpha', 'subPart'])
const PARAM_FIELDS = new Set(['name', 'unit', 'default', 'min', 'max', 'binds'])
const UNITS = new Set(['mm', 'deg', ''])
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])
const OP_PATTERN = /^user\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const ID_PATTERN = /^[A-Za-z0-9_-]+$/
const PARAM_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/
const SKETCH_OP = 'primitive.sketch'

/** A part that cannot be validated, expanded or captured — a message safe to show as-is. */
export class UserPartError extends Error {
  /**
   * @param {string} message
   * @param {string | null} [op]
   */
  constructor(message, op = null) {
    super(message)
    this.name = 'UserPartError'
    this.op = op
  }
}

/**
 * Whether `op` names a user part.
 *
 * @param {unknown} op
 * @returns {boolean}
 */
export function isUserPartOp(op) {
  return typeof op === 'string' && op.startsWith(USER_PART_PREFIX) && op.length > USER_PART_PREFIX.length
}

/**
 * A display name as a bounded op slug: lowercase ASCII letters, digits and single dashes.
 *
 * @param {string} name
 * @returns {string} Never empty — `'part'` when nothing usable is left.
 */
export function slugify(name) {
  // Bounded before any regex runs, so a hostile name cannot make the dash-trimming backtrack.
  const slug = String(name)
    .slice(0, USER_PART_LIMITS.maxNameLength * 4)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, USER_PART_LIMITS.maxSlugLength)
    .replace(/-+$/, '')
  return slug === '' ? 'part' : slug
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

/**
 * @param {unknown} ref
 * @returns {string | undefined}
 */
function refId(ref) {
  if (typeof ref === 'string') return ref
  if (isPlainObject(ref) && typeof ref.id === 'string') return ref.id
  return undefined
}

/**
 * The value at a dot path inside `root`, or `undefined`. Own properties only.
 *
 * @param {any} root
 * @param {readonly string[]} segments
 * @returns {unknown}
 */
function readPath(root, segments) {
  let cursor = root
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object' || !Object.hasOwn(cursor, segment)) return undefined
    cursor = cursor[segment]
  }
  return cursor
}

/**
 * @param {string} path
 * @param {string} label For the message.
 * @returns {string[]}
 */
function pathSegments(path, label) {
  if (typeof path !== 'string' || path === '') throw new UserPartError(`${label}: a binding's path must be text`)
  const segments = path.split('.')
  if (segments.length > USER_PART_LIMITS.maxPathSegments) {
    throw new UserPartError(`${label}: path "${path}" is deeper than ${USER_PART_LIMITS.maxPathSegments} steps`)
  }
  for (const segment of segments) {
    if (segment === '') throw new UserPartError(`${label}: path "${path}" has an empty step`)
    if (FORBIDDEN_SEGMENTS.has(segment)) throw new UserPartError(`${label}: path segment "${segment}" is not allowed`)
  }
  return segments
}

/**
 * The op namespace check, separate from "does this build know it", so the message says
 * which of the two failed.
 *
 * @param {string} op
 * @returns {boolean}
 */
function isAllowedOp(op) {
  return ALLOWED_OP_PREFIXES.some((prefix) => op.startsWith(prefix))
}

/**
 * Validate and normalise one definition, throwing a {@link UserPartError} naming the
 * first problem. Set-level rules (nesting, cycles, size) are {@link validateUserPartSet}'s.
 *
 * @param {unknown} raw
 * @returns {UserPartDefinition}
 */
function normalizeDefinition(raw) {
  if (!isPlainObject(raw)) throw new UserPartError('not a part definition (expected a JSON object)')
  let size
  try {
    size = JSON.stringify(raw).length
  } catch {
    throw new UserPartError('not a part definition (it is not plain JSON)')
  }
  if (size > USER_PART_LIMITS.maxDefinitionBytes) {
    throw new UserPartError(`the definition is larger than ${USER_PART_LIMITS.maxDefinitionBytes} characters`)
  }
  for (const key of Object.keys(raw)) {
    if (!DEFINITION_FIELDS.has(key)) throw new UserPartError(`unexpected field "${key}" in a part definition`)
  }

  const op = raw.op
  // Length first: the pattern is only ever run on a bounded string.
  if (typeof op !== 'string' || op.length > USER_PART_PREFIX.length + USER_PART_LIMITS.maxSlugLength || !OP_PATTERN.test(op)) {
    throw new UserPartError(
      `op ${JSON.stringify(op)} must be "user.<slug>" (lowercase letters, digits and dashes, at most ${USER_PART_LIMITS.maxSlugLength})`
    )
  }
  const fail = (/** @type {string} */ message) => new UserPartError(message, op)

  if (typeof raw.name !== 'string' || raw.name.trim() === '') throw fail('a part needs a name')
  const name = raw.name.trim()
  if (name.length > USER_PART_LIMITS.maxNameLength) {
    throw fail(`name is longer than ${USER_PART_LIMITS.maxNameLength} characters`)
  }
  const version = raw.version
  if (!Number.isInteger(version) || version < 1 || version > USER_PART_LIMITS.maxVersion) {
    throw fail(`version ${JSON.stringify(version)} must be a whole number from 1 to ${USER_PART_LIMITS.maxVersion}`)
  }

  if (!Array.isArray(raw.records) || raw.records.length === 0) throw fail('a part needs at least one record')
  if (raw.records.length > USER_PART_LIMITS.maxRecords) {
    throw fail(`a part has more than ${USER_PART_LIMITS.maxRecords} records`)
  }
  /** @type {Set<string>} */
  const ids = new Set()
  /** @type {OpRecord[]} */
  const records = raw.records.map((/** @type {unknown} */ candidate, /** @type {number} */ index) => {
    const label = `record ${index + 1}`
    if (!isPlainObject(candidate)) throw fail(`${label} is not an object`)
    for (const key of Object.keys(candidate)) {
      if (!RECORD_FIELDS.has(key) && !(candidate.op === RECOLOR_OP && RECOLOR_FIELDS.has(key))) {
        throw fail(
          `${label}: unexpected field "${key}" — a part's records hold only id, op, params, target and operands` +
            ' (and a style.recolor its colour, colorAlpha and subPart)'
        )
      }
    }
    const id = candidate.id
    if (typeof id !== 'string' || id.length > USER_PART_LIMITS.maxIdLength || !ID_PATTERN.test(id)) {
      throw fail(`${label}: id ${JSON.stringify(id)} must be letters, digits, "-" or "_"`)
    }
    if (ids.has(id)) throw fail(`${label}: duplicate id "${id}"`)
    const recordOp = candidate.op
    if (typeof recordOp !== 'string' || recordOp === '') throw fail(`record "${id}" has no op`)
    if (!isAllowedOp(recordOp)) {
      throw fail(
        `record "${id}": op "${recordOp}" is not allowed in a part (only creation, transform, boolean, group, modify and style ops)`
      )
    }
    if (!isUserPartOp(recordOp) && lookupEntry(recordOp, registry) === undefined) {
      throw fail(`record "${id}": unknown op "${recordOp}" — written by a newer build, or not a WarpCad op`)
    }
    if (candidate.params !== undefined && !isPlainObject(candidate.params)) throw fail(`record "${id}": params must be an object`)
    if (recordOp === SKETCH_OP && Array.isArray(candidate.params?.slices)) {
      if (candidate.params.slices.some((/** @type {any} */ slice) => isPlainObject(slice) && slice.image !== undefined)) {
        throw fail(`record "${id}": a sketch in a part may not carry a reference image`)
      }
    }
    /** @type {any} */
    const record = { id, op: recordOp, params: JSON.parse(JSON.stringify(candidate.params ?? {})) }
    if (recordOp === RECOLOR_OP) {
      const { colorOverride, colorAlpha, subPart } = candidate
      const hex = Number.isInteger(colorOverride) && colorOverride >= 0 && colorOverride <= 0xffffff
      if (colorOverride !== undefined && colorOverride !== null && !hex) {
        throw fail(`record "${id}": colorOverride must be a 0xRRGGBB whole number, or null to reset`)
      }
      if (colorAlpha !== undefined && (typeof colorAlpha !== 'number' || !(colorAlpha > 0 && colorAlpha <= 1))) {
        throw fail(`record "${id}": colorAlpha must be a number above 0 and at most 1`)
      }
      if (subPart !== undefined && (typeof subPart !== 'string' || subPart === '' || subPart.length > USER_PART_LIMITS.maxNameLength)) {
        throw fail(`record "${id}": subPart must be a part name`)
      }
      if (colorOverride !== undefined) record.colorOverride = colorOverride
      if (colorAlpha !== undefined) record.colorAlpha = colorAlpha
      if (subPart !== undefined) record.subPart = subPart
    }
    const checkRef = (/** @type {unknown} */ ref) => {
      const target = refId(ref)
      if (target === undefined) throw fail(`record "${id}": an operand must be an id or { id, pieces }`)
      if (!ids.has(target)) throw fail(`record "${id}" refers to "${target}", which is not an earlier record of this part`)
      if (isPlainObject(ref)) {
        for (const key of Object.keys(ref)) {
          if (key !== 'id' && key !== 'pieces') throw fail(`record "${id}": unexpected operand field "${key}"`)
        }
        if (ref.pieces !== undefined && typeof ref.pieces !== 'string') throw fail(`record "${id}": pieces must be text`)
        return ref.pieces === undefined ? { id: target } : { id: target, pieces: ref.pieces }
      }
      return target
    }
    if (candidate.target !== undefined) record.target = checkRef(candidate.target)
    if (candidate.operands !== undefined) {
      if (!Array.isArray(candidate.operands)) throw fail(`record "${id}": operands must be a list`)
      record.operands = candidate.operands.map(checkRef)
    }
    ids.add(id)
    return record
  })

  if (typeof raw.result !== 'string' || !ids.has(raw.result)) {
    throw fail(`result ${JSON.stringify(raw.result)} is not a record of this part`)
  }
  const result = raw.result

  const rawParams = raw.params ?? []
  if (!Array.isArray(rawParams)) throw fail('params must be a list')
  if (rawParams.length > USER_PART_LIMITS.maxParams) throw fail(`a part exposes more than ${USER_PART_LIMITS.maxParams} parameters`)
  /** @type {Set<string>} */
  const paramNames = new Set()
  const byId = new Map(records.map((record) => [String(record.id), record]))
  /** @type {UserPartParam[]} */
  const params = rawParams.map((/** @type {unknown} */ candidate, /** @type {number} */ index) => {
    if (!isPlainObject(candidate)) throw fail(`parameter ${index + 1} is not an object`)
    for (const key of Object.keys(candidate)) {
      if (!PARAM_FIELDS.has(key)) throw fail(`parameter ${index + 1}: unexpected field "${key}"`)
    }
    const paramName = candidate.name
    if (
      typeof paramName !== 'string' ||
      paramName.length > USER_PART_LIMITS.maxParamNameLength ||
      !PARAM_NAME_PATTERN.test(paramName)
    ) {
      throw fail(`parameter ${index + 1}: name ${JSON.stringify(paramName)} must start with a letter and be letters, digits, "-" or "_"`)
    }
    if (paramNames.has(paramName)) throw fail(`parameter "${paramName}" is declared twice`)
    paramNames.add(paramName)
    const label = `parameter "${paramName}"`
    const unit = candidate.unit ?? 'mm'
    if (!UNITS.has(unit)) throw fail(`${label}: unit ${JSON.stringify(unit)} must be "mm", "deg" or ""`)
    const { min, max } = candidate
    const fallback = candidate.default
    for (const [key, value] of [
      ['min', min],
      ['max', max],
      ['default', fallback],
    ]) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw fail(`${label}: ${key} must be a number`)
      if (Math.abs(value) > USER_PART_LIMITS.maxAbsParamValue) {
        throw fail(`${label}: its range is beyond ±${USER_PART_LIMITS.maxAbsParamValue}`)
      }
    }
    if (min > max) throw fail(`${label}: min ${min} is above max ${max}`)
    if (fallback < min || fallback > max) throw fail(`${label}: default ${fallback} is outside ${min}–${max}`)
    if (!Array.isArray(candidate.binds) || candidate.binds.length === 0) throw fail(`${label} binds nothing`)
    if (candidate.binds.length > USER_PART_LIMITS.maxBindsPerParam) {
      throw fail(`${label} has more than ${USER_PART_LIMITS.maxBindsPerParam} bindings`)
    }
    const binds = candidate.binds.map((/** @type {unknown} */ bind) => {
      if (!isPlainObject(bind) || typeof bind.record !== 'string' || typeof bind.path !== 'string') {
        throw fail(`${label}: a binding is { record, path }`)
      }
      for (const key of Object.keys(bind)) {
        if (key !== 'record' && key !== 'path') throw fail(`${label}: unexpected binding field "${key}"`)
      }
      const segments = pathSegments(bind.path, label)
      const target = byId.get(bind.record)
      if (target === undefined) throw fail(`${label} binds record "${bind.record}", which is not a record of this part`)
      const current = readPath(target.params, segments)
      if (typeof current !== 'number') {
        throw fail(`${label} binds "${bind.path}" on "${bind.record}", which is not a number there`)
      }
      return { record: bind.record, path: bind.path }
    })
    return { name: paramName, unit, default: fallback, min, max, binds }
  })

  return deepFreeze({ op, name, version, result, records, params })
}

/**
 * Validate one definition on its own. Never throws.
 *
 * @param {unknown} raw
 * @returns {UserPartVerdict}
 */
export function validateUserPart(raw) {
  try {
    return { ok: true, definition: normalizeDefinition(raw) }
  } catch (error) {
    const op = isPlainObject(raw) && typeof raw.op === 'string' ? raw.op : null
    if (error instanceof UserPartError) return { ok: false, op: error.op ?? op, reason: error.message }
    return { ok: false, op, reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * The `user.*` ops a definition's own records name, deduplicated, in order.
 *
 * @param {UserPartDefinition} definition
 * @returns {string[]}
 */
function nestedOpsOf(definition) {
  return [...new Set(definition.records.map((record) => record.op).filter(isUserPartOp))]
}

/**
 * The set-level rules over already-valid definitions: every nested part present, no part
 * containing itself, no cycle, nesting no deeper and expansion no bigger than the caps. A
 * part that fails any of them takes every part nesting it down too.
 *
 * Iterative and memoised throughout, so a hostile graph costs time linear in its size.
 *
 * @param {ReadonlyMap<string, UserPartDefinition>} definitions
 * @returns {Map<string, string>} op → reason, for every part that may not be used.
 */
function graphProblems(definitions) {
  /** @type {Map<string, string>} */
  const problems = new Map()

  // Self-containment and cycles: colour-marking DFS, with an explicit stack.
  /** @type {Map<string, 0 | 1 | 2>} */
  const colour = new Map()
  for (const start of definitions.keys()) {
    if (colour.get(start) === 2) continue
    /** @type {{ op: string, children: string[], index: number }[]} */
    const stack = [{ op: start, children: nestedOpsOf(/** @type {UserPartDefinition} */ (definitions.get(start))), index: 0 }]
    colour.set(start, 1)
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      if (frame.index >= frame.children.length) {
        colour.set(frame.op, 2)
        stack.pop()
        continue
      }
      const child = frame.children[frame.index]
      frame.index += 1
      if (child === frame.op) {
        problems.set(frame.op, 'it contains itself')
        continue
      }
      const childDefinition = definitions.get(child)
      if (childDefinition === undefined) continue
      const state = colour.get(child) ?? 0
      if (state === 1) {
        const from = stack.findIndex((entry) => entry.op === child)
        const loop = [...stack.slice(from).map((entry) => entry.op), child]
        for (const op of loop) if (!problems.has(op)) problems.set(op, `it is part of a cycle (${loop.join(' → ')})`)
        continue
      }
      if (state === 0) {
        colour.set(child, 1)
        stack.push({ op: child, children: nestedOpsOf(childDefinition), index: 0 })
      }
    }
  }

  // Depth and expanded size, memoised; a cyclic part is already a problem and is skipped.
  /** @type {Map<string, { depth: number, size: number }>} */
  const measured = new Map()
  const cap = USER_PART_LIMITS.maxExpandedRecords
  /** @param {string} op @returns {{ depth: number, size: number }} */
  const measure = (op) => {
    const known = measured.get(op)
    if (known !== undefined) return known
    // Placeholder while measuring, so a cycle that slipped through cannot recurse forever.
    measured.set(op, { depth: Infinity, size: Infinity })
    const definition = definitions.get(op)
    let depth = 1
    let size = 0
    if (definition !== undefined) {
      for (const record of definition.records) {
        if (isUserPartOp(record.op) && definitions.has(record.op) && !problems.has(record.op) && record.op !== op) {
          const child = measure(record.op)
          depth = Math.max(depth, child.depth + 1)
          size += child.size
        } else {
          size += 1
        }
        if (size > cap) break
      }
    }
    const result = { depth, size: Math.min(size, cap + 1) }
    measured.set(op, result)
    return result
  }
  for (const op of definitions.keys()) {
    if (problems.has(op)) continue
    const { depth, size } = measure(op)
    if (depth > USER_PART_LIMITS.maxNestingDepth) {
      problems.set(op, `parts are nested more than ${USER_PART_LIMITS.maxNestingDepth} deep`)
    } else if (size > cap) {
      problems.set(op, `it expands to more than ${cap} records`)
    }
  }

  // Missing or unusable nested parts, to a fixpoint.
  let changed = true
  while (changed) {
    changed = false
    for (const [op, definition] of definitions) {
      if (problems.has(op)) continue
      for (const child of nestedOpsOf(definition)) {
        if (!definitions.has(child)) {
          problems.set(op, `it nests "${child}", which is not carried with it`)
          changed = true
          break
        }
        if (problems.has(child)) {
          problems.set(op, `it nests "${child}", which can't be loaded`)
          changed = true
          break
        }
      }
    }
  }
  return problems
}

/**
 * Validate a set of definitions that travel together — one project file's, or one local
 * library's. Never throws.
 *
 * @param {readonly unknown[]} raws
 * @returns {{ definitions: UserPartDefinition[], problems: UserPartProblem[] }} The usable
 *   definitions in input order, and one named problem per part that is not.
 */
export function validateUserPartSet(raws) {
  /** @type {Map<string, UserPartDefinition>} */
  const valid = new Map()
  /** @type {UserPartProblem[]} */
  const problems = []
  for (const raw of raws) {
    const verdict = validateUserPart(raw)
    if (!verdict.ok) {
      problems.push({ op: verdict.op, reason: verdict.reason })
      continue
    }
    if (valid.has(verdict.definition.op)) {
      problems.push({ op: verdict.definition.op, reason: `"${verdict.definition.op}" appears more than once — the first copy is kept` })
      continue
    }
    valid.set(verdict.definition.op, verdict.definition)
  }
  const graph = graphProblems(valid)
  for (const [op, reason] of graph) problems.push({ op, reason })
  return { definitions: [...valid.values()].filter((definition) => !graph.has(definition.op)), problems }
}

/**
 * The params a fresh instance is created with: every parameter at its default.
 *
 * @param {UserPartDefinition} definition
 * @returns {Record<string, number>}
 */
export function defaultParamsOf(definition) {
  return Object.fromEntries(definition.params.map((param) => [param.name, param.default]))
}

/**
 * The records one instance expands into: the definition's records, copied, with every
 * parameter value written into its bound paths.
 *
 * @param {UserPartDefinition} definition A validated definition.
 * @param {Record<string, unknown>} [params] The instance record's params; a parameter not
 *   given takes its default.
 * @returns {OpRecord[]}
 * @throws {UserPartError} For an unknown parameter, a non-number, or a value out of range.
 */
export function expandUserPart(definition, params = {}) {
  if (!isPlainObject(params)) throw new UserPartError(`${definition.name}: params must be an object`, definition.op)
  for (const key of Object.keys(params)) {
    if (!definition.params.some((param) => param.name === key)) {
      throw new UserPartError(`${definition.name} has no parameter "${key}"`, definition.op)
    }
  }
  /** @type {any[]} */
  const records = JSON.parse(JSON.stringify(definition.records))
  const byId = new Map(records.map((record) => [record.id, record]))
  for (const param of definition.params) {
    const value = Object.hasOwn(params, param.name) ? params[param.name] : param.default
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new UserPartError(`${definition.name}: ${param.name} must be a number`, definition.op)
    }
    if (value < param.min || value > param.max) {
      const unit = param.unit === '' ? '' : ` ${param.unit}`
      throw new UserPartError(`${definition.name}: ${param.name} ${value} is outside ${param.min}–${param.max}${unit}`, definition.op)
    }
    for (const bind of param.binds) {
      const segments = bind.path.split('.')
      let cursor = byId.get(bind.record).params
      for (const segment of segments.slice(0, -1)) cursor = cursor[segment]
      cursor[segments[segments.length - 1]] = value
    }
  }
  return records
}

// --- the two layers, and the runtime registration ---------------------------------

/** @type {Map<string, UserPartDefinition>} */
let projectParts = new Map()
/** @type {Map<string, string>} op → why the project's copy could not be loaded. */
let projectUnavailable = new Map()
/** @type {Map<string, UserPartDefinition>} */
let libraryParts = new Map()
/** @type {Map<string, UserPartDefinition>} What is registered right now, by op. */
let effective = new Map()
/**
 * The last entry built per op and the key it was built for. A new entry object (which is
 * what invalidates fold-cache hits, `kernel/index.js`) is made only when the part — or a
 * part nested in it — actually changed.
 * @type {Map<string, { key: string, entry: RegistryEntry }>}
 */
const entryMemo = new Map()

/**
 * `cylinder-1-height` as the Inspector labels it: `Cylinder 1 height`.
 *
 * @param {string} name
 * @returns {string}
 */
function humanizeParamName(name) {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * @param {UserPartDefinition} definition
 * @returns {RegistryEntry}
 */
function compositeEntryFor(definition) {
  // The exposed parameters, as the Inspector's and `paramEdit.js`'s number schema
  // (`TODO/ui-055`): the same range the expansion itself enforces, so an edit is refused
  // by name before it reaches the fold. None exposed means none editable.
  const paramSchema =
    definition.params.length === 0
      ? undefined
      : Object.freeze(
          Object.fromEntries(
            definition.params.map((param) => [
              param.name,
              Object.freeze({
                kind: /** @type {'number'} */ ('number'),
                label: humanizeParamName(param.name),
                unit: param.unit,
                min: param.min,
                max: param.max,
                default: param.default,
              }),
            ])
          )
        )
  return Object.freeze({
    kind: /** @type {'composite'} */ ('composite'),
    operandCount: /** @type {0} */ (0),
    recipe: (/** @type {any} */ params) => expandUserPart(definition, params),
    resultId: definition.result,
    ...(paramSchema === undefined ? {} : { paramSchema }),
    ui: Object.freeze({ label: definition.name, defaults: Object.freeze(defaultParamsOf(definition)) }),
  })
}

/**
 * The stand-in for a part that may not be built: it throws a named reason, so an instance
 * is a broken row (`document.js`'s left-broken machinery), never a silent substitute.
 *
 * @param {string} op
 * @param {string} label
 * @param {string} reason
 * @returns {RegistryEntry}
 */
function blockedEntryFor(op, label, reason) {
  return Object.freeze({
    kind: /** @type {'native'} */ ('native'),
    operandCount: /** @type {0} */ (0),
    build: () => {
      throw new UserPartError(`part "${label}" (${op}) can't be built: ${reason}`, op)
    },
  })
}

/** Recompute what is registered from the two layers, and hand it to the registry. */
function refresh() {
  /** @type {Map<string, UserPartDefinition>} */
  const candidates = new Map()
  /** @type {Map<string, string>} */
  const blocked = new Map(projectUnavailable)
  for (const [op, definition] of libraryParts) if (!blocked.has(op)) candidates.set(op, definition)
  for (const [op, definition] of projectParts) if (!blocked.has(op)) candidates.set(op, definition)
  for (const [op, reason] of graphProblems(candidates)) {
    blocked.set(op, reason)
    candidates.delete(op)
  }
  effective = candidates

  /** @type {Map<string, string>} op → a key covering the part and everything it nests. */
  const keys = new Map()
  /** @param {string} op @returns {string} */
  const keyOf = (op) => {
    const known = keys.get(op)
    if (known !== undefined) return known
    const definition = /** @type {UserPartDefinition} */ (candidates.get(op))
    keys.set(op, '')
    const key = JSON.stringify([definition, nestedOpsOf(definition).map(keyOf)])
    keys.set(op, key)
    return key
  }

  /** @type {Map<string, RegistryEntry>} */
  const entries = new Map()
  for (const op of candidates.keys()) {
    const key = keyOf(op)
    const memo = entryMemo.get(op)
    if (memo !== undefined && memo.key === key) {
      entries.set(op, memo.entry)
      continue
    }
    const entry = compositeEntryFor(/** @type {UserPartDefinition} */ (candidates.get(op)))
    entryMemo.set(op, { key, entry })
    entries.set(op, entry)
  }
  for (const [op, reason] of blocked) {
    const label = projectParts.get(op)?.name ?? libraryParts.get(op)?.name ?? op
    const key = `blocked:${reason}`
    const memo = entryMemo.get(op)
    if (memo !== undefined && memo.key === key) {
      entries.set(op, memo.entry)
      continue
    }
    const entry = blockedEntryFor(op, label, reason)
    entryMemo.set(op, { key, entry })
    entries.set(op, entry)
  }
  setRuntimeEntries(entries)
}

/**
 * @param {readonly unknown[]} definitions Re-validated here, whatever their source.
 * @returns {{ valid: Map<string, UserPartDefinition>, invalid: Map<string, string> }}
 */
function sortDefinitions(definitions) {
  /** @type {Map<string, UserPartDefinition>} */
  const valid = new Map()
  /** @type {Map<string, string>} */
  const invalid = new Map()
  for (const raw of definitions) {
    const verdict = validateUserPart(raw)
    if (verdict.ok) {
      if (!valid.has(verdict.definition.op)) valid.set(verdict.definition.op, verdict.definition)
    } else if (verdict.op !== null) {
      invalid.set(verdict.op, verdict.reason)
    }
  }
  return { valid, invalid }
}

/**
 * Replace the project layer: the definitions the open project carries, and the parts it
 * names that could not be loaded (each of which then blocks any library copy).
 *
 * @param {readonly unknown[]} definitions Validated here; an invalid one is not used.
 * @param {Readonly<Record<string, string>>} [unavailable] op → reason.
 * @returns {void}
 */
export function setProjectParts(definitions, unavailable = {}) {
  const { valid, invalid } = sortDefinitions(definitions)
  projectParts = valid
  projectUnavailable = new Map([...Object.entries(unavailable), ...invalid])
  for (const op of projectUnavailable.keys()) projectParts.delete(op)
  refresh()
}

/**
 * Add project definitions for ops the project layer has no say on yet — never replacing
 * or unblocking one it has. What placing a part does (the project now carries it), and
 * what a worker-side fold of a shipped project does.
 *
 * @param {readonly unknown[]} definitions Validated here; an invalid one is not used.
 * @returns {void}
 */
export function ensureProjectParts(definitions) {
  const { valid } = sortDefinitions(definitions)
  let changed = false
  for (const [op, definition] of valid) {
    if (projectParts.has(op) || projectUnavailable.has(op)) continue
    projectParts.set(op, definition)
    changed = true
  }
  if (changed) refresh()
}

/**
 * @typedef {object} ProjectPartsSnapshot
 * @property {Map<string, UserPartDefinition>} parts
 * @property {Map<string, string>} unavailable
 */

/**
 * The project layer as it is, for an atomic load to put back if the fold refuses.
 *
 * @returns {ProjectPartsSnapshot}
 */
export function projectPartsSnapshot() {
  return { parts: new Map(projectParts), unavailable: new Map(projectUnavailable) }
}

/**
 * @param {ProjectPartsSnapshot} snapshot From {@link projectPartsSnapshot}.
 * @returns {void}
 */
export function restoreProjectParts(snapshot) {
  projectParts = new Map(snapshot.parts)
  projectUnavailable = new Map(snapshot.unavailable)
  refresh()
}

/**
 * Replace the library layer: the user's saved parts (`storage/userLibrary.js`).
 *
 * @param {readonly unknown[]} definitions Validated here; an invalid one is not used.
 * @returns {void}
 */
export function setLibraryParts(definitions) {
  libraryParts = sortDefinitions(definitions).valid
  refresh()
}

/**
 * The definition registered for `op` right now — the project's if it has one — or
 * `undefined` when none is, or the part is blocked.
 *
 * @param {string} op
 * @returns {UserPartDefinition | undefined}
 */
export function effectiveUserPart(op) {
  return effective.get(op)
}

/**
 * Every usable user part, in op order.
 *
 * @returns {UserPartDefinition[]}
 */
export function effectiveUserParts() {
  return [...effective.values()].sort((a, b) => (a.op < b.op ? -1 : a.op > b.op ? 1 : 0))
}

/**
 * @typedef {object} UserPartStatus
 * @property {number | null} projectVersion The open project's copy, if it carries one.
 * @property {number | null} libraryVersion The local library's copy, if it has one.
 * @property {boolean} newerVersionAvailable The library is ahead of the project — the
 *   placed instances stay on the project's version until the user chooses otherwise.
 */

/**
 * @param {string} op
 * @returns {UserPartStatus}
 */
export function userPartStatus(op) {
  const projectVersion = projectParts.get(op)?.version ?? null
  const libraryVersion = libraryParts.get(op)?.version ?? null
  return {
    projectVersion,
    libraryVersion,
    newerVersionAvailable: projectVersion !== null && libraryVersion !== null && libraryVersion > projectVersion,
  }
}

/**
 * Every `user.*` op `records` use, plus every part those parts nest, resolved through
 * `lookup`.
 *
 * @param {readonly OpRecord[]} records
 * @param {(op: string) => UserPartDefinition | undefined} lookup
 * @returns {{ definitions: UserPartDefinition[], missing: string[] }} Definitions in op
 *   order; `missing` names the ops `lookup` had nothing for.
 */
export function requiredUserParts(records, lookup) {
  /** @type {Map<string, UserPartDefinition>} */
  const found = new Map()
  /** @type {Set<string>} */
  const missing = new Set()
  const pending = records.map((record) => record.op).filter(isUserPartOp)
  while (pending.length > 0) {
    const op = /** @type {string} */ (pending.pop())
    if (found.has(op) || missing.has(op)) continue
    const definition = lookup(op)
    if (definition === undefined) {
      missing.add(op)
      continue
    }
    found.set(op, definition)
    pending.push(...nestedOpsOf(definition))
  }
  const byOp = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0)
  return {
    definitions: [...found.keys()].sort(byOp).map((op) => /** @type {UserPartDefinition} */ (found.get(op))),
    missing: [...missing].sort(byOp),
  }
}

/**
 * Forget both layers. Tests, and nothing else.
 *
 * @returns {void}
 */
export function resetUserParts() {
  projectParts = new Map()
  projectUnavailable = new Map()
  libraryParts = new Map()
  entryMemo.clear()
  refresh()
}

// --- capture -------------------------------------------------------------------------

/**
 * @typedef {object} ExposedParam
 * @property {string} name
 * @property {'mm' | 'deg' | ''} [unit] Default `mm`.
 * @property {number} min
 * @property {number} max
 * @property {number} [default] Default: the value at the first binding now.
 * @property {{ record: string, path: string }[]} binds Record ids **of the document**.
 */

/**
 * The `style.recolor` records a part carries on the chain that produces its result,
 * root-first, with a nested part's own contributed ahead of the record that places it
 * (`TODO/core-054`). A part's colour overrides are exactly these: the kernel fold
 * ignores them (`style.recolor` is geometry-neutral), so a body reads them back off the
 * definition — the same way, through {@link foldColorOverrides}, that it reads its own
 * lineage.
 *
 * Follows `target` only, the chain a document lineage follows too (a boolean's or a
 * group's operands are other bodies, whose own colours do not travel with the result).
 *
 * @param {UserPartDefinition} definition
 * @param {(op: string) => UserPartDefinition | undefined} [partOf] Nested parts' definitions.
 * @param {number} [depth] Guards a malformed cycle; validated sets cannot have one.
 * @returns {OpRecord[]}
 */
export function bakedRecolorsOf(definition, partOf = effectiveUserPart, depth = 0) {
  if (depth > USER_PART_LIMITS.maxNestingDepth) return []
  const byId = new Map(definition.records.map((record) => [String(record.id), record]))
  /** @type {OpRecord[]} */
  const chain = []
  const seen = new Set()
  /** @type {string | undefined} */
  let cursor = definition.result
  while (cursor !== undefined && !seen.has(cursor)) {
    seen.add(cursor)
    const record = byId.get(cursor)
    if (record === undefined) break
    chain.push(record)
    cursor = refId(record.target)
  }
  /** @type {OpRecord[]} */
  const found = []
  for (const record of chain.reverse()) {
    if (isUserPartOp(record.op)) {
      const nested = partOf(record.op)
      if (nested !== undefined) found.push(...bakedRecolorsOf(nested, partOf, depth + 1))
    } else if (record.op === RECOLOR_OP) {
      found.push(record)
    }
  }
  return found
}

/**
 * @typedef {object} CaptureOptions
 * @property {string} name The part's display name; its op is `user.<slug of it>`.
 * @property {readonly ExposedParam[]} [exposeParams]
 * @property {number} [version] Default 1.
 */

/**
 * Whether two kernel values are the same geometry, exactly: same group structure, part
 * names, hidden parts, colours and holes, and every polygon's every coordinate equal.
 * Compared through `geom3.toPolygons`, which applies a solid's pending transform the same
 * way the renderer and every measurement do, so a value that has been measured and one
 * that has not still compare by what they are.
 *
 * `toleranceMm` is for the one thing structure cannot explain: a measured value has its
 * pending translate baked into its polygons, an unmeasured one composes it into a matrix
 * first, so the same chain of translates lands a last-bit apart (~1e-15 mm). The default
 * `0` stays exact; everything else (names, counts, colours, holes) is exact either way.
 *
 * @param {any} a
 * @param {any} b
 * @param {number} [toleranceMm] Largest per-coordinate difference still counted equal.
 * @returns {boolean}
 */
export function sameGeometry(a, b, toleranceMm = 0) {
  if (isGroup(a) !== isGroup(b)) return false
  if (isGroup(a)) {
    const keys = Object.keys(a.parts)
    if (JSON.stringify(a.names) !== JSON.stringify(b.names)) return false
    if (JSON.stringify(keys) !== JSON.stringify(Object.keys(b.parts))) return false
    if (JSON.stringify(a.colors) !== JSON.stringify(b.colors)) return false
    if (a.holes.length !== b.holes.length) return false
    if (!a.holes.every((/** @type {any} */ hole, /** @type {number} */ index) => sameGeometry(hole, b.holes[index], toleranceMm))) return false
    return keys.every((key) => sameGeometry(a.parts[key], b.parts[key], toleranceMm))
  }
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (!Array.isArray(a.polygons) || !Array.isArray(b.polygons)) return JSON.stringify(a) === JSON.stringify(b)
  if (JSON.stringify(a.color) !== JSON.stringify(b.color)) return false
  const left = geom3.toPolygons(a)
  const right = geom3.toPolygons(b)
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const p = left[index].vertices
    const q = right[index].vertices
    if (p.length !== q.length) return false
    for (let vertex = 0; vertex < p.length; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const delta = p[vertex][axis] - q[vertex][axis]
        if (delta !== 0 && !(Math.abs(delta) <= toleranceMm)) return false
      }
    }
  }
  return true
}

/** Coordinate tolerance of the capture check: the 1e-9 mm the module's tests state. */
const CAPTURE_TOLERANCE_MM = 1e-9

/**
 * Capture a body's lineage as a self-contained part definition (`TODO/core-037`).
 *
 * Walks back from the body's **terminal** record along what its value was built from —
 * `target` and `operands`, never `supersedes`/`consumes`, which are document bookkeeping
 * (a parameter edit supersedes without reading its predecessor). That pulls in every other
 * body the lineage consumed (a boolean's operands, a group's members), in log order. Each
 * record is then rewritten with ids of its own (`r1`, `r2`, …) and only the fields a part
 * may hold; names, colours-on-the-scene and lineage fields stay with the document.
 *
 * The result is **verified**: the definition is expanded and folded at the document's
 * resolution and must be the same geometry as the body ({@link sameGeometry}, structure
 * exact, coordinates to {@link CAPTURE_TOLERANCE_MM} so a placed part ending in a translate
 * can be saved again, `TODO/core-055`) —
 * otherwise this throws rather than hand back a part that would quietly build something
 * else. That is also what catches history this cannot carry faithfully.
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {string} bodyId The body's id (its lineage root) or any record id in its lineage.
 * @param {CaptureOptions} options
 * @returns {UserPartDefinition}
 * @throws {UserPartError} Naming what stopped it.
 */
export function capturePart(document, bodyId, options) {
  const rootId = document.rootOf(bodyId) ?? bodyId
  const body = document.bodies().find((candidate) => candidate.id === rootId)
  if (body === undefined) throw new UserPartError(`there is no body "${bodyId}" to save as a part`)
  const label = body.name

  /** @type {Set<string>} */
  const wanted = new Set()
  const pending = [body.recordId]
  while (pending.length > 0) {
    const id = /** @type {string} */ (pending.pop())
    if (wanted.has(id)) continue
    const record = document.recordOf(id)
    if (record === undefined) throw new UserPartError(`"${label}" depends on "${id}", which is not built`)
    wanted.add(id)
    for (const ref of [record.target, ...(record.operands ?? [])]) {
      const target = refId(ref)
      if (target !== undefined) pending.push(target)
    }
  }

  const broken = new Set(document.brokenSteps().map((step) => step.id))
  /** @type {OpRecord[]} */
  const lineage = document.records.filter((record) => record.id !== undefined && wanted.has(record.id))
  /** @type {Map<string, string>} */
  const localIds = new Map()
  lineage.forEach((record, index) => localIds.set(String(record.id), `r${index + 1}`))
  const local = (/** @type {unknown} */ ref) => {
    const target = /** @type {string} */ (refId(ref))
    const mapped = /** @type {string} */ (localIds.get(target))
    return typeof ref === 'string' ? mapped : { ...(/** @type {any} */ (ref)), id: mapped }
  }

  const records = lineage.map((record) => {
    const name = record.name ?? record.id
    if (record.when !== undefined) {
      throw new UserPartError(`"${label}" can't be saved as a part: step "${name}" has a condition, which a part can't carry`)
    }
    if (broken.has(String(record.id))) {
      throw new UserPartError(`"${label}" can't be saved as a part: step "${name}" is broken`)
    }
    if (!isAllowedOp(record.op)) {
      throw new UserPartError(`"${label}" can't be saved as a part: step "${name}" (${record.op}) is not allowed in a part`)
    }
    /** @type {any} */
    const params = JSON.parse(JSON.stringify(record.params ?? {}))
    if (record.op === SKETCH_OP && Array.isArray(params.slices)) {
      for (const slice of params.slices) if (isPlainObject(slice)) delete slice.image
    }
    /** @type {any} */
    const copy = { id: localIds.get(String(record.id)), op: record.op, params }
    if (record.op === RECOLOR_OP) {
      // A user colour override lives on the record, beside the lineage (`TODO/core-054`).
      if (record.colorOverride !== undefined) copy.colorOverride = record.colorOverride
      if (record.colorAlpha !== undefined) copy.colorAlpha = record.colorAlpha
      if (record.subPart !== undefined) copy.subPart = record.subPart
    }
    if (record.target !== undefined && record.target !== null) copy.target = local(record.target)
    if (record.operands !== undefined) copy.operands = record.operands.map(local)
    return copy
  })

  const params = (options.exposeParams ?? []).map((exposed) => {
    const binds = exposed.binds.map((bind) => {
      const mapped = localIds.get(bind.record)
      if (mapped === undefined) {
        throw new UserPartError(`parameter "${exposed.name}" binds "${bind.record}", which is not part of "${label}"'s history`)
      }
      return { record: mapped, path: bind.path }
    })
    const first = binds[0]
    const current = first === undefined
      ? undefined
      : readPath(records.find((record) => record.id === first.record)?.params, first.path.split('.'))
    return {
      name: exposed.name,
      unit: exposed.unit ?? 'mm',
      default: exposed.default ?? current,
      min: exposed.min,
      max: exposed.max,
      binds,
    }
  })

  const verdict = validateUserPart({
    op: `${USER_PART_PREFIX}${slugify(options.name)}`,
    name: options.name,
    version: options.version ?? 1,
    result: localIds.get(body.recordId),
    records,
    params,
  })
  if (!verdict.ok) throw new UserPartError(`"${label}" can't be saved as a part: ${verdict.reason}`)
  const definition = verdict.definition

  const replayed = evaluate(expandUserPart(definition, {}), { policy: policyFor(document.resolution()) }).byId.get(definition.result)
  if (!sameGeometry(replayed, body.geometry, CAPTURE_TOLERANCE_MM)) {
    throw new UserPartError(`"${label}" can't be saved as a part: its history doesn't rebuild to exactly the same geometry`)
  }
  // The colours are not geometry, so `sameGeometry` cannot see them: read them back off the
  // definition the way a placed copy will, and require the same answer as the body.
  const knownParts = new Map(document.userParts().map((part) => [part.op, part]))
  const partOf = (/** @type {string} */ op) => knownParts.get(op) ?? effectiveUserPart(op)
  const carried = foldColorOverrides(bakedRecolorsOf(definition, partOf))
  if (JSON.stringify(carried ?? null) !== JSON.stringify(body.colorOverrides ?? null)) {
    throw new UserPartError(`"${label}" can't be saved as a part: its colour overrides don't carry over exactly`)
  }
  return definition
}

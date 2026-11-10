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
 * - {@link lineageNameProblem} — a name the body is itself built from (`TODO/ui-105`).
 * - {@link renamePart}, {@link duplicatePart}, {@link copyNameFor}, {@link usageOf} — the row menu.
 * - {@link projectImportIdentity}, {@link placedProjectMesh} — a model file imported into the
 *   project (`TODO/ui-107`): its name and op, and Save to library… on it.
 *
 * @module core/userPartTools
 */

import { REPEAT_OP } from './repeat.js'
import { RENAME_OP } from './naming.js'
import {
  REPEAT_SAVE_REASON,
  USER_PART_LIMITS,
  USER_PART_PREFIX,
  effectiveUserPart,
  isMeshPart,
  isUserPartOp,
  nestedOpsOf,
  slugify,
  userPartStatus,
} from './userPart.js'

/** @typedef {import('./userPart.js').UserPartDefinition} UserPartDefinition */
/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/**
 * Whether a body's history holds a `pattern.repeat` step: the body is a repeat, or a group (or
 * anything else) built from one. Walks `target` and `operands` the way `capturePart` does.
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {string} bodyId A body id (a lineage root).
 * @returns {boolean} `false` for an unknown body.
 */
export function holdsRepeat(document, bodyId) {
  const body = document.bodies().find((candidate) => candidate.id === bodyId)
  if (body === undefined) return false
  const seen = new Set()
  const pending = [body.recordId]
  while (pending.length > 0) {
    const id = pending.pop()
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    const record = document.recordOf(id)
    if (record === undefined) continue
    if (record.op === REPEAT_OP) return true
    for (const ref of [record.target, ...(record.operands ?? [])]) {
      const next = typeof ref === 'string' ? ref : ref?.id
      if (typeof next === 'string') pending.push(next)
    }
  }
  return false
}

/**
 * Whether *Save to library…* can run, and — when it cannot — the sentence that says why.
 * The same answer drives the Inspector's button, the toolbar's and the keyboard path.
 *
 * @param {object} state
 * @param {number} state.count How many bodies are selected.
 * @param {boolean} [state.previewing] A past History step is being previewed.
 * @param {boolean} [state.inactive] The one selected body is kept out of the fold by a condition.
 * @param {boolean} [state.repeat] The one selected body is, or holds, a repeat (`holdsRepeat`).
 * @returns {{ enabled: boolean, reason: string }}
 */
export function saveToLibraryGate({ count, previewing = false, inactive = false, repeat = false }) {
  if (previewing) return { enabled: false, reason: 'Leave the History preview to save a part' }
  if (count === 0) return { enabled: false, reason: 'Select a group or body to save it to the library' }
  if (count > 1) {
    return { enabled: false, reason: 'Select exactly 1 — tap Combine into group to make several solids one, then save it' }
  }
  if (inactive) return { enabled: false, reason: "This step isn't built — its condition doesn't hold" }
  if (repeat) return { enabled: false, reason: REPEAT_SAVE_REASON }
  return { enabled: true, reason: '' }
}

/**
 * Why a part cannot take this name, or `''` when it can.
 *
 * Identity is the **slug** (`user.<slug>` is the registry key every placed instance records),
 * so "Standoff", "standoff " and "STANDOFF" are one name, and "Stand-off" is another.
 *
 * @param {string} name
 * @param {readonly { op: string, name: string }[]} taken Every part **My parts** already holds
 *   (`TODO/ui-105`: not the open project's copies — the library and the project do not share a name space).
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
 * Why a body cannot be saved under this name because the body is **built from** a part with
 * that name (`TODO/ui-105`), or `''`. Saved as `user.<slug>`, such a part would contain itself.
 * Identity is the slug, the same rule as {@link partNameProblem}. Records only, no kernel
 * work: a sheet asks it as the person types.
 *
 * @param {string} name What was typed; the sentence repeats it trimmed.
 * @param {ReadonlySet<string>} lineageOps {@link lineageUserPartOps} of the body.
 * @returns {string}
 */
export function lineageNameProblem(name, lineageOps) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed === '' || !/[a-z0-9]/i.test(trimmed.normalize('NFKD'))) return ''
  if (!lineageOps.has(`${USER_PART_PREFIX}${slugify(trimmed)}`)) return ''
  return `${trimmed} is built from a part with that name — pick another name`
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

/**
 * The records that start a body (they supersede nothing) and whose body has not been deleted.
 * Deleting a body appends a `body.delete` tombstone and keeps the original rows, so a raw count
 * of records keeps counting a copy the user already deleted. A body consumed into another one
 * (a union, a group) is retired with it when that one is deleted. Undo removes the tombstone,
 * so the body is live again.
 *
 * @param {readonly OpRecord[]} records
 * @returns {OpRecord[]}
 */
function livePlacements(records) {
  /** @type {Map<string, OpRecord>} */
  const byId = new Map()
  for (const record of records) if (typeof record.id === 'string') byId.set(record.id, record)
  /** @type {Set<string>} */
  const dead = new Set()
  /** @type {string[]} */
  const stack = records.filter((record) => record.op === 'body.delete' && typeof record.id === 'string').map((record) => /** @type {string} */ (record.id))
  while (stack.length > 0) {
    const id = /** @type {string} */ (stack.pop())
    if (dead.has(id)) continue
    dead.add(id)
    const record = byId.get(id)
    if (record === undefined) continue
    if (typeof record.supersedes === 'string') stack.push(record.supersedes)
    for (const consumed of record.consumes ?? []) stack.push(consumed)
  }
  return records.filter((record) => record.supersedes === undefined && record.op !== 'body.delete' && !dead.has(/** @type {string} */ (record.id)))
}

/**
 * How the open project uses a user part (`TODO/ui-096`): `direct` is the number of live bodies
 * (not deleted) that place it; `nestedIn` is the names of the *placed* parts that nest it, at any depth, each once,
 * in name order. Unlike {@link usageOf} (direct use only, what the Delete dialog's "placed
 * instances" counts), this is what decides whether a part that is only in the project is still
 * listed in My parts.
 *
 * Iterative and memoised per call, so a hostile or cyclic graph terminates.
 *
 * @param {readonly OpRecord[]} records
 * @param {string} op
 * @param {(op: string) => UserPartDefinition | undefined} lookup The project's copy first, else the library's.
 * @returns {{ direct: number, nestedIn: string[] }}
 */
export function projectUsage(records, op, lookup) {
  let direct = 0
  /** @type {Set<string>} */
  const placed = new Set()
  for (const record of livePlacements(records)) {
    if (record.op === op) direct += 1
    else if (record.op.startsWith(USER_PART_PREFIX)) placed.add(record.op)
  }
  /** @type {string[]} */
  const nestedIn = []
  for (const start of placed) {
    /** @type {Set<string>} */
    const seen = new Set([start])
    const stack = [start]
    let found = false
    while (stack.length > 0 && !found) {
      const definition = lookup(/** @type {string} */ (stack.pop()))
      if (definition === undefined) continue
      for (const child of nestedOpsOf(definition)) {
        if (child === op) {
          found = true
          break
        }
        if (!seen.has(child)) {
          seen.add(child)
          stack.push(child)
        }
      }
    }
    if (found) nestedIn.push(lookup(start)?.name ?? start.replace(USER_PART_PREFIX, ''))
  }
  return { direct, nestedIn: [...new Set(nestedIn)].sort((a, b) => a.localeCompare(b)) }
}

/**
 * Why a part that is not in My parts is still listed (`TODO/ui-096`), as the tail of a sentence
 * ("it's placed 2 times in this project", "Feather enclosure, placed in this project, uses it").
 * One wording for the row's menu note and the Delete dialog.
 *
 * @param {number} direct
 * @param {readonly string[]} nestedIn
 * @returns {string}
 */
export function projectOnlyBecause(direct, nestedIn) {
  /** @type {string[]} */
  const reasons = []
  if (direct > 0) reasons.push(direct === 1 ? "it's placed once in this project" : `it's placed ${direct} times in this project`)
  if (nestedIn.length > 0) reasons.push(`${nestedIn.join(', ')}, placed in this project, ${nestedIn.length === 1 ? 'uses' : 'use'} it`)
  return reasons.join(', and ')
}

/**
 * What to delete from the view for a project-only part to leave My parts: "those" (its own
 * placed copies), the placed parts that nest it, or both.
 *
 * @param {number} direct
 * @param {readonly string[]} nestedIn
 * @returns {string}
 */
export function projectOnlyRemedy(direct, nestedIn) {
  /** @type {string[]} */
  const what = []
  if (direct > 0) what.push('those')
  if (nestedIn.length > 0) what.push(nestedIn.join(', '))
  return what.join(' and ')
}

/** What a model file is called when its name has no letter or digit to keep (`.stl`, `___.3mf`). */
const UNNAMED_IMPORT = 'Imported model'

/**
 * The name and op a model file imported **into the project** takes (`TODO/ui-107`).
 *
 * - **Name**: the file's base name, checked against the **project's** parts only. `ui-105` keeps
 *   the library's and the project's name spaces apart, so a project can import `bracket.stl`
 *   while My parts holds a `Bracket`. A second import of the same file in one project is
 *   `"<name> copy"` ({@link copyNameFor}).
 * - **Op**: `user.<slug>` of that name, unless *any* registered part already has it — My parts'
 *   `Bracket` is `user.bracket` too, and a project copy under that op would shadow it in this
 *   project, so its row would show (and drag in) the imported file. Then `-2`, `-3`, … until free.
 *   The op is identity only; nobody reads it, and Save to library… names the saved part afresh.
 *
 * @param {string} fileBaseName The file's name without its extension.
 * @param {{ projectParts: readonly { op: string, name: string }[], opTaken: (op: string) => boolean }} taken
 * @returns {{ name: string, op: string }}
 */
export function projectImportIdentity(fileBaseName, { projectParts, opTaken }) {
  const trimmed = String(fileBaseName ?? '').trim().slice(0, USER_PART_LIMITS.maxNameLength).trim()
  const base = trimmed !== '' && /[a-z0-9]/i.test(trimmed.normalize('NFKD')) ? trimmed : UNNAMED_IMPORT
  const name = partNameProblem(base, projectParts) === '' ? base : copyNameFor(base, projectParts)
  const stem = `${USER_PART_PREFIX}${slugify(name)}`
  let op = stem
  for (let n = 2; opTaken(op) && n < 10_000; n += 1) op = `${stem}-${n}`
  return { name, op }
}

/** The steps a placed part may have after it and still be "just that part, placed". */
const PLACEMENT_OPS = new Set(['transform.translate', 'transform.rotate', RENAME_OP])

/**
 * The imported model a body *is*, when it is one placed as-is and the project alone carries it
 * (`TODO/ui-107`), else `null`: its lineage is the one `user.*` creation record plus nothing but
 * moves, turns and renames, the part is a mesh import, and My parts has no copy of it.
 *
 * Save to library… on such a body stores **the project's copy of the definition itself**, under
 * the chosen name, rather than wrapping it in a new part that nests it — which would also have to
 * carry the nested mesh into My parts, leaving two rows for one model, the wrapper without a size.
 * The placement is dropped, as it is from every saved part: a part is placed where it is dropped.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId
 * @returns {UserPartDefinition | null}
 */
export function placedProjectMesh(document, bodyId) {
  const root = document.rootOf(bodyId) ?? bodyId
  const lineage = document.lineageOf(root)
  const [created, ...rest] = lineage
  if (created === undefined || !isUserPartOp(created.op)) return null
  if (rest.some((record) => !PLACEMENT_OPS.has(record.op))) return null
  if (userPartStatus(created.op).libraryVersion !== null) return null
  const definition = document.userParts().find((part) => part.op === created.op) ?? effectiveUserPart(created.op)
  return definition !== undefined && isMeshPart(definition) ? definition : null
}

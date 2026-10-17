// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A linked Repeat (`TODO/core-061`): one `pattern.repeat` row that re-places a body's own
 * steps at every matching part of another body, and follows the first body's edits.
 *
 * ```json
 * { "op": "pattern.repeat",
 *   "params": { "source": "<Bolt 1 root id>",
 *               "seed": { "id": "<Pi root id>", "pieces": "hole1" },
 *               "targets": ["hole2", "hole3", "hole4"] } }
 * ```
 *
 * ## What the record means
 *
 * The record stores **no copy** of the source's steps; that is what makes it linked. When the
 * row folds, the source's lineage *as it stands at this row* (root first) is replayed once per
 * target with every operand that addresses the seed — the seed body, by its lineage root, and
 * the seed part — re-aimed at the target. Every other operand is left alone, which is why a
 * bolt's Z snap onto `mb` still snaps onto `mb`. A substituted operand keeps the record id it
 * named, so it still reads the Pi *as it was at that step*; only its `pieces` changes.
 *
 * The steps before the first one that mentions the seed (a bolt's creation record, its
 * rotate) are not re-run: their value is already in the fold, built once, shared by every
 * member. Only the steps from there on run per target, through the kernel's own
 * `evaluate` — the same fold as every other record, never a second evaluator.
 *
 * So an edit that *revises* a step already in the source's lineage before this row (an
 * Inspector param edit on the replace path, a History edit of the Align, a variable) reaches
 * every member, and a step *appended* to the source after this row (a later gizmo drag) moves
 * the source alone. That is the linear timeline (`CLAUDE.md`), stated rather than worked around.
 *
 * ## One body, one member per target
 *
 * `bodies()` reports one Body per lineage, so the repeat is a **new lineage root** whose value
 * is a group with one visible part per target, named after it (`hole2`). Each part is that
 * member's evaluated result, combined; the member's own parts ride along hidden as
 * `hole2.head`, `hole2.thread`, `hole2.tap`, so a nut can be snapped to one repeated bolt's
 * thread and a case can subtract every repeated tap. Drilling into a member is the ordinary
 * `{ id, pieces: 'hole3' }` address (`TODO/core-024`).
 *
 * ## Members that cannot be built
 *
 * A target that stops existing (the seed body becomes a variant without `hole4`) breaks that
 * **member**, not the row's idea: {@link evaluateRepeat} reports it per target. The document
 * refuses it like any other failure unless the row is left broken (`TODO/ui-052`), in which
 * case the members that do build are drawn and the broken ones are listed. A member may also
 * carry its own condition (`params.when[target]`, the repair dialog's **Only when…**): while
 * false it is off, neither drawn nor counted nor broken.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js. It never
 * imports `document.js`; the document hands it what it needs, and the command-layer helpers
 * at the bottom take the document as an argument.
 *
 * @module core/repeat
 */

import { evaluate } from './kernel/index.js'
import { add, combine, createGroup, isGroup } from './kernel/group.js'

/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('./kernel/registry.js').OperandRef} OperandRef */
/** @typedef {import('./kernel/registry.js').RegistryEntry} RegistryEntry */
/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./kernel/group.js').Group} Group */

/** The op. Registered in `kernel/registry.js` with no `ui`: `TODO/ui-069` owns the trigger. */
export const REPEAT_OP = 'pattern.repeat'

/**
 * Hard limits. One number, read by the document (decision 5) and by the AI tool's schema
 * (`src/ai/tools/limits.js`), so the two cannot drift.
 */
export const REPEAT_LIMITS = Object.freeze({ maxTargets: 64 })

/**
 * The ops a repeat body's own lineage may continue with: a rename, a colour, a delete. Anything
 * else would move or reshape the members on their own and silently break the link the user
 * asked for (decision 6).
 */
export const REPEAT_LINEAGE_OPS = Object.freeze(new Set(['style.recolor', 'style.rename', 'body.delete']))

/**
 * @typedef {object} RepeatSeed
 * @property {string} id The seed body's lineage root.
 * @property {string} pieces One part name on it, e.g. `hole1`.
 */

/**
 * @typedef {object} RepeatParams
 * @property {string} source The lineage root of the body whose steps are repeated.
 * @property {RepeatSeed} seed
 * @property {string[]} targets Part names on `seed.id`, each a member.
 * @property {Record<string, any>} [when] A condition per target (`{ ref, param, in }` or
 *   `{ var, in }`), written by the repair dialog's **Only when…**.
 */

/**
 * @typedef {object} BrokenMember
 * @property {string} target
 * @property {string} reason
 */

/**
 * What a repeat body is, as `bodies()` reports it on `Body.repeat`. Plain data.
 *
 * @typedef {object} RepeatInfo
 * @property {string} source
 * @property {string} sourceName What the source is called now.
 * @property {string} sourceOp The source's creation op, e.g. `hardware.bolt`.
 * @property {Record<string, any>} sourceParams What the source is, as the members were built.
 * @property {RepeatSeed} seed
 * @property {string} seedName
 * @property {string[]} targets
 * @property {string[]} members The targets actually built, in target order.
 * @property {BrokenMember[]} broken
 * @property {string[]} inactive Targets whose own condition is false.
 */

/**
 * How the fold, or a live document, answers the questions {@link checkRepeat} asks.
 *
 * @typedef {object} RepeatView
 * @property {(id: string) => string | undefined} rootOf The lineage root of any record id.
 * @property {(root: string) => 'live' | 'deleted' | 'consumed'} stateOf
 * @property {(root: string) => string} nameOf
 * @property {(root: string) => readonly OpRecord[]} lineageOf Root first.
 * @property {(root: string) => Geom3 | Group | undefined} valueOf The body's current value.
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isPartName(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes(',')
}

/**
 * The record's params, shaped — or why not, naming the field.
 *
 * @param {unknown} params
 * @returns {string | null}
 */
export function repeatParamsError(params) {
  if (!isPlainObject(params)) return 'a repeat needs params { source, seed, targets }'
  if (typeof params.source !== 'string' || params.source.length === 0) {
    return 'a repeat needs `source`, the id of the body whose steps it repeats'
  }
  const seed = params.seed
  if (!isPlainObject(seed) || typeof seed.id !== 'string' || seed.id.length === 0 || !isPartName(seed.pieces)) {
    return 'a repeat needs `seed`: { id, pieces }, the body and the one part the source was placed against'
  }
  if (!Array.isArray(params.targets) || !params.targets.every(isPartName)) {
    return '`targets` must be a list of part names, e.g. ["hole2", "hole3"]'
  }
  if (params.when !== undefined) {
    if (!isPlainObject(params.when)) return '`when` must map a target to its condition'
    for (const [target, condition] of Object.entries(params.when)) {
      if (!params.targets.includes(target)) return `\`when\` names ${target}, which is not one of the targets`
      if (!isPlainObject(condition)) return `\`when.${target}\` must be a condition`
    }
  }
  const extra = Object.keys(params).find((key) => !['source', 'seed', 'targets', 'when'].includes(key))
  return extra === undefined ? null : `a repeat has no param \`${extra}\``
}

/**
 * The parts listed in an operand's `pieces`, or `[]` for a whole-body address.
 *
 * @param {unknown} ref
 * @returns {string[]}
 */
function piecesOf(ref) {
  const pieces = isPlainObject(ref) ? ref.pieces : undefined
  return typeof pieces === 'string' ? pieces.split(',').map((piece) => piece.trim()) : []
}

/**
 * @param {unknown} ref
 * @returns {string | undefined}
 */
function refIdOf(ref) {
  if (typeof ref === 'string') return ref
  return isPlainObject(ref) && typeof ref.id === 'string' ? ref.id : undefined
}

/**
 * Does this operand address the seed: the seed body (by its lineage root) and the seed part?
 *
 * @param {unknown} ref
 * @param {RepeatSeed} seed
 * @param {(id: string) => string | undefined} rootOf
 * @returns {boolean}
 */
function addressesSeed(ref, seed, rootOf) {
  const id = refIdOf(ref)
  if (id === undefined || rootOf(id) !== seed.id) return false
  return piecesOf(ref).includes(seed.pieces)
}

/**
 * One step re-aimed at another part: every operand that addresses the seed has the seed part
 * renamed to `target` in its `pieces`; the record id it reads stays the same (the seed body
 * *as it was at that step*). Every other operand, and every other field, is untouched.
 *
 * @param {OpRecord} record
 * @param {RepeatSeed} seed
 * @param {string} target
 * @param {(id: string) => string | undefined} [rootOf] Lineage root of a record id. Defaults
 *   to "every id is its own root", which is right for a step naming the seed's root directly.
 * @returns {OpRecord} `record` itself when nothing in it addresses the seed.
 */
export function substituteSeed(record, seed, target, rootOf = (id) => id) {
  /** @param {any} ref */
  const swap = (ref) => {
    if (!addressesSeed(ref, seed, rootOf)) return ref
    const pieces = piecesOf(ref)
      .map((piece) => (piece === seed.pieces ? target : piece))
      .join(',')
    return { ...ref, pieces }
  }
  let changed = false
  /** @type {OpRecord} */
  const next = { ...record }
  if (record.target !== undefined) {
    const swapped = swap(record.target)
    if (swapped !== record.target) {
      next.target = swapped
      changed = true
    }
  }
  if (Array.isArray(record.operands)) {
    const swapped = record.operands.map(swap)
    if (swapped.some((ref, index) => ref !== record.operands?.[index])) {
      next.operands = swapped
      changed = true
    }
  }
  return changed ? next : record
}

/**
 * Whether any step of a lineage addresses the seed — the condition for a repeat to mean
 * anything (decision 5: otherwise every member would land on the source).
 *
 * @param {readonly OpRecord[]} lineage
 * @param {RepeatSeed} seed
 * @param {(id: string) => string | undefined} [rootOf]
 * @returns {boolean}
 */
export function mentionsSeed(lineage, seed, rootOf = (id) => id) {
  return lineage.some((record) => substituteSeed(record, seed, seed.pieces + '\u0000', rootOf) !== record)
}

/**
 * The parts sharing the seed's name stem: `hole1` → `hole1`…`hole4`, in number order, seed
 * included — what `TODO/ui-069` pre-ticks. A name with no trailing number (`mb`) has no
 * family. The stem must match exactly (`fan1hole` and `hathole1` are not holes); the number is
 * compared as a number, so `hole10` is a member of `hole1`'s family, after `hole4`.
 *
 * @param {readonly string[]} partNames
 * @param {string} seed
 * @returns {string[]}
 */
export function nameFamily(partNames, seed) {
  const match = /^(.*?)(\d+)$/.exec(seed)
  if (match === null || !partNames.includes(seed)) return []
  const stem = match[1]
  /** @type {Array<[string, number]>} */
  const family = []
  for (const name of new Set(partNames)) {
    if (!name.startsWith(stem)) continue
    const rest = name.slice(stem.length)
    if (/^\d+$/.test(rest)) family.push([name, Number(rest)])
  }
  return family.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([name]) => name)
}

/**
 * The record ids a `pattern.repeat` depends on: its source and its seed body. Empty for any
 * other op. `document.js`'s `referencedIdsOf` and `project.js`'s load cascade read these, so an
 * Undo, a delete, a reorder and a merge all see the dependency.
 *
 * @param {OpRecord} record
 * @returns {string[]}
 */
export function repeatReferencedIds(record) {
  if (record?.op !== REPEAT_OP) return []
  const params = record.params ?? {}
  return [params.source, params.seed?.id].filter((id) => typeof id === 'string')
}

/**
 * Whether any target of a repeat record carries its own condition.
 *
 * @param {OpRecord} record
 * @returns {boolean}
 */
export function hasMemberConditions(record) {
  return record?.op === REPEAT_OP && isPlainObject(record.params?.when) && Object.keys(record.params.when).length > 0
}

/**
 * `Bolt 1 ×3`: what a repeat body is called until someone renames it.
 *
 * @param {string} sourceName
 * @param {number} count
 * @returns {string}
 */
export function defaultRepeatName(sourceName, count) {
  return `${sourceName} ×${count}`
}

/**
 * `Repeat → hole2, hole3, hole4`: the History row and the Undo button.
 *
 * @param {OpRecord} record
 * @returns {string}
 */
export function repeatLabel(record) {
  const targets = Array.isArray(record.params?.targets) ? record.params.targets : []
  return targets.length === 0 ? 'Repeat' : `Repeat → ${targets.join(', ')}`
}

/**
 * Why `id` cannot be used as a body here, or `null`.
 *
 * @param {RepeatView} view
 * @param {string} id
 * @returns {string | null}
 */
function bodyError(view, id) {
  const root = view.rootOf(id)
  if (root === undefined) return `There is no body "${id}"`
  if (root !== id) return `"${id}" is a step of ${view.nameOf(root)}, not the body itself — use "${root}"`
  const state = view.stateOf(root)
  if (state === 'deleted') return `${view.nameOf(root)} has been deleted`
  if (state === 'consumed') return `${view.nameOf(root)} has been consumed into another body`
  return null
}

/**
 * The rules every repeat must pass, wherever it is judged: the document's fold (so an append, a
 * reload and a re-fold all apply them) and {@link repeatRefusal}. Target existence is the one
 * rule not here: at fold time a missing target breaks one **member** (decision 8), so the fold
 * reports it per target instead.
 *
 * @param {RepeatView} view
 * @param {unknown} params
 * @returns {string | null}
 */
export function checkRepeat(view, params) {
  const shape = repeatParamsError(params)
  if (shape !== null) return shape
  const { source, seed, targets } = /** @type {RepeatParams} */ (params)
  const sourceProblem = bodyError(view, source)
  if (sourceProblem !== null) return sourceProblem
  const sourceName = view.nameOf(source)
  if (source === seed.id) return `${sourceName} can't be repeated onto its own parts`
  const seedProblem = bodyError(view, seed.id)
  if (seedProblem !== null) return seedProblem
  const seedName = view.nameOf(seed.id)
  if (!partsOf(view.valueOf(seed.id)).includes(seed.pieces)) return `${seedName} has no part named ${seed.pieces}`
  if (targets.length === 0) return `Pick at least one target besides ${seed.pieces}`
  if (targets.length > REPEAT_LIMITS.maxTargets) {
    return `A repeat has at most ${REPEAT_LIMITS.maxTargets} targets; this one has ${targets.length}`
  }
  const seen = new Set()
  for (const target of targets) {
    if (target === seed.pieces) return `${seed.pieces} is where ${sourceName} already is — pick the other targets`
    if (seen.has(target)) return `${target} is listed twice`
    seen.add(target)
  }
  const lineage = view.lineageOf(source)
  if (!mentionsSeed(lineage, seed, view.rootOf)) {
    return `Nothing in ${sourceName}'s steps refers to ${seed.pieces}, so every repeat would land on ${sourceName}`
  }
  // `TODO/core-064`: a Subtract with a Pi's hole leaves the Pi in the scene, so the plate it
  // cut can now be a repeat's source with that Pi as the seed. A member re-runs every step from
  // the first one that mentions the seed — here the cut itself, which builds a whole new plate
  // — so the repeat would add one more complete plate per hole rather than drill the one plate.
  // Refused, with the way that does work. (Before core-064 a boolean always retired the seed,
  // so the seed check above refused this already; nothing that used to be accepted is refused.)
  const from = lineage.findIndex((record) => mentionsSeed([record], seed, view.rootOf))
  const consuming = lineage.slice(from).find((record) => record.consumes !== undefined)
  if (consuming !== undefined) {
    return (
      `${sourceName} is cut with ${seedName} › ${seed.pieces}, so a repeat would copy the whole of ${sourceName} once per target. ` +
      `Subtract the other parts one at a time instead: ${seedName} stays in the scene after each Subtract.`
    )
  }
  return null
}

/**
 * Every part name a value has, hidden ones included; `[]` for a bare solid.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function partsOf(value) {
  return isGroup(value) ? Object.keys(value.parts) : []
}

/**
 * A live document seen as a {@link RepeatView}.
 *
 * @param {import('./document.js').WarpDocument} document
 * @returns {RepeatView}
 */
function documentView(document) {
  const bodies = new Map(document.bodies().map((body) => [body.id, body]))
  /** @param {string} root */
  const nameOf = (root) => bodies.get(root)?.name ?? document.recordOf(root)?.name ?? root
  return {
    rootOf: (id) => document.rootOf(id),
    stateOf: (root) => {
      if (bodies.has(root)) return 'live'
      return document.lineageOf(root).at(-1)?.op === 'body.delete' ? 'deleted' : 'consumed'
    },
    nameOf: (root) => {
      const body = bodies.get(root)
      if (body !== undefined) return body.name
      const renamed = [...document.lineageOf(root)].reverse().find((record) => record.op === 'style.rename' && typeof record.params?.name === 'string')
      return renamed?.params?.name ?? nameOf(root)
    },
    lineageOf: (root) => document.lineageOf(root),
    valueOf: (root) => bodies.get(root)?.geometry,
  }
}

/**
 * Why a repeat would be refused if it were appended to `document` now (decision 5), or `null`.
 * Exactly the fold's own rules plus "every target is a part of the seed body", worded for the
 * person (or model) choosing them. `TODO/ui-069`'s panel shows this live; the AI tool returns it.
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {unknown} params
 * @returns {string | null}
 */
export function repeatRefusal(document, params) {
  const view = documentView(document)
  const problem = checkRepeat(view, params)
  if (problem !== null) return problem
  const { seed, targets } = /** @type {RepeatParams} */ (params)
  const parts = partsOf(view.valueOf(seed.id))
  const missing = targets.find((target) => !parts.includes(target))
  return missing === undefined ? null : `${view.nameOf(seed.id)} has no part named ${missing}`
}

/**
 * The record a repeat appends, from its params: a fresh id, nothing else.
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {RepeatParams} params
 * @returns {OpRecord}
 */
export function repeatRecord(document, params) {
  return {
    id: document.nextId('repeat'),
    op: REPEAT_OP,
    params: {
      source: params.source,
      seed: { id: params.seed.id, pieces: params.seed.pieces },
      targets: [...params.targets],
    },
  }
}

/**
 * Append a repeat — the one command-layer call both `TODO/ui-069`'s Apply and the AI `repeat`
 * tool make. Refused (thrown, nothing appended) with {@link repeatRefusal}'s reason.
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {RepeatParams} params
 * @param {import('./document.js').TransactionOptions} transaction
 * @returns {{ record: OpRecord }}
 */
export function appendRepeat(document, params, transaction) {
  const problem = repeatRefusal(document, params)
  if (problem !== null) throw new Error(problem)
  const record = repeatRecord(document, params)
  document.append(record, { ...transaction, label: transaction.label ?? repeatLabel(record) })
  return { record }
}

/**
 * The repeat record behind a body, or a thrown reason.
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {string} bodyId
 * @returns {OpRecord}
 */
function repeatRootOf(document, bodyId) {
  const root = document.rootOf(bodyId)
  const record = root === undefined ? undefined : document.recordOf(root)
  if (record?.op !== REPEAT_OP) throw new Error(`"${bodyId}" is not a repeat`)
  return record
}

/**
 * Remove one member (decision 7): a **replace** of the repeat record with `target` dropped —
 * one Undo step. Removing the last target deletes the repeat body instead. This is what Delete
 * on a drilled-in member does (`document.removePart` routes here).
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {string} bodyId
 * @param {string} target
 * @param {import('./document.js').TransactionOptions} transaction
 * @returns {void}
 */
export function removeRepeatMember(document, bodyId, target, transaction) {
  const record = repeatRootOf(document, bodyId)
  const params = /** @type {RepeatParams} */ (record.params)
  if (!params.targets.includes(target)) throw new Error(`${target} is not one of this repeat's targets`)
  const remaining = params.targets.filter((name) => name !== target)
  if (remaining.length === 0) {
    document.deleteBodies([/** @type {string} */ (record.id)], transaction)
    return
  }
  document.replaceRecord(/** @type {string} */ (record.id), withoutTarget(record, target), {
    ...transaction,
    label: transaction.label ?? `Remove ${target} from the repeat`,
  })
}

/**
 * A repeat record with one target (and its condition) dropped.
 *
 * @param {OpRecord} record
 * @param {string} target
 * @returns {OpRecord}
 */
export function withoutTarget(record, target) {
  const params = /** @type {RepeatParams} */ (record.params)
  const { [target]: _dropped, ...when } = params.when ?? {}
  const { when: _when, ...rest } = params
  return {
    ...record,
    params: { ...rest, targets: params.targets.filter((name) => name !== target), ...(Object.keys(when).length > 0 ? { when } : {}) },
  }
}

/**
 * A repeat record with one target renamed — the repair dialog's **Remap** for a member.
 *
 * @param {OpRecord} record
 * @param {string} from
 * @param {string} to
 * @returns {OpRecord}
 */
export function withRenamedTarget(record, from, to) {
  const params = /** @type {RepeatParams} */ (record.params)
  if (to === params.seed.pieces) throw new Error(`${to} is where the source already is`)
  if (params.targets.includes(to)) throw new Error(`${to} is already one of the targets`)
  const when = params.when === undefined ? undefined : Object.fromEntries(Object.entries(params.when).map(([key, value]) => [key === from ? to : key, value]))
  return {
    ...record,
    params: { ...params, targets: params.targets.map((name) => (name === from ? to : name)), ...(when === undefined ? {} : { when }) },
  }
}

/**
 * Why a body cannot be moved, turned or reshaped on its own (decision 6), or `null`.
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {string} bodyId
 * @returns {string | null}
 */
export function repeatMoveRefusal(document, bodyId) {
  const root = document.rootOf(bodyId)
  const record = root === undefined ? undefined : document.recordOf(root)
  if (record?.op !== REPEAT_OP) return null
  const view = documentView(document)
  const params = /** @type {RepeatParams} */ (record.params)
  return moveRefusalText(view.nameOf(params.source), view.nameOf(params.seed.id))
}

/**
 * @param {string} sourceName
 * @param {string} seedName
 * @returns {string}
 */
export function moveRefusalText(sourceName, seedName) {
  return `Move ${sourceName} or ${seedName}; the repeats follow them`
}

// ---------------------------------------------------------------------------
// Evaluation (called by `document.js`'s fold)

/**
 * The substituted steps per target, kept per repeat record so a re-fold hands the kernel the
 * **same record objects** and its fold cache (`TODO/core-031`) can serve unchanged members.
 *
 * @type {WeakMap<OpRecord, { lineage: readonly OpRecord[], chains: Map<string, { from: number, records: OpRecord[] }> }>}
 */
const chainCache = new WeakMap()

/** @type {WeakMap<object, Geom3>} A member's combined solid, per member value. */
const combinedCache = new WeakMap()

/** @type {WeakMap<OpRecord, { values: readonly unknown[], names: string, value: Group }>} */
const groupCache = new WeakMap()

/**
 * The id a member's copy of one step carries inside its own small fold. Never enters the log.
 *
 * @param {OpRecord} repeat
 * @param {string} target
 * @param {string} id
 * @returns {string}
 */
function memberId(repeat, target, id) {
  return `${repeat.id}/${target}/${id}`
}

/**
 * The steps a member re-runs: from the first one that mentions the seed to the end, each with
 * the seed re-aimed, its own id renamed, and its references to an earlier re-run step renamed
 * to match. `from` is that first step's index; everything before it is reused as folded.
 *
 * @param {OpRecord} repeat
 * @param {readonly OpRecord[]} lineage
 * @param {string} target
 * @param {(id: string) => string | undefined} rootOf
 * @returns {{ from: number, records: OpRecord[] }}
 */
function chainFor(repeat, lineage, target, rootOf) {
  let cached = chainCache.get(repeat)
  const same = cached !== undefined && cached.lineage.length === lineage.length && cached.lineage.every((record, index) => record === lineage[index])
  if (cached === undefined || !same) {
    cached = { lineage: [...lineage], chains: new Map() }
    chainCache.set(repeat, cached)
  }
  const hit = cached.chains.get(target)
  if (hit !== undefined) return hit

  const seed = /** @type {RepeatParams} */ (repeat.params).seed
  const from = lineage.findIndex((record) => substituteSeed(record, seed, target, rootOf) !== record)
  /** @type {Map<string, string>} */
  const renamed = new Map()
  /** @param {any} ref */
  const rename = (ref) => {
    const id = refIdOf(ref)
    const to = id === undefined ? undefined : renamed.get(id)
    if (to === undefined) return ref
    return typeof ref === 'string' ? to : { ...ref, id: to }
  }
  /** @type {OpRecord[]} */
  const records = []
  for (const original of from < 0 ? [] : lineage.slice(from)) {
    const swapped = substituteSeed(original, seed, target, rootOf)
    const { name: _name, when: _when, ...rest } = swapped
    /** @type {OpRecord} */
    const copy = { ...rest, id: memberId(repeat, target, /** @type {string} */ (original.id)) }
    if (copy.target !== undefined) copy.target = rename(copy.target)
    if (copy.operands !== undefined) copy.operands = copy.operands.map(rename)
    if (copy.supersedes !== undefined) copy.supersedes = rename(copy.supersedes)
    if (copy.consumes !== undefined) copy.consumes = copy.consumes.map(rename)
    renamed.set(/** @type {string} */ (original.id), /** @type {string} */ (copy.id))
    records.push(copy)
  }
  const chain = { from, records }
  cached.chains.set(target, chain)
  return chain
}

/**
 * @typedef {object} RepeatFoldInput
 * @property {OpRecord} record The repeat record.
 * @property {readonly OpRecord[]} lineage The source's lineage as it stands at this row, root first.
 * @property {(id: string) => string | undefined} rootOf
 * @property {ReadonlyMap<string, Geom3 | Group>} byId The fold's values so far.
 * @property {Readonly<Record<string, RegistryEntry>>} registry
 * @property {import('./kernel/index.js').FoldCache | null} cache
 * @property {import('./kernel/tessellation.js').TessellationPolicy} policy
 * @property {string} seedName For a member's "no part named" reason.
 * @property {(record: OpRecord) => OpRecord} [resolve] Project-variable bindings resolved, as the
 *   fold resolves every record before the kernel sees it (`TODO/core-050`).
 * @property {(id: string) => boolean} [passedThrough] A step the fold folded as identity (left
 *   broken, or an operation switched off by a condition): a member does the same.
 * @property {(target: string) => { state: 'active' | 'inactive' | 'invalid', reason?: string }} [memberState]
 *   A member's own condition.
 */

/**
 * @typedef {object} RepeatFoldResult
 * @property {Group | undefined} value `undefined` when no member was built.
 * @property {string[]} members
 * @property {BrokenMember[]} broken
 * @property {string[]} inactive
 */

/**
 * Build every member of a repeat. Never throws for a member: each one that cannot be built is
 * reported in `broken`, so the caller decides whether that refuses the row.
 *
 * @param {RepeatFoldInput} input
 * @returns {RepeatFoldResult}
 */
export function evaluateRepeat(input) {
  const { record, lineage, rootOf, byId, registry, cache, policy, seedName } = input
  const resolve = input.resolve ?? ((step) => step)
  const params = /** @type {RepeatParams} */ (record.params)
  /** @type {string[]} */
  const members = []
  /** @type {Array<Geom3 | Group>} */
  const values = []
  /** @type {BrokenMember[]} */
  const broken = []
  /** @type {string[]} */
  const inactive = []

  for (const target of params.targets) {
    const verdict = input.memberState?.(target) ?? { state: 'active' }
    if (verdict.state === 'inactive') {
      inactive.push(target)
      continue
    }
    if (verdict.state === 'invalid') {
      broken.push({ target, reason: `condition can't be evaluated: ${verdict.reason ?? 'unknown'}` })
      continue
    }
    const outcome = buildMember(record, lineage, target, { rootOf, byId, registry, cache, policy, seedName, resolve, passedThrough: input.passedThrough })
    if ('reason' in outcome) broken.push({ target, reason: outcome.reason })
    else {
      members.push(target)
      values.push(outcome.value)
    }
  }
  return { value: members.length === 0 ? undefined : assemble(record, members, values), members, broken, inactive }
}

/**
 * One member's value, or why it has none.
 *
 * @param {OpRecord} record
 * @param {readonly OpRecord[]} lineage
 * @param {string} target
 * @param {Omit<RepeatFoldInput, 'record' | 'lineage' | 'memberState' | 'resolve'> & { resolve: (record: OpRecord) => OpRecord }} context
 * @returns {{ value: Geom3 | Group } | { reason: string }}
 */
function buildMember(record, lineage, target, context) {
  const { rootOf, byId, registry, cache, policy, seedName, resolve } = context
  const seed = /** @type {RepeatParams} */ (record.params).seed
  const chain = chainFor(record, lineage, target, rootOf)
  if (chain.from < 0) return { reason: `nothing in the source's steps refers to ${seed.pieces}` }
  /** @type {Map<string, Geom3 | Group>} */
  let local = new Map()
  const renamedIds = new Set(chain.records.map((step) => step.id))
  try {
    chain.records.forEach((step, index) => {
      const original = lineage[chain.from + index]
      // Every operand this step reads that is not one of the member's own re-run steps.
      for (const ref of [step.target, ...(step.operands ?? [])]) {
        const id = refIdOf(ref)
        if (id === undefined || renamedIds.has(id) || local.has(id)) continue
        const value = byId.get(id)
        if (value === undefined) throw new Error(`it needs "${id}", which is not built`)
        local.set(id, value)
        if (piecesOf(ref).includes(target) && !partsOf(value).includes(target)) {
          throw new Error(`${seedName} has no part named ${target}`)
        }
      }
      if (context.passedThrough?.(/** @type {string} */ (original.id)) === true) {
        const from = refIdOf(step.supersedes) ?? refIdOf(step.target)
        const value = from === undefined ? undefined : local.get(from) ?? byId.get(from)
        if (value === undefined) throw new Error(`${original.op} has no body to pass through`)
        local.set(/** @type {string} */ (step.id), value)
        return
      }
      const result = evaluate([resolve(step)], { registry, initial: { byId: local }, cache, policy })
      local = result.byId
    })
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) }
  }
  const last = chain.records.at(-1)
  const value = last === undefined ? undefined : local.get(/** @type {string} */ (last.id))
  return value === undefined ? { reason: 'it produced no geometry' } : { value }
}

/**
 * The one colour a member's visible parts share, if they share one.
 *
 * @param {Geom3 | Group} value
 * @returns {{ color?: number, colorAlpha?: number }}
 */
function sharedColorOf(value) {
  if (!isGroup(value) || value.names.length === 0) return {}
  const colors = value.names.map((name) => value.colors?.[name])
  const [first] = colors
  if (first === undefined || colors.some((color) => color?.color !== first.color || color?.alpha !== first.alpha)) return {}
  return { color: first.color, ...(first.alpha !== 1 ? { colorAlpha: first.alpha } : {}) }
}

/**
 * The repeat body's value: one visible part per member, the member's own parts hidden under
 * `<target>.<part>`. The same object back when every member is the same object as last time,
 * so whatever reads the repeat body later in the fold is a fold-cache hit.
 *
 * @param {OpRecord} record
 * @param {string[]} members
 * @param {Array<Geom3 | Group>} values
 * @returns {Group}
 */
function assemble(record, members, values) {
  const names = members.join(',')
  const cached = groupCache.get(record)
  if (cached !== undefined && cached.names === names && cached.values.length === values.length && cached.values.every((value, index) => value === values[index])) {
    return cached.value
  }
  let group = createGroup(record.id ?? REPEAT_OP)
  members.forEach((target, index) => {
    const value = values[index]
    let solid = /** @type {Geom3} */ (value)
    if (isGroup(value)) {
      const known = combinedCache.get(value)
      solid = known ?? combine(value)
      if (known === undefined) combinedCache.set(value, solid)
    }
    group = add(group, solid, target, sharedColorOf(value))
    if (!isGroup(value)) return
    for (const [name, part] of Object.entries(value.parts)) {
      const color = value.colors?.[name]
      group = add(group, part, `${target}.${name}`, {
        hidden: true,
        ...(color === undefined ? {} : { color: color.color, ...(color.alpha !== 1 ? { colorAlpha: color.alpha } : {}) }),
      })
    }
  })
  groupCache.set(record, { values: [...values], names, value: group })
  return group
}

// ---------------------------------------------------------------------------
// Detach (decision 7)

/**
 * One member written out as an independent lineage: every step of the source's lineage (as it
 * stood at the repeat row) with fresh ids, the seed re-aimed at `target`, and the root renamed.
 * A rename step is dropped (the copy has its own name). Nothing refers back to the source.
 *
 * @param {object} input
 * @param {RepeatSeed} input.seed
 * @param {readonly OpRecord[]} input.lineage
 * @param {string} input.target
 * @param {(id: string) => string | undefined} input.rootOf
 * @param {(previous: string) => string} input.nextId
 * @param {string} input.name
 * @param {Record<string, any>} [input.when] The member's own condition, carried to the copy's root.
 * @returns {OpRecord[]}
 */
export function detachedLineage({ seed, lineage, target, rootOf, nextId, name, when }) {
  /** @type {Map<string, string>} */
  const renamed = new Map()
  /** @param {any} ref */
  const rename = (ref) => {
    const id = refIdOf(ref)
    const to = id === undefined ? undefined : renamed.get(id)
    if (to === undefined) return ref
    return typeof ref === 'string' ? to : { ...ref, id: to }
  }
  /** @type {OpRecord[]} */
  const records = []
  for (const original of lineage) {
    const id = /** @type {string} */ (original.id)
    if (original.op === 'style.rename' && typeof original.supersedes === 'string') {
      renamed.set(id, renamed.get(original.supersedes) ?? original.supersedes)
      continue
    }
    const { name: _name, when: _when, ...rest } = substituteSeed(original, seed, target, rootOf)
    /** @type {OpRecord} */
    const copy = { ...rest, id: nextId(id) }
    if (copy.target !== undefined) copy.target = rename(copy.target)
    if (copy.operands !== undefined) copy.operands = copy.operands.map(rename)
    if (copy.supersedes !== undefined) copy.supersedes = rename(copy.supersedes)
    if (copy.consumes !== undefined) copy.consumes = copy.consumes.map(rename)
    if (records.length === 0) {
      copy.name = name
      if (when !== undefined) copy.when = /** @type {NonNullable<OpRecord['when']>} */ (structuredClone(when))
    }
    renamed.set(id, /** @type {string} */ (copy.id))
    records.push(copy)
  }
  return records
}

/**
 * **Detach** (decision 7): replace a repeat with one independent lineage per member, in one
 * transaction — one Undo step puts the single repeat back. The escape hatch for "this one bolt
 * needs to be different". Each copy is named the way a new drop of the source would be
 * (`Bolt 2`, `Bolt 3`, …) and lands exactly where its member was.
 *
 * Refused while the source is gone (there is nothing to detach from) or a member is broken
 * (repair or remove it first — a copy of a broken member would not build either).
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {string} bodyId
 * @param {import('./document.js').TransactionOptions} transaction
 * @returns {string[]} The new bodies' ids, in target order.
 */
export function detachRepeat(document, bodyId, transaction) {
  const record = repeatRootOf(document, bodyId)
  const repeatId = /** @type {string} */ (record.id)
  const body = document.bodies().find((candidate) => candidate.id === repeatId)
  const info = body?.repeat
  if (body === undefined || info === undefined) {
    throw new Error('There is nothing to detach: this repeat is not built (its source may have been deleted)')
  }
  if (info.broken.length > 0) {
    throw new Error(`Repair or remove ${info.broken.map((member) => member.target).join(', ')} first — a broken repeat can't be detached`)
  }
  const params = /** @type {RepeatParams} */ (record.params)
  // The source's lineage as it stood at the repeat row: the rows before it in the log.
  const position = new Map(document.entries.map((entry, index) => [entry.record.id, index]))
  const at = position.get(repeatId) ?? document.entries.length
  const lineage = document.lineageOf(params.source).filter((step) => (position.get(step.id) ?? Infinity) < at)
  const stem = info.sourceName.replace(/\s+\d+$/, '')
  /** @type {string[]} */
  const created = []
  document.batch(
    (doc) => {
      for (const target of params.targets) {
        if (!info.members.includes(target) && !info.inactive.includes(target)) continue
        const records = detachedLineage({
          seed: params.seed,
          lineage,
          target,
          rootOf: (id) => doc.rootOf(id),
          nextId: (previous) => doc.nextId(`${previous}-${target}`),
          name: doc.nextName(stem),
          when: params.when?.[target],
        })
        doc.appendAll(records, transaction)
        created.push(/** @type {string} */ (records[0].id))
      }
      doc.deleteBodies([repeatId], transaction)
    },
    { label: transaction.label ?? `Detach ${body.name}` }
  )
  return created
}

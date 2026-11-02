// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What pressing **Group** on bodies with parts writes (`TODO/core-076`): the one rule for a
 * `group.merge` record, shared by the Group popover and the AI `operate` tool the way
 * `booleanConsumes.js` is shared, so a click and a tool call cannot drift.
 *
 * ## Why a planner rather than a record shape
 *
 * Flattening `parts` alone looks finished and still loses work, because two things a person sees
 * live outside the `Group` value and a new root record does not inherit them:
 *
 * - **A colour override** lives on the operand's lineage (`colorOverridesOf`). So each part's
 *   effective override is resolved now and **baked into the record**, a whole-body override
 *   expanded per part, target included. It lands in the recipe tier, so a later recolour wins and
 *   Reset falls back to it. Separate `style.recolor` records would add one History row per part.
 * - **A Hide in the view** lives in the document's view state, keyed by body id. So this returns
 *   `viewHides`, written under the new body straight after the append. They are not an undo step,
 *   and the old keys stay under the old ids, so Undo brings each operand back as it was.
 *
 * ## The target
 *
 * The result is a **new record carrying the first merging body's current name**, not a
 * continuation of it: `document.append` refuses `supersedes` and `consumes` together. So the body
 * id changes while the name, the part order and what the person sees follow that body. `target`
 * is the first-picked operand whose parts merge, and the others follow in selection order, so a
 * Cube picked before a Pi still joins that Pi.
 *
 * No side effects, which is what lets the popover call this on open and on every keystroke. That
 * is why the record has no `id`: `nextId` ticks the document's clock. The caller adds one when it
 * commits.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js.
 *
 * @module core/groupMerge
 */

import { effectiveOverrideOf } from './colorOverride.js'
import { isGroup, partNameProblem, prefixProblem } from './kernel/group.js'

/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./document.js').Body} Body */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/**
 * One selected body, in selection order.
 *
 * @typedef {object} GroupMergeOperand
 * @property {string} id The body's id (its lineage root).
 * @property {string} terminal The record currently representing it.
 * @property {string} name The body's current name.
 */

/**
 * What the person chose for one row. Everything is optional, and an absent choice is the default.
 *
 * @typedef {object} GroupMergeChoice
 * @property {boolean} [merge] `false` keeps this body as one part. Default: merge, if it has parts.
 * @property {string} [name] Keep it as one part under this name; the AI tool's way of saying so.
 * @property {string} [prefix] Absent: {@link GroupMergePlan}'s suggestion, when it needs one.
 *   `''` means "no prefix", so a person who clears the field gets the collision they asked about.
 * @property {boolean} [hidden] Hide everything this row adds. Ignored on the target row, which
 *   keeps its names and its visibility.
 */

/**
 * One row, as the popover shows it, in selection order.
 *
 * @typedef {object} GroupMergeRow
 * @property {string} id
 * @property {string} name
 * @property {number} partCount Every part, hidden ones included.
 * @property {boolean} hasParts False for a plain solid, which is only ever one part.
 * @property {boolean} merges
 * @property {boolean} isTarget The first merging row: it gives the name and keeps its part names.
 * @property {string} prefix What this row actually uses.
 * @property {boolean} hidden
 * @property {string[]} previewNames The part names this row adds to the result.
 */

/**
 * @typedef {object} GroupMergePlan
 * @property {Omit<OpRecord, 'id'> | null} record `null` when `errors` is not empty.
 * @property {Array<{ subPart: string, hidden: true }>} viewHides What to hide under the new body.
 * @property {GroupMergeRow[]} rows
 * @property {string[]} previewNames One line per row, in selection order: `clearance-Mic, +4 more`.
 * @property {string[]} suggestedPrefixes One per row, `''` for a row that needs none.
 * @property {string[]} errors In row order, in words a person can act on.
 */

/**
 * Does this evaluated value have parts a merge could keep?
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function hasMergeableParts(value) {
  return isGroup(value) && Object.keys(value.parts).length > 0
}

/**
 * Whether Group needs to ask anything: true when a selected body has parts. When nothing does,
 * Group stays one click and today's `group.assemble`.
 *
 * @param {WarpDocument} document
 * @param {readonly { terminal: string }[]} operands
 * @returns {boolean}
 */
export function operandsHaveParts(document, operands) {
  return operands.some((operand) => hasMergeableParts(document.scene.byId.get(operand.terminal)))
}

/**
 * The prefix a colliding row opens with: `<body name>-`, without what a prefix may not contain.
 *
 * @param {string} bodyName
 * @returns {string}
 */
function suggestedPrefixFor(bodyName) {
  return `${bodyName.replaceAll(',', '').trimStart()}-`
}

/**
 * Every effective user colour on these parts, in a record's shape. A whole-body override expands
 * per part, and a part's own override beats it (`colorOverride.js`'s precedence rule).
 *
 * @param {Body | undefined} body
 * @param {readonly string[]} partNames
 * @returns {Record<string, { color: number, colorAlpha?: number }>}
 */
function bakedColorsOf(body, partNames) {
  /** @type {Record<string, { color: number, colorAlpha?: number }>} */
  const colors = {}
  for (const part of partNames) {
    const override = effectiveOverrideOf(body?.colorOverrides, part)
    if (override) colors[part] = { color: override.color, ...(override.colorAlpha === undefined ? {} : { colorAlpha: override.colorAlpha }) }
  }
  return colors
}

/**
 * Plan a Group over `operands`. See the module note.
 *
 * @param {WarpDocument} document
 * @param {readonly GroupMergeOperand[]} operands In selection order.
 * @param {ReadonlyArray<GroupMergeChoice | undefined>} [choices] One per operand, by position.
 * @returns {GroupMergePlan}
 */
export function planGroupMerge(document, operands, choices = []) {
  const bodies = new Map(document.bodies().map((body) => [body.id, body]))
  const working = operands.map((operand, index) => {
    const body = bodies.get(operand.id)
    const value = body?.geometry
    const choice = choices[index] ?? {}
    const partNames = isGroup(value) ? Object.keys(value.parts) : []
    const hasParts = partNames.length > 0
    return {
      operand,
      body,
      value,
      choice,
      partNames,
      hasParts,
      merges: hasParts && choice.merge !== false && choice.name === undefined,
      wholeName: choice.name ?? operand.name,
      suggested: '',
      prefix: '',
      previewNames: /** @type {string[]} */ ([]),
    }
  })

  const target = working.find((row) => row.merges)
  // The result's part order: the target's, then everything else in selection order.
  const order = target === undefined ? working : [target, ...working.filter((row) => row !== target)]
  const hiddenOf = (/** @type {typeof working[number]} */ row) => row !== target && row.choice.hidden === true

  /** @type {string[]} */
  const errors = []
  /** @type {Map<string, string>} */
  const ownerOf = new Map()
  /** @type {Array<{ subPart: string, hidden: true }>} */
  const viewHides = []
  let visibleCount = 0

  for (const row of order) {
    const bodyName = row.operand.name
    if (row.body === undefined) errors.push(`${bodyName} is not on screen, so it cannot be grouped.`)
    if (!row.merges) {
      const name = row.wholeName
      row.previewNames = [name]
      const refusal = partNameProblem(name)
      const owner = ownerOf.get(name)
      if (refusal !== null) errors.push(refusal)
      else if (owner !== undefined) errors.push(`${name} is already a part of ${owner}.`)
      ownerOf.set(name, bodyName)
      if (!hiddenOf(row)) visibleCount += 1
      if (row.body?.viewHidden) viewHides.push({ subPart: name, hidden: true })
      continue
    }

    if (row !== target && row.partNames.some((part) => ownerOf.has(part))) row.suggested = suggestedPrefixFor(bodyName)
    row.prefix = row === target ? '' : (row.choice.prefix ?? row.suggested)
    const prefixRefusal = prefixProblem(row.prefix)
    if (prefixRefusal !== null) errors.push(prefixRefusal)

    let reported = prefixRefusal !== null
    row.previewNames = row.partNames.map((part) => row.prefix + part)
    for (const merged of row.previewNames) {
      const refusal = partNameProblem(merged)
      const owner = ownerOf.get(merged)
      if (!reported && refusal !== null) {
        errors.push(`${refusal} Change the prefix.`)
        reported = true
      } else if (!reported && owner !== undefined) {
        errors.push(`${merged} is already a part of ${owner}. Change the prefix.`)
        reported = true
      }
      ownerOf.set(merged, bodyName)
    }

    if (!hiddenOf(row)) visibleCount += /** @type {any} */ (row.value).names.length
    const viewHiddenParts = row.body?.viewHiddenParts ?? []
    row.partNames.forEach((part, index) => {
      if (row.body?.viewHidden || viewHiddenParts.includes(part)) viewHides.push({ subPart: row.previewNames[index], hidden: true })
    })
  }

  if (visibleCount === 0 && operands.length > 0) errors.push('Every part would be hidden. Leave at least one visible.')

  return {
    record: errors.length > 0 ? null : recordFor(document, order, target, hiddenOf),
    viewHides,
    rows: working.map((row) => ({
      id: row.operand.id,
      name: row.operand.name,
      partCount: row.partNames.length,
      hasParts: row.hasParts,
      merges: row.merges,
      isTarget: row === target,
      prefix: row.prefix,
      hidden: hiddenOf(row),
      previewNames: row.previewNames,
    })),
    previewNames: working.map((row) => previewLine(row.previewNames)),
    suggestedPrefixes: working.map((row) => row.suggested),
    errors,
  }
}

/**
 * @param {readonly string[]} names
 * @returns {string} `clearance-Mic` or `clearance-Mic, +4 more`.
 */
function previewLine(names) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names[0]}, +${names.length - 1} more`
}

/**
 * The record, once the plan has no errors. With nothing merging and nothing hidden it is exactly
 * today's `group.assemble`: there is nothing a `group.merge` would say that it does not.
 *
 * @param {WarpDocument} document
 * @param {ReadonlyArray<any>} order Rows in result order.
 * @param {any} target
 * @param {(row: any) => boolean} hiddenOf
 * @returns {Omit<OpRecord, 'id'>}
 */
function recordFor(document, order, target, hiddenOf) {
  const terminals = order.map((row) => row.operand.terminal)
  const lineage = { target: terminals[0], operands: terminals.slice(1), consumes: terminals }
  if (target === undefined && !order.some(hiddenOf)) {
    return {
      op: 'group.assemble',
      name: document.nextName('Group'),
      ...lineage,
      params: { names: order.map((row) => row.wholeName) },
    }
  }
  return {
    op: 'group.merge',
    name: target === undefined ? document.nextName('Group') : target.operand.name,
    ...lineage,
    params: {
      members: order.map((row) => {
        const colors = bakedColorsOf(row.body, row.merges ? row.partNames : [])
        if (!row.merges) {
          const whole = effectiveOverrideOf(row.body?.colorOverrides, undefined)
          if (whole) colors[row.wholeName] = { color: whole.color, ...(whole.colorAlpha === undefined ? {} : { colorAlpha: whole.colorAlpha }) }
        }
        return {
          ...(row.merges ? {} : { name: row.wholeName }),
          ...(row.prefix === '' ? {} : { prefix: row.prefix }),
          ...(hiddenOf(row) ? { hidden: true } : {}),
          ...(Object.keys(colors).length > 0 ? { colors } : {}),
        }
      }),
    },
  }
}

/**
 * Write a plan's `viewHides` under the new body. Straight after the append, and not an undo step.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId
 * @param {GroupMergePlan['viewHides']} viewHides
 * @param {{ origin: string }} transaction
 * @returns {void}
 */
export function applyViewHides(document, bodyId, viewHides, transaction) {
  for (const hide of viewHides) document.setViewHidden(bodyId, hide, transaction)
}

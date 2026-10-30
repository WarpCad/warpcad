// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Taking a merge back out (`TODO/ui-062`'s **Undo merge**, and since `TODO/ai-017` also **Undo AI
 * turn**, because an AI turn now lands by `mergeFrom`). Framework-free: moved here from
 * `src/stores/merge.js` so the agent (`src/ai/agent.js`, no Vue) uses the one implementation
 * instead of a second diff of its own.
 *
 * It works from three snapshots — the project just before the merge, just after it, and now — so
 * a local step made *after* the merge is never taken out:
 *
 * - rows the merge added go (refused by name by `restoreEntries`, exactly as `removeRecords` is,
 *   when a row that stays builds on one of them);
 * - rows it removed come back after their nearest earlier surviving neighbour;
 * - rows it revised get their old record, origin and intent back — refused by name when the
 *   user has since edited that row's record (putting the old one back would silently throw
 *   their edit away); a flag (`suppressed`, `leftBroken`) is put back only if it is still what
 *   the merge left;
 * - rows it moved go back into their old order;
 * - the rollback marker and the three settings go back only if they are still what the merge
 *   left. User-part *definitions* a merge brought in are left in place: nothing references one
 *   once its rows are gone, and the file writer drops unused ones (`serializeProject`).
 *
 * The inverse is written as ordinary stamped writes in one batch, under the caller's origin
 * (`merge` for Undo merge, `ai` for Undo AI turn), so this copy still converges with the other
 * one: a row the merge added becomes a tombstone newer than the row, a row it removed comes back
 * with a fresh born stamp that beats the merge's tombstone. Never a local step.
 *
 * @module core/mergeUndo
 */

/** @typedef {import('./document.js').DocumentEntry} DocumentEntry */
/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {ReturnType<typeof import('./merge/merge.js').diffStates>} MergeChange */
/** @typedef {import('./buildVolume.js').BuildVolume} BuildVolume */

/**
 * The project as it stood at one moment — what an undo of a merge needs from before and after.
 *
 * @typedef {object} MergeSnapshot
 * @property {readonly DocumentEntry[]} entries The log's entry objects (immutable once stored).
 * @property {number | null} rollbackAt
 * @property {string} resolution
 * @property {string} standingInstructions
 * @property {BuildVolume} buildVolume
 * @property {string} [description] `TODO/io-023`: the project's description for people.
 */

/**
 * @typedef {{ resolution?: string, standingInstructions?: string, buildVolume?: BuildVolume, description?: string }} MergeUndoSettings
 * @typedef {{ ok: true, target: DocumentEntry[], rollbackAt: number | null, settings: MergeUndoSettings } | { ok: false, message: string }} MergeUndoPlan
 */

/**
 * @param {WarpDocument} raw The document, unproxied: entry objects are compared by identity.
 * @returns {MergeSnapshot}
 */
export function mergeSnapshotOf(raw) {
  return {
    entries: raw.entries.slice(),
    rollbackAt: raw.rollbackAt(),
    resolution: raw.resolution(),
    standingInstructions: raw.standingInstructions(),
    buildVolume: raw.buildVolume(),
    description: raw.description(),
  }
}

/** @param {DocumentEntry} entry */
const idOf = (entry) => /** @type {string} */ (entry.record.id)

/**
 * @param {import('./kernel/registry.js').OpRecord} a
 * @param {import('./kernel/registry.js').OpRecord} b
 */
function sameRecord(a, b) {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/**
 * @param {DocumentEntry} entry
 * @param {'suppressed' | 'leftBroken'} flag
 * @param {boolean} value
 * @returns {DocumentEntry}
 */
function withFlag(entry, flag, value) {
  const { [flag]: _previous, ...rest } = entry
  return value ? { ...rest, [flag]: true } : rest
}

/** @param {BuildVolume} a @param {BuildVolume} b */
function sameVolume(a, b) {
  return a.widthMm === b.widthMm && a.depthMm === b.depthMm && a.heightMm === b.heightMm
}

/**
 * The id of the row the marker sits after, or `null` for no marker.
 *
 * @param {MergeSnapshot} snapshot
 */
function anchorOf(snapshot) {
  if (snapshot.rollbackAt === null) return null
  return idOf(snapshot.entries[snapshot.rollbackAt - 1])
}

/**
 * The undo of a merge as a target log — pure, from the three snapshots (see the module note).
 *
 * @param {MergeSnapshot} base The project just before the merge.
 * @param {MergeSnapshot} merged The project just after it.
 * @param {MergeSnapshot} current The project now.
 * @param {MergeChange} change What the merge changed (`mergeFrom`'s `change`, or the part of it
 *   to take back).
 * @returns {MergeUndoPlan}
 */
export function planMergeUndo(base, merged, current, change) {
  const baseById = new Map(base.entries.map((entry) => [idOf(entry), entry]))
  const mergedById = new Map(merged.entries.map((entry) => [idOf(entry), entry]))
  const added = new Set(change.added)
  const revised = new Set(change.revised)
  const moved = new Set(change.moved)
  const removed = new Set(change.removed)

  /** @type {DocumentEntry[]} */
  const rows = []
  for (const entry of current.entries) {
    const id = idOf(entry)
    if (added.has(id)) continue
    const before = baseById.get(id)
    const after = mergedById.get(id)
    if (before === undefined || after === undefined) {
      rows.push(entry)
      continue
    }
    let next = entry
    if (revised.has(id) && !sameRecord(before.record, after.record)) {
      if (!sameRecord(entry.record, after.record)) {
        const name = entry.record.name ?? id
        return { ok: false, message: `"${name}" was edited after the merge — undo that edit first` }
      }
      next = { ...next, record: before.record, origin: before.origin }
      const { intent: _intent, ...withoutIntent } = next
      next = before.intent === undefined ? withoutIntent : { ...withoutIntent, intent: before.intent }
    }
    for (const flag of /** @type {const} */ (['suppressed', 'leftBroken'])) {
      const was = before[flag] === true
      const left = after[flag] === true
      if (was !== left && (entry[flag] === true) === left) next = withFlag(next, flag, was)
    }
    rows.push(next)
  }

  // Rows the merge removed come back, and rows it moved go back, in the old order: each after
  // its nearest earlier neighbour (in the old log) that is still there.
  const order = base.entries.map(idOf)
  /** @type {Map<string, DocumentEntry>} */
  const pulled = new Map()
  for (let at = rows.length - 1; at >= 0; at -= 1) {
    const id = idOf(rows[at])
    if (moved.has(id) && baseById.has(id)) pulled.set(id, rows.splice(at, 1)[0])
  }
  for (let at = 0; at < order.length; at += 1) {
    const id = order[at]
    /** @type {DocumentEntry | undefined} */
    let entry = pulled.get(id)
    if (entry === undefined && removed.has(id) && !rows.some((row) => idOf(row) === id)) entry = baseById.get(id)
    if (entry === undefined) continue
    let index = 0
    for (let back = at - 1; back >= 0; back -= 1) {
      const found = rows.findIndex((row) => idOf(row) === order[back])
      if (found >= 0) {
        index = found + 1
        break
      }
    }
    rows.splice(index, 0, entry)
  }

  // The marker: back to where it was, unless the user has moved it since.
  const currentAnchor = anchorOf(current)
  const restoreMarker = change.registers.includes('rollbackAfter') && currentAnchor === anchorOf(merged)
  const anchor = restoreMarker ? anchorOf(base) : currentAnchor
  const anchorOrder = restoreMarker ? order : current.entries.map(idOf)
  /** @type {number | null} */
  let rollbackAt = null
  if (anchor !== null) {
    for (let back = anchorOrder.indexOf(anchor); back >= 0; back -= 1) {
      const found = rows.findIndex((row) => idOf(row) === anchorOrder[back])
      if (found >= 0) {
        rollbackAt = found + 1
        break
      }
    }
    if (rollbackAt !== null && rollbackAt >= rows.length) rollbackAt = null
  }

  /** @type {MergeUndoSettings} */
  const settings = {}
  if (change.registers.includes('resolution') && current.resolution === merged.resolution) settings.resolution = base.resolution
  if (change.registers.includes('standingInstructions') && current.standingInstructions === merged.standingInstructions) {
    settings.standingInstructions = base.standingInstructions
  }
  if (change.registers.includes('buildVolume') && sameVolume(current.buildVolume, merged.buildVolume)) {
    settings.buildVolume = base.buildVolume
  }
  if (change.registers.includes('description') && current.description === merged.description) {
    settings.description = base.description ?? ''
  }
  return { ok: true, target: rows, rollbackAt, settings }
}

/**
 * Write a {@link planMergeUndo} plan as **one** atomic batch under `transaction`'s origin:
 * `restoreEntries`, then the settings it puts back. Both undo stacks are left alone (a `local`
 * origin is refused by `restoreEntries`). Throws the document's refusal and changes nothing.
 *
 * @param {WarpDocument} raw
 * @param {{ target: readonly DocumentEntry[], rollbackAt: number | null, settings?: MergeUndoSettings }} plan
 * @param {import('./document.js').TransactionOptions} transaction
 * @returns {void}
 */
export function applyMergeUndo(raw, plan, transaction) {
  const settings = plan.settings ?? {}
  raw.batch(() => {
    raw.restoreEntries(plan.target, plan.rollbackAt, transaction)
    if (settings.resolution !== undefined) raw.setResolution(settings.resolution, transaction)
    if (settings.standingInstructions !== undefined) raw.setStandingInstructions(settings.standingInstructions, transaction)
    if (settings.buildVolume !== undefined) raw.setBuildVolume(settings.buildVolume, transaction)
    if (settings.description !== undefined) raw.setDescription(settings.description, transaction)
  })
}

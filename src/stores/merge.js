// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * **Merge file…**, the merge summary and **Undo merge** (`TODO/ui-062`) — UI state and the
 * thin orchestration over core's `mergeFrom` (`TODO/data-010`). The three pieces later M15
 * tasks (`io-010`, `io-011`, `ai-017`) reuse instead of inventing their own:
 *
 * - **the merge summary** ({@link describeMerge}) — what came in, counted in History rows in
 *   the user's terms (added, changed, removed), never "0 steps": a merge that only moved the
 *   rollback marker or changed a setting says which (`Merged a rollback point from …`);
 * - **the notice** — a toast (`MergeToast.vue`) on a clean merge, a banner that stays until
 *   dismissed (`MergeBanner.vue`) when rows conflicted, each with **Undo merge**;
 * - **Undo merge** ({@link planMergeUndo}) — one step, in memory, until the next merge, the
 *   next Open/New/Load (any whole-document load) or a reload, like Undo AI turn. It is **not**
 *   on the header Undo stack and never removes a local step (`CLAUDE.md`: remote edits never
 *   land in the local undo stack). It is written as ordinary stamped `merge`-origin writes in
 *   one batch, so this copy still converges with the other one when they meet again: a row
 *   the merge added becomes a tombstone newer than the row, a row it removed comes back with a
 *   fresh born stamp that beats the merge's tombstone.
 *
 * ## What Undo merge puts back, and what it refuses
 *
 * `src/core/mergeUndo.js` (moved there by `TODO/ai-017`, so Undo AI turn uses the same inverse).
 * It works from three snapshots — the project just before the merge, just after it, and now —
 * so a local step made *after* the merge is never taken out:
 *
 * - rows the merge added go (refused by name, exactly as Undo AI turn's `removeRecords` is,
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
 * @module stores/merge
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef, toRaw, watch } from 'vue'

import { UnrelatedProjectError, createDocument } from '../core/document.js'
import { mergeSnapshotOf, planMergeUndo } from '../core/mergeUndo.js'
import { useAiChatStore } from './aiChat.js'
import { useDocumentStore } from './document.js'
import { useTimelineStore } from './timeline.js'

/** @typedef {ReturnType<typeof import('../core/merge/merge.js').diffStates>} MergeChange */
/** @typedef {import('../core/document.js').MergeConflict} MergeConflict */

/** @typedef {import('../core/mergeUndo.js').MergeSnapshot} MergeSnapshot */

/**
 * What the toast or banner shows.
 *
 * @typedef {object} MergeNotice
 * @property {'toast' | 'banner'} kind A banner stays until dismissed; it is what conflicts get.
 * @property {'ok' | 'warn' | 'error'} tone
 * @property {string} text
 * @property {boolean} undoable Whether **Undo merge** is offered on it.
 * @property {string[]} conflictIds The conflicted rows, in log order — what **Show** selects.
 */

/**
 * @typedef {{ ok: true, text: string, conflicts: MergeConflict[] } | { ok: false, text: string }} MergeResult
 */

/** What a register is called in the summary when it is the only thing a merge brought. */
const REGISTER_WORDS = Object.freeze({
  rollbackAfter: 'a rollback point',
  resolution: 'the design resolution',
  standingInstructions: 'the standing instructions',
  buildVolume: 'the build volume',
})

/**
 * The refusal a copy of a different project gets. Nothing has changed when it is shown.
 *
 * @param {string} sourceName
 * @returns {string}
 */
export function differentProjectText(sourceName) {
  return `${sourceName} is a different project. Merge only works between copies of the same project.`
}

/**
 * @param {number} count
 * @param {string} noun
 */
function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** @param {readonly string[]} parts */
function joinAnd(parts) {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/**
 * The merge summary: what came in, in History rows.
 *
 * `added`/`removed` are rows; **changed** is every surviving row the merge revised *or*
 * re-ordered, each counted once. With rows it reads `Merged 4 steps from <name>`, followed by
 * the kinds in brackets unless every row was new (`(1 added, 2 changed)`), and ` — 2 steps
 * conflicted` when any did. With no rows it names what did change (`Merged a rollback point
 * from <name>`), and with nothing at all it says so.
 *
 * @param {MergeChange} change
 * @param {readonly MergeConflict[]} conflicts
 * @param {string} sourceName
 * @returns {string}
 */
export function describeMerge(change, conflicts, sourceName) {
  const gone = new Set([...change.added, ...change.removed])
  const changed = new Set([...change.revised, ...change.moved].filter((id) => !gone.has(id)))
  const added = change.added.length
  const removed = change.removed.length
  const total = added + changed.size + removed
  const conflicted = conflicts.length > 0 ? ` — ${plural(conflicts.length, 'step')} conflicted` : ''
  if (total > 0) {
    const kinds = [
      added > 0 ? `${added} added` : '',
      changed.size > 0 ? `${changed.size} changed` : '',
      removed > 0 ? `${removed} removed` : '',
    ].filter((kind) => kind !== '')
    const breakdown = kinds.length === 1 && added > 0 ? '' : ` (${kinds.join(', ')})`
    return `Merged ${plural(total, 'step')} from ${sourceName}${breakdown}${conflicted}`
  }
  /** @type {string[]} */
  const things = []
  for (const name of /** @type {Array<keyof typeof REGISTER_WORDS>} */ (Object.keys(REGISTER_WORDS))) {
    if (change.registers.includes(name)) things.push(REGISTER_WORDS[name])
  }
  if (change.parts.length > 0) things.push(change.parts.length === 1 ? 'a part definition' : `${change.parts.length} part definitions`)
  if (things.length > 0) return `Merged ${joinAnd(things)} from ${sourceName}${conflicted}`
  return `${sourceName} has nothing this project doesn't already have`
}

/**
 * A parsed project file's merge state — what `mergeFrom` takes. The file is folded into a
 * throwaway document (never the live one, never the registry's project layer), so a file that
 * does not build is refused here, before anything is touched, with the same reason Open gives.
 *
 * @param {ReturnType<typeof import('../core/project.js').parseProject>} parsed
 * @param {import('../core/kernel/index.js').FoldCache | null} [foldCache] The live document's,
 *   so rows both copies share are not built twice (same registry — see `createDocument`).
 * @returns {import('../core/merge/state.js').MergeState}
 */
export function mergeStateOfProject(parsed, foldCache) {
  const scratch = createDocument({ resolution: parsed.resolution, ...(foldCache === undefined ? {} : { foldCache }) })
  scratch.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, {
    standingInstructions: parsed.standingInstructions,
    buildVolume: parsed.buildVolume,
    userParts: parsed.userParts,
    unavailableParts: parsed.unavailableParts,
    ...(parsed.merge === undefined ? {} : { merge: parsed.merge }),
  })
  return scratch.mergeState()
}

/** @param {import('../core/document.js').DocumentEntry} entry */
const idOf = (entry) => /** @type {string} */ (entry.record.id)

/**
 * A core refusal as a sentence for the user: the `document.<method>: ` prefix is for
 * developers.
 *
 * @param {unknown} error
 */
function reasonOf(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^document\.\w+: /, '')
}

/** @param {MergeChange} change */
function isEmpty(change) {
  return (
    change.added.length === 0 &&
    change.revised.length === 0 &&
    change.removed.length === 0 &&
    change.moved.length === 0 &&
    change.registers.length === 0 &&
    change.parts.length === 0
  )
}

export const useMergeStore = defineStore('merge', () => {
  const documentStore = useDocumentStore()
  const timeline = useTimelineStore()
  const aiChat = useAiChatStore()

  /** @type {import('vue').ShallowRef<MergeNotice | null>} */
  const notice = shallowRef(null)
  /** Why the last Undo merge was refused, while its notice is still up; `''` otherwise. */
  const undoRefusal = ref('')
  /**
   * The last merge's inverse, in memory only — a reload forgets it, like Undo AI turn. Plain
   * (it holds the log's entry objects); {@link available} is what the UI reacts to.
   *
   * @type {{ base: MergeSnapshot, merged: MergeSnapshot, change: MergeChange, sourceName: string } | null}
   */
  let last = null
  const available = ref(false)

  /** The live document, unproxied: entry objects are compared by identity. */
  const live = () => toRaw(documentStore.raw)

  function forget() {
    last = null
    available.value = false
    undoRefusal.value = ''
    notice.value = null
  }

  // A whole-document load (Open, New, hosted Load, autosave restore) replaces what the merge
  // was merged into: there is nothing left to take it back out of.
  watch(() => documentStore.loadRevision, forget, { flush: 'sync' })

  /**
   * Why **Merge file…** is dimmed, or `''` (`TODO/ui-062`'s precondition, the pattern
   * Export… uses). Previewing first: it is the mode the user is in, and leaving it is the fix.
   */
  const unavailableReason = computed(() => {
    void documentStore.version
    if (timeline.previewing) return 'Return to the latest step to merge'
    if (live().entries.length === 0) return 'Nothing to merge into'
    if (aiChat.running) return 'Wait for the Assistant to finish'
    return ''
  })

  /**
   * Merge another copy's state in and say what came in. A different project is refused with
   * {@link differentProjectText} and changes nothing; any other refusal is named the same way.
   * Replaces the previous merge's Undo merge, which is no longer the last thing that happened.
   *
   * @param {import('../core/merge/state.js').MergeState} state
   * @param {string} sourceName The file name, as the user picked it.
   * @returns {MergeResult}
   */
  function mergeIn(state, sourceName) {
    const base = mergeSnapshotOf(live())
    /** @type {ReturnType<typeof documentStore.mergeFrom>} */
    let outcome
    try {
      outcome = documentStore.mergeFrom(state)
    } catch (error) {
      const text =
        error instanceof UnrelatedProjectError ? differentProjectText(sourceName) : `Couldn't merge ${sourceName}: ${reasonOf(error)}`
      notice.value = { kind: 'toast', tone: 'error', text, undoable: false, conflictIds: [] }
      undoRefusal.value = ''
      return { ok: false, text }
    }
    const { change, conflicts } = outcome
    const text = describeMerge(change, conflicts, sourceName)
    const nothing = isEmpty(change)
    last = nothing ? null : { base, merged: mergeSnapshotOf(live()), change, sourceName }
    available.value = !nothing
    undoRefusal.value = ''
    notice.value = {
      kind: conflicts.length > 0 ? 'banner' : 'toast',
      tone: conflicts.length > 0 ? 'warn' : 'ok',
      text,
      undoable: !nothing,
      conflictIds: conflicts.map((conflict) => conflict.id),
    }
    return { ok: true, text, conflicts }
  }

  /**
   * **Undo merge**: take the last merge back out (see the module note). Refused, by name and
   * changing nothing, when a later local step builds on a merged row or edited a row the merge
   * revised; the refusal stays on the notice ({@link undoRefusal}) and Undo merge stays offered.
   *
   * @returns {{ ok: true } | { ok: false, message: string }}
   */
  function undoMerge() {
    if (last === null) return { ok: false, message: 'There is no merge to undo' }
    const plan = planMergeUndo(last.base, last.merged, mergeSnapshotOf(live()), last.change)
    if (!plan.ok) {
      undoRefusal.value = `Can't undo the merge: ${plan.message}`
      return { ok: false, message: undoRefusal.value }
    }
    try {
      documentStore.restoreAfterMerge(plan.target, plan.rollbackAt, plan.settings)
    } catch (error) {
      undoRefusal.value = `Can't undo the merge: ${reasonOf(error)}`
      return { ok: false, message: undoRefusal.value }
    }
    const { sourceName } = last
    last = null
    available.value = false
    undoRefusal.value = ''
    notice.value = { kind: 'toast', tone: 'ok', text: `Took the merge from ${sourceName} back out`, undoable: false, conflictIds: [] }
    return { ok: true }
  }

  /** **Show**: open History and select the first conflicted row that is still there. */
  function showConflicts() {
    timeline.setOpen(true)
    const ids = new Set(live().entries.map(idOf))
    const first = notice.value?.conflictIds.find((id) => ids.has(id))
    if (first !== undefined) timeline.selectRow(first)
  }

  /**
   * `TODO/ai-017`: an Assistant turn landed by merge and some rows conflicted — the same banner,
   * **Show** and chipped rows a Merge file… gets, reading `Merged 2 steps from the Assistant — 1
   * step conflicted`. No **Undo merge** on it: the turn's own undo is **Undo AI turn** in the
   * chat, and this merge's inverse is not this store's `last`. A clean landing shows nothing
   * here; the transcript says what happened.
   *
   * @param {MergeChange} change The turn's change (the fork's own work).
   * @param {readonly { id: string }[]} conflicts
   */
  function noteAiLanding(change, conflicts) {
    if (conflicts.length === 0) return
    undoRefusal.value = ''
    notice.value = {
      kind: 'banner',
      tone: 'warn',
      text: describeMerge(change, /** @type {any} */ (conflicts), 'the Assistant'),
      undoable: false,
      conflictIds: conflicts.map((conflict) => conflict.id),
    }
  }

  /** Close the toast or banner. Undo merge stays in memory until the next merge or load. */
  function dismiss() {
    notice.value = null
    undoRefusal.value = ''
  }

  return {
    notice,
    undoRefusal,
    canUndo: computed(() => available.value),
    unavailableReason,
    mergeIn,
    noteAiLanding,
    undoMerge,
    showConflicts,
    dismiss,
  }
})

// `TODO/ai-017`: the inverse moved to core; re-exported for this module's existing callers.
export { planMergeUndo }

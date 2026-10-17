// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Repeat session (`TODO/ui-069`) — **UI state only**. The record it commits is
 * `TODO/core-061`'s linked `pattern.repeat`, appended through the document store (the command
 * layer: `CLAUDE.md`, never mutate the document from a component); nothing about the session
 * itself ever enters the document.
 *
 * ## Interaction model (from the TODO)
 *
 * - **Precondition** ({@link armGateOf}): exactly one body selected, drilled into one named
 *   part — the **seed**, a Pi's `hole1` — and that body has at least one other part.
 * - **Trigger**: **⟳ Repeat** (`op-repeat`) arms the session ({@link arm}) and opens the panel.
 * - **Targets** are picked in the panel, not in the global selection (the selection holds one
 *   part per body): the seed body's parts, the seed ticked and locked, its name family
 *   (`nameFamily`: `hole1` → `hole1`…`hole4`) pre-ticked.
 * - **The subject** is the first body created after arming, by the user (a Library drop, a
 *   primitive, a My-parts drop). Its own **local** steps are listed as they land, each one that
 *   mentions the seed marked ↻. Anything else committed since arming — a step on another body,
 *   or an `ai`/`mcp`/`merge` step even on the subject — is listed as "not part of the repeat",
 *   so nothing is silently included or dropped.
 * - **Apply** appends one repeat (`source: subject`, `seed`, `targets: ticked − seed`) as one
 *   local step, selects the new repeat body and closes the session; a refusal stays in the
 *   panel and writes nothing. **Cancel** (and Escape) closes it and undoes nothing.
 *
 * The session watches the log by **record id**: the ids present when it was armed are the
 * "before"; everything else is "since". So an Undo of the subject's drop simply puts the
 * session back to waiting, and a deleted subject (still in the log, no longer a live body) ends
 * it with nothing applied.
 *
 * It also holds the one confirm the Delete command needs for a repeat (`TODO/core-061`
 * decision 8): deleting a body that repeats follow asks **Delete the repeats too** or **Leave
 * them broken** — shared here because the Delete key and the Inspector's button are two
 * instances of `useDeleteCommands`.
 *
 * @module stores/repeat
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { REPEAT_OP, mentionsSeed, nameFamily, repeatRefusal } from '../core/repeat.js'
import { buildNameIndex, describeRow } from '../core/timelineLabel.js'
import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'
import { useTimelineStore } from './timeline.js'

/** @typedef {import('../core/kernel/registry.js').OpRecord} OpRecord */

/**
 * @typedef {object} RepeatSeedRef
 * @property {string} bodyId The seed body's lineage root.
 * @property {string} partName
 */

/**
 * One committed step since arming, as the panel lists it.
 *
 * @typedef {object} SessionStep
 * @property {string} id
 * @property {string} label The History row's own words (`describeRow`).
 * @property {boolean} mentionsSeed It addresses the seed, so each repeat re-aims it (↻).
 * @property {string} origin
 * @property {boolean} onSubject It is one of the subject's own steps.
 */

/**
 * @typedef {object} DeleteConfirm
 * @property {string[]} ids The bodies the user asked to delete.
 * @property {{ id: string, name: string }[]} followers Repeat bodies that would break.
 * @property {string} question
 */

const DRILL_REASON = 'Drill into a part first, such as a hole'
const NO_OTHERS_REASON = 'This part has no others to repeat on'
const PREVIEW_REASON = 'Previewing history — read-only'

/** Ops that are rows, not bodies, so never the subject. */
const NOT_A_BODY = /^(asset|var)\./

/** What a non-local origin is called, for the panel. */
const ORIGIN_LABELS = Object.freeze({ ai: 'the Assistant', mcp: 'Claude Code', merge: 'a merge' })

/**
 * Whether **⟳ Repeat** can arm, and why not — pure, so the gate is tested on its own.
 *
 * @param {object} state
 * @param {number} state.count Bodies selected.
 * @param {{ bodyId: string, partName: string } | null} state.subPart The drilled-into part.
 * @param {readonly string[]} state.partNames Every part of the selected body, hidden included.
 * @param {boolean} state.previewing History is previewing a past step (read-only).
 * @returns {{ enabled: boolean, reason: string }}
 */
export function armGateOf({ count, subPart, partNames, previewing }) {
  if (previewing) return { enabled: false, reason: PREVIEW_REASON }
  if (count !== 1 || !subPart) return { enabled: false, reason: DRILL_REASON }
  if (!partNames.some((name) => name !== subPart.partName)) return { enabled: false, reason: NO_OTHERS_REASON }
  return { enabled: true, reason: '' }
}

/**
 * `2 holes`, `1 hole`, or `2 parts` when the targets are not all one family.
 *
 * @param {string} seedPart
 * @param {readonly string[]} targets
 * @returns {string}
 */
function targetNoun(seedPart, targets) {
  const stem = /^(.*?)(\d+)$/.exec(seedPart)?.[1] ?? ''
  const family = /^[a-z]+$/.test(stem) && targets.every((target) => new RegExp(`^${stem}\\d+$`).test(target))
  const noun = family ? stem : 'part'
  return targets.length === 1 ? noun : `${noun}s`
}

/**
 * @param {string[]} names
 * @returns {string}
 */
function listed(names) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

export const useRepeatStore = defineStore('repeat', () => {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const timeline = useTimelineStore()

  const armed = ref(false)
  const seed = ref(/** @type {RepeatSeedRef | null} */ (null))
  /** Ticked target part names, the seed included, in {@link orderedParts} order. */
  const ticked = ref(/** @type {string[]} */ ([]))
  /** Whether the phone bottom sheet is shrunk to its one-line bar. */
  const minimized = ref(false)
  /** The last refusal Apply met, shown in red in the panel. */
  const error = ref('')
  /** The toast after Apply: what happened, and the Undo label that takes it back. */
  const notice = ref(/** @type {{ text: string, undoLabel: string } | null} */ (null))
  /** The Delete command's pending question, when a delete would break repeats. */
  const deleteConfirm = ref(/** @type {DeleteConfirm | null} */ (null))

  /**
   * The record ids in the log when the session was armed. Plain, not reactive: it changes only
   * with {@link armed}, which every computed below already depends on.
   */
  let knownIds = new Set()

  /** @param {string | undefined} bodyId */
  const summaryOf = (bodyId) => documentStore.bodies.find((body) => body.id === bodyId)

  /** @param {ReturnType<typeof summaryOf>} summary */
  const allPartsOf = (summary) => [...(summary?.partNames ?? []), ...(summary?.hiddenPartNames ?? [])]

  const armGate = computed(() => {
    const subPart = selection.subPart
    return armGateOf({
      count: selection.count,
      subPart: subPart ? { bodyId: subPart.bodyId, partName: subPart.partName } : null,
      partNames: allPartsOf(summaryOf(subPart?.bodyId)),
      previewing: timeline.previewing,
    })
  })

  const seedSummary = computed(() => summaryOf(seed.value?.bodyId))

  /** The seed body's parts, hidden included. */
  const partNames = computed(() => allPartsOf(seedSummary.value))

  /** The seed's family first (in number order), then every other part: the checklist's order. */
  const orderedParts = computed(() => {
    if (!seed.value) return []
    const family = nameFamily(partNames.value, seed.value.partName)
    return [...family, ...partNames.value.filter((name) => !family.includes(name))]
  })

  /** Ticked targets other than the seed — what Apply repeats onto. */
  const targets = computed(() => ticked.value.filter((name) => name !== seed.value?.partName))

  /** Every log entry committed since the session was armed, in log order. */
  const newEntries = computed(() => {
    void documentStore.version
    if (!armed.value) return []
    return documentStore.raw.entries.filter((entry) => entry.record.id !== undefined && !knownIds.has(entry.record.id))
  })

  /** The session's subject: the first body the user created after arming. */
  const subject = computed(() => {
    const raw = documentStore.raw
    const entry = newEntries.value.find(
      ({ record, origin }) =>
        origin === 'local' &&
        raw.rootOf(/** @type {string} */ (record.id)) === record.id &&
        record.op !== REPEAT_OP &&
        !NOT_A_BODY.test(record.op),
    )
    if (!entry) return null
    const id = /** @type {string} */ (entry.record.id)
    return { id, name: summaryOf(id)?.name ?? entry.record.name ?? id }
  })

  /** Every step since arming, classified — the subject's own local steps, and everything else. */
  const classified = computed(() => {
    const raw = documentStore.raw
    const names = buildNameIndex(raw.records)
    const current = subject.value
    const seedRef = seed.value ? { id: seed.value.bodyId, pieces: seed.value.partName } : null
    /** @type {SessionStep[]} */
    const steps = []
    /** @type {SessionStep[]} */
    const outside = []
    for (const { record, origin } of newEntries.value) {
      const id = /** @type {string} */ (record.id)
      if (current && id === current.id) continue
      const onSubject = current !== null && raw.rootOf(id) === current.id
      const step = {
        id,
        label: describeRow(record, names),
        mentionsSeed: seedRef !== null && mentionsSeed([record], seedRef, (ref) => raw.rootOf(ref)),
        origin,
        onSubject,
      }
      if (onSubject && origin === 'local') steps.push(step)
      else outside.push(step)
    }
    return { steps, outside }
  })

  const steps = computed(() => classified.value.steps)
  const outside = computed(() => classified.value.outside)

  const headline = computed(() => {
    if (!seed.value) return ''
    const name = seedSummary.value?.name ?? seed.value.bodyId
    const more = targets.value.length > 0 ? ` and ${targets.value.length} more` : ''
    return `Repeat on ${name} › ${seed.value.partName}${more}`
  })

  const status = computed(() => {
    if (!seed.value) return ''
    if (!subject.value) {
      return `Now make one part on ${seed.value.partName}: drag it in, turn it, Align and Snap it as usual.`
    }
    const count = steps.value.length
    return `Recording ${subject.value.name}: ${count} ${count === 1 ? 'step' : 'steps'}`
  })

  const libraryHint = computed(() => {
    if (!armed.value || !seed.value) return ''
    const count = ticked.value.length
    return `Repeating on ${count} ${count === 1 ? 'target' : 'targets'}: drag the part you want onto ${seed.value.partName}.`
  })

  /** The ticked targets the viewport outlines (the seed is where the user is working). */
  const outlined = computed(() => (armed.value ? targets.value : []))

  /** The params Apply would append, or `null` before there is a subject. */
  const params = computed(() => {
    if (!seed.value || !subject.value) return null
    return {
      source: subject.value.id,
      seed: { id: seed.value.bodyId, pieces: seed.value.partName },
      targets: [...targets.value],
    }
  })

  /** Why Apply is disabled, or `null` when it is enabled. Live, so the panel can say it. */
  const applyReason = computed(() => {
    void documentStore.version
    if (!armed.value || !seed.value) return 'Press Repeat first'
    if (timeline.previewing) return PREVIEW_REASON
    const current = subject.value
    if (!current || !params.value) return `Make the part on ${seed.value.partName} first`
    if (targets.value.length === 0) return `Tick at least one target besides ${seed.value.partName}`
    const foreign = outside.value.find((step) => step.onSubject)
    if (foreign) {
      const who = /** @type {Record<string, string>} */ (ORIGIN_LABELS)[foreign.origin] ?? foreign.origin
      return `${current.name} has a step you didn’t make (from ${who}). A repeat copies every step of ${current.name}, so Cancel and make the part by hand.`
    }
    return repeatRefusal(documentStore.raw, params.value)
  })

  const canApply = computed(() => armed.value && applyReason.value === null)

  const applyLabel = computed(() => `Apply to ${targets.value.length} more`)

  /** Arm the session on the drilled-into part. */
  function arm() {
    if (!armGate.value.enabled) return false
    const subPart = /** @type {{ bodyId: string, partName: string }} */ (selection.subPart)
    knownIds = new Set(documentStore.raw.entries.map((entry) => entry.record.id))
    seed.value = { bodyId: subPart.bodyId, partName: subPart.partName }
    const family = nameFamily(partNames.value, subPart.partName)
    ticked.value = family.length > 0 ? family : [subPart.partName]
    minimized.value = false
    error.value = ''
    notice.value = null
    armed.value = true
    return true
  }

  /** End the session. The first part stays exactly as it is; nothing is undone. */
  function cancel() {
    armed.value = false
    seed.value = null
    ticked.value = []
    knownIds = new Set()
    minimized.value = false
    error.value = ''
  }

  /**
   * Tick or untick one target. The seed is locked.
   *
   * @param {string} name
   */
  function toggleTarget(name) {
    if (!seed.value || name === seed.value.partName || !partNames.value.includes(name)) return
    const next = ticked.value.includes(name) ? ticked.value.filter((each) => each !== name) : [...ticked.value, name]
    const order = orderedParts.value
    ticked.value = next.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  }

  /** Apply: one linked repeat, one Undo step. Returns whether anything was written. */
  function apply() {
    error.value = ''
    if (!canApply.value || !params.value || !subject.value || !seed.value) return false
    const name = subject.value.name
    const count = targets.value.length
    const noun = targetNoun(seed.value.partName, targets.value)
    try {
      const record = documentStore.appendRepeat(params.value)
      selection.select(/** @type {string} */ (record.id))
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
      return false
    }
    notice.value = { text: `Repeated ${name} on ${count} more ${noun}`, undoLabel: documentStore.undoLabel }
    cancel()
    return true
  }

  function minimize() {
    if (armed.value) minimized.value = true
  }

  function expand() {
    minimized.value = false
  }

  function dismissNotice() {
    notice.value = null
  }

  /** The toast's Undo: only while the Repeat is still the step Undo would take back. */
  const canUndoNotice = computed(() => notice.value !== null && documentStore.undoLabel === notice.value.undoLabel)

  function undoNotice() {
    if (!canUndoNotice.value) return false
    notice.value = null
    return documentStore.undo().ok
  }

  // The session ends when what it is about goes away: the seed body, or a subject that was
  // deleted (or consumed) mid-session. Synchronous, so no frame shows a panel about nothing.
  watch(
    () => documentStore.version,
    () => {
      if (!armed.value || !seed.value) return
      if (!summaryOf(seed.value.bodyId)) cancel()
      else if (subject.value && !summaryOf(subject.value.id)) cancel()
    },
    { flush: 'sync' },
  )
  // A loaded project is a different document.
  watch(() => documentStore.loadRevision, cancel, { flush: 'sync' })
  // A pending delete question is about the selection it was asked for.
  watch(
    () => selection.ids.join('\u0000'),
    () => {
      deleteConfirm.value = null
    },
    { flush: 'sync' },
  )

  /**
   * The repeat bodies that would break if `ids` were deleted: each one that follows (or is
   * aimed at parts of) a body in `ids`, and is not itself being deleted.
   *
   * @param {readonly string[]} ids
   * @returns {{ id: string, name: string, follows: string[] }[]}
   */
  function followersOf(ids) {
    const set = new Set(ids)
    return documentStore.bodies
      .filter((body) => body.repeat !== undefined && !set.has(body.id))
      .map((body) => {
        const info = /** @type {import('../core/repeat.js').RepeatInfo} */ (body.repeat)
        return { id: body.id, name: body.name, follows: [info.source, info.seed.id].filter((id) => set.has(id)) }
      })
      .filter((follower) => follower.follows.length > 0)
  }

  /**
   * Ask before a delete that would break repeats. Returns whether it asked.
   *
   * @param {readonly string[]} ids
   * @returns {boolean}
   */
  function askDelete(ids) {
    const followers = followersOf(ids)
    if (followers.length === 0) return false
    const followed = [...new Set(followers.flatMap((follower) => follower.follows))].map(
      (id) => summaryOf(id)?.name ?? id,
    )
    const verb = followers.length === 1 ? 'follows' : 'follow'
    deleteConfirm.value = {
      ids: [...ids],
      followers: followers.map(({ id, name }) => ({ id, name })),
      question: `${listed(followers.map((follower) => follower.name))} ${verb} ${listed(followed)}. Delete the repeats too, or leave them broken?`,
    }
    return true
  }

  function clearDeleteConfirm() {
    deleteConfirm.value = null
  }

  return {
    armed,
    seed,
    ticked,
    minimized,
    error,
    notice,
    deleteConfirm,
    armGate,
    seedSummary,
    partNames,
    orderedParts,
    targets,
    subject,
    steps,
    outside,
    headline,
    status,
    libraryHint,
    outlined,
    applyReason,
    canApply,
    applyLabel,
    canUndoNotice,
    arm,
    cancel,
    toggleTarget,
    apply,
    minimize,
    expand,
    dismissNotice,
    undoNotice,
    askDelete,
    clearDeleteConfirm,
  }
})

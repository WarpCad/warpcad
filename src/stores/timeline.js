// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The History panel's state — **UI only** (`TODO/ui-032`).
 *
 * CLAUDE.md's Project Structure is explicit that `src/stores/` holds "UI state
 * only (selection, active tool, panel layout)" and that document state is never
 * mirrored into Pinia. The whole design of this file is that line, drawn in the
 * one place it is genuinely easy to get wrong:
 *
 * | Thing | Where it lives | Why |
 * |---|---|---|
 * | Panel open / closed | here | panel layout, forgotten on reload (§13) |
 * | Which row is selected | here | a row selection is not a body selection (§13) |
 * | **Preview** — which past step the viewport is showing | **here** | §14: "never autosaved, never in the undo stack, never a document record" |
 * | **Rollback marker** | **the document** | §18: autosaved, restored on reload, pushed to a repo, undoable |
 *
 * Preview and rollback look alike on screen and are opposites underneath. Getting
 * that backwards would either lose a rollback on reload or write a transient
 * viewport state into the user's file — so this store reads `rollbackAt()` from
 * the document and never stores it, and owns `previewStep` and never persists it.
 *
 * ## Why the row list is a `computed` and not a refreshed snapshot
 *
 * `src/stores/document.js` keeps `version`, a real ref bumped on every mutation,
 * so a computed that touches it re-evaluates exactly when the log changes. That
 * removes the class of bug where a panel shows a stale list because somebody
 * forgot to call `refresh()` after a new mutation path landed — which, for a
 * panel whose entire job is to show what the document currently is, would be the
 * `SECOND-ATTEMPT.md` failure mode in miniature.
 *
 * ## The preview document
 *
 * A preview is a **throwaway document folded from a prefix of the log** — the
 * same trick `document.js`'s own tail shadow-check uses, and for the same
 * reason: there is one implementation of the fold, so a previewed state cannot
 * disagree with the real one. It folds on the live document's fold cache
 * (`TODO/core-031`), so it builds nothing the live fold already built. It is held
 * in a plain, non-reactive variable
 * because it holds kernel geometry, which CLAUDE.md's Performance section puts
 * off-limits to Vue's deep reactivity.
 *
 * ## Watch: the Assistant's fork as the preview source (`TODO/ai-017`)
 *
 * While an Assistant turn runs, the user keeps editing the live document and the Assistant
 * builds on its own fork. **Watch** asks the viewport to show that fork instead, read-only, in
 * this same preview mode — amber outline, Operations, Library, Undo and Redo disabled, picking
 * off — with the strip reading {@link WATCH_TEXT}. The fork is handed in as a {@link WatchSource}
 * (getters, so the fork itself never enters reactive state) by `composables/useAgent.js`, which
 * ends it when the turn ends. **Back to latest**, Esc, selecting a History row and any whole-
 * document load end it too. Closing the History panel does not: watching is not a History
 * preview.
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef, toRaw, watch } from 'vue'

import { createDocument, foldableEntry } from '../core/document.js'
import { buildNameIndex, describeRow } from '../core/timelineLabel.js'
import { summarizeBody, useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'

/** @typedef {import('../core/document.js').BrokenStep} BrokenStep */

/** `TODO/ai-017`: the strip's text while the viewport shows the Assistant's fork. */
export const WATCH_TEXT = 'Watching the Assistant — your project is unchanged'

/**
 * Where a Watch preview reads from (`TODO/ai-017`).
 *
 * @typedef {object} WatchSource
 * @property {() => import('../core/document.js').WarpDocument | null} document The running fork,
 *   raw; `null` once the turn has ended.
 * @property {() => number} revision A **reactive** counter that moves whenever the fork changes,
 *   so the viewport re-reads it.
 */
/** @typedef {import('../core/document.js').WarpDocument} WarpDocument */

/**
 * @typedef {object} TimelineRowView
 * @property {number} step 1-based, as the list numbers rows.
 * @property {string} id The record's id.
 * @property {string} text The rich label (`Chamfer Top (+Z) 5 mm on Cube 1`).
 * @property {string} origin §19's origin chip source; `local` for the user's own.
 * @property {string | null} intent `TODO/ai-003`: the row's design intent, or `null`.
 *   Untrusted text — rendered as text, never markup.
 * @property {boolean} suppressed
 * @property {boolean} active `false` past the rollback marker.
 * @property {string | null} broken Why the row does not build, or `null`.
 * @property {import('../core/document.js').InactiveBy | null} inactiveBy `TODO/ui-052`:
 *   the condition currently keeping this row out of the fold.
 * @property {import('../core/document.js').RowCondition | null} condition The condition
 *   the row carries or inherits, true or not — the chip's source.
 * @property {import('../core/kernel/registry.js').OpRecord} record
 */

export const useTimelineStore = defineStore('timeline', () => {
  const documentStore = useDocumentStore()

  /** §13: "Default closed on every device, every load." Not persisted. */
  const open = ref(false)
  /** The selected row's record id; `''` for none. Exactly one row at a time (§13). */
  const selectedId = ref('')
  /**
   * Whether the user has asked to preview their selected row. Separate from
   * {@link previewStep} — which is *derived* — so that closing the panel can end
   * the preview while leaving the row selected (§13), and so a preview of a row
   * that later stops existing simply evaporates instead of dangling.
   */
  const previewRequested = ref(false)
  /**
   * The last refused row action, for the panel to render. Never swallowed: "the
   * failing downstream row is marked broken while the failure is on screen" is
   * §15's contract, and a `catch` that dropped it would recreate exactly the
   * silent-failure class this milestone exists to catch.
   * @type {import('vue').Ref<{ message: string, broken: BrokenStep | null } | null>}
   */
  const error = ref(null)

  /**
   * The row list. Recomputed whenever the document's version moves — see the
   * module note on why this is not a manually refreshed snapshot.
   * @type {import('vue').ComputedRef<TimelineRowView[]>}
   */
  const rows = computed(() => {
    // The dependency that makes this reactive: `raw` is deliberately
    // non-reactive, so the version ref is what Vue actually tracks here.
    void documentStore.version
    const names = buildNameIndex(documentStore.raw.records)
    return documentStore.raw.timeline().map((row) => ({
      step: row.step,
      id: row.id,
      text: describeRow(row.record, names),
      origin: row.origin,
      intent: row.intent,
      suppressed: row.suppressed,
      active: row.active,
      broken: row.broken,
      inactiveBy: row.inactiveBy,
      condition: row.condition,
      record: row.record,
    }))
  })

  const stepCount = computed(() => rows.value.length)

  /** §18's marker, read from the document — never stored here. */
  const rollbackAt = computed(() => {
    void documentStore.version
    return documentStore.raw.rollbackAt()
  })

  const rolledBack = computed(() => rollbackAt.value !== null)
  const activeCount = computed(() => rollbackAt.value ?? stepCount.value)

  /** The selected row, if it is still in the log. */
  const selectedRow = computed(
    () => rows.value.find((row) => row.id === selectedId.value) ?? null
  )

  /**
   * Which step the viewport is previewing, or `null`.
   *
   * Derived rather than stored, so three things are true for free: selecting the
   * last (active) row is *not* a preview because it already is the current
   * document (§14); an inactive row selects but never previews (§18); and a
   * preview of a row that an Undo has since removed ends by itself rather than
   * leaving the viewport frozen on a state nothing points at any more.
   */
  const previewStep = computed(() => {
    if (!previewRequested.value) return null
    const row = selectedRow.value
    if (row === null || !row.active) return null
    if (row.step >= activeCount.value) return null
    return row.step
  })

  /**
   * `TODO/ai-017`: the Assistant's fork, while **Watch** is on. Shallow: the source is a pair of
   * getters, never the fork itself.
   * @type {import('vue').ShallowRef<WatchSource | null>}
   */
  const watchSource = shallowRef(null)
  const watching = computed(() => watchSource.value !== null)
  /** Moves with the watched fork; `null` while not watching. What the viewport re-syncs on. */
  const watchRevision = computed(() => (watchSource.value === null ? null : watchSource.value.revision()))

  const previewing = computed(() => watching.value || previewStep.value !== null)

  const previewText = computed(() => {
    if (watching.value) return WATCH_TEXT
    return previewStep.value === null ? '' : `Previewing step ${previewStep.value} of ${stepCount.value} — read-only`
  })

  const rollbackText = computed(() =>
    rollbackAt.value === null ? '' : `Rolled back to step ${rollbackAt.value} of ${stepCount.value}`
  )

  const rollbackDetail = computed(() => {
    if (rollbackAt.value === null) return ''
    const later = stepCount.value - rollbackAt.value
    return `New steps insert here · ${later} later step${later === 1 ? '' : 's'} inactive`
  })

  /**
   * The throwaway document folded from the log's first `previewStep` entries.
   *
   * Plain and non-reactive (it holds kernel geometry), and cached against the
   * step and the document version so that scrolling the panel or re-rendering a
   * row does not re-fold the log.
   * @type {WarpDocument | null}
   */
  let previewDoc = null
  let previewKey = ''

  /**
   * The document the viewport should render: the preview, or `null` for "the
   * real one". A single accessor rather than a flag plus a lookup, so no caller
   * can check one and read the other.
   *
   * @returns {WarpDocument | null}
   */
  function previewDocument() {
    // `TODO/ai-017`: Watch wins over a History preview — it is what the user asked for last.
    const watched = watchSource.value?.document() ?? null
    if (watched !== null) return watched
    const step = previewStep.value
    if (step === null) {
      previewDoc = null
      previewKey = ''
      return null
    }
    const key = `${step}:${documentStore.version}`
    if (previewDoc !== null && key === previewKey) return previewDoc

    // `toRaw`: Pinia hands `raw` back as a reactive proxy, and the fold cache is keyed
    // by the *raw* record objects and holds raw geometry — a proxied record would miss
    // it, and a proxied cache would hand back proxied geometry (CLAUDE.md, Performance).
    const live = toRaw(documentStore.raw)
    // `foldableEntry`: record, origin and both fold flags — a row left broken
    // (`TODO/ui-052`) has to stay tolerated in the preview exactly as it is live.
    const prefix = live.entries.slice(0, step).map(foldableEntry)
    // The live document's fold cache (TODO/core-031): a prefix of the log is records
    // the live fold already built against the same operands, so the preview reuses
    // every one of them instead of folding the prefix from scratch on each row click.
    // …and at the live document's resolution (TODO/core-035): the cache is keyed on it, and
    // a preview at any other setting would show the past faceted differently from now.
    const scratch = createDocument({ foldCache: live.foldCache, resolution: live.resolution() })
    try {
      // Any prefix of a log that folds must itself fold — every reference in a
      // record points backwards. Guarded anyway: a preview is a read, and a
      // read must never be the thing that breaks the app.
      scratch.loadEntries(prefix, null)
    } catch {
      previewDoc = null
      previewKey = ''
      return null
    }
    previewDoc = scratch
    previewKey = key
    return previewDoc
  }

  /**
   * The previewed scene as plain summaries, or `null` when nothing is being
   * previewed — what the viewport *announces* (its scene list, its body count,
   * its `data-body-*` attributes).
   *
   * This exists because rendering the preview and reporting it are two
   * different code paths, and an early build of this task got the first right
   * and left the second reading the live document: the canvas showed one body
   * and the DOM said two. That is the readout-contradicts-the-picture defect
   * in miniature, and it was caught by `e2e/timeline-panel.e2e.js` rather than
   * by reasoning, which is the argument for the spec existing at all.
   *
   * Summarised with {@link summarizeBody} — the same function the live scene
   * goes through, so the two can never disagree about what a centre is.
   *
   * @type {import('vue').ComputedRef<import('./document.js').BodySummary[] | null>}
   */
  const previewBodies = computed(() => {
    // `TODO/ai-017`: the watched fork, re-read whenever it changes.
    if (watchSource.value !== null) {
      void watchSource.value.revision()
      void documentStore.measureRevision
      const watched = watchSource.value.document()
      if (watched !== null) return watched.bodies().map(summarizeBody)
    }
    if (previewStep.value === null) return null
    // Depend on the version too: an edit while previewing re-folds the prefix.
    void documentStore.version
    // And on landed measurements (`TODO/core-029`): a previewed composite's volume is
    // measured in the evaluation worker, and this has to re-read it when it arrives.
    void documentStore.measureRevision
    return previewDocument()?.bodies().map(summarizeBody) ?? null
  })

  // A previewed prefix is a fresh fold, so its composites are new geometry the cache has
  // never seen. Ask for them on the preview's own channel — never the live scene's — so
  // scrubbing the timeline cannot supersede the live document's measurements.
  watch(previewBodies, (summaries) => {
    if (!summaries?.some((summary) => summary.volumeMm3 === null)) return
    const preview = previewDocument()
    if (preview) documentStore.measurePreview(preview.bodies())
  })

  // Loading a whole project (Open…, Load from a repository, `ui-033`) replaces the document
  // outright. The row ids may well come back the same — Open… of the file just saved — so a
  // preview keyed on an id would otherwise survive and freeze the viewport, read-only, on a
  // past state of a document that no longer exists (§10: "any preview/rollback strip is
  // cleared"). The rollback marker needs nothing: it is document state, read fresh.
  watch(
    () => documentStore.loadRevision,
    () => {
      previewRequested.value = false
      selectedId.value = ''
      error.value = null
      watchSource.value = null
    },
    { flush: 'sync' }
  )

  /** @param {boolean} next */
  function setOpen(next) {
    open.value = next
    // §13: "Closing the panel while previewing ends the preview" — the row stays
    // selected, so reopening puts the user back where they were. A Watch is not a History
    // preview, so it stays (`TODO/ai-017`).
    if (!next) previewRequested.value = false
  }

  function toggle() {
    setOpen(!open.value)
  }

  /**
   * Select a row, previewing it when it is an earlier active step (§14).
   *
   * @param {string} id
   */
  function selectRow(id) {
    selectedId.value = id
    // `TODO/ai-017`: asking to see a past step is leaving the Assistant's fork.
    watchSource.value = null
    previewRequested.value = true
    error.value = null
    // §14, point 4: "Body selection is cleared on entering preview — a selection
    // in a state that may not contain that body is meaningless."
    if (previewStep.value !== null) useSelectionStore().clear()
  }

  /**
   * Leave preview mode, keeping the row selected. §14: not restored on exit. **Back to latest**
   * and Esc also end a Watch (`TODO/ai-017`): both mean "show me my project".
   */
  function endPreview() {
    previewRequested.value = false
    watchSource.value = null
  }

  /**
   * `TODO/ai-017`: show the Assistant's fork, read-only, until {@link endWatch}, {@link endPreview}
   * or a load. Starting it drops a History preview, so ending it returns to the live document.
   *
   * @param {WatchSource} source
   */
  function watchFork(source) {
    previewRequested.value = false
    watchSource.value = source
  }

  /** `TODO/ai-017`: stop showing the fork; a History preview, if any, is not touched. */
  function endWatch() {
    watchSource.value = null
  }

  /**
   * @param {string} message
   * @param {BrokenStep | null} [broken]
   */
  function setError(message, broken = null) {
    error.value = { message, broken }
  }

  function clearError() {
    error.value = null
  }

  return {
    open,
    selectedId,
    selectedRow,
    error,
    rows,
    stepCount,
    rollbackAt,
    rolledBack,
    activeCount,
    previewStep,
    previewing,
    previewText,
    watching,
    watchRevision,
    watchFork,
    endWatch,
    rollbackText,
    rollbackDetail,
    previewBodies,
    previewDocument,
    setOpen,
    toggle,
    selectRow,
    endPreview,
    setError,
    clearError,
  }
})

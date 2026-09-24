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
 * disagree with the real one. It is held in a plain, non-reactive variable
 * because it holds kernel geometry, which CLAUDE.md's Performance section puts
 * off-limits to Vue's deep reactivity.
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import { createDocument } from '../core/document.js'
import { buildNameIndex, describeRow } from '../core/timelineLabel.js'
import { summarizeBody, useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'

/** @typedef {import('../core/document.js').BrokenStep} BrokenStep */
/** @typedef {import('../core/document.js').WarpDocument} WarpDocument */

/**
 * @typedef {object} TimelineRowView
 * @property {number} step 1-based, as the list numbers rows.
 * @property {string} id The record's id.
 * @property {string} text The rich label (`Chamfer Top (+Z) 5 mm on Cube 1`).
 * @property {string} origin §19's origin chip source; `local` for the user's own.
 * @property {boolean} suppressed
 * @property {boolean} active `false` past the rollback marker.
 * @property {string | null} broken The shadow check's reason, or `null`.
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
      suppressed: row.suppressed,
      active: row.active,
      broken: row.broken,
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

  const previewing = computed(() => previewStep.value !== null)

  const previewText = computed(() =>
    previewStep.value === null
      ? ''
      : `Previewing step ${previewStep.value} of ${stepCount.value} — read-only`
  )

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
    const step = previewStep.value
    if (step === null) {
      previewDoc = null
      previewKey = ''
      return null
    }
    const key = `${step}:${documentStore.version}`
    if (previewDoc !== null && key === previewKey) return previewDoc

    const prefix = documentStore.raw.entries.slice(0, step).map((entry) => ({
      record: entry.record,
      origin: entry.origin,
      ...(entry.suppressed === true ? { suppressed: true } : {}),
    }))
    const scratch = createDocument()
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
    },
    { flush: 'sync' }
  )

  /** @param {boolean} next */
  function setOpen(next) {
    open.value = next
    // §13: "Closing the panel while previewing ends the preview" — the row stays
    // selected, so reopening puts the user back where they were.
    if (!next) endPreview()
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
    previewRequested.value = true
    error.value = null
    // §14, point 4: "Body selection is cleared on entering preview — a selection
    // in a state that may not contain that body is meaningless."
    if (previewStep.value !== null) useSelectionStore().clear()
  }

  /** Leave preview mode, keeping the row selected. §14: not restored on exit. */
  function endPreview() {
    previewRequested.value = false
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

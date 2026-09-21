/**
 * The Export popover's state and rules (`TODO/ui-034`) — **UI state only**. The mechanism it
 * drives is `io-003`'s (`src/core/export.js`, `src/render/export.js`); its contract is
 * `docs/decisions/interaction-model-qa.md` §12 (confirmed by the user), which wins over the
 * task file's older wording. Nothing here serialises geometry or reads a mesh: it decides
 * *when Export is allowed*, *what the scope line says*, and *what to hand to the export
 * functions*, then hands the finished bytes to the one download path.
 *
 * ## The rules, and where each lives
 *
 * - **Availability** ({@link unavailableReason}): dimmed with `Nothing to export` when the
 *   document has no 3D body, and with `Return to the latest step to export` while History
 *   previews a past state (a preview's state is not the document — exporting what the viewport
 *   shows would be the looks-live-but-isn't failure `SECOND-ATTEMPT.md` names). Previewing is
 *   checked first: it is the mode the user is *in*, and leaving it is the action that fixes it.
 *   **Rolled back** stays enabled and exports the active state; {@link rollbackNote} says how
 *   much is left out (§18).
 * - **Scope** ({@link effectiveScope}): the default follows the selection (1+ bodies selected →
 *   `selection`, else `scene`) and stays overridable. A sub-part selection already carries its
 *   parent body's id in the selection store, so it exports the whole parent body
 *   ({@link wholeBodyNote} says so). Several bodies are one combined file, and the labels say so.
 * - **Format**: STL default, remembered per viewer through `stores/settings.js`.
 *
 * ## The document changing under an open popover (decision (a))
 *
 * The backdrop stops the *mouse* changing the selection, but not the keyboard (Ctrl+Z), a
 * programmatic edit or a hosted pull. So nothing here is a snapshot taken at open:
 *
 * - **Every line is derived from the live document and selection**, so what the popover says
 *   is what Export would do *this instant*. Press Ctrl+Z with the popover open and the line
 *   changes in front of the user.
 * - **The file is built from `document.raw.bodies()` at the moment of the press**, not from
 *   anything cached at open.
 * - **A scope the user chose *explicitly* is never silently widened.** If they picked
 *   `Selection` and the selection has since vanished, Export is blocked with
 *   `The selection changed — choose what to export` rather than quietly exporting the whole
 *   scene (which is what "0 selected → whole scene" would otherwise do). A scope that is only
 *   the *default* simply keeps following the selection: nothing was asked for, so nothing is
 *   violated.
 * - `resolveExportScope` (io-003) is still run at commit against the live bodies as the last
 *   line of defence — it refuses a non-empty selection matching nothing.
 *
 * ## Cancelling mid-flight
 *
 * glTF loads its exporter lazily, so an export can be in flight for a moment. Closing the
 * popover during that moment discards the result (a token check) instead of downloading a file
 * the user already walked away from.
 *
 * ## Off the main thread, and saying so (`TODO/perf-001`)
 *
 * `commit()` no longer calls `exportBodies` itself: it goes through
 * `src/core/exportClient.js`, which runs the combine, the repair and the serialization in a
 * worker. Measured in Chromium against the real app, that took a 24-body scene's main-thread
 * freeze from **233 ms to 27 ms at 4× CPU throttling and 346 ms to 40 ms at 6×**. Nothing
 * about this store's contract changed — the same `ExportResult` comes back, and a refusal is
 * still an `ExportError` with its `code` and body name, whichever side of the boundary raised
 * it — so every rule above still reads the same way.
 *
 * That is also what makes {@link PENDING_AFTER_MS} worth having. A pending state set just
 * before a synchronous block could never paint; with the work in a worker it can, and the
 * viewport stays live underneath it.
 *
 * @module stores/exportDialog
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { EXPORT_FORMATS, ExportError, exportFilename, resolveExportScope } from '../core/export.js'
import { pendingFilename, runExport } from '../core/exportClient.js'
import { downloadBytes } from '../storage/download.js'
import { useDocumentStore } from './document.js'
import { usePersistenceStore } from './persistence.js'
import { useSelectionStore } from './selection.js'
import { useSettingsStore } from './settings.js'
import { useTimelineStore } from './timeline.js'

/** @typedef {import('../core/export.js').ExportBody} ExportBody */
/** @typedef {import('../core/export.js').ExportResult} ExportResult */
/** @typedef {import('../core/export.js').ExportFormat} ExportFormat */
/** @typedef {'selection' | 'scene'} ExportScope */

/**
 * How long an export may take before the popover says so (`TODO/perf-001`).
 *
 * 100 ms is the threshold the finding names, and it is the right order: measured in
 * Chromium against the real app, a one-body export is 5-20 ms even at 4× CPU
 * throttling and finishes long before this fires, while a 24-body scene takes 224 ms
 * at 4× and 339 ms at 6× — so the state appears exactly when there is something to
 * wait for. Changing it is a UX decision, not a tuning knob: below ~100 ms a person
 * reads a flash of text as a glitch rather than as progress.
 */
export const PENDING_AFTER_MS = 100

/**
 * @typedef {object} ExportDependencies
 * @property {(result: ExportResult) => void} download Hand a finished file to the browser;
 *   throws on failure so the popover can name it.
 * @property {() => Promise<(bodies: readonly ExportBody[]) => Promise<ExportResult>>} loadGltfExporter
 *   Resolve `exportGltf`. A function because it is a dynamic import: `GLTFExporter` is most
 *   of export's bundle cost and nobody exports on first paint.
 */

/** @type {ExportDependencies | null} */
let dependencies = null

/**
 * Replace the boundary — for tests, which must never click a real anchor or load a real
 * chunk. Pass `null` to go back to the real ones.
 *
 * @param {ExportDependencies | null} next
 */
export function setExportDependencies(next) {
  dependencies = next
}

/** @returns {ExportDependencies} */
function resolveDependencies() {
  dependencies ??= {
    download(result) {
      const outcome = downloadBytes(result.bytes, result.filename, result.mimeType)
      if (!outcome.ok) throw new Error(outcome.error)
    },
    loadGltfExporter: async () => (await import('../render/export.js')).exportGltf,
  }
  return dependencies
}

/**
 * @param {number} count
 * @returns {string} `1 body`, `3 bodies`.
 */
function bodiesPhrase(count) {
  return `${count} ${count === 1 ? 'body' : 'bodies'}`
}

export const useExportDialogStore = defineStore('exportDialog', () => {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const settings = useSettingsStore()
  const timeline = useTimelineStore()
  const persistence = usePersistenceStore()

  const isOpen = ref(false)
  /**
   * What the user explicitly picked, or `null` for "follow the selection". Kept apart from
   * {@link effectiveScope} on purpose: an explicit `selection` that has gone stale must be
   * *blocked*, whereas a default that has gone stale should just follow.
   *
   * @type {import('vue').Ref<ExportScope | null>}
   */
  const chosenScope = ref(null)
  /** A refusal or failure, by name, shown in the popover. Empty when there is none. */
  const error = ref('')
  const exporting = ref(false)
  /** True while a glTF export is in flight — the button's `Preparing…`. */
  const preparing = ref(false)
  /**
   * True once an export has been running longer than {@link PENDING_AFTER_MS} — the
   * button's `Exporting…` and the `Writing …` line (`TODO/perf-001`).
   *
   * Deliberately *not* set when the export starts: a 5 ms export that flashed a
   * pending state would be worse than no feedback at all. It is armed by a timer, so a
   * quick export finishes first and the user never sees one.
   */
  const pending = ref(false)
  /** The file the pending state names, so the user knows what is being written. */
  const pendingFile = ref('')
  /** @type {ReturnType<typeof setTimeout> | null} */
  let pendingTimer = null
  /** Bumped by every commit and by close(); a continuation whose token is stale is discarded. */
  let attempt = 0

  function clearPending() {
    if (pendingTimer !== null) clearTimeout(pendingTimer)
    pendingTimer = null
    pending.value = false
    pendingFile.value = ''
  }

  const format = computed(() => settings.exportFormat)

  /** @returns {ExportBody[]} Summaries structurally satisfy what labels and filenames read. */
  const sceneSummaries = computed(() => /** @type {ExportBody[]} */ (/** @type {unknown} */ (documentStore.bodies)))

  /** The selected ids that are still bodies in the scene, in scene order. */
  const selectedSummaries = computed(() => {
    const wanted = new Set(selection.ids)
    return sceneSummaries.value.filter((body) => wanted.has(body.id))
  })

  const selectionAvailable = computed(() => selectedSummaries.value.length > 0)

  const unavailableReason = computed(() => {
    if (timeline.previewing) return 'Return to the latest step to export'
    if (sceneSummaries.value.length === 0) return 'Nothing to export'
    return ''
  })

  /** @type {import('vue').ComputedRef<ExportScope>} */
  const effectiveScope = computed(() => chosenScope.value ?? (selectionAvailable.value ? 'selection' : 'scene'))

  /** Non-empty when an explicitly chosen Selection no longer names anything. */
  const scopeProblem = computed(() =>
    chosenScope.value === 'selection' && !selectionAvailable.value
      ? 'The selection changed — choose what to export'
      : ''
  )

  const scopeBodies = computed(() => (effectiveScope.value === 'selection' ? selectedSummaries.value : sceneSummaries.value))

  const selectionLabel = computed(() => {
    const count = selectedSummaries.value.length
    if (count === 0) return 'Selection — nothing selected'
    if (count === 1) return `Selection — ${selectedSummaries.value[0].name}`
    return `Selection — ${bodiesPhrase(count)}, in one file`
  })

  const sceneLabel = computed(() => {
    const count = sceneSummaries.value.length
    return count === 1 ? `Whole scene — ${bodiesPhrase(count)}` : `Whole scene — ${bodiesPhrase(count)}, in one file`
  })

  /** The line that always states exactly what will be exported, and under what name. */
  const summary = computed(() => {
    if (unavailableReason.value !== '' || scopeProblem.value !== '') return ''
    const bodies = scopeBodies.value
    if (bodies.length === 0) return ''
    const filename = exportFilename(bodies, format.value)
    return bodies.length === 1
      ? `Exports ${bodies[0].name} as ${filename}`
      : `Exports ${bodiesPhrase(bodies.length)} together as ${filename}`
  })

  /** §12: a drilled-in sub-part exports its whole parent body. Says so, so nobody is surprised. */
  const wholeBodyNote = computed(() => {
    const drilled = selection.subPart
    if (drilled === null || effectiveScope.value !== 'selection') return ''
    if (selection.ids.length !== 1 || selection.ids[0] !== drilled.bodyId) return ''
    const body = selectedSummaries.value[0]
    if (!body) return ''
    return `Exports the whole body "${body.name}", not just the selected part "${drilled.partName}"`
  })

  /** §18: while rolled back the export is the ACTIVE state, and the popover says what is left out. */
  const rollbackNote = computed(() => {
    if (!timeline.rolledBack) return ''
    const later = timeline.stepCount - (timeline.rollbackAt ?? timeline.stepCount)
    return `(rolled back — ${later} later step${later === 1 ? '' : 's'} not included)`
  })

  const canExport = computed(
    () => isOpen.value && unavailableReason.value === '' && scopeProblem.value === '' && !exporting.value
  )

  /**
   * Open the popover, starting from the default scope and no old message.
   *
   * @returns {boolean} `false` when Export is unavailable (the menu item is dimmed then, so
   *   this is the belt to that item's braces).
   */
  function open() {
    if (unavailableReason.value !== '') return false
    chosenScope.value = null
    error.value = ''
    isOpen.value = true
    return true
  }

  /** Close, and abandon any export still in flight. */
  function close() {
    attempt += 1
    isOpen.value = false
    exporting.value = false
    preparing.value = false
    clearPending()
    error.value = ''
    chosenScope.value = null
  }

  /**
   * @param {string} scope `'selection'` or `'scene'`. Selection is ignored when nothing is
   *   selected (its radio is disabled then).
   */
  function chooseScope(scope) {
    if (scope === 'selection' && !selectionAvailable.value) return
    if (scope !== 'selection' && scope !== 'scene') return
    chosenScope.value = scope
    error.value = ''
  }

  /** @param {string} next One of `EXPORT_FORMATS`' keys; anything else is ignored. */
  function chooseFormat(next) {
    if (!Object.prototype.hasOwnProperty.call(EXPORT_FORMATS, next)) return
    settings.setExportFormat(next)
    error.value = ''
  }

  /**
   * Build the file from the document **as it is now**, hand it to the browser, and close.
   * A refusal (`ExportError`) stays in the popover, named; nothing is ever downloaded empty.
   */
  async function commit() {
    if (!canExport.value) return
    error.value = ''
    const mine = ++attempt
    const wanted = format.value
    exporting.value = true
    preparing.value = wanted === 'glb'
    try {
      const deps = resolveDependencies()
      const live = /** @type {ExportBody[]} */ (/** @type {unknown} */ (documentStore.raw.bodies()))
      const ids = effectiveScope.value === 'selection' ? [...selection.ids] : []
      if (effectiveScope.value === 'selection' && ids.length === 0) {
        throw new ExportError('stale-selection', 'The selection changed — choose what to export')
      }
      const { bodies } = resolveExportScope(live, ids)
      // Only a *slow* export gets a pending state, and only once it is actually slow:
      // the work is in the worker (`src/core/exportClient.js`), so the main thread is
      // free to paint this — which is the whole reason it is worth showing.
      pendingFile.value = pendingFilename(bodies, wanted)
      pendingTimer = setTimeout(() => {
        if (mine === attempt) pending.value = true
      }, PENDING_AFTER_MS)
      const result = await runExport(bodies, wanted, { loadGltfExporter: deps.loadGltfExporter })
      if (mine !== attempt) return // closed while it was preparing: nobody is waiting for this file
      deps.download(result)
      persistence.announce(`Exported ${result.filename}`)
      close()
    } catch (failure) {
      if (mine !== attempt) return
      error.value =
        failure instanceof ExportError
          ? failure.message
          : `Export failed: ${failure instanceof Error ? failure.message : String(failure)}`
    } finally {
      if (mine === attempt) {
        exporting.value = false
        preparing.value = false
        clearPending()
      }
    }
  }

  return {
    isOpen,
    chosenScope,
    error,
    exporting,
    preparing,
    pending,
    pendingFile,
    format,
    unavailableReason,
    selectionAvailable,
    effectiveScope,
    scopeProblem,
    selectionLabel,
    sceneLabel,
    summary,
    wholeBodyNote,
    rollbackNote,
    canExport,
    open,
    close,
    chooseScope,
    chooseFormat,
    commit,
  }
})

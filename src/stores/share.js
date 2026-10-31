// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The **Shared view**'s state and its three ways out (`TODO/io-016`), and the request that opens the
 * sender's Share sheet from **File ▾ → Share…** — UI state and orchestration
 * only. `src/core/shareLink.js` reads the link; `composables/useShareLink.js` decides *when*
 * (the hash at boot, or a link pasted into an open tab) and clears the address bar; this store
 * holds what is on screen and hands every real action to the stores that own it.
 *
 * ## One read-only mode, not two
 *
 * The shared project is folded into a **throwaway document** — never the live one — and shown
 * through **Watch** (`TODO/ai-017`, `timeline.watchFork`), the read-only view the Assistant's fork
 * already uses: the viewport renders the given document, picking is off (tapping a body does
 * nothing), the gizmo is gone and nothing can append to the log. The live document keeps whatever
 * the browser restored, untouched underneath, which is what lets the copy button ask the right
 * question. A whole-document load ends a Watch, so the restore at boot is awaited *before* the
 * Watch starts, and a Watch ended any other way while the view shows is started again.
 *
 * ## Opening never writes
 *
 * {@link begin} suspends autosave synchronously — before the boot restore runs — and it stays
 * suspended until the Shared view is left. Nothing here writes to IndexedDB; the link's project
 * reaches storage only when the user asks for their own copy, and then through the ordinary Open
 * path (`fileMenu.requestOpenShared`), whose load is the change that autosaves.
 *
 * ## Hostile input
 *
 * The decoded records are serialised back and parsed by `parseProject` — the exact text **Open…**
 * would read — so every validator applies (intent caps, image checks, merge-section checks). A
 * project that does not parse or fold shows the "looks incomplete" screen, never a half-loaded
 * one. Nothing in it runs the Assistant: the Shared view has no assistant at all.
 *
 * @module stores/share
 */

import { defineStore } from 'pinia'
import { ref, toRaw, watch } from 'vue'

import { createDocument } from '../core/document.js'
import { serializeNdjson } from '../core/ndjson.js'
import { parseProject } from '../core/project.js'
import { createProjectId } from '../core/replica.js'
import { projectIdOfRecords, shareFileName, withProjectId } from '../core/shareCopy.js'
import { downloadBytes } from '../storage/download.js'
import { useDocumentStore } from './document.js'
import { useFileMenuStore } from './fileMenu.js'
import { usePersistenceStore } from './persistence.js'
import { useTimelineStore } from './timeline.js'

/** @typedef {import('../core/shareLink.js').ShareDecoded} ShareDecoded */
/** @typedef {import('../core/shareLink.js').ShareFailure} ShareFailure */

/**
 * `off` — the editor is showing; `opening` — a link is being read; `ready` — the Shared view;
 * `incomplete` — the link could not be read.
 *
 * @typedef {'off' | 'opening' | 'ready' | 'incomplete'} SharePhase
 */

/** What the project file MIME type is everywhere else (`storage/fileSystem.js`). */
const PROJECT_MIME = 'application/x-ndjson'

/**
 * Fold project text into a throwaway document, the way `mergeStateOfProject` does for a merge.
 *
 * @param {string} text
 * @param {import('../core/kernel/index.js').FoldCache | null} foldCache The live document's.
 * @returns {import('../core/document.js').WarpDocument}
 * @throws When the text is not a project this build can load.
 */
function foldShared(text, foldCache) {
  const parsed = parseProject(text)
  const scratch = createDocument({ resolution: parsed.resolution, foldCache })
  scratch.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, {
    standingInstructions: parsed.standingInstructions,
    buildVolume: parsed.buildVolume,
    userParts: parsed.userParts,
    unavailableParts: parsed.unavailableParts,
    ...(parsed.merge === undefined ? {} : { merge: parsed.merge }),
    ...(parsed.viewHidden === undefined ? {} : { viewHidden: parsed.viewHidden }),
  })
  return scratch
}

export const useShareStore = defineStore('share', () => {
  const documentStore = useDocumentStore()
  const timeline = useTimelineStore()
  const persistence = usePersistenceStore()

  /** @type {import('vue').Ref<SharePhase>} */
  const phase = ref('off')
  /** Why the link could not be read (`incomplete` only), or `''`. @type {import('vue').Ref<ShareFailure | 'unreadable' | ''>} */
  const reason = ref('')
  /** The project's title and the sender's note — untrusted text, rendered as text. */
  const name = ref('')
  const note = ref('')
  /**
   * `TODO/ui-091`: the shared project's description (`TODO/io-023`), cleaned by the loader —
   * untrusted text, rendered by `DescriptionText.vue` as elements with text content.
   */
  const description = ref('')
  /** The About popup is showing. */
  const aboutOpen = ref(false)
  /** The popup has already been offered for this link; reopening is by the About button only. */
  let aboutOffered = false
  /** A one-line result for **Save a copy of the file** (the Shared view has no status chip). */
  const status = ref('')
  /** Moves when the shared document is replaced; what Watch re-renders on. */
  const revision = ref(0)
  /** Moves when **File ▾ → Share…** asks for the sender's Share sheet (`ShareSheet.vue` watches it). */
  const sheetRequests = ref(0)

  /**
   * The shared project, plain and non-reactive: the document holds kernel geometry (CLAUDE.md,
   * Performance) and the records can be large.
   *
   * @type {{ doc: import('../core/document.js').WarpDocument, records: object[], text: string } | null}
   */
  let shared = null
  /** Which link read is current; a newer one (another pasted link) supersedes an older one. */
  let generation = 0

  /** @type {import('../stores/timeline.js').WatchSource} */
  const source = {
    document: () => shared?.doc ?? null,
    revision: () => revision.value,
  }

  // Watch is ended by any whole-document load and by "Back to latest"; while the Shared view is
  // up nothing else may take the viewport back to the live document.
  watch(
    () => timeline.watching,
    (watching) => {
      if (!watching && phase.value === 'ready' && shared !== null) timeline.watchFork(source)
    },
    { flush: 'sync' },
  )

  /**
   * A share link is being opened: show the Shared view's opening state and suspend autosave.
   * Synchronous on purpose — it must land before the boot restore starts.
   *
   * @returns {number} This read's generation, for {@link show} / {@link fail}.
   */
  function begin() {
    generation += 1
    phase.value = 'opening'
    reason.value = ''
    status.value = ''
    description.value = ''
    aboutOpen.value = false
    aboutOffered = false
    persistence.setAutosaveSuspended(true)
    return generation
  }

  /**
   * Show a decoded link. A project that does not parse or fold becomes the incomplete screen.
   *
   * @param {number} token {@link begin}'s return value; a stale read is ignored.
   * @param {Extract<ShareDecoded, { ok: true }>} decoded
   * @returns {boolean} Whether the Shared view is now showing it.
   */
  function show(token, decoded) {
    if (token !== generation) return false
    const text = serializeNdjson(decoded.records)
    /** @type {import('../core/document.js').WarpDocument} */
    let doc
    try {
      doc = foldShared(text, toRaw(documentStore.raw).foldCache)
    } catch {
      fail(token, 'unreadable')
      return false
    }
    shared = { doc, records: decoded.records, text }
    name.value = decoded.name
    note.value = decoded.note
    description.value = doc.description?.() ?? ''
    aboutOpen.value = false
    aboutOffered = false
    revision.value += 1
    phase.value = 'ready'
    timeline.watchFork(source)
    return true
  }

  /**
   * @param {number} token
   * @param {ShareFailure | 'unreadable'} why
   */
  function fail(token, why) {
    if (token !== generation) return
    shared = null
    reason.value = why
    phase.value = 'incomplete'
  }

  /** Back to the editor: end the Watch, drop the shared project, resume autosave. */
  function leave() {
    generation += 1
    const wasShowing = shared !== null
    shared = null
    phase.value = 'off'
    reason.value = ''
    status.value = ''
    description.value = ''
    aboutOpen.value = false
    aboutOffered = false
    if (wasShowing) timeline.endWatch()
    persistence.setAutosaveSuspended(false)
  }

  /**
   * **Make my own copy to edit**: through the File menu's open flow, so the browser's own
   * project is never replaced without the existing **Replace the project?** question, and the
   * same project re-sent is offered as a merge.
   */
  function makeCopy() {
    if (phase.value !== 'ready' || shared === null) return
    const { records, text } = shared
    useFileMenuStore().requestOpenShared({
      name: name.value,
      copyText: serializeNdjson(withProjectId(records, createProjectId())),
      theirText: text,
      projectId: projectIdOfRecords(records),
      leave,
    })
  }

  /** **Save a copy of the file**: the project as sent, downloaded (`storage/download.js`). */
  function saveFile() {
    if (shared === null) return
    const result = downloadBytes(shared.text, shareFileName(name.value), PROJECT_MIME)
    status.value = result.ok ? `Download started: ${result.name}` : `Couldn't save the file: ${result.error}`
  }

  /**
   * `TODO/ui-091`: offer the About popup, once per link. Opens it only when the Shared view is
   * ready, the project has a description, the link is not the owner's own and it has not been
   * offered yet.
   *
   * @param {boolean} own The link is the person's own published project.
   * @returns {boolean} Whether the popup opened.
   */
  function offerAbout(own) {
    if (phase.value !== 'ready' || aboutOffered) return false
    aboutOffered = true
    if (own || description.value.trim() === '') return false
    aboutOpen.value = true
    return true
  }

  /** The header's **About** button: show the description again. */
  function openAbout() {
    if (phase.value === 'ready' && description.value.trim() !== '') aboutOpen.value = true
  }

  /** **View the model** / Esc: dismiss the popup. */
  function closeAbout() {
    aboutOpen.value = false
  }

  /** **File ▾ → Share…**: open the sender's Share sheet, as the header's Share button does. */
  function requestSheet() {
    sheetRequests.value += 1
  }

  /** **Start WarpCad** on the incomplete screen: the editor, with whatever the browser holds. */
  function start() {
    leave()
  }

  return {
    phase,
    reason,
    name,
    note,
    description,
    aboutOpen,
    offerAbout,
    openAbout,
    closeAbout,
    status,
    revision,
    sheetRequests,
    requestSheet,
    begin,
    show,
    fail,
    leave,
    makeCopy,
    saveFile,
    start,
  }
})

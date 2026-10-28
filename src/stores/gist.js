// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * GitHub gists, as the UI sees them (`TODO/io-017`, Stage 2): the gist credential, what a
 * publish is doing, and what a `#/gist/<id>` link turned out to be. UI state and orchestration
 * only, the split `stores/hosted.js` uses: the client is `src/storage/gistBackend.js`, the
 * credential boundary `src/storage/tokenStorage.js`, the wording `src/core/gistMessages.js`.
 * **The gist a project is published as lives in the document** (`document.js`'s `gist`,
 * `src/core/gistField.js`), never here, so it survives a reload and a Download copy.
 *
 * ## The credential, `hosted.js`'s rules on a second key
 *
 * - Stored under its own key, `GIST_CREDENTIAL_KEY` (`'github-gist'`), never the repository
 *   token's: a person may hold both, and each must be revocable on its own.
 * - `connect(token)` validates with GitHub's write probe **before** storing anything
 *   (`validateGistToken`); a token the browser will not store is not reported as connected.
 * - `disconnect()` **really deletes** the stored record, and forgets the token in memory.
 * - **The token is never on this store**: it lives in a non-reactive closure variable and is
 *   handed to the client per call ({@link authorized}). Not in `$state`, not in a getter, not in
 *   anything returned — so not in dev-tools, a Pinia plugin or an error report.
 * - `start()` restores a stored connection **without touching the network**.
 *
 * ## The link state (`#/gist/<id>`)
 *
 * `composables/useShareLink.js` reads the link and drives the **Shared view** (`stores/share.js`)
 * exactly as for a `#/share/v1/` link. What `share.js` cannot say is here: the gist-specific
 * reason a link failed (for the full-screen message), the gist's description, and whether the
 * link is the **owner's own** (`own-link`: the gist id equals the open or restored project's), in
 * which case the screen offers {@link openOwnToEdit} and {@link makeOwnCopy} instead of a
 * read-only copy.
 *
 * @module stores/gist
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { isGitHubLogin } from '../core/gistLink.js'
import { BROADER_THAN_NEEDED_MESSAGE, gistFailureOf, gistMessage } from '../core/gistMessages.js'
import { serializeNdjson } from '../core/ndjson.js'
import { createProjectId } from '../core/replica.js'
import { withProjectId } from '../core/shareCopy.js'
import * as gistClient from '../storage/gistBackend.js'
import { isWellFormedToken } from '../storage/hostedBackend.js'
import { GIST_CREDENTIAL_KEY, createCredentialStore } from '../storage/tokenStorage.js'
import { useFileMenuStore } from './fileMenu.js'
import { usePersistenceStore } from './persistence.js'
import { useShareStore } from './share.js'

/** @typedef {import('../core/gistMessages.js').GistMessageKind} GistMessageKind */
/** @typedef {import('../core/gistMessages.js').GistFailure} GistFailure */

/**
 * The gist client calls this store uses — `gistBackend.js`'s, replaced in tests.
 *
 * @typedef {object} GistBackend
 * @property {typeof gistClient.validateGistToken} validateGistToken
 * @property {typeof gistClient.createGist} createGist
 * @property {typeof gistClient.updateGist} updateGist
 * @property {typeof gistClient.deleteGist} deleteGist
 * @property {typeof gistClient.readGist} readGist
 */

/**
 * @typedef {object} GistDependencies
 * @property {GistBackend} backend
 * @property {import('../storage/tokenStorage.js').CredentialStore} credentials
 */

/**
 * The calls that need the token, with the token bound in. What {@link authorized} hands out:
 * a caller passes everything but the token, and cannot pass another one.
 *
 * @typedef {object} AuthorizedGistClient
 * @property {(options: Omit<Parameters<typeof gistClient.createGist>[0], 'token' | 'fetch'>) => ReturnType<typeof gistClient.createGist>} createGist
 * @property {(options: Omit<Parameters<typeof gistClient.updateGist>[0], 'token' | 'fetch'>) => ReturnType<typeof gistClient.updateGist>} updateGist
 * @property {(options: Omit<Parameters<typeof gistClient.deleteGist>[0], 'token' | 'fetch'>) => ReturnType<typeof gistClient.deleteGist>} deleteGist
 */

/**
 * `off` — no gist link; `opening` — being read; `shown` — the read-only Shared view;
 * `own-link` — the owner's own gist (offer Open it to edit / Make a copy); `failed` — the
 * full-screen message ({@link linkReason}, {@link linkMessage}).
 *
 * @typedef {'off' | 'opening' | 'shown' | 'own-link' | 'failed'} GistLinkPhase
 */

/** `idle`, or which of the three owner actions is talking to GitHub. @typedef {'idle' | 'publishing' | 'updating' | 'stopping'} GistPublishState */

/** @type {GistDependencies | null} */
let dependencies = null

/**
 * Replace the gist boundary — for tests, which must never reach a real network, a real token or
 * a real IndexedDB. Pass `null` to go back to the real ones.
 *
 * @param {GistDependencies | null} next
 */
export function setGistDependencies(next) {
  dependencies = next
}

/** @returns {GistDependencies} */
function resolveDependencies() {
  dependencies ??= {
    backend: {
      validateGistToken: gistClient.validateGistToken,
      createGist: gistClient.createGist,
      updateGist: gistClient.updateGist,
      deleteGist: gistClient.deleteGist,
      readGist: gistClient.readGist,
    },
    credentials: createCredentialStore(),
  }
  return dependencies
}

/** @param {unknown} value @returns {'classic' | 'fine-grained' | null} */
const tokenKindOf = (value) => (value === 'classic' || value === 'fine-grained' ? value : null)

export const useGistStore = defineStore('gist', () => {
  const deps = resolveDependencies()
  const share = useShareStore()

  /**
   * The credential. **Closure-scoped, non-reactive, never returned** — see the module note.
   */
  let token = ''

  /** The connected GitHub account, `''` when not connected. */
  const login = ref('')
  /** @type {import('vue').Ref<'classic' | 'fine-grained' | null>} */
  const tokenKind = ref(null)
  /** When the token expires (ISO), when GitHub said. @type {import('vue').Ref<string | null>} */
  const expiresAt = ref(null)
  /** A classic token with scopes beyond `gist`: allowed, with {@link BROADER_THAN_NEEDED_MESSAGE}. */
  const broaderThanNeeded = ref(false)
  const connected = computed(() => login.value !== '')

  /** @type {import('vue').Ref<GistPublishState>} */
  const publishState = ref('idle')
  /** The last owner action's failure, `''` after a success. @type {import('vue').Ref<GistMessageKind | ''>} */
  const lastErrorKind = ref('')
  const lastErrorMessage = ref('')
  /** A publish that succeeded with a caveat: `readme` (the README patch failed), `project-changed`. */
  const lastWarning = ref('')
  /** When the last publish or update succeeded (ms since the epoch), for the Published chip. @type {import('vue').Ref<number | null>} */
  const lastPublishedAt = ref(null)

  /** @type {import('vue').Ref<GistLinkPhase>} */
  const linkPhase = ref('off')
  /** Why a gist link failed, `''` otherwise. @type {import('vue').Ref<GistMessageKind | ''>} */
  const linkReason = ref('')
  /** The full-screen sentence for {@link linkReason}. */
  const linkMessage = ref('')
  /** The gist's description, plain text and capped (`plainGistDescription`). */
  const linkDescription = ref('')
  /** The link's gist id, `''` when none or invalid. */
  const linkId = ref('')

  /**
   * The gist's project as read, for the owner's two actions. Plain and non-reactive: records can
   * be large (`CLAUDE.md`, Performance).
   *
   * @type {{ text: string, records: object[], name: string } | null}
   */
  let linkProject = null
  let linkGeneration = 0

  /** Revisions this session wrote, by gist id — see {@link wroteRevision}. @type {Map<string, Set<string>>} */
  const written = new Map()

  let started = false
  /** @type {Promise<void> | null} */
  let startPromise = null

  /** @param {Record<string, any> | null} record */
  function adopt(record) {
    if (record === null || !isWellFormedToken(record.token) || !isGitHubLogin(record.login)) return false
    token = record.token
    login.value = record.login
    tokenKind.value = tokenKindOf(record.tokenKind)
    expiresAt.value = typeof record.expiresAt === 'string' ? record.expiresAt : null
    broaderThanNeeded.value = record.broaderThanNeeded === true
    return true
  }

  function forget() {
    token = ''
    login.value = ''
    tokenKind.value = null
    expiresAt.value = null
    broaderThanNeeded.value = false
  }

  /**
   * Restore a stored connection. No network. Idempotent: every caller awaits the same read.
   *
   * @returns {Promise<void>}
   */
  function start() {
    if (started && startPromise !== null) return startPromise
    started = true
    startPromise = (async () => {
      const record = await deps.credentials.read(GIST_CREDENTIAL_KEY)
      // A connect that finished while this read was in flight wins.
      if (token === '') adopt(record)
    })()
    return startPromise
  }

  /**
   * Validate a token with GitHub and, only if it can write gists, store it.
   *
   * @param {string} candidate The pasted token; surrounding whitespace is dropped.
   * @returns {Promise<{ ok: true, login: string, tokenKind: 'classic' | 'fine-grained', expiresAt: string | null,
   *   broaderThanNeeded: boolean, warning: string } | GistFailure>} `warning` is
   *   {@link BROADER_THAN_NEEDED_MESSAGE} for a classic token with more than `gist`, else `''`.
   */
  async function connect(candidate) {
    const trimmed = typeof candidate === 'string' ? candidate.trim() : ''
    /** @type {import('../storage/gistBackend.js').GistTokenInfo} */
    let info
    try {
      info = await deps.backend.validateGistToken({ token: trimmed })
    } catch (error) {
      const failure = gistFailureOf(error, 'connect')
      lastErrorKind.value = failure.kind
      lastErrorMessage.value = failure.message
      return failure
    }
    try {
      await deps.credentials.write(GIST_CREDENTIAL_KEY, {
        token: trimmed,
        login: info.login,
        tokenKind: info.tokenKind,
        expiresAt: info.expiresAt,
        broaderThanNeeded: info.broaderThanNeeded,
      })
    } catch {
      /** @type {GistFailure} */
      const failure = { ok: false, kind: 'storage', message: gistMessage('storage', 'connect') }
      lastErrorKind.value = failure.kind
      lastErrorMessage.value = failure.message
      return failure
    }
    started = true
    startPromise ??= Promise.resolve()
    adopt({ token: trimmed, ...info })
    lastErrorKind.value = ''
    lastErrorMessage.value = ''
    return {
      ok: true,
      login: info.login,
      tokenKind: info.tokenKind,
      expiresAt: info.expiresAt,
      broaderThanNeeded: info.broaderThanNeeded,
      warning: info.broaderThanNeeded ? BROADER_THAN_NEEDED_MESSAGE : '',
    }
  }

  /** Forget the gist credential everywhere: memory and IndexedDB. The repository token is untouched. */
  async function disconnect() {
    forget()
    lastErrorKind.value = ''
    lastErrorMessage.value = ''
    await deps.credentials.clear(GIST_CREDENTIAL_KEY)
  }

  /**
   * The three calls that need the token, bound to it — or `null` when not connected.
   *
   * @returns {AuthorizedGistClient | null}
   */
  function authorized() {
    if (token === '') return null
    const backend = deps.backend
    // Read at call time, so a Disconnect between handing this out and using it is honoured.
    const current = () => {
      if (token === '') throw new gistClient.GistError('unauthorized', 'Not connected')
      return token
    }
    return {
      createGist: ({ files, description, public: isPublic }) =>
        backend.createGist({ token: current(), files, ...(description === undefined ? {} : { description }), public: isPublic }),
      updateGist: ({ id, files, description }) =>
        backend.updateGist({ token: current(), id, files, ...(description === undefined ? {} : { description }) }),
      deleteGist: ({ id }) => backend.deleteGist({ token: current(), id }),
    }
  }

  /**
   * Read a gist's project file, unauthenticated (no token, no account).
   *
   * @param {string} id
   * @returns {ReturnType<typeof gistClient.readGist>}
   */
  function readGist(id) {
    return deps.backend.readGist({ id })
  }

  /**
   * Note a revision this session wrote to a gist.
   *
   * @param {string} id
   * @param {string} revision
   */
  function rememberRevision(id, revision) {
    let set = written.get(id)
    if (set === undefined) {
      set = new Set()
      written.set(id, set)
    }
    set.add(revision)
  }

  /**
   * Whether this session wrote `revision` to gist `id`. GitHub serves an unauthenticated read up
   * to 60 s old (`docs/decisions/gist-storage.md`), so right after a publish the read can show the
   * create's revision instead of the README patch's. A gist's history only moves forward, so a
   * revision this session wrote is never someone else's change.
   *
   * @param {string} id
   * @param {string | null} revision
   * @returns {boolean}
   */
  function wroteRevision(id, revision) {
    return revision !== null && (written.get(id)?.has(revision) ?? false)
  }

  /** @param {GistPublishState} state */
  function setPublishState(state) {
    publishState.value = state
  }

  /**
   * Record the outcome of an owner action for the sheet: a failure's kind and sentence, or a
   * success (clears them, and sets {@link lastPublishedAt} when `publishedAt` is given).
   *
   * @param {{ ok: true, publishedAt?: number | null, warning?: string } | GistFailure} outcome
   */
  function noteOutcome(outcome) {
    if (outcome.ok) {
      lastErrorKind.value = ''
      lastErrorMessage.value = ''
      lastWarning.value = outcome.warning ?? ''
      if (outcome.publishedAt !== undefined) lastPublishedAt.value = outcome.publishedAt
    } else {
      lastErrorKind.value = outcome.kind
      lastErrorMessage.value = outcome.message
      lastWarning.value = ''
    }
  }

  /* -------------------------------------------------------------- the link */

  function resetLink() {
    linkProject = null
    linkPhase.value = 'off'
    linkReason.value = ''
    linkMessage.value = ''
    linkDescription.value = ''
    linkId.value = ''
  }

  // Every way out of the Shared view (Start WarpCad, a copy, a leave) ends the link's state too.
  watch(
    () => share.phase,
    (phase) => {
      if (phase === 'off') resetLink()
    },
    { flush: 'sync' },
  )

  /**
   * A gist link is being opened.
   *
   * @param {string | null} id The parsed id, or `null` for a link with no valid id.
   * @returns {number} This read's generation, for {@link showLink} / {@link failLink}.
   */
  function beginLink(id) {
    linkGeneration += 1
    resetLink()
    linkPhase.value = 'opening'
    linkId.value = id ?? ''
    return linkGeneration
  }

  /**
   * The gist is on screen through the Shared view.
   *
   * @param {number} generation
   * @param {{ description: string, own: boolean, text: string, records: object[], name: string }} shown
   * @returns {boolean} Whether this read is still current.
   */
  function showLink(generation, shown) {
    if (generation !== linkGeneration) return false
    linkProject = { text: shown.text, records: shown.records, name: shown.name }
    linkDescription.value = shown.description
    linkPhase.value = shown.own ? 'own-link' : 'shown'
    return true
  }

  /**
   * @param {number} generation
   * @param {GistMessageKind} reason
   */
  function failLink(generation, reason) {
    if (generation !== linkGeneration) return
    linkProject = null
    linkPhase.value = 'failed'
    linkReason.value = reason
    linkMessage.value = gistMessage(reason, 'open')
  }

  /**
   * **Open it to edit** — the owner's own link: stay in the current project and merge the gist's
   * copy in through `mergeIn` (`persistence.mergeText`, with its Undo-merge toast), after leaving
   * the Shared view so autosave resumes and the merge is the change that saves.
   *
   * @returns {Promise<import('./merge.js').MergeResult | { ok: false, message: string } | null>}
   *   The merge's result; `null` when there is no own link on screen.
   */
  async function openOwnToEdit() {
    if (linkPhase.value !== 'own-link' || linkProject === null) return null
    const { text, name } = linkProject
    share.leave()
    return usePersistenceStore().mergeText(text, name)
  }

  /**
   * **Make a copy** — the owner's own link, as a separate new project: the File menu's open flow
   * with the existing **Replace the project?** question (never Merge: the copy is a new project
   * with a new id and no gist).
   */
  function makeOwnCopy() {
    if (linkPhase.value !== 'own-link' || linkProject === null) return
    const { records, text, name } = linkProject
    useFileMenuStore().requestOpenShared({
      name,
      copyText: serializeNdjson(withProjectId(records, createProjectId())),
      theirText: text,
      projectId: null,
      leave: () => share.leave(),
    })
  }

  return {
    login,
    tokenKind,
    expiresAt,
    broaderThanNeeded,
    connected,
    publishState,
    lastErrorKind,
    lastErrorMessage,
    lastWarning,
    lastPublishedAt,
    linkPhase,
    linkReason,
    linkMessage,
    linkDescription,
    linkId,
    start,
    connect,
    disconnect,
    authorized,
    readGist,
    rememberRevision,
    wroteRevision,
    setPublishState,
    noteOutcome,
    beginLink,
    showLink,
    failLink,
    openOwnToEdit,
    makeOwnCopy,
  }
})

/**
 * Hosted storage, as the UI sees it (`TODO/io-002`): a connection to one file in
 * one git repository, explicit Save/Load against it, and the opt-in auto-push
 * scheduler — joined to the document store and turned into one status surface.
 *
 * UI state and orchestration only, the same split `stores/persistence.js` uses
 * for the local half. The mechanisms are framework-free and live in
 * `src/storage/`: `hostedBackend.js` (the API client, origin allowlist, error
 * normalisation, sha-based conflict detection), `tokenStorage.js` (the credential
 * boundary) and `autoPush.js` (the debounce/max-wait/backoff state machine).
 * `src/core/project.js` still owns what the bytes are — **the hosted file is the
 * same bytes as the local project file**, trailing project-state line and all, so
 * a file saved here opens there and the reverse.
 *
 * ## What `ui-033` calls
 *
 * - `start()` — restore a stored connection at boot. Idempotent.
 * - `connect({ token, owner, repo, path })` — validates against the host **before**
 *   storing anything; `{ ok: true, exists }` or `{ ok: false, message }`.
 *   `exists: false` is the ordinary "no project file yet" state, not an error.
 * - `disconnect()` — deletes the stored credential, forgets the token, auto-push off.
 * - `saveToRemote()` / `loadFromRemote()` — the explicit `Save to owner/repo` and
 *   `Load from owner/repo` items. Load replaces the document through the same
 *   validated `parseProject` → `documentStore.load` path as `Open…`.
 * - `setAutoPush(on)` — the checkable `Auto-push` menu item. Turning it on pushes once.
 * - `resolveConflict('overwrite' | 'load' | 'cancel')` — the three buttons of the
 *   `hosted-conflict` modal.
 * - `setUiBusy(busy)` — tell this store a drag or another popover is in progress, so
 *   a conflict dialog is **deferred** rather than landing under a finger (§11 rule 5).
 * - Getters: `connected`, `repoLabel`, `autoPushEnabled`, `autoPushLabel`, `dotState`
 *   (`none` | `in-sync` | `pending` | `pushing` | `paused` | `failed` — shape-coded on
 *   the File button), `statusText` (the chip), `errorMessage`, `conflict`,
 *   `conflictOpen`.
 *
 * **The token is never on this store.** It lives in a module-local, non-reactive
 * variable and is handed to the client per call; it is not in `$state`, not in a
 * getter, and not in anything a dev-tools panel or an error report can serialise.
 * After Connect it is never shown again — `Replace token` re-enters it.
 *
 * **Ctrl/Cmd+S never reaches the network**: it calls `persistence.saveFile()`, which
 * has no path into this store. The only writers here are the two explicit menu items
 * and the scheduler.
 *
 * @module stores/hosted
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { serializeProject } from '../core/project.js'
import { createAutoPusher } from '../storage/autoPush.js'
import {
  DEFAULT_HOSTED_PATH,
  EXPLICIT_COMMIT_MESSAGE,
  HostedError,
  autoPushCommitMessage,
  createHostedClient,
  validateConnection,
} from '../storage/hostedBackend.js'
import { HOSTED_CREDENTIAL_KEY, createCredentialStore } from '../storage/tokenStorage.js'
import { useDocumentStore } from './document.js'
import { usePersistenceStore } from './persistence.js'

/** How long a success notice stays before the chip falls back to the resting text. */
const NOTICE_MS = 4000

/**
 * @typedef {object} HostedDependencies
 * @property {import('../storage/hostedBackend.js').HostedClient} client
 * @property {import('../storage/tokenStorage.js').CredentialStore} credentials
 */

/** @type {HostedDependencies | null} */
let dependencies = null

/**
 * Replace the hosted boundary — for tests, which must never reach a real network
 * or a real IndexedDB. Pass `null` to go back to the real ones.
 *
 * @param {HostedDependencies | null} next
 */
export function setHostedDependencies(next) {
  dependencies = next
}

/** @returns {HostedDependencies} */
function resolveDependencies() {
  dependencies ??= { client: createHostedClient(), credentials: createCredentialStore() }
  return dependencies
}

/**
 * FNV-1a over the project text — "is the local copy ahead of what we last
 * pushed?" needs an equality check, not a cryptographic digest, and storing the
 * whole pushed text next to the autosave would double the storage for nothing.
 *
 * @param {string} text
 * @returns {string}
 */
function hashOf(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16)
}

/**
 * @param {number} epochMs
 * @returns {string} Local `HH:MM`, 24 h — deterministic across locales, like the chip's.
 */
function clock(epochMs) {
  const date = new Date(epochMs)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * @param {unknown} error
 * @returns {string} Never a credential: `HostedError` messages are the client's own wording.
 */
function reasonOf(error) {
  if (error instanceof HostedError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

export const useHostedStore = defineStore('hosted', () => {
  const documentStore = useDocumentStore()
  const persistence = usePersistenceStore()
  const deps = resolveDependencies()

  /**
   * The credential. **Module-scope, non-reactive, never returned** — see the
   * module note. A `ref` here would put it in `$state`, and from there into
   * dev-tools, a Pinia plugin, or a serialised error report.
   */
  let token = ''

  /** @type {import('vue').Ref<{ owner: string, repo: string, path: string } | null>} */
  const repository = ref(null)
  /** The blob sha this session last read or wrote — the whole conflict mechanism. */
  const lastSha = ref(/** @type {string | null} */ (null))
  /** Hash of the project text last successfully pushed. */
  const pushedHash = ref('')
  const autoPushEnabled = ref(false)
  /** @type {import('vue').Ref<import('../storage/autoPush.js').AutoPushState>} */
  const pushState = ref('off')
  const pushMessage = ref('')
  /** @type {import('vue').Ref<{ message: string } | null>} */
  const conflict = ref(null)
  const uiBusy = ref(false)
  /**
   * The repository copy is known to have moved on and this session has not resolved
   * it. Distinct from `conflict` (the *dialog*): dismissing the dialog with Cancel
   * does not make the divergence go away, and §11's Q12 is explicit that with
   * auto-push off "the dot still reports … a `!` when the repository copy is known to
   * have changed". Reported as `in-sync` instead would be a quiet lie.
   */
  const divergent = ref(false)
  const errorMessage = ref('')
  const notice = ref('')
  const explicitState = ref(/** @type {'idle' | 'busy'} */ ('idle'))

  /** @type {ReturnType<typeof setTimeout> | null} */
  let noticeTimer = null
  let started = false
  let startPromise = /** @type {Promise<void> | null} */ (null)
  /** @type {(() => void) | null} */
  let stopWatch = null
  /** A document change this store caused itself (a Load) is not something to push back. */
  let suppressNextMutation = false
  /**
   * Has this session actually seen the repository's copy — loaded it, or written
   * the copy that is there now? Connecting to a repository that **already has a
   * project file** leaves this `false`, and §11's rule applies: "the first-ever
   * Save when the remote file already exists and this session has no `sha` for it
   * goes down the **same** conflict path, so connecting never silently overwrites
   * or silently pulls." A fresh sha read at Connect would otherwise make that
   * overwrite succeed — this flag is what stops it.
   */
  let adopted = false

  /** @param {string} text */
  function showNotice(text) {
    if (noticeTimer !== null) clearTimeout(noticeTimer)
    notice.value = text
    noticeTimer = setTimeout(() => {
      notice.value = ''
      noticeTimer = null
    }, NOTICE_MS)
  }

  /** @returns {import('../storage/hostedBackend.js').HostedConnection} */
  function connection() {
    const repo = repository.value
    if (repo === null || token === '') throw new HostedError('invalid', 'No repository is connected')
    return { token, ...repo }
  }

  /** The current document as project bytes — identical to what Save/autosave write. */
  function projectText() {
    return serializeProject(documentStore.raw)
  }

  /** Persist the connection (including the token) at the credential boundary. */
  async function persistConnection() {
    const repo = repository.value
    if (repo === null) return
    await deps.credentials.write(HOSTED_CREDENTIAL_KEY, {
      token,
      ...repo,
      autoPush: autoPushEnabled.value,
      sha: lastSha.value,
      pushedHash: pushedHash.value,
      adopted,
    })
  }

  /**
   * One push. Shared by the explicit item and the scheduler so there is exactly
   * one place that writes, and therefore one place that can conflict.
   *
   * @param {{ message: string }} options
   * @returns {Promise<{ sha: string }>}
   */
  async function writeOnce({ message }) {
    if (!adopted) {
      // Refused locally rather than by a deliberately-stale PUT: the answer is the
      // same (ask the user) and this costs the repository no failed request.
      throw new HostedError(
        'conflict',
        `${repoLabel.value} already has a project file that this session has not loaded`,
      )
    }
    const text = projectText()
    const result = await deps.client.write(connection(), { text, sha: lastSha.value, message })
    lastSha.value = result.sha
    pushedHash.value = hashOf(text)
    adopted = true
    divergent.value = false
    await persistConnection().catch(() => {
      /* the write landed; a failed bookkeeping save is not worth failing it for */
    })
    return result
  }

  const pusher = createAutoPusher({
    async push({ reason }) {
      await writeOnce({
        message: reason === 'auto' ? autoPushCommitMessage(Date.now()) : EXPLICIT_COMMIT_MESSAGE,
      })
    },
    onStatus(status) {
      pushState.value = status.state
      pushMessage.value = status.message
      if (status.conflict) divergent.value = true
      conflict.value = status.conflict ? { message: status.message } : null
      if (status.state === 'failed') {
        errorMessage.value = status.message
      } else if (status.state === 'in-sync') {
        errorMessage.value = ''
        showNotice(`Pushed · ${clock(Date.now())}`)
      }
    },
  })

  const connected = computed(() => repository.value !== null)
  const repoLabel = computed(() =>
    repository.value === null ? '' : `${repository.value.owner}/${repository.value.repo}`,
  )

  /**
   * The File-button dot, shape-coded (§11 rule 4). With auto-push off it still
   * reports the explicit actions' outcome.
   */
  const dotState = computed(() => {
    if (!connected.value) return 'none'
    if (explicitState.value === 'busy') return 'pushing'
    if (pushState.value !== 'off') return pushState.value
    if (errorMessage.value) return 'failed'
    return conflict.value !== null || divergent.value ? 'paused' : 'in-sync'
  })

  const statusText = computed(() => {
    if (errorMessage.value) return errorMessage.value
    if (!connected.value) return ''
    if (explicitState.value === 'busy' || pushState.value === 'pushing') {
      return `Pushing to ${repoLabel.value}…`
    }
    // A paused state outranks a transient success notice, always. Letting
    // "Connected…" or "Pushed · 14:05" sit on top of "Offline — will retry" would
    // reassure the user while the repository is quietly falling behind — the exact
    // shape of failure `CLAUDE.md`'s Verification section exists to stop.
    if ((pushState.value === 'paused' || pushState.value === 'failed') && pushMessage.value) {
      return pushMessage.value
    }
    if (divergent.value) return `${repoLabel.value} changed — Save to or Load from it to resolve`
    if (notice.value) return notice.value
    if (pushState.value === 'pending') return 'Auto-push pending'
    if (pushMessage.value) return pushMessage.value
    return `Connected to ${repoLabel.value}`
  })

  const autoPushLabel = computed(() => {
    if (!autoPushEnabled.value) return 'Auto-push — pushes now and after each burst of edits'
    // `divergent`, not `conflict`: Cancel closes the dialog (`conflict` → null) but leaves the
    // repository diverged and auto-push paused, and §11 rule 5 says the item keeps reading
    // "repository changed" — "will retry" would promise a retry that is not going to happen.
    if (pushState.value === 'paused' && divergent.value) return 'Auto-push paused — repository changed'
    if (pushState.value === 'paused') return 'Auto-push paused — will retry'
    if (pushState.value === 'failed') return 'Auto-push stopped — see the error'
    return 'Auto-push on'
  })

  // Deferred until no drag is in progress and no other popover is open, so the
  // modal never lands under a finger mid-gizmo-drag (§11 rule 5).
  const conflictOpen = computed(() => conflict.value !== null && !uiBusy.value)

  /**
   * A conflict is the one failure that must never be turned into an overwrite.
   *
   * @param {string} message
   */
  function raiseConflict(message) {
    conflict.value = { message }
    divergent.value = true
    errorMessage.value = ''
  }

  /**
   * Validate a candidate connection against the host and, only if it answers,
   * store it. Order matters: a token that is never going to work must not be
   * written to disk first.
   *
   * @param {{ token: string, owner: string, repo: string, path?: string }} form
   * @returns {Promise<{ ok: true, exists: boolean } | { ok: false, message: string }>}
   */
  async function connect(form) {
    try {
      // Checked here as well as inside the client: the Connect form should say
      // "that is not a repository name" without spending a network round-trip, and
      // a malformed field must never reach a request even through a stubbed client.
      const candidate = validateConnection({
        token: form.token,
        owner: form.owner,
        repo: form.repo,
        path: form.path ?? DEFAULT_HOSTED_PATH,
      })
      const probe = await deps.client.read(candidate)
      token = candidate.token
      repository.value = { owner: candidate.owner, repo: candidate.repo, path: candidate.path }
      lastSha.value = probe.sha
      // A repository whose file this session has never read must not be silently
      // overwritten by the first Save: leaving `pushedHash` empty is what makes the
      // first-Save-into-an-existing-file go down the conflict path if it has moved on.
      pushedHash.value = probe.exists ? '' : hashOf('')
      // Nothing there yet → nothing to overwrite, so the first Save may just write.
      adopted = !probe.exists
      autoPushEnabled.value = false // off for every new connection
      divergent.value = false
      pushState.value = 'off'
      pushMessage.value = ''
      conflict.value = null
      errorMessage.value = ''
      await persistConnection()
      subscribe()
      showNotice(
        probe.exists
          ? `Connected to ${repoLabel.value}`
          : `No project file yet — the first Save to ${repoLabel.value} will create it`,
      )
      return { ok: true, exists: probe.exists }
    } catch (error) {
      // Nothing is stored, nothing is connected: the form stays open with a reason.
      const message = reasonOf(error)
      errorMessage.value = message
      return { ok: false, message }
    }
  }

  /** Forget the connection everywhere: memory, IndexedDB, and the scheduler. */
  async function disconnect() {
    pusher.disable()
    token = ''
    repository.value = null
    lastSha.value = null
    pushedHash.value = ''
    adopted = false
    divergent.value = false
    autoPushEnabled.value = false
    pushState.value = 'off'
    pushMessage.value = ''
    conflict.value = null
    errorMessage.value = ''
    await deps.credentials.clear(HOSTED_CREDENTIAL_KEY)
  }

  /**
   * `Save to owner/repo`. A conflict raises the dialog; it never forces.
   *
   * @returns {Promise<{ ok: true } | { ok: false, message: string, conflict?: true }>}
   */
  async function saveToRemote() {
    if (!connected.value) return { ok: false, message: 'No repository is connected' }
    explicitState.value = 'busy'
    try {
      await writeOnce({ message: EXPLICIT_COMMIT_MESSAGE })
      errorMessage.value = ''
      conflict.value = null
      showNotice(`Saved to ${repoLabel.value} · ${clock(Date.now())}`)
      if (autoPushEnabled.value) await pusher.resume()
      return { ok: true }
    } catch (error) {
      const message = reasonOf(error)
      if (error instanceof HostedError && error.kind === 'conflict') {
        raiseConflict(message)
        return { ok: false, message, conflict: true }
      }
      errorMessage.value = message
      return { ok: false, message }
    } finally {
      explicitState.value = 'idle'
    }
  }

  /**
   * `Load from owner/repo`. Goes through `persistence.openText`, which is the
   * same fully-validated `parseProject` → `documentStore.load` path as `Open…`:
   * a bad remote file is refused **by name** and the current project is untouched.
   *
   * @returns {Promise<{ ok: true, steps: number } | { ok: false, message: string }>}
   */
  async function loadFromRemote() {
    if (!connected.value) return { ok: false, message: 'No repository is connected' }
    explicitState.value = 'busy'
    try {
      const remote = await deps.client.read(connection())
      if (!remote.exists) {
        const message = `There is no ${repository.value?.path} in ${repoLabel.value} yet`
        errorMessage.value = message
        return { ok: false, message }
      }
      suppressNextMutation = true
      const opened = await persistence.openText(remote.text ?? '', repoLabel.value)
      if (!opened.ok) {
        suppressNextMutation = false
        errorMessage.value = `Couldn't load ${repoLabel.value}: ${opened.message}`
        return { ok: false, message: opened.message }
      }
      lastSha.value = remote.sha
      pushedHash.value = hashOf(remote.text ?? '')
      adopted = true
      divergent.value = false
      errorMessage.value = ''
      conflict.value = null
      await persistConnection().catch(() => {})
      if (autoPushEnabled.value) await pusher.resume()
      return { ok: true, steps: opened.steps }
    } catch (error) {
      const message = reasonOf(error)
      errorMessage.value = message
      return { ok: false, message }
    } finally {
      explicitState.value = 'idle'
    }
  }

  /**
   * The three buttons of the conflict modal. **No automatic merge, ever**
   * (`docs/decisions/document-sync.md`).
   *
   * @param {'overwrite' | 'load' | 'cancel'} choice
   */
  async function resolveConflict(choice) {
    if (choice === 'cancel') {
      // Paused, not off: the user resolves it with an explicit Save, a Load, or by
      // toggling Auto-push off and on.
      conflict.value = null
      pusher.dismissConflict()
      return { ok: true }
    }
    if (choice === 'load') {
      conflict.value = null
      const loaded = await loadFromRemote()
      if (loaded.ok && autoPushEnabled.value) await pusher.resume()
      return loaded
    }
    // Overwrite: take the repository's *current* sha, then write over it deliberately.
    conflict.value = null
    try {
      const current = await deps.client.read(connection())
      lastSha.value = current.sha
      // The user has been shown what is at stake and chose to overwrite it.
      adopted = true
    } catch (error) {
      const message = reasonOf(error)
      errorMessage.value = message
      return { ok: false, message }
    }
    const saved = await saveToRemote()
    if (saved.ok && autoPushEnabled.value) await pusher.resume()
    return saved
  }

  /**
   * The checkable `Auto-push` menu item. Turning it on pushes once immediately —
   * "it is never on silently".
   *
   * @param {boolean} on
   */
  async function setAutoPush(on) {
    if (!connected.value) return
    autoPushEnabled.value = on
    if (on) {
      await pusher.enable()
    } else {
      pusher.disable()
    }
    await persistConnection().catch(() => {})
  }

  /** @param {boolean} busy A drag is in progress, or another popover/dialog is open. */
  function setUiBusy(busy) {
    uiBusy.value = busy
  }

  function dismissError() {
    errorMessage.value = ''
  }

  /** Watch committed document versions. Preview stores are separate and never bump this. */
  function subscribe() {
    if (stopWatch !== null) return
    stopWatch = watch(
      () => documentStore.version,
      () => {
        if (suppressNextMutation) {
          suppressNextMutation = false
          return
        }
        pusher.notifyMutation()
      },
    )
  }

  /** Restore a stored connection. Idempotent — safe from a component that mounts twice. */
  function start() {
    if (!started) {
      started = true
      startPromise = (async () => {
        const stored = await deps.credentials.read(HOSTED_CREDENTIAL_KEY)
        if (stored !== null && typeof stored.token === 'string' && typeof stored.owner === 'string') {
          token = stored.token
          repository.value = {
            owner: stored.owner,
            repo: stored.repo,
            path: stored.path ?? DEFAULT_HOSTED_PATH,
          }
          lastSha.value = stored.sha ?? null
          pushedHash.value = stored.pushedHash ?? ''
          adopted = stored.adopted === true
          autoPushEnabled.value = stored.autoPush === true
        }
        subscribe()
        if (autoPushEnabled.value) {
          // On reload: if the restored document is ahead of what was last pushed,
          // schedule **one** push as if an edit had just happened — no immediate
          // flush, and nothing at all when the two match (§11 rule 3).
          pusher.restore({ pending: hashOf(projectText()) !== pushedHash.value })
        }
      })()
    }
    return /** @type {Promise<void>} */ (startPromise)
  }

  /** Stop listening. Tests, and HMR teardown. */
  function stop() {
    stopWatch?.()
    stopWatch = null
    pusher.dispose()
    if (noticeTimer !== null) clearTimeout(noticeTimer)
    noticeTimer = null
    started = false
    startPromise = null
  }

  return {
    // state a panel may read (never the token)
    repository,
    lastSha,
    autoPushEnabled,
    pushState,
    conflict,
    divergent,
    errorMessage,
    notice,
    // getters
    connected,
    repoLabel,
    dotState,
    statusText,
    autoPushLabel,
    conflictOpen,
    // actions
    start,
    stop,
    connect,
    disconnect,
    saveToRemote,
    loadFromRemote,
    resolveConflict,
    setAutoPush,
    setUiBusy,
    dismissError,
  }
})

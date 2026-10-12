// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives hand-written duck-typed fakes of the hosted client and the credential
// store; the modules under test are fully typed and checked by `npm run typecheck`.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { parseProject, serializeProject } from '../core/project.js'
import { HostedError } from '../storage/hostedBackend.js'
import { DEBOUNCE_MS } from '../storage/autoPush.js'
import { useDocumentStore } from './document.js'
import { setHostedDependencies, useHostedStore } from './hosted.js'
import { setPersistenceDependencies, usePersistenceStore } from './persistence.js'

/**
 * `TODO/io-002` — the store `ui-033` will call. Everything at the boundary is
 * faked (`CLAUDE.md`: mock at the boundary, never a real network); the real
 * document store, the real `project.js` and the real scheduler are used, because
 * "the hosted file is the same bytes as the local one" and "a bad remote file is
 * refused without touching the document" are claims about *them*.
 */

const TOKEN = 'github_pat_SENTINELsentinel_0123456789'
const REPO = { owner: 'octo', repo: 'parts', path: 'warpcad-project.ndjson' }

/**
 * Everything a dev-tools panel, a Pinia plugin or a crash reporter could read off
 * the store: its serialisable state plus every getter's current value.
 */
function everythingReadable(store) {
  const getters = Object.keys(store)
    .map((key) => {
      try {
        return `${key}=${JSON.stringify(store[key])}`
      } catch {
        return `${key}=<unserialisable>`
      }
    })
    .join('|')
  return `${JSON.stringify(store.$state)}|${getters}`
}

const cube = (id, at) => ({
  id,
  op: 'primitive.cuboid',
  name: id,
  params: { size: [10, 10, 10], center: at },
})

/** @param {{ file?: { text: string, sha: string } | null }} [options] */
function fakeClient({ file = null } = {}) {
  const client = {
    apiOrigin: 'https://api.github.com',
    reads: [],
    writes: [],
    /** Queue of errors, one per write; `null` = success. */
    writeOutcomes: [],
    readOutcome: null,
    remote: file,
    async read(connection) {
      client.reads.push({ ...connection })
      if (client.readOutcome) {
        const error = client.readOutcome
        client.readOutcome = null
        throw error
      }
      if (client.remote === null) return { exists: false, sha: null, text: null }
      return { exists: true, sha: client.remote.sha, text: client.remote.text }
    },
    async write(connection, write) {
      client.writes.push({ ...connection, ...write })
      const outcome = client.writeOutcomes.shift() ?? null
      if (outcome) throw outcome
      if (client.remote !== null && write.sha !== client.remote.sha) {
        throw new HostedError('conflict', 'The repository copy changed since you last loaded or saved it')
      }
      const sha = `sha-${client.writes.length}`
      client.remote = { text: write.text, sha }
      return { sha }
    },
  }
  return client
}

function fakeCredentials() {
  const records = new Map()
  return {
    records,
    writes: 0,
    async read(key) {
      return records.get(key) ?? null
    },
    async write(key, record) {
      this.writes += 1
      records.set(key, { ...record })
    },
    async clear(key) {
      records.delete(key)
    },
    close() {},
  }
}

/** The local-persistence boundary, so this spec never touches IndexedDB or a picker. */
function stubPersistence() {
  setPersistenceDependencies({
    backend: {
      async load() {
        return null
      },
      async save() {},
      async keepUnreadable() {},
    },
    files: {
      capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
      saved: [],
      async save(text) {
        this.saved.push(text)
        return { ok: true, mode: 'fallback', name: 'warpcad-project.ndjson' }
      },
      async open() {
        return { ok: false, cancelled: true }
      },
      adopt() {},
      forgetHandle() {},
    },
  })
}

describe('useHostedStore', () => {
  /** @type {ReturnType<typeof fakeClient>} */
  let client
  /** @type {ReturnType<typeof fakeCredentials>} */
  let credentials

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 19, 14, 2, 0))
    setActivePinia(createPinia())
    client = fakeClient()
    credentials = fakeCredentials()
    setHostedDependencies({ client, credentials })
    stubPersistence()
  })

  afterEach(() => {
    vi.useRealTimers()
    setHostedDependencies(null)
    setPersistenceDependencies(null)
  })

  describe('connect', () => {
    it('validates the token against the host BEFORE storing anything', async () => {
      client.readOutcome = new HostedError('unauthorized', 'GitHub rejected this token')
      const hosted = useHostedStore()

      const result = await hosted.connect({ token: TOKEN, ...REPO })

      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/rejected this token/i)
      expect(hosted.connected).toBe(false)
      expect(credentials.writes).toBe(0)
      expect(credentials.records.size).toBe(0)
      expect(client.reads).toHaveLength(1)
    })

    it('accepts a reachable repository with no project file yet, and says so', async () => {
      const hosted = useHostedStore()
      const result = await hosted.connect({ token: TOKEN, ...REPO })

      expect(result).toMatchObject({ ok: true, exists: false })
      expect(hosted.connected).toBe(true)
      expect(hosted.repoLabel).toBe('octo/parts')
      expect(hosted.statusText).toMatch(/no project file yet/i)
      expect(hosted.autoPushEnabled).toBe(false) // off for every new connection
    })

    it('refuses a repository name that is not a repository name, without a request', async () => {
      const hosted = useHostedStore()
      const result = await hosted.connect({ token: TOKEN, owner: 'octo/evil', repo: 'parts', path: 'p.ndjson' })
      expect(result.ok).toBe(false)
      expect(client.reads).toHaveLength(0)
      expect(credentials.writes).toBe(0)
    })

    it('never exposes the token through the store, and never keeps it in reactive state', async () => {
      const hosted = useHostedStore()
      await hosted.connect({ token: TOKEN, ...REPO })

      expect(hosted.token).toBeUndefined()
      expect(everythingReadable(hosted)).not.toContain(TOKEN)
      expect(everythingReadable(hosted)).not.toContain('SENTINEL')
      // It did reach the client, once, as a credential.
      expect(client.reads[0].token).toBe(TOKEN)
    })
  })

  describe('save and load', () => {
    it('writes exactly the bytes the local project file holds, including the project-state line', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      documentStore.append(cube('cube-1', [0, 0, 5]))
      documentStore.append(cube('cube-2', [40, 0, 5]))
      documentStore.raw.rollBackTo('cube-1', { origin: 'local' })
      documentStore.refresh()

      const result = await hosted.saveToRemote()

      expect(result.ok).toBe(true)
      expect(client.writes).toHaveLength(1)
      expect(client.writes[0].text).toBe(serializeProject(documentStore.raw))
      expect(client.writes[0].text).toContain('"warpcad":"project-state"')
      expect(client.writes[0].message).toBe('WarpCad: save')
      expect(hosted.statusText).toMatch(/saved to octo\/parts/i)
    })

    it('REFUSES to overwrite a repository copy that changed, and raises the dialog once', async () => {
      client.remote = { text: '', sha: 'sha-theirs' }
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.loadFromRemote() // this session has now seen sha-theirs
      client.remote = { text: 'newer\n', sha: 'sha-newer' } // a second tab committed
      documentStore.append(cube('cube-1', [0, 0, 5]))

      const result = await hosted.saveToRemote()

      expect(result.ok).toBe(false)
      expect(hosted.conflictOpen).toBe(true)
      expect(hosted.conflict.message).toMatch(/changed/i)
      // The remote is untouched: the refused PUT is the only attempt.
      expect(client.remote.text).toBe('newer\n')
      expect(client.writes).toHaveLength(1)
    })

    it('never silently overwrites a repository that already had a project file, even on the first Save', async () => {
      // Connecting reads a *fresh* sha, so a plain PUT would succeed — and would
      // destroy a project this session has never seen (§11: "connecting never
      // silently overwrites or silently pulls").
      client.remote = { text: 'someone elses project\n', sha: 'theirs' }
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      documentStore.append(cube('cube-1', [0, 0, 5]))

      const result = await hosted.saveToRemote()

      expect(result.ok).toBe(false)
      expect(hosted.conflictOpen).toBe(true)
      expect(client.writes).toHaveLength(0) // not even attempted
      expect(client.remote.text).toBe('someone elses project\n')

      // …and the user's answer is honoured.
      await hosted.resolveConflict('overwrite')
      expect(client.remote.text).toBe(serializeProject(documentStore.raw))
    })

    it('keeps reporting a diverged repository after Cancel, even with auto-push off', async () => {
      // Found by driving the app: dismissing the dialog is not resolving the
      // divergence, and a dot that went back to "in sync" the moment the user pressed
      // Cancel would be a quiet lie about the repository's state.
      client.remote = { text: '', sha: 'a' }
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.loadFromRemote()
      client.remote = { text: 'theirs\n', sha: 'b' }
      documentStore.append(cube('cube-1', [0, 0, 5]))
      await hosted.saveToRemote()
      expect(hosted.dotState).toBe('paused')

      await hosted.resolveConflict('cancel')
      expect(hosted.conflictOpen).toBe(false)
      expect(hosted.dotState).toBe('paused')
      expect(hosted.statusText).toMatch(/changed/i)

      // Resolving it for real clears it.
      await hosted.resolveConflict('overwrite')
      expect(hosted.dotState).toBe('in-sync')
    })

    it('holds the conflict dialog back while a drag or another popover is open', async () => {
      client.remote = { text: 'theirs\n', sha: 'a' }
      const hosted = useHostedStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      client.remote = { text: 'newer\n', sha: 'b' }
      hosted.setUiBusy(true)

      await hosted.saveToRemote()
      expect(hosted.conflict).not.toBeNull()
      expect(hosted.conflictOpen).toBe(false) // never under a finger mid-drag

      hosted.setUiBusy(false)
      expect(hosted.conflictOpen).toBe(true)
    })

    it('Overwrite remote re-reads the current sha and then writes, and resumes auto-push', async () => {
      client.remote = { text: 'theirs\n', sha: 'a' }
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.setAutoPush(true)
      client.remote = { text: 'newer\n', sha: 'b' }
      documentStore.append(cube('cube-1', [0, 0, 5]))
      await hosted.saveToRemote()
      expect(hosted.conflictOpen).toBe(true)

      const result = await hosted.resolveConflict('overwrite')

      expect(result.ok).toBe(true)
      expect(client.remote.text).toBe(serializeProject(documentStore.raw))
      expect(hosted.conflictOpen).toBe(false)
      expect(hosted.dotState).toBe('in-sync')
      expect(hosted.autoPushEnabled).toBe(true)
    })

    it('Load remote replaces the project through the same validated path as Open, clearing undo', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      documentStore.append(cube('local-1', [0, 0, 5]))
      const remoteText = '{"id":"remote-1","op":"primitive.cuboid","name":"remote-1","params":{"size":[20,20,20],"center":[0,0,10]}}\n'
      client.remote = { text: remoteText, sha: 'r1' }
      await hosted.connect({ token: TOKEN, ...REPO })

      const result = await hosted.loadFromRemote()

      expect(result.ok).toBe(true)
      expect(documentStore.raw.entries.map((entry) => entry.record.id)).toEqual(['remote-1'])
      expect(documentStore.canUndo).toBe(false)
      expect(documentStore.canRedo).toBe(false)
    })

    it('refuses a bad remote file by name and leaves the current project untouched', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      documentStore.append(cube('local-1', [0, 0, 5]))
      const before = serializeProject(documentStore.raw)
      client.remote = { text: 'this is not a project file at all\n', sha: 'bad' }
      await hosted.connect({ token: TOKEN, ...REPO })

      const result = await hosted.loadFromRemote()

      expect(result.ok).toBe(false)
      expect(hosted.errorMessage).toMatch(/octo\/parts/)
      expect(serializeProject(documentStore.raw)).toBe(before)
    })

    it('does not push when the local file is saved with Ctrl/Cmd+S', async () => {
      const hosted = useHostedStore()
      const persistence = usePersistenceStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.setAutoPush(true)
      client.writes.length = 0

      await persistence.saveFile()
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2)

      expect(client.writes).toHaveLength(0)
    })
  })

  describe('auto-push', () => {
    it('is off until switched on; switching it on pushes once immediately', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      documentStore.append(cube('cube-1', [0, 0, 5]))
      await nextTick()
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2)
      expect(client.writes).toHaveLength(0)

      await hosted.setAutoPush(true)
      expect(client.writes).toHaveLength(1)
      expect(hosted.autoPushEnabled).toBe(true)
      expect(credentials.records.get('hosted-git').autoPush).toBe(true)
    })

    it('turns one burst of edits into one commit, named for the push', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.setAutoPush(true)
      client.writes.length = 0

      documentStore.append(cube('cube-1', [0, 0, 5]))
      await nextTick()
      await vi.advanceTimersByTimeAsync(5_000)
      documentStore.append(cube('cube-2', [40, 0, 5]))
      await nextTick()
      expect(hosted.dotState).toBe('pending')

      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)
      expect(client.writes).toHaveLength(1)
      expect(client.writes[0].message).toMatch(/^WarpCad: auto-push \d{4}-\d\d-\d\dT/)
      expect(client.writes[0].text).toBe(serializeProject(documentStore.raw))
      expect(hosted.dotState).toBe('in-sync')
    })

    it('undo is a mutation and schedules a push', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      documentStore.append(cube('cube-1', [0, 0, 5]))
      await hosted.setAutoPush(true)
      client.writes.length = 0

      documentStore.undo()
      await nextTick()
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)
      expect(client.writes).toHaveLength(1)
    })

    it('a 401 during auto-push pauses it with a persistent error, and does not retry', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.setAutoPush(true)
      client.writeOutcomes.push(new HostedError('unauthorized', 'GitHub rejected this token'))
      client.writes.length = 0

      documentStore.append(cube('cube-1', [0, 0, 5]))
      await nextTick()
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)

      expect(hosted.dotState).toBe('failed')
      expect(hosted.errorMessage).toMatch(/rejected this token/i)
      expect(hosted.conflictOpen).toBe(false)
      await vi.advanceTimersByTimeAsync(20 * 60_000)
      expect(client.writes).toHaveLength(1)
    })

    it('a network failure retries with backoff and raises no dialog', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.setAutoPush(true)
      client.writeOutcomes.push(new HostedError('offline', 'No network — nothing was written'))
      client.writes.length = 0

      documentStore.append(cube('cube-1', [0, 0, 5]))
      await nextTick()
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)
      expect(client.writes).toHaveLength(1)
      expect(hosted.dotState).toBe('paused')
      expect(hosted.conflictOpen).toBe(false)
      expect(hosted.statusText).toMatch(/offline|retry/i)

      await vi.advanceTimersByTimeAsync(11_000)
      expect(client.writes).toHaveLength(2)
      expect(hosted.dotState).toBe('in-sync')
    })

    it('a paused state outranks a lingering success notice in the chip', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      expect(hosted.statusText).toMatch(/no project file yet/i) // the notice is showing

      await hosted.setAutoPush(true)
      client.writeOutcomes.push(new HostedError('offline', 'No network — nothing was written'))
      documentStore.append(cube('cube-1', [0, 0, 5]))
      await nextTick()
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)

      // Never "Pushed · 14:02" or "Connected" on top of a failing push.
      expect(hosted.statusText).toMatch(/offline|retry/i)
    })

    it('a conflict during auto-push pauses it; Cancel leaves it paused, not off', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.setAutoPush(true)
      client.remote = { text: 'theirs\n', sha: 'elsewhere' } // a second tab committed
      client.writes.length = 0

      documentStore.append(cube('cube-1', [0, 0, 5]))
      await nextTick()
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)

      expect(hosted.dotState).toBe('paused')
      expect(hosted.conflictOpen).toBe(true)
      expect(hosted.autoPushLabel).toBe('Auto-push paused — repository changed')

      await hosted.resolveConflict('cancel')
      expect(hosted.conflictOpen).toBe(false)
      expect(hosted.autoPushEnabled).toBe(true) // paused, not off
      expect(hosted.dotState).toBe('paused')
      // Found by driving the File menu (TODO/ui-033): the label fell back to "will retry" the
      // moment the dialog closed — promising a retry that §11 rule 5 says is not coming.
      expect(hosted.autoPushLabel).toBe('Auto-push paused — repository changed')

      documentStore.append(cube('cube-2', [40, 0, 5]))
      await nextTick()
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      expect(client.writes).toHaveLength(1) // nothing further attempted
      expect(hosted.conflictOpen).toBe(false) // and no second dialog
    })

    it('never pushes from pagehide — a dying tab cannot be relied on to finish a request', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.setAutoPush(true)
      client.writes.length = 0

      documentStore.append(cube('cube-1', [0, 0, 5]))
      await nextTick()
      window.dispatchEvent(new Event('pagehide'))
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(100)

      expect(client.writes).toHaveLength(0)
    })
  })

  describe('restore and disconnect', () => {
    it('restores the connection on start and schedules one push when the local copy is ahead', async () => {
      credentials.records.set('hosted-git', {
        token: TOKEN,
        ...REPO,
        autoPush: true,
        sha: 'r1',
        pushedHash: 'not-the-current-document',
        adopted: true,
      })
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      documentStore.append(cube('cube-1', [0, 0, 5]))

      await hosted.start()
      expect(hosted.connected).toBe(true)
      expect(hosted.autoPushEnabled).toBe(true)

      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)
      expect(client.writes).toHaveLength(1)
    })

    it('does not push on start when the local copy matches what was last pushed', async () => {
      setActivePinia(createPinia())
      const documentStore = useDocumentStore()
      documentStore.append(cube('cube-1', [0, 0, 5]))
      const hosted = useHostedStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.setAutoPush(true)
      const stored = credentials.records.get('hosted-git')
      // What autosave holds: the document's own bytes, merge metadata included
      // (`TODO/data-011`) — a reload restores that text, it does not re-create the cube.
      const savedText = serializeProject(documentStore.raw)
      client.writes.length = 0

      // A reload: same document, the connection as it was stored.
      setActivePinia(createPinia())
      credentials.records.set('hosted-git', stored)
      const reloaded = useHostedStore()
      const reloadedDocument = useDocumentStore()
      const parsed = parseProject(savedText)
      reloadedDocument.load(parsed.entries, parsed.rollbackAt, parsed.resolution, { merge: parsed.merge })
      await reloaded.start()
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)

      expect(client.writes).toHaveLength(0)
      expect(reloaded.dotState).toBe('in-sync')
    })

    it('New project drops lastSha, pauses auto-push and keeps the connection (TODO/ui-054)', async () => {
      const hosted = useHostedStore()
      const documentStore = useDocumentStore()
      documentStore.append(cube('cube-1', [0, 0, 5]))
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.saveToRemote()
      await hosted.setAutoPush(true)
      expect(hosted.lastSha).not.toBeNull()
      client.writes.length = 0

      hosted.detachForNewProject()

      expect(hosted.connected).toBe(true) // never disconnects: losing the token is the bigger surprise
      expect(hosted.lastSha).toBeNull()
      expect(hosted.autoPushEnabled).toBe(true)
      expect(hosted.dotState).toBe('paused')
      expect(hosted.autoPushLabel).toBe('Auto-push paused — new project')

      // Edits to the new project push nothing over the remote file...
      documentStore.load([])
      documentStore.append(cube('cube-2', [0, 0, 5]))
      await nextTick()
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      expect(client.writes).toHaveLength(0)

      // ...and an explicit Save goes down the conflict path rather than overwriting.
      const result = await hosted.saveToRemote()
      expect(result).toMatchObject({ ok: false, conflict: true })
      expect(client.writes).toHaveLength(0)
    })

    it('New project with no connection is a no-op', () => {
      const hosted = useHostedStore()
      hosted.detachForNewProject()
      expect(hosted.dotState).toBe('none')
    })

    it('Disconnect deletes the stored credential, forgets the token and turns auto-push off', async () => {
      const hosted = useHostedStore()
      await hosted.connect({ token: TOKEN, ...REPO })
      await hosted.setAutoPush(true)
      client.writes.length = 0

      await hosted.disconnect()

      expect(hosted.connected).toBe(false)
      expect(hosted.autoPushEnabled).toBe(false)
      expect(credentials.records.size).toBe(0)
      expect(everythingReadable(hosted)).not.toContain(TOKEN)

      // And nothing can be written afterwards without connecting again.
      const result = await hosted.saveToRemote()
      expect(result.ok).toBe(false)
      expect(client.writes).toHaveLength(0)
    })
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { setHostedDependencies, useHostedStore } from '../stores/hosted.js'
import { setPersistenceDependencies, usePersistenceStore } from '../stores/persistence.js'
import { useStatusSurface } from './useStatusSurface.js'

/**
 * `TODO/ui-033` — the header chip is ONE status surface for autosave, the last explicit
 * save/open, and hosted state (`interaction-model-qa.md`, "The one status surface"). It must
 * show the hosted store's news when there is some, and must NOT let the hosted store's
 * permanent "Connected to owner/repo" resting text bury `Saved · 14:02` for the whole session.
 */

const okClient = {
  apiOrigin: 'https://api.github.com',
  async read() { return { exists: false, sha: null, text: null } },
  async write() { return { sha: 'sha-1' } },
}

describe('useStatusSurface', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setPersistenceDependencies({
      backend: { async load() { return null }, async save() {}, async keepUnreadable() {} },
      files: {
        capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
        async save() { return { ok: true, mode: 'fallback', name: 'a.ndjson' } },
        async open() { return { ok: false, cancelled: true } },
        adopt() {},
        forgetHandle() {},
      },
    })
    setHostedDependencies({
      client: okClient,
      credentials: { async read() { return null }, async write() {}, async clear() {}, close() {} },
    })
  })

  it('shows the local autosave text when there is no hosted connection', () => {
    const surface = useStatusSurface()
    expect(surface.text.value).toBe('Autosave on')
    expect(surface.tone.value).toBe('idle')
  })

  it('a connected, in-sync repository does NOT bury the autosave text', async () => {
    const hosted = useHostedStore()
    await hosted.connect({ token: 'ghp_SENTINEL', owner: 'octo', repo: 'parts' })
    const surface = useStatusSurface()
    // Right after Connect the hosted store has a transient notice worth showing …
    expect(surface.text.value).toMatch(/No project file yet/)
    // … but the resting "Connected to …" text is never allowed to replace autosave's own.
    expect(surface.text.value).not.toBe('Connected to octo/parts')
  })

  it('a hosted error wins over a calm local state, and is an error tone', async () => {
    const hosted = useHostedStore()
    await hosted.connect({ token: 'ghp_SENTINEL', owner: 'octo', repo: 'parts' })
    okClient.write = async () => {
      const { HostedError } = await import('../storage/hostedBackend.js')
      throw new HostedError('network', 'No network — nothing was written')
    }
    await hosted.saveToRemote()
    const surface = useStatusSurface()
    expect(surface.text.value).toBe('No network — nothing was written')
    expect(surface.tone.value).toBe('error')
    okClient.write = async () => ({ sha: 'sha-1' })
  })

  it('a local persistent error outranks hosted news', async () => {
    const persistence = usePersistenceStore()
    persistence.errorMessage = 'Not saved — browser storage unavailable'
    const surface = useStatusSurface()
    expect(surface.text.value).toBe('Not saved — browser storage unavailable')
    expect(surface.tone.value).toBe('error')
  })

  it('a diverged repository is an amber warning, not calm', async () => {
    const hosted = useHostedStore()
    await hosted.connect({ token: 'ghp_SENTINEL', owner: 'octo', repo: 'parts' })
    hosted.divergent = true
    const surface = useStatusSurface()
    expect(surface.text.value).toMatch(/changed/)
    expect(surface.tone.value).toBe('warn')
  })

  it('of two notices, the NEWER wins — "Restored your last session" never sits on a fresh Connect result', async () => {
    const persistence = usePersistenceStore()
    const hosted = useHostedStore()
    const surface = useStatusSurface()
    persistence.notice = 'Restored your last session'
    expect(surface.text.value).toBe('Restored your last session')

    await hosted.connect({ token: 'ghp_SENTINEL', owner: 'octo', repo: 'parts' })
    expect(surface.text.value).toMatch(/No project file yet/) // the hosted notice came later

    persistence.notice = 'Download started: a.ndjson'
    expect(surface.text.value).toBe('Download started: a.ndjson') // and now the local one is newest
  })
})

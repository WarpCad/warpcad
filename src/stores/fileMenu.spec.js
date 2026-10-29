// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives duck-typed fakes of the storage boundary; the modules under test are
// fully typed and checked by `npm run typecheck`.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toRaw } from 'vue'

import { createDocument } from '../core/document.js'
import { gistMessage } from '../core/gistMessages.js'
import { parseProject, serializeProject } from '../core/project.js'
import { GistError } from '../storage/gistBackend.js'
import { useDocumentStore } from './document.js'
import { useFileMenuStore } from './fileMenu.js'
import { setGistDependencies, useGistStore } from './gist.js'
import { setHostedDependencies, useHostedStore } from './hosted.js'
import { setPersistenceDependencies, usePersistenceStore } from './persistence.js'

/**
 * `TODO/ui-033` — the File menu's UI state and the two rules that live in it:
 *
 * - **Open never destroys work without asking** (`interaction-model-qa.md` §10): a non-empty
 *   project gets the confirm dialog *first*, and the picker is only opened from the
 *   Replace click, so a cancelled picker after a confirmed replace can never lose anything.
 * - **Ctrl/Cmd+S never touches the network** (§11): the local save path has no route into the
 *   hosted store, with a connection and auto-push on or off.
 */

const cube = (id) => ({
  id,
  op: 'primitive.cuboid',
  name: id,
  params: { size: [10, 10, 10], center: [0, 0, 5] },
})

function fakeFiles() {
  return {
    capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
    saves: [],
    opens: 0,
    async save(text, options) {
      this.saves.push({ text, options })
      return { ok: true, mode: 'fallback', name: 'warpcad-project-20260921-1002.ndjson' }
    },
    async open() {
      this.opens += 1
      return { ok: false, cancelled: true }
    },
    adopt() {},
    forgot: 0,
    forgetHandle() {
      this.forgot += 1
    },
  }
}

function fakeClient() {
  return {
    apiOrigin: 'https://api.github.com',
    calls: [],
    remote: null,
    async read(connection) {
      this.calls.push('read')
      return this.remote ?? { exists: false, sha: null, text: null }
    },
    async write() {
      this.calls.push('write')
      return { sha: 'sha-1' }
    },
  }
}

describe('useFileMenuStore', () => {
  let files
  let client

  beforeEach(() => {
    setActivePinia(createPinia())
    files = fakeFiles()
    client = fakeClient()
    setPersistenceDependencies({
      backend: { async load() { return null }, async save() {}, async keepUnreadable() {} },
      files,
    })
    setHostedDependencies({
      client,
      credentials: { async read() { return null }, async write() {}, async clear() {}, close() {} },
    })
  })

  it('starts closed, with no dialog raised', () => {
    const menu = useFileMenuStore()
    expect(menu.menuOpen).toBe(false)
    expect(menu.connectOpen).toBe(false)
    expect(menu.confirm).toBeNull()
    expect(menu.anyOpen).toBe(false)
  })

  it('opening the picker on an EMPTY project asks nothing and opens it at once', () => {
    const menu = useFileMenuStore()
    menu.openMenu()
    menu.requestOpen()
    // Synchronous: the fallback's <input type=file> must be clicked inside the user's gesture.
    expect(files.opens).toBe(1)
    expect(menu.confirm).toBeNull()
    expect(menu.menuOpen).toBe(false)
  })

  it('a NON-EMPTY project raises the confirm first and does not open the picker until Replace', () => {
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    menu.requestOpen()
    expect(menu.confirm).toBe('open')
    expect(files.opens).toBe(0)

    menu.cancelConfirm()
    expect(menu.confirm).toBeNull()
    expect(files.opens).toBe(0) // Cancel never reaches the picker

    menu.requestOpen()
    menu.confirmReplace()
    expect(files.opens).toBe(1)
    expect(menu.confirm).toBeNull()
  })

  it('a project whose only steps are suppressed still counts as non-empty', () => {
    const document = useDocumentStore()
    document.append(cube('cube-1'))
    document.raw.setSuppressed('cube-1', true)
    document.refresh?.()
    const menu = useFileMenuStore()
    menu.requestOpen()
    expect(menu.confirm).toBe('open')
  })

  describe('New (TODO/ui-054)', () => {
    it('on an EMPTY project starts a new one at once, with no confirm', () => {
      const menu = useFileMenuStore()
      menu.openMenu()
      menu.requestNew()
      expect(menu.confirm).toBeNull()
      expect(menu.menuOpen).toBe(false)
      expect(files.forgot).toBe(1)
      expect(usePersistenceStore().chipText).toMatch(/^New project · \d\d:\d\d$/)
    })

    it('on a NON-EMPTY project raises the confirm and touches nothing until Replace', () => {
      const document = useDocumentStore()
      document.append(cube('cube-1'))
      const menu = useFileMenuStore()
      menu.requestNew()
      expect(menu.confirm).toBe('new')
      expect(document.raw.entries).toHaveLength(1)
      expect(files.forgot).toBe(0)

      menu.cancelConfirm()
      expect(menu.confirm).toBeNull()
      expect(document.raw.entries).toHaveLength(1)
      expect(files.forgot).toBe(0)

      menu.requestNew()
      menu.confirmReplace()
      expect(menu.confirm).toBeNull()
      expect(document.raw.entries).toHaveLength(0)
      expect(files.forgot).toBe(1)
    })

    it('a project whose only steps are suppressed still raises the confirm', () => {
      const document = useDocumentStore()
      document.append(cube('cube-1'))
      document.raw.setSuppressed('cube-1', true)
      const menu = useFileMenuStore()
      menu.requestNew()
      expect(menu.confirm).toBe('new')
    })

    it('does nothing while a load is pending', () => {
      useDocumentStore().append(cube('cube-1'))
      usePersistenceStore().loading = 'Opening x…'
      const menu = useFileMenuStore()
      menu.requestNew()
      expect(menu.confirm).toBeNull()
      expect(files.forgot).toBe(0)
    })

    it('clears the remembered align references and any open popover', async () => {
      const { useAlignReferenceStore } = await import('./alignReference.js')
      const { useExportDialogStore } = await import('./exportDialog.js')
      const align = useAlignReferenceStore()
      align.set('cube-1', 'mb')
      const menu = useFileMenuStore()
      menu.requestNew()
      expect(align.get('cube-1')).toBeNull()
      expect(align.reference.size).toBe(0)
      expect(useExportDialogStore().isOpen).toBe(false)
    })

    it('with a hosted connection, drops lastSha and pauses auto-push', async () => {
      useDocumentStore().append(cube('cube-1'))
      const hosted = useHostedStore()
      await hosted.connect({ token: 'ghp_SENTINEL', owner: 'octo', repo: 'parts' })
      await hosted.saveToRemote()
      await hosted.setAutoPush(true)
      const menu = useFileMenuStore()
      menu.requestNew()
      menu.confirmReplace()
      expect(hosted.lastSha).toBeNull()
      expect(hosted.dotState).toBe('paused')
      expect(hosted.connected).toBe(true)
    })
  })

  it('Load from the repository asks the replace question only when the load would replace', async () => {
    // `TODO/io-011`: a copy of this project is merged, so it reads first; an unrelated project
    // would replace, and that — not the click — is what raises the question.
    useDocumentStore().append(cube('cube-1'))
    client.remote = { exists: true, sha: 'r1', text: '{"id":"other","op":"primitive.cuboid","name":"other","params":{"size":[1,1,1],"center":[0,0,0]}}\n' }
    const hosted = useHostedStore()
    await hosted.connect({ token: 'ghp_SENTINEL', owner: 'octo', repo: 'parts' })
    client.calls.length = 0

    const menu = useFileMenuStore()
    menu.requestLoad()
    await vi.waitFor(() => expect(menu.confirm).toBe('load'))
    expect(client.calls).toEqual(['read'])
    menu.confirmReplace()
    await vi.waitFor(() => expect(useDocumentStore().raw.entries.map((e) => e.record.id)).toEqual(['other']))
  })

  it('Save / Download copy writes through the local files boundary with the Save-As flag', async () => {
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    menu.saveLocal()
    menu.saveLocal({ saveAs: true })
    await vi.waitFor(() => expect(files.saves).toHaveLength(2))
    expect(files.saves[0].options).toEqual({ saveAs: false })
    expect(files.saves[1].options).toEqual({ saveAs: true })
    expect(usePersistenceStore().chipText).toMatch(/Download started/)
  })

  it('the local save path NEVER reaches the network, connected with auto-push on', async () => {
    useDocumentStore().append(cube('cube-1'))
    const hosted = useHostedStore()
    await hosted.connect({ token: 'ghp_SENTINEL', owner: 'octo', repo: 'parts' })
    await hosted.saveToRemote()
    await hosted.setAutoPush(true)
    client.calls.length = 0

    const menu = useFileMenuStore()
    menu.saveLocal()
    menu.saveLocal({ saveAs: true })
    await vi.waitFor(() => expect(files.saves).toHaveLength(2))
    expect(client.calls).toEqual([])
  })

  it('opening the connect dialog closes the menu; cancelling it closes the dialog', () => {
    const menu = useFileMenuStore()
    menu.openMenu()
    menu.openConnect()
    expect(menu.menuOpen).toBe(false)
    expect(menu.connectOpen).toBe(true)
    expect(menu.anyOpen).toBe(true)
    menu.closeConnect()
    expect(menu.connectOpen).toBe(false)
  })

  it('Escape closes the topmost thing only, and reports whether it closed anything', () => {
    const menu = useFileMenuStore()
    expect(menu.dismissTopmost()).toBe(false)
    menu.openMenu()
    expect(menu.dismissTopmost()).toBe(true)
    expect(menu.menuOpen).toBe(false)
    menu.openConnect()
    expect(menu.dismissTopmost()).toBe(true)
    expect(menu.connectOpen).toBe(false)
  })
})

/**
 * `TODO/io-021` — **File ▾ → Save as gist…**: a second entry point to `useGistPublish`. The first
 * save creates the gist (`publish()`) and makes it the project's save target; once the project has
 * a gist from this account the item reads **Save to gist** and saves straight to it (`update()`).
 * Only the gist client and the credential store are faked.
 */
describe('useFileMenuStore — Save as gist (TODO/io-021)', () => {
  const GIST_TOKEN = 'github_pat_FAKEfake_0123456789abcdefGIST'
  const ID = 'aa11bb22cc33dd44ee55ff6677889900'
  const REV1 = '1'.repeat(40)
  const REV2 = '2'.repeat(40)
  const REV3 = '3'.repeat(40)

  let files
  let gistBackend

  function memoryCredentials() {
    const records = new Map()
    return {
      async read(key) {
        return records.get(key) ?? null
      },
      async write(key, record) {
        records.set(key, { ...record })
      },
      async clear(key) {
        records.delete(key)
      },
      close() {},
    }
  }

  function fakeGistBackend() {
    return {
      validateGistToken: vi.fn(async () => ({ login: 'octocat', expiresAt: null, broaderThanNeeded: false, tokenKind: 'fine-grained' })),
      createGist: vi.fn(async () => ({ id: ID, revision: REV1, url: `https://gist.github.com/${ID}`, rawUrls: {} })),
      updateGist: vi.fn(async () => ({ id: ID, revision: REV2, url: `https://gist.github.com/${ID}`, rawUrls: {} })),
      deleteGist: vi.fn(async () => {}),
      readGist: vi.fn(async () => ({ id: ID, description: 'Phone stand', text: '', revision: REV2, updatedAt: null, fileName: 'phone-stand.ndjson' })),
    }
  }

  beforeEach(async () => {
    setActivePinia(createPinia())
    files = fakeFiles()
    gistBackend = fakeGistBackend()
    setPersistenceDependencies({
      backend: { async load() { return null }, async save() {}, async keepUnreadable() {} },
      files,
    })
    setHostedDependencies({
      client: fakeClient(),
      credentials: { async read() { return null }, async write() {}, async clear() {}, close() {} },
    })
    setGistDependencies({ backend: gistBackend, credentials: memoryCredentials() })
  })

  afterEach(() => {
    setGistDependencies(null)
  })

  async function connect() {
    await useGistStore().connect(GIST_TOKEN)
  }

  const gistField = () => toRaw(useDocumentStore().raw).gist()

  it('an empty project: the item is dimmed with its reason, and pressing it does nothing', async () => {
    await connect()
    const menu = useFileMenuStore()
    expect(menu.gistSaveLabel).toBe('Save as gist…')
    expect(menu.gistSaveReason).toBe('Nothing to save yet')
    menu.openMenu()
    menu.requestSaveAsGist()
    expect(menu.gistSaveOpen).toBe(false)
    expect(gistBackend.createGist).not.toHaveBeenCalled()
  })

  it('with bodies and no gist: the item opens the dialog and closes the menu, sending nothing', async () => {
    await connect()
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    expect(menu.gistSaveReason).toBe('')
    expect(menu.gistSaveLabel).toBe('Save as gist…')
    menu.openMenu()
    menu.requestSaveAsGist()
    expect(menu.menuOpen).toBe(false)
    expect(menu.gistSaveOpen).toBe(true)
    expect(menu.anyOpen).toBe(true)
    expect(gistBackend.createGist).not.toHaveBeenCalled()
    expect(gistBackend.updateGist).not.toHaveBeenCalled()
  })

  it('the dialog\'s Save creates the gist (publish), sets the field, closes, and toasts with the link', async () => {
    await connect()
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    menu.requestSaveAsGist()
    const result = await menu.saveAsGist({ name: 'Bracket', public: false })
    expect(result.ok).toBe(true)
    expect(gistBackend.createGist).toHaveBeenCalledTimes(1)
    expect(gistBackend.createGist.mock.calls[0][0]).toMatchObject({ description: 'Bracket', public: false })
    expect(gistField()).toMatchObject({ id: ID, owner: 'octocat', public: false })
    expect(menu.gistSaveOpen).toBe(false)
    expect(menu.gistSaveToast).toEqual({ text: 'Saved to gist: Bracket', link: `https://app.warpcad.com/#/gist/${ID}` })
    // Now the project's save target: the same item saves to it.
    expect(menu.gistSaveLabel).toBe('Save to gist')
  })

  it('Public is sent only when chosen', async () => {
    await connect()
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    menu.requestSaveAsGist()
    await menu.saveAsGist({ name: 'Bracket', public: true })
    expect(gistBackend.createGist.mock.calls[0][0].public).toBe(true)
  })

  it('Save to gist saves straight to the same gist (update — a PATCH, no new gist, no dialog)', async () => {
    await connect()
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    menu.requestSaveAsGist()
    await menu.saveAsGist({ name: 'Bracket', public: false })
    gistBackend.readGist.mockResolvedValue({ id: ID, description: 'Bracket', text: '', revision: REV2, updatedAt: null, fileName: 'bracket.ndjson' })
    gistBackend.updateGist.mockClear()
    gistBackend.updateGist.mockResolvedValue({ id: ID, revision: REV3, url: '', rawUrls: {} })
    useDocumentStore().append(cube('cube-2'))

    menu.openMenu()
    menu.requestSaveAsGist()
    expect(menu.menuOpen).toBe(false)
    expect(menu.gistSaveOpen).toBe(false)
    await vi.waitFor(() => expect(gistBackend.updateGist).toHaveBeenCalledTimes(1))
    expect(gistBackend.createGist).toHaveBeenCalledTimes(1)
    // The gist keeps its title: the name it was created under, not the never-saved project's ''.
    expect(gistBackend.updateGist.mock.calls[0][0]).toMatchObject({ id: ID, description: 'Bracket' })
    expect(Object.keys(gistBackend.updateGist.mock.calls[0][0].files).sort()).toEqual(['README.md', 'bracket.ndjson'])
    await vi.waitFor(() => expect(gistField().lastRevision).toBe(REV3))
    expect(menu.gistSaveToast).toEqual({ text: 'Saved to gist: Bracket', link: `https://app.warpcad.com/#/gist/${ID}` })
  })

  it('a failed create writes nothing: the field stays unset, the dialog stays open with the gist wording', async () => {
    await connect()
    useDocumentStore().append(cube('cube-1'))
    gistBackend.createGist.mockRejectedValueOnce(new GistError('offline', 'Failed to fetch'))
    const menu = useFileMenuStore()
    menu.requestSaveAsGist()
    const result = await menu.saveAsGist({ name: 'Bracket', public: false })
    expect(result.ok).toBe(false)
    expect(gistField()).toBeNull()
    expect(menu.gistSaveOpen).toBe(true)
    expect(menu.gistSaveError).toBe(gistMessage('offline', 'publish'))
    expect(menu.gistSaveToast).toBeNull()
    expect(menu.gistSaveLabel).toBe('Save as gist…')
  })

  it('Save to gist merges a gist changed elsewhere first, then saves the merged project (io-019)', async () => {
    await connect()
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    menu.requestSaveAsGist()
    await menu.saveAsGist({ name: 'Bracket', public: false })
    // Another device opened the gist, added a step and updated it.
    const parsed = parseProject(gistBackend.createGist.mock.calls[0][0].files['bracket.ndjson'])
    const phone = createDocument({ foldCache: null })
    phone.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, parsed)
    phone.append(cube('cube-phone'), { origin: 'local' })
    gistBackend.readGist.mockResolvedValue({ id: ID, description: 'Bracket', text: serializeProject(phone), revision: 'f'.repeat(40), updatedAt: null, fileName: 'bracket.ndjson' })
    gistBackend.updateGist.mockClear()
    gistBackend.updateGist.mockResolvedValue({ id: ID, revision: REV3, url: '', rawUrls: {} })
    useDocumentStore().append(cube('cube-2'))

    menu.requestSaveAsGist()
    await vi.waitFor(() => expect(gistBackend.updateGist).toHaveBeenCalledTimes(1))
    const written = parseProject(gistBackend.updateGist.mock.calls[0][0].files['bracket.ndjson']).entries.map((entry) => entry.record.id)
    expect(written.sort()).toEqual(['cube-1', 'cube-2', 'cube-phone'])
    await vi.waitFor(() => expect(gistField().lastRevision).toBe(REV3))
    expect(menu.gistSaveError).toBe('')
  })

  it('Save to gist refuses a gist that now holds a different project: nothing written, the reason in the dialog', async () => {
    await connect()
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    menu.requestSaveAsGist()
    await menu.saveAsGist({ name: 'Bracket', public: false })
    const stranger = createDocument({ foldCache: null })
    stranger.append({ id: 'ball-1', op: 'primitive.sphere', name: 'Ball', params: { diameter: 30, center: [0, 0, 15] } }, { origin: 'local' })
    gistBackend.readGist.mockResolvedValue({ id: ID, description: 'Bracket', text: serializeProject(stranger), revision: 'f'.repeat(40), updatedAt: null, fileName: 'bracket.ndjson' })
    gistBackend.updateGist.mockClear()

    menu.requestSaveAsGist()
    await vi.waitFor(() => expect(menu.gistSaveError).toBe(gistMessage('different-project', 'update')))
    expect(gistBackend.updateGist).not.toHaveBeenCalled()
    expect(menu.gistSaveOpen).toBe(true)
    expect(gistField().lastRevision).toBe(REV2)
  })

  it('not connected, with a gist field: Save to gist opens the dialog (its connect step), sending nothing', async () => {
    await connect()
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    menu.requestSaveAsGist()
    await menu.saveAsGist({ name: 'Bracket', public: false })
    await useGistStore().disconnect()
    gistBackend.updateGist.mockClear()

    expect(menu.gistSaveLabel).toBe('Save to gist')
    menu.requestSaveAsGist()
    expect(menu.gistSaveOpen).toBe(true)
    expect(gistBackend.updateGist).not.toHaveBeenCalled()
  })

  it('a gist published from another account is not this project\'s save target: Save as gist… makes a new one', async () => {
    await connect()
    useDocumentStore().append(cube('cube-1'))
    toRaw(useDocumentStore().raw).setGist({ id: ID, public: false, lastRevision: REV1, owner: 'someone-else' }, { origin: 'gist' })
    useDocumentStore().refresh()
    expect(useFileMenuStore().gistSaveLabel).toBe('Save as gist…')
  })

  it('Ctrl/Cmd+S (saveLocal) stays local with a gist target: no gist call', async () => {
    await connect()
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    menu.requestSaveAsGist()
    await menu.saveAsGist({ name: 'Bracket', public: false })
    gistBackend.readGist.mockClear()
    gistBackend.updateGist.mockClear()
    gistBackend.createGist.mockClear()
    menu.saveLocal()
    await vi.waitFor(() => expect(files.saves).toHaveLength(1))
    expect(gistBackend.readGist).not.toHaveBeenCalled()
    expect(gistBackend.updateGist).not.toHaveBeenCalled()
    expect(gistBackend.createGist).not.toHaveBeenCalled()
  })

  it('the chip: Saved to gist · hh:mm, then how far behind the gist is, never a silent save', async () => {
    await connect()
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    const persistence = usePersistenceStore()
    expect(persistence.chipText).not.toMatch(/gist/i)
    menu.requestSaveAsGist()
    await menu.saveAsGist({ name: 'Bracket', public: false })
    expect(persistence.chipText).toMatch(/^Saved to gist · \d\d:\d\d$/)
    expect(persistence.chipTone).toBe('saved')

    useDocumentStore().append(cube('cube-2'))
    expect(persistence.chipText).toBe('Gist: 1 change not saved')
    useDocumentStore().append(cube('cube-3'))
    expect(persistence.chipText).toBe('Gist: 2 changes not saved')
    expect(gistBackend.updateGist).toHaveBeenCalledTimes(1) // the README patch of the create, nothing since
  })

  it('Escape closes the dialog; the token dialog over it closes first', async () => {
    useDocumentStore().append(cube('cube-1'))
    const menu = useFileMenuStore()
    menu.requestSaveAsGist()
    menu.openGistConnect()
    expect(menu.dismissTopmost()).toBe(true)
    expect(menu.gistConnectOpen).toBe(false)
    expect(menu.gistSaveOpen).toBe(true)
    expect(menu.dismissTopmost()).toBe(true)
    expect(menu.gistSaveOpen).toBe(false)
  })
})

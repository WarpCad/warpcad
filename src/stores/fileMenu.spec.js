// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives duck-typed fakes of the storage boundary; the modules under test are
// fully typed and checked by `npm run typecheck`.
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDocumentStore } from './document.js'
import { useFileMenuStore } from './fileMenu.js'
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

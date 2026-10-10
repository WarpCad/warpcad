// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — duck-typed fakes of the file-storage boundary; the store under test is typed.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDocumentStore } from './document.js'
import { DISK_CHANGED_TEXT, setPersistenceDependencies, usePersistenceStore } from './persistence.js'

/**
 * `TODO/ai-009` — the app side of "closed-file MCP": when the project file the app opened is
 * changed on disk by something else (the MCP server), the app notices on focus and asks —
 * **Reload**, **Overwrite the file**, or **Cancel** — and never merges or overwrites on its own
 * (`docs/decisions/ai-partner.md` decision 6, reusing the hosted conflict dialog's rules).
 */

const BASE = '{"id":"base","op":"primitive.cuboid","name":"Base","params":{"size":[40,40,4],"center":[0,0,2]}}\n'
const WITH_MCP =
  BASE +
  '{"id":"cuboid-1","op":"primitive.cuboid","name":"Block","params":{"size":[10,10,10],"center":[30,0,5]}}\n' +
  '{"warpcad":"project-state","version":1,"origins":{"cuboid-1":"mcp"},"intents":{"cuboid-1":"add a block beside the base"}}\n'

function quietBackend() {
  return { async load() { return null }, async save() {}, async keepUnreadable() {} }
}

/** File System Access, with a disk the spec can change underneath the app. */
function nativeFiles() {
  const disk = { text: BASE, lastModified: 1000, reads: 0 }
  let adopted = false
  const files = {
    capabilities: { mode: 'native', canSaveInPlace: true, saveLabel: 'Save', saveAsLabel: 'Save As…', openLabel: 'Open…' },
    currentName: 'bracket.ndjson',
    saves: /** @type {{ text: string, saveAs: boolean }[]} */ ([]),
    async save(text, { saveAs = false } = {}) {
      files.saves.push({ text, saveAs })
      disk.text = text
      disk.lastModified += 1
      adopted = true
      return { ok: true, mode: 'native', name: 'bracket.ndjson' }
    },
    async open() {
      return { ok: true, name: 'bracket.ndjson', text: disk.text, handle: {}, lastModified: disk.lastModified }
    },
    adopt() {
      adopted = true
    },
    forgetHandle() {
      adopted = false
    },
    async readCurrent(known) {
      if (!adopted) return null
      if (known && known.lastModified === disk.lastModified) return { ok: true, name: 'bracket.ndjson', text: '', lastModified: disk.lastModified }
      disk.reads += 1
      return { ok: true, name: 'bracket.ndjson', text: disk.text, lastModified: disk.lastModified }
    },
  }
  /** What the MCP server does: replace the file's bytes. @param {string} text */
  const change = (text) => {
    disk.text = text
    disk.lastModified += 1000
  }
  return { files, disk, change }
}

/** The fallback path: a picked file can never be read again. */
function fallbackFiles() {
  return {
    capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
    currentName: null,
    async save() {
      return { ok: true, mode: 'fallback', name: 'x.ndjson' }
    },
    async open() {
      return { ok: true, name: 'bracket.ndjson', text: BASE }
    },
    adopt() {},
    forgetHandle() {},
    async readCurrent() {
      return null
    },
  }
}

/** @param {any} files */
async function openedApp(files) {
  setPersistenceDependencies({ backend: quietBackend(), files })
  const persistence = usePersistenceStore()
  const documentStore = useDocumentStore()
  await persistence.start()
  const opened = await persistence.openFile()
  expect(opened).toMatchObject({ ok: true })
  return { persistence, documentStore }
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  usePersistenceStore().stop()
  setPersistenceDependencies(null)
  vi.useRealTimers()
})

describe('noticing the file changed on disk', () => {
  it('an unchanged file raises nothing, and the cheap check does not even read its text', async () => {
    const { files, disk } = nativeFiles()
    const { persistence } = await openedApp(files)
    const reads = disk.reads
    await persistence.checkDiskFile()
    expect(persistence.diskChanged).toBe(false)
    expect(persistence.diskPromptOpen).toBe(false)
    expect(disk.reads).toBe(reads)
  })

  it('a change raises the prompt and the chip, and touches nothing in the document', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    const version = documentStore.raw.version
    change(WITH_MCP)
    await persistence.checkDiskFile()

    expect(persistence.diskChanged).toBe(true)
    expect(persistence.diskChangeName).toBe('bracket.ndjson')
    expect(persistence.diskPromptOpen).toBe(true)
    expect(persistence.chipText).toBe(DISK_CHANGED_TEXT)
    expect(persistence.chipTone).toBe('warn')
    expect(DISK_CHANGED_TEXT).toBe('File changed on disk — Reload')
    expect(documentStore.raw.version).toBe(version)
    expect(documentStore.raw.entries).toHaveLength(1)
  })

  it('a rewrite with identical bytes (a touch, a re-save) raises nothing', async () => {
    const { files, change } = nativeFiles()
    const { persistence } = await openedApp(files)
    change(BASE)
    await persistence.checkDiskFile()
    expect(persistence.diskChanged).toBe(false)
  })

  it('the fallback path cannot see the disk, so it never raises a false prompt', async () => {
    const { persistence } = await openedApp(fallbackFiles())
    await persistence.checkDiskFile()
    expect(persistence.diskChanged).toBe(false)
    expect(persistence.diskCanWatch).toBe(false)
  })

  it('reports whether it can watch: only once a native file is open', async () => {
    const { files } = nativeFiles()
    setPersistenceDependencies({ backend: quietBackend(), files })
    const persistence = usePersistenceStore()
    expect(persistence.diskCanWatch).toBe(false)
    await persistence.openFile()
    expect(persistence.diskCanWatch).toBe(true)
  })
})

describe('the three answers', () => {
  it('Reload replaces the project with the file: the new rows keep their mcp origin and intent', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    change(WITH_MCP)
    await persistence.checkDiskFile()
    await persistence.resolveDiskChange('reload')

    const entries = documentStore.raw.entries
    expect(entries.map((entry) => entry.origin)).toEqual(['local', 'mcp'])
    expect(entries[1].intent).toBe('add a block beside the base')
    expect(persistence.diskChanged).toBe(false)
    expect(persistence.diskPromptOpen).toBe(false)
    // Now in step with the file: checking again raises nothing.
    await persistence.checkDiskFile()
    expect(persistence.diskChanged).toBe(false)
  })

  it('Reload of a file this build cannot read refuses it by name and leaves the project alone', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    change(WITH_MCP.slice(0, BASE.length + 20))
    await persistence.checkDiskFile()
    await persistence.resolveDiskChange('reload')
    expect(persistence.errorMessage).toMatch(/^Couldn't open bracket\.ndjson: line 2 is not valid JSON/)
    expect(documentStore.raw.entries).toHaveLength(1)
    expect(persistence.diskPromptOpen).toBe(false)
  })

  it('Overwrite writes this project over the file, in place — and only on that explicit answer', async () => {
    const { files, change, disk } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    change(WITH_MCP)
    await persistence.checkDiskFile()
    expect(files.saves).toEqual([])
    await persistence.resolveDiskChange('overwrite')
    expect(files.saves).toHaveLength(1)
    expect(files.saves[0].saveAs).toBe(false)
    expect(disk.text).toBe(BASE)
    expect(documentStore.raw.entries).toHaveLength(1)
    expect(persistence.diskChanged).toBe(false)
  })

  it('Cancel closes the prompt but not the divergence; the same change does not re-prompt, a newer one does', async () => {
    const { files, change } = nativeFiles()
    const { persistence } = await openedApp(files)
    change(WITH_MCP)
    await persistence.checkDiskFile()
    await persistence.resolveDiskChange('cancel')
    expect(persistence.diskPromptOpen).toBe(false)
    expect(persistence.diskChanged).toBe(true)
    expect(persistence.chipText).toBe(DISK_CHANGED_TEXT)

    await persistence.checkDiskFile()
    expect(persistence.diskPromptOpen).toBe(false)

    persistence.showDiskPrompt()
    expect(persistence.diskPromptOpen).toBe(true)
    await persistence.resolveDiskChange('cancel')

    change(WITH_MCP + '\n')
    await persistence.checkDiskFile()
    expect(persistence.diskPromptOpen).toBe(true)
  })
})

describe('Save never silently overwrites a file that changed on disk', () => {
  it('Save raises the prompt instead of writing', async () => {
    const { files, change, disk } = nativeFiles()
    const { persistence } = await openedApp(files)
    change(WITH_MCP)
    const result = await persistence.saveFile()
    expect(result).toEqual({ ok: false, conflict: true })
    expect(files.saves).toEqual([])
    expect(disk.text).toBe(WITH_MCP)
    expect(persistence.diskPromptOpen).toBe(true)
  })

  it('the app’s own Save does not look like an outside change afterwards', async () => {
    const { files } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    documentStore.append({ id: 'mine', op: 'primitive.sphere', name: 'Mine', params: { diameter: 10, center: [0, 30, 5] } })
    expect(await persistence.saveFile()).toMatchObject({ ok: true })
    await persistence.checkDiskFile()
    expect(persistence.diskChanged).toBe(false)
  })

  it('Save As goes to a new file the user picks, so it is not held back', async () => {
    const { files, change } = nativeFiles()
    const { persistence } = await openedApp(files)
    change(WITH_MCP)
    expect(await persistence.saveFile({ saveAs: true })).toMatchObject({ ok: true })
    expect(files.saves).toHaveLength(1)
  })
})

describe('never under a finger', () => {
  it('waits while a drag or another dialog is open, then opens', async () => {
    const { files, change } = nativeFiles()
    const { persistence } = await openedApp(files)
    persistence.setUiBusy(true)
    change(WITH_MCP)
    await persistence.checkDiskFile()
    expect(persistence.diskChanged).toBe(true)
    expect(persistence.diskPromptOpen).toBe(false)
    persistence.setUiBusy(false)
    expect(persistence.diskPromptOpen).toBe(true)
  })

  it('File ▸ New forgets the file, so its later changes are none of this project’s business', async () => {
    const { files, change } = nativeFiles()
    const { persistence } = await openedApp(files)
    persistence.newProject()
    change(WITH_MCP)
    await persistence.checkDiskFile()
    expect(persistence.diskChanged).toBe(false)
  })
})

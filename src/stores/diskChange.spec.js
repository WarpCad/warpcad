// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — duck-typed fakes of the file-storage boundary; the store under test is typed.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDocumentStore } from './document.js'
import { useMergeStore } from './merge.js'
import { DISK_CHANGED_TEXT, WAITING_TEXT, setPersistenceDependencies, usePersistenceStore } from './persistence.js'
import { parseProject } from '../core/project.js'

/**
 * `TODO/ai-009`, `TODO/io-010` — the app side of the MCP server: when the project file the app
 * opened is changed on disk by something else, the app notices on focus (and before Save) and
 * **merges the change in** (`ui-062`'s `mergeIn`); the three-answer dialog — **Reload**,
 * **Overwrite the file**, **Cancel** — remains only for a different project or an unreadable
 * file, and for File ▾ → Reload from disk.
 */

const BASE = '{"id":"base","op":"primitive.cuboid","name":"Base","params":{"size":[40,40,4],"center":[0,0,2]}}\n'
const WITH_MCP =
  BASE +
  '{"id":"cuboid-1","op":"primitive.cuboid","name":"Block","params":{"size":[10,10,10],"center":[30,0,5]}}\n' +
  '{"warpcad":"project-state","version":1,"origins":{"cuboid-1":"mcp"},"intents":{"cuboid-1":"add a block beside the base"}}\n'
/** A second outside change: another row, this one not from the MCP server. */
const WITH_TWO =
  BASE +
  '{"id":"cuboid-1","op":"primitive.cuboid","name":"Block","params":{"size":[10,10,10],"center":[30,0,5]}}\n' +
  '{"id":"plate-1","op":"primitive.cuboid","name":"Plate","params":{"size":[50,50,2],"center":[0,0,-1]}}\n' +
  '{"warpcad":"project-state","version":1,"origins":{"cuboid-1":"mcp"}}\n'
/** A different project that happens to use the id `base` for a different record. */
const OTHER = '{"id":"base","op":"primitive.sphere","name":"Ball","params":{"diameter":30,"center":[0,0,15]}}\n'
/** A file this build cannot read: a truncated second line. */
const TRUNCATED = WITH_MCP.slice(0, BASE.length + 20)

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

describe('a change on disk merges in by itself (TODO/io-010)', () => {
  it('focus with a changed file merges it: the row arrives with its origin and intent, no dialog, a toast', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    change(WITH_MCP)
    await persistence.checkDiskFile()

    const entries = documentStore.raw.entries
    expect(entries.map((entry) => entry.origin)).toEqual(['local', 'mcp'])
    expect(entries[1].intent).toBe('add a block beside the base')
    expect(persistence.diskChanged).toBe(false)
    expect(persistence.diskPromptOpen).toBe(false)
    expect(persistence.notice).toBe('Merged 1 step from Claude Code')
    expect(useMergeStore().notice).toMatchObject({ kind: 'toast', text: 'Merged 1 step from Claude Code', undoable: true })
    // Now in step with the file: checking again merges nothing.
    await persistence.checkDiskFile()
    expect(useMergeStore().notice.text).toBe('Merged 1 step from Claude Code')
  })

  it('an unsaved local step and the file’s step both survive; Save writes both and nothing else', async () => {
    const { files, change, disk } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    documentStore.append({ id: 'mine', op: 'primitive.sphere', name: 'Mine', params: { diameter: 10, center: [0, 30, 5] } })
    change(WITH_MCP)
    const result = await persistence.saveFile()

    expect(result).toMatchObject({ ok: true })
    expect(persistence.diskPromptOpen).toBe(false)
    expect(files.saves).toHaveLength(1)
    const written = parseProject(files.saves[0].text).entries.map((entry) => entry.record.id)
    expect(written).toEqual(expect.arrayContaining(['base', 'cuboid-1', 'mine']))
    expect(written).toHaveLength(3)
    expect(disk.text).toBe(files.saves[0].text)
    // The write is recorded as last seen: nothing looks like an outside change afterwards.
    await persistence.checkDiskFile()
    expect(persistence.diskChanged).toBe(false)
    expect(documentStore.raw.entries).toHaveLength(3)
  })

  it('Save with a changed file writes the merged text, even with a menu open (an explicit click)', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    persistence.setUiBusy(true)
    change(WITH_MCP)
    expect(await persistence.saveFile()).toMatchObject({ ok: true })
    expect(documentStore.raw.entries).toHaveLength(2)
    expect(parseProject(files.saves[0].text).entries).toHaveLength(2)
  })

  it('merges before the download fallback too (io-008): a refused native write still carries the merge', async () => {
    const { files, change } = nativeFiles()
    files.save = async (text) => {
      files.saves.push({ text, saveAs: false })
      return { ok: true, mode: 'fallback', name: 'bracket.ndjson', refusedName: 'bracket.ndjson' }
    }
    const { persistence } = await openedApp(files)
    change(WITH_MCP)
    expect(await persistence.saveFile()).toMatchObject({ ok: true, mode: 'fallback' })
    expect(parseProject(files.saves[0].text).entries.map((entry) => entry.record.id)).toEqual(['base', 'cuboid-1'])
  })

  it('a change arriving mid-gesture waits (chip says so), then merges when the gesture ends', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    persistence.setUiBusy(true)
    change(WITH_MCP)
    await persistence.checkDiskFile()

    expect(persistence.chipText).toBe(WAITING_TEXT)
    expect(WAITING_TEXT).toBe('Changes waiting to merge')
    expect(persistence.diskPromptOpen).toBe(false)
    expect(documentStore.raw.entries).toHaveLength(1)

    persistence.setUiBusy(false)
    await vi.waitFor(() => expect(documentStore.raw.entries).toHaveLength(2))
    expect(persistence.diskChanged).toBe(false)
    expect(persistence.notice).toBe('Merged 1 step from Claude Code')
  })

  it('two changes in a row merge twice; the second toast replaces the first and names the file', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    change(WITH_MCP)
    await persistence.checkDiskFile()
    expect(useMergeStore().notice.text).toBe('Merged 1 step from Claude Code')

    change(WITH_TWO)
    await persistence.checkDiskFile()
    expect(documentStore.raw.entries).toHaveLength(3)
    expect(useMergeStore().notice.text).toBe('Merged 1 step from bracket.ndjson')
    expect(persistence.notice).toBe('Merged 1 step from bracket.ndjson')
  })

  it('Undo merge takes the file’s rows back out', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    change(WITH_MCP)
    await persistence.checkDiskFile()
    expect(useMergeStore().undoMerge()).toMatchObject({ ok: true })
    expect(documentStore.raw.entries).toHaveLength(1)
  })
})

describe('what still asks: a different project, an unreadable file, Reload from disk', () => {
  it('a different project opens the dialog with its reason, and merges nothing', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    const version = documentStore.raw.version
    change(OTHER)
    await persistence.checkDiskFile()

    expect(persistence.diskPromptOpen).toBe(true)
    expect(persistence.diskIssueText).toMatch(/different project/)
    expect(persistence.chipText).toBe(DISK_CHANGED_TEXT)
    expect(persistence.chipTone).toBe('warn')
    expect(DISK_CHANGED_TEXT).toBe('File changed on disk — Reload')
    expect(documentStore.raw.version).toBe(version)
    expect(documentStore.raw.entries).toHaveLength(1)
  })

  it('an unreadable file opens the dialog and says so; the project is untouched', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    change(TRUNCATED)
    await persistence.checkDiskFile()
    expect(persistence.diskPromptOpen).toBe(true)
    expect(persistence.diskIssueText).toMatch(/^Couldn't read bracket\.ndjson: line 2 is not valid JSON/)
    expect(documentStore.raw.entries).toHaveLength(1)
  })

  it('Save with a different project’s bytes on disk writes nothing and asks instead', async () => {
    const { files, change, disk } = nativeFiles()
    const { persistence } = await openedApp(files)
    change(OTHER)
    const result = await persistence.saveFile()
    expect(result).toEqual({ ok: false, conflict: true })
    expect(files.saves).toEqual([])
    expect(disk.text).toBe(OTHER)
    expect(persistence.diskPromptOpen).toBe(true)
  })

  it('Reload replaces the project with the file', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    change(OTHER)
    await persistence.checkDiskFile()
    await persistence.resolveDiskChange('reload')
    expect(documentStore.raw.entries.map((entry) => entry.record.name)).toEqual(['Ball'])
    expect(persistence.diskChanged).toBe(false)
    await persistence.checkDiskFile()
    expect(persistence.diskChanged).toBe(false)
  })

  it('Reload of a file this build cannot read refuses it by name and leaves the project alone', async () => {
    const { files, change } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    change(TRUNCATED)
    await persistence.checkDiskFile()
    await persistence.resolveDiskChange('reload')
    expect(persistence.errorMessage).toMatch(/^Couldn't open bracket\.ndjson: line 2 is not valid JSON/)
    expect(documentStore.raw.entries).toHaveLength(1)
    expect(persistence.diskPromptOpen).toBe(false)
  })

  it('Overwrite writes this project over the file, in place — and only on that explicit answer', async () => {
    const { files, change, disk } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    change(OTHER)
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
    change(OTHER)
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

    change(OTHER + '\n')
    await persistence.checkDiskFile()
    expect(persistence.diskPromptOpen).toBe(true)
  })

  it('File ▾ → Reload from disk asks even when nothing changed, and Cancel leaves no warning behind', async () => {
    const { files } = nativeFiles()
    const { persistence } = await openedApp(files)
    await persistence.askReloadFromDisk()
    expect(persistence.diskPromptOpen).toBe(true)
    expect(persistence.diskIssueIsManual).toBe(true)
    await persistence.resolveDiskChange('cancel')
    expect(persistence.diskChanged).toBe(false)
  })

  it('Save As goes to a new file the user picks, so it is not held back', async () => {
    const { files, change } = nativeFiles()
    const { persistence } = await openedApp(files)
    change(OTHER)
    expect(await persistence.saveFile({ saveAs: true })).toMatchObject({ ok: true })
    expect(files.saves).toHaveLength(1)
  })

  it('the app’s own Save does not look like an outside change afterwards', async () => {
    const { files } = nativeFiles()
    const { persistence, documentStore } = await openedApp(files)
    documentStore.append({ id: 'mine', op: 'primitive.sphere', name: 'Mine', params: { diameter: 10, center: [0, 30, 5] } })
    expect(await persistence.saveFile()).toMatchObject({ ok: true })
    await persistence.checkDiskFile()
    expect(persistence.diskChanged).toBe(false)
  })

  it('a dialog waits while a drag or another dialog is open, then opens', async () => {
    const { files, change } = nativeFiles()
    const { persistence } = await openedApp(files)
    persistence.setUiBusy(true)
    change(OTHER)
    await persistence.checkDiskFile()
    expect(persistence.diskChanged).toBe(true)
    expect(persistence.diskPromptOpen).toBe(false)
    persistence.setUiBusy(false)
    await vi.waitFor(() => expect(persistence.diskPromptOpen).toBe(true))
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

describe('a file opened without a handle may have changed (TODO/io-012)', () => {
  const MAY_HAVE_CHANGED = 'This file may have changed. Use File ▾ → Merge file… to bring it in.'

  it('focus on a project opened from a handle-less file warns, and merges nothing', async () => {
    const { persistence, documentStore } = await openedApp(fallbackFiles())
    const version = documentStore.version
    await persistence.checkDiskFile()
    expect(persistence.fileMayHaveChanged).toBe(true)
    expect(persistence.chipText).toBe(MAY_HAVE_CHANGED)
    expect(persistence.chipTone).toBe('warn')
    expect(persistence.diskChanged).toBe(false)
    expect(documentStore.version).toBe(version)
  })

  it('a project that was never opened from a file raises no warning', async () => {
    setPersistenceDependencies({ backend: quietBackend(), files: fallbackFiles() })
    const persistence = usePersistenceStore()
    await persistence.start()
    await persistence.checkDiskFile()
    expect(persistence.fileMayHaveChanged).toBe(false)
  })

  it('a watched native file is noticed by the disk check, not warned about', async () => {
    const { files } = nativeFiles()
    const { persistence } = await openedApp(files)
    await persistence.checkDiskFile()
    expect(persistence.fileMayHaveChanged).toBe(false)
  })

  it('Merge file… clears the warning', async () => {
    const { persistence } = await openedApp(fallbackFiles())
    await persistence.checkDiskFile()
    expect(persistence.fileMayHaveChanged).toBe(true)
    await persistence.mergeFile()
    expect(persistence.fileMayHaveChanged).toBe(false)
  })

  it('a save clears the warning', async () => {
    const { persistence } = await openedApp(fallbackFiles())
    await persistence.checkDiskFile()
    expect(persistence.fileMayHaveChanged).toBe(true)
    await persistence.saveFile()
    expect(persistence.fileMayHaveChanged).toBe(false)
  })
})

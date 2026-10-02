// @ts-nocheck — this spec drives hand-written duck-typed fakes of browser globals (`window`,
// `indexedDB` via `idb`, the File System Access handles). Typing each fake against the full DOM
// / `idb` interfaces would be more code than the fakes; the *modules under test* are fully
// typed and checked by `npm run typecheck`, which is what the gate is for.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { serializeProject } from '../core/project.js'
import { useDocumentStore } from './document.js'
import { setPersistenceDependencies, usePersistenceStore } from './persistence.js'
import { useSelectionStore } from './selection.js'

/**
 * `TODO/io-001` — the store that wires the storage boundary to the document and
 * to the header chip. Everything at the boundary is faked (CLAUDE.md: mock the
 * boundary); the real document store, the real kernel and the real
 * `project.js` are used, because "restore is faithful" is a claim about them.
 */

const cube = (id, at) => ({
  id,
  op: 'primitive.cuboid',
  name: id,
  params: { size: [10, 10, 10], center: at },
})

/** @param {{ stored?: any, loadFails?: boolean, saveFails?: boolean }} [options] */
function fakeBackend(options = {}) {
  const backend = {
    stored: options.stored ?? null,
    saves: /** @type {any[]} */ ([]),
    unreadable: /** @type {any[]} */ ([]),
    saveFails: options.saveFails ?? false,
    async load() {
      if (options.loadFails) throw new Error('SecurityError: insecure')
      return backend.stored
    },
    async save(record) {
      if (backend.saveFails) throw new Error('quota')
      backend.saves.push(record)
      backend.stored = record
    },
    async keepUnreadable(record) {
      backend.unreadable.push(record)
    },
  }
  return backend
}

/** @param {'native' | 'fallback'} [mode] */
function fakeFiles(mode = 'fallback') {
  const files = {
    capabilities: {
      mode,
      canSaveInPlace: mode === 'native',
      saveLabel: mode === 'native' ? 'Save' : 'Download copy',
      saveAsLabel: mode === 'native' ? 'Save As…' : null,
      openLabel: 'Open…',
    },
    currentName: null,
    saved: /** @type {string[]} */ ([]),
    adopted: /** @type {any[]} */ ([]),
    nextSave: /** @type {any} */ (null),
    nextOpen: /** @type {any} */ (null),
    async save(text) {
      files.saved.push(text)
      return files.nextSave ?? { ok: true, mode, name: 'warpcad-project-20260919-1402.ndjson' }
    },
    async open() {
      return files.nextOpen
    },
    adopt(result) {
      files.adopted.push(result)
    },
    forgot: 0,
    forgetHandle() {
      files.forgot += 1
    },
  }
  return files
}

describe('usePersistenceStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 19, 14, 2, 0))
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.useRealTimers()
    setPersistenceDependencies(null)
  })

  /** Serialise a two-cube project by driving a throwaway document store. */
  function twoCubeText() {
    setActivePinia(createPinia())
    const documentStore = useDocumentStore()
    documentStore.append(cube('cube-1', [0, 0, 5]))
    documentStore.append(cube('cube-2', [40, 0, 5]))
    const text = serializeProject(documentStore.raw)
    setActivePinia(createPinia())
    return text
  }

  it('starts quiet: nothing is written until the document changes', async () => {
    const backend = fakeBackend()
    setPersistenceDependencies({ backend, files: fakeFiles() })
    const persistence = usePersistenceStore()
    await persistence.start()
    await vi.advanceTimersByTimeAsync(5000)
    expect(backend.saves).toEqual([])
    expect(persistence.chipText).toBe('Autosave on')
    expect(persistence.errorMessage).toBe('')
  })

  it('autosaves a debounced write after a document mutation, and the chip says so', async () => {
    const backend = fakeBackend()
    setPersistenceDependencies({ backend, files: fakeFiles() })
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()

    documentStore.append(cube('cube-1', [0, 0, 5]))
    await nextTick()
    expect(persistence.chipText).toBe('Saving…')
    expect(backend.saves).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(600)
    expect(backend.saves).toHaveLength(1)
    expect(backend.saves[0].text).toBe(serializeProject(documentStore.raw))
    expect(persistence.chipText).toBe('Saved · 14:02')
    expect(persistence.chipTone).toBe('saved')
  })

  it('does not write on start-up restore — restoring is not an edit', async () => {
    const text = twoCubeText()
    const backend = fakeBackend({ stored: { text, savedAt: 1 } })
    setPersistenceDependencies({ backend, files: fakeFiles() })
    const persistence = usePersistenceStore()
    await persistence.start()
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(backend.saves).toEqual([])
  })

  it('restores the stored document silently, with no prompt, and says so for a few seconds', async () => {
    const text = twoCubeText()
    setPersistenceDependencies({
      backend: fakeBackend({ stored: { text, savedAt: 1 } }),
      files: fakeFiles(),
    })
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()

    expect(documentStore.bodies.map((body) => body.id)).toEqual(['cube-1', 'cube-2'])
    expect(persistence.chipText).toBe('Restored your last session')
    await vi.advanceTimersByTimeAsync(6100)
    expect(persistence.chipText).toMatch(/^Autosave on$|^Saved · /)
  })

  it('leaves undo and redo empty after a restore, and the first new edit is undoable on its own', async () => {
    const text = twoCubeText()
    setPersistenceDependencies({
      backend: fakeBackend({ stored: { text, savedAt: 1 } }),
      files: fakeFiles(),
    })
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()

    expect(documentStore.canUndo).toBe(false)
    expect(documentStore.canRedo).toBe(false)

    documentStore.append(cube('cube-3', [80, 0, 5]))
    expect(documentStore.canUndo).toBe(true)
    documentStore.undo()
    expect(documentStore.bodies.map((body) => body.id)).toEqual(['cube-1', 'cube-2'])
    expect(documentStore.canUndo).toBe(false) // the restored steps are not undoable
  })

  it('a restore bumps the load revision the viewport frames on, and clears selection', async () => {
    const text = twoCubeText()
    setPersistenceDependencies({
      backend: fakeBackend({ stored: { text, savedAt: 1 } }),
      files: fakeFiles(),
    })
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    useSelectionStore().select('cube-1')
    const before = documentStore.loadRevision
    await persistence.start()
    expect(documentStore.loadRevision).toBe(before + 1)
    expect(useSelectionStore().ids).toEqual([])
  })

  it('does not overwrite an edit the user made while the restore was still reading', async () => {
    const text = twoCubeText()
    /** @type {() => void} */
    let release = () => {}
    const backend = fakeBackend({ stored: { text, savedAt: 1 } })
    backend.load = () => new Promise((resolve) => (release = () => resolve(backend.stored)))
    setPersistenceDependencies({ backend, files: fakeFiles() })
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()

    const starting = persistence.start()
    await vi.advanceTimersByTimeAsync(0) // let the read begin
    documentStore.append(cube('early', [0, 50, 5])) // the user got there first
    release()
    await starting

    expect(documentStore.bodies.map((body) => body.id)).toEqual(['early'])
    await vi.advanceTimersByTimeAsync(600)
    expect(serializeProject(documentStore.raw)).toBe(backend.saves[backend.saves.length - 1].text)
  })

  it('a refused autosave is kept aside, named on the chip, and the app starts empty and usable', async () => {
    const bad = '{"id":"a","op":"future.warp","params":{}}\n'
    const backend = fakeBackend({ stored: { text: bad, savedAt: 1 } })
    setPersistenceDependencies({ backend, files: fakeFiles() })
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()

    expect(backend.unreadable).toEqual([{ text: bad, savedAt: 1 }])
    expect(persistence.chipTone).toBe('error')
    expect(persistence.chipText).toMatch(/couldn.t restore your last session/i)
    expect(persistence.chipText).toMatch(/future\.warp/)
    expect(documentStore.count).toBe(0)

    // Still usable, and autosave resumes (over the autosave key, not the rescue copy).
    documentStore.append(cube('cube-1', [0, 0, 5]))
    await vi.advanceTimersByTimeAsync(600)
    expect(backend.saves).toHaveLength(1)
    expect(backend.unreadable).toHaveLength(1)
  })

  it('a garbage autosave (not JSON at all) is refused the same way', async () => {
    const backend = fakeBackend({ stored: { text: 'hello world\n', savedAt: 1 } })
    setPersistenceDependencies({ backend, files: fakeFiles() })
    const persistence = usePersistenceStore()
    await persistence.start()
    expect(persistence.chipTone).toBe('error')
    expect(backend.unreadable).toHaveLength(1)
  })

  it('a blocked store at startup shows the persistent error and the app works anyway', async () => {
    const backend = fakeBackend({ loadFails: true, saveFails: true })
    setPersistenceDependencies({ backend, files: fakeFiles() })
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()

    expect(persistence.chipTone).toBe('error')
    expect(persistence.chipText).toBe('Not saved — browser storage unavailable')

    documentStore.append(cube('cube-1', [0, 0, 5]))
    expect(documentStore.count).toBe(1)
    await vi.advanceTimersByTimeAsync(600)
    expect(persistence.chipTone).toBe('error') // still says so
    expect(backend.saves).toEqual([])
    expect(documentStore.count).toBe(1)
  })

  it('a later successful write clears the error', async () => {
    const backend = fakeBackend({ saveFails: true })
    setPersistenceDependencies({ backend, files: fakeFiles() })
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()

    documentStore.append(cube('cube-1', [0, 0, 5]))
    await vi.advanceTimersByTimeAsync(600)
    expect(persistence.chipTone).toBe('error')

    backend.saveFails = false
    documentStore.append(cube('cube-2', [40, 0, 5]))
    await vi.advanceTimersByTimeAsync(600)
    expect(persistence.chipTone).toBe('saved')
    expect(persistence.errorMessage).toBe('')
  })

  it('flushes immediately on visibilitychange → hidden, before the debounce fires', async () => {
    const backend = fakeBackend()
    setPersistenceDependencies({ backend, files: fakeFiles() })
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()

    documentStore.append(cube('cube-1', [0, 0, 5]))
    await nextTick()
    expect(backend.saves).toHaveLength(0)

    persistence.onVisibilityChange('hidden')
    await vi.advanceTimersByTimeAsync(0)
    expect(backend.saves).toHaveLength(1)

    // Coming back to the tab is not an edit.
    persistence.onVisibilityChange('visible')
    await vi.advanceTimersByTimeAsync(1000)
    expect(backend.saves).toHaveLength(1)
  })

  /** In-memory stand-in for the localStorage safety copy. */
  function fakeMirror(record = null) {
    const mirror = {
      record,
      write(value) {
        mirror.record = value
      },
      read: () => mirror.record,
      clear() {
        mirror.record = null
      },
    }
    return mirror
  }

  it('a page hide copies the unsaved log to the synchronous mirror before anything async can run', async () => {
    const backend = fakeBackend()
    const mirror = fakeMirror()
    setPersistenceDependencies({ backend, files: fakeFiles(), mirror })
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()
    documentStore.append(cube('cube-1', [0, 0, 5]))
    await nextTick()

    persistence.onVisibilityChange('hidden')
    expect(mirror.record?.text).toBe(serializeProject(documentStore.raw)) // synchronous: no await
    await vi.advanceTimersByTimeAsync(0)
    expect(backend.saves).toHaveLength(1)
    expect(mirror.record).toBeNull() // IndexedDB has it now, so the lifeboat is cleared
  })

  it('restores a session the page died before saving to IndexedDB, from the mirror, and then saves it there', async () => {
    const text = twoCubeText()
    const backend = fakeBackend() // IndexedDB never got the write
    const mirror = fakeMirror({ text, savedAt: Date.now() })
    setPersistenceDependencies({ backend, files: fakeFiles(), mirror })
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()

    expect(documentStore.bodies.map((body) => body.id)).toEqual(['cube-1', 'cube-2'])
    expect(persistence.chipText).toBe('Restored your last session')
    await vi.advanceTimersByTimeAsync(600)
    expect(backend.saves.map((save) => save.text)).toEqual([text])
    expect(mirror.record).toBeNull()
  })

  it('persists a suppressed row and a rollback marker through a restore', async () => {
    setActivePinia(createPinia())
    const source = useDocumentStore()
    source.append(cube('cube-1', [0, 0, 5]))
    source.append(cube('cube-2', [40, 0, 5]))
    source.append(cube('cube-3', [80, 0, 5]))
    source.raw.setSuppressed('cube-2', true, { origin: 'local' })
    source.raw.rollBackTo('cube-2', { origin: 'local' })
    const text = serializeProject(source.raw)

    setActivePinia(createPinia())
    setPersistenceDependencies({
      backend: fakeBackend({ stored: { text, savedAt: 1 } }),
      files: fakeFiles(),
    })
    const persistence = usePersistenceStore()
    const restored = useDocumentStore()
    await persistence.start()

    expect(restored.raw.rollbackAt()).toBe(2)
    expect(restored.raw.timeline().map((row) => [row.suppressed, row.active])).toEqual([
      [false, true],
      [true, true],
      [false, false],
    ])
    expect(serializeProject(restored.raw)).toBe(text)
  })

  describe('file Save (the API ui-033 calls)', () => {
    it('exposes the capability check ui-033 labels its menu from', () => {
      setPersistenceDependencies({ backend: fakeBackend(), files: fakeFiles('fallback') })
      expect(usePersistenceStore().fileCapabilities).toMatchObject({
        mode: 'fallback',
        saveLabel: 'Download copy',
        saveAsLabel: null,
      })
    })

    it('writes the same bytes autosave writes, and says a download STARTED (never "saved") on the fallback', async () => {
      const files = fakeFiles('fallback')
      setPersistenceDependencies({ backend: fakeBackend(), files })
      const persistence = usePersistenceStore()
      const documentStore = useDocumentStore()
      await persistence.start()
      documentStore.append(cube('cube-1', [0, 0, 5]))

      const result = await persistence.saveFile()
      expect(result.ok).toBe(true)
      expect(files.saved).toEqual([serializeProject(documentStore.raw)])
      expect(persistence.chipText).toBe('Download started: warpcad-project-20260919-1402.ndjson')
      await vi.advanceTimersByTimeAsync(6100)
      expect(persistence.chipText).not.toMatch(/Download started/)
    })

    it('says "Saved to <name>" on the native path', async () => {
      const files = fakeFiles('native')
      files.nextSave = { ok: true, mode: 'native', name: 'warpcad-project.ndjson' }
      setPersistenceDependencies({ backend: fakeBackend(), files })
      const persistence = usePersistenceStore()
      await persistence.start()
      await persistence.saveFile()
      expect(persistence.chipText).toBe('Saved to warpcad-project.ndjson · 14:02')
    })

    it('a cancelled picker is silent', async () => {
      const files = fakeFiles('native')
      files.nextSave = { ok: false, cancelled: true }
      setPersistenceDependencies({ backend: fakeBackend(), files })
      const persistence = usePersistenceStore()
      await persistence.start()
      const before = persistence.chipText
      await persistence.saveFile()
      expect(persistence.chipText).toBe(before)
      expect(persistence.errorMessage).toBe('')
    })

    it('a write failure is a persistent error that names the file', async () => {
      const files = fakeFiles('native')
      files.nextSave = { ok: false, error: 'NotAllowedError: permission revoked', name: 'warpcad-project.ndjson' }
      setPersistenceDependencies({ backend: fakeBackend(), files })
      const persistence = usePersistenceStore()
      await persistence.start()
      await persistence.saveFile()
      expect(persistence.chipTone).toBe('error')
      expect(persistence.chipText).toMatch(/warpcad-project\.ndjson/)
      expect(persistence.chipText).toMatch(/permission revoked/)
    })
  })

  describe('newProject (TODO/ui-054)', () => {
    it('empties the document and selection, clears history, resets the resolution and forgets the Save target', async () => {
      const files = fakeFiles('native')
      setPersistenceDependencies({ backend: fakeBackend(), files })
      const persistence = usePersistenceStore()
      const documentStore = useDocumentStore()
      await persistence.start()
      documentStore.append(cube('mine', [0, 0, 5]))
      useSelectionStore().select('mine')

      persistence.newProject()

      expect(documentStore.bodies).toEqual([])
      expect(documentStore.raw.entries).toHaveLength(0)
      expect(useSelectionStore().ids).toEqual([])
      expect(documentStore.canUndo).toBe(false)
      expect(documentStore.raw.resolution()).toBe('normal')
      expect(files.forgot).toBe(1)
      expect(persistence.chipText).toBe('New project · 14:02')
    })

    it('is refused while a load is still pending', async () => {
      const files = fakeFiles('native')
      setPersistenceDependencies({ backend: fakeBackend(), files })
      const persistence = usePersistenceStore()
      await persistence.start()
      persistence.loading = 'Opening x…'
      expect(persistence.newProject()).toBe(false)
      expect(files.forgot).toBe(0)
    })
  })

  describe('file Open (the API ui-033 calls)', () => {
    it('replaces the document, selects nothing, clears history, and adopts the file', async () => {
      const text = twoCubeText()
      const files = fakeFiles('native')
      files.nextOpen = { ok: true, name: 'theirs.ndjson', text, handle: {} }
      setPersistenceDependencies({ backend: fakeBackend(), files })
      const persistence = usePersistenceStore()
      const documentStore = useDocumentStore()
      await persistence.start()
      documentStore.append(cube('mine', [0, 0, 5]))
      useSelectionStore().select('mine')

      const result = await persistence.openFile()

      expect(result).toEqual({ ok: true, name: 'theirs.ndjson', steps: 2 })
      expect(documentStore.bodies.map((body) => body.id)).toEqual(['cube-1', 'cube-2'])
      expect(useSelectionStore().ids).toEqual([])
      expect(documentStore.canUndo).toBe(false)
      expect(files.adopted).toHaveLength(1)
      expect(persistence.chipText).toBe('Opened theirs.ndjson · 2 steps')
    })

    it('an opened file is autosaved as the new current document', async () => {
      const text = twoCubeText()
      const backend = fakeBackend()
      const files = fakeFiles('fallback')
      files.nextOpen = { ok: true, name: 'theirs.ndjson', text }
      setPersistenceDependencies({ backend, files })
      const persistence = usePersistenceStore()
      await persistence.start()
      await persistence.openFile()
      await nextTick()
      await vi.advanceTimersByTimeAsync(600)
      expect(backend.saves[backend.saves.length - 1].text).toBe(text)
    })

    it('refuses a bad file by name and leaves the current project untouched — and does not adopt it', async () => {
      const files = fakeFiles('native')
      files.nextOpen = { ok: true, name: 'broken.ndjson', text: '{"id":"a","op":"primitive.cuboid"}\nnot json\n', handle: {} }
      setPersistenceDependencies({ backend: fakeBackend(), files })
      const persistence = usePersistenceStore()
      const documentStore = useDocumentStore()
      await persistence.start()
      documentStore.append(cube('mine', [0, 0, 5]))
      const before = serializeProject(documentStore.raw)

      const result = await persistence.openFile()

      expect(result.ok).toBe(false)
      expect(serializeProject(documentStore.raw)).toBe(before)
      expect(documentStore.canUndo).toBe(true) // history survived the refusal
      expect(files.adopted).toEqual([])
      expect(persistence.chipTone).toBe('error')
      expect(persistence.chipText).toMatch(/broken\.ndjson/)
      expect(persistence.chipText).toMatch(/line 2/)
    })

    it('refuses an op this version does not know, by name, atomically', async () => {
      const files = fakeFiles('fallback')
      files.nextOpen = {
        ok: true,
        name: 'newer.ndjson',
        text:
          '{"id":"a","op":"primitive.cuboid","params":{"size":[1,1,1],"center":[0,0,0]}}\n' +
          '{"id":"b","op":"future.warp","params":{}}\n',
      }
      setPersistenceDependencies({ backend: fakeBackend(), files })
      const persistence = usePersistenceStore()
      const documentStore = useDocumentStore()
      await persistence.start()
      documentStore.append(cube('mine', [0, 0, 5]))

      const result = await persistence.openFile()
      expect(result.ok).toBe(false)
      expect(documentStore.bodies.map((body) => body.id)).toEqual(['mine'])
      expect(persistence.chipText).toMatch(/newer\.ndjson/)
      expect(persistence.chipText).toMatch(/future\.warp/)
    })

    it('a cancelled picker changes nothing', async () => {
      const files = fakeFiles('fallback')
      files.nextOpen = { ok: false, cancelled: true }
      setPersistenceDependencies({ backend: fakeBackend(), files })
      const persistence = usePersistenceStore()
      const documentStore = useDocumentStore()
      await persistence.start()
      documentStore.append(cube('mine', [0, 0, 5]))
      const result = await persistence.openFile()
      expect(result).toEqual({ ok: false, cancelled: true })
      expect(documentStore.count).toBe(1)
      expect(persistence.errorMessage).toBe('')
    })
  })
})

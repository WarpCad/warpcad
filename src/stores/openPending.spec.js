// @ts-nocheck — duck-typed fakes of the storage boundary; the modules under test are fully
// typed and checked by `npm run typecheck`.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toRaw } from 'vue'

import { observe } from '../core/__fixtures__/documentObservation.js'
import { createDocument } from '../core/document.js'
import { parseProject, serializeProject } from '../core/project.js'
import { useDocumentStore } from './document.js'
import { useFileMenuStore } from './fileMenu.js'
import { setHostedDependencies } from './hosted.js'
import { setPersistenceDependencies, usePersistenceStore } from './persistence.js'

/**
 * `TODO/core-032` — Open, hosted Load and autosave restore **announce** themselves before
 * they fold (slice 4 of `docs/decisions/kernel-evaluation-worker.md`, option 2).
 *
 * The fold stays the same synchronous, atomic `loadEntries` it always was (measured: a
 * worker fold would make every realistic Open slower and still leave ~80-140 ms at 4× on
 * the large fixtures). What changes is the order: a pending state is set, a frame is
 * painted with it, and only then does the fold run. So:
 *
 * 1. the pending state is visible **before** anything is replaced;
 * 2. what is loaded is exactly what the plain synchronous fold loads — checked with the
 *    same differential comparison `core/historyRestore.spec.js` uses;
 * 3. a refused Open still names the row, still changes nothing, and still reaches the
 *    same chip message — now after the pending state, which it clears;
 * 4. nothing can start a second Open while one is pending.
 *
 * The "painted a frame" wait is the boundary here (`nextPaint`), mocked with a promise the
 * spec releases by hand — CLAUDE.md: mock `requestAnimationFrame` at the boundary.
 */

const local = { origin: 'local' }

const cube = (id, at = [0, 0, 5]) => ({ id, op: 'primitive.cuboid', name: id, params: { size: [10, 10, 10], center: at } })

/** A paint the spec releases by hand, counting how many were asked for. */
function manualPaint() {
  const paint = {
    asked: 0,
    /** @type {Array<() => void>} */
    pending: [],
    nextPaint: () =>
      new Promise((resolve) => {
        paint.asked += 1
        paint.pending.push(() => resolve(undefined))
      }),
    release() {
      const waiting = paint.pending.splice(0)
      for (const resolve of waiting) resolve()
    },
  }
  return paint
}

function fakeBackend(stored = null) {
  return {
    stored,
    saves: [],
    async load() {
      return this.stored
    },
    async save(record) {
      this.saves.push(record)
    },
    async keepUnreadable() {},
  }
}

function fakeFiles() {
  return {
    capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
    opens: 0,
    adopted: [],
    nextOpen: { ok: false, cancelled: true },
    async save() {
      return { ok: true, mode: 'fallback', name: 'x.ndjson' }
    },
    async open() {
      this.opens += 1
      return this.nextOpen
    },
    adopt(picked) {
      this.adopted.push(picked)
    },
    forgetHandle() {},
  }
}

/**
 * A real-kernel project with a bit of everything the fold derives: a lineage (chamfer), a
 * boolean that consumes two bodies, a composite, a suppressed row and a rollback marker.
 */
function richProjectText() {
  const document = createDocument()
  document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }, local)
  document.append({ id: 'cube-1-chamfer', op: 'modify.chamferRim', target: 'cube-1', supersedes: 'cube-1', params: { radius: 3 } }, local)
  document.append({ id: 'plate', op: 'primitive.cuboid', name: 'Plate', params: { size: [60, 20, 5], center: [60, 0, 2.5] } }, local)
  document.append({ id: 'hole', op: 'primitive.cylinder', name: 'Hole', params: { diameter: 5, height: 20, center: [60, 0, 2.5] } }, local)
  document.append({ id: 'cut', op: 'boolean.subtract', name: 'Plate', target: 'plate', operands: ['hole'], consumes: ['plate', 'hole'] }, local)
  document.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 30 } }, local)
  document.append({ id: 'sphere-1', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 16, center: [-40, 0, 8] } }, local)
  document.setSuppressed('sphere-1', true, local)
  document.append({ id: 'cone-1', op: 'primitive.cone', name: 'Cone 1', params: { diameter: 10, height: 12, center: [-80, 0, 6] } }, local)
  document.rollBackTo('bolt', local)
  return serializeProject(document)
}

/** A file whose third row cannot be folded: a fillet over a chamfered rim is refused by name. */
function refusedProjectText() {
  return [
    { id: 'c', op: 'primitive.cuboid', name: 'Cube', params: { size: [20, 20, 20], center: [0, 0, 10] } },
    { id: 'c-ch', op: 'modify.chamferRim', target: 'c', supersedes: 'c', params: { radius: 5 } },
    { id: 'c-fi', op: 'modify.filletRim', target: 'c-ch', supersedes: 'c-ch', params: { face: 'bottom', radius: 2 } },
  ]
    .map((record) => JSON.stringify(record))
    .join('\n')
    .concat('\n')
}

/** What the plain synchronous path says about `text`, for the "same message" checks. */
function synchronousRefusalOf(text) {
  const { entries, rollbackAt, resolution } = parseProject(text)
  try {
    createDocument().loadEntries(entries, rollbackAt, resolution)
  } catch (error) {
    return error
  }
  throw new Error('expected the synchronous fold to refuse this file')
}

describe('Open announces itself before it folds (TODO/core-032)', () => {
  let paint
  let files
  let backend

  beforeEach(() => {
    setActivePinia(createPinia())
    paint = manualPaint()
    files = fakeFiles()
    backend = fakeBackend()
    setPersistenceDependencies({ backend, files, nextPaint: paint.nextPaint })
    setHostedDependencies({
      client: { apiOrigin: 'https://api.github.com', async read() { return { exists: false } }, async write() { return { sha: 's' } } },
      credentials: { async read() { return null }, async write() {}, async clear() {}, close() {} },
    })
  })
  afterEach(() => {
    setPersistenceDependencies(null)
  })

  it('shows "Opening <name>…" and replaces nothing until a frame has been painted with it', async () => {
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()
    documentStore.append(cube('mine'))
    const text = richProjectText()

    const opening = persistence.openText(text, 'theirs.ndjson')

    expect(persistence.loading).toBe('Opening theirs.ndjson…')
    expect(persistence.chipText).toBe('Opening theirs.ndjson…')
    expect(persistence.chipTone).toBe('saving')
    expect(paint.asked).toBe(1)
    // Nothing folded yet: the document on screen is still the user's.
    expect(documentStore.bodies.map((body) => body.id)).toEqual(['mine'])

    paint.release()
    const result = await opening

    expect(result).toEqual({ ok: true, name: 'theirs.ndjson', steps: parseProject(text).entries.length })
    expect(persistence.loading).toBe('')
    expect(persistence.chipText).toMatch(/^Opened theirs\.ndjson · \d+ steps$/)
  })

  it('loads exactly the document a plain synchronous fold of the same file produces', async () => {
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()
    const text = richProjectText()

    const opening = persistence.openText(text, 'rich.ndjson')
    paint.release()
    expect((await opening).ok).toBe(true)

    const { entries, rollbackAt, resolution } = parseProject(text)
    const reference = createDocument({ foldCache: null })
    reference.loadEntries(entries, rollbackAt, resolution)
    const loaded = toRaw(documentStore.raw)
    expect(observe(loaded)).toEqual(observe(reference))
    expect(loaded.rollbackAt()).not.toBeNull() // the fixture really did carry a marker through
    expect(loaded.canUndo()).toBe(false)
    expect(loaded.canRedo()).toBe(false)
  })

  it('a refused Open still names the row, changes nothing, and reaches the same chip message — after the pending state', async () => {
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()
    await persistence.start()
    documentStore.append(cube('mine'))
    const before = serializeProject(documentStore.raw)
    const text = refusedProjectText()
    const expected = synchronousRefusalOf(text)
    expect(expected.name).toBe('ReplayRejection')

    const opening = persistence.openText(text, 'broken.ndjson')
    expect(persistence.loading).toBe('Opening broken.ndjson…')
    expect(persistence.errorMessage).toBe('')

    paint.release()
    const result = await opening

    expect(result).toEqual({ ok: false, message: expected.message })
    expect(expected.message).toMatch(/^Step 3 \(/) // names the row
    expect(persistence.loading).toBe('')
    expect(persistence.errorMessage).toBe(`Couldn't open broken.ndjson: ${expected.message}`)
    expect(persistence.chipTone).toBe('error')
    expect(serializeProject(documentStore.raw)).toBe(before)
    expect(documentStore.canUndo).toBe(true) // the user's history survived the refusal
  })

  it('a refused file from the picker is not adopted, and the picker result is unchanged', async () => {
    const persistence = usePersistenceStore()
    await persistence.start()
    files.nextOpen = { ok: true, name: 'broken.ndjson', text: refusedProjectText() }

    const opening = persistence.openFile()
    // The picker resolves on a microtask; the pending state follows it.
    await Promise.resolve()
    await Promise.resolve()
    expect(persistence.loading).toBe('Opening broken.ndjson…')
    paint.release()
    const result = await opening

    expect(result.ok).toBe(false)
    expect(files.adopted).toEqual([])
  })

  it('nothing can start a second Open while one is pending', async () => {
    const persistence = usePersistenceStore()
    const menu = useFileMenuStore()
    await persistence.start()

    const opening = persistence.openText(richProjectText(), 'first.ndjson')
    expect(persistence.loading).not.toBe('')

    menu.requestOpen()
    expect(files.opens).toBe(0)
    expect(menu.confirm).toBeNull()
    const second = await persistence.openText(richProjectText(), 'second.ndjson')
    expect(second).toEqual({ ok: false, message: 'Another file is still opening' })

    paint.release()
    expect((await opening).ok).toBe(true)
    expect(persistence.chipText).toMatch(/^Opened first\.ndjson/)
  })

  it('autosave restore says "Restoring your last session…" before it folds', async () => {
    backend.stored = { text: richProjectText(), savedAt: 1 }
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()

    const starting = persistence.start()
    for (let tick = 0; tick < 10 && paint.asked === 0; tick += 1) await Promise.resolve()

    expect(paint.asked).toBe(1)
    expect(persistence.chipText).toBe('Restoring your last session…')
    expect(documentStore.count).toBe(0)

    paint.release()
    await starting
    expect(persistence.loading).toBe('')
    expect(persistence.chipText).toBe('Restored your last session')
    expect(documentStore.count).toBeGreaterThan(0)
  })

  it('an edit made during the announced frame still wins over the older stored session', async () => {
    backend.stored = { text: richProjectText(), savedAt: 1 }
    const persistence = usePersistenceStore()
    const documentStore = useDocumentStore()

    const starting = persistence.start()
    for (let tick = 0; tick < 10 && paint.asked === 0; tick += 1) await Promise.resolve()
    documentStore.append(cube('early'))
    paint.release()
    await starting

    expect(documentStore.bodies.map((body) => body.id)).toEqual(['early'])
    expect(persistence.loading).toBe('')
  })
})

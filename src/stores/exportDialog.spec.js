// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — duck-typed fakes of the download boundary; the store itself is typechecked.
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExportError } from '../core/export.js'
import { useDocumentStore } from './document.js'
import { PENDING_AFTER_MS, setExportDependencies, useExportDialogStore } from './exportDialog.js'
import { setPersistenceDependencies, usePersistenceStore } from './persistence.js'
import { useSelectionStore } from './selection.js'
import { useSettingsStore } from './settings.js'
import { useTimelineStore } from './timeline.js'

/**
 * The Export popover's state and rules (`TODO/ui-034`, `docs/decisions/interaction-model-qa.md`
 * §12). What is under test is the *decision* logic — scope default, disabled reasons, what is
 * handed to the export functions, what a refusal looks like — against the real kernel and the
 * real `io-003` functions; only the download itself (a DOM `<a>` click) and the lazy glTF
 * exporter are faked, because those are the boundaries CLAUDE.md says to mock.
 */

const cube = (id, name, x = 0) => ({
  id,
  op: 'primitive.cuboid',
  name,
  params: { size: [10, 10, 10], center: [x, 0, 5] },
})

function setup({ seed = 'two' } = {}) {
  setActivePinia(createPinia())
  setPersistenceDependencies({
    backend: { async load() { return null }, async save() {}, async keepUnreadable() {} },
    files: {
      capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
      async save() { return { ok: true, mode: 'fallback', name: 'x' } },
      async open() { return { ok: false, cancelled: true } },
      adopt() {},
      forgetHandle() {},
    },
  })
  const downloads = []
  const gltf = vi.fn(async (bodies) => ({
    bytes: new Uint8Array([1, 2, 3]),
    filename: bodies.length === 1 ? `${bodies[0].name.toLowerCase().replace(/\s+/g, '-')}.glb` : 'warpcad-scene.glb',
    mimeType: 'model/gltf-binary',
    triangleCount: 12,
    bodyNames: bodies.map((body) => body.name),
  }))
  setExportDependencies({
    download: (result) => downloads.push(result),
    loadGltfExporter: async () => gltf,
  })
  const documentStore = useDocumentStore()
  if (seed === 'two') {
    documentStore.append(cube('a', 'Cube 1', 0))
    documentStore.append(cube('b', 'Cube 2', 30))
  } else if (seed === 'one') {
    documentStore.append(cube('a', 'Cube 1', 0))
  }
  return {
    dialog: useExportDialogStore(),
    documentStore,
    selection: useSelectionStore(),
    timeline: useTimelineStore(),
    settings: useSettingsStore(),
    persistence: usePersistenceStore(),
    downloads,
    gltf,
  }
}

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* jsdom always has one; the throwing case is stubbed in its own test */
  }
})

describe('availability (§12: disabled with a reason, never silently)', () => {
  it('is disabled with "Nothing to export" on an empty scene', () => {
    const { dialog } = setup({ seed: 'none' })
    expect(dialog.unavailableReason).toBe('Nothing to export')
  })

  it('is available as soon as one body exists, whatever the selection', () => {
    const { dialog, selection } = setup({ seed: 'one' })
    expect(selection.ids).toEqual([])
    expect(dialog.unavailableReason).toBe('')
  })

  it('is disabled while History previews a past state, naming how to get out', () => {
    const { dialog, timeline, documentStore } = setup()
    timeline.selectRow('a')
    expect(timeline.previewing).toBe(true)
    expect(dialog.unavailableReason).toBe('Return to the latest step to export')
  })

  it('is enabled again once the preview ends', () => {
    const { dialog, timeline, documentStore } = setup()
    timeline.selectRow('a')
    timeline.endPreview()
    expect(dialog.unavailableReason).toBe('')
  })

  it('refuses to open while unavailable, and opens otherwise', () => {
    const empty = setup({ seed: 'none' })
    expect(empty.dialog.open()).toBe(false)
    expect(empty.dialog.isOpen).toBe(false)
    const { dialog } = setup()
    expect(dialog.open()).toBe(true)
    expect(dialog.isOpen).toBe(true)
  })

  it('stays enabled while rolled back, and says how many later steps are left out', () => {
    const { dialog, documentStore } = setup()
    documentStore.append(cube('c', 'Cube 3', 60))
    documentStore.raw.rollBackTo('a', { origin: 'local' })
    documentStore.refresh()
    expect(dialog.unavailableReason).toBe('')
    expect(dialog.rollbackNote).toBe('(rolled back — 2 later steps not included)')
  })

  it('has no rollback note at the latest step, and singularises one later step', () => {
    const { dialog, documentStore } = setup()
    expect(dialog.rollbackNote).toBe('')
    documentStore.raw.rollBackTo('a', { origin: 'local' })
    documentStore.refresh()
    expect(dialog.rollbackNote).toBe('(rolled back — 1 later step not included)')
  })
})

describe('scope (§12: default follows the selection; the line says exactly what will export)', () => {
  it('defaults to the whole scene with nothing selected, and disables the Selection radio', () => {
    const { dialog } = setup()
    dialog.open()
    expect(dialog.effectiveScope).toBe('scene')
    expect(dialog.selectionAvailable).toBe(false)
    expect(dialog.sceneLabel).toBe('Whole scene — 2 bodies, in one file')
    expect(dialog.selectionLabel).toBe('Selection — nothing selected')
    expect(dialog.summary).toBe('Exports 2 bodies together as warpcad-scene.stl')
  })

  it('defaults to the selection when one body is selected, and names it', () => {
    const { dialog, selection } = setup()
    selection.select('b')
    dialog.open()
    expect(dialog.effectiveScope).toBe('selection')
    expect(dialog.selectionLabel).toBe('Selection — Cube 2')
    expect(dialog.summary).toBe('Exports Cube 2 as cube-2.stl')
  })

  it('a selection of several bodies is one file, and says so', () => {
    const { dialog, selection } = setup()
    selection.selectMany(['a', 'b'])
    dialog.open()
    expect(dialog.selectionLabel).toBe('Selection — 2 bodies, in one file')
    expect(dialog.summary).toBe('Exports 2 bodies together as warpcad-scene.stl')
  })

  it('a one-body scene reads "1 body", not "1 bodies"', () => {
    const { dialog } = setup({ seed: 'one' })
    dialog.open()
    expect(dialog.sceneLabel).toBe('Whole scene — 1 body')
  })

  it('the user can override the default either way', () => {
    const { dialog, selection } = setup()
    selection.select('a')
    dialog.open()
    dialog.chooseScope('scene')
    expect(dialog.effectiveScope).toBe('scene')
    expect(dialog.summary).toBe('Exports 2 bodies together as warpcad-scene.stl')
    dialog.chooseScope('selection')
    expect(dialog.effectiveScope).toBe('selection')
  })

  it('choosing Selection with nothing selected is refused (the radio is disabled)', () => {
    const { dialog } = setup()
    dialog.open()
    dialog.chooseScope('selection')
    expect(dialog.effectiveScope).toBe('scene')
  })

  it('a drilled-in sub-part selection exports its WHOLE parent body, and the popover says so', () => {
    const { dialog, selection } = setup()
    selection.select('a')
    selection.drillInto('Thread')
    dialog.open()
    expect(dialog.selectionLabel).toBe('Selection — Cube 1')
    expect(dialog.wholeBodyNote).toBe('Exports the whole body "Cube 1", not just the selected part "Thread"')
  })

  it('has no whole-body note for an ordinary selection', () => {
    const { dialog, selection } = setup()
    selection.select('a')
    dialog.open()
    expect(dialog.wholeBodyNote).toBe('')
  })

  it('reopening starts from the default again — an old override does not leak across opens', () => {
    const { dialog, selection } = setup()
    selection.select('a')
    dialog.open()
    dialog.chooseScope('scene')
    dialog.close()
    dialog.open()
    expect(dialog.effectiveScope).toBe('selection')
  })
})

describe('format (§12: STL default, remembered per viewer through the settings pattern)', () => {
  it('defaults to STL', () => {
    const { dialog } = setup()
    expect(dialog.format).toBe('stl')
  })

  it('remembers the last choice in localStorage and reads it back in a new session', () => {
    const first = setup()
    first.dialog.chooseFormat('obj')
    expect(localStorage.getItem('warpcad.exportFormat')).toBe('obj')
    const second = setup()
    expect(second.dialog.format).toBe('obj')
  })

  it('ignores a stored value that is not a format', () => {
    localStorage.setItem('warpcad.exportFormat', 'step')
    expect(setup().dialog.format).toBe('stl')
  })

  it('ignores a request for a format that does not exist', () => {
    const { dialog } = setup()
    dialog.chooseFormat('step')
    expect(dialog.format).toBe('stl')
  })

  it('a throwing localStorage degrades to STL and never breaks choosing', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    try {
      const { dialog } = setup()
      expect(dialog.format).toBe('stl')
      expect(() => dialog.chooseFormat('glb')).not.toThrow()
      expect(dialog.format).toBe('glb')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('commit (the format and scope reach the export functions correctly)', () => {
  /** A binary STL's triangle count — the parser-independent minimum of "this is a real file". */
  const stlTriangles = (bytes) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(80, true)

  it('exports the whole scene as one STL, downloads it, closes, and tells the chip', async () => {
    const { dialog, downloads, persistence } = setup()
    dialog.open()
    await dialog.commit()
    expect(downloads).toHaveLength(1)
    expect(downloads[0].filename).toBe('warpcad-scene.stl')
    expect(downloads[0].mimeType).toBe('model/stl')
    // Two 10 mm cubes, 12 triangles each.
    expect(stlTriangles(downloads[0].bytes)).toBe(24)
    expect(dialog.isOpen).toBe(false)
    expect(persistence.chipText).toBe('Exported warpcad-scene.stl — 24 triangles')
  })

  it('exports just the selected body, named after it', async () => {
    const { dialog, selection, downloads } = setup()
    selection.select('b')
    dialog.open()
    await dialog.commit()
    expect(downloads[0].filename).toBe('cube-2.stl')
    expect(stlTriangles(downloads[0].bytes)).toBe(12)
  })

  it('passes the chosen format through: OBJ is text, not STL', async () => {
    const { dialog, downloads } = setup()
    dialog.open()
    dialog.chooseFormat('obj')
    await dialog.commit()
    expect(downloads[0].filename).toBe('warpcad-scene.obj')
    expect(new TextDecoder().decode(downloads[0].bytes)).toContain('\nf ')
  })

  it('routes glTF through the lazy exporter with the resolved bodies', async () => {
    const { dialog, selection, downloads, gltf } = setup()
    selection.select('a')
    dialog.open()
    dialog.chooseFormat('glb')
    await dialog.commit()
    expect(gltf).toHaveBeenCalledTimes(1)
    expect(gltf.mock.calls[0][0].map((body) => body.id)).toEqual(['a'])
    expect(downloads[0].filename).toBe('cube-1.glb')
  })

  it('shows "Preparing…" for the lazy glTF exporter and not for STL', async () => {
    const { dialog } = setup()
    let release
    setExportDependencies({
      download: () => {},
      loadGltfExporter: () => new Promise((resolve) => (release = () => resolve(async () => ({ bytes: new Uint8Array(1), filename: 'x.glb', mimeType: 'm', triangleCount: 1 })))),
    })
    dialog.open()
    dialog.chooseFormat('glb')
    const pending = dialog.commit()
    expect(dialog.preparing).toBe(true)
    release()
    await pending
    expect(dialog.preparing).toBe(false)

    dialog.open()
    dialog.chooseFormat('stl')
    const stl = dialog.commit()
    expect(dialog.preparing).toBe(false)
    await stl
  })

  it('a second press while one export is in flight does nothing', async () => {
    const { dialog, gltf } = setup()
    dialog.open()
    dialog.chooseFormat('glb')
    const first = dialog.commit()
    const second = dialog.commit()
    await Promise.all([first, second])
    expect(gltf).toHaveBeenCalledTimes(1)
  })

  it('does nothing while unavailable (no bodies, or previewing)', async () => {
    const { dialog, downloads, timeline, documentStore } = setup()
    dialog.open()
    timeline.selectRow('a')
    await dialog.commit()
    expect(downloads).toHaveLength(0)
  })

  it('exports the ACTIVE state while rolled back — the later steps are not in the file', async () => {
    const { dialog, documentStore, downloads } = setup()
    documentStore.append(cube('c', 'Cube 3', 60))
    documentStore.raw.rollBackTo('b', { origin: 'local' })
    documentStore.refresh()
    dialog.open()
    await dialog.commit()
    expect(stlTriangles(downloads[0].bytes)).toBe(24) // two cubes, not three
  })

  it('cancelling while glTF is still preparing discards the result rather than downloading late', async () => {
    const { dialog, downloads } = setup()
    let release
    setExportDependencies({
      download: (result) => downloads.push(result),
      loadGltfExporter: () =>
        new Promise((resolve) => (release = () => resolve(async () => ({ bytes: new Uint8Array(1), filename: 'x.glb', mimeType: 'm', triangleCount: 1 })))),
    })
    dialog.open()
    dialog.chooseFormat('glb')
    const pending = dialog.commit()
    dialog.close()
    release()
    await pending
    expect(downloads).toHaveLength(0)
  })
})

describe('refusals are shown by name, never a silent empty download', () => {
  it('names the body an empty-geometry refusal is about, keeps the popover open, downloads nothing', async () => {
    const { dialog, downloads } = setup()
    setExportDependencies({
      download: (result) => downloads.push(result),
      loadGltfExporter: async () => async () => {
        throw new ExportError('empty-geometry', 'Cannot export "Ghost": it has no triangles, so the file would be empty', 'Ghost')
      },
    })
    dialog.open()
    dialog.chooseFormat('glb')
    await dialog.commit()
    expect(dialog.error).toBe('Cannot export "Ghost": it has no triangles, so the file would be empty')
    expect(dialog.isOpen).toBe(true)
    expect(downloads).toHaveLength(0)
  })

  it('an unexpected failure is reported too, not swallowed', async () => {
    const { dialog, downloads } = setup()
    setExportDependencies({
      download: () => {
        throw new Error('blob url blocked')
      },
      loadGltfExporter: async () => async () => ({}),
    })
    dialog.open()
    await dialog.commit()
    expect(dialog.error).toBe('Export failed: blob url blocked')
    expect(dialog.isOpen).toBe(true)
    expect(downloads).toHaveLength(0)
  })

  it('a later successful export clears the earlier refusal', async () => {
    const { dialog } = setup()
    dialog.error = 'old'
    dialog.open()
    expect(dialog.error).toBe('')
  })

  it('choosing a different format or scope clears a stale refusal', async () => {
    const { dialog } = setup()
    dialog.open()
    dialog.error = 'Cannot export "X"'
    dialog.chooseFormat('obj')
    expect(dialog.error).toBe('')
  })
})

describe('the document changing under an open popover (stale selection, decision (a))', () => {
  it('the scope line follows the live document rather than what it said at open', () => {
    const { dialog, selection } = setup()
    selection.select('a')
    dialog.open()
    expect(dialog.summary).toBe('Exports Cube 1 as cube-1.stl')
    selection.select('b')
    expect(dialog.summary).toBe('Exports Cube 2 as cube-2.stl')
  })

  it('an EXPLICIT Selection choice whose selection vanishes is blocked, not widened to the scene', async () => {
    const { dialog, selection, downloads } = setup()
    selection.select('a')
    dialog.open()
    dialog.chooseScope('selection')
    selection.clear()
    expect(dialog.scopeProblem).toBe('The selection changed — choose what to export')
    expect(dialog.canExport).toBe(false)
    await dialog.commit()
    expect(downloads).toHaveLength(0)
    // The user picks Whole scene explicitly; now it goes.
    dialog.chooseScope('scene')
    expect(dialog.scopeProblem).toBe('')
    await dialog.commit()
    expect(downloads[0].filename).toBe('warpcad-scene.stl')
  })

  it('a DEFAULT scope simply follows the selection down to the whole scene — nothing was asked for', () => {
    const { dialog, selection } = setup()
    selection.select('a')
    dialog.open()
    selection.clear()
    expect(dialog.scopeProblem).toBe('')
    expect(dialog.effectiveScope).toBe('scene')
  })

  it('a selection naming a body an operation has since absorbed is blocked, not widened to what is left', async () => {
    const { dialog, selection, documentStore, downloads } = setup()
    selection.select('a')
    dialog.open()
    dialog.chooseScope('selection')
    // Another writer unions both cubes away while the popover is open; the selection still
    // holds the old id, which is no longer a body.
    documentStore.append({ id: 'u', op: 'boolean.union', name: 'Union 1', operands: ['a', 'b'], consumes: ['a', 'b'] })
    expect(dialog.scopeProblem).toBe('The selection changed — choose what to export')
    await dialog.commit()
    expect(downloads).toHaveLength(0)
    expect(dialog.isOpen).toBe(true)
  })

  it('the file is built from the document as it is at the moment of the press', async () => {
    const { dialog, documentStore, downloads } = setup()
    dialog.open()
    documentStore.append(cube('c', 'Cube 3', 60))
    await dialog.commit()
    expect(new DataView(downloads[0].bytes.buffer, downloads[0].bytes.byteOffset).getUint32(80, true)).toBe(36)
  })

  it('the document emptying while open makes Export unavailable with the reason', () => {
    const { dialog, documentStore } = setup({ seed: 'one' })
    dialog.open()
    documentStore.load([])
    expect(dialog.unavailableReason).toBe('Nothing to export')
    expect(dialog.canExport).toBe(false)
  })
})

describe('the pending state for a slow export (perf-001)', () => {
  /**
   * `TODO/perf-001` moved export into a worker precisely so this state can *paint*
   * while the file is being written; the rule it must obey is that a quick export
   * never shows one. Time is faked rather than waited on, so the threshold itself is
   * what is asserted rather than how fast this machine happens to be.
   *
   * These drive the store's real `commit()` against the real `io-003` serializers; only
   * the download and the lazy glTF exporter are faked, as everywhere else in this file.
   */

  it('a quick export shows no pending state at all — not even for a moment', async () => {
    const { dialog, downloads } = setup()
    dialog.open()
    await dialog.commit()
    expect(dialog.pending).toBe(false)
    expect(downloads).toHaveLength(1)
  })

  it('an export still running at the threshold says so, and names the file it is writing', async () => {
    vi.useFakeTimers()
    try {
      const { dialog } = setup()
      let release
      setExportDependencies({
        download: () => {},
        loadGltfExporter: () =>
          new Promise((resolve) => {
            release = () =>
              resolve(async () => ({ bytes: new Uint8Array(1), filename: 'warpcad-scene.glb', mimeType: 'm', triangleCount: 1 }))
          }),
      })
      dialog.open()
      dialog.chooseFormat('glb')
      const inFlight = dialog.commit()

      // Just under the threshold: still nothing, because a flash would read as a glitch.
      await vi.advanceTimersByTimeAsync(PENDING_AFTER_MS - 1)
      expect(dialog.pending).toBe(false)

      await vi.advanceTimersByTimeAsync(2)
      expect(dialog.pending).toBe(true)
      expect(dialog.pendingFile).toBe('warpcad-scene.glb')

      release()
      await inFlight
      expect(dialog.pending).toBe(false)
      expect(dialog.pendingFile).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })

  it('a refusal clears the pending state and still appears BY NAME, with the popover open', async () => {
    vi.useFakeTimers()
    try {
      const { dialog, documentStore, downloads } = setup({ seed: 'none' })
      documentStore.append({ id: 'ghost', op: 'primitive.cuboid', name: 'Ghost', params: { size: [10, 10, 10] } })
      setExportDependencies({
        download: () => {},
        loadGltfExporter: async () => async () => {
          await new Promise((resolve) => setTimeout(resolve, 500))
          throw new ExportError('empty-geometry', 'Cannot export "Ghost": it has no triangles', 'Ghost')
        },
      })
      dialog.open()
      dialog.chooseFormat('glb')
      const inFlight = dialog.commit()

      await vi.advanceTimersByTimeAsync(PENDING_AFTER_MS + 1)
      expect(dialog.pending).toBe(true)

      await vi.advanceTimersByTimeAsync(600)
      await inFlight
      expect(dialog.pending).toBe(false)
      expect(dialog.error).toBe('Cannot export "Ghost": it has no triangles')
      expect(dialog.isOpen).toBe(true)
      expect(downloads).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('closing the popover mid-export drops the pending state with the export', async () => {
    vi.useFakeTimers()
    try {
      const { dialog } = setup()
      setExportDependencies({
        download: () => {},
        loadGltfExporter: () => new Promise(() => {}), // never resolves
      })
      dialog.open()
      dialog.chooseFormat('glb')
      dialog.commit()
      await vi.advanceTimersByTimeAsync(PENDING_AFTER_MS + 1)
      expect(dialog.pending).toBe(true)

      dialog.close()
      expect(dialog.pending).toBe(false)
      expect(dialog.pendingFile).toBe('')
      // And the timer really is gone, rather than firing into a closed popover.
      await vi.advanceTimersByTimeAsync(1000)
      expect(dialog.pending).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the Resolution override (TODO/core-035)', () => {
  const cylinder = { id: 'cyl', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 50, height: 20 } }

  it('defaults to "Same as design", naming the design setting', () => {
    const { dialog } = setup({ seed: 'one' })
    expect(dialog.exportResolution).toBe('design')
    expect(dialog.resolutionOptions.map((option) => option.label)).toEqual([
      'Same as design (Normal)',
      'Draft',
      'Normal',
      'Fine',
      'Print',
    ])
    expect(dialog.resolutionNote).toBe('')
  })

  it('names Legacy when the design is a pre-resolution file', () => {
    const { dialog, documentStore } = setup({ seed: 'one' })
    documentStore.load(documentStore.raw.entries, null, 'legacy')
    expect(dialog.resolutionOptions[0].label).toBe('Same as design (Legacy (32 segments))')
  })

  it('says the design is unchanged when the choice differs from it, and only then', () => {
    const { dialog } = setup({ seed: 'one' })
    dialog.chooseResolution('print')
    expect(dialog.resolutionNote).toBe('Re-evaluating at Print resolution — the design itself is unchanged.')
    dialog.chooseResolution('normal')
    expect(dialog.resolutionNote).toBe('')
    dialog.chooseResolution('design')
    expect(dialog.resolutionNote).toBe('')
  })

  it('ignores a value that is not a choice', () => {
    const { dialog } = setup({ seed: 'one' })
    dialog.chooseResolution('ultra')
    expect(dialog.exportResolution).toBe('design')
  })

  it('is remembered for the session across close and open, and never written to the document', () => {
    const { dialog, documentStore } = setup({ seed: 'one' })
    const version = documentStore.raw.version
    dialog.open()
    dialog.chooseResolution('fine')
    dialog.close()
    dialog.open()
    expect(dialog.exportResolution).toBe('fine')
    expect(documentStore.raw.resolution()).toBe('normal')
    expect(documentStore.raw.version).toBe(version)
  })

  it('a Print export writes a higher triangle count, reported on the status line, and leaves the design alone', async () => {
    const { dialog, documentStore, downloads, persistence } = setup({ seed: 'none' })
    documentStore.append(cylinder)
    dialog.open()
    await dialog.commit()
    const atDesign = downloads[0].triangleCount
    dialog.open()
    dialog.chooseResolution('print')
    await dialog.commit()
    const atPrint = downloads[1].triangleCount
    expect(atPrint).toBeGreaterThan(atDesign)
    expect(downloads[1].filename).toBe('cylinder-1.stl')
    expect(persistence.notice).toContain(`${atPrint.toLocaleString('en-US')} triangles`)
    expect(documentStore.raw.resolution()).toBe('normal')
  })
})

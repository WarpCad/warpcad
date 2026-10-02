// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — duck-typed fakes of the storage boundary; the stores themselves are typechecked.
/**
 * The design resolution as the app sees it (`TODO/core-035`, surface A): a new document
 * starts at Normal, **File ▾ → Resolution…** changes it as one undoable step, the menu
 * label reads the current value, a saved project keeps it, an old file reopens as
 * Legacy, and a History preview folds at the same setting as the live document.
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { serializeProject } from '../core/project.js'
import { serializeNdjson } from '../core/ndjson.js'
import { useDocumentStore } from './document.js'
import { useFileMenuStore } from './fileMenu.js'
import { setPersistenceDependencies, usePersistenceStore } from './persistence.js'
import { useResolutionDialogStore } from './resolutionDialog.js'
import { useTimelineStore } from './timeline.js'

const { geometries } = modeling

const cylinder = { id: 'cyl', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 50, height: 20 } }

/** Distinct rim vertices on a z-axis cylinder's top face (the fan centre excluded). */
function sides(geometry) {
  const vertices = geometries.geom3.toPolygons(geometry).flatMap((polygon) => polygon.vertices)
  const top = Math.max(...vertices.map((v) => v[2]))
  const face = [...new Map(vertices.filter((v) => Math.abs(v[2] - top) < 1e-6).map((v) => [`${v[0].toFixed(5)},${v[1].toFixed(5)}`, v])).values()]
  return face.filter((v) => Math.hypot(v[0], v[1]) > 1e-4).length
}

function setup() {
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
  return {
    documentStore: useDocumentStore(),
    dialog: useResolutionDialogStore(),
    menu: useFileMenuStore(),
    persistence: usePersistenceStore(),
    timeline: useTimelineStore(),
  }
}

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* jsdom always has one */
  }
})

describe('a new document', () => {
  it('starts at Normal, and the File menu label says so', () => {
    const { documentStore, dialog } = setup()
    expect(documentStore.resolution).toBe('normal')
    expect(dialog.menuLabel).toBe('Resolution: Normal')
  })
})

describe('File ▾ → Resolution…', () => {
  it('opens from the menu, closing the menu, and Escape (dismissTopmost) closes it', () => {
    const { menu, dialog } = setup()
    menu.openMenu()
    menu.requestResolution()
    expect(menu.menuOpen).toBe(false)
    expect(dialog.isOpen).toBe(true)
    expect(menu.anyOpen).toBe(true)
    expect(menu.dismissTopmost()).toBe(true)
    expect(dialog.isOpen).toBe(false)
  })

  it('offers the four presets with a hint each, and Legacy only while it is the active value', () => {
    const { dialog, documentStore } = setup()
    expect(dialog.options.map((option) => option.value)).toEqual(['draft', 'normal', 'fine', 'print'])
    expect(dialog.options.find((option) => option.value === 'fine').hint).toBe('Ø20 hole: 52 sides, ≤0.02 mm off')
    documentStore.load([], null, 'legacy')
    expect(dialog.options.map((option) => option.value)).toEqual(['legacy', 'draft', 'normal', 'fine', 'print'])
    expect(dialog.options[0].label).toBe('Legacy (32 segments)')
    expect(dialog.menuLabel).toBe('Resolution: Legacy (32 segments)')
  })

  it('choosing commits it as one Undo, re-facets the viewport bodies, and Undo reverts it', () => {
    const { documentStore, dialog } = setup()
    documentStore.append(cylinder)
    dialog.open()
    dialog.choose('fine')
    expect(documentStore.resolution).toBe('fine')
    expect(dialog.menuLabel).toBe('Resolution: Fine')
    expect(documentStore.undoLabel).toBe('Resolution → Fine')
    expect(sides(documentStore.raw.bodies()[0].geometry)).toBe(80)
    documentStore.undo()
    expect(documentStore.resolution).toBe('normal')
    expect(sides(documentStore.raw.bodies()[0].geometry)).toBe(52)
  })

  it('is refused, with the reason, while History is previewing — like every document write', () => {
    const { documentStore, dialog, timeline } = setup()
    documentStore.append(cylinder)
    documentStore.append({ id: 'c2', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [5, 5, 5], center: [60, 0, 0] } })
    timeline.setOpen(true)
    timeline.selectRow('cyl')
    expect(timeline.previewing).toBe(true)
    expect(dialog.unavailableReason).toBe('Return to the latest step to change resolution')
    dialog.choose('print')
    expect(documentStore.resolution).toBe('normal')
  })
})

describe('persistence', () => {
  it('a saved project keeps its resolution, and reopening it restores it', async () => {
    const { documentStore, dialog, persistence } = setup()
    documentStore.append(cylinder)
    dialog.choose('print')
    const text = serializeProject(documentStore.raw)
    documentStore.load([], null, 'normal')
    expect((await persistence.openText(text, 'saved.ndjson')).ok).toBe(true)
    expect(documentStore.resolution).toBe('print')
    expect(sides(documentStore.raw.bodies()[0].geometry)).toBe(112)
  })

  it('an old file with no resolution reopens as Legacy, with exactly its old 32-sided geometry', async () => {
    const { documentStore, persistence } = setup()
    expect((await persistence.openText(serializeNdjson([cylinder]), 'old.ndjson')).ok).toBe(true)
    expect(documentStore.resolution).toBe('legacy')
    expect(sides(documentStore.raw.bodies()[0].geometry)).toBe(32)
  })
})

describe('the History preview', () => {
  it('folds at the live document resolution, not a default', () => {
    const { documentStore, dialog, timeline } = setup()
    documentStore.append(cylinder)
    documentStore.append({ id: 'c2', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [5, 5, 5], center: [60, 0, 0] } })
    dialog.choose('print')
    timeline.setOpen(true)
    timeline.selectRow('cyl')
    const preview = timeline.previewDocument()
    expect(preview.resolution()).toBe('print')
    expect(sides(preview.bodies()[0].geometry)).toBe(112)
  })
})

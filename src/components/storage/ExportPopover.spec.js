// @vitest-environment jsdom
// @ts-nocheck — duck-typed fakes of the download boundary; the components are typechecked.
import { createPinia, setActivePinia } from 'pinia'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

enableAutoUnmount(afterEach)

import { ExportError } from '../../core/export.js'
import { useDocumentStore } from '../../stores/document.js'
import { setExportDependencies, useExportDialogStore } from '../../stores/exportDialog.js'
import { setPersistenceDependencies } from '../../stores/persistence.js'
import { useSelectionStore } from '../../stores/selection.js'
import ExportPopover from './ExportPopover.vue'

/**
 * The export popover as a component (`TODO/ui-034`, `data-002` §12): which radio is checked
 * and which is disabled, what the line says, that pressing Export reaches the store with the
 * right choice, and that a refusal is on screen by name. The real reachability half —
 * File ▾ → Export… on `/`, with a real download — is `e2e/export-ui.e2e.js`.
 */

const cube = (id, name, x = 0) => ({
  id,
  op: 'primitive.cuboid',
  name,
  params: { size: [10, 10, 10], center: [x, 0, 5] },
})
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

let downloads
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
  downloads = []
  setExportDependencies({
    download: (result) => downloads.push(result),
    loadGltfExporter: async () => async (bodies) => ({
      bytes: new Uint8Array([1]),
      filename: 'warpcad-scene.glb',
      mimeType: 'model/gltf-binary',
      triangleCount: 1,
    }),
  })
  const documentStore = useDocumentStore()
  documentStore.append(cube('a', 'Cube 1', 0))
  documentStore.append(cube('b', 'Cube 2', 30))
  const wrapper = mount(ExportPopover, { attachTo: document.body })
  return { wrapper, dialog: useExportDialogStore(), selection: useSelectionStore() }
}

beforeEach(() => {
  localStorage.clear()
})

describe('ExportPopover (TODO/ui-034)', () => {
  it('renders nothing until opened', () => {
    setup()
    expect(q('export-popover')).toBeNull()
    expect(q('export-backdrop')).toBeNull()
  })

  it('with nothing selected: Whole scene is checked, Selection is disabled, and each line says what it covers', async () => {
    const { dialog } = setup()
    dialog.open()
    await nextTick()
    expect(q('export-scope-scene').checked).toBe(true)
    expect(q('export-scope-selection').disabled).toBe(true)
    expect(q('export-scope-scene-label').textContent.trim()).toBe('Whole scene — 2 bodies, in one file')
    expect(q('export-scope-selection-label').textContent.trim()).toBe('Selection — nothing selected')
    expect(q('export-summary').textContent.trim()).toBe('Exports 2 bodies together as warpcad-scene.stl')
  })

  it('with a body selected: Selection is checked by default and the summary names the file', async () => {
    const { dialog, selection } = setup()
    selection.select('a')
    dialog.open()
    await nextTick()
    expect(q('export-scope-selection').checked).toBe(true)
    expect(q('export-scope-selection').disabled).toBe(false)
    expect(q('export-summary').textContent.trim()).toBe('Exports Cube 1 as cube-1.stl')
  })

  it('the format radios: STL checked by default, all three present, choosing one updates the file name', async () => {
    const { dialog, selection } = setup()
    selection.select('a')
    dialog.open()
    await nextTick()
    expect(q('export-format-stl').checked).toBe(true)
    expect(q('export-format-obj')).not.toBeNull()
    expect(q('export-format-glb')).not.toBeNull()
    expect(q('export-format-glb-label').textContent).toContain('glTF (.glb)')
    q('export-format-obj').click()
    await nextTick()
    expect(dialog.format).toBe('obj')
    expect(q('export-summary').textContent.trim()).toBe('Exports Cube 1 as cube-1.obj')
  })

  it('choosing the scope radios drives the store', async () => {
    const { dialog, selection } = setup()
    selection.select('a')
    dialog.open()
    await nextTick()
    q('export-scope-scene').click()
    await nextTick()
    expect(dialog.effectiveScope).toBe('scene')
    expect(q('export-summary').textContent.trim()).toBe('Exports 2 bodies together as warpcad-scene.stl')
  })

  it('Export downloads and closes the popover; the button is Export, not Preparing…', async () => {
    const { dialog } = setup()
    dialog.open()
    await nextTick()
    expect(q('export-commit').textContent.trim()).toBe('Export')
    q('export-commit').click()
    await vi.waitFor(() => expect(downloads).toHaveLength(1))
    await nextTick()
    expect(q('export-popover')).toBeNull()
  })

  it('shows Preparing… and disables the button while the glTF exporter loads', async () => {
    const { dialog } = setup()
    let release
    setExportDependencies({
      download: () => {},
      loadGltfExporter: () => new Promise((resolve) => (release = () => resolve(async () => ({ bytes: new Uint8Array(1), filename: 'x.glb', mimeType: 'm', triangleCount: 1 })))),
    })
    dialog.open()
    dialog.chooseFormat('glb')
    await nextTick()
    q('export-commit').click()
    await nextTick()
    expect(q('export-commit').textContent.trim()).toBe('Preparing…')
    expect(q('export-commit').disabled).toBe(true)
    release()
    await vi.waitFor(() => expect(q('export-popover')).toBeNull())
  })

  it('a refusal is shown by name in an alert, and the popover stays open', async () => {
    const { dialog } = setup()
    setExportDependencies({
      download: () => {},
      loadGltfExporter: async () => async () => {
        throw new ExportError('empty-geometry', 'Cannot export "Ghost": it has no triangles, so the file would be empty', 'Ghost')
      },
    })
    dialog.open()
    dialog.chooseFormat('glb')
    await nextTick()
    q('export-commit').click()
    await vi.waitFor(() => expect(q('export-error')).not.toBeNull())
    expect(q('export-error').getAttribute('role')).toBe('alert')
    expect(q('export-error').textContent).toContain('"Ghost"')
    expect(q('export-popover')).not.toBeNull()
  })

  it('a rolled-back document says how much is left out, right in the popover', async () => {
    const { dialog } = setup()
    const doc = useDocumentStore()
    doc.raw.rollBackTo('a', { origin: 'local' })
    doc.refresh()
    dialog.open()
    await nextTick()
    expect(q('export-rollback-note').textContent.trim()).toBe('(rolled back — 1 later step not included)')
  })

  it('a drilled-in selection says it exports the whole body', async () => {
    const { dialog, selection } = setup()
    selection.select('a')
    selection.drillInto('Thread')
    dialog.open()
    await nextTick()
    expect(q('export-whole-body-note').textContent).toContain('whole body "Cube 1"')
  })

  it('a stale explicit selection disables Export and says why, instead of exporting the scene', async () => {
    const { dialog, selection } = setup()
    selection.select('a')
    dialog.open()
    dialog.chooseScope('selection')
    selection.clear()
    await nextTick()
    expect(q('export-commit').disabled).toBe(true)
    expect(q('export-blocked').textContent.trim()).toBe('The selection changed — choose what to export')
  })

  it('Cancel closes it and downloads nothing', async () => {
    const { dialog } = setup()
    dialog.open()
    await nextTick()
    q('export-cancel').click()
    await nextTick()
    expect(q('export-popover')).toBeNull()
    expect(downloads).toEqual([])
  })

  it('names itself as a dialog and labels both groups for a screen reader', async () => {
    const { dialog } = setup()
    dialog.open()
    await nextTick()
    expect(q('export-popover').getAttribute('role')).toBe('dialog')
    expect(q('export-popover').getAttribute('aria-label')).toBe('Export')
    expect(document.body.querySelector('[role="radiogroup"][aria-label="Scope"]')).not.toBeNull()
    expect(document.body.querySelector('[role="radiogroup"][aria-label="Format"]')).not.toBeNull()
  })
})

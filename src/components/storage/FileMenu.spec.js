// @vitest-environment jsdom
// @ts-nocheck — duck-typed fakes of the storage boundary; the components are typechecked.
import { createPinia, setActivePinia } from 'pinia'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../../stores/document.js'
import { useHostedStore, setHostedDependencies } from '../../stores/hosted.js'
import { setExportDependencies } from '../../stores/exportDialog.js'
import { setPersistenceDependencies, usePersistenceStore } from '../../stores/persistence.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useTimelineStore } from '../../stores/timeline.js'
import FileMenu from './FileMenu.vue'

/**
 * `TODO/ui-033` — the File ▾ menu, at component level: what each item is *called* (by
 * capability, never a "Save" that can only download), which group shows when, and the two
 * keyboard shortcuts. `e2e/save-load-ui.e2e.js` is the reachability half; this is the label
 * and gating logic, which is where a wrong answer is cheap to pin.
 */

const cube = (id) => ({
  id,
  op: 'primitive.cuboid',
  name: id,
  params: { size: [10, 10, 10], center: [0, 0, 5] },
})

function fakeFiles(mode) {
  return {
    capabilities:
      mode === 'native'
        ? { mode, canSaveInPlace: true, saveLabel: 'Save', saveAsLabel: 'Save As…', openLabel: 'Open…' }
        : { mode, canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
    saves: [],
    opens: 0,
    async save(text, options) {
      this.saves.push(options)
      return { ok: true, mode, name: 'warpcad-project.ndjson' }
    },
    async open() {
      this.opens += 1
      return { ok: false, cancelled: true }
    },
    adopt() {},
    forgetHandle() {},
  }
}

const okClient = {
  apiOrigin: 'https://api.github.com',
  calls: [],
  async read() {
    this.calls.push('read')
    return { exists: false, sha: null, text: null }
  },
  async write() {
    this.calls.push('write')
    return { sha: 'sha-1' }
  },
}

const body = () => new (class { q(id) { return document.body.querySelector(`[data-testid="${id}"]`) } })()

/** @param {'native' | 'fallback'} mode */
function setup(mode) {
  setActivePinia(createPinia())
  const files = fakeFiles(mode)
  setPersistenceDependencies({
    backend: { async load() { return null }, async save() {}, async keepUnreadable() {} },
    files,
  })
  okClient.calls = []
  setHostedDependencies({
    client: okClient,
    credentials: { async read() { return null }, async write() {}, async clear() {}, close() {} },
  })
  const wrapper = mount(FileMenu, { attachTo: document.body })
  return { wrapper, files }
}

async function openMenu(wrapper) {
  await wrapper.get('[data-testid="file-menu-button"]').trigger('click')
  await nextTick()
}

describe('FileMenu — labels by capability (TODO/ui-033, data-002 §9)', () => {
  it('fallback browsers get ONE item, "Download copy", and no Save As…', async () => {
    const { wrapper } = setup('fallback')
    await openMenu(wrapper)
    const save = body().q('file-save')
    expect(save?.textContent?.trim()).toBe('Download copy')
    expect(body().q('file-save-as')).toBeNull()
    expect(body().q('file-open')?.textContent?.trim()).toBe('Open…')
    // Never a control called "Save" that can only download a copy.
    expect(body().q('file-menu')?.textContent).not.toMatch(/\bSave\b(?! to)/)
  })

  it('File System Access browsers get Save and Save As…, both addressable', async () => {
    const { wrapper } = setup('native')
    await openMenu(wrapper)
    expect(body().q('file-save')?.textContent?.trim()).toBe('Save')
    expect(body().q('file-save-as')?.textContent?.trim()).toBe('Save As…')
  })

  it('Save-family items are enabled with nothing selected and on an empty scene', async () => {
    const { wrapper } = setup('native')
    await openMenu(wrapper)
    expect(body().q('file-save').disabled).toBe(false)
    expect(body().q('file-save-as').disabled).toBe(false)
    expect(body().q('file-open').disabled).toBe(false)
  })

  it('choosing Save closes the menu and saves; Save As passes the flag', async () => {
    const { wrapper, files } = setup('native')
    await openMenu(wrapper)
    body().q('file-save').click()
    await nextTick()
    expect(body().q('file-menu')).toBeNull()
    await openMenu(wrapper)
    body().q('file-save-as').click()
    await vi.waitFor(() => expect(files.saves).toEqual([{ saveAs: false }, { saveAs: true }]))
  })
})

describe('FileMenu — the hosted group (TODO/ui-033, data-002 §11)', () => {
  it('not connected: only "Connect repository…", and no dot on the File button', async () => {
    const { wrapper } = setup('fallback')
    await openMenu(wrapper)
    expect(body().q('hosted-connect')?.textContent).toMatch(/Connect repository/)
    expect(body().q('hosted-save')).toBeNull()
    expect(body().q('hosted-load')).toBeNull()
    expect(body().q('hosted-autopush')).toBeNull()
    expect(body().q('hosted-disconnect')).toBeNull()
    expect(wrapper.find('[data-testid="file-menu-dot"]').exists()).toBe(false)
  })

  it('connected: Save to / Load from name the repository, Auto-push is a checkable item, off', async () => {
    const { wrapper } = setup('fallback')
    await useHostedStore().connect({ token: 'ghp_SENTINEL', owner: 'octo', repo: 'parts' })
    await openMenu(wrapper)
    expect(body().q('hosted-save')?.textContent).toMatch(/Save to octo\/parts/)
    expect(body().q('hosted-load')?.textContent).toMatch(/Load from octo\/parts/)
    const auto = body().q('hosted-autopush')
    expect(auto.getAttribute('role')).toBe('menuitemcheckbox')
    expect(auto.getAttribute('aria-checked')).toBe('false')
    expect(body().q('hosted-disconnect')).not.toBeNull()
    expect(body().q('hosted-connect')).toBeNull()
    expect(wrapper.get('[data-testid="file-menu-dot"]').attributes('data-dot-state')).toBe('in-sync')
  })

  it('Save to owner/repo writes once; Ctrl/Cmd+S alone never does', async () => {
    const { wrapper, files } = setup('fallback')
    useDocumentStore().append(cube('cube-1'))
    await useHostedStore().connect({ token: 'ghp_SENTINEL', owner: 'octo', repo: 'parts' })
    okClient.calls = []

    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true) // the browser's own Save Page never opens
    await vi.waitFor(() => expect(files.saves).toHaveLength(1))
    expect(okClient.calls).toEqual([])

    await openMenu(wrapper)
    body().q('hosted-save').click()
    await vi.waitFor(() => expect(okClient.calls).toContain('write'))
  })

  it('a hosted failure state is on the File button without opening the menu', async () => {
    const { wrapper } = setup('fallback')
    const hosted = useHostedStore()
    await hosted.connect({ token: 'ghp_SENTINEL', owner: 'octo', repo: 'parts' })
    hosted.divergent = true
    await nextTick()
    const dot = wrapper.get('[data-testid="file-menu-dot"]')
    expect(dot.attributes('data-dot-state')).toBe('paused')
    expect(wrapper.get('[data-testid="file-menu-button"]').attributes('aria-label')).toMatch(/octo\/parts/)
  })
})

describe('FileMenu — Open… and the replace confirm (TODO/ui-033, data-002 §10)', () => {
  it('Open… on an empty scene goes straight to the picker', async () => {
    const { wrapper, files } = setup('fallback')
    await openMenu(wrapper)
    body().q('file-open').click()
    expect(files.opens).toBe(1)
    expect(body().q('file-open-confirm')).toBeNull()
  })

  it('Open… on a non-empty scene confirms first, with the confirmed wording, and Cancel opens nothing', async () => {
    const { wrapper, files } = setup('fallback')
    useDocumentStore().append(cube('cube-1'))
    await openMenu(wrapper)
    body().q('file-open').click()
    await nextTick()
    const dialog = body().q('file-open-confirm')
    expect(dialog?.textContent).toContain(
      'Open replaces the current project. Save or download it first if you want to keep it.',
    )
    expect(files.opens).toBe(0)
    body().q('file-open-confirm-cancel').click()
    await nextTick()
    expect(body().q('file-open-confirm')).toBeNull()
    expect(files.opens).toBe(0)

    await openMenu(wrapper)
    body().q('file-open').click()
    await nextTick()
    body().q('file-open-confirm-replace').click()
    expect(files.opens).toBe(1)
  })

  it('Ctrl/Cmd+O runs the same confirm, and Escape dismisses it', async () => {
    const { files } = setup('fallback')
    useDocumentStore().append(cube('cube-1'))
    const event = new KeyboardEvent('keydown', { key: 'o', metaKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    expect(body().q('file-open-confirm')).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await nextTick()
    expect(body().q('file-open-confirm')).toBeNull()
    expect(files.opens).toBe(0)
  })
})

describe('FileMenu — while History is previewing (TODO/ui-033, data-002 §14)', () => {
  it('Save/Open stay enabled, and the menu says Save writes the project, not the preview', async () => {
    const { wrapper } = setup('fallback')
    const doc = useDocumentStore()
    doc.append(cube('cube-1'))
    doc.append(cube('cube-2'))
    useTimelineStore().selectRow('cube-1')
    expect(useTimelineStore().previewing).toBe(true)
    await openMenu(wrapper)
    expect(body().q('file-save').disabled).toBe(false)
    expect(body().q('file-open').disabled).toBe(false)
    expect(body().q('file-menu-preview-note')?.textContent).toMatch(/current project/i)
  })
})

describe('FileMenu — dismissing a persistent message (TODO/ui-033, data-002 "one status surface")', () => {
  it('offers Dismiss only while there is an error, and Dismiss clears it from the chip', async () => {
    const { wrapper } = setup('fallback')
    await openMenu(wrapper)
    expect(body().q('file-menu-status-dismiss')).toBeNull()
    await wrapper.get('[data-testid="file-menu-button"]').trigger('click') // close

    usePersistenceStore().errorMessage = "Couldn't open notes.txt: line 1 is not valid JSON"
    await nextTick()
    await openMenu(wrapper)
    expect(body().q('file-menu-status')?.textContent).toContain('notes.txt')
    body().q('file-menu-status-dismiss').click()
    await nextTick()
    expect(usePersistenceStore().errorMessage).toBe('')
    expect(body().q('file-menu-status-dismiss')).toBeNull()
  })
})

describe('FileMenu — Export… (TODO/ui-034, data-002 §12)', () => {
  it('sits last in the "This device" group, after Open…, before the hosted divider (New is first, TODO/ui-054)', async () => {
    const { wrapper } = setup('fallback')
    await openMenu(wrapper)
    const group = document.body.querySelector('[role="group"][aria-label="This device"]')
    const ids = Array.from(group.querySelectorAll('button')).map((b) => b.getAttribute('data-testid'))
    expect(ids).toEqual(['file-new', 'file-save', 'file-open', 'file-export'])
  })

  it('an empty scene: dimmed, with the reason visible AND as the accessible description', async () => {
    const { wrapper } = setup('fallback')
    await openMenu(wrapper)
    const item = body().q('file-export')
    expect(item.textContent).toContain('Export…')
    expect(item.getAttribute('aria-disabled')).toBe('true')
    expect(item.getAttribute('title')).toBe('Nothing to export')
    const reason = body().q('file-export-reason')
    expect(reason.textContent.trim()).toBe('Nothing to export')
    expect(item.getAttribute('aria-describedby')).toBe(reason.id)
    expect(reason.id).not.toBe('')
  })

  it('pressing the dimmed item does nothing — the menu stays, no popover', async () => {
    const { wrapper } = setup('fallback')
    await openMenu(wrapper)
    body().q('file-export').click()
    await nextTick()
    expect(body().q('file-menu')).not.toBeNull()
    expect(body().q('export-popover')).toBeNull()
  })

  it('while History previews it is dimmed with the way out as the reason', async () => {
    const { wrapper } = setup('fallback')
    const doc = useDocumentStore()
    doc.append(cube('cube-1'))
    doc.append(cube('cube-2'))
    useTimelineStore().selectRow('cube-1')
    await openMenu(wrapper)
    expect(body().q('file-export').getAttribute('aria-disabled')).toBe('true')
    expect(body().q('file-export-reason').textContent.trim()).toBe('Return to the latest step to export')
  })

  it('with a body it is live (no reason, no aria-disabled), and pressing it swaps the menu for the popover', async () => {
    const { wrapper } = setup('fallback')
    useDocumentStore().append(cube('cube-1'))
    await openMenu(wrapper)
    const item = body().q('file-export')
    expect(item.getAttribute('aria-disabled')).toBeNull()
    expect(body().q('file-export-reason')).toBeNull()
    item.click()
    await nextTick()
    expect(body().q('file-menu')).toBeNull()
    expect(body().q('export-popover')).not.toBeNull()
  })

  it('opening the File menu does not disturb the selection Export\'s scope depends on', async () => {
    const { wrapper } = setup('fallback')
    useDocumentStore().append(cube('cube-1'))
    useSelectionStore().select('cube-1')
    await openMenu(wrapper)
    body().q('file-export').click()
    await nextTick()
    expect(useSelectionStore().ids).toEqual(['cube-1'])
    expect(body().q('export-scope-selection').checked).toBe(true)
  })

  it('Escape closes the popover first, and swallows the key only then', async () => {
    const { wrapper } = setup('fallback')
    useDocumentStore().append(cube('cube-1'))
    await openMenu(wrapper)
    body().q('file-export').click()
    await nextTick()
    const first = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    window.dispatchEvent(first)
    await nextTick()
    expect(first.defaultPrevented).toBe(true)
    expect(body().q('export-popover')).toBeNull()
    const second = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    window.dispatchEvent(second)
    expect(second.defaultPrevented).toBe(false)
  })

  it('clicking the backdrop closes the popover without exporting anything', async () => {
    const downloads = []
    setExportDependencies({ download: (r) => downloads.push(r), loadGltfExporter: async () => async () => ({}) })
    const { wrapper } = setup('fallback')
    useDocumentStore().append(cube('cube-1'))
    await openMenu(wrapper)
    body().q('file-export').click()
    await nextTick()
    body().q('export-backdrop').click()
    await nextTick()
    expect(body().q('export-popover')).toBeNull()
    expect(downloads).toEqual([])
  })
})

describe('FileMenu — Resolution (TODO/core-035)', () => {
  it('has its own Design group whose one row reads the current setting', async () => {
    const { wrapper } = setup('fallback')
    await openMenu(wrapper)
    const group = document.body.querySelector('[role="group"][aria-label="Design"]')
    expect(group).not.toBeNull()
    expect(body().q('file-resolution').textContent.trim()).toBe('Resolution: Normal…')
  })

  it('opens the popover in place of the menu; choosing Fine commits it, relabels the row, and is one Undo', async () => {
    const { wrapper } = setup('fallback')
    const documentStore = useDocumentStore()
    documentStore.append({ id: 'c', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 20, height: 10 } })
    await openMenu(wrapper)
    body().q('file-resolution').click()
    await nextTick()
    expect(body().q('file-menu')).toBeNull()
    expect(body().q('resolution-popover')).not.toBeNull()
    expect(body().q('resolution-option-legacy')).toBeNull()
    const fine = body().q('resolution-option-fine')
    fine.checked = true
    fine.dispatchEvent(new Event('change'))
    await nextTick()
    expect(documentStore.resolution).toBe('fine')
    expect(documentStore.undoLabel).toBe('Resolution → Fine')
    body().q('resolution-close').click()
    await nextTick()
    expect(body().q('resolution-popover')).toBeNull()
    await openMenu(wrapper)
    expect(body().q('file-resolution').textContent.trim()).toBe('Resolution: Fine…')
  })

  it('Escape closes the popover', async () => {
    const { wrapper } = setup('fallback')
    await openMenu(wrapper)
    body().q('file-resolution').click()
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(body().q('resolution-popover')).toBeNull()
  })
})

describe('FileMenu — an Open in progress (TODO/core-032)', () => {
  it('the File button reads busy with a visible "Opening…" indicator, and Open… is disabled until it lands', async () => {
    setActivePinia(createPinia())
    const files = fakeFiles('fallback')
    /** @type {() => void} */
    let release = () => {}
    setPersistenceDependencies({
      backend: { async load() { return null }, async save() {}, async keepUnreadable() {} },
      files,
      nextPaint: () => new Promise((resolve) => (release = () => resolve(undefined))),
    })
    setHostedDependencies({
      client: okClient,
      credentials: { async read() { return null }, async write() {}, async clear() {}, close() {} },
    })
    const wrapper = mount(FileMenu, { attachTo: document.body })
    const persistence = usePersistenceStore()

    expect(wrapper.find('[data-testid="file-open-pending"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="file-menu-button"]').attributes('aria-busy')).toBeUndefined()

    const text = JSON.stringify(cube('theirs')) + '\n'
    const opening = persistence.openText(text, 'theirs.ndjson')
    await nextTick()

    const button = wrapper.get('[data-testid="file-menu-button"]')
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('aria-label')).toContain('Opening theirs.ndjson…')
    expect(wrapper.get('[data-testid="file-open-pending"]').text()).toContain('Opening')

    await openMenu(wrapper)
    expect(body().q('file-menu-status')?.textContent).toContain('Opening theirs.ndjson…')
    expect(body().q('file-open')?.disabled).toBe(true)
    body().q('file-open').click()
    expect(files.opens).toBe(0)

    release()
    await opening
    await nextTick()
    expect(wrapper.find('[data-testid="file-open-pending"]').exists()).toBe(false)
    expect(button.attributes('aria-busy')).toBeUndefined()
    expect(body().q('file-open')?.disabled).toBe(false)
  })
})

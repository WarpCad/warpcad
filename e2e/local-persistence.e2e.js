// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Local persistence — IndexedDB autosave, silent restore, the save-status chip,
 * and the file Save / Open mechanism (`TODO/io-001`), driven against `/`.
 *
 * ## Engines and viewports, stated
 *
 * - **Engines: chromium + webkit.** IndexedDB is exactly the "persistence-
 *   sensitive path" `CLAUDE.md`'s Browser Support section says must run on every
 *   engine, and WebKit's IndexedDB (and its `pagehide` timing) is the one most
 *   likely to differ. Firefox cannot launch in this sandbox
 *   (`TROUBLESHOOTING.md`, 2026-09-17), so the honest claim is chromium + webkit.
 * - **Persistence itself runs at the laptop viewport only** — reload behaviour is
 *   not a layout concern. **The chip's layout runs at all three** (phone, tablet,
 *   laptop) with a snapshot at each, because it is a new occupant of the
 *   390px-budgeted header bar.
 *
 * ## What is and is not reachable by a real click here
 *
 * Autosave and restore have no trigger, so they are driven the way a user does:
 * place things, reload the page. **The File ▾ menu now exists (`ui-033`), and
 * `e2e/save-load-ui.e2e.js` clicks it**; this spec still drives the file mechanism
 * through the store functions, which is the layer *under* those clicks.
 * The file mechanism is driven through the same functions `ui-033` will call —
 * `src/storage/fileSystem.js` and `src/stores/persistence.js` — imported into the
 * page from the Vite dev server (`import('/src/…')`, the same module instances
 * the app itself loaded), with the browser's *real* download and file-chooser
 * events observed by Playwright. Two consequences, stated:
 *
 * - The **fallback** path (`<a download>` / `<input type=file>`) is exercised for
 *   real on every engine, and is the real, default path on WebKit.
 * - The **native File System Access** path (desktop Chromium) opens an OS dialog
 *   Playwright cannot drive, so it is covered by `fileSystem.spec.js` against a
 *   fake and hand-checked once (`TODO/VERIFY.md`), not here.
 *
 * Rollback and suppress have no UI until `ui-032`; the test that persists them
 * drives the document through the store the same way, and says so.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'local-persistence-snapshots')

/** @param {import('@playwright/test').TestInfo} info */
const isLaptop = (info) => info.project.name.endsWith('laptop')

test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/**
 * @param {import('@playwright/test').Page} page
 */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport with real `PointerEvent`s, like every
 * other placement spec in this folder.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} options
 */
async function dragRowIntoViewport(page, { op, fx, fy }) {
  await page.evaluate(
    ({ op, fx, fy }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error(`missing row ${op} or viewport`)
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const startX = from.left + from.width / 2
      const startY = from.top + from.height / 2
      const endX = to.left + to.width * fx
      const endY = to.top + to.height * fy
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      fire(row, 'pointerdown', startX, startY)
      for (const t of [0.25, 0.5, 0.75, 1]) {
        fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      }
      fire(window, 'pointerup', endX, endY)
    },
    { op, fx, fy },
  )
  await page.waitForTimeout(120)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 * @param {{ shift?: boolean }} [modifiers]
 */
async function clickViewportAt(page, fx, fy, modifiers = {}) {
  await page.evaluate(
    ({ fx, fy, shift }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 3,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            shiftKey: shift === true,
            clientX: box.left + box.width * fx,
            clientY: box.top + box.height * fy,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy, shift: modifiers.shift === true },
  )
  await page.waitForTimeout(90)
}

/**
 * Everything the live `data-body-*` readouts say about every body — the "byte
 * for byte" comparison the task asks for. Millimetres to 2 dp (volume to 3 dp),
 * exactly as the readouts print them.
 *
 * @param {import('@playwright/test').Page} page
 */
async function sceneBodies(page) {
  // A composite's volume is a kernel union, measured in the evaluation worker since
  // `TODO/core-029`: `data-body-volume` is absent until it lands, so wait for it.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((node) => node.hasAttribute('data-body-volume')),
  )
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id'),
      op: node.getAttribute('data-body-op'),
      name: node.getAttribute('data-body-name'),
      center: node.getAttribute('data-body-center'),
      bounds: node.getAttribute('data-body-bounds'),
      volume: node.getAttribute('data-body-volume'),
    })),
  )
}

const CUBE_A = { drop: { fx: 0.28, fy: 0.42 }, click: { fx: 0.28, fy: 0.38 } }
const CUBE_B = { drop: { fx: 0.72, fy: 0.3 }, click: { fx: 0.72, fy: 0.26 } }

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} count
 */
async function expectBodyCount(page, count) {
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))
}

/** Wait for the chip to report a completed autosave. */
async function expectSaved(page) {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', {
    timeout: 8000,
  })
}

/**
 * The dev-server module instances the running app itself loaded.
 *
 * @param {import('@playwright/test').Page} page
 */
function storeApi(page) {
  return {
    /** @param {(api: any) => any} fn @param {any} [arg] */
    run: (fn, arg) =>
      page
        .evaluateHandle(async () => {
          const documentModule = await window.__e2eImport('/src/stores/document.js')
          const persistenceModule = await window.__e2eImport('/src/stores/persistence.js')
          const fileModule = await window.__e2eImport('/src/storage/fileSystem.js')
          const projectModule = await window.__e2eImport('/src/core/project.js')
          const api = {
            documentStore: documentModule.useDocumentStore(),
            persistence: persistenceModule.usePersistenceStore(),
            createFileStorage: fileModule.createFileStorage,
            serializeProject: projectModule.serializeProject,
          }
          return api
        })
        .then(async (handle) => {
          try {
            return await handle.evaluate(fn, arg)
          } finally {
            await handle.dispose()
          }
        }),
  }
}

test.describe('autosave and restore', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(!isLaptop(info), 'persistence is not a layout concern — laptop only (see header)')
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
    await expectBodyCount(page, 0)
  })

  test('place two solids, union them, add a third, reload: the same bodies come back, undo is empty', { tag: '@smoke' }, async ({
    page,
  }, info) => {
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_B.drop })
    await closeLibrary(page)
    await expectBodyCount(page, 2)

    await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
    await clickViewportAt(page, CUBE_B.click.fx, CUBE_B.click.fy, { shift: true })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
    await page.getByTestId('operation-union').click()
    await expectBodyCount(page, 1)

    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.5, fy: 0.72 })
    await closeLibrary(page)
    await expectBodyCount(page, 2)
    await expectSaved(page)
    await expect(page.getByTestId('save-status-text')).toHaveText(/^Saved · \d\d:\d\d$/)

    const before = await sceneBodies(page)
    expect(before.map((body) => body.op).sort()).toEqual(['boolean.union', 'primitive.cylinder'])

    await page.reload()
    await expect(page.getByTestId('app-root')).toBeVisible()

    // Silent restore: no prompt, no dialog, just the scene and a chip for a few seconds.
    await expectBodyCount(page, 2)
    await expect(page.getByTestId('save-status-text')).toHaveText('Restored your last session')
    expect(await sceneBodies(page)).toEqual(before)

    // The restored steps are not undoable: history does not survive a reload.
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    await expect(page.getByTestId('redo-button')).toBeDisabled()
    // Selection is UI state and is not persisted.
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')

    // The camera framed the restored content rather than leaving it wherever the
    // default view happens to point: its target is the centre of everything restored
    // (a user who had panned away before reloading must not reopen to an empty-looking
    // scene), and it backed off far enough to see it all.
    const boxes = before.map((body) => (body.bounds ?? '').split(',').map(Number))
    const centre = [0, 1, 2].map(
      (axis) =>
        (Math.min(...boxes.map((box) => box[axis])) + Math.max(...boxes.map((box) => box[axis + 3]))) / 2,
    )
    // Polled: the readout is refreshed once per *rendered* frame, and WebKit's first
    // frame after a reload can land a moment after the bodies do.
    await expect
      .poll(async () => {
        const raw = (await page.getByTestId('viewport').getAttribute('data-camera-target')) ?? ''
        return raw.split(',').map((value) => Number(value))
      })
      .toEqual(centre.map((value) => expect.closeTo(value, 1)))
    await page.screenshot({ path: join(SNAPSHOT_DIR, `restored-${info.project.name}.png`) })

    // A new edit after restore is a normal, undoable step, and undoing it does not
    // reach back into the restored ones.
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.2, fy: 0.75 })
    await closeLibrary(page)
    await expectBodyCount(page, 3)
    await expect(page.getByTestId('undo-button')).toBeEnabled()
    await page.getByTestId('undo-button').click()
    await expectBodyCount(page, 2)
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    expect(await sceneBodies(page)).toEqual(before)
  })

  test('reloading immediately after an edit, before the debounce fires, still keeps it (flush on pagehide)', async ({
    page,
  }) => {
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
    await expectBodyCount(page, 1)
    const before = await sceneBodies(page)

    // No waiting for the chip: the 500 ms debounce has certainly not elapsed.
    await page.reload()
    await expectBodyCount(page, 1)
    expect(await sceneBodies(page)).toEqual(before)
  })

  test('a moved body is restored once at its moved position, not doubled (ui-012)', async ({
    page,
  }) => {
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
    await closeLibrary(page)
    await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
    const field = page.getByTestId('inspector-position-x')
    await expect(field).toBeVisible()
    await field.click()
    await field.fill('61')
    await field.press('Enter')
    await page.waitForTimeout(200)
    await expectBodyCount(page, 1)
    await expectSaved(page)
    const before = await sceneBodies(page)
    expect(Number(before[0].center.split(',')[0])).toBeCloseTo(61, 1)

    await page.reload()
    await expectBodyCount(page, 1)
    expect(await sceneBodies(page)).toEqual(before)
  })

  test('a composite part restored after reload stays one body and does not absorb its neighbour (core-020)', async ({
    page,
  }) => {
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
    await dragRowIntoViewport(page, { op: 'primitive.cylinder', ...CUBE_B.drop })
    await closeLibrary(page)
    await expectBodyCount(page, 2)
    await expectSaved(page)
    const before = await sceneBodies(page)
    const volumes = before.map((body) => body.volume)

    await page.reload()
    await expectBodyCount(page, 2)
    const after = await sceneBodies(page)
    expect(after.map((body) => body.volume)).toEqual(volumes)
    expect(after).toEqual(before)
  })

  test('suppressed rows and the rollback marker survive a reload (driven through the store: no timeline UI until ui-032)', async ({
    page,
  }) => {
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_B.drop })
    await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.5, fy: 0.72 })
    await closeLibrary(page)
    await expectBodyCount(page, 3)

    const ids = (await sceneBodies(page)).map((body) => body.id)
    await storeApi(page).run(
      ({ documentStore }, ids) => {
        documentStore.raw.setSuppressed(ids[0], true, { origin: 'local' })
        documentStore.raw.rollBackTo(ids[1], { origin: 'local' })
        documentStore.refresh()
      },
      ids,
    )
    await expectBodyCount(page, 1)
    await expectSaved(page)
    const before = await sceneBodies(page)
    expect(before.map((body) => body.id)).toEqual([ids[1]])

    await page.reload()
    await expectBodyCount(page, 1)
    expect(await sceneBodies(page)).toEqual(before)

    const restored = await storeApi(page).run(({ documentStore }) => ({
      rollbackAt: documentStore.raw.rollbackAt(),
      rows: documentStore.raw.timeline().map((row) => [row.suppressed, row.active]),
    }))
    expect(restored).toEqual({
      rollbackAt: 2,
      rows: [
        [true, true],
        [false, true],
        [false, false],
      ],
    })

    // Not stuck: rolling forward brings the tail back, and the suppressed row stays suppressed.
    await storeApi(page).run(({ documentStore }) => {
      documentStore.raw.rollForward({ origin: 'local' })
      documentStore.refresh()
    })
    await expectBodyCount(page, 2)
  })
})

test.describe('the file mechanism (functions ui-033 will call, real browser download / file-chooser events)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(!isLaptop(info), 'the file mechanism is not a layout concern — laptop only')
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
  })

  test('reports the capability ui-033 labels its menu from: native on desktop Chromium, download fallback elsewhere', async ({
    page,
    browserName,
  }) => {
    const capabilities = await storeApi(page).run(({ persistence }) => ({
      ...persistence.fileCapabilities,
    }))
    if (browserName === 'chromium') {
      expect(capabilities).toEqual({
        mode: 'native',
        canSaveInPlace: true,
        saveLabel: 'Save',
        saveAsLabel: 'Save As…',
        openLabel: 'Open…',
      })
    } else {
      expect(capabilities).toEqual({
        mode: 'fallback',
        canSaveInPlace: false,
        saveLabel: 'Download copy',
        saveAsLabel: null,
        openLabel: 'Open…',
      })
    }
  })

  test('fallback: Download copy delivers the project as a timestamped .ndjson, and Open reads it back', async ({
    page,
  }) => {
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
    await dragRowIntoViewport(page, { op: 'primitive.cylinder', ...CUBE_B.drop })
    await closeLibrary(page)
    await expectBodyCount(page, 2)
    const before = await sceneBodies(page)

    // Force the fallback path on every engine (on desktop Chromium the real store
    // would open a native OS dialog, which Playwright cannot drive): a file
    // storage built over an env with no pickers *is* the fallback.
    const downloading = page.waitForEvent('download')
    const saved = await storeApi(page).run(async ({ createFileStorage, serializeProject, documentStore }) => {
      const storage = createFileStorage({ document, Blob, URL, setTimeout })
      const result = await storage.save(serializeProject(documentStore.raw))
      return { result, mode: storage.capabilities.mode }
    })
    expect(saved.mode).toBe('fallback')
    expect(saved.result.ok).toBe(true)
    expect(saved.result.name).toMatch(/^warpcad-project-\d{8}-\d{4}\.ndjson$/)

    const download = await downloading
    expect(download.suggestedFilename()).toBe(saved.result.name)
    const path = await download.path()
    const text = readFileSync(path, 'utf8')
    const lines = text.split('\n').filter(Boolean)
    // Two record lines, then the state line: a new document is at Normal resolution, and an
    // absent setting would mean Legacy on reopen (TODO/core-035), so it is always written.
    expect(lines).toHaveLength(3)
    // Version 2 since TODO/data-011: placing two bodies stamped them, and the stamps travel in
    // the state line's `merge` section.
    const state = JSON.parse(lines[2])
    expect(state).toMatchObject({ warpcad: 'project-state', version: 2, resolution: 'normal' })
    expect(Object.keys(state.merge.stamps)).toHaveLength(2)
    expect(text.endsWith('\n')).toBe(true)

    // Change the document, then Open the downloaded file: it replaces it wholesale.
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.2, fy: 0.75 })
    await closeLibrary(page)
    await expectBodyCount(page, 3)

    const chooserEvent = page.waitForEvent('filechooser')
    const opening = storeApi(page).run(async ({ createFileStorage, persistence }) => {
      const storage = createFileStorage({ document, Blob, URL, setTimeout })
      const picked = await storage.open()
      if (!picked.ok) return { picked }
      return { picked: { ok: true, name: picked.name }, opened: await persistence.openText(picked.text, picked.name) }
    })
    const chooser = await chooserEvent
    await chooser.setFiles({ name: 'theirs.ndjson', mimeType: 'text/plain', buffer: Buffer.from(text) })
    const outcome = await opening
    expect(outcome.opened).toEqual({ ok: true, name: 'theirs.ndjson', steps: 2 })

    await expectBodyCount(page, 2)
    expect(await sceneBodies(page)).toEqual(before)
    await expect(page.getByTestId('save-status-text')).toHaveText('Opened theirs.ndjson · 2 steps')
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  })

  test('the real store’s Download copy path (WebKit, and anywhere without file pickers) starts a download and says "started"', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', 'desktop Chromium takes the native picker — see header')
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
    await expectBodyCount(page, 1)

    const downloading = page.waitForEvent('download')
    await storeApi(page).run(({ persistence }) => {
      void persistence.saveFile()
    })
    const download = await downloading
    expect(download.suggestedFilename()).toMatch(/^warpcad-project-\d{8}-\d{4}\.ndjson$/)
    await expect(page.getByTestId('save-status-text')).toHaveText(/^Download started: warpcad-project-/)
  })

  test('a bad file is refused by name and line, and the current project is untouched', async ({ page }) => {
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
    await closeLibrary(page)
    await expectBodyCount(page, 1)
    const before = await sceneBodies(page)

    const refused = await storeApi(page).run(({ persistence }) =>
      persistence.openText('{"id":"a","op":"primitive.cuboid"}\nthis is not json\n', 'broken.ndjson'),
    )
    expect(refused.ok).toBe(false)
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'error')
    await expect(page.getByTestId('save-status-text')).toContainText('broken.ndjson')
    await expect(page.getByTestId('save-status-text')).toContainText('line 2')
    expect(await sceneBodies(page)).toEqual(before)
    // History survived the refusal: the placement is still undoable.
    await expect(page.getByTestId('undo-button')).toBeEnabled()

    // An op this version does not know is refused by name too.
    const newer = await storeApi(page).run(({ persistence }) =>
      persistence.openText(
        '{"id":"a","op":"primitive.cuboid","params":{"size":[1,1,1],"center":[0,0,0]}}\n{"id":"b","op":"future.warp","params":{}}\n',
        'newer.ndjson',
      ),
    )
    expect(newer.ok).toBe(false)
    await expect(page.getByTestId('save-status-text')).toContainText('future.warp')
    expect(await sceneBodies(page)).toEqual(before)
  })
})

test.describe('a private or blocked IndexedDB leaves the app fully usable', () => {
  const variants = [
    {
      name: 'indexedDB throws on access (locked-down / private window)',
      script: () =>
        Object.defineProperty(window, 'indexedDB', {
          configurable: true,
          get() {
            throw new DOMException('The operation is insecure.', 'SecurityError')
          },
        }),
    },
    {
      name: 'indexedDB is missing entirely (embedded webview)',
      script: () => Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined }),
    },
    {
      name: 'indexedDB.open is refused (blocked database)',
      script: () => {
        const real = window.indexedDB
        Object.defineProperty(window, 'indexedDB', {
          configurable: true,
          value: {
            open() {
              throw new DOMException('blocked by policy', 'InvalidStateError')
            },
            cmp: real.cmp.bind(real),
          },
        })
      },
    },
  ]

  for (const variant of variants) {
    test(`${variant.name}`, async ({ page }, info) => {
      test.skip(!isLaptop(info), 'laptop only — see header')
      /** @type {string[]} */
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.addInitScript(variant.script)
      await page.goto('/')
      await expect(page.getByTestId('app-root')).toBeVisible()

      // Visible, persistent, and named — not silent.
      const chip = page.getByTestId('save-status')
      await expect(chip).toHaveAttribute('data-tone', 'error', { timeout: 10_000 })
      await expect(chip).toHaveAttribute('role', 'alert')
      await expect(page.getByTestId('save-status-text')).toHaveText(
        'Not saved — browser storage unavailable',
      )

      // ...and the app is otherwise completely usable: place, select, undo.
      await openLibrary(page)
      await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
      await closeLibrary(page)
      await expectBodyCount(page, 1)
      await page.waitForTimeout(800) // past the debounce: the failed write must not crash anything
      await expect(chip).toHaveAttribute('data-tone', 'error')
      await expect(page.getByTestId('undo-button')).toBeEnabled()
      await page.getByTestId('undo-button').click()
      await expectBodyCount(page, 0)
      expect(errors).toEqual([])
      await page.screenshot({ path: join(SNAPSHOT_DIR, `blocked-${info.project.name}.png`) })
    })
  }
})

test.describe('the save-status chip in the header bar', () => {
  test('is mounted in the document bar, and fits the header at every viewport without overflow', async ({
    page,
  }, info) => {
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
    const chip = page.getByTestId('save-status')
    await expect(chip).toBeVisible()
    await expect(chip).toHaveAttribute('role', 'status')
    await expect(page.getByTestId('document-bar').getByTestId('save-status')).toHaveCount(1)

    const viewport = page.viewportSize()
    const bar = await page.getByTestId('document-bar').boundingBox()
    const undo = await page.getByTestId('undo-button').boundingBox()
    const redo = await page.getByTestId('redo-button').boundingBox()
    const chipBox = await chip.boundingBox()
    const dot = await page.getByTestId('save-status-dot').boundingBox()
    expect(bar && viewport && bar.x + bar.width).toBeLessThanOrEqual(viewport?.width ?? 0)
    // The 390px budget data-003 measured (right edge 380 of 390): the chip must not
    // push the cluster's right edge outward or wrap the header.
    expect((bar?.x ?? 0) + (bar?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) - 8)
    // Undo/Redo keep their 44px tap targets, and the chip never overlaps them.
    expect(undo?.width).toBeGreaterThanOrEqual(44)
    expect(redo?.width).toBeGreaterThanOrEqual(44)
    expect((chipBox?.x ?? 0)).toBeGreaterThanOrEqual((redo?.x ?? 0) + (redo?.width ?? 0) - 1)
    expect((dot?.width ?? 0)).toBeGreaterThanOrEqual(9)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    const phone = info.project.name.endsWith('phone')
    const text = page.getByTestId('save-status-text')
    if (phone) {
      // A dot only at phone width: the words are visually hidden but still named.
      expect(chipBox?.width ?? 99).toBeLessThanOrEqual(24)
      await expect(chip).toHaveAttribute('aria-label', 'Autosave on')
      const textBox = await text.boundingBox()
      expect((textBox?.width ?? 99)).toBeLessThanOrEqual(2)
    } else {
      await expect(text).toBeVisible()
      await expect(text).toHaveText('Autosave on')
    }
    await page.screenshot({ path: join(SNAPSHOT_DIR, `chip-idle-${info.project.name}.png`) })
  })

  test('cycles Saving… → Saved with the words available at every width', async ({ page }, info) => {
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.38 })
    await closeLibrary(page)
    await expectBodyCount(page, 1)
    const chip = page.getByTestId('save-status')
    // The accessible name is the same words a laptop user reads, at phone width too.
    await expectSaved(page)
    await expect(chip).toHaveAttribute('aria-label', /^Saved · \d\d:\d\d$/)
    await page.screenshot({ path: join(SNAPSHOT_DIR, `chip-saved-${info.project.name}.png`) })

    // The header still fits after the text changes length.
    const bar = await page.getByTestId('document-bar').boundingBox()
    expect((bar?.x ?? 0) + (bar?.width ?? 0)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) - 8)
  })
})

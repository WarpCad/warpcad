// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

import { failNativeCommand, installNativeShell, nativeAppData, nativeDocuments, nativeFileText, queueNativePick } from './fixtures/nativeShell.js'
import { closeLibrary, isPhone, openLibrary, pointer, viewportPoint } from './support/humanInput.js'

/**
 * Real files in the iOS app (`TODO/io-014`), driven at `/` with the fake Tauri bridge
 * (`e2e/fixtures/nativeShell.js`) and its in-memory Documents folder standing in for
 * `tauri-plugin-fs` and `tauri-plugin-dialog`.
 *
 * Save names a file once and then writes **in place**: one file in Documents, updated, never a
 * second copy. Open… lists the app's own projects in a sheet with **Browse…** for files
 * elsewhere. Export writes `Documents/Exports/<name>` and the chip says where. Nowhere in the flow
 * does an `<a download>` click happen: inside the app a Blob download may do nothing at all.
 *
 * Persistence, so Chromium, Firefox and WebKit; the Open sheet is new layout, so phone, tablet and
 * laptop, with a snapshot of it at each.
 *
 *     npx playwright test e2e/native-files.e2e.js
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'native-files-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/**
 * Record every `<a download>` click, however it is made, and every browser download.
 *
 * @param {import('@playwright/test').Page} page
 */
async function watchDownloads(page) {
  await page.addInitScript(() => {
    /** @type {any} */
    const w = window
    w.__downloadClicks = []
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute('download')) w.__downloadClicks.push(this.download)
      return click.call(this)
    }
    document.addEventListener(
      'click',
      (event) => {
        const anchor = /** @type {Element | null} */ (event.target)?.closest?.('a[download]')
        if (anchor) w.__downloadClicks.push(anchor.getAttribute('download'))
      },
      true,
    )
  })
  /** @type {string[]} */
  const downloads = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  return {
    /** @returns {Promise<string[]>} */
    all: async () => [...downloads, ...(await page.evaluate(() => /** @type {any} */ (window).__downloadClicks))],
  }
}

/** @param {import('@playwright/test').Page} page */
async function openFileMenu(page) {
  await page.getByTestId('file-menu-button').click()
  await expect(page.getByTestId('file-save')).toBeVisible()
}

/**
 * Drag a Cube out of the Library and let go over the view.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} info
 */
async function placeBox(page, info) {
  const input = await pointer(page, info)
  await openLibrary(page, input.press)
  // Clear of the phone's Library sheet, which covers the lower part of the view.
  const drop = isPhone(info) ? await viewportPoint(page, 0.4, 0.22) : await viewportPoint(page, 0.4, 0.5)
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), drop.x, drop.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await closeLibrary(page, input.press)
  return input
}

/**
 * Move the selected box by typing a new Position X in the Inspector, opening its sheet first
 * where there is one.
 *
 * @param {import('@playwright/test').Page} page
 * @param {(locator: import('@playwright/test').Locator) => Promise<void>} press
 * @param {string} x
 */
async function moveBox(page, press, x) {
  const inspector = page.getByTestId('inspector')
  if ((await page.getByTestId('inspector-tab').isVisible().catch(() => false)) && (await inspector.getAttribute('data-open')) !== 'true') {
    await press(page.getByTestId('inspector-tab'))
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  const field = page.getByTestId('inspector-position-x')
  await field.fill(x)
  await field.press('Enter')
  await expect(field).toHaveValue(new RegExp(`^${x}(\\.0+)?$`))
}

test.beforeEach(async ({ page }) => {
  await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
})

test('Save names a file once and then saves in place; Open… lists it; Export writes to Exports with a toast — no download anywhere', async ({ page }, info) => {
  const downloads = await watchDownloads(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  const input = await placeBox(page, info)

  // The menu is labelled by what this path can do: Save and Save As…, never Download copy.
  await openFileMenu(page)
  await expect(page.getByTestId('file-save')).toHaveText(/^\s*Save\s*$/)
  await expect(page.getByTestId('file-save-as')).toHaveText(/^\s*Save As…\s*$/)

  // First Save: there is no file yet, so it asks for a name.
  await page.getByTestId('file-save').click()
  const nameDialog = page.getByTestId('file-name-dialog')
  await expect(nameDialog).toBeVisible()
  await expect(page.getByTestId('file-name-input')).toHaveValue('warpcad-project')
  await page.getByTestId('file-name-input').fill('bracket')
  await page.getByTestId('file-name-save').click()
  await expect(nameDialog).toHaveCount(0)
  await expect(page.getByTestId('save-status')).toContainText('Saved to bracket.ndjson')
  expect(await nativeDocuments(page)).toEqual(['bracket.ndjson'])
  const first = await nativeFileText(page, 'bracket.ndjson')
  expect(first).toContain('primitive.cuboid')

  // Move it and Save again: the same file is updated, not a second one, and nothing is asked.
  await moveBox(page, input.press, '25')
  await openFileMenu(page)
  await page.getByTestId('file-save').click()
  await expect(page.getByTestId('file-name-dialog')).toHaveCount(0)
  await expect.poll(() => nativeFileText(page, 'bracket.ndjson')).not.toBe(first)
  expect(await nativeDocuments(page)).toEqual(['bracket.ndjson'])

  // Open… asks before replacing, then lists the app's own projects with Browse… beside them.
  await openFileMenu(page)
  await page.getByTestId('file-open').click()
  await page.getByTestId('file-open-confirm-replace').click()
  const sheet = page.getByTestId('file-open-sheet')
  await expect(sheet).toBeVisible()
  const rows = page.getByTestId('file-open-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('bracket.ndjson')
  await expect(page.getByTestId('file-open-browse')).toBeVisible()
  // Rows are tap-sized and the sheet never scrolls sideways.
  const row = await rows.first().boundingBox()
  expect(row?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `open-sheet-${info.project.name}.png`) })
  await rows.first().click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('save-status')).toContainText('Opened bracket.ndjson')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  // Export STL: a real file in Documents/Exports, and the chip says where to find it.
  await openFileMenu(page)
  await page.getByTestId('file-export').click()
  await expect(page.getByTestId('export-popover')).toBeVisible()
  await page.getByTestId('export-format-stl').check()
  await page.getByTestId('export-commit').click()
  await expect(page.getByTestId('export-popover')).toHaveCount(0)
  await expect.poll(async () => (await nativeDocuments(page)).filter((p) => p.startsWith('Exports/'))).toHaveLength(1)
  const exported = (await nativeDocuments(page)).find((p) => p.startsWith('Exports/')) ?? ''
  expect(exported).toMatch(/^Exports\/[^/]+\.stl$/)
  const stlName = exported.slice('Exports/'.length)
  // iPhone or iPad by the engine's user agent (a touch WebKit reports itself as an iPad would);
  // which word is chosen is pinned by `src/native/files.spec.js`.
  const escaped = stlName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await expect(page.getByTestId('save-status')).toContainText(new RegExp(`Saved to Files › On My iP(?:hone|ad) › WarpCad › Exports › ${escaped}`))
  expect(await nativeDocuments(page)).toEqual(['Exports/' + stlName, 'bracket.ndjson'].sort())

  expect(await downloads.all()).toEqual([])
})

test('Browse… opens a file from elsewhere as a copy: the header says so, and Save asks for a name in WarpCad’s folder', async ({ page }) => {
  const downloads = await watchDownloads(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  // A real two-box project to stand in for one on iCloud Drive; then start empty, as File ▾ → New does.
  const text = await page.evaluate(async () => {
    const w = /** @type {any} */ (window)
    const documentStore = (await w.__e2eImport('/src/stores/document.js')).useDocumentStore()
    const persistence = (await w.__e2eImport('/src/stores/persistence.js')).usePersistenceStore()
    const project = await w.__e2eImport('/src/core/project.js')
    documentStore.append({ id: 'c1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [-20, 0, 10] } })
    documentStore.append({ id: 'c2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [20, 20, 20], center: [20, 0, 10] } })
    const serialized = project.serializeProject(documentStore.raw)
    persistence.newProject()
    return serialized
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await queueNativePick(page, '/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs/shelf.ndjson', text)

  await openFileMenu(page)
  await page.getByTestId('file-open').click()
  await expect(page.getByTestId('file-open-sheet')).toBeVisible()
  await expect(page.getByTestId('file-open-empty')).toBeVisible()
  await page.getByTestId('file-open-browse').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('save-status')).toContainText("Opened a copy — Save writes to WarpCad's folder")

  // Save never claims to have written back to iCloud Drive: it asks for a name here.
  await openFileMenu(page)
  await page.getByTestId('file-save').click()
  await expect(page.getByTestId('file-name-dialog')).toBeVisible()
  await expect(page.getByTestId('file-name-input')).toHaveValue('shelf')
  await page.getByTestId('file-name-save').click()
  await expect(page.getByTestId('save-status')).toContainText('Saved to shelf.ndjson')
  expect(await nativeDocuments(page)).toEqual(['shelf.ndjson'])
  expect(await downloads.all()).toEqual([])
})

test('io-008 in the app: a refused write says so and never falls back to a download', async ({ page }, info) => {
  const downloads = await watchDownloads(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await placeBox(page, info)
  // The autosave mirrors its backup with `write_text_file` 500 ms after the edit. Wait for that
  // backup to land first, or it takes the one-shot fault below instead of the Save (`TODO/io-008`).
  await expect.poll(async () => Object.keys(await nativeAppData(page))).toContain('autosave.ndjson')
  await failNativeCommand(page, 'plugin:fs|write_text_file', 'forbidden path: .bracket.ndjson.tmp')
  await openFileMenu(page)
  await page.getByTestId('file-save').click()
  await page.getByTestId('file-name-input').fill('bracket')
  await page.getByTestId('file-name-save').click()
  await expect(page.getByTestId('save-status')).toContainText("Couldn't save bracket.ndjson")
  expect(await nativeDocuments(page)).toEqual([])
  expect(await downloads.all()).toEqual([])
})

test('a name that is already taken is refused in the sheet, and the other project is not overwritten', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await page.evaluate(() => /** @type {any} */ (window).__nativeShell.fs.put('bracket.ndjson', 'someone else\n'))
  await placeBox(page, info)
  await openFileMenu(page)
  await page.getByTestId('file-save').click()
  await page.getByTestId('file-name-input').fill('bracket')
  await page.getByTestId('file-name-save').click()
  await expect(page.getByTestId('file-name-error')).toContainText('already')
  await expect(page.getByTestId('file-name-dialog')).toBeVisible()
  expect(await nativeFileText(page, 'bracket.ndjson')).toBe('someone else\n')
})

/**
 * A two-box project's text, built by the app's own serializer, then the app is emptied (as New).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function twoBoxProject(page) {
  return page.evaluate(async () => {
    const w = /** @type {any} */ (window)
    const documentStore = (await w.__e2eImport('/src/stores/document.js')).useDocumentStore()
    const persistence = (await w.__e2eImport('/src/stores/persistence.js')).usePersistenceStore()
    const project = await w.__e2eImport('/src/core/project.js')
    documentStore.append({ id: 'c1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [-20, 0, 10] } })
    documentStore.append({ id: 'c2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [20, 20, 20], center: [20, 0, 10] } })
    const serialized = project.serializeProject(documentStore.raw)
    persistence.newProject()
    return serialized
  })
}

test('a project tapped in Mail is copied into WarpCad’s folder, opened, and becomes the Save target', async ({ page }) => {
  const downloads = await watchDownloads(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  const text = await twoBoxProject(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')

  // The shell's open-URL queue: a Mail attachment, outside Documents. The app looks on its return.
  await page.evaluate(
    (text) => /** @type {any} */ (window).__nativeShell.fs.queueOpened({ name: 'from-mail.ndjson', path: '/var/mobile/Documents/Inbox/from-mail.ndjson' }, text),
    text,
  )
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('save-status')).toContainText('Opened from-mail.ndjson')
  expect(await nativeDocuments(page)).toEqual(['from-mail.ndjson'])

  // It is one of the app's own projects now: Save writes back to it without asking for a name.
  await openFileMenu(page)
  await page.getByTestId('file-save').click()
  await expect(page.getByTestId('file-name-dialog')).toHaveCount(0)
  await expect(page.getByTestId('save-status')).toContainText('Saved to from-mail.ndjson')
  expect(await nativeDocuments(page)).toEqual(['from-mail.ndjson'])
  expect(await downloads.all()).toEqual([])
})

test('a copy of the open project tapped in the Files app asks to merge, as a re-sent share does (ui-062)', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await placeBox(page, info)
  await openFileMenu(page)
  await page.getByTestId('file-save').click()
  await page.getByTestId('file-name-input').fill('bracket')
  await page.getByTestId('file-name-save').click()
  await expect(page.getByTestId('save-status')).toContainText('Saved to bracket.ndjson')
  const saved = await nativeFileText(page, 'bracket.ndjson')

  await page.evaluate(
    (text) => /** @type {any} */ (window).__nativeShell.fs.queueOpened({ name: 'bracket.ndjson', path: '/iCloud/bracket.ndjson' }, text),
    saved,
  )
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByTestId('file-open-confirm-merge')).toBeVisible()
  // The copy went in beside the open project's file, never over it.
  expect(await nativeDocuments(page)).toEqual(['bracket 2.ndjson', 'bracket.ndjson'])
  expect(await nativeFileText(page, 'bracket.ndjson')).toBe(saved)
})

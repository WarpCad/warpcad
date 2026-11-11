// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

import { installNativeShell, nativeAppData, seedNativeAppData } from './fixtures/nativeShell.js'
import { closeLibrary, isPhone, openLibrary, pointer, viewportPoint } from './support/humanInput.js'

/**
 * A durable copy of the work inside the iOS app (`TODO/io-015`), driven at `/` with the fake Tauri
 * bridge (`e2e/fixtures/nativeShell.js`) and its in-memory `$APPDATA` folder.
 *
 * WKWebView storage is reclaimable, so every autosave is also written to
 * `Application Support/autosave.ndjson`. When iOS clears IndexedDB, the next launch finds the
 * project there, restores it and says so once with the **native-restore-toast**.
 *
 * The fake `$APPDATA` lives in the page and a reload empties it; the spec carries it across the
 * reload by hand (`nativeAppData` then `seedNativeAppData`), as the real folder is carried by the OS.
 * Reclaiming the web view's storage is `indexedDB.deleteDatabase`.
 *
 * Persistence, so Chromium, Firefox and WebKit; the toast is new layout, so phone, tablet and
 * laptop, with a snapshot of it at each (the toast shares the existing strip slot under the header).
 *
 *     npx playwright test e2e/native-restore.e2e.js
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'native-restore-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const RESTORED_TEXT = "Restored your last session from the app's backup copy."

/**
 * Drag a Cube out of the Library and let go over the view.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} info
 * @param {{ fx: number, fy: number }} at where to drop it, as fractions of the view
 * @param {number} count the body count expected afterwards
 */
async function placeBox(page, info, at, count) {
  const input = await pointer(page, info)
  await openLibrary(page, input.press)
  // Clear of the phone's Library sheet, which covers the lower part of the view.
  const drop = await viewportPoint(page, at.fx, isPhone(info) ? Math.min(at.fy, 0.22) : at.fy)
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), drop.x, drop.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))
  await closeLibrary(page, input.press)
}

/** @param {import('@playwright/test').Page} page */
async function waitForSaved(page) {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })
}

/**
 * What iOS does under storage pressure: the origin's IndexedDB is gone. The app closes its
 * connection when the delete asks it to, so this resolves rather than waiting forever.
 *
 * @param {import('@playwright/test').Page} page
 */
async function reclaimWebStorage(page) {
  await page.evaluate(async () => {
    const names = (await indexedDB.databases?.())?.map((db) => db.name) ?? ['warpcad', 'warpcad-parts']
    await Promise.all(
      names
        .filter((name) => typeof name === 'string')
        .map(
          (name) =>
            new Promise((resolve) => {
              const request = indexedDB.deleteDatabase(/** @type {string} */ (name))
              request.onsuccess = request.onerror = request.onblocked = () => resolve(null)
            }),
        ),
    )
    localStorage.clear()
  })
}

test('iOS clears the web storage: the next launch restores both parts and History from the app copy, says so once, and a new placement keeps all three', async ({ page }, info) => {
  await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await expect(page.getByTestId('native-restore-toast')).toHaveCount(0)

  await placeBox(page, info, { fx: 0.3, fy: 0.5 }, 1)
  await placeBox(page, info, { fx: 0.7, fy: 0.35 }, 2)
  await waitForSaved(page)

  // The app copy is the NDJSON project, written beside IndexedDB.
  await expect.poll(async () => Object.keys(await nativeAppData(page))).toContain('autosave.ndjson')
  const kept = await nativeAppData(page)
  expect(kept['autosave.ndjson'].split('\n').filter((line) => line.includes('primitive.cuboid'))).toHaveLength(2)

  await reclaimWebStorage(page)
  await seedNativeAppData(page, kept)
  await page.reload()

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const toast = page.getByTestId('native-restore-toast')
  await expect(toast).toBeVisible()
  await expect(toast).toContainText(RESTORED_TEXT)
  // History lives in the timeline panel (a bottom sheet on the phone), closed until opened.
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-row-1')).toBeAttached()
  await expect(page.getByTestId('timeline-row-2')).toBeAttached()
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toHaveCount(0)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `restored-toast-${info.project.name}.png`) })

  // The toast is dismissible and does not come back for the same launch.
  await page.getByTestId('native-restore-toast-dismiss').click()
  await expect(toast).toHaveCount(0)

  // The restore is written back to IndexedDB: a second reload finds it there, silently.
  await waitForSaved(page)
  await seedNativeAppData(page, await nativeAppData(page))
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('native-restore-toast')).toHaveCount(0)

  // The second attempt's bug: a placement after a restore replaced what was there.
  await placeBox(page, info, { fx: 0.5, fy: 0.6 }, 3)
})

test('with nothing in the app copy and nothing in IndexedDB, the app starts empty and says nothing', async ({ page }) => {
  await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('native-restore-toast')).toHaveCount(0)
})

test('in the plain browser nothing is mirrored and nothing is announced', async ({ page }, info) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await placeBox(page, info, { fx: 0.3, fy: 0.5 }, 1)
  await waitForSaved(page)
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('native-restore-toast')).toHaveCount(0)
})

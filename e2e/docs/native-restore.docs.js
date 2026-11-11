// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { installNativeShell, seedNativeAppData } from '../fixtures/nativeShell.js'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/native-apps.md` "Where your work is kept" (`TODO/io-015`): the one-time
 * toast a phone shows after iOS cleared the web storage and the app restored from its backup copy.
 * The fake shell (`e2e/fixtures/nativeShell.js`) stands in for the Tauri webview and its
 * Application Support folder. Phone width only, because the toast sits above the bottom sheet there.
 */

test.describe('docs media: native restore', () => {
  test('native-restore-toast still', async ({ page, viewport: size }) => {
    test.skip(size?.width !== 390, 'phone-only')
    await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
    await openApp(page)
    await page.evaluate(async () => {
      const documentStore = (await /** @type {any} */ (window).__e2eImport('/src/stores/document.js')).useDocumentStore()
      documentStore.append({ id: 'c1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [30, 30, 30], center: [0, 0, 15] } })
      documentStore.append({ id: 'c2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [30, 30, 30], center: [60, 0, 15] } })
    })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })

    // The backup copy the app wrote beside IndexedDB.
    const kept = await page.evaluate(() => /** @type {any} */ (window).__nativeShell.fs.appText('autosave.ndjson'))
    expect(kept).not.toBeNull()

    // iOS clears the web storage: the origin's IndexedDB goes, the backup copy stays.
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
    await seedNativeAppData(page, { 'autosave.ndjson': kept })
    await page.reload()

    await expect(page.getByTestId('native-restore-toast')).toBeVisible()
    await expect(page.getByTestId('native-restore-toast')).toContainText("Restored your last session from the app's backup copy.")
    await shot(page, 'native-restore-toast.png', { mask: [] })
  })
})

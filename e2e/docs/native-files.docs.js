// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { installNativeShell } from '../fixtures/nativeShell.js'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/save-load.md` "In the iOS app" (`TODO/io-014`): the Open sheet listing the
 * projects in WarpCad's folder, and the status line after an export names where the file went. The
 * fake shell (`e2e/fixtures/nativeShell.js`) stands in for the Tauri webview and its Documents
 * folder. Both at phone width; the export's words are read on the File menu's first line, which
 * carries the status line's whole text where the chip itself is only a dot.
 */

test.describe('docs media: files in the iOS app', () => {
  test('native-open-sheet still', async ({ page, viewport: size }) => {
    test.skip(size?.width !== 390, 'phone-only')
    await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
    await openApp(page)
    await page.evaluate(() => {
      const fs = /** @type {any} */ (window).__nativeShell.fs
      fs.put('phone stand.ndjson', '\n')
      fs.put('bracket.ndjson', '\n')
    })
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-open').click()
    await expect(page.getByTestId('file-open-row')).toHaveCount(2)
    await shot(page, 'native-open-sheet.png', { mask: [] })
  })

  test('native-export-toast still', async ({ page, viewport: size }) => {
    test.skip(size?.width !== 390, 'phone-only')
    await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
    await openApp(page)
    await page.evaluate(async () => {
      const documentStore = (await /** @type {any} */ (window).__e2eImport('/src/stores/document.js')).useDocumentStore()
      documentStore.append({ id: 'c1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [30, 30, 30], center: [0, 0, 15] } })
    })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-export').click()
    await page.getByTestId('export-format-stl').check()
    await page.getByTestId('export-commit').click()
    await expect(page.getByTestId('save-status')).toContainText(/Saved to Files › On My iP(?:hone|ad) › WarpCad › Exports › cube-1\.stl/)
    await page.getByTestId('file-menu-button').click()
    await expect(page.getByTestId('file-menu-status')).toContainText('Exports › cube-1.stl')
    await shot(page, 'native-export-toast.png', { mask: [] })
  })
})

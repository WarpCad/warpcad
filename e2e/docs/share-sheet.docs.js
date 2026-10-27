// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, shot } from './support.js'

/**
 * Docs media for `docs/sharing.md` (`TODO/io-016`): the Share sheet at phone width, the screen a
 * sender sees after tapping **Share** — the Name field, Copy link (Send… appears only where the
 * browser has `navigator.share`, which headless Chromium does not), Send the file and the
 * disclosure line. Phone only, Chromium only, like every docs still.
 *
 * Not an acceptance check: scenario 29 is driven by hand on a real iPhone.
 */
test.describe('docs media: the Share sheet', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'phone only')

  test('share-sheet.png: the Share sheet over a cube and a sphere', async ({ page }) => {
    await page.addInitScript(() => {
      // The OS share sheet is the boundary; the picture shows the sheet every browser gets.
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    })
    await openApp(page)
    await loadScene(page, 'cube-and-sphere.ndjson', 2)
    const button = page.getByTestId('share-open')
    if (await button.isVisible()) {
      await button.click()
    } else {
      // The dev host's phone header (its Live MCP entry fills the row): File ▾ → Share….
      await page.getByTestId('file-menu-button').click()
      await page.getByTestId('file-share').click()
    }
    await expect(page.getByTestId('share-sheet')).toBeVisible()
    await page.getByTestId('share-name').fill('Phone stand')
    await expect(page.getByTestId('share-copy')).toBeEnabled()
    await page.getByTestId('share-name').blur()
    await shot(page, 'share-sheet.png')
  })
})

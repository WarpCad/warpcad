// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, startMovie, endMovie, shot, settle } from './support.js'
import { binaryStl, boxTriangles } from '../../src/io/__fixtures__/stl.js'

/**
 * Docs media for `docs/import.md` (`TODO/ui-107`, first `TODO/io-009`): the open File menu with
 * **Import model…** and **Import part file…** as a still, and File → Import model…, then placing
 * the bracket in the view with the pointer, as a movie. The fixture is generated here: a 40 × 20 ×
 * 10 mm box, no third-party model. Laptop, Chromium.
 *
 * Every movie ends by asserting its end state (the placed, selected body), so a click that
 * silently did nothing fails instead of publishing a GIF of nothing.
 */
test.describe('docs media: import a model file', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  const BRACKET = { name: 'bracket.stl', mimeType: 'model/stl', buffer: Buffer.from(binaryStl(boxTriangles([40, 20, 10]))) }

  /** Glide to a control with the real mouse and press it. */
  const glideAndClick = async (page, testid) => {
    const el = page.getByTestId(testid)
    const b = await el.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await page.waitForTimeout(250)
    await el.click()
  }

  /** File → Import model…, answering the chooser with the bracket. */
  const importBracket = async (page) => {
    await glideAndClick(page, 'file-menu-button')
    await expect(page.getByTestId('file-menu')).toBeVisible()
    await page.waitForTimeout(500)
    const chooser = page.waitForEvent('filechooser')
    await glideAndClick(page, 'file-import-model')
    await (await chooser).setFiles(BRACKET)
    await expect(page.getByTestId('placement-chip')).toBeVisible()
  }

  test('file-menu-import still', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('file-menu-button').click()
    await expect(page.getByTestId('file-import-model')).toBeVisible()
    await expect(page.getByTestId('file-import-part')).toBeVisible()
    await settle(page)
    await shot(page, 'file-menu-import.png', { locator: page.getByTestId('file-menu') })
  })

  test('import-model-place', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await settle(page)
    await startMovie(page, 'import-model-place')
    await importBracket(page)
    await page.waitForTimeout(900)
    // The ghost follows the pointer over the grid; a click places it.
    const cb = await page.getByTestId('viewport-canvas').boundingBox()
    const from = { x: cb.x + cb.width * 0.3, y: cb.y + cb.height * 0.4 }
    const to = { x: cb.x + cb.width * 0.55, y: cb.y + cb.height * 0.6 }
    await page.mouse.move(from.x, from.y, { steps: 10 })
    await page.mouse.move(to.x, to.y, { steps: 30 })
    await page.waitForTimeout(500)
    await page.mouse.down()
    await page.waitForTimeout(60)
    await page.mouse.up()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    await expect(page.getByTestId('inspector-name')).toHaveText('bracket 1')
    await expect(page.getByTestId('inspector-size-x')).toHaveValue('40')
    await page.waitForTimeout(1200)
    await endMovie(page, 'import-model-place', { fps: 10, width: 640 })
  })
})

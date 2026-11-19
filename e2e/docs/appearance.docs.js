// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, startMovie, endMovie, shot } from './support.js'

/**
 * Docs media for `docs/appearance.md` (`TODO/ui-151`): the Appearance sheet open with Blueprint chosen
 * (laptop still), and a short movie of opening File, Appearance, choosing two styles and closing
 * (laptop). Chromium only.
 */
test.describe('docs media: appearance', () => {
  /** Glide to a control and press it with the real mouse. */
  const press = async (/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ testId) => {
    const box = await page.getByTestId(testId).boundingBox()
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2, { steps: 12 })
    await page.waitForTimeout(250)
    await page.getByTestId(testId).click()
  }

  test('appearance-sheet still', async ({ page, viewport: size }) => {
    test.skip(size?.width !== 1440, 'laptop-only')
    await openApp(page)
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-appearance').click()
    await expect(page.getByTestId('appearance-sheet')).toBeVisible()
    await page.getByTestId('appearance-theme-blueprint').click()
    await expect(page.getByTestId('appearance-theme-blueprint')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blueprint')
    await shot(page, 'appearance-sheet.png', { maxDiffPixelRatio: 0.02 })
  })

  test('appearance-pick-style', { tag: '@movie' }, async ({ page, viewport: size }) => {
    test.skip(size?.width !== 1440, 'laptop-only')
    await openApp(page)
    await startMovie(page, 'appearance-pick-style')
    await press(page, 'file-menu-button')
    await press(page, 'file-appearance')
    await expect(page.getByTestId('appearance-sheet')).toBeVisible()
    await page.waitForTimeout(700)
    await press(page, 'appearance-theme-kids')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'kids')
    await page.waitForTimeout(1200)
    await press(page, 'appearance-theme-blueprint')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blueprint')
    await page.waitForTimeout(1200)
    await press(page, 'appearance-close')
    await expect(page.getByTestId('appearance-sheet')).toHaveCount(0)
    await page.waitForTimeout(1200)
    await endMovie(page, 'appearance-pick-style', { fps: 10, width: 640 })
  })
})

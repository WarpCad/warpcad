// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * A cold `https://app.warpcad.com/#/help/<page>` link opens Help on that page (`TODO/testing-012`).
 * The home page at `warpcad.com` links every docs page this way, so nothing else in `e2e/` may be
 * the only guard: each test here opens the app on a help hash in a fresh context, with no prior
 * visit and no service worker registered yet, and asserts the sheet without clicking into Help.
 *
 * **All three reference viewports and all three engines.** The boot path runs service-worker
 * registration and the IndexedDB open beside `HelpSheet`'s `onMounted`, and WebKit stands in for
 * iPhone Safari, where most home-page visitors will tap the link.
 */

/** @param {import('@playwright/test').Page} page */
async function openCold(page, hash) {
  await page.goto(`/${hash}`)
}

test.describe('a cold help link', () => {
  test('a page slug opens Help on that page', async ({ page, viewport }) => {
    await openCold(page, '#/help/booleans')
    const sheet = page.getByTestId('help-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet).toHaveAttribute('data-page', 'booleans')
    await expect(page.getByTestId('help-current-page')).toContainText('Union, Subtract and Intersect')
    await expect(page).toHaveScreenshot(`help-deep-link-booleans-${viewport?.width}.png`, {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('a topic id (a key of TOPICS) opens Help on the page it maps to', async ({ page }) => {
    await openCold(page, '#/help/boolean')
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await expect(page.getByTestId('help-sheet')).toHaveAttribute('data-page', 'booleans')
  })

  test('readme opens the All pages reference', async ({ page }) => {
    await openCold(page, '#/help/readme')
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await expect(page.getByTestId('help-sheet')).toHaveAttribute('data-page', 'readme')
  })

  test('an unknown slug says the page has moved and opens Contents, not the network-error state', async ({
    page,
  }) => {
    await openCold(page, '#/help/no-such-page')
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await expect(page.getByTestId('help-error')).toBeHidden()
    await expect(page.getByTestId('help-moved')).toContainText('This page has moved or no longer exists')
    await expect(page.getByTestId('help-contents')).toBeVisible()
  })

  test('a #/gist/<id> hash keeps priority and opens no Help sheet', async ({ page }) => {
    await openCold(page, '#/gist/0123456789abcdef')
    await expect(page.getByTestId('help-sheet')).toBeHidden()
  })

  test('Escape closes the sheet, clears the hash, and leaves an empty scene', async ({ page }) => {
    await openCold(page, '#/help/booleans')
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('help-sheet')).toBeHidden()
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('')
    await expect(page.getByTestId('viewport')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('help-sheet')).toBeHidden()
  })
})

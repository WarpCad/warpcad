// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, shot, settle } from './support.js'

/**
 * Docs media for `docs/resolution.md` (`TODO/docs-014`): the Resolution popover as a still, and
 * one picture of the same cylinder at Draft and at Print. The comparison is a single PNG, so the
 * two crops are taken from the live viewport after a real change through the popover (each
 * asserted by the popover's checked radio) and composed side by side on a throwaway page: the
 * app cannot show two resolutions at once. Laptop, Chromium only.
 */
test.describe('docs media: resolution', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  const openPopover = async (page) => {
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-resolution').click()
    await expect(page.getByTestId('resolution-popover')).toBeVisible()
  }

  test('resolution-popover still', async ({ page }) => {
    await openApp(page)
    await openPopover(page)
    await expect(page.getByTestId('resolution-option-normal')).toBeChecked()
    await shot(page, 'resolution-popover.png', { locator: page.getByTestId('resolution-popover') })
  })

  test('resolution-low-vs-high still', async ({ page, browser }) => {
    await openApp(page)
    await loadScene(page, 'one-cylinder.ndjson', 1)
    // Look at it from above, so the outline's flat sides are the whole picture.
    for (let i = 0; i < 3; i++) await page.getByTestId('nav-step-up').click()
    const crops = {}
    for (const [value, label] of [
      ['draft', 'Draft'],
      ['print', 'Print'],
    ]) {
      await openPopover(page)
      await page.getByTestId(`resolution-option-${value}`).check()
      await expect(page.getByTestId(`resolution-option-${value}`)).toBeChecked()
      await page.getByTestId('resolution-close').click()
      await expect(page.getByTestId('resolution-popover')).toHaveCount(0)
      await settle(page)
      await page.waitForTimeout(800)
      const box = await page.getByTestId('viewport-canvas').boundingBox()
      crops[label] = (
        await page.screenshot({
          clip: { x: box.x + box.width * 0.25, y: box.y + box.height * 0.3, width: box.width * 0.5, height: box.height * 0.45 },
          animations: 'disabled',
        })
      ).toString('base64')
    }
    const compare = await browser.newPage({ viewport: { width: 1100, height: 480 }, deviceScaleFactor: 2 })
    await compare.setContent(`<body style="margin:0;display:flex;gap:12px;padding:12px;background:#fff;font:600 20px system-ui">
      ${Object.entries(crops)
        .map(([l, b]) => `<figure style="margin:0;flex:1"><img style="width:100%;display:block" src="data:image/png;base64,${b}"><figcaption style="padding:6px 0">${l}</figcaption></figure>`)
        .join('')}</body>`)
    await compare.waitForLoadState('load')
    await expect(compare).toHaveScreenshot('resolution-low-vs-high.png', { animations: 'disabled', maxDiffPixelRatio: 0.02 })
    await compare.close()
  })
})

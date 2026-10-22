// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { openApp, shot } from './support.js'

/**
 * Docs media for "When the window is narrow" in `docs/primitive-placement.md` and the compact
 * forms in `docs/viewport-navigation.md` (`TODO/ui-084`), all at the 820×1180 tablet project:
 *
 *  - `library-icon-rail`: the Library as a 72px rail of icon tiles.
 *  - `library-row-popout`: the Bolt tile tapped, its Type and Size lists open beside the rail.
 *  - `viewport-chrome-compact`: the 3D view with the navigation pad and orientation triad in
 *    their compact form.
 *
 * and, at 760×900 (the pop-out tier, which no reference viewport reaches, `TODO/ui-081`):
 *
 *  - `library-section-popout`: the Library as a column of section buttons, Hardware tapped and its
 *    list open beside the column, over the 3D view.
 */

test.describe('narrow window', () => {
  test.skip(({ viewport }) => viewport?.width !== 820, 'tablet-only')

  test('library-icon-rail still', async ({ page }) => {
    await openApp(page)
    await expect(page.getByTestId('library-rail')).toBeVisible()
    await shot(page, 'library-icon-rail.png')
  })

  test('library-row-popout still', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('library-row-hardware.bolt').scrollIntoViewIfNeeded()
    await page.getByTestId('library-row-hardware.bolt').click()
    await expect(page.getByTestId('library-row-popout')).toBeVisible()
    await page.getByTestId('library-choice-hardware.bolt').selectOption('socket')
    await page.getByTestId('library-choice-hardware.bolt-spec').selectOption('m5')
    await shot(page, 'library-row-popout.png')
  })

  test('library-section-popout still', async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 900 })
    await openApp(page)
    await expect(page.locator('.app__body')).toHaveAttribute('data-library-tier', 'popout')
    await page.getByTestId('library-launcher-hardware').click()
    await expect(page.getByTestId('library-section-popout')).toHaveAttribute('data-section', 'hardware')
    await shot(page, 'library-section-popout.png')
  })

  test('viewport-chrome-compact still', async ({ page }) => {
    await openApp(page)
    await expect(page.locator('.app__body')).toHaveAttribute('data-chrome-tier', 'compact')
    await shot(page, 'viewport-chrome-compact.png', { locator: page.getByTestId('viewport') })
  })
})

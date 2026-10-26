// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, shot } from './support.js'

/**
 * Docs media for `docs/selection-and-inspector.md`'s **Hide and show** section (`TODO/ui-089`),
 * reused by `docs/print-prep.md`: step 4 of the page's example as a still — a 40 × 90 × 40 mm
 * cube split across Y with pins, `Cube 1 A` hidden from its eye in the Objects list, so the
 * view shows `Cube 1 B`'s cut face with its sockets and the list shows the dimmed row and the
 * eye-slash. Laptop, Chromium only.
 *
 * The scene comes in through File ▸ Open (`split-cube.ndjson`, the Split record the sheet's
 * defaults write), so the still does not depend on drag timing. The home camera looks from −Y,
 * which is the side B's cut face is on. Not an acceptance check: the feature's reachability is
 * `e2e/object-visibility.e2e.js`.
 */
test.describe('docs media: hide and show', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('objects-hide-split-piece still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'split-cube.ndjson', 1)
    // With nothing selected the Objects list is the Inspector's whole content at laptop width.
    await expect(page.getByTestId('object-list')).toBeVisible()
    await page.getByTestId('objects-expand-cube-1').click()
    await expect(page.getByTestId('objects-part-item-cube-1-Cube 1 A')).toBeVisible()
    await page.getByTestId('objects-part-eye-cube-1-Cube 1 A').click()
    await expect(page.getByTestId('objects-part-eye-cube-1-Cube 1 A')).toHaveAttribute('data-eye', 'hidden')
    await expect(page.getByTestId('objects-part-item-cube-1-Cube 1 A')).toHaveAttribute('data-view-hidden', 'true')
    await expect(page.getByTestId('scene-body-cube-1')).toHaveAttribute('data-view-hidden-parts', 'Cube 1 A')
    await expect(page.getByTestId('objects-count')).toHaveText('1 object · 1 hidden · Show all')
    await shot(page, 'objects-hide-split-piece.png')
  })
})

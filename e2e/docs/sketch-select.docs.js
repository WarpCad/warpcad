// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, humanDrag, shot } from './support.js'

/**
 * Docs media for the Select tool in `docs/sketch-mode.md` (`TODO/sketch-005`): the Sketch
 * toolbar with Select armed and an outline picked, its status line under it. Laptop only.
 *
 * Real mouse throughout: drag the Sketch row in, draw two circles, tap Select, tap the
 * larger circle's edge. Ends on an attribute assertion so a click that picked nothing fails
 * instead of publishing a picture of an unselected circle.
 */
test.describe('docs media: sketch select', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('select outline', async ({ page }) => {
    await openApp(page)
    const row = await page.getByTestId('library-row-primitive.sketch').boundingBox()
    const view = await page.getByTestId('viewport').boundingBox()
    await humanDrag(
      page,
      { x: row.x + row.width / 2, y: row.y + row.height / 2 },
      { x: view.x + view.width / 2, y: view.y + view.height * 0.4 },
      { steps: 12, ms: 300 },
    )
    const viewport = page.getByTestId('viewport')
    await expect(viewport).toHaveAttribute('data-sketch-mode', 'true')
    const distanceMm = Number(await viewport.getAttribute('data-camera-distance'))
    const pxPerMm = view.height / (2 * distanceMm * Math.tan((45 * Math.PI) / 360))
    const cx = view.x + view.width / 2
    const cy = view.y + view.height / 2
    await page.getByTestId('sketch-tool-circle').click()
    await humanDrag(page, { x: cx, y: cy }, { x: cx + 20 * pxPerMm, y: cy }, { steps: 10, ms: 200 })
    await humanDrag(page, { x: cx + 60 * pxPerMm, y: cy }, { x: cx + 72 * pxPerMm, y: cy }, { steps: 10, ms: 200 })
    await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
    await page.getByTestId('sketch-tool-select').click()
    await page.mouse.click(cx + 20 * pxPerMm, cy)
    await expect(page.getByTestId('sketch-selection-status')).toHaveText(/^Circle, Solid — (19|20|21)(\.\d+)? mm radius$/)
    await shot(page, 'sketch-select-outline.png', { locator: viewport })
  })
})

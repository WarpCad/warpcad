// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { endMovie, humanDrag, openApp, shot, startMovie } from './support.js'

/**
 * Docs media for "Editing an outline's points" in `docs/sketch-mode.md` (`TODO/sketch-002`):
 * a still of a converted rectangle with a peak added (the new point picked, the line under
 * the toolbar naming it), and a movie of the page's whole worked example. Laptop only.
 *
 * Real mouse throughout, human-paced. Each step ends on an attribute assertion so a drag that
 * grabbed nothing fails instead of publishing a picture of an unedited rectangle.
 */

/**
 * Drop a Sketch, draw an 80 × 50 mm rectangle, pick it and Convert to outline.
 *
 * @param {import('@playwright/test').Page} page
 */
async function convertedRectangle(page) {
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
  await page.getByTestId('sketch-tool-rect').click()
  await humanDrag(page, { x: cx - 40 * pxPerMm, y: cy + 25 * pxPerMm }, { x: cx + 40 * pxPerMm, y: cy - 25 * pxPerMm }, { steps: 12, ms: 300 })
  await page.getByTestId('sketch-tool-select').click()
  await page.mouse.click(cx + 10 * pxPerMm, cy + 25 * pxPerMm)
  await expect(page.getByTestId('sketch-selection-status')).toContainText('Rectangle, Solid')
  await page.getByTestId('inspector-sketch-convert').click()
  await expect(page.getByTestId('sketch-vertex-handles')).toHaveAttribute('data-vertex-count', '4')
  return { viewport, pxPerMm }
}

/** @param {import('@playwright/test').Page} page @param {string} testId */
async function centreOf(page, testId) {
  const box = await page.getByTestId(testId).boundingBox()
  if (!box) throw new Error(`no ${testId}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * The example's two drags: the top-right corner up 10 mm, then the top edge's midpoint dot
 * up to make a peak.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} pxPerMm
 */
async function cornerThenPeak(page, pxPerMm) {
  const corner = await centreOf(page, 'sketch-vertex-2')
  await humanDrag(page, corner, { x: corner.x, y: corner.y - 10 * pxPerMm }, { steps: 14, ms: 500 })
  await expect(page.getByTestId('sketch-selection-status')).toHaveText('Closed outline, Solid — 4 points · point 3 selected')
  const mid = await centreOf(page, 'sketch-midpoint-2')
  await humanDrag(page, mid, { x: mid.x, y: mid.y - 15 * pxPerMm }, { steps: 14, ms: 500 })
  await expect(page.getByTestId('sketch-selection-status')).toHaveText('Closed outline, Solid — 5 points · point 4 selected')
}

test.describe('docs media: sketch vertex editing', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('vertex edit still', async ({ page }) => {
    await openApp(page)
    const { viewport, pxPerMm } = await convertedRectangle(page)
    await cornerThenPeak(page, pxPerMm)
    await expect(viewport).toHaveAttribute('data-sketch-preview', 'ok')
    await shot(page, 'sketch-vertex-edit.png', { locator: viewport })
  })

  test('sketch-vertex-edit', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await startMovie(page, 'sketch-vertex-edit')
    const { viewport, pxPerMm } = await convertedRectangle(page)
    await cornerThenPeak(page, pxPerMm)
    const corner = await centreOf(page, 'sketch-vertex-0')
    await page.mouse.move(corner.x + 30, corner.y + 20)
    await page.mouse.move(corner.x, corner.y, { steps: 8 })
    await page.mouse.click(corner.x, corner.y)
    await expect(page.getByTestId('sketch-vertex-0')).toHaveAttribute('data-selected', 'true')
    await page.waitForTimeout(400)
    await page.getByTestId('inspector-sketch-delete-vertex').click()
    await expect(page.getByTestId('sketch-vertex-handles')).toHaveAttribute('data-vertex-count', '4')
    await expect(viewport).toHaveAttribute('data-sketch-preview', 'ok')
    await page.waitForTimeout(600)
    await endMovie(page, 'sketch-vertex-edit')
  })
})

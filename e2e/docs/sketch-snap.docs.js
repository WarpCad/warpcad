// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { MAX_DIFF_PIXEL_RATIO, endMovie, humanDrag, openApp, startMovie } from './support.js'

/**
 * Docs media for the Snapping section of `docs/sketch-mode.md` (`TODO/sketch-007`): a still of
 * the Corner marker over a rectangle's corner with Circle armed, and a movie of the docs'
 * own example: a circle's centre snapping onto that corner, then Snap turned off and a
 * second circle placed freely. Laptop only.
 *
 * A separate spec from `sketch-mode.docs.js` on purpose, so adding these did not re-date that
 * spec's four movies. The still is taken with the mouse still hovering: `shot()` parks the
 * pointer first, which would (correctly) take the marker away.
 */
test.describe('docs media: sketch snapping', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** @param {import('@playwright/test').Page} page */
  async function sketchWithRectangle(page, pace = { steps: 10, ms: 250 }) {
    const row = await page.getByTestId('library-row-primitive.sketch').boundingBox()
    const viewport = page.getByTestId('viewport')
    const view = await viewport.boundingBox()
    await humanDrag(
      page,
      { x: row.x + row.width / 2, y: row.y + row.height / 2 },
      { x: view.x + view.width / 2, y: view.y + view.height * 0.4 },
      { steps: 12, ms: 300 },
    )
    await expect(viewport).toHaveAttribute('data-sketch-mode', 'true')
    const distanceMm = Number(await viewport.getAttribute('data-camera-distance'))
    const pxPerMm = view.height / (2 * distanceMm * Math.tan((45 * Math.PI) / 360))
    const cx = view.x + view.width / 2
    const cy = view.y + view.height / 2
    /** Sketch-local millimetres to client pixels. */
    const at = (/** @type {number} */ xMm, /** @type {number} */ yMm) => ({ x: cx + xMm * pxPerMm, y: cy - yMm * pxPerMm })
    await page.getByTestId('sketch-tool-rect').click()
    await humanDrag(page, at(-40, -25), at(40, 25), pace)
    await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '1')
    return { at, viewport }
  }

  test('snap corner still', async ({ page }) => {
    await openApp(page)
    const { at, viewport } = await sketchWithRectangle(page)
    await page.getByTestId('sketch-tool-circle').click()
    const corner = at(40, 25)
    await page.mouse.move(corner.x + 30, corner.y - 30, { steps: 4 })
    await page.mouse.move(corner.x + 4, corner.y - 4, { steps: 6 })
    await expect(page.getByTestId('sketch-snap-marker')).toHaveAttribute('data-kind', 'vertex')
    await expect(page.getByTestId('sketch-snap-label')).toHaveText('Corner')
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(viewport).toHaveScreenshot('sketch-snap-corner.png', {
      animations: 'disabled',
      caret: 'hide',
      mask: [page.getByTestId('save-status')],
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    })
  })

  test('sketch-snap', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    const { at } = await sketchWithRectangle(page)
    await startMovie(page, 'sketch-snap')
    // Circle armed: glide towards the top-right corner — the square marker and "Corner" appear.
    await page.getByTestId('sketch-tool-circle').click()
    const corner = at(40, 25)
    await page.mouse.move(corner.x + 70, corner.y - 50, { steps: 6 })
    await page.mouse.move(corner.x + 5, corner.y - 4, { steps: 16 })
    await expect(page.getByTestId('sketch-snap-label')).toHaveText('Corner')
    await page.waitForTimeout(900)
    // Press there and drag out: the circle is centred exactly on the corner.
    await humanDrag(page, { x: corner.x + 5, y: corner.y - 4 }, at(52, 25), { steps: 14, ms: 700 })
    await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '2')
    await page.waitForTimeout(500)
    // Snap off: near the bottom-left corner no marker appears, and the circle goes where pointed.
    await page.getByTestId('sketch-snap-toggle').click()
    await expect(page.getByTestId('sketch-snap-toggle')).toHaveAttribute('aria-pressed', 'false')
    await page.waitForTimeout(500)
    const other = at(-40, -25)
    await page.mouse.move(other.x + 6, other.y + 5, { steps: 16 })
    await expect(page.getByTestId('sketch-snap-marker')).toHaveCount(0)
    await page.waitForTimeout(600)
    await humanDrag(page, { x: other.x + 6, y: other.y + 5 }, at(-30, -25), { steps: 12, ms: 600 })
    await expect(page.getByTestId('sketch-strokes')).toHaveAttribute('data-path-count', '3')
    await page.mouse.move(at(0, 0).x + 250, at(0, 0).y + 150, { steps: 8 })
    await page.waitForTimeout(900)
    await endMovie(page, 'sketch-snap')
  })
})

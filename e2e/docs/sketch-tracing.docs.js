// SPDX-License-Identifier: AGPL-3.0-or-later
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { endMovie, humanDrag, openApp, shot, startMovie } from './support.js'

/**
 * Docs media for `docs/sketch-tracing.md` (`TODO/sketch-003`): loading a photo onto a slice
 * and setting its scale from the ruler in it. Laptop only.
 *
 * The photo is `e2e/fixtures/trace-bracket.jpg` (generated: 5 px per mm, the ruler's 0 mark
 * at image px (200, 915) and its 100 mm mark at (700, 915)), so the docs and the e2e spec
 * show the same part.
 *
 * - `sketch-trace-photo.png` — the photo on the slice under the grid, **Not to scale**.
 * - `sketch-trace-set-scale.png` — the line along the ruler and the length entry.
 * - `sketch-trace-scaled.png` — after Apply: the line labelled `100 mm`, the badge's real scale.
 * - `sketch-trace-scale` movie — the whole Set scale step.
 */
const BRACKET = join(process.cwd(), 'e2e', 'fixtures', 'trace-bracket.jpg')

test.describe('docs media: tracing a photo', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /**
   * Drag Sketch in, open Slices, add the bracket photo.
   *
   * @param {import('@playwright/test').Page} page
   */
  async function sketchWithPhoto(page) {
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
    await page.getByTestId('sketch-slices-toggle').click()
    await page.getByTestId('sketch-image-input').setInputFiles(BRACKET)
    await expect(viewport).toHaveAttribute('data-reference-image', 'shown')
    await expect(page.getByTestId('sketch-image-badge')).toHaveText('Not to scale')
    const distanceMm = Number(await viewport.getAttribute('data-camera-distance'))
    const pxPerMm = view.height / (2 * distanceMm * Math.tan((45 * Math.PI) / 360))
    const cx = view.x + view.width / 2
    const cy = view.y + view.height / 2
    /** Image px to client px, for the photo at its provisional 1 px = 0.1 mm, centred. */
    const atPx = (/** @type {number} */ px, /** @type {number} */ py) => ({
      x: cx + (px - 700) * 0.1 * pxPerMm,
      y: cy + (py - 500) * 0.1 * pxPerMm,
    })
    return { viewport, atPx }
  }

  test('photo, set-scale and scaled stills', async ({ page }) => {
    await openApp(page)
    const { atPx } = await sketchWithPhoto(page)
    await shot(page, 'sketch-trace-photo.png')

    await page.getByTestId('sketch-image-scale').click()
    await humanDrag(page, atPx(200, 915), atPx(700, 915), { steps: 12, ms: 300 })
    await expect(page.getByTestId('sketch-scale-tool')).toHaveAttribute('data-step', 'length')
    await page.getByTestId('sketch-scale-length').fill('100')
    await page.getByTestId('sketch-scale-length').blur()
    await shot(page, 'sketch-trace-set-scale.png')

    await page.getByTestId('sketch-scale-apply').click()
    await expect(page.getByTestId('sketch-image-badge')).toHaveText(/^1 px = 0\.\d+ mm$/)
    await expect(page.getByTestId('sketch-scale-line-label')).toHaveText('100 mm')
    await shot(page, 'sketch-trace-scaled.png')
  })

  test('sketch-trace-scale', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    const { atPx } = await sketchWithPhoto(page)
    await startMovie(page, 'sketch-trace-scale')
    await page.waitForTimeout(600)
    await page.mouse.move(atPx(900, 600).x, atPx(900, 600).y, { steps: 8 })
    // The Slices card grew (Offset and Twist rows, TODO/sketch-008), so Set scale can sit below the fold.
    await page.getByTestId('sketch-image-scale').scrollIntoViewIfNeeded()
    const scaleButton = await page.getByTestId('sketch-image-scale').boundingBox()
    await page.mouse.move(scaleButton.x + scaleButton.width / 2, scaleButton.y + scaleButton.height / 2, { steps: 14 })
    await page.waitForTimeout(300)
    await page.mouse.down()
    await page.mouse.up()
    await expect(page.getByTestId('sketch-scale-tool')).toBeVisible()
    await page.waitForTimeout(900)
    // Press on the ruler's 0 mark and drag to its 10 cm mark.
    const from = atPx(200, 915)
    await page.mouse.move(from.x + 60, from.y - 80, { steps: 4 })
    await page.mouse.move(from.x, from.y, { steps: 12 })
    await page.waitForTimeout(400)
    await humanDrag(page, from, atPx(700, 915), { steps: 22, ms: 1600 })
    await page.waitForTimeout(500)
    await page.getByTestId('sketch-scale-length').pressSequentially('100', { delay: 160 })
    await page.waitForTimeout(500)
    const apply = await page.getByTestId('sketch-scale-apply').boundingBox()
    await page.mouse.move(apply.x + apply.width / 2, apply.y + apply.height / 2, { steps: 14 })
    await page.mouse.down()
    await page.mouse.up()
    await expect(page.getByTestId('sketch-scale-line-label')).toHaveText('100 mm')
    await page.waitForTimeout(1500)
    await endMovie(page, 'sketch-trace-scale')
  })
})

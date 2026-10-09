// SPDX-License-Identifier: AGPL-3.0-or-later
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { endMovie, humanDrag, openApp, shot, startMovie } from './support.js'

/**
 * Docs media for `docs/sketch-tracing.md`'s **Auto-trace** section (`TODO/sketch-004`). Laptop
 * only. Kept apart from `sketch-tracing.docs.js` so recording these never marks that file's
 * movie stale.
 *
 * The photo is `e2e/fixtures/trace-bracket.jpg` (generated: 5 px per mm, the ruler's 0 mark
 * at image px (200, 915) and its 100 mm mark at (700, 915); the bracket's middle at (600, 400)).
 *
 * - `sketch-trace-auto.png` — Auto-trace's banner after one tap inside the bracket: the
 *   outline and its two dashed holes, "Traced 1 outline and 2 holes".
 * - `sketch-trace-auto` movie — Auto-trace, one tap, Finish: the traced outline picked with its
 *   points showing.
 */
const BRACKET = join(process.cwd(), 'e2e', 'fixtures', 'trace-bracket.jpg')

test.describe('docs media: auto-trace', () => {
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

  /**
   * Set scale along 100 mm of the ruler, then centre the bracket on the sketch origin with
   * the photo's X/Y fields. Returns image px → client px at the new scale.
   *
   * @param {import('@playwright/test').Page} page
   * @param {(px: number, py: number) => { x: number, y: number }} atPx
   */
  async function scaleAndCentre(page, atPx) {
    await page.getByTestId('sketch-image-scale').click()
    await humanDrag(page, atPx(200, 915), atPx(700, 915), { steps: 8, ms: 200 })
    await page.getByTestId('sketch-scale-length').fill('100')
    await page.getByTestId('sketch-scale-apply').click()
    const badge = page.getByTestId('sketch-image-badge')
    await expect(badge).toHaveText(/^1 px = 0\.\d+ mm$/)
    const mmPerPx = Number(/= ([\d.]+) mm/.exec((await badge.textContent()) ?? '')?.[1])
    // The bracket's middle, image px (600, 400), onto the origin.
    for (const [axis, value] of [['x', 100 * mmPerPx], ['y', -100 * mmPerPx]]) {
      const field = page.getByTestId(`sketch-image-${axis}`)
      await field.fill(String(value))
      await field.press('Enter')
    }
    const viewport = page.getByTestId('viewport')
    const view = await viewport.boundingBox()
    const distanceMm = Number(await viewport.getAttribute('data-camera-distance'))
    const pxPerMm = view.height / (2 * distanceMm * Math.tan((45 * Math.PI) / 360))
    return (/** @type {number} */ px, /** @type {number} */ py) => ({
      x: view.x + view.width / 2 + (px - 600) * mmPerPx * pxPerMm,
      y: view.y + view.height / 2 + (py - 400) * mmPerPx * pxPerMm,
    })
  }

  test('auto-trace still', async ({ page }) => {
    await openApp(page)
    const { atPx } = await sketchWithPhoto(page)
    const scaled = await scaleAndCentre(page, atPx)
    await page.getByTestId('sketch-image-trace').click()
    const inside = scaled(600, 225)
    await page.mouse.click(inside.x, inside.y)
    await expect(page.getByTestId('sketch-trace-message')).toHaveText(/^Traced 1 outline and 2 holes/)
    await page.mouse.move(inside.x + 200, inside.y + 300)
    await shot(page, 'sketch-trace-auto.png')
  })

  test('sketch-trace-auto', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    const { atPx } = await sketchWithPhoto(page)
    const scaled = await scaleAndCentre(page, atPx)
    await startMovie(page, 'sketch-trace-auto')
    await page.waitForTimeout(500)
    // The Slices card grew (Offset and Twist rows, TODO/sketch-008), so Trace can sit below the fold.
    await page.getByTestId('sketch-image-trace').scrollIntoViewIfNeeded()
    const traceButton = await page.getByTestId('sketch-image-trace').boundingBox()
    await page.mouse.move(traceButton.x + traceButton.width / 2, traceButton.y + traceButton.height / 2, { steps: 16 })
    await page.waitForTimeout(250)
    await page.mouse.down()
    await page.mouse.up()
    await expect(page.getByTestId('sketch-trace-tool')).toBeVisible()
    await page.waitForTimeout(900)
    // Tap inside the bracket's top arm.
    const inside = scaled(600, 225)
    await page.mouse.move(inside.x, inside.y, { steps: 18 })
    await page.waitForTimeout(300)
    await page.mouse.down()
    await page.mouse.up()
    await expect(page.getByTestId('sketch-trace-message')).toHaveText(/^Traced 1 outline and 2 holes/)
    await page.waitForTimeout(1600)
    const finish = await page.getByTestId('sketch-trace-finish').boundingBox()
    await page.mouse.move(finish.x + finish.width / 2, finish.y + finish.height / 2, { steps: 16 })
    await page.waitForTimeout(250)
    await page.mouse.down()
    await page.mouse.up()
    await expect(page.getByTestId('sketch-vertex-handles')).toBeVisible()
    await page.mouse.move(inside.x + 150, inside.y + 260, { steps: 10 })
    await page.waitForTimeout(1500)
    await endMovie(page, 'sketch-trace-auto')
  })
})

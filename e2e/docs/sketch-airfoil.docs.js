// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, humanDrag, shot } from './support.js'

/**
 * Docs media for "Curves and airfoils" and "Tapered and twisted lofts" in
 * `docs/sketch-mode.md` (`TODO/sketch-008`): the Curve sheet filled in for NACA 2412, the
 * airfoil dragged onto the origin, and the Slices card with the tip's Offset and Twist set.
 * Laptop only. Real mouse throughout; each shot ends behind an assertion so a drag that placed
 * nothing fails instead of publishing a picture of an empty sketch.
 */
test.describe('docs media: sketch airfoil', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** @param {import('@playwright/test').Page} page */
  async function dropSketch(page) {
    const row = await page.getByTestId('library-row-primitive.sketch').boundingBox()
    const view = await page.getByTestId('viewport').boundingBox()
    await humanDrag(
      page,
      { x: row.x + row.width / 2, y: row.y + row.height / 2 },
      { x: view.x + view.width / 2, y: view.y + view.height * 0.4 },
      { steps: 12, ms: 300 },
    )
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-sketch-mode', 'true')
  }

  /** @param {import('@playwright/test').Page} page @param {string} chord */
  async function armAirfoil(page, chord) {
    await page.getByTestId('sketch-tool-curve').click()
    await page.getByTestId('sketch-curve-kind-naca4').click()
    await page.getByTestId('sketch-curve-code').fill('2412')
    await page.getByTestId('sketch-curve-chord').fill(chord)
  }

  /** @param {import('@playwright/test').Page} page */
  async function dragToOrigin(page) {
    const box = await page.getByTestId('viewport').boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await humanDrag(page, { x: cx - 60, y: cy + 50 }, { x: cx, y: cy }, { steps: 12, ms: 300 })
  }

  test('curve sheet', async ({ page }) => {
    await openApp(page)
    await dropSketch(page)
    await armAirfoil(page, '120')
    await expect(page.getByTestId('sketch-curve-sheet')).toBeVisible()
    await shot(page, 'sketch-curve-sheet.png', { locator: page.getByTestId('sketch-curve-sheet') })
  })

  test('airfoil placed', async ({ page }) => {
    await openApp(page)
    await dropSketch(page)
    await armAirfoil(page, '120')
    await page.getByTestId('sketch-curve-place').click()
    await dragToOrigin(page)
    await expect(page.getByTestId('sketch-selection-status')).toContainText('Airfoil NACA 2412 · 120 mm chord')
    await shot(page, 'sketch-airfoil-placed.png', { locator: page.getByTestId('viewport') })
  })

  test('tip slice offset and twist', async ({ page }) => {
    await openApp(page)
    await dropSketch(page)
    await page.getByTestId('sketch-slices-toggle').click()
    await page.getByTestId('sketch-slice-add').click()
    await expect(page.getByTestId('sketch-slice-row-1')).toHaveAttribute('data-active', 'true')
    for (const [key, value] of [['z', '200'], ['offset-x', '30'], ['twist', '-2']]) {
      const input = page.getByTestId(`sketch-slice-${key}-1`)
      await input.fill(value)
      await input.press('Enter')
    }
    await expect(page.getByTestId('sketch-slice-twist-1')).toHaveValue('-2')
    await shot(page, 'sketch-slice-offset-twist.png', { locator: page.getByTestId('sketch-slices-panel') })
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, shot, settle, humanDrag } from './support.js'

/**
 * Docs media for `docs/user-library.md` (`TODO/ui-055`): the Save to library sheet as a
 * still, Save as a movie, and placing a saved part from My parts as a movie. Laptop, Chromium.
 *
 * Every movie ends by asserting its end state (the toast, the row, the placed body with its
 * named parts), so a click that silently did nothing fails instead of publishing a GIF of a
 * still scene. Not an acceptance check: scenarios 1, 3 and 6 are driven by hand.
 */
test.describe('docs media: user library', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** Glide to a control with the real mouse and press it. */
  const press = async (page, testId) => {
    const el = page.getByTestId(testId)
    await el.scrollIntoViewIfNeeded()
    const b = await el.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await page.waitForTimeout(220)
    await el.click()
    await page.waitForTimeout(250)
  }

  /** Cube + Cylinder from the fixture, combined into one group, selected. */
  const groupIt = async (page) => {
    await loadScene(page, 'cube-and-cylinder.ndjson', 2)
    if (!(await page.getByTestId('object-list').isVisible().catch(() => false))) await press(page, 'inspector-objects-header')
    await press(page, 'objects-check-cube-1')
    await press(page, 'objects-check-cyl-1')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
    await press(page, 'operation-group')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  }

  const saveStandoff = async (page) => {
    await press(page, 'library-save')
    await page.getByTestId('save-library-name').fill('Standoff')
    await press(page, 'save-library-param-cyl-1:height')
    await press(page, 'save-library-submit')
    await expect(page.getByTestId('library-toast')).toHaveText('Saved Standoff')
  }

  test('user-library-save sheet still', async ({ page }) => {
    await openApp(page)
    await groupIt(page)
    await press(page, 'library-save')
    await page.getByTestId('save-library-name').fill('Standoff')
    await page.getByTestId('save-library-param-cyl-1:height').check()
    await shot(page, 'user-library-save-sheet.png', { locator: page.getByTestId('save-library-sheet') })
  })

  test('user-library-save', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await groupIt(page)
    await startMovie(page, 'user-library-save')
    await press(page, 'library-save')
    await page.waitForTimeout(500)
    await page.getByTestId('save-library-name').fill('Standoff')
    await page.waitForTimeout(400)
    await press(page, 'save-library-param-cyl-1:height')
    await page.waitForTimeout(400)
    await press(page, 'save-library-submit')
    await expect(page.getByTestId('library-toast')).toHaveText('Saved Standoff')
    await expect(page.getByTestId('library-row-user.standoff')).toBeVisible()
    await page.waitForTimeout(1200)
    await endMovie(page, 'user-library-save', { fps: 10, width: 640 })
  })

  test('user-library-place', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await groupIt(page)
    await saveStandoff(page)
    // A fresh project, as the doc's example does: File > New (replace the grouped scene).
    await press(page, 'file-menu-button')
    await press(page, 'file-new')
    const replace = page.getByTestId('file-open-confirm-replace')
    if (await replace.isVisible().catch(() => false)) await press(page, 'file-open-confirm-replace')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
    await settle(page)
    await startMovie(page, 'user-library-place')
    const row = page.getByTestId('library-row-user.standoff')
    await row.scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    const rb = await row.boundingBox()
    const cb = await page.getByTestId('viewport-canvas').boundingBox()
    await humanDrag(page, { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }, { x: cb.x + cb.width * 0.5, y: cb.y + cb.height * 0.55 })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    await expect(page.getByTestId('inspector-name')).toHaveText('Standoff 1')
    expect((await page.$$eval('[data-testid="inspector-parts"] li', (n) => n.map((x) => x.textContent.trim()))).sort()).toEqual(['Cube 1', 'Cylinder 1'])
    await page.waitForTimeout(1000)
    await endMovie(page, 'user-library-place', { fps: 10, width: 640 })
  })
})

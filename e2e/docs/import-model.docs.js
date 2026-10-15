// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, startMovie, endMovie, shot, settle, humanDrag } from './support.js'
import { binaryStl, boxTriangles } from '../../src/io/__fixtures__/stl.js'

/**
 * Docs media for `docs/user-library.md`'s **Importing a model file** (`TODO/io-009`): the My
 * parts row an imported STL becomes (its Mesh tag, size and Units control) as a still, and
 * import-then-drag-in as a movie. The fixture is generated here: a 40 × 20 × 10 mm
 * box, no third-party model. Laptop, Chromium.
 *
 * Every movie ends by asserting its end state (the row, then the placed body), so a click that
 * silently did nothing fails instead of publishing a GIF of nothing.
 */
test.describe('docs media: import a model file', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  const BRACKET = { name: 'bracket.stl', mimeType: 'model/stl', buffer: Buffer.from(binaryStl(boxTriangles([40, 20, 10]))) }

  /** Glide to a control with the real mouse and press it, returning the file chooser it opens. */
  const pressImport = async (page) => {
    const el = page.getByTestId('library-import-model')
    await el.scrollIntoViewIfNeeded()
    const b = await el.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await page.waitForTimeout(250)
    const chooser = page.waitForEvent('filechooser')
    await el.click()
    await (await chooser).setFiles(BRACKET)
  }

  test('import-model row still', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('library-section-toggle-user').click()
    await pressImport(page)
    await expect(page.getByTestId('library-row-user.bracket')).toBeVisible()
    await expect(page.getByTestId('library-toast')).toBeVisible()
    await page.getByTestId('library-toast').evaluate((el) => el.remove?.())
    await shot(page, 'import-model-row.png', { locator: page.locator('[data-testid="library-rows-user"] li').first() })
  })

  test('import-model-place', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await page.getByTestId('library-section-toggle-user').click()
    await settle(page)
    await startMovie(page, 'import-model-place')
    await pressImport(page)
    const row = page.getByTestId('library-row-user.bracket')
    await expect(row).toBeVisible()
    await page.waitForTimeout(1400)
    await row.scrollIntoViewIfNeeded()
    const rb = await row.boundingBox()
    const cb = await page.getByTestId('viewport-canvas').boundingBox()
    await humanDrag(page, { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }, { x: cb.x + cb.width * 0.5, y: cb.y + cb.height * 0.55 })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    await expect(page.getByTestId('inspector-name')).toHaveText('bracket 1')
    await page.waitForTimeout(1000)
    await endMovie(page, 'import-model-place', { fps: 10, width: 640 })
  })
})

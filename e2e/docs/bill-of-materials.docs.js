// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, humanDrag, shot, settle } from './support.js'

/**
 * Docs media for `docs/bill-of-materials.md` (`TODO/docs-014`): the BOM panel for a small
 * assembly as a still, and a movie that drags a second identical bolt in and watches the
 * line's count go 1 to 2. The movie asserts the BOM text at each step (the count, then that
 * there is still exactly one line), not a timeout. Laptop, Chromium only.
 */
test.describe('docs media: bill of materials', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('bom-panel still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'small-assembly.ndjson', 7)
    await expect(page.getByTestId('bom-row')).toHaveCount(5)
    await expect(page.getByTestId('bom-total')).toHaveText('(7)')
    await shot(page, 'bom-panel.png', { locator: page.getByTestId('bom') })
  })

  test('bom-updates', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    const viewport = page.getByTestId('viewport')
    const drop = async (fx, fy) => {
      const row = page.getByTestId('library-row-hardware.bolt')
      await row.scrollIntoViewIfNeeded()
      const rb = await row.boundingBox()
      const vb = await viewport.boundingBox()
      await humanDrag(page, { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }, { x: vb.x + vb.width * fx, y: vb.y + vb.height * fy })
      await expect(viewport).toHaveAttribute('data-placing', 'false')
    }
    await startMovie(page, 'bom-updates')
    await drop(0.35, 0.6)
    await expect(viewport).toHaveAttribute('data-body-count', '1')
    await expect(page.getByTestId('bom-row')).toHaveCount(1)
    await expect(page.getByTestId('bom-count')).toHaveText('× 1')
    await page.waitForTimeout(700)
    await drop(0.65, 0.6)
    await expect(viewport).toHaveAttribute('data-body-count', '2')
    // Same size, same line: the count rises, no second line appears.
    await expect(page.getByTestId('bom-row')).toHaveCount(1)
    await expect(page.getByTestId('bom-count')).toHaveText('× 2')
    await expect(page.getByTestId('bom-total')).toHaveText('(2)')
    await page.waitForTimeout(700)
    await endMovie(page, 'bom-updates', { fps: 10, width: 640 })
  })
})

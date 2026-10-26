// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, shot } from './support.js'

/**
 * Docs media for the "Moving the panel out of the way" section of `docs/snap-align.md`
 * (`TODO/ui-087`, stage 1): the Align popover after its grip has been dragged off the two shapes,
 * so the lug and the plate it acts on are both visible beside it. Laptop, Chromium only; the drag
 * is a real mouse path, not a style write.
 */
test.describe('docs media: move the Align popover', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('align-popover-moved still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'plate-and-lug.ndjson', 2)

    // The lug, then Shift for the plate: the same two-shape selection `snap-align.docs.js` uses.
    const canvas = await page.getByTestId('viewport-canvas').boundingBox()
    const clickAt = async (x, y, shift = false) => {
      await page.mouse.move(canvas.x + canvas.width * ((x - 210) / 950), canvas.y + canvas.height * ((y - 53) / 847), { steps: 10 })
      if (shift) await page.keyboard.down('Shift')
      await page.mouse.down()
      await page.waitForTimeout(80)
      await page.mouse.up()
      if (shift) await page.keyboard.up('Shift')
      await page.waitForTimeout(350)
    }
    await clickAt(930, 540)
    await clickAt(520, 470, true)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

    await page.getByTestId('operation-align').click()
    const popover = page.getByTestId('align-popover')
    await expect(popover).toBeVisible()

    // Drag the grip to the right, off the shapes, in steps like a hand.
    const grip = await page.getByTestId('popover-grip').first().boundingBox()
    const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
    await page.mouse.move(from.x, from.y, { steps: 6 })
    await page.mouse.down()
    await page.mouse.move(from.x + 540, from.y + 20, { steps: 24 })
    await page.mouse.up()

    const moved = await popover.boundingBox()
    expect(moved.x).toBeGreaterThan(grip.x + 400)
    await shot(page, 'align-popover-moved.png')
  })
})

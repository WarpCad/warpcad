// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, shot } from './support.js'

/**
 * Docs media for `docs/snap-align.md` "Measuring to one part of the target" (`TODO/ui-097`):
 * the Align popover with a Cube moving against a Raspberry Pi, **Measure to** set to `ethernet`.
 * Laptop only. Every claim in the picture is asserted first: the popover's top line names the
 * part, the Pi was never drilled into, and the selection still reads two bodies.
 */
test.describe('docs media: align measure to', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('snap-align-measure-to still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'pi-and-cube.ndjson', 2)
    // Nothing is selected, so the Objects list is already open.
    await page.getByTestId('objects-row-cube-1').click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
    if (!(await page.getByTestId('object-list').isVisible())) await page.getByTestId('inspector-objects-header').click()
    await page.getByTestId('objects-check-pi-1').click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
    await page.getByTestId('operation-align').click()
    await expect(page.getByTestId('align-operands')).toContainText('whole object')
    await page.getByTestId('align-reference-target').selectOption('ethernet')
    await expect(page.getByTestId('align-operands')).toHaveText('Aligning Cube 1 to Raspberry Pi 1 › ethernet')
    await shot(page, 'snap-align-measure-to.png', { locator: page.getByTestId('align-popover') })
  })
})

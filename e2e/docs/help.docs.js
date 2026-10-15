// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, shot } from './support.js'

/**
 * Docs media for `docs/help.md` (`TODO/ui-061`): the Align pop-up with the Help sheet over it
 * (laptop still), the Contents list at phone width (phone still), and a short movie of opening
 * help from a pop-up and closing it with the pop-up intact (laptop). Chromium only.
 *
 * The movie ends by asserting what the page promises: help closed, the same pop-up still open,
 * its ticked axis and typed offset unchanged, and both shapes still selected.
 */
test.describe('docs media: in-app help', () => {
  /** cube-and-cylinder: the cube's lower-left face and the cylinder's top cap at the default camera. */
  const CUBE_SIDE = { fx: 0.38, fy: 0.7 }
  const CYL_TOP = { fx: 0.499, fy: 0.252 }

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')

  const centreOf = async (/** @type {import('@playwright/test').Locator} */ locator) => {
    const b = await locator.boundingBox()
    return { x: (b?.x ?? 0) + (b?.width ?? 0) / 2, y: (b?.y ?? 0) + (b?.height ?? 0) / 2 }
  }

  /** A human-paced real click on the canvas; Shift held for an added selection. */
  const click = async (page, at, { shift = false } = {}) => {
    const box = await page.getByTestId('viewport-canvas').boundingBox()
    await page.mouse.move(box.x + box.width * at.fx, box.y + box.height * at.fy, { steps: 10 })
    await page.waitForTimeout(150)
    if (shift) await page.keyboard.down('Shift')
    await page.mouse.down()
    await page.waitForTimeout(80)
    await page.mouse.up()
    if (shift) await page.keyboard.up('Shift')
    await page.waitForTimeout(350)
  }

  /** Glide to a control and press it with the real mouse. */
  const press = async (page, testId) => {
    const target = await centreOf(page.getByTestId(testId))
    await page.mouse.move(target.x, target.y, { steps: 12 })
    await page.waitForTimeout(200)
    await page.getByTestId(testId).click()
  }

  /** Cube first, then the cylinder: two shapes selected. */
  const selectBoth = async (page) => {
    await click(page, CUBE_SIDE)
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '1')
    await click(page, CYL_TOP, { shift: true })
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
  }

  test('help-from-popup still', async ({ page, viewport: size }) => {
    test.skip(size?.width !== 1440, 'laptop-only')
    await openApp(page)
    await loadScene(page, 'cube-and-cylinder.ndjson', 2)
    await selectBoth(page)
    await page.getByTestId('operation-align').click()
    await expect(page.getByTestId('snap-align-popover')).toBeVisible()
    await page.getByTestId('snap-align-axis-x').check()
    await page.getByTestId('snap-align-offset').fill('7')
    await page.getByTestId('help-align').click()
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await expect(page.getByTestId('help-content').locator('.help-target')).toBeInViewport()
    // Let the highlight flash settle and the lazy pictures near the heading arrive.
    await page.waitForTimeout(2200)
    await shot(page, 'help-from-popup.png', { maxDiffPixelRatio: 0.02 })
  })

  test('help-contents-phone still', async ({ page, viewport: size }) => {
    test.skip(size?.width !== 390, 'phone-only')
    await openApp(page)
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-help').click()
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await page.getByTestId('help-contents-toggle').click()
    await expect(page.getByTestId('help-contents')).toBeVisible()
    await shot(page, 'help-contents-phone.png', { maxDiffPixelRatio: 0.02 })
  })

  test('help-open-close', { tag: '@movie' }, async ({ page, viewport: size }) => {
    test.skip(size?.width !== 1440, 'laptop-only')
    await openApp(page)
    await loadScene(page, 'cube-and-cylinder.ndjson', 2)
    await startMovie(page, 'help-open-close')
    await selectBoth(page)
    await press(page, 'operation-align')
    const popover = page.getByTestId('snap-align-popover')
    await expect(popover).toBeVisible()
    await page.waitForTimeout(400)
    await page.getByTestId('snap-align-axis-x').check()
    await page.getByTestId('snap-align-offset').fill('7')
    await page.waitForTimeout(500)
    await press(page, 'help-align')
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await page.waitForTimeout(2200)
    await press(page, 'help-close')
    await expect(page.getByTestId('help-sheet')).toHaveCount(0)
    await expect(popover).toBeVisible()
    await expect(page.getByTestId('snap-align-axis-x')).toBeChecked()
    await expect(page.getByTestId('snap-align-offset')).toHaveValue('7')
    await expect(viewport(page)).toHaveAttribute('data-selected-count', '2')
    await page.waitForTimeout(1500)
    await endMovie(page, 'help-open-close', { fps: 10, width: 640 })
  })
})

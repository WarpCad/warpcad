// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * Safe-area insets (`TODO/ui-120`): on a notched phone no always-visible control sits under the
 * status bar, the Dynamic Island, the rounded corners or the home indicator, in portrait and
 * landscape, while the 3D view still runs edge to edge.
 *
 * Playwright's engines report zero `env(safe-area-inset-*)`, so the device itself cannot be
 * driven here. What is testable is the contract: the four `--layout-safe-*` custom properties
 * (`src/styles/semantic.css`) are the only place `env()` is read, and the chrome reads them. The
 * spec sets them on `<html>` to iPhone 15 values and asserts, by bounding box, that each piece
 * of chrome lies wholly inside the safe rectangle. A bar that paints its background under the
 * notch is fine; what must clear the inset is its content, so a bar is measured by its content
 * box (border box minus padding).
 *
 * Phone and tablet, portrait and landscape, with a screenshot at each; laptop asserts nothing
 * moved. Canvas is only a bounding box here: Chromium and WebKit.
 */

const PORTRAIT = { top: 59, right: 0, bottom: 34, left: 0 }
const LANDSCAPE = { top: 0, right: 59, bottom: 21, left: 59 }

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ top: number, right: number, bottom: number, left: number }} insets
 */
async function setInsets(page, insets) {
  await page.evaluate((i) => {
    const style = document.documentElement.style
    style.setProperty('--layout-safe-top', `${i.top}px`)
    style.setProperty('--layout-safe-right', `${i.right}px`)
    style.setProperty('--layout-safe-bottom', `${i.bottom}px`)
    style.setProperty('--layout-safe-left', `${i.left}px`)
  }, insets)
  // Two frames: let the layout settle before measuring.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}

/**
 * The content box of the element with this test id (border box minus padding and border), or
 * null when it is absent or not displayed.
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @returns {Promise<{ left: number, top: number, right: number, bottom: number } | null>}
 */
function contentBox(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden') return null
    const px = (/** @type {string} */ v) => parseFloat(v) || 0
    return {
      left: rect.left + px(cs.paddingLeft) + px(cs.borderLeftWidth),
      top: rect.top + px(cs.paddingTop) + px(cs.borderTopWidth),
      right: rect.right - px(cs.paddingRight) - px(cs.borderRightWidth),
      bottom: rect.bottom - px(cs.paddingBottom) - px(cs.borderBottomWidth),
    }
  }, testId)
}

/**
 * @param {{ left: number, top: number, right: number, bottom: number }} box
 * @param {{ width: number, height: number }} size
 * @param {{ top: number, right: number, bottom: number, left: number }} insets
 */
function expectInside(box, size, insets) {
  const eps = 0.5
  expect(box.left).toBeGreaterThanOrEqual(insets.left - eps)
  expect(box.top).toBeGreaterThanOrEqual(insets.top - eps)
  expect(box.right).toBeLessThanOrEqual(size.width - insets.right + eps)
  expect(box.bottom).toBeLessThanOrEqual(size.height - insets.bottom + eps)
}

// The chrome that is always on screen. `phoneOnly` ones exist only at phone width; the rail
// only in the icons tier; a piece that is not displayed at this size is skipped, not failed.
const CHROME = ['app-header', 'library-tab', 'operations-toolbar', 'library-rail', 'navigation-chrome']

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport-canvas')).toBeVisible()
})

for (const orientation of ['portrait', 'landscape']) {
  test(`chrome clears the safe-area insets, ${orientation}`, async ({ page }, testInfo) => {
    const project = testInfo.project.name
    test.skip(project.endsWith('laptop'), 'laptop has no insets; see the laptop test')

    const base = testInfo.project.use.viewport
    if (!base) throw new Error('project has no viewport')
    const size = orientation === 'portrait' ? base : { width: base.height, height: base.width }
    await page.setViewportSize(size)
    await expect(page.getByTestId('viewport-canvas')).toBeVisible()

    const insets = orientation === 'portrait' ? PORTRAIT : LANDSCAPE
    const canvasBefore = await contentBox(page, 'viewport-canvas')
    await setInsets(page, insets)

    let measured = 0
    for (const id of CHROME) {
      const box = await contentBox(page, id)
      if (!box) continue
      measured += 1
      try {
        expectInside(box, size, insets)
      } catch (error) {
        throw new Error(`${id} ${JSON.stringify(box)} leaves the safe rectangle: ${error.message.split('\n')[0]}`)
      }
    }
    // The header and the nav chrome exist at every size; anything less means the test measured nothing.
    expect(measured).toBeGreaterThanOrEqual(3)

    // The canvas keeps the screen under the insets: its bottom edge stays on the screen edge. Its top
    // follows the header (which grows by the top inset), and in landscape its sides follow the
    // side columns, which widen by the side insets; in portrait there are no side insets to absorb.
    const canvasAfter = await contentBox(page, 'viewport-canvas')
    expect(canvasAfter?.bottom).toBe(canvasBefore?.bottom)
    if (orientation === 'portrait') {
      expect(canvasAfter?.left).toBe(canvasBefore?.left)
      expect(canvasAfter?.right).toBe(canvasBefore?.right)
    }

    await page.screenshot({ path: testInfo.outputPath(`safe-area-${orientation}.png`) })
  })
}

test('with zero insets nothing moves (laptop and any inset-free device)', async ({ page }, testInfo) => {
  const ids = [...CHROME, 'viewport-canvas']
  const before = {}
  for (const id of ids) before[id] = await contentBox(page, id)
  await setInsets(page, { top: 0, right: 0, bottom: 0, left: 0 })
  for (const id of ids) expect(await contentBox(page, id)).toEqual(before[id])
  await page.screenshot({ path: testInfo.outputPath('safe-area-zero.png') })
})

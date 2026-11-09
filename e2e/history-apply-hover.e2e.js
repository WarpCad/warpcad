// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * `TODO/ui-103`: while hovered, the History panel's Apply button must keep a
 * readable text colour. The generic `.actions__btn:hover` rule used to paint the
 * text with `--accent` on the primary button's own `--accent` background.
 * Runs in both colour schemes, at every viewport project.
 */

/** @param {import('@playwright/test').Page} page */
async function dropCube(page) {
  if (!(await page.getByTestId('library-rows').isVisible())) {
    await page.getByTestId('library-tab').click()
  }
  await expect(page.getByTestId('library-rows')).toBeVisible()
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="library-row-primitive.cuboid"]')
    const view = document.querySelector('[data-testid="viewport"]')
    if (!row || !view) throw new Error('missing library row or viewport')
    const from = row.getBoundingClientRect()
    const to = view.getBoundingClientRect()
    const sx = from.left + from.width / 2
    const sy = from.top + from.height / 2
    const ex = to.left + to.width * 0.5
    const ey = to.top + to.height * 0.38
    const fire = (target, type, x, y) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 7,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      )
    fire(row, 'pointerdown', sx, sy)
    for (const t of [0.25, 0.5, 0.75, 1]) {
      fire(window, 'pointermove', sx + (ex - sx) * t, sy + (ey - sy) * t)
    }
    fire(window, 'pointerup', ex, ey)
  })
  await page.waitForTimeout(140)
  const tab = page.getByTestId('library-tab')
  if (await tab.isVisible()) {
    if (await page.getByTestId('library-rows').isVisible()) await tab.click()
    await expect(page.getByTestId('library-rows')).toBeHidden()
  }
}

/**
 * Relative luminance and contrast ratio of two `rgb()`/`rgba()` strings.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function contrast(a, b) {
  /** @param {string} css */
  const lum = (css) => {
    const [r, g, bl] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const lin = [r, g, bl].map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test(`the hovered History Apply button keeps readable text (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
    await dropCube(page)

    await page.getByTestId('timeline-toggle').click()
    await expect(page.getByTestId('timeline-panel')).toBeVisible()
    await page.getByTestId('timeline-row-1').click()
    await page.getByTestId('timeline-edit').click()

    const apply = page.getByTestId('timeline-apply')
    await expect(apply).toBeVisible()
    await apply.hover()

    const { color, background } = await apply.evaluate((el) => {
      const style = getComputedStyle(el)
      return { color: style.color, background: style.backgroundColor }
    })
    expect(color).not.toBe(background)
    expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5)
  })
}

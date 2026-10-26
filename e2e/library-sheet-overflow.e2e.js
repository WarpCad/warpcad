// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The Library scrollers never move sideways (`TODO/ui-085`), driven against `/`.
 *
 * Desktop Safari let the labels-tier sheet scroll a few pixels sideways: `.library__sheet` set only
 * `overflow-y`, which computes the other axis to `auto`, and the Help button's negative inline-end
 * margin overhung the content edge. `panel-tiers` only checks the page's `scrollWidth`; this
 * overflow is inside the sheet's own scroller, so it needs its own check.
 * All three engines: the defect was WebKit-only by report, so a Chromium-only spec would prove nothing.
 */

/** @param {import('@playwright/test').Page} page @param {string} selector */
async function scrollerState(page, selector) {
  return page.evaluate((sel) => {
    const el = /** @type {HTMLElement} */ (document.querySelector(sel))
    const sheet = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const edge = sheet.left + el.clientLeft + el.clientWidth - parseFloat(cs.paddingRight)
    const offenders = [...el.querySelectorAll('*')]
      .map((c) => ({ tag: c.tagName, cls: String(c.getAttribute('class')), over: c.getBoundingClientRect().right - edge }))
      .filter((o) => o.over > 0.5)
    const heading = el.querySelector('h2')
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflowX: cs.overflowX,
      headingLeft: heading ? heading.getBoundingClientRect().left : null,
      offenders: offenders.slice(0, 8),
    }
  }, selector)
}

/**
 * Hover the scroller, send a sideways wheel delta, and assert nothing moved.
 * @param {import('@playwright/test').Page} page @param {string} selector @param {string} at
 */
async function expectNoSidewaysScroll(page, selector, at) {
  // The pop-out's 120ms entry animation moves it; measure once it has settled.
  await page.waitForTimeout(300)
  const before = await scrollerState(page, selector)
  expect(before.offenders, `${at}: children past the content edge`).toEqual([])
  expect(before.scrollWidth, `${at}: scrollWidth <= clientWidth`).toBeLessThanOrEqual(before.clientWidth)
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`${selector} has no box`)
  await page.mouse.move(box.x + box.width / 2, box.y + 60)
  await page.mouse.wheel(60, 0)
  await page.waitForTimeout(150)
  const scrollLeft = await page.locator(selector).evaluate((el) => el.scrollLeft)
  expect(scrollLeft, `${at}: scrollLeft after a sideways wheel`).toBe(0)
  const after = await scrollerState(page, selector)
  expect(after.headingLeft, `${at}: heading did not move`).toBe(before.headingLeft)
}

test.describe('the Library scrollers never scroll sideways (TODO/ui-085)', () => {
  test('labels tier (laptop): the sheet is vertical-only and the Help target keeps its 44px box', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('-laptop'), 'the labels tier is the laptop width')
    await page.goto('/')
    await expect(page.locator('.app__body')).toHaveAttribute('data-library-tier', 'labels')
    await expect(page.locator('#library-sheet')).toBeVisible()
    await expectNoSidewaysScroll(page, '#library-sheet', `labels tier (${testInfo.project.name})`)
    const help = await page.locator('#library-sheet .library__help').boundingBox()
    expect(help?.width).toBeGreaterThanOrEqual(44)
    expect(help?.height).toBeGreaterThanOrEqual(44)
    // ui-061: the 44px target overhangs the hint's line instead of growing the row.
    const row = await page.locator('#library-sheet .library__hint-row').boundingBox()
    expect(row?.height).toBeLessThan(44)
  })

  test('phone: the bottom sheet is vertical-only', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('-phone'), 'the bottom sheet is the phone layout')
    await page.goto('/')
    await page.getByTestId('library-tab').click()
    await expect(page.locator('#library-sheet')).toBeVisible()
    await expectNoSidewaysScroll(page, '#library-sheet', `phone (${testInfo.project.name})`)
    const help = await page.locator('#library-sheet .library__help').boundingBox()
    expect(help?.width).toBeGreaterThanOrEqual(44)
  })

  test('pop-out tier (760×900): a section pop-out is vertical-only', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('-tablet'), 'touch-primary projects, resized to the pop-out tier')
    await page.setViewportSize({ width: 760, height: 900 })
    await page.goto('/')
    await expect(page.locator('.app__body')).toHaveAttribute('data-library-tier', 'popout')
    await page.getByTestId('library-launcher-hardware').click()
    await expect(page.getByTestId('library-section-popout')).toBeVisible()
    await expectNoSidewaysScroll(page, '[data-testid="library-section-popout"]', `pop-out (${testInfo.project.name})`)
  })

  test('tablet (820): the icon rail is vertical-only', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('-tablet'), 'the rail is the tablet layout')
    await page.goto('/')
    await expect(page.locator('.app__body')).toHaveAttribute('data-library-tier', 'icons')
    await expectNoSidewaysScroll(page, '.library-rail__scroll', `rail (${testInfo.project.name})`)
  })
})

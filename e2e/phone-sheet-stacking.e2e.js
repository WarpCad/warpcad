// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The phone bottom-slot stacking (`TODO/ui-070`), driven against `/`.
 *
 * With the Library sheet open and a body selected, the Inspector's collapsed tab must dock on
 * the bottom edge *under* the Library rather than drawn across its rows. Found by hand on a
 * phone: the tab covered **Active Cooling Fan** and the top of **Raspberry Pi Screen**.
 *
 * **All three engines, phone and tablet** (the bottom sheets are where this class of bug broke
 * on WebKit before); at ≥641px there are no sheets, so the same assertions hold trivially and
 * the laptop test only checks the columns are unchanged.
 */

/** @param {import('@playwright/test').Page} page */
const isPhone = (page) => (page.viewportSize()?.width ?? 0) <= 640

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} op
 */
async function dragRowIntoViewport(page, op) {
  await page.getByTestId(`library-row-${op}`).scrollIntoViewIfNeeded()
  await page.evaluate((op) => {
    const row = document.querySelector(`[data-testid="library-row-${op}"]`)
    const view = document.querySelector('[data-testid="viewport"]')
    if (!row || !view) throw new Error(`missing row ${op} or viewport`)
    const from = row.getBoundingClientRect()
    const to = view.getBoundingClientRect()
    const startX = from.left + from.width / 2
    const startY = from.top + from.height / 2
    const endX = to.left + to.width * 0.4
    const endY = to.top + to.height * 0.3
    const fire = (/** @type {EventTarget} */ target, /** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 41,
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
    fire(row, 'pointerdown', startX, startY)
    for (const t of [0.25, 0.5, 0.75, 1]) {
      fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
    }
    fire(window, 'pointerup', endX, endY)
  }, op)
  await page.waitForTimeout(400)
}

/**
 * Empty string when the element at the centre of `testid` (scrolled into view first) is that
 * element or a descendant of it; otherwise what is drawn over it.
 * @param {import('@playwright/test').Page} page
 * @param {string} testid
 */
async function centreIsReachable(page, testid) {
  const row = page.getByTestId(testid)
  await row.scrollIntoViewIfNeeded()
  return row.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return !!hit && el.contains(hit) ? '' : `covered by ${hit?.getAttribute('data-testid') ?? hit?.tagName}`
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('an open Library keeps every row reachable when a drop leaves a body selected', async ({ page }) => {
  if (!isPhone(page) && (page.viewportSize()?.width ?? 0) > 1000) test.skip(true, 'laptop has no sheets')
  if (isPhone(page)) await page.getByTestId('library-tab').click()
  await expect(page.getByTestId('library-rows')).toBeVisible()

  await dragRowIntoViewport(page, 'raspberrypi.screen')
  await expect(page.getByTestId('inspector-tab')).toBeVisible({ timeout: 5000 }).catch(() => {})

  if (isPhone(page)) {
    const tab = await page.getByTestId('inspector-tab').boundingBox()
    const sheet = await page.getByTestId('library-panel').boundingBox()
    expect(tab).not.toBeNull()
    expect(sheet).not.toBeNull()
    if (tab && sheet) {
      const overlap = Math.min(tab.y + tab.height, sheet.y + sheet.height) - Math.max(tab.y, sheet.y)
      expect(overlap, 'Inspector tab must not overlap the Library sheet').toBeLessThanOrEqual(0.5)
    }
  }

  const ids = await page.$$eval('[data-testid^="library-row-"]', (nodes) =>
    nodes
      .filter((n) => n instanceof HTMLElement && n.offsetParent !== null)
      .map((n) => n.getAttribute('data-testid') ?? ''),
  )
  expect(ids.length).toBeGreaterThan(3)
  for (const id of ids) {
    expect(await centreIsReachable(page, id), id).toBe('')
  }
  // The last row's own dropdown, scrolled to the end of the sheet.
  const select = page.getByTestId('library-choice-raspberrypi.screen')
  await select.scrollIntoViewIfNeeded()
  expect(await centreIsReachable(page, 'library-choice-raspberrypi.screen')).toBe('')

  await page.screenshot({ path: test.info().outputPath('stacking.png') })
})

test('tapping the Inspector tab collapses the Library and opens the Inspector', async ({ page }) => {
  test.skip(!isPhone(page), 'only the phone has one bottom-sheet slot')
  await page.getByTestId('library-tab').click()
  await dragRowIntoViewport(page, 'raspberrypi.screen')
  await page.getByTestId('inspector-tab').click()
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'true')
  await expect(page.getByTestId('library-rows')).toBeHidden()
})

test('with the Library collapsed the Inspector tab still sits on the Library tab', async ({ page }) => {
  test.skip(!isPhone(page), 'phone only')
  await page.getByTestId('library-tab').click()
  await dragRowIntoViewport(page, 'raspberrypi.screen')
  await page.getByTestId('library-tab').click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
  const lib = await page.getByTestId('library-tab').boundingBox()
  const insp = await page.getByTestId('inspector-tab').boundingBox()
  expect(lib && insp && insp.y + insp.height <= lib.y + 1).toBe(true)
})

test('laptop: Library and Inspector stay in their columns', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1000, 'laptop only')
  const lib = await page.getByTestId('library-panel').boundingBox()
  const view = await page.getByTestId('viewport').boundingBox()
  expect(lib && view && lib.x + lib.width <= view.x + 1).toBe(true)
})

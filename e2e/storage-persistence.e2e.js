// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * Persistent storage and the cleared-data notice (`TODO/io-028`), driven against `/`.
 *
 * - The app asks the browser to persist storage **after** the first successful autosave of a
 *   session that has content, never at boot.
 * - When the browser has saved a project before (a `localStorage` flag) and the autosave
 *   database later opens empty, the status chip says so, once.
 *
 * **Engines: chromium, firefox and webkit** — IndexedDB and `navigator.storage` are the
 * persistence-sensitive path. **Laptop viewport only**: nothing here is layout, and the notice
 * uses the existing status chip. Whether a real browser honours `persist()` is not checkable in
 * emulation (`TODO/VERIFY.md`).
 */

const CLEARED = "Your browser cleared WarpCad's saved data. Open a project file to carry on."

/** @param {import('@playwright/test').TestInfo} info */
const isLaptop = (info) => info.project.name.endsWith('laptop')

test.describe('persistent storage', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(!isLaptop(info), 'not a layout concern — laptop only (see header)')
    // Count calls to navigator.storage.persist() and grant them, before any app script runs.
    await page.addInitScript(() => {
      window.__persistCalls = 0
      const stub = async () => {
        window.__persistCalls += 1
        return true
      }
      // WebKit ignores a patch to the native manager's `persist`, so stand a wrapper in front of
      // `navigator.storage` instead: our counting `persist`, the browser's own `estimate`.
      const real = navigator.storage
      const stand = {
        persist: stub,
        persisted: async () => false,
        estimate: async () => (real && real.estimate ? real.estimate() : { usage: 0, quota: 1 }),
      }
      Object.defineProperty(navigator, 'storage', { get: () => stand, configurable: true })
    })
  })

  test('asks once after the first save with content, and says so when the browser clears the data', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')

    // Not at boot, and not for an empty document.
    await page.waitForTimeout(800)
    expect(await page.evaluate(() => window.__persistCalls)).toBe(0)

    // Place a box (Library row dragged into the viewport, like every placement spec here).
    const rows = page.getByTestId('library-rows')
    if (!(await rows.isVisible())) await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
    await page.evaluate(() => {
      const row = document.querySelector('[data-testid="library-row-primitive.cuboid"]')
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error('missing library row or viewport')
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const sx = from.left + from.width / 2
      const sy = from.top + from.height / 2
      const ex = to.left + to.width * 0.5
      const ey = to.top + to.height * 0.5
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
      for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', sx + (ex - sx) * t, sy + (ey - sy) * t)
      fire(window, 'pointerup', ex, ey)
    })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

    await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })
    await expect(page.getByTestId('save-status-text')).toHaveText(/^Saved · \d\d:\d\d$/)
    await expect.poll(() => page.evaluate(() => window.__persistCalls)).toBe(1)
    expect(await page.evaluate(() => localStorage.getItem('warpcad.savedBefore'))).toBe('1')

    // The browser clears the database; the flag stays. Delete it, then reload.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const request = indexedDB.deleteDatabase('warpcad')
          request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined)
        }),
    )
    await page.reload()
    await expect(page.getByTestId('app-root')).toBeVisible()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
    await expect(page.getByTestId('save-status-text')).toHaveText(CLEARED)
  })

  test('a first visit with no flag shows no cleared-data notice', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
    await page.waitForTimeout(800)
    await expect(page.getByTestId('save-status-text')).not.toHaveText(CLEARED)
  })
})

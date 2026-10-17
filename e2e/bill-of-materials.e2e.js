// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The Bill of Materials readout (TODO/ui-038), driven against `/` — the running app.
 *
 * Engine scope: **Chromium only, at all three viewports.** The BOM itself is pure
 * DOM/state with no WebGL, canvas or persistence path of its own; the drops that feed
 * it are already cross-engine in `hardware-library-placement.e2e.js`. Viewports stay
 * all three because this is a new panel section and at phone width it shares the
 * Inspector's one bottom-sheet slot with the Library.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'pure DOM/state — see the file header')

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.getByTestId('library-rows-hardware').scrollIntoViewIfNeeded()
}

/**
 * Put the Library away (phone: it shares the sheet slot with the Inspector) and make
 * sure the Inspector, which hosts the BOM, is showing.
 *
 * @param {import('@playwright/test').Page} page
 */
async function showInspector(page) {
  const libraryTab = page.getByTestId('library-tab')
  if ((await libraryTab.isVisible()) && (await page.getByTestId('library-rows').isVisible())) {
    await libraryTab.click()
    await expect(page.getByTestId('library-rows')).toBeHidden()
  }
  if (!(await page.getByTestId('inspector-sheet').isVisible())) {
    await page.getByTestId('inspector-tab').click()
  }
  await expect(page.getByTestId('inspector-sheet')).toBeVisible()
}

/**
 * Drag a Library row into the viewport with real PointerEvents (the same helper shape
 * `hardware-library-placement.e2e.js` uses), mouse and touch alike.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} drop
 */
async function dragRowIntoViewport(page, { op, fx, fy }) {
  await openLibrary(page)
  await page.evaluate(
    ({ op, fx, fy }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error(`missing row ${op} or viewport`)
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const startX = from.left + from.width / 2
      const startY = from.top + from.height / 2
      const endX = to.left + to.width * fx
      const endY = to.top + to.height * fy
      const fire = (/** @type {EventTarget} */ target, /** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 11,
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
    },
    { op, fx, fy },
  )
  await page.waitForTimeout(140)
}

/** @param {import('@playwright/test').Page} page */
function bomRows(page) {
  return page.$$eval('[data-testid="bom-row"]', (nodes) =>
    nodes.map((node) => ({
      op: node.getAttribute('data-op') ?? '',
      text: (/** @type {HTMLElement} */ (node).innerText ?? '').replace(/\s+/g, ' ').trim(),
    })),
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('no BOM is shown until a hardware part is placed, and a primitive does not count', async ({ page }) => {
  await expect(page.getByTestId('bom')).toHaveCount(0)

  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.3, fy: 0.3 })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await showInspector(page)
  await expect(page.getByTestId('bom')).toHaveCount(0)
})

test('the BOM tallies placed parts, adds a row per distinct spec, and drops a row on delete', async ({ page }) => {
  await dragRowIntoViewport(page, { op: 'hardware.bolt', fx: 0.25, fy: 0.3 })
  await dragRowIntoViewport(page, { op: 'hardware.bolt', fx: 0.5, fy: 0.3 })
  await showInspector(page)
  await expect(page.getByTestId('bom')).toBeVisible()
  expect(await bomRows(page)).toEqual([{ op: 'hardware.bolt', text: 'Bolt / screw M10 hex × 20 mm × 2' }])
  await expect(page.getByTestId('bom-total')).toHaveText('(2)')

  // A different part is a second row; the first row is unchanged.
  await dragRowIntoViewport(page, { op: 'hardware.washer', fx: 0.75, fy: 0.22 })
  await showInspector(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  await expect.poll(async () => (await bomRows(page)).length).toBe(2)
  const rows = await bomRows(page)
  expect(rows.map((row) => row.op)).toEqual(['hardware.bolt', 'hardware.washer'])
  expect(rows[0].text).toContain('× 2')
  expect(rows[1].text).toBe('Washer M6 × 1')

  // The washer was just placed, so it is the selection: deleting it removes its row live.
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect.poll(async () => (await bomRows(page)).map((row) => row.op)).toEqual(['hardware.bolt'])
  await expect(page.getByTestId('bom-total')).toHaveText('(2)')
})

test('the BOM section collapses and re-expands from its header', async ({ page }) => {
  await dragRowIntoViewport(page, { op: 'hardware.bearing', fx: 0.4, fy: 0.4 })
  await showInspector(page)
  await expect(page.getByTestId('bom-row')).toHaveCount(1)
  await page.getByTestId('bom-header').click()
  await expect(page.getByTestId('bom-row')).toHaveCount(0)
  await expect(page.getByTestId('bom-total')).toHaveText('(1)')
  await page.getByTestId('bom-header').click()
  await expect(page.getByTestId('bom-row')).toHaveCount(1)
})

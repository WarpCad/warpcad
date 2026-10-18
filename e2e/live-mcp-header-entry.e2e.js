// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * `TODO/ui-075` — a **Live MCP access** entry in the phone header, so a phone user reaches the
 * access sheet without the laptop-only Assistant panel row. Against the real app at `/`.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three viewports (a header-budget layout check) on all three engines; no WebGL/WASM beyond
 * the viewport mounting, no persistence.
 */

// Silent HMR socket: the dev host would otherwise broadcast live-access status over the state set here.
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {})
})

/** @param {import('@playwright/test').Page} page */
async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

test('phone: the header entry opens the access sheet and fits the header', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('phone'), 'The entry is the phone-width way in.')
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  const entry = page.getByTestId('live-mcp-button')
  await expect(entry).toBeVisible()
  const box = await entry.boundingBox()
  expect(box.width).toBeGreaterThanOrEqual(43.5)
  expect(box.height).toBeGreaterThanOrEqual(43.5)
  expect(await noHorizontalScroll(page)).toBe(true)
  // Firefox counts the bar's end padding in scrollWidth, so the row must end inside its own box.
  const bar = await page.getByTestId('app-header').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
  expect(bar.scroll).toBeLessThanOrEqual(bar.client)
  // It does not push the neighbours off the row.
  for (const id of ['assistant-button', 'file-menu-button']) {
    const b = await page.getByTestId(id).boundingBox()
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize().width)
  }

  await entry.click()
  await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
  await page.getByTestId('ai-connect-lease').selectOption('15m')
  await page.getByTestId('ai-connect-enable').click()
  await expect(page.getByTestId('ai-connect-status')).toContainText('enabled until')
  await page.getByTestId('ai-connect-done').click()
  // Feedback: the entry shows the state, and the chip is reachable from the Assistant as before.
  await expect(entry).toHaveAttribute('data-state', 'enabled')
  await entry.click()
  await expect(page.getByTestId('ai-connect-disable')).toBeVisible()
})

test('laptop and tablet: the header carries no extra entry and does not scroll', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.endsWith('phone'), 'Phone has the entry.')
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('live-mcp-button')).toBeHidden()
  expect(await noHorizontalScroll(page)).toBe(true)
})

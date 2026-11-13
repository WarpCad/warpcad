// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { revealAssistantButton } from './support/assistantEntry.js'

/**
 * `TODO/ui-110` — one set of overlay behaviours, against the real app at `/`:
 *
 * - a modal dialog (the Assistant's Key sheet) keeps Tab inside itself, and hands focus back to
 *   the control that opened it;
 * - with a popover and the Help sheet open together, one Escape closes only Help (the top of the
 *   overlay stack), and the next closes the popover.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * No WebGL, WASM or persistence is involved, so Chromium alone would do; it runs on every
 * project anyway, because Tab order and focus-on-click differ across engines. Each viewport
 * writes a screenshot of the open dialog to `test-results/`, as the other overlay specs do.
 * The opener is focused and activated from the keyboard, so Safari's habit of not focusing a
 * clicked button does not change what is under test.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'overlay-focus-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/**
 * Whether keyboard focus is inside the element with this test id.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 * @returns {Promise<boolean>}
 */
function focusIsIn(page, testId) {
  return page.evaluate((id) => !!document.activeElement?.closest(`[data-testid="${id}"]`), testId)
}

test('Tab never leaves the Key sheet, and Escape returns focus to the Assistant button', async ({ page }, info) => {
  await page.goto('/')
  const opener = await revealAssistantButton(page)
  await opener.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByTestId('ai-key-sheet')
  await expect(sheet).toBeVisible()
  await expect.poll(() => focusIsIn(page, 'ai-key-sheet')).toBe(true)

  for (let press = 0; press < 10; press += 1) {
    await page.keyboard.press('Tab')
    expect(await focusIsIn(page, 'ai-key-sheet'), `Tab ${press + 1} stayed in the dialog`).toBe(true)
  }
  for (let press = 0; press < 3; press += 1) {
    await page.keyboard.press('Shift+Tab')
    expect(await focusIsIn(page, 'ai-key-sheet'), `Shift+Tab ${press + 1} stayed in the dialog`).toBe(true)
  }
  await page.screenshot({ path: join(SNAPSHOT_DIR, `key-sheet-${info.project.name}.png`) })

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('assistant-button')).toBeFocused()
})

test('Escape closes only the Help sheet when a popover is open under it', async ({ page }, info) => {
  // The tier where the Library is a launcher that opens a pop-out (`ui-081`), at any project.
  await page.setViewportSize({ width: 760, height: 900 })
  await page.goto('/')
  await page.getByTestId('library-launcher-hardware').click()
  const popout = page.getByTestId('library-section-popout')
  await expect(popout).toBeVisible()

  await page.keyboard.press('?')
  const help = page.getByTestId('help-sheet')
  await expect(help).toBeVisible()
  await page.screenshot({ path: join(SNAPSHOT_DIR, `help-over-popout-${info.project.name}.png`) })

  await page.keyboard.press('Escape')
  await expect(help).toHaveCount(0)
  await expect(popout).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(popout).toHaveCount(0)
})

test('Tab stays inside the Help sheet too', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('?')
  await expect(page.getByTestId('help-sheet')).toBeVisible()
  for (let press = 0; press < 10; press += 1) {
    await page.keyboard.press('Tab')
    expect(await focusIsIn(page, 'help-sheet'), `Tab ${press + 1} stayed in Help`).toBe(true)
  }
})

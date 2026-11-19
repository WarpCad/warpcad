// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clickAssistant } from './support/assistantEntry.js'

/**
 * `TODO/ui-142` — the Assistant's **Half** sheet at phone width keeps the latest activity row
 * readable. Before the fix, at 390x844 the transcript was a 26 px strip (0 px with a body
 * selected, because the *Ask about* chip took the room), so the person saw the Assistant's last
 * words and nothing of what it changed; only **Tall** showed the row.
 *
 * Driven against the real app at `/` with the scripted provider (a dev build; no key, no network):
 * a turn that places a cube, so the transcript holds an activity row and a reply. At every viewport
 * the row's box lies inside the visible transcript and is at least 40 px tall, with nothing
 * selected and with the cube selected. Phone width also checks Undo AI turn stays reachable, the
 * page does not scroll sideways, and Half / Tall / Fold still change the sheet.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three viewports (the sheet is a bottom sheet at phone and tablet width, a column at laptop
 * width) on Chromium and one more engine at least; this is layout, not WebGL, but the app only
 * reaches its ready state with a canvas, so it runs on every engine the project lists.
 */

const script = JSON.parse(readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'ai', 'half-sheet-activity.json'), 'utf8'))

/** @param {import('@playwright/test').Page} page */
async function turnWithActivityRow(page) {
  await page.addInitScript((value) => {
    /** @type {any} */ (window).__WARPCAD_SCRIPTED__ = value
  }, script)
  await page.context().route('https://api.anthropic.com/**', (route) => {
    throw new Error(`the scripted provider must not reach the network: ${route.request().url()}`)
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await clickAssistant(page)
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
  await page.getByTestId('ai-input').fill('add a cube')
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('assistant-panel')).toHaveAttribute('data-running', 'false', { timeout: 30_000 })
}

/**
 * The newest activity row lies inside the visible transcript (not clipped by its scrollport) and
 * is at least 40 px tall.
 *
 * @param {import('@playwright/test').Page} page
 */
async function expectRowVisibleInTranscript(page) {
  const row = page.getByTestId('ai-transcript').locator('button.row').last()
  await expect(row).toBeVisible()
  const box = await row.boundingBox()
  const log = await page.getByTestId('ai-transcript').boundingBox()
  expect(box).not.toBeNull()
  expect(log).not.toBeNull()
  expect(box.height).toBeGreaterThanOrEqual(40)
  expect(box.y).toBeGreaterThanOrEqual(log.y - 1)
  expect(box.y + box.height).toBeLessThanOrEqual(log.y + log.height + 1)
}

test.describe('TODO/ui-142 the Half sheet shows the latest activity row', () => {
  test.skip(process.env.E2E_PREVIEW === '1', 'the scripted provider exists only on the dev host: E2E_DEV=1 npx playwright test e2e/ai-half-sheet.e2e.js')

  test('after a turn, the row is inside the transcript in Half, with nothing selected and with the cube selected', async ({ page }) => {
    await turnWithActivityRow(page)
    const half = page.getByTestId('ai-sheet-half')
    if (await half.isVisible()) await half.click()

    await expectRowVisibleInTranscript(page)
    // The row is how the cube gets selected (`Select` from the activity row); then the chip appears.
    await page.getByTestId('ai-transcript').locator('button.row').last().click()
    await expectRowVisibleInTranscript(page)

    const undo = await page.getByTestId('ai-undo-turn').boundingBox()
    expect(undo?.height).toBeGreaterThanOrEqual(44 - 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Half, Tall and Fold still change the sheet, and the row stays visible in Half and Tall', async ({ page }) => {
    await turnWithActivityRow(page)
    const half = page.getByTestId('ai-sheet-half')
    test.skip(!(await half.isVisible()), 'the height buttons are a small-screen device; the laptop column has one height')
    const panel = page.getByTestId('assistant-panel')

    await page.getByTestId('ai-sheet-full').click()
    await expect(panel).toHaveAttribute('data-sheet', 'full')
    await expectRowVisibleInTranscript(page)

    await page.getByTestId('ai-sheet-peek').click()
    await expect(panel).toHaveAttribute('data-sheet', 'peek')
    await expect(page.getByTestId('ai-transcript')).toHaveCount(0)

    await half.click()
    await expect(panel).toHaveAttribute('data-sheet', 'half')
    await expectRowVisibleInTranscript(page)
  })
})

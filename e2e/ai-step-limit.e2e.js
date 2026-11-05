// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { agentCall, installFakeWebMcp } from './support/fakeWebMcp.js'
import { clickAssistant, revealAssistantButton } from './support/assistantEntry.js'

/**
 * `TODO/ai-033` — the project's **AI step limit**, against the real app at `/`, with a stand-in
 * browser agent (`document.modelContext`, `e2e/support/fakeWebMcp.js`) and no API key:
 *
 * 1. The Assistant's bar reads **Limit: 1,000**; the sheet sets `60`, and the bar reads it.
 * 2. The agent lands a 50-step call; a second 50-step call is refused by the limit's name and the
 *    notice appears. Nothing from the second call lands.
 * 3. **Change limit…** to `100`, the same call again: it lands in the same group, and one
 *    **Undo AI turn** takes all of it back.
 * 4. A reload keeps `100` (the value is saved with the project).
 * 5. A project file stating `3000`, never approved in this browser: the bar shows the lower value
 *    in force, the sheet shows the note and **Use 3,000**, which approves it.
 *
 * Plus the live bridge connected at phone width: the button is still in the bar, and the connected
 * sheet is still its header and one row (`ui-071`).
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three viewports, with a snapshot at each (the bar and the sheet differ at phone width), and
 * all three engines: the value is persisted through IndexedDB autosave and the approval through
 * `localStorage`, both read back after a reload.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'ai-step-limit')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** A shared project that asks for 3,000 steps (hand-written, validated by `parseProject`). */
const ASKS_3000 =
  [
    JSON.stringify({ id: 'shared-cube', op: 'primitive.cuboid', name: 'Shared cube', params: { size: [20, 20, 20], center: [0, 0, 10] } }),
    JSON.stringify({ warpcad: 'project-state', version: 2, merge: { project: 'sharedprojectaaaa', aiRecordsPerTurn: [3000, [1, 'aaaaaa']], clock: 1 } }),
  ].join('\n') + '\n'

/** @param {number} count @param {number} row */
const cubes = (count, row) =>
  Array.from({ length: count }, (_, index) => ({ create: { op: 'primitive.cuboid', positionMm: [(index % 10) * 30, row * 400 + Math.floor(index / 10) * 30, 0] } }))

/** @param {import('@playwright/test').Page} page */
async function openAssistant(page) {
  await clickAssistant(page)
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
  const tall = page.getByTestId('ai-sheet-full')
  if (await tall.isVisible()) await tall.click()
}

/** @param {import('@playwright/test').Page} page @param {string} value */
async function setLimit(page, value, via = 'ai-step-limit-open') {
  await page.getByTestId(via).click()
  const sheet = page.getByTestId('ai-step-limit-sheet')
  await expect(sheet).toBeVisible()
  await page.getByTestId('ai-step-limit-input').fill(value)
  await page.getByTestId('ai-step-limit-save').click()
  await expect(sheet).toHaveCount(0)
}

/** @param {import('@playwright/test').Page} page */
const bodies = async (page) => Number(await page.getByTestId('viewport').getAttribute('data-body-count'))

test.beforeEach(async ({ page }) => {
  // The `<input type=file>` fallback, so File ▸ Open is scriptable on desktop Chromium.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
  await installFakeWebMcp(page)
})

test('raise the step limit after an agent hits it; the next call lands in the same Undo AI turn; the value is saved, and a shared file cannot raise its own', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openAssistant(page)

  // 1. The bar reads the default; the sheet sets 60.
  const button = page.getByTestId('ai-step-limit-open')
  await expect(button).toContainText('Limit: 1,000')
  expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(43.5)
  // A value out of range keeps the sheet open, names the range and saves nothing.
  await button.click()
  await page.getByTestId('ai-step-limit-input').fill('49')
  await page.getByTestId('ai-step-limit-save').click()
  await expect(page.getByTestId('ai-step-limit-error')).toHaveText('Enter a whole number of steps from 50 to 5,000.')
  await expect(page.getByTestId('ai-step-limit-sheet')).toBeVisible()
  await page.screenshot({ path: join(SNAPSHOT_DIR, `sheet-${testInfo.project.name}.png`) })
  await page.getByTestId('ai-step-limit-cancel').click()
  await expect(button).toContainText('Limit: 1,000')
  await setLimit(page, '60')
  await expect(button).toContainText('Limit: 60')

  // 2. 50 land; the next 50 are refused by name, and nothing from them lands.
  const first = await agentCall(page, 'apply_records', { steps: cubes(50, 0) })
  expect(first.ok, JSON.stringify(first).slice(0, 400)).toBe(true)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '50')
  const refused = await agentCall(page, 'apply_records', { steps: cubes(50, 1) })
  expect(refused.ok).toBe(false)
  expect(refused.limit).toBe('recordsPerTurn')
  expect(refused.error).toContain("project's step limit")
  const notice = page.getByTestId('ai-step-limit-notice')
  await expect(notice).toContainText("This turn reached the project's limit of 60 steps.")
  expect(await bodies(page)).toBe(50)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `notice-${testInfo.project.name}.png`) })

  // 3. Change limit… to 100; the same call lands, in the same group.
  await setLimit(page, '100', 'ai-step-limit-from-notice')
  await expect(button).toContainText('Limit: 100')
  await expect(notice).toHaveCount(0)
  const retried = await agentCall(page, 'apply_records', { steps: cubes(50, 1) })
  expect(retried.ok, JSON.stringify(retried).slice(0, 400)).toBe(true)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '100')
  await expect(page.getByTestId('ai-undo-turn')).toBeEnabled()
  await page.getByTestId('ai-undo-turn').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('ai-undo-turn')).toBeDisabled()

  // 4. Saved with the project: still 100 after a reload.
  await expect(page.getByTestId('save-status-text')).toHaveText(/^Saved · \d\d:\d\d$/, { timeout: 10_000 })
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openAssistant(page)
  await expect(page.getByTestId('ai-step-limit-open')).toContainText('Limit: 100')

  // 5. A file that asks for 3,000, never approved here, runs at 1,000 until Use 3,000.
  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const confirm = page.getByTestId('file-open-confirm-replace')
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  await (await chooserEvent).setFiles({ name: 'asks-3000.ndjson', mimeType: 'text/plain', buffer: Buffer.from(ASKS_3000) })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  if (!(await page.getByTestId('assistant-panel').isVisible())) await openAssistant(page)
  const shared = page.getByTestId('ai-step-limit-open')
  await expect(shared).toContainText('Limit: 1,000')
  await expect(shared).toHaveAttribute('data-untrusted', 'true')
  await shared.click()
  await expect(page.getByTestId('ai-step-limit-untrusted')).toContainText("This project asks for 3,000 steps. It's using 1,000 until you approve it.")
  await expect(page.getByTestId('ai-step-limit-approve')).toHaveText('Use 3,000')
  await page.screenshot({ path: join(SNAPSHOT_DIR, `untrusted-${testInfo.project.name}.png`) })
  await page.getByTestId('ai-step-limit-approve').click()
  await expect(page.getByTestId('ai-step-limit-untrusted')).toHaveCount(0)
  await page.getByTestId('ai-step-limit-cancel').click()
  await expect(shared).toContainText('Limit: 3,000')

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('with the live bridge connected at phone width, the button stays and the sheet is its header and one row (ui-071)', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('-phone'), 'phone width only')
  // The dev host broadcasts live-access status to every tab; a silent socket keeps the state ours.
  await page.routeWebSocket(/.*/, () => {})
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await openAssistant(page)
  await page.evaluate(async () => {
    const { useAiChatStore } = await /** @type {any} */ (window).__e2eImport('/src/stores/aiChat.js')
    useAiChatStore().bridge = 'connected'
  })
  const panel = page.getByTestId('assistant-panel')
  await expect(panel).toHaveAttribute('data-linked', 'true')
  const undo = page.getByTestId('ai-undo-turn')
  const limit = page.getByTestId('ai-step-limit-open')
  await expect(undo).toBeVisible()
  await expect(limit).toBeVisible()
  // Phone wording: no "steps" (hidden by CSS, so read what is rendered, not textContent).
  await expect.poll(() => limit.innerText()).toBe('Limit: 1,000')
  const undoBox = /** @type {{ x: number, y: number, width: number, height: number }} */ (await undo.boundingBox())
  const limitBox = /** @type {{ x: number, y: number, width: number, height: number }} */ (await limit.boundingBox())
  // One row: both buttons share it.
  expect(Math.abs(undoBox.y - limitBox.y)).toBeLessThan(2)
  // Header and one row: the panel ends within a row of the bar's top.
  const panelBox = /** @type {{ x: number, y: number, width: number, height: number }} */ (await panel.boundingBox())
  expect(panelBox.y + panelBox.height - (undoBox.y + undoBox.height)).toBeLessThan(20)
  await expect(page.getByTestId('ai-transcript')).toBeHidden()
  await page.screenshot({ path: join(SNAPSHOT_DIR, `connected-${testInfo.project.name}.png`) })
  // The button still opens the sheet while an agent is connected.
  await limit.click()
  await expect(page.getByTestId('ai-step-limit-sheet')).toBeVisible()
})

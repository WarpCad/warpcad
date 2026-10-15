// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { agentCall, installFakeWebMcp, registeredNames } from './support/fakeWebMcp.js'

/**
 * WebMCP, driven end to end against `/` (`TODO/ai-021`, `docs/decisions/ai-partner.md`
 * Decision 13). The real API is Chromium-behind-a-flag only and cannot be switched on in a
 * Playwright-launched browser, so a fake `document.modelContext` is injected with
 * `addInitScript`, shaped as the draft describes it: `registerTool(tool, { signal })`, aborting
 * the signal unregisters, a live name cannot be registered twice, and an agent's call gets back
 * the JSON of what `execute` returned. Everything after the fake is the real app: the tab
 * endpoint, the document, the viewport, History and **Undo AI turn**.
 *
 * - **Default on.** With the API present the tools are registered on load, with no opt-in.
 * - **The switch.** **Browser agents · on/off** in the Assistant header unregisters everything
 *   and is remembered across a reload (per browser profile, IndexedDB).
 * - **Visibility.** A hidden tab unregisters; visible again re-registers (Decision 13 point 5).
 * - **Absent API.** No chip, no throw, and the panel's routes are as before.
 *
 * Engines: all three — `execute` drives persistence and the WebGL viewport, and the fake works
 * in each. Viewports: all three, a snapshot at each, since the chip sits in the Assistant header
 * that becomes a bottom sheet at phone and tablet width.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'webmcp-snapshots')

/** @param {import('@playwright/test').TestInfo} testInfo */
const isLaptop = (testInfo) => testInfo.project.name.endsWith('-laptop')

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} name
 */
async function snapshot(page, testInfo, name) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${name}-${testInfo.project.name}.png`) })
}

/**
 * Pretend the tab went to the background (or came back) the way a browser reports it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'hidden' | 'visible'} state
 */
async function setVisibility(page, state) {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

/** @param {import('@playwright/test').Page} page */
async function openHistory(page) {
  if (await page.getByTestId('timeline-panel').isVisible()) return
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
}

test('a browser agent lists the tools, places a cube and a sphere and unions them; Undo AI turn takes the group back', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installFakeWebMcp(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()

  // Default on: registered on load, no opt-in. The registry's tool set, minus capture_view.
  await expect.poll(() => registeredNames(page)).toContain('create')
  const names = await registeredNames(page)
  for (const name of ['create', 'operate', 'apply_records', 'describe_scene', 'get_selection', 'select', 'list_ops']) expect(names).toContain(name)
  expect(names).not.toContain('capture_view')
  expect(await page.evaluate(() => /** @type {any} */ (window).__webmcp.annotations('describe_scene'))).toMatchObject({ readOnlyHint: true, untrustedContentHint: true })

  // No key: with WebMCP present the Assistant opens on its panel, which says a browser agent can drive it.
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
  const chip = page.getByTestId('ai-webmcp-switch')
  await expect(chip).toHaveText('Browser agents · on')
  await expect(chip).toHaveAttribute('aria-checked', 'true')
  // The dev host (what this suite runs on) names the Claude Code bridge too: Decision 13's third row.
  await expect(page.getByTestId('assistant-connection-text')).toContainText('browser agent')
  await expect(page.getByTestId('assistant-connection-text')).toContainText('Claude Code')
  await expect(page.getByTestId('assistant-connection-text')).toContainText('optional')
  await expect(page.getByTestId('assistant-connection-text')).toContainText('can drive this project')
  await expect(page.getByTestId('assistant-connection-text')).not.toContainText('paste')
  await expect(page.getByTestId('ai-composer-reason')).toBeVisible()
  await expect(page.getByTestId('ai-input')).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await snapshot(page, testInfo, 'on')

  // The agent places a 40 mm cube and a 20 mm sphere on top: both render, as one webmcp group.
  const cube = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], rationale: 'a 40 mm cube' })
  expect(cube.ok, JSON.stringify(cube)).toBe(true)
  const sphere = await agentCall(page, 'create', { op: 'primitive.sphere', positionMm: [0, 0, 40], params: { diameter: 20 }, rationale: 'a 20 mm sphere on top' })
  expect(sphere.ok, JSON.stringify(sphere)).toBe(true)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('ai-undo-turn')).toBeEnabled()

  // Then unions them: one body.
  const union = await agentCall(page, 'operate', { op: 'boolean.union', operands: [{ id: cube.applied[0].bodyId }, { id: sphere.applied[0].bodyId }] })
  expect(union.ok, JSON.stringify(union)).toBe(true)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  if (isLaptop(testInfo)) {
    await openHistory(page)
    for (const step of [1, 2, 3]) {
      const row = page.locator('li.row-wrap', { has: page.getByTestId(`timeline-row-${step}`) })
      await expect(row.getByTestId('chip-origin')).toHaveText('via webmcp')
    }
    await page.getByTestId('timeline-toggle').click()
  }

  // A refusal is a value the agent reads, not an exception that kills its loop.
  const refused = await agentCall(page, 'operate', { op: 'boolean.union', operands: [{ id: union.applied[0].bodyId }] })
  expect(refused.ok).toBe(false)
  expect(typeof refused.error).toBe('string')

  // Undo AI turn takes the whole group back, and the user's own Undo stack never saw it.
  await expect(page.getByTestId('undo-button')).toBeDisabled()
  await page.getByTestId('ai-undo-turn').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('ai-notice').last()).toContainText('browser agent')
  await expect(page.getByTestId('ai-undo-turn')).toBeDisabled()

  // A hidden tab unregisters everything; visible again re-registers.
  await setVisibility(page, 'hidden')
  await expect.poll(() => registeredNames(page)).toEqual([])
  await setVisibility(page, 'visible')
  await expect.poll(() => registeredNames(page)).toContain('create')

  // Off: everything unregistered, and remembered across a reload.
  await chip.click()
  await expect(chip).toHaveText('Browser agents · off')
  await expect(chip).toHaveAttribute('aria-checked', 'false')
  await expect.poll(() => registeredNames(page)).toEqual([])
  await snapshot(page, testInfo, 'off')

  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('ai-webmcp-switch')).toHaveText('Browser agents · off')
  expect(await registeredNames(page)).toEqual([])

  // On again.
  await page.getByTestId('ai-webmcp-switch').click()
  await expect(page.getByTestId('ai-webmcp-switch')).toHaveText('Browser agents · on')
  await expect.poll(() => registeredNames(page)).toContain('create')

  expect(errors).toEqual([])
})

test('without WebMCP nothing is registered, nothing throws, and there is no Browser agents chip', async ({ page }, testInfo) => {
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  expect(await page.evaluate(() => 'modelContext' in document)).toBe(false)

  // The dev host, no key, no WebMCP: the key sheet, as before (Decision 13's third row without the API).
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await expect(page.getByTestId('ai-webmcp-switch')).toHaveCount(0)
  await snapshot(page, testInfo, 'absent')
  expect(errors).toEqual([])
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/ui-071` — while an MCP agent is connected, the Assistant shows only its header (the
 * bridge chip) and **Undo AI turn**; the chat body is hidden, not removed. Against the real app
 * at `/`. No real MCP client: the connected state is put in the (dev-host) chat store through
 * the module the app itself loaded, which is the state `useLiveBridge` writes on a host message.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three viewports with a snapshot at each (layout and a bottom sheet, which has failed on
 * WebKit before: `ui-070`). Chromium and WebKit run in CI; Firefox runs locally only. No
 * WebGL/WASM/persistence is involved beyond the key sheet's IndexedDB save in the last test.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'mcp-connected-assistant')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const KEY = 'sk-ant-api03-E2EUI071_sentinel-0123456789-abcdefghij'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

// The dev host broadcasts live-access status to every open tab, which would overwrite the state
// these tests put in the store (parallel workers each open a tab). A mocked, silent HMR socket
// keeps the page's bridge state under the test's control.
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {})
})

/** @param {import('@playwright/test').Page} page @param {string} bridge */
async function setBridge(page, bridge) {
  await page.evaluate(async (value) => {
    const { useAiChatStore } = await import('/src/stores/aiChat.js')
    useAiChatStore().bridge = value
  }, bridge)
}

/** @param {import('@playwright/test').Page} page */
async function openAssistant(page) {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  // No key and no real lease: the enabled bridge state is what routes the header button to the chat.
  await setBridge(page, 'enabled')
  await page.getByTestId('assistant-button').click()
  // Tall: at half height on a phone the empty transcript has no room left to show (it is 0 px high),
  // which is how the chat looks before this task too. The control is hidden on the laptop column.
  const tall = page.getByTestId('ai-sheet-full')
  if (await tall.isVisible()) await tall.click()
}

/** @param {import('@playwright/test').Page} page */
async function viewportBox(page) {
  const box = await page.getByTestId('viewport').boundingBox()
  return { width: Math.round(box.width), height: Math.round(box.height) }
}

test('with no agent connected the full chat shows; connected, only the chip and Undo remain', async ({ page }, testInfo) => {
  await openAssistant(page)
  const panel = page.getByTestId('assistant-panel')
  await expect(panel).toBeVisible()

  // 1. Not connected: the chat is there (regression guard).
  await expect(page.getByTestId('ai-transcript')).toBeVisible()
  await expect(page.getByTestId('ai-composer')).toBeVisible()
  await expect(panel).toHaveAttribute('data-linked', 'false')
  const before = await viewportBox(page)

  // 2. Connected: the body is hidden, the chip is the status.
  await setBridge(page, 'connected')
  await expect(panel).toHaveAttribute('data-linked', 'true')
  await expect(page.getByTestId('ai-transcript')).toBeHidden()
  await expect(page.getByTestId('ai-composer')).toBeHidden()
  await expect(page.getByTestId('assistant-connection')).toBeHidden()
  const chip = page.getByTestId('ai-bridge-chip')
  await expect(chip).toHaveText('MCP agent · connected')
  expect((await chip.boundingBox()).height).toBeGreaterThanOrEqual(43.5)
  await expect(page.getByTestId('ai-undo-turn')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // 4. The viewport is not resized by the panel's mode.
  const after = await viewportBox(page)
  expect(after).toEqual(before)
  // The panel is smaller connected than it was with the chat open (space handed back at phone/tablet).
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}.png`) })

  // The bridge dropping brings the whole chat back.
  await setBridge(page, 'disconnected')
  await expect(page.getByTestId('ai-transcript')).toBeVisible()
  await expect(page.getByTestId('ai-composer')).toBeVisible()
})

test('the connected panel is shorter than the chat, and the chip opens Live MCP access', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.endsWith('laptop'), 'Phone and tablet only: the laptop column fills its grid cell, so its height does not change.')
  await openAssistant(page)
  const panel = page.getByTestId('assistant-panel')
  const open = (await panel.boundingBox()).height
  await setBridge(page, 'connected')
  await expect(page.getByTestId('ai-transcript')).toBeHidden()
  expect((await panel.boundingBox()).height).toBeLessThan(open / 2)
  // The viewport's own overlays come down with the sheet: the scale readout sits just above it
  // (not 36% of the screen up, where the half sheet used to hold it), and never behind it.
  const sheet = await panel.boundingBox()
  const readout = await page.getByTestId('grid-scale-readout').boundingBox()
  expect(readout.y + readout.height).toBeLessThanOrEqual(sheet.y + 1)
  expect(sheet.y - (readout.y + readout.height)).toBeLessThan(40)
  await page.getByTestId('ai-bridge-chip').click()
  await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
  await expect(page.getByTestId('ai-connect-disable')).toBeVisible()
})

test('Key and model… from the access sheet reaches the key sheet; saving a key brings the chat back', async ({ page }) => {
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ input_tokens: 8 }) })
  })
  await openAssistant(page)
  await setBridge(page, 'connected')
  await expect(page.getByTestId('ai-transcript')).toBeHidden()

  await page.getByTestId('ai-bridge-chip').click()
  await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
  // Turn live access off first (the bridge leaves `connected`), then take the key route.
  await page.getByTestId('ai-connect-disable').click()
  await page.getByTestId('ai-connect-keys').click()
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await page.getByTestId('ai-key-input').fill(KEY)
  await page.getByTestId('ai-key-save').click()
  await expect(page.getByTestId('ai-key-status')).toHaveAttribute('data-status', 'ok')
  await page.getByTestId('ai-key-done').click()

  await expect(page.getByTestId('assistant-panel')).toHaveAttribute('data-linked', 'false')
  await expect(page.getByTestId('ai-transcript')).toBeVisible()
  await expect(page.getByTestId('ai-composer')).toBeVisible()
})

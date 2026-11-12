// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

import {
  emitNativeMcp,
  installNativeShell,
  nativeCalls,
  nativeMcpCall,
  nativeMcpReplies,
  nativeMcpState,
  setNativeMcpConnection,
} from './fixtures/nativeShell.js'
import { clickAssistant } from './support/assistantEntry.js'

/**
 * `TODO/ai-026`: inside the native app its own MCP server is the live host. Driven at `/` with the
 * fake Tauri bridge (`e2e/fixtures/nativeShell.js`) standing in for the Rust host: its events carry
 * the `protocol.js` host messages, and its `mcp_set_access` / `mcp_reply` / `mcp_rotate_token`
 * answer as the Rust host does. The host's own gate (token, Origin, lease refusals, two clients) is
 * tested in Rust (`warpcad-native/src-tauri/src/mcp/`); this proves the page's half.
 *
 *  1. **Assistant → Live MCP access…**: the sheet says *Works while WarpCad is open on screen.*; the
 *     Wi-Fi switch is disabled until a lease is on; enabling **1 hour** hands the host the page
 *     registry's tools and instructions; the switch shows the address, token and three Copy
 *     controls, and **New token** changes the token;
 *  2. a `create` from the host lands as a body, answered with `mcp_reply`, and shows `via mcp` in
 *     History; **Undo AI turn** removes it;
 *  3. **Turn off** tells the host, and the next call is refused there and never reaches the page;
 *  4. back from the background with a client connected, the chip says MCP was paused, then reads
 *     *connected* again.
 *
 * Touch-primary sheet and persistence-free, but the bridge is a WebView boundary: Chromium,
 * Firefox and WebKit, at phone, tablet and laptop, with a snapshot of the sheet at each.
 *
 *     npm run test:e2e:headless -- e2e/native-mcp.e2e.js
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'native-mcp')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const REQUEST = 'add a 40 mm cube'

test.beforeEach(async ({ page }) => {
  await installNativeShell(page, { platform: 'ios' })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

/** @param {import('@playwright/test').Page} page */
async function openSheet(page) {
  await clickAssistant(page)
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await page.getByTestId('ai-key-connect').click()
  await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
}

/** @param {import('@playwright/test').Page} page @param {string} testId */
async function tapSize(page, testId) {
  const box = await page.getByTestId(testId).boundingBox()
  expect(box, testId).not.toBeNull()
  expect(box?.height, testId).toBeGreaterThanOrEqual(43.5)
}

/** @param {import('@playwright/test').Page} page */
async function openHistory(page) {
  if (await page.getByTestId('timeline-panel').isVisible()) return
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toBeVisible()
}

test('enable a lease and Wi-Fi access, a create lands via mcp, Undo AI turn removes it, and off is refused', async ({ page, browserName }, testInfo) => {
  await openSheet(page)
  const sheet = page.getByTestId('ai-connect-sheet')

  // 1. Before a lease: the on-screen rule is said where access is enabled; the switch waits.
  await expect(page.getByTestId('ai-connect-onscreen')).toHaveText('Works while WarpCad is open on screen.')
  await expect(page.getByTestId('ai-connect-lan')).toBeDisabled()
  await expect(page.getByTestId('ai-connect-lease').locator('option[value="tab"]')).toHaveText('Until the app closes')

  await page.getByTestId('ai-connect-lease').selectOption('1h')
  await page.getByTestId('ai-connect-enable').click()
  await expect(page.getByTestId('ai-connect-status')).toHaveAttribute('data-state', 'enabled')
  await expect(page.getByTestId('ai-connect-endpoint')).toContainText('http://127.0.0.1:5184/mcp')
  const enabled = await nativeMcpState(page)
  expect(enabled.lease).toBe('1h')
  // One registry: the host lists the page's tools and says the page's instructions.
  expect(enabled.surface.tools.map((/** @type {{ name: string }} */ t) => t.name)).toEqual(expect.arrayContaining(['create', 'describe_scene', 'get_timeline']))
  expect(enabled.surface.writers).toContain('create')
  expect(enabled.surface.instructions).toContain('WarpCad app')

  // The Wi-Fi switch: address, token, copy controls.
  await expect(page.getByTestId('ai-connect-lan')).toBeEnabled()
  await page.getByTestId('ai-connect-lan').check()
  await expect(page.getByTestId('ai-connect-lan-url')).toHaveText('http://192.168.1.20:5184/mcp')
  const { token } = await nativeMcpState(page)
  await expect(page.getByTestId('ai-connect-token')).toHaveText(token)
  for (const id of ['ai-connect-lan', 'ai-connect-copy-url', 'ai-connect-copy-token', 'ai-connect-copy-cmd', 'ai-connect-rotate']) await expect(page.getByTestId(id)).toBeVisible()
  if (testInfo.project.name.endsWith('phone')) {
    for (const id of ['ai-connect-copy-url', 'ai-connect-copy-token', 'ai-connect-copy-cmd', 'ai-connect-rotate']) await tapSize(page, id)
    const lanBox = await page.locator('label', { has: page.getByTestId('ai-connect-lan') }).boundingBox()
    expect(lanBox?.height).toBeGreaterThanOrEqual(43.5)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // Copy Claude Code command: the clipboard is readable in Chromium; elsewhere the button answers.
  if (browserName === 'chromium') await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByTestId('ai-connect-copy-cmd').click()
  if (browserName === 'chromium') {
    await expect(page.getByTestId('ai-connect-copy-cmd')).toHaveText('Copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `claude mcp add --transport http warpcad http://192.168.1.20:5184/mcp --header "Authorization: Bearer ${token}"`
    )
  } else {
    await expect(page.getByTestId('ai-connect-copy-cmd').or(page.getByTestId('ai-connect-copy-cmd-status'))).toBeVisible()
  }

  await sheet.screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}-sheet.png`) })

  // New token: a different one.
  await page.getByTestId('ai-connect-rotate').click()
  await expect(page.getByTestId('ai-connect-token')).not.toHaveText(token)
  expect(await nativeCalls(page)).toContain('mcp_rotate_token')

  // 2. A client connects and creates a cube: it lands, answered with mcp_reply.
  await page.getByTestId('ai-connect-done').click()
  await setNativeMcpConnection(page, 'connected')
  await expect(page.getByTestId('ai-bridge-chip')).toHaveText('MCP agent · connected')
  const sent = await nativeMcpCall(page, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [40, 40, 40] } }, REQUEST)
  expect(sent.id).toBeDefined()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect.poll(async () => (await nativeMcpReplies(page)).map((r) => r.id)).toEqual([sent.id])
  const [reply] = await nativeMcpReplies(page)
  expect(reply.result.isError).toBeUndefined()
  expect(reply.result.content[0].text).toMatch(/^<document_data source="project" label="tool_result">/)

  if (testInfo.project.name.endsWith('laptop')) {
    await openHistory(page)
    const row = page.locator('li.row-wrap', { has: page.getByTestId('timeline-row-1') })
    await expect(row.getByTestId('chip-origin')).toHaveText('via mcp')
    await page.getByTestId('timeline-toggle').click()
  }

  // Undo AI turn takes it back.
  await expect(page.getByTestId('ai-undo-turn')).toBeEnabled()
  await page.getByTestId('ai-undo-turn').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')

  // 3. Turn off: the host is told, and the next call is refused there.
  await page.getByTestId('ai-bridge-chip').click()
  await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
  await page.getByTestId('ai-connect-disable').click()
  await expect.poll(async () => (await nativeMcpState(page)).lease).toBe('off')
  await expect(page.getByTestId('ai-connect-status')).toHaveAttribute('data-state', 'off')
  const refused = await nativeMcpCall(page, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0] }, REQUEST)
  expect(refused.refused).toMatch(/live MCP access is off/)
  expect((await nativeMcpReplies(page)).length).toBe(1)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
})

test('back from the background with a client connected, the chip says MCP was paused, then connected', async ({ page }) => {
  await openSheet(page)
  await page.getByTestId('ai-connect-lease').selectOption('unlimited')
  await page.getByTestId('ai-connect-enable').click()
  await expect(page.getByTestId('ai-connect-status')).toHaveAttribute('data-state', 'enabled')
  await page.getByTestId('ai-connect-done').click()
  await setNativeMcpConnection(page, 'connected')
  const chip = page.getByTestId('ai-bridge-chip')
  await expect(chip).toHaveText('MCP agent · connected')

  // What the Rust host sends on return: the paused event, then its status.
  await emitNativeMcp(page, 'warpcad-mcp-paused', {})
  await emitNativeMcp(page, 'warpcad-mcp-host', { type: 'status', access: 'enabled', expiresAt: null, connection: 'connected', reason: '' })
  await expect(chip).toHaveText('MCP paused while WarpCad was in the background')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(chip).toHaveText('MCP agent · connected', { timeout: 8_000 })
})

test('a reload starts with access off on the host', async ({ page }) => {
  await expect.poll(async () => (await nativeMcpState(page)).lease).toBe('off')
  expect(await nativeCalls(page)).toContain('mcp_set_access')
})

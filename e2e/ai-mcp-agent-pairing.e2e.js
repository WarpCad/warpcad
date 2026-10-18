// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { connectMcpClient } from '../mcp/claudeCodeStandIn.js'

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'ai-mcp-agent-pairing')
const REQUEST = 'add a 40 mm cube and a 20 mm sphere on top'

test('any MCP client can use explicitly enabled live access, and off refuses writes', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-laptop', 'The live HTTP endpoint is verified once at the laptop target; layout reachability is covered at all Chromium sizes.')
  test.setTimeout(90_000)

  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  const client = await connectMcpClient(`${baseURL}/mcp`)
  try {
    const names = await client.toolNames()
    for (const name of ['create', 'get_selection', 'select']) expect(names).toContain(name)

    const refused = await client.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], request: REQUEST })
    expect(refused.isError).toBe(true)
    expect(refused.text).toMatch(/live MCP access is off/i)
    expect(refused.text).not.toMatch(/[A-Z2-9]{4}-[A-Z2-9]{4}/)

    await page.getByTestId('assistant-button').click()
    await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
    await page.getByTestId('ai-key-connect').click()
    const sheet = page.getByTestId('ai-connect-sheet')
    await expect(sheet).toBeVisible()
    await expect(page.getByTestId('ai-connect-explain')).toContainText('any MCP client on this computer')
    await page.getByTestId('ai-connect-lease').selectOption('15m')
    await page.getByTestId('ai-connect-enable').click()
    // The spec's client is already attached, so the bridge can go straight to `connected` and the
    // "enabled until" wording only shows for a frame: assert the state, not the transient text.
    await expect(page.getByTestId('ai-connect-status')).toHaveAttribute('data-state', /^(enabled|connected)$/)
    await page.getByTestId('ai-connect-done').click()

    const cube = await client.call('create', {
      op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [40, 40, 40] }, request: REQUEST,
    })
    expect(cube.isError, cube.text).toBe(false)
    const sphere = await client.call('create', {
      op: 'primitive.sphere', positionMm: [0, 0, 50], request: REQUEST,
    })
    expect(sphere.isError, sphere.text).toBe(false)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
    await expect(page.getByTestId('ai-bridge-chip')).toHaveText('MCP agent · connected')

    // Closed finding ai-020: the connected panel must not ask for an API key.
    await expect(page.getByTestId('assistant-connection-text')).toContainText('MCP agent is connected')
    await expect(page.getByTestId('assistant-connection-text')).not.toContainText('paste')
    await expect(page.getByTestId('assistant-model-name')).toHaveCount(0)
    const composerReason = page.getByTestId('ai-composer-reason')
    // `ui-071`: connected, the chat body is hidden (not removed): the chip is the visible status,
    // and the hidden nodes still carry the key-free wording.
    await expect(composerReason).toBeHidden()
    await expect(page.getByTestId('assistant-panel')).toHaveAttribute('data-linked', 'true')
    await expect(composerReason).toContainText('MCP agent is connected')
    await expect(composerReason).not.toContainText('Claude Code')
    await expect(page.getByTestId('ai-input')).toBeDisabled()

    await page.getByTestId('ai-undo-turn').click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
    await expect(page.getByTestId('ai-notice').last()).toContainText('last change MCP agent made')

    await page.getByTestId('ai-bridge-chip').click()
    await page.getByTestId('ai-connect-disable').click()
    await expect(page.getByTestId('ai-connect-status')).toContainText('off')
    const afterOff = await client.call('create', { op: 'primitive.cuboid', positionMm: [80, 0, 0], request: REQUEST })
    expect(afterOff.isError).toBe(true)
    expect(afterOff.text).toMatch(/live MCP access is off/i)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')

    const hostile = await page.request.post('/mcp', {
      headers: { origin: 'https://evil.example', 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'evil', version: '0' } } },
    })
    expect(hostile.status()).toBe(403)
  } finally {
    await client.close()
  }
})

test('the live-access control is reachable at phone, tablet, and laptop widths', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('chromium-'), 'Chromium only: this local HTTP access control does not use WebGL, canvas, persistence, or cross-engine APIs.')
  await page.goto('/')
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await page.getByTestId('ai-key-connect').click()
  await expect(page.getByTestId('ai-connect-sheet')).toBeVisible()
  await expect(page.getByTestId('ai-connect-lease')).toBeVisible()
  await expect(page.getByTestId('ai-connect-enable')).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}.png`) })
})
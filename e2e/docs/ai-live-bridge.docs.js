// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { connectMcpClient } from '../../mcp/claudeCodeStandIn.js'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/mcp.md`'s *Live mode* (`TODO/ai-023`): the Assistant's **MCP agent ·
 * connected** chip with the two rows the client placed in History, each marked **via mcp**. The
 * user explicitly enables a timed lease in WarpCad before the ordinary MCP client calls tools.
 * No movie: the interesting part happens in a second program. Laptop, Chromium only.
 */
test.describe('docs media: live bridge', () => {
  test.skip(process.env.E2E_PREVIEW === '1', 'the live bridge is dev-only: E2E_DEV=1 npm run docs:screenshots -- e2e/docs/ai-live-bridge.docs.js')
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')
  // Two tabs holding a lease at once make the bridge refuse as ambiguous: one worker, in order.
  test.describe.configure({ mode: 'serial' })

  test('ai-live-bridge still', async ({ page, baseURL }) => {
    await openApp(page)
    const client = await connectMcpClient(`${baseURL}/mcp`)
    try {
      const request = 'add a 40 mm cube and a 20 mm sphere on top of it'
      const off = await client.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], request })
      expect(off.isError).toBe(true)
      await page.getByTestId('assistant-button').click()
      await page.getByTestId('ai-key-connect').click()
      await page.getByTestId('ai-connect-lease').selectOption('15m')
      await page.getByTestId('ai-connect-enable').click()
      await expect(page.getByTestId('ai-connect-status')).toContainText('enabled until')
      await page.getByTestId('ai-connect-done').click()

      expect((await client.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], request })).isError).toBe(false)
      expect((await client.call('create', { op: 'primitive.sphere', positionMm: [0, 0, 40], params: { diameter: 20 }, request })).isError).toBe(false)
      await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
      await page.getByTestId('timeline-toggle').click()
      await expect(page.getByTestId('timeline-panel')).toBeVisible()
      await expect(page.getByTestId('ai-bridge-chip')).toHaveText('MCP agent · connected')
      // The working chip lingers a moment after a call; let it go so the picture is steady.
      await expect(page.getByTestId('ai-working-chip')).toHaveCount(0)
      await shot(page, 'ai-live-bridge.png')
    } finally {
      await client.close()
    }
  })

  // `TODO/ui-071`: connected, the Assistant is its header and Undo AI turn; the chat is hidden.
  test('mcp-connected still', async ({ page, baseURL }) => {
    await openApp(page)
    const client = await connectMcpClient(`${baseURL}/mcp`)
    try {
      const request = 'add a 40 mm cube'
      await page.getByTestId('assistant-button').click()
      await page.getByTestId('ai-key-connect').click()
      await page.getByTestId('ai-connect-lease').selectOption('15m')
      await page.getByTestId('ai-connect-enable').click()
      await expect(page.getByTestId('ai-connect-status')).toContainText('enabled until')
      await page.getByTestId('ai-connect-done').click()
      expect((await client.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], request })).isError).toBe(false)
      await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
      await expect(page.getByTestId('ai-bridge-chip')).toHaveText('MCP agent · connected')
      await expect(page.getByTestId('assistant-panel')).toHaveAttribute('data-linked', 'true')
      await expect(page.getByTestId('ai-composer')).toBeHidden()
      await expect(page.getByTestId('ai-working-chip')).toHaveCount(0)
      await shot(page, 'mcp-connected.png')
    } finally {
      await client.close()
    }
  })
})

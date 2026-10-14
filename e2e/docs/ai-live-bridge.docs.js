// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { connectClaudeCode } from '../../mcp/claudeCodeStandIn.js'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/mcp.md`'s *Live mode* (`TODO/ai-012`): the Assistant's **Claude Code ·
 * connected** chip with the two rows Claude placed in History, each marked **via mcp**. Reached
 * the real way: an MCP client (Claude Code's stand-in) asks for a change, the code from its reply
 * is typed into **Connect to Claude Code**, and then it places a cube and a sphere on top.
 * No movie: the interesting part happens in a second program. Laptop, Chromium only.
 */
test.describe('docs media: live bridge', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('ai-live-bridge still', async ({ page, baseURL }) => {
    await openApp(page)
    const claude = await connectClaudeCode(`${baseURL}/mcp`)
    try {
      const request = 'add a 40 mm cube and a 20 mm sphere on top of it'
      const first = await claude.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], request })
      const code = /** @type {RegExpExecArray} */ (/\b([A-Z2-9]{4}-[A-Z2-9]{4})\b/.exec(first.text))[1]
      await page.getByTestId('assistant-button').click()
      await page.getByTestId('ai-key-connect').click()
      await page.getByTestId('ai-connect-code').fill(code)
      await page.getByTestId('ai-connect-submit').click()
      await expect(page.getByTestId('ai-connect-connected')).toBeVisible()
      await page.getByTestId('ai-connect-done').click()

      expect((await claude.call('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], request })).isError).toBe(false)
      expect((await claude.call('create', { op: 'primitive.sphere', positionMm: [0, 0, 40], params: { diameter: 20 }, request })).isError).toBe(false)
      await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
      await page.getByTestId('timeline-toggle').click()
      await expect(page.getByTestId('timeline-panel')).toBeVisible()
      await expect(page.getByTestId('ai-bridge-chip')).toHaveText('Claude Code · connected')
      // The working chip lingers a moment after a call; let it go so the picture is steady.
      await expect(page.getByTestId('ai-working-chip')).toHaveCount(0)
      await shot(page, 'ai-live-bridge.png')
    } finally {
      await claude.close()
    }
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { agentCall, installFakeWebMcp, registeredNames } from '../support/fakeWebMcp.js'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/webmcp.md` (`TODO/ai-021`, Decision 13): the Assistant header's
 * **Browser agents · on — N tools** switch, with the cube and the sphere a browser agent placed and their two
 * History rows marked **via webmcp**. WebMCP is on by default, so there is no opt-in sheet to show;
 * the switch in its on state is the control the page documents. The agent is the fake
 * `document.modelContext` the e2e spec uses (the real API needs a Chrome flag a Playwright-launched
 * browser cannot set). No movie: the agent side is a browser extension the harness cannot capture.
 * Laptop, Chromium only.
 */
test.describe('docs media: browser agents (WebMCP)', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('webmcp-chip still', async ({ page }) => {
    await installFakeWebMcp(page)
    await openApp(page)
    await expect.poll(() => registeredNames(page)).toContain('create')

    await page.getByTestId('assistant-button').click()
    // ai-024: the chip counts the tools it offers.
    await expect(page.getByTestId('ai-webmcp-switch')).toHaveText(/^Browser agents · on — \d+ tools$/)

    const cube = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], rationale: 'a 40 mm cube' })
    expect(cube.ok).toBe(true)
    const sphere = await agentCall(page, 'create', { op: 'primitive.sphere', positionMm: [0, 0, 40], params: { diameter: 20 }, rationale: 'a 20 mm sphere on top' })
    expect(sphere.ok).toBe(true)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

    await page.getByTestId('timeline-toggle').click()
    await expect(page.getByTestId('timeline-panel')).toBeVisible()
    // The working chip lingers a moment after a call; let it go so the picture is steady.
    await expect(page.getByTestId('ai-working-chip')).toHaveCount(0)
    await shot(page, 'webmcp-chip.png')
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { createToolRegistry } from '../src/ai/tools/index.js'

/**
 * The agent prompting guide is reachable (`TODO/docs-029`): open `/`, open Help from the File menu,
 * find **Prompting an agent to design a part** in the contents, open it, and see the tool list the
 * build generated from the tool registry. No WebGL, canvas or persistence path is involved, so this runs
 * on Chromium only (`TODO/docs-029` Testing); the unit spec `scripts/agent-docs.spec.js` holds the
 * generated text to the registry, this spec holds the page to the app.
 */
test.describe('Help: prompting an agent to design a part', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'chromium-only: a docs page, no engine-sensitive path')

  test('opens from the contents and shows every WebMCP tool', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-help').click()
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    // The contents sit beside the page at laptop width and behind a button at phone width.
    const toggle = page.getByTestId('help-contents-toggle')
    if (await toggle.isVisible()) await toggle.click()
    const entry = page.getByTestId('help-contents-agent-prompting')
    await expect(entry).toContainText('Prompting an agent to design a part')
    await entry.click()

    await expect(page.getByTestId('help-sheet')).toHaveAttribute('data-page', 'agent-prompting')
    const content = page.getByTestId('help-content')
    await expect(content.getByRole('heading', { name: 'The tools' })).toBeVisible()
    for (const tool of createToolRegistry().toolsFor('webmcp')) {
      await expect(content.locator('h3', { hasText: tool.name }).first(), tool.name).toBeAttached()
    }
    const result = content.getByRole('heading', { name: 'A worked example' })
    await result.scrollIntoViewIfNeeded()
    await expect(result).toBeVisible()
  })

  test('a cold link opens the guide', async ({ page }) => {
    await page.goto('/#/help/agent-prompting')
    await expect(page.getByTestId('help-sheet')).toHaveAttribute('data-page', 'agent-prompting')
    await expect(page.getByTestId('help-current-page')).toContainText('Prompting an agent to design a part')
  })
})

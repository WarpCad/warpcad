// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, shot } from './support.js'

/**
 * Docs media for `docs/design-intent.md` (`TODO/ai-003`): the Project settings dialog with the
 * page's own example text, the "came with this project" confirm, and a History row expanded to
 * show why a step exists. The scene is opened through the real File ▸ Open path from a fixture
 * whose steps carry AI-recorded intent, as a project built by the assistant would. Laptop,
 * Chromium only.
 */
test.describe('docs media: design intent', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('project-settings-dialog still', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('project-settings').click()
    const dialog = page.getByTestId('project-settings-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('project-settings-text').fill('Print on a 220×220 mm bed; walls at least 1.6 mm')
    await expect(page.getByTestId('project-settings-count')).toContainText('48 / 2000')
    await shot(page, 'project-settings-dialog.png', { locator: dialog })
  })

  // `TODO/io-023`: the Description field, for people, with its live preview of the Markdown subset.
  test('project-settings-description still', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('project-settings').click()
    const dialog = page.getByTestId('project-settings-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('project-settings-description').fill('A **wall-mounted** fan duct for a closet.\n\n- prints in *PETG*\n- walls are `1.6` mm')
    await expect(page.getByTestId('project-settings-description-preview').locator('li')).toHaveCount(2)
    await page.getByTestId('project-settings-description').blur()
    await shot(page, 'project-settings-description.png', { locator: dialog })
  })

  test('project-settings-untrusted still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'bracket-intent.ndjson', 3)
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('project-settings').click()
    const dialog = page.getByTestId('project-settings-dialog')
    await expect(page.getByTestId('project-settings-untrusted')).toBeVisible()
    await page.getByTestId('project-settings-text').blur()
    await shot(page, 'project-settings-untrusted.png', { locator: dialog })
  })

  test('history-intent still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'bracket-intent.ndjson', 3)
    await page.getByTestId('timeline-toggle').click()
    const panel = page.getByTestId('timeline-panel')
    await expect(panel).toBeVisible()
    await page.getByTestId('timeline-intent-toggle').nth(1).click()
    await expect(page.getByTestId('timeline-intent')).toContainText('Upright that carries the tube')
    await shot(page, 'history-intent.png', { locator: panel })
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { loadScene, openApp, shot } from './support.js'

/**
 * Docs still for `docs/user-library.md`'s *My parts* section (`TODO/ui-055`, swept by
 * `TODO/docs-020`): the Library panel with a saved **Standoff** group listed under My parts
 * (name, thumbnail, size). Its own file so adding it does not re-record `user-library.docs.js`'s
 * movies. Laptop, Chromium.
 */
test.describe('docs media: my parts', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('library-my-parts still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'cube-and-cylinder.ndjson', 2)
    const viewport = page.getByTestId('viewport')
    if (!(await page.getByTestId('object-list').isVisible().catch(() => false))) await page.getByTestId('inspector-objects-header').click()
    await page.getByTestId('objects-check-cube-1').click()
    await page.getByTestId('objects-check-cyl-1').click()
    await expect(viewport).toHaveAttribute('data-selected-count', '2')
    await page.getByTestId('operation-group').click()
    await expect(viewport).toHaveAttribute('data-body-count', '1')
    await page.getByTestId('library-save').click()
    await page.getByTestId('save-library-name').fill('Standoff')
    await page.getByTestId('save-library-submit').click()
    await expect(page.getByTestId('library-toast')).toHaveText('Saved Standoff')
    await expect(page.getByTestId('library-row-user.standoff')).toBeVisible()
    await page.getByTestId('library-row-user.standoff').scrollIntoViewIfNeeded()
    await shot(page, 'library-my-parts.png', { locator: page.getByTestId('library-panel') })
  })
})

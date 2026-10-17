// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, shot } from './support.js'

/**
 * Docs media for `docs/help.md` "Updating WarpCad" (`TODO/build-005`): the window with the
 * update strip along the bottom. The dev server has no service worker, so the strip is raised the
 * way the worker raises it: through the update store. Laptop only; Chromium only.
 */
test.describe('docs media: app update', () => {
  test('pwa-update-toast still', async ({ page, viewport: size }) => {
    test.skip(size?.width !== 1440, 'laptop-only')
    await openApp(page)
    await loadScene(page, 'cube-and-cylinder.ndjson', 2)
    await page.evaluate(async () => {
      const { useAppUpdateStore } = await import('/src/stores/appUpdate.js')
      useAppUpdateStore().noteNeedRefresh()
    })
    await expect(page.getByTestId('pwa-update-toast')).toBeVisible()
    await expect(page.getByTestId('pwa-update-reload')).toBeVisible()
    await shot(page, 'pwa-update-toast.png')
  })
})

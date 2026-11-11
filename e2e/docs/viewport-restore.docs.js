// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { loadScene, openApp, shot } from './support.js'

/**
 * Docs media for `docs/viewport-navigation.md` "If the 3D view goes blank" (`TODO/render-006`):
 * the banner with **Restore view**, after the WebGL context was forced away with
 * `WEBGL_lose_context` and never handed back. Phone only, since a backgrounded iPhone app is
 * where a user meets it. Chromium only, like every docs picture.
 */
test.describe('docs media: viewport restore', () => {
  test('viewport-restore still', async ({ page, viewport: size }) => {
    test.skip(size?.width !== 390, 'phone-only')
    await openApp(page)
    await loadScene(page, 'two-solids.ndjson', 2)
    await page.evaluate(() => {
      const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector('[data-testid="viewport-canvas"]'))
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      const extension = gl?.getExtension('WEBGL_lose_context')
      if (!extension) throw new Error('WEBGL_lose_context is not available')
      extension.loseContext()
    })
    await expect(page.getByTestId('viewport-context-banner')).toContainText('Restoring…')
    // The button appears once the browser has had 3 s to give the context back by itself.
    await expect(page.getByTestId('viewport-restore')).toBeVisible({ timeout: 8000 })
    await shot(page, 'viewport-restore.png', { locator: page.getByTestId('viewport') })
  })
})

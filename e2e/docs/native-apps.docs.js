// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { installNativeShell } from '../fixtures/nativeShell.js'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/native-apps.md` "Help in the app" (`TODO/ui-119`): the Help sheet in the
 * iPhone app with no connection. The fake shell (`e2e/fixtures/nativeShell.js`) stands in for the
 * Tauri webview and the help requests are aborted, as they are offline. Phone only; Chromium only.
 */
/** Help's own files (the index, a page, a picture), not the dev server's `/src/help/*.js` modules. @param {URL} url */
const isHelpFile = (url) => /\/help\/(?:index\.json|[\w-]+\.html|img\/.+)$/.test(url.pathname) && !url.pathname.includes('/src/')

test.describe('docs media: native apps', () => {
  test('native-help-offline still', async ({ page, viewport: size }) => {
    test.skip(size?.width !== 390, 'phone-only')
    await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
    await page.route(isHelpFile, (route) => route.abort('internetdisconnected'))
    await openApp(page)
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-help').click()
    await expect(page.getByTestId('help-error')).toContainText('Help needs a connection')
    await expect(page.getByTestId('help-retry')).toHaveText('Retry')
    // The sheet covers the save-status chip that `shot` masks by default, so nothing needs masking.
    await shot(page, 'native-help-offline.png', { mask: [] })
  })
})

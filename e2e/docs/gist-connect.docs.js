// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { fakeGitHub, routeFakeGitHub } from '../support/fakeGistApi.js'
import { openApp, shot } from './support.js'

/**
 * Docs media for `docs/sharing.md` (`TODO/io-017`): the **Connect GitHub for short links** sheet
 * at phone width — the GitHub token field first (filled with a sentinel, so it shows as dots),
 * then the link to GitHub's token page and what kind of token to make. Phone only, Chromium only,
 * like every docs still. GitHub is the e2e fake (`e2e/support/fakeGistApi.js`); nothing is sent
 * in this picture, and no real token exists anywhere in it.
 *
 * Not an acceptance check: scenario 30 is driven by hand.
 */
test.describe('docs media: the gist token sheet', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'phone only')

  test('gist-connect.png: File ▾ → Connect GitHub for gists…, token pasted', async ({ page }) => {
    await routeFakeGitHub(page, fakeGitHub())
    await openApp(page)
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('gist-connect-open').scrollIntoViewIfNeeded()
    await page.getByTestId('gist-connect-open').click()
    await expect(page.getByTestId('gist-connect-dialog')).toBeVisible()
    await page.getByTestId('gist-connect-token').fill('github_pat_DOCS_SENTINEL_not_a_real_token')
    await expect(page.getByTestId('gist-connect-submit')).toBeEnabled()
    await page.getByTestId('gist-connect-token').blur()
    await shot(page, 'gist-connect.png')
  })
})

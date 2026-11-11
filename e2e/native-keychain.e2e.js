// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { installNativeShell, nativeKeychain } from './fixtures/nativeShell.js'
import { clickAssistant } from './support/assistantEntry.js'

/**
 * `TODO/ai-025`: inside the iOS app the Anthropic key lives in the Keychain, not in IndexedDB.
 * Driven at `/` with the fake Tauri bridge (`e2e/fixtures/nativeShell.js`) and its in-memory
 * Keychain. The Anthropic API is stubbed; no real key and no real network.
 *
 *  1. paste a key in **Assistant**, **Save and test**: the fake Keychain holds it under the
 *     `anthropic` account, the `warpcad-credentials` database is empty, and the sheet's line says
 *     *Keychain*;
 *  2. a key an earlier version left in IndexedDB is moved on the next launch: the Keychain holds it,
 *     IndexedDB is emptied, and the panel finds the key (the `ai-020` repro: it must not say "no key").
 *
 * Persistence, so Chromium, Firefox and WebKit; the sheet line wraps at phone width, so phone,
 * tablet and laptop.
 *
 *     npm run test:e2e:headless -- e2e/native-keychain.e2e.js
 */

const KEY = 'sk-ant-api03-KEYCHAINSENTINEL_sentinel-0123456789-abcdef'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

/** @param {import('@playwright/test').Page} page */
async function stubApi(page) {
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ input_tokens: 8 }) })
  })
}

/**
 * Every record in the `warpcad-credentials` database, as `{ key: value }`.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, unknown>>}
 */
const credentialRecords = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('warpcad-credentials', 1)
        open.onupgradeneeded = () => open.result.createObjectStore('credentials')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('credentials', 'readonly')
          const keys = tx.objectStore('credentials').getAllKeys()
          const values = tx.objectStore('credentials').getAll()
          tx.oncomplete = () => {
            db.close()
            resolve(Object.fromEntries(keys.result.map((k, i) => [k, values.result[i]])))
          }
        }
      }),
  )

/**
 * Leave a key in IndexedDB the way a version before this change did.
 *
 * @param {import('@playwright/test').Page} page
 */
const seedLegacyKey = (page) =>
  page.evaluate(
    (key) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('warpcad-credentials', 1)
        open.onupgradeneeded = () => open.result.createObjectStore('credentials')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('credentials', 'readwrite')
          tx.objectStore('credentials').put({ key }, 'ai-anthropic')
          tx.oncomplete = () => {
            db.close()
            resolve(null)
          }
        }
      }),
    KEY,
  )

test.beforeEach(async ({ page }) => {
  await installNativeShell(page, { platform: 'ios' })
  await stubApi(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('in the iOS app a saved key is in the Keychain, IndexedDB holds nothing, and the sheet says Keychain', async ({ page }) => {
  await clickAssistant(page)
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await page.getByTestId('ai-key-input').fill(KEY)
  await page.getByTestId('ai-key-save').click()
  await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')

  expect(JSON.parse((await nativeKeychain(page)).anthropic)).toEqual({ key: KEY })
  expect(await credentialRecords(page)).toEqual({})
})

test('a key an earlier version left in IndexedDB moves into the Keychain on the next launch', async ({ page }) => {
  await seedLegacyKey(page)
  expect(Object.keys(await credentialRecords(page))).toEqual(['ai-anthropic'])
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()

  // The panel finds the key: it is not told there is none (`ai-020`).
  await expect(page.getByTestId('assistant-dot')).toHaveAttribute('data-dot-state', 'saved')
  await expect.poll(async () => JSON.parse((await nativeKeychain(page)).anthropic ?? 'null')).toEqual({ key: KEY })
  await expect.poll(() => credentialRecords(page)).toEqual({})

  // Opened with a stored key that has not been tested this launch, the panel names where it lives.
  await clickAssistant(page)
  await expect(page.getByTestId('assistant-connection-text')).toContainText('Keychain')
})

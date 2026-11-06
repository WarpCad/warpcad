// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, shot } from './support.js'

/**
 * Docs still for `docs/user-library.md`'s *A part that can't be loaded* section (`TODO/ui-095`):
 * My parts with one ordinary part and, below it, a stored part that nests a part the library no
 * longer holds, with the banner naming it. Its own file so adding it does not re-record
 * `user-library.docs.js`'s movies. Laptop, Chromium.
 *
 * The library's IndexedDB (`warpcad-parts`, store `parts`, keyed by op) is seeded after the app
 * first opens, then the page is reloaded so the app reads it at start.
 */
test.describe('docs media: a part that cannot be loaded', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** @param {string} op @param {string} name @param {string} child @param {object} [params] @param {number} [savedAt] */
  const storedPart = (op, name, child, params, savedAt) => [
    op,
    { definition: { op, name, version: 1, result: 'r1', records: [{ id: 'r1', op: child, params: params ?? {} }], params: [] }, savedAt },
  ]

  test('user-library-broken-part still', async ({ page }) => {
    await openApp(page)
    const entries = [
      storedPart('user.spacer', 'Spacer', 'primitive.cuboid', { size: [20, 20, 4] }, 2),
      storedPart('user.feather-enclosure', 'Feather enclosure', 'user.esp8266-feather', {}, 1),
    ]
    await page.evaluate(
      (rows) =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('warpcad-parts', 1)
          open.onupgradeneeded = () => {
            if (!open.result.objectStoreNames.contains('parts')) open.result.createObjectStore('parts')
          }
          open.onerror = () => reject(open.error)
          open.onsuccess = () => {
            const db = open.result
            const tx = db.transaction('parts', 'readwrite')
            for (const [key, value] of rows) tx.objectStore('parts').put(value, key)
            tx.oncomplete = () => {
              db.close()
              resolve(undefined)
            }
            tx.onerror = () => reject(tx.error)
          }
        }),
      entries,
    )
    await page.reload()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')

    const toggle = page.getByTestId('library-section-toggle-user')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await expect(page.getByTestId('library-row-user.spacer')).toBeVisible()
    await expect(page.getByTestId('library-broken-reason-user.feather-enclosure')).toHaveText(
      "Can't be loaded: it uses esp8266-feather, which is no longer in My parts",
    )
    await expect(page.getByTestId('library-load-problem')).toContainText('Feather enclosure: it uses esp8266-feather')
    await expect(page.getByTestId('library-load-problem')).toContainText('Delete it from its ⋯ menu below.')
    await page.getByTestId('library-broken-user.feather-enclosure').scrollIntoViewIfNeeded()
    await shot(page, 'user-library-broken-part.png', { locator: page.getByTestId('library-user-body') })
  })
})

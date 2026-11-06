// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, shot, settle, humanDrag } from './support.js'

/**
 * Docs still for `docs/user-library.md`'s *A part that's only in this project* section
 * (`TODO/ui-096`): a Spacer placed once and then deleted from My parts with **Keep a copy in the
 * project**, so its row reads *Only in this project* (asserted), with its **⋯** menu open showing
 * the note that says why it is still listed. On the laptop layout the open menu sits over that row
 * (My parts is the last section), so the picture shows the menu. Its own file so adding it does not re-record
 * `user-library.docs.js`'s movies. Laptop, Chromium.
 *
 * The library's IndexedDB (`warpcad-parts`, store `parts`, keyed by op) is seeded after the app
 * first opens, then the page is reloaded so the app reads it at start.
 */
test.describe('docs media: a part that is only in this project', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  test('user-library-project-only still', async ({ page }) => {
    await openApp(page)
    const spacer = {
      definition: { op: 'user.spacer', name: 'Spacer', version: 1, result: 'r1', records: [{ id: 'r1', op: 'primitive.cuboid', params: { size: [20, 20, 4] } }], params: [] },
      savedAt: 1,
    }
    await page.evaluate(
      (row) =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('warpcad-parts', 1)
          open.onupgradeneeded = () => {
            if (!open.result.objectStoreNames.contains('parts')) open.result.createObjectStore('parts')
          }
          open.onerror = () => reject(open.error)
          open.onsuccess = () => {
            const db = open.result
            const tx = db.transaction('parts', 'readwrite')
            tx.objectStore('parts').put(row, 'user.spacer')
            tx.oncomplete = () => {
              db.close()
              resolve(undefined)
            }
            tx.onerror = () => reject(tx.error)
          }
        }),
      spacer,
    )
    await page.reload()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')

    const toggle = page.getByTestId('library-section-toggle-user')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    const row = page.getByTestId('library-row-user.spacer')
    await expect(row).toBeVisible()
    // Step 1 of the page's example: drag Spacer in, then delete it from My parts, keeping the copy.
    await row.scrollIntoViewIfNeeded()
    await settle(page)
    await page.waitForTimeout(600)
    const rb = await row.boundingBox()
    const cb = await page.getByTestId('viewport-canvas').boundingBox()
    await humanDrag(page, { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }, { x: cb.x + cb.width * 0.5, y: cb.y + cb.height * 0.55 })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    await page.getByTestId('user-part-menu-user.spacer').click()
    await page.getByTestId('user-part-delete').click()
    await page.getByTestId('user-part-delete-confirm').click()
    await expect(page.getByTestId('library-toast')).toHaveText('Deleted Spacer from My parts')

    // Step 2: the row reads Only in this project; ⋯ says why it is listed.
    await expect(page.getByTestId('library-only-project-user.spacer')).toHaveText('Only in this project')
    await expect(page.getByTestId('library-toast')).toBeHidden({ timeout: 10000 })
    // Bring the row to the top of its column so the menu opens beside it, not over it.
    await page.getByTestId('library-row-user.spacer').evaluate((el) => {
      let a = el.parentElement
      while (a && !(a.scrollHeight > a.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(a).overflowY))) a = a.parentElement
      if (a) a.scrollTop += el.getBoundingClientRect().top - a.getBoundingClientRect().top - 40
    })
    await page.getByTestId('user-part-menu-user.spacer').click()
    await expect(page.getByTestId('user-part-project-only-note')).toHaveText("Not in My parts. It's listed because it's placed once in this project.")
    await shot(page, 'user-library-project-only.png')
  })
})

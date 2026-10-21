// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect } from '@playwright/test'

/**
 * A Library row's settings (its variant `<select>`s, ↺ Reset, remembered line, My parts ⋯ menu and
 * mesh line) wherever the row is (`TODO/ui-084`).
 *
 * In the labelled column (laptop) and the phone sheet they sit under the row, always visible. In
 * the icons tier (the 820px tablet) the row is a 44px tile and its settings live in the row
 * pop-out a tap opens. Specs go through these helpers instead of branching on a tier, so one spec
 * reads the same at every width. A tile is recognised by `aria-haspopup="dialog"`, which a labelled
 * row never carries.
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} op
 * @returns {Promise<boolean>} whether the row is a rail tile
 */
export async function isRailTile(page, op) {
  return (await page.getByTestId(`library-row-${op}`).getAttribute('aria-haspopup')) === 'dialog'
}

/**
 * Show a row's settings: open its pop-out if it is a tile; a no-op for a labelled row.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} op
 */
export async function showRowSettings(page, op) {
  if (!(await isRailTile(page, op))) return
  const tile = page.getByTestId(`library-row-${op}`)
  if ((await tile.getAttribute('aria-expanded')) !== 'true') {
    await tile.scrollIntoViewIfNeeded()
    await tile.click()
  }
  await expect(page.getByTestId('library-row-popout')).toHaveAttribute('data-op', op)
}

/**
 * Put a row pop-out away (Escape), if one is open. A no-op otherwise.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function hideRowSettings(page) {
  const popout = page.getByTestId('library-row-popout')
  if ((await popout.count()) === 0) return
  await page.keyboard.press('Escape')
  await expect(popout).toHaveCount(0)
}

/**
 * Run `fn` with a row's settings on screen, then put a pop-out away again so it never covers the
 * viewport for whatever the spec does next.
 *
 * @template T
 * @param {import('@playwright/test').Page} page
 * @param {string} op
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withRowSettings(page, op, fn) {
  await showRowSettings(page, op)
  try {
    return await fn()
  } finally {
    await hideRowSettings(page)
  }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The in-app Help shows the docs picture that matches the reader's colour scheme (`TODO/docs-030`):
 * every `x.png` / `x.gif` has an `x.dark.*` twin, `scripts/help-build.mjs` wraps the pair in a
 * `<picture>` whose dark `<source>` is keyed to `prefers-color-scheme`, and the browser picks.
 * `<picture>` source selection is the engine-sensitive part, hence all three engines and viewports.
 *
 * Driven against `/` (the Help sheet opens by its deep link), not a component in isolation.
 */

const STILL = 'tour-step-1-place'

/**
 * Open Getting started and return the loaded `currentSrc` of one still.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function loadedStillSource(page) {
  await page.goto('/#/help/getting-started')
  await expect(page.getByTestId('help-content')).toBeVisible()
  const target = page.getByTestId('help-content').locator(`img[src$="${STILL}.png"]`)
  await target.scrollIntoViewIfNeeded()
  await expect.poll(() => target.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true)
  return target.evaluate((el) => el.currentSrc)
}

for (const [scheme, expected] of [
  ['dark', `${STILL}.dark.png`],
  ['light', `${STILL}.png`],
]) {
  test.describe(`Help pictures under ${scheme}`, () => {
    test.use({ colorScheme: /** @type {'dark' | 'light'} */ (scheme) })

    test(`loads ${expected}`, async ({ page }) => {
      const source = await loadedStillSource(page)
      expect(source.endsWith(`/${expected}`), source).toBe(true)
    })
  })
}

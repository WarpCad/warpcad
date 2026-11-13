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

/**
 * Choose a theme in the Help footer. Help re-renders its footer while the page settles, and under
 * load a click can land on the element that is just being replaced, so the click is repeated until
 * the segment shows as pressed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'system' | 'dark' | 'light'} choice
 */
async function chooseTheme(page, choice) {
  const button = page.getByTestId(`help-theme-${choice}`)
  await expect(async () => {
    await button.click({ timeout: 2000 })
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
  }).toPass({ timeout: 15000 })
}

/**
 * A forced theme beats the system scheme (`TODO/ui-113`): the picture follows what the reader
 * chose in the Help footer, so Light on a dark system loads the light still and the reverse.
 */
for (const [system, forced, expected] of [
  ['dark', 'light', `${STILL}.png`],
  ['light', 'dark', `${STILL}.dark.png`],
]) {
  test.describe(`Help pictures with ${forced} chosen on a ${system} system`, () => {
    test.use({ colorScheme: /** @type {'dark' | 'light'} */ (system) })

    test(`loads ${expected}`, async ({ page }) => {
      await page.goto('/#/help/getting-started')
      await expect(page.getByTestId('help-content')).toBeVisible()
      await chooseTheme(page, forced)
      const target = page.getByTestId('help-content').locator(`img[src$="${STILL}.png"]`)
      await target.scrollIntoViewIfNeeded()
      await expect
        .poll(() => target.evaluate((el, want) => el.complete && el.naturalWidth > 0 && el.currentSrc.endsWith(`/${want}`), expected))
        .toBe(true)
    })

    test('System goes back to the device scheme', async ({ page }) => {
      await page.goto('/#/help/getting-started')
      await expect(page.getByTestId('help-content')).toBeVisible()
      await chooseTheme(page, forced)
      await chooseTheme(page, 'system')
      const back = system === 'dark' ? `${STILL}.dark.png` : `${STILL}.png`
      const target = page.getByTestId('help-content').locator(`img[src$="${STILL}.png"]`)
      await target.scrollIntoViewIfNeeded()
      await expect.poll(() => target.evaluate((el, want) => el.complete && el.currentSrc.endsWith(`/${want}`), back)).toBe(true)
    })
  })
}


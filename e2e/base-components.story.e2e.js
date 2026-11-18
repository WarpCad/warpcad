// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * `TODO/testing-038`: a light and a dark snapshot of each base component's states, drawn in the
 * built Storybook (`storybook-<engine>` projects), so a pixel change to a control shows up outside
 * the app too. This is a component-in-isolation check; it is not a user-facing capability, and the
 * app-level `*.e2e.js` specs carry that weight (CLAUDE.md, Project Structure).
 *
 * Storybook's theme global is left on `system`, so `page.emulateMedia({ colorScheme })` picks the theme
 * the same way `prefers-color-scheme` does in the app.
 */

/** @type {{ id: string, hover?: boolean }[]} story ids, as listed in `storybook-static/index.json` */
const STORIES = [
  { id: 'controls-basebutton--default' },
  { id: 'controls-basebutton--primary' },
  { id: 'controls-basebutton--primary', hover: true },
  { id: 'controls-basebutton--danger' },
  { id: 'controls-basebutton--disabled' },
  { id: 'controls-basebutton--pressed' },
  { id: 'controls-iconbutton--bordered' },
  { id: 'controls-textinput--default' },
  { id: 'controls-numberfield--millimetres' },
  { id: 'controls-selectinput--default' },
  { id: 'controls-segmentedtoggle--default' },
  { id: 'display-basechip--danger' },
  { id: 'display-basebanner--warn' },
]

for (const scheme of /** @type {const} */ (['light', 'dark'])) {
  test.describe(`${scheme} theme`, () => {
    for (const story of STORIES) {
      const name = `${story.id}${story.hover ? '--hover' : ''}`
      test(name, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await page.goto(`/iframe.html?id=${story.id}&viewMode=story`)
        const root = page.locator('#storybook-root')
        await expect(root.locator(':scope > *').first()).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        if (story.hover) await root.locator('button').first().hover()
        await expect(root).toHaveScreenshot(`${name}-${scheme}.png`, { maxDiffPixelRatio: 0.01 })
      })
    }
  })
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

import { sleep } from './support/humanInput.js'

/**
 * The navigation chrome and the grid scale readout never overlap (`TODO/ui-124`, filed from the
 * `testing-017` viewport sweep): at a window of about 650 px the tablet form's narrow canvas left
 * the 193 px nav pad (left-anchored) and the 163 px readout (right-anchored) 10 px short of fitting.
 *
 * Drives `/`. Layout only, but the overlays sit on the WebGL canvas, so all three engines. It
 * resizes its own page, so it runs once per engine (the `-laptop` project).
 */

const HEIGHT = 900
const IDS = ['operations-toolbar', 'orientation-gizmo', 'navigation-chrome', 'grid-scale-readout']

/** @typedef {{ x: number, y: number, width: number, height: number }} Box */

/** @param {Box | null} a @param {Box | null} b */
function intersects(a, b) {
  if (!a || !b) return false
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** @param {import('@playwright/test').Page} page */
async function boxes(page) {
  return page.evaluate((ids) => {
    /** @type {Record<string, { x: number, y: number, width: number, height: number } | null>} */
    const out = {}
    for (const id of ids) {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) {
        out[id] = null
        continue
      }
      const r = el.getBoundingClientRect()
      out[id] = r.width && r.height ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
    }
    return out
  }, IDS)
}

/** @param {import('@playwright/test').Page} page @param {number} width */
async function resize(page, width) {
  await page.setViewportSize({ width, height: HEIGHT })
  // The tier crossfade (150ms) and one ResizeObserver round trip.
  await sleep(300)
}

test.describe('nav chrome vs scale readout (TODO/ui-124)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('-laptop'), 'resizes its own page; once per engine')
    await page.goto('/')
    await expect(page.getByTestId('orientation-gizmo')).toBeVisible()
  })

  for (const width of [650, 660]) {
    test(`at ${width}px the navigation chrome does not cover the scale readout`, async ({ page }) => {
      await resize(page, width)
      const m = await boxes(page)
      expect(m['navigation-chrome'], 'navigation chrome is on screen').not.toBeNull()
      expect(m['grid-scale-readout'], 'scale readout is on screen').not.toBeNull()
      expect(intersects(m['navigation-chrome'], m['grid-scale-readout']), `overlap at ${width}px`).toBe(false)
    })
  }

  test('sweep 1440 to 390 and back in 10px steps: no two of toolbar, gizmo, nav chrome, readout overlap', async ({ page }) => {
    test.setTimeout(240_000)
    const widths = []
    for (let w = 1440; w >= 390; w -= 10) widths.push(w)
    for (let w = 400; w <= 1440; w += 10) widths.push(w)
    for (const width of widths) {
      await resize(page, width)
      const m = await boxes(page)
      for (let i = 0; i < IDS.length; i++) {
        for (let j = i + 1; j < IDS.length; j++) {
          expect(intersects(m[IDS[i]], m[IDS[j]]), `${IDS[i]} over ${IDS[j]} at ${width}px`).toBe(false)
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), `sideways scroll at ${width}px`).toBe(false)
    }
  })

  test('collapsed to the toggle, the navigation chrome is still reachable without a keyboard', async ({ page }) => {
    await resize(page, 650)
    const toggle = page.getByTestId('nav-expand-toggle')
    if (await toggle.isVisible()) {
      const box = await toggle.boundingBox()
      expect(box && box.width >= 38 && box.height >= 38, 'tap target size').toBe(true)
      await toggle.click()
      await expect(page.getByTestId('nav-step-left')).toBeVisible()
    }
  })
})

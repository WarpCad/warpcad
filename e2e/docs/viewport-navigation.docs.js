// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, clickViewportAt, startMovie, endMovie, humanDrag, shot } from './support.js'

/**
 * Docs media for `docs/viewport-navigation.md` and the README hero (`TODO/docs-008`).
 * Every movie ends by asserting a camera attribute on the viewport changed, so a movie
 * of a drag that did nothing fails instead of publishing a GIF of a still scene.
 * Laptop only; phone variants belong to `TODO/docs-018`.
 */
test.describe('docs media: viewport navigation', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** @param {import('@playwright/test').Page} page */
  const camera = async (page) => {
    const v = page.getByTestId('viewport')
    return {
      az: await v.getAttribute('data-camera-azimuth'),
      el: await v.getAttribute('data-camera-elevation'),
      dist: await v.getAttribute('data-camera-distance'),
      target: await v.getAttribute('data-camera-target'),
    }
  }

  /** Centre of the canvas in page coordinates. @param {import('@playwright/test').Page} page */
  const centre = async (page) => {
    const b = await page.getByTestId('viewport-canvas').boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }
  }

  /** A drag with a chosen mouse button, eased like `humanDrag`. */
  async function buttonDrag(page, from, to, button) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down({ button })
    for (let i = 1; i <= 15; i++) {
      const t = i / 15
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e)
      await page.waitForTimeout(45)
    }
    await page.waitForTimeout(250)
    await page.mouse.up({ button })
  }

  test('app overview, empty', async ({ page }) => {
    await openApp(page)
    await shot(page, 'app-overview.png')
  })

  test('app overview with model', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'two-solids.ndjson', 2)
    await clickViewportAt(page, 0.33, 0.48)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
    await shot(page, 'app-overview-with-model.png')
  })

  test('nav chrome, triad and grid stills', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'two-solids.ndjson', 2)
    await shot(page, 'nav-chrome.png', { locator: page.getByTestId('navigation-chrome') })
    await shot(page, 'orientation-gizmo.png', { locator: page.getByTestId('orientation-gizmo') })
    await shot(page, 'grid-major-minor.png', { locator: page.getByTestId('viewport') })
    await page.getByTestId('nav-settings-gear').click()
    await expect(page.getByTestId('nav-settings-panel')).toBeVisible()
    await shot(page, 'nav-mouse-mapping.png', { locator: page.getByTestId('viewport') })
  })

  test('nav-orbit', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'two-solids.ndjson', 2)
    const before = await camera(page)
    const c = await centre(page)
    await startMovie(page, 'nav-orbit')
    await humanDrag(page, { x: c.x - c.w * 0.1, y: c.y + c.h * 0.3 }, { x: c.x + c.w * 0.1, y: c.y + c.h * 0.3 }, { steps: 20, ms: 1000 })
    await endMovie(page, 'nav-orbit', { fps: 12, width: 640 })
    expect((await camera(page)).az).not.toBe(before.az)
  })

  test('nav-pan', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'two-solids.ndjson', 2)
    const before = await camera(page)
    const c = await centre(page)
    await startMovie(page, 'nav-pan')
    await page.keyboard.down('Shift')
    await humanDrag(page, { x: c.x - c.w * 0.1, y: c.y + c.h * 0.3 }, { x: c.x + c.w * 0.1, y: c.y + c.h * 0.3 }, { steps: 15, ms: 700 })
    await page.keyboard.up('Shift')
    const mid = await camera(page)
    expect(mid.target).not.toBe(before.target)
    await buttonDrag(page, { x: c.x + c.w * 0.1, y: c.y + c.h * 0.3 }, { x: c.x - c.w * 0.1, y: c.y + c.h * 0.3 }, 'right')
    await endMovie(page, 'nav-pan', { fps: 12, width: 640 })
    expect((await camera(page)).target).not.toBe(mid.target)
  })

  test('nav-zoom', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'two-solids.ndjson', 2)
    const before = await camera(page)
    const c = await centre(page)
    await startMovie(page, 'nav-zoom')
    // startMovie parks the pointer at (40, 40), off the canvas; the wheel needs it over the view.
    await page.mouse.move(c.x, c.y + c.h * 0.3)
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -120)
      await page.waitForTimeout(120)
    }
    await page.waitForTimeout(400)
    const zoomedIn = await camera(page)
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 120)
      await page.waitForTimeout(120)
    }
    await endMovie(page, 'nav-zoom')
    expect(Number(zoomedIn.dist)).toBeLessThan(Number(before.dist))
  })

  test('nav-chrome-buttons', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'two-solids.ndjson', 2)
    const before = await camera(page)
    await startMovie(page, 'nav-chrome-buttons')
    await page.getByTestId('nav-mode-pan').click()
    for (const dir of ['left', 'left', 'up']) {
      await page.getByTestId(`nav-step-${dir}`).click()
      await page.waitForTimeout(350)
    }
    const panned = await camera(page)
    expect(panned.target).not.toBe(before.target)
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('nav-zoom-in').click()
      await page.waitForTimeout(300)
    }
    await endMovie(page, 'nav-chrome-buttons')
    expect(Number((await camera(page)).dist)).toBeLessThan(Number(before.dist))
  })

  test('orientation-gizmo-snap', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'two-solids.ndjson', 2)
    await startMovie(page, 'orientation-gizmo-snap')
    const seen = new Set()
    for (const view of ['top', 'front', 'right', 'home']) {
      await page.getByTestId(`gizmo-view-${view}`).click()
      await page.waitForTimeout(900)
      const cam = await camera(page)
      seen.add(`${cam.az}/${cam.el}`)
    }
    await endMovie(page, 'orientation-gizmo-snap')
    expect(seen.size).toBe(4)
  })
})

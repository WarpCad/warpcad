// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { pointer, sceneBodies, sleep, viewportPoint } from './support/humanInput.js'

/**
 * The Library icon rail and the compact viewport chrome between laptop and phone width
 * (`TODO/ui-084`, on top of `ui-079`'s layout store), driven against `/`.
 *
 * - **Width sweep** (the `-laptop` project of each engine, which resizes its own page): at every
 *   width the tiers on `.app__body` match `panelLayoutFor`, the Library column is the store's
 *   track (72px as a rail), the navigation pad and the orientation gizmo are at their compact size
 *   exactly in the compact tier, nothing scrolls sideways, the Operations toolbar touches neither
 *   the gizmo, the pad nor the scale readout, and the viewport pane keeps its 340px floor.
 * - **Flows** (the `-tablet` projects, 820×1180: trusted touch in Chromium, touch in WebKit, a
 *   mouse in Firefox, which has no touch emulation): drag Cube from the rail; tap Bolt, pick M5 in
 *   its row pop-out and drag from there; tap every gizmo cap and the pad's buttons.
 * - **Phone unchanged** (`-phone` projects): the stage 1 measurements of the pad, the gizmo and the
 *   Library tab still hold, and no rail or chrome tier leaks in.
 *
 * Snapshots are artifacts (`test-results/panel-tiers-snapshots/`), not pixel diffs, for the reason
 * `viewport-scaffold.e2e.js` gives: WebGL output legitimately differs between engines and GPUs.
 * All three engines: touch input, Firefox label widths, WebKit flex gaps, `ResizeObserver` timing.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'panel-tiers-snapshots')
const SWEEP_WIDTHS = [1440, 1100, 1024, 1000, 900, 820, 760]
const SWEEP_HEIGHT = 900

/** @typedef {{ x: number, y: number, width: number, height: number }} Box */

/** @param {Box | null} a @param {Box | null} b */
function intersects(a, b) {
  if (!a || !b) return false
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** @param {import('@playwright/test').Page} page */
async function expectedLayout(page) {
  return page.evaluate(async () => {
    const { panelLayoutFor } = await window.__e2eImport('/src/stores/panelLayout.js')
    const body = /** @type {HTMLElement} */ (document.querySelector('.app__body'))
    return panelLayoutFor({ bodyWidthPx: body.getBoundingClientRect().width, chatColumn: false })
  })
}

/** @param {import('@playwright/test').Page} page */
async function measure(page) {
  return page.evaluate(() => {
    /** @param {string} id */
    const box = (id) => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    const body = /** @type {HTMLElement} */ (document.querySelector('.app__body'))
    return {
      libraryTier: body.getAttribute('data-library-tier'),
      chromeTier: body.getAttribute('data-chrome-tier'),
      library: box('library-panel'),
      viewport: box('viewport'),
      nav: box('navigation-chrome'),
      gizmo: box('orientation-gizmo'),
      toolbar: box('operations-toolbar'),
      scale: box('grid-scale-readout'),
      rail: box('library-rail'),
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
    }
  })
}

test.describe('the panel tiers, swept across widths (TODO/ui-084)', () => {
  test('every width from 1440 to 760: tiers, tracks, chrome sizes, no overlap, pane floor', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('-laptop'), 'the sweep resizes its own page; once per engine')
    await page.goto('/')
    await expect(page.getByTestId('orientation-gizmo')).toBeVisible()
    mkdirSync(SNAPSHOT_DIR, { recursive: true })

    for (const width of SWEEP_WIDTHS) {
      await page.setViewportSize({ width, height: SWEEP_HEIGHT })
      const expected = await expectedLayout(page)
      await expect
        .poll(async () => (await measure(page)).chromeTier, { message: `chrome tier at ${width}` })
        .toBe(expected.chromeTier)
      await expect.poll(async () => (await measure(page)).libraryTier).toBe(expected.libraryTier)
      // The tier crossfade (150ms) and one ResizeObserver round trip.
      await sleep(250)
      const m = await measure(page)
      const at = `at ${width}px (${testInfo.project.name})`

      expect(m.library?.width ?? 0, `Library track ${at}`).toBeCloseTo(expected.libraryWidthPx, 0)
      const railTier = expected.libraryTier === 'icons' || expected.libraryTier === 'popout'
      expect(m.rail !== null, `rail shown ${at}`).toBe(railTier)
      if (expected.libraryTier === 'icons') expect(m.library?.width ?? 0, `rail width ${at}`).toBeCloseTo(72, 0)

      if (expected.chromeTier === 'compact') {
        expect(m.gizmo?.width ?? 999, `compact gizmo width ${at}`).toBeLessThanOrEqual(108)
        expect(m.gizmo?.height ?? 999, `compact gizmo height ${at}`).toBeLessThanOrEqual(142)
        expect(m.nav?.height ?? 999, `compact pad height ${at}`).toBeLessThanOrEqual(166)
        expect(m.nav?.width ?? 999, `compact pad width ${at}`).toBeLessThanOrEqual(196)
      } else {
        expect(m.gizmo?.width ?? 0, `full gizmo width ${at}`).toBeGreaterThanOrEqual(128)
        expect(m.nav?.height ?? 0, `full pad height ${at}`).toBeGreaterThanOrEqual(186)
      }

      expect(m.horizontalScroll, `horizontal scroll ${at}`).toBe(false)
      expect(intersects(m.toolbar, m.gizmo), `toolbar over the gizmo ${at}`).toBe(false)
      expect(intersects(m.toolbar, m.nav), `toolbar over the nav pad ${at}`).toBe(false)
      expect(intersects(m.toolbar, m.scale), `toolbar over the scale readout ${at}`).toBe(false)
      expect(m.viewport?.width ?? 0, `viewport pane ${at}`).toBeGreaterThanOrEqual(339.5)

      await page.screenshot({ path: join(SNAPSHOT_DIR, `sweep-${width}-${testInfo.project.name}.png`) })
    }
  })
})

test.describe('the Library icon rail at the tablet reference (TODO/ui-084)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('-tablet'), 'the flows are specified at 820px')
    await page.goto('/')
    await expect(page.getByTestId('library-rail')).toBeVisible()
    await expect(page.locator('.app__body')).toHaveAttribute('data-library-tier', 'icons')
  })

  test('drag Cube from the icon rail: one body is placed', async ({ page }, testInfo) => {
    const { dragRow } = await pointer(page, testInfo)
    const tile = page.getByTestId('library-row-primitive.cuboid')
    await expect(tile).toHaveAttribute('aria-label', 'Cube')
    const to = await viewportPoint(page, 0.55, 0.5)
    await dragRow(tile, to.x, to.y)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    expect((await sceneBodies(page)).map((body) => body.op)).toEqual(['primitive.cuboid'])
    // A drag is not a tap: no pop-out opened on the way.
    await expect(page.getByTestId('library-row-popout')).toHaveCount(0)
  })

  test('tap Bolt, choose a socket cap M5 in its row pop-out, drag from the pop-out: the placed bolt is M5', async ({ page }, testInfo) => {
    const { press, dragRow } = await pointer(page, testInfo)
    const tile = page.getByTestId('library-row-hardware.bolt')
    await press(tile)
    const popout = page.getByTestId('library-row-popout')
    await expect(popout).toBeVisible()
    await expect(popout).toHaveAttribute('data-op', 'hardware.bolt')
    await expect(tile).toHaveAttribute('aria-expanded', 'true')
    // Hex bolts start at M10; a socket cap screw offers M5.
    await page.getByTestId('library-choice-hardware.bolt').selectOption('socket')
    await page.getByTestId('library-choice-hardware.bolt-spec').selectOption('m5')
    await page.screenshot({ path: join(SNAPSHOT_DIR, `bolt-popout-${testInfo.project.name}.png`) })

    const to = await viewportPoint(page, 0.6, 0.55)
    await dragRow(page.getByTestId('library-popout-row-hardware.bolt'), to.x, to.y)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    expect((await sceneBodies(page)).map((body) => body.op)).toEqual(['hardware.bolt'])
    // The pop-out comes back after the drop and stays open (decision confirmed for ui-079).
    await expect(popout).toBeVisible()
    await expect(popout).toHaveAttribute('data-dragging', 'false')
    // The placed bolt is selected, and the Inspector reads its size.
    await expect(page.getByTestId('inspector-param-spec')).toHaveValue('m5')

    await page.keyboard.press('Escape')
    await expect(popout).toHaveCount(0)
    await expect(tile).toHaveAttribute('aria-expanded', 'false')
    await expect(tile).toBeFocused()
  })

  test('the compact gizmo caps and pad buttons act as they do at laptop width', async ({ page }, testInfo) => {
    const { press } = await pointer(page, testInfo)
    await expect(page.locator('.app__body')).toHaveAttribute('data-chrome-tier', 'compact')
    const view = page.getByTestId('viewport')
    const camera = async () => ({
      azimuth: Number(await view.getAttribute('data-camera-azimuth')),
      elevation: Number(await view.getAttribute('data-camera-elevation')),
      distance: Number(await view.getAttribute('data-camera-distance')),
    })

    await press(page.getByTestId('gizmo-view-top'))
    await expect.poll(async () => (await camera()).elevation).toBeGreaterThan(85)
    await press(page.getByTestId('gizmo-view-front'))
    await expect.poll(async () => Math.abs((await camera()).elevation)).toBeLessThan(5)
    // Each cap is tapped from a view where it is not hidden behind its opposite at the dial's
    // centre (looking down +X puts −X directly under X, at any width).
    for (const cap of ['right', 'back', 'left', 'bottom']) {
      const before = await camera()
      await press(page.getByTestId(`gizmo-view-${cap}`))
      await expect.poll(async () => JSON.stringify(await camera()), { message: `gizmo-view-${cap}` }).not.toBe(JSON.stringify(before))
    }
    await press(page.getByTestId('gizmo-view-home'))
    await expect.poll(async () => (await camera()).elevation).toBeGreaterThan(5)

    for (const id of ['nav-step-left', 'nav-step-right', 'nav-step-up', 'nav-step-down']) {
      const before = await camera()
      await press(page.getByTestId(id))
      await expect.poll(async () => JSON.stringify(await camera()), { message: id }).not.toBe(JSON.stringify(before))
    }
    const far = (await camera()).distance
    await press(page.getByTestId('nav-zoom-in'))
    await expect.poll(async () => (await camera()).distance).toBeLessThan(far)
    const near = (await camera()).distance
    await press(page.getByTestId('nav-zoom-out'))
    await expect.poll(async () => (await camera()).distance).toBeGreaterThan(near)
    await press(page.getByTestId('nav-mode-pan'))
    await expect(page.getByTestId('nav-step-up')).toHaveAttribute('aria-label', 'Pan camera up')
    await press(page.getByTestId('nav-mode-orbit'))
    await expect(page.getByTestId('nav-step-up')).toHaveAttribute('aria-label', 'Orbit camera up')
    await press(page.getByTestId('nav-reset'))
    await page.screenshot({ path: join(SNAPSHOT_DIR, `chrome-compact-${testInfo.project.name}.png`) })
  })
})

test.describe('snapshots at the three reference viewports (TODO/ui-084)', () => {
  test('phone is unchanged; tablet is rail + compact chrome; laptop is labels + full chrome', async ({ page }, testInfo) => {
    await page.goto('/')
    await expect(page.getByTestId('orientation-gizmo')).toBeVisible()
    await sleep(250)
    const m = await measure(page)
    const name = testInfo.project.name
    if (name.endsWith('-phone')) {
      // `TODO/ui-084` stage 1's measurements at 390×844, before any of this task's changes.
      expect(m.libraryTier).toBe('sheet')
      expect(m.chromeTier).toBe('full')
      expect(m.rail).toBe(null)
      expect(m.gizmo?.width ?? 0).toBeCloseTo(106, 0)
      expect(m.gizmo?.height ?? 0).toBeCloseTo(138, 0)
      expect(m.nav?.height ?? 0).toBeCloseTo(164, 0)
      expect(m.nav?.width ?? 0).toBeGreaterThan(188)
      expect(m.nav?.width ?? 0).toBeLessThan(196)
      expect(m.library?.height ?? 0).toBeCloseTo(45, 0)
      expect(m.library?.width ?? 0).toBeCloseTo(390, 0)
      // The toolbar keeps the 184px gizmo reserve at phone width: 390 − 24 − 184.
      expect(m.toolbar?.width ?? 0).toBeCloseTo(182, 0)
    } else if (name.endsWith('-tablet')) {
      expect(m.libraryTier).toBe('icons')
      expect(m.chromeTier).toBe('compact')
      expect(m.library?.width ?? 0).toBeCloseTo(72, 0)
    } else {
      expect(m.libraryTier).toBe('labels')
      expect(m.chromeTier).toBe('full')
      expect(m.rail).toBe(null)
    }
    expect(m.horizontalScroll).toBe(false)
    mkdirSync(SNAPSHOT_DIR, { recursive: true })
    await page.screenshot({ path: join(SNAPSHOT_DIR, `reference-${name}.png`) })
  })
})

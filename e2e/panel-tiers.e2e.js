// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { pointer, sceneBodies, sleep, usesTrustedTouch, viewportPoint } from './support/humanInput.js'

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
 * - **The pop-out tier** (`TODO/ui-081`, the `-tablet` projects resized to 760×900): the section
 *   launchers, a section pop-out that fades during a drag and stays open after the drop, one
 *   pop-out across kinds, and a widen past 790 that leaves nothing orphaned.
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
      launchers: document.querySelectorAll('[data-testid^="library-launcher-"]').length,
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
      // The pop-out tier is the section launchers (`TODO/ui-081`); the icons tier is the tiles.
      expect(m.launchers > 0, `section launchers ${at}`).toBe(expected.libraryTier === 'popout')

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

/**
 * The pop-out tier (`TODO/ui-081`), which no reference viewport reaches: the `-tablet` projects
 * (trusted touch in Chromium, touch in WebKit, a mouse in Firefox) resized to 760×900, where the
 * Library is a 64px rail of section launchers and each opens a section pop-out.
 */
test.describe('the Library section launchers at 760×900 (TODO/ui-081)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('-tablet'), 'touch-primary projects, resized to the pop-out tier')
    await page.setViewportSize({ width: 760, height: 900 })
    await page.goto('/')
    await expect(page.locator('.app__body')).toHaveAttribute('data-library-tier', 'popout')
    await expect(page.getByTestId('library-launcher-hardware')).toBeVisible()
  })

  /** @param {import('@playwright/test').Page} page */
  const openPopoutSlot = (page) =>
    page.evaluate(async () => {
      const { usePanelLayoutStore } = await window.__e2eImport('/src/stores/panelLayout.js')
      return usePanelLayoutStore().openPopout
    })

  test('open Hardware, drag a Nut: the pop-out fades during the drag and is still open after the drop', async ({ page }, testInfo) => {
    const { press, dragRow } = await pointer(page, testInfo)
    const launcher = page.getByTestId('library-launcher-hardware')
    await expect(page.getByTestId('library-section-popout')).toHaveCount(0)
    await press(launcher)
    const popout = page.getByTestId('library-section-popout')
    await expect(popout).toBeVisible()
    await expect(popout).toHaveAttribute('data-section', 'hardware')
    await expect(launcher).toHaveAttribute('aria-expanded', 'true')
    // Beside the 64px rail, over the viewport, and no wider than min(280, P − 32).
    const rail = await page.getByTestId('library-panel').boundingBox()
    const box = await popout.boundingBox()
    expect(rail?.width ?? 0).toBeCloseTo(64, 0)
    expect(box?.x ?? 0).toBeGreaterThanOrEqual((rail?.x ?? 0) + (rail?.width ?? 0))
    expect(box?.width ?? 999).toBeLessThanOrEqual(280.5)
    await sleep(200)
    mkdirSync(SNAPSHOT_DIR, { recursive: true })
    await page.screenshot({ path: join(SNAPSHOT_DIR, `section-popout-760-${testInfo.project.name}.png`) })

    // Sample the pop-out every frame for the life of the drag.
    await page.evaluate(() => {
      const samples = /** @type {{ dragging: string | null, opacity: number, events: string }[]} */ ([])
      Object.assign(window, { __popoutSamples: samples })
      const tick = () => {
        const el = document.querySelector('[data-testid="library-section-popout"]')
        if (el) {
          const style = getComputedStyle(el)
          samples.push({ dragging: el.getAttribute('data-dragging'), opacity: Number(style.opacity), events: style.pointerEvents })
        }
        if (/** @type {any} */ (window).__popoutSampling !== false) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const to = await viewportPoint(page, 0.6, 0.55)
    await dragRow(page.getByTestId('library-row-hardware.nut'), to.x, to.y)
    const samples = await page.evaluate(() => {
      Object.assign(window, { __popoutSampling: false })
      return /** @type {any} */ (window).__popoutSamples
    })
    const during = samples.filter((sample) => sample.dragging === 'true')
    expect(during.length, 'frames sampled while dragging').toBeGreaterThan(0)
    for (const sample of during) {
      expect(sample.opacity).toBeCloseTo(0.25, 2)
      expect(sample.events).toBe('none')
    }

    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    expect((await sceneBodies(page)).map((body) => body.op)).toEqual(['hardware.nut'])
    // Back to full opacity and still open after the drop (decision confirmed 2026-10-21).
    await expect(popout).toBeVisible()
    await expect(popout).toHaveAttribute('data-dragging', 'false')
    await expect.poll(() => popout.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeCloseTo(1, 2)

    await page.keyboard.press('Escape')
    await expect(popout).toHaveCount(0)
    await expect(launcher).toHaveAttribute('aria-expanded', 'false')
    await expect(launcher).toBeFocused()
  })

  test('tapping the same launcher closes it; tapping another switches; a viewport tap closes it', async ({ page }, testInfo) => {
    const { press } = await pointer(page, testInfo)
    const popout = page.getByTestId('library-section-popout')
    await press(page.getByTestId('library-launcher-primitive'))
    await expect(popout).toHaveAttribute('data-section', 'primitive')
    await press(page.getByTestId('library-launcher-kit'))
    await expect(popout).toHaveCount(1)
    await expect(popout).toHaveAttribute('data-section', 'kit')
    await expect(page.getByTestId('library-launcher-primitive')).toHaveAttribute('aria-expanded', 'false')
    await press(page.getByTestId('library-launcher-kit'))
    await expect(popout).toHaveCount(0)

    await press(page.getByTestId('library-launcher-hardware'))
    await expect(popout).toBeVisible()
    // Right of the pop-out's footprint (rail 64 + 6 + 280), clear of the toolbar and the pad.
    const empty = await viewportPoint(page, 0.8, 0.45)
    await page.mouse.click(empty.x, empty.y)
    await expect(popout).toHaveCount(0)
  })

  test('opening a section pop-out closes an Operations group pop-out, and the reverse', async ({ page }, testInfo) => {
    // The Operations groups tier (`TODO/ui-082`) is not reached at 760 (the pane is in the icons
    // tier), so its claim on the shared `openPopout` slot stands in for it here; the UI-driven
    // direction is covered at 720 below.
    const { press } = await pointer(page, testInfo)
    await page.evaluate(async () => {
      const { usePanelLayoutStore } = await window.__e2eImport('/src/stores/panelLayout.js')
      usePanelLayoutStore().openPopout = 'ops-group:combine'
    })
    await press(page.getByTestId('library-launcher-hardware'))
    await expect(page.getByTestId('library-section-popout')).toBeVisible()
    expect(await openPopoutSlot(page)).toBe('library-section:hardware')

    await page.evaluate(async () => {
      const { usePanelLayoutStore } = await window.__e2eImport('/src/stores/panelLayout.js')
      usePanelLayoutStore().openPopout = 'ops-group:combine'
    })
    await expect(page.getByTestId('library-section-popout')).toHaveCount(0)
    await expect(page.getByTestId('library-launcher-hardware')).toHaveAttribute('aria-expanded', 'false')
  })

  test('widening past 790 with a pop-out open closes it and leaves no orphaned element', async ({ page }, testInfo) => {
    const { press } = await pointer(page, testInfo)
    await press(page.getByTestId('library-launcher-hardware'))
    await expect(page.getByTestId('library-section-popout')).toBeVisible()
    await page.setViewportSize({ width: 900, height: 900 })
    await expect(page.locator('.app__body')).toHaveAttribute('data-library-tier', 'icons')
    await expect(page.getByTestId('library-section-popout')).toHaveCount(0)
    await expect(page.locator('[data-testid^="library-launcher-"]')).toHaveCount(0)
    await expect(page.getByTestId('library-row-hardware.bolt')).toBeVisible()
    expect(await openPopoutSlot(page)).toBe(null)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

    // Back down to the pop-out tier, then to phone width: nothing is left open at either.
    await page.setViewportSize({ width: 760, height: 900 })
    await expect(page.getByTestId('library-launcher-hardware')).toBeVisible()
    await press(page.getByTestId('library-launcher-hardware'))
    await expect(page.getByTestId('library-section-popout')).toBeVisible()
    await page.setViewportSize({ width: 600, height: 900 })
    await expect(page.locator('.app__body')).toHaveAttribute('data-library-tier', 'sheet')
    await expect(page.getByTestId('library-section-popout')).toHaveCount(0)
    expect(await openPopoutSlot(page)).toBe(null)
  })
})

/**
 * The Operations groups tier (`TODO/ui-082`), which no reference viewport reaches either: the
 * `-tablet` projects resized to 720×900 (pane 436, under the icons tier's 458), where the toolbar is
 * the badge plus Combine ▾, Arrange ▾, Shape ▾ and To library. The Library there is in its pop-out
 * tier (`ui-081`), so cubes come from the Primitives section pop-out, and the second operand is added
 * with the Objects list's check, the one multi-select a touch screen has.
 */
test.describe('the Operations group launchers at 720×900 (TODO/ui-082)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('-tablet'), 'touch-primary projects, resized to the groups tier')
    await page.setViewportSize({ width: 720, height: 900 })
    await page.goto('/')
    await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-ops-tier', 'groups')
    await expect(page.getByTestId('ops-group-combine')).toBeVisible()
  })

  /** @param {import('@playwright/test').Page} page */
  const openPopoutSlot = (page) =>
    page.evaluate(async () => {
      const { usePanelLayoutStore } = await window.__e2eImport('/src/stores/panelLayout.js')
      return usePanelLayoutStore().openPopout
    })

  /**
   * Drag `count` cubes in from the Primitives pop-out, then put the pop-out away.
   *
   * @param {import('@playwright/test').Page} page
   * @param {Awaited<ReturnType<typeof pointer>>} input
   * @param {number} count
   */
  async function placeCubes(page, input, count) {
    await input.press(page.getByTestId('library-launcher-primitive'))
    await expect(page.getByTestId('library-section-popout')).toBeVisible()
    const drops = [
      [0.55, 0.5],
      [0.82, 0.62],
    ]
    for (let i = 0; i < count; i += 1) {
      const to = await viewportPoint(page, drops[i][0], drops[i][1])
      await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), to.x, to.y)
      await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(i + 1))
    }
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('library-section-popout')).toHaveCount(0)
  }

  test('two cubes: Combine shows a 4 badge, its pop-out lists the four members, Union combines them', async ({ page }, testInfo) => {
    const input = await pointer(page, testInfo)
    await placeCubes(page, input, 2)
    const combine = page.getByTestId('ops-group-combine')

    // One cube selected (the drop selects what it placed): Combine cannot run, and says why.
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
    await expect(combine).toBeDisabled()
    await expect(combine).toHaveAttribute('title', 'Select 2 or more solids')
    await expect(page.getByTestId('ops-group-combine-count')).toHaveCount(0)
    await expect(page.getByTestId('ops-group-shape-count')).toHaveText('6')

    // Add the other cube through the Objects list's check.
    if (!(await page.getByTestId('object-list').isVisible().catch(() => false))) {
      await input.press(page.getByTestId('inspector-objects-header'))
    }
    await input.press(page.locator('[data-testid^="objects-check-cuboid-"][aria-checked="false"]'))
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
    await expect(combine).toBeEnabled()
    await expect(page.getByTestId('ops-group-combine-count')).toHaveText('4')
    await expect(page.getByTestId('ops-group-shape')).toBeDisabled()

    await input.press(combine)
    const popover = page.getByTestId('ops-group-popover')
    await expect(popover).toBeVisible()
    await expect(popover).toHaveAttribute('data-group', 'combine')
    await expect(combine).toHaveAttribute('aria-expanded', 'true')
    expect(await openPopoutSlot(page)).toBe('ops-group:combine')
    for (const [name, label] of [
      ['union', 'Union'],
      ['subtract', 'Subtract'],
      ['intersect', 'Intersect'],
      ['group', 'Group'],
    ]) {
      const member = popover.getByTestId(`operation-${name}`)
      await expect(member).toBeVisible()
      await expect(member).toBeEnabled()
      await expect(member).toContainText(label)
    }
    // The pop-out stays inside the viewport pane, clear of the orientation gizmo.
    const pane = await page.getByTestId('viewport').boundingBox()
    const box = await popover.boundingBox()
    expect(intersects(box, await page.getByTestId('orientation-gizmo').boundingBox())).toBe(false)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((pane?.x ?? 0) + (pane?.width ?? 0))
    await sleep(200)
    mkdirSync(SNAPSHOT_DIR, { recursive: true })
    await page.screenshot({ path: join(SNAPSHOT_DIR, `ops-groups-720-${testInfo.project.name}.png`) })

    await input.press(popover.getByTestId('operation-union'))
    await expect(popover).toHaveCount(0)
    await expect(combine).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    expect((await sceneBodies(page)).map((body) => body.op)).toEqual(['boolean.union'])
    // The union is the one selection now: Combine is disabled again.
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
    await expect(combine).toBeDisabled()
  })

  test('a Shape member with its own popover: the group closes first, then Fillet’s popover opens', async ({ page }, testInfo) => {
    const input = await pointer(page, testInfo)
    await placeCubes(page, input, 1)
    await input.press(page.getByTestId('ops-group-shape'))
    const popover = page.getByTestId('ops-group-popover')
    await expect(popover).toHaveAttribute('data-group', 'shape')
    await input.press(popover.getByTestId('operation-fillet'))
    await expect(popover).toHaveCount(0)
    await expect(page.getByTestId('fillet-chamfer-popover')).toHaveAttribute('data-op', 'modify.filletRim')
    await input.press(page.getByTestId('fillet-chamfer-cancel'))
    await expect(page.getByTestId('fillet-chamfer-popover')).toHaveCount(0)
  })

  test('one pop-out across both panels: a Library launcher closes an open group pop-out', async ({ page }, testInfo) => {
    const input = await pointer(page, testInfo)
    await placeCubes(page, input, 1)
    await input.press(page.getByTestId('ops-group-shape'))
    await expect(page.getByTestId('ops-group-popover')).toBeVisible()
    await input.press(page.getByTestId('library-launcher-hardware'))
    await expect(page.getByTestId('library-section-popout')).toBeVisible()
    await expect(page.getByTestId('ops-group-popover')).toHaveCount(0)
    await expect(page.getByTestId('ops-group-shape')).toHaveAttribute('aria-expanded', 'false')
    expect(await openPopoutSlot(page)).toBe('library-section:hardware')
  })

  test('widening past a breakpoint with a group pop-out open closes it and leaves no orphaned element', async ({ page }, testInfo) => {
    const input = await pointer(page, testInfo)
    await placeCubes(page, input, 1)
    await input.press(page.getByTestId('ops-group-shape'))
    await expect(page.getByTestId('ops-group-popover')).toBeVisible()

    await page.setViewportSize({ width: 900, height: 900 })
    await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-ops-tier', 'icons')
    await expect(page.getByTestId('ops-group-popover')).toHaveCount(0)
    await expect(page.locator('[data-testid^="ops-group-"]')).toHaveCount(0)
    await expect(page.getByTestId('operation-fillet')).toBeVisible()
    expect(await openPopoutSlot(page)).toBe(null)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

    // Back to the groups tier, open it again, then to phone width: nothing is left open there.
    await page.setViewportSize({ width: 720, height: 900 })
    await expect(page.getByTestId('ops-group-shape')).toBeVisible()
    await input.press(page.getByTestId('ops-group-shape'))
    await expect(page.getByTestId('ops-group-popover')).toBeVisible()
    await page.setViewportSize({ width: 600, height: 900 })
    await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-ops-tier', 'icons')
    await expect(page.getByTestId('ops-group-popover')).toHaveCount(0)
    await expect(page.locator('[data-testid^="ops-group-"]')).toHaveCount(0)
    expect(await openPopoutSlot(page)).toBe(null)
  })
})

/**
 * Every frame's Library track, Library form and the motion flags, sampled from `requestAnimationFrame`
 * (`TODO/ui-079` stage 7). `__motionReset()` clears the log between phases; `__motionLog` reads it.
 *
 * @param {import('@playwright/test').Page} page
 */
async function sampleMotion(page) {
  await page.evaluate(() => {
    /** @type {{ t: number, libraryWidth: number, form: string | null, animating: boolean, duration: string, property: string, opsFading: string | null, libraryFading: string | null }[]} */
    let frames = []
    const tick = () => {
      const body = /** @type {HTMLElement} */ (document.querySelector('.app__body'))
      const library = document.querySelector('[data-testid="library-panel"]')
      const ops = document.querySelector('[data-testid="operations-toolbar"]')
      const style = getComputedStyle(body)
      frames.push({
        t: performance.now(),
        libraryWidth: library ? library.getBoundingClientRect().width : 0,
        form: library?.getAttribute('data-library-form') ?? null,
        animating: body.hasAttribute('data-panel-animating'),
        duration: style.transitionDuration,
        property: style.transitionProperty,
        opsFading: ops?.getAttribute('data-ops-fading') ?? null,
        libraryFading: library?.getAttribute('data-library-fading') ?? null,
      })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    Object.assign(window, {
      __motionReset: () => {
        frames = []
      },
      __motionLog: () => frames,
    })
  })
  return {
    reset: () => page.evaluate(() => /** @type {any} */ (window).__motionReset()),
    /** @returns {Promise<{ t: number, libraryWidth: number, form: string | null, animating: boolean, duration: string, property: string, opsFading: string | null, libraryFading: string | null }[]>} */
    log: () => page.evaluate(() => /** @type {any} */ (window).__motionLog()),
  }
}

/**
 * The flag's on-spans in a frame log, in ms.
 *
 * @param {{ t: number, animating: boolean }[]} frames
 */
function animatingSpans(frames) {
  const spans = []
  let since = -1
  for (const frame of frames) {
    if (frame.animating && since < 0) since = frame.t
    if (!frame.animating && since >= 0) {
      spans.push(frame.t - since)
      since = -1
    }
  }
  return { spans, stillOn: since >= 0 }
}

/**
 * Motion and edges (`TODO/ui-079` stage 7), on the `-laptop` project of each engine, which resizes
 * its own page. A tier change sets `data-panel-animating` on `.app__body` for ~220ms, which turns on
 * `transition: grid-template-columns 180ms ease-out`; a width change inside a tier tracks the window
 * edge instantly. Content swaps on the side of the animation where it never has to fit a moving
 * track: the compact form first when shrinking, the wide form only once the track is wide.
 */
test.describe('tier changes animate the tracks, fluid changes do not (TODO/ui-079 stage 7)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('-laptop'), 'resizes its own page; once per engine')
    await page.goto('/')
    await expect(page.locator('.app__body')).toHaveAttribute('data-library-tier', 'labels')
    await expect(page.getByTestId('library-panel')).toHaveAttribute('data-library-form', 'column')
  })

  test('the flag is set only across a tier boundary, for ~220ms, and the content swaps on the right side of it', async ({ page }) => {
    const motion = await sampleMotion(page)
    // Settled on first render: no flag, no transition.
    await sleep(100)
    expect((await motion.log()).some((frame) => frame.animating), 'flag on first render').toBe(false)

    // A 1px resize inside every tier: tracks follow at once, nothing animates.
    await motion.reset()
    await page.setViewportSize({ width: 1439, height: SWEEP_HEIGHT })
    await sleep(400)
    const fluid = await motion.log()
    expect(fluid.some((frame) => frame.animating), 'flag on a 1px resize').toBe(false)
    expect(fluid.every((frame) => frame.duration === '0s'), 'transition on a 1px resize').toBe(true)

    // Shrink across the Library and Operations breakpoints: labels → rail, Operations labels → icons.
    await motion.reset()
    await page.setViewportSize({ width: 900, height: SWEEP_HEIGHT })
    await expect(page.locator('.app__body')).toHaveAttribute('data-library-tier', 'icons')
    await expect(page.locator('.app__body')).not.toHaveAttribute('data-panel-animating', /.*/)
    await sleep(100)
    const shrink = await motion.log()
    const shrinkSpans = animatingSpans(shrink)
    expect(shrinkSpans.spans.length, 'one animating span while shrinking').toBe(1)
    expect(shrinkSpans.spans[0]).toBeGreaterThan(150)
    expect(shrinkSpans.spans[0]).toBeLessThan(700)
    for (const frame of shrink.filter((f) => f.animating)) {
      expect(frame.property).toContain('grid-template-columns')
      expect(frame.duration).toBe('0.18s')
    }
    // Compact content first: the labelled column is never drawn in a track narrower than its own.
    for (const frame of shrink.filter((f) => f.form === 'column')) expect(frame.libraryWidth).toBeGreaterThan(199.5)
    // The track did move through the widths in between rather than jumping.
    expect(shrink.some((f) => f.form === 'rail' && f.libraryWidth > 80 && f.libraryWidth < 230), 'an in-between track while shrinking').toBe(true)
    // Operations crossfades rather than animating its labels.
    expect(shrink.some((f) => f.opsFading === 'true'), 'Operations crossfade').toBe(true)

    // Grow back: the track widens with the rail in it, and the column comes in only once it is wide.
    await motion.reset()
    await page.setViewportSize({ width: 1440, height: SWEEP_HEIGHT })
    await expect(page.getByTestId('library-panel')).toHaveAttribute('data-library-form', 'column')
    await expect(page.locator('.app__body')).not.toHaveAttribute('data-panel-animating', /.*/)
    await sleep(100)
    const grow = await motion.log()
    expect(animatingSpans(grow).spans.length, 'one animating span while growing').toBe(1)
    for (const frame of grow.filter((f) => f.form === 'column')) expect(frame.libraryWidth).toBeGreaterThan(239.5)
    expect(grow.some((f) => f.form === 'rail' && f.libraryWidth > 80 && f.libraryWidth < 230), 'an in-between track while growing').toBe(true)
  })

  test('under prefers-reduced-motion every tier change is instant: no flag, no transition, no crossfade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const motion = await sampleMotion(page)
    await page.setViewportSize({ width: 900, height: SWEEP_HEIGHT })
    await expect(page.getByTestId('library-panel')).toHaveAttribute('data-library-form', 'rail')
    await sleep(400)
    await page.setViewportSize({ width: 1440, height: SWEEP_HEIGHT })
    await expect(page.getByTestId('library-panel')).toHaveAttribute('data-library-form', 'column')
    await sleep(400)
    const frames = await motion.log()
    expect(frames.some((f) => f.animating), 'flag under reduced motion').toBe(false)
    expect(frames.every((f) => f.duration === '0s'), 'grid transition under reduced motion').toBe(true)
    expect(frames.some((f) => f.opsFading === 'true' || f.libraryFading === 'true'), 'crossfade under reduced motion').toBe(false)
    // The column is back in the frame its track is (at most one frame of rail in a wide track).
    expect(frames.filter((f) => f.form === 'rail' && f.libraryWidth > 239.5).length).toBeLessThanOrEqual(1)
  })
})

/**
 * A tier change mid-drag (`TODO/ui-079` stage 7, "Resizing while something is open"): the row the
 * press started on stays mounted, the drag keeps tracking and the drop still places the body; the
 * content swap waits for `pointerup`. The `-laptop` projects shrink from 1100 (labels, a mouse); the
 * `-tablet` projects grow from 820 (the icon rail) to 1100, with trusted touch in Chromium.
 */
test.describe('a tier change mid-drag does not drop the drag (TODO/ui-079 stage 7)', () => {
  test('the drop still places the body, and the Library content swaps only after the release', async ({ page }, testInfo) => {
    const laptop = testInfo.project.name.endsWith('-laptop')
    const tablet = testInfo.project.name.endsWith('-tablet')
    test.skip(!laptop && !tablet, 'the phone has no tiers to cross')
    const [from, to] = laptop ? [1100, 900] : [820, 1100]
    const [formBefore, formAfter] = laptop ? ['column', 'rail'] : ['rail', 'column']
    await page.setViewportSize({ width: from, height: SWEEP_HEIGHT })
    await page.goto('/')
    const panel = page.getByTestId('library-panel')
    await expect(panel).toHaveAttribute('data-library-form', formBefore)

    const row = page.getByTestId('library-row-primitive.cuboid')
    const box = await row.boundingBox()
    if (!box) throw new Error('no Cube row')
    const cdp = usesTrustedTouch(testInfo) ? await page.context().newCDPSession(page) : null
    let at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    /** @param {{ x: number, y: number }} target */
    const glide = async (target) => {
      const steps = 16
      const start = at
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps
        at = { x: start.x + (target.x - start.x) * t, y: start.y + (target.y - start.y) * t }
        if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...at, id: 1 }] })
        else await page.mouse.move(at.x, at.y)
        await sleep(14)
      }
    }
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...at, id: 1 }] })
    } else {
      await page.mouse.move(at.x, at.y, { steps: 3 })
      await page.mouse.down()
    }
    await sleep(90)
    await glide(await viewportPoint(page, 0.55, 0.5))
    await expect(panel).toHaveAttribute('data-dragging', 'true')

    // Cross the Library breakpoint with the finger still down.
    await page.setViewportSize({ width: to, height: SWEEP_HEIGHT })
    await expect(page.locator('.app__body')).toHaveAttribute('data-library-tier', laptop ? 'icons' : 'labels')
    await sleep(450)
    // Held: the form the drag started in, the pressed row still in the document, the drag alive.
    await expect(panel).toHaveAttribute('data-library-form', formBefore)
    await expect(panel).toHaveAttribute('data-dragging', 'true')
    expect(await row.count()).toBe(1)

    await glide(await viewportPoint(page, 0.6, 0.5))
    await sleep(110)
    if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    else await page.mouse.up()

    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    expect((await sceneBodies(page)).map((body) => body.op)).toEqual(['primitive.cuboid'])
    // The swap the resize asked for lands once the press is over.
    await expect(panel).toHaveAttribute('data-library-form', formAfter)
    await expect(panel).toHaveAttribute('data-dragging', 'false')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
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
      // Phone keeps its rows of icons; it never adopts the group launchers (`TODO/ui-082`).
      await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-ops-tier', 'icons')
      await expect(page.locator('[data-testid^="ops-group-"]')).toHaveCount(0)
      await expect(page.getByTestId('operation-union')).toBeVisible()
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

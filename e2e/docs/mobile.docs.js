// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, shot, settle } from './support.js'

/**
 * Docs media for `docs/mobile.md` (`TODO/docs-018`): the phone (390x844) and tablet
 * (820x1180) layouts, as stills named `<name>-phone.png` / `<name>-tablet.png`, and three
 * phone movies. Runs in the `docs-phone` and `docs-tablet` projects only.
 *
 * Every gesture is a TRUSTED touch event sent through CDP `Input.dispatchTouchEvent` (what a
 * finger produces), at a human pace with a little jitter, never synthetic `PointerEvent`s.
 * Movies end by asserting state: a body placed, the camera target / distance changed, a
 * boolean applied. Chromium only; these pictures are NOT a substitute for checking on real
 * phone and tablet hardware, or for the WebKit touch path (see `TODO/VERIFY.md`).
 */
test.describe('docs media: phone and tablet', () => {
  test.skip(({ viewport }) => viewport?.width !== 390 && viewport?.width !== 820, 'phone and tablet only')

  /** @param {import('@playwright/test').Page} page */
  const view = (page) => page.getByTestId('viewport')
  const isPhone = (/** @type {{ width: number } | null} */ vp) => vp?.width === 390

  /** Where the two overlapping cubes of `cubes-overlap.ndjson` sit, as canvas fractions, per width. */
  const CUBES = {
    // Phone: the scene is first panned up out of the way of the Inspector sheet (see `openScene`),
    // and the box is drawn bottom-right to top-left so the finger starts clear of the toolbar.
    390: { a: { fx: 0.32, fy: 0.268 }, b: { fx: 0.69, fy: 0.255 }, box: [0.96, 0.6, 0.04, 0.16] },
    820: { a: { fx: 0.26, fy: 0.53 }, b: { fx: 0.63, fy: 0.555 }, box: [0.04, 0.4, 0.98, 0.62] },
  }

  const jitter = (n = 2) => (Math.random() - 0.5) * 2 * n

  /** @param {import('@playwright/test').Page} page */
  async function cdp(page) {
    return page.context().newCDPSession(page)
  }

  /** One CDP touch event for the given finger positions (ids are their indexes). */
  const touch = (session, type, points) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i, radiusX: 8, radiusY: 8, force: 1 })),
    })

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

  /**
   * A one-finger drag at human pace: eased path, a little wobble, a short hold at the start.
   *
   * @param {import('@playwright/test').Page} page
   */
  async function fingerDrag(page, session, from, to, { steps = 24, ms = 1100, hold = 150 } = {}) {
    await touch(session, 'touchStart', [from])
    await page.waitForTimeout(hold)
    for (let i = 1; i <= steps; i++) {
      const e = ease(i / steps)
      await touch(session, 'touchMove', [{ x: from.x + (to.x - from.x) * e + jitter(), y: from.y + (to.y - from.y) * e + jitter() }])
      await page.waitForTimeout(ms / steps)
    }
    await touch(session, 'touchMove', [to])
    await page.waitForTimeout(120)
    await touch(session, 'touchEnd', [])
  }

  /**
   * Two fingers moving from one pair of positions to another.
   *
   * @param {import('@playwright/test').Page} page
   */
  async function twoFingerGesture(page, session, [a0, b0], [a1, b1], { steps = 28, ms = 1200, wobble = 1 } = {}) {
    await touch(session, 'touchStart', [a0, b0])
    await page.waitForTimeout(150)
    for (let i = 1; i <= steps; i++) {
      const e = ease(i / steps)
      const at = (p, q) => ({ x: p.x + (q.x - p.x) * e + jitter(wobble), y: p.y + (q.y - p.y) * e + jitter(wobble) })
      await touch(session, 'touchMove', [at(a0, a1), at(b0, b1)])
      await page.waitForTimeout(ms / steps)
    }
    await page.waitForTimeout(120)
    await touch(session, 'touchEnd', [])
  }

  /** Page coordinates of a canvas fraction. @param {import('@playwright/test').Page} page */
  async function canvasPoint(page, { fx, fy }) {
    const b = await page.getByTestId('viewport-canvas').boundingBox()
    return { x: b.x + b.width * fx, y: b.y + b.height * fy }
  }

  /** A real finger tap (touchscreen). @param {import('@playwright/test').Page} page */
  async function tapCanvas(page, at) {
    const p = await canvasPoint(page, at)
    await page.touchscreen.tap(p.x, p.y)
    await settle(page)
  }

  /** Tap a control by its centre. @param {import('@playwright/test').Page} page */
  async function tap(page, testId) {
    await page.getByTestId(testId).tap()
    await settle(page)
  }

  /** Raise the Library bottom sheet (phone only). @param {import('@playwright/test').Page} page */
  async function openLibrary(page) {
    const panel = page.getByTestId('library-panel')
    if ((await panel.getAttribute('data-open')) !== 'true') await tap(page, 'library-tab')
    await expect(page.getByTestId('library-rows')).toBeVisible()
  }

  /** Switch to Select and drag a box around both cubes with a finger. */
  async function marqueeBoth(page, session, vp) {
    if ((await page.getByTestId('nav-mode-select').count()) === 0 || !(await page.getByTestId('nav-mode-select').isVisible())) {
      await tap(page, 'nav-expand-toggle')
    }
    await tap(page, 'nav-mode-select')
    const [x0, y0, x1, y1] = CUBES[vp.width].box
    await fingerDrag(page, session, await canvasPoint(page, { fx: x0, fy: y0 }), await canvasPoint(page, { fx: x1, fy: y1 }), {
      steps: 20,
      ms: 900,
    })
    await expect(view(page)).toHaveAttribute('data-selected-count', '2')
  }

  /**
   * Open the app with the two overlapping cubes. On a phone the Inspector sheet covers the
   * lower half of the view, so slide the scene up with a real two-finger pan first.
   *
   * @param {import('@playwright/test').Page} page
   */
  async function openScene(page, vp) {
    await openApp(page)
    await loadScene(page, 'cubes-overlap.ndjson', 2)
    if (!isPhone(vp)) return
    const before = await camera(page)
    const c = await canvasPoint(page, { fx: 0.5, fy: 0.6 })
    const session = await cdp(page)
    await twoFingerGesture(page, session, [{ x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }], [{ x: c.x - 40, y: c.y - 130 }, { x: c.x + 40, y: c.y - 130 }], { steps: 14, ms: 400, wobble: 0 })
    expect((await camera(page)).target).not.toBe(before.target)
    await settle(page)
  }

  /** @param {import('@playwright/test').Page} page */
  const camera = async (page) => ({
    az: await view(page).getAttribute('data-camera-azimuth'),
    el: await view(page).getAttribute('data-camera-elevation'),
    dist: Number(await view(page).getAttribute('data-camera-distance')),
    target: await view(page).getAttribute('data-camera-target'),
  })

  test('app overview and the Library', async ({ page, viewport }) => {
    await openApp(page)
    await expect(view(page)).toHaveAttribute('data-body-count', '0')
    if (isPhone(viewport)) await shot(page, 'app-overview-phone.png')
    else await shot(page, 'app-overview-tablet.png')
    if (isPhone(viewport)) {
      await openLibrary(page)
      await shot(page, 'library-sheet-phone.png')
    } else {
      await shot(page, 'library-sheet-tablet.png', { locator: page.getByTestId('library-panel') })
    }
  })

  test('selected body: Inspector, and the Operations toolbar with two selected', async ({ page, viewport }) => {
    await openScene(page, viewport)
    await tapCanvas(page, CUBES[viewport.width].a)
    await expect(view(page)).toHaveAttribute('data-selected-count', '1')
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-open', 'true')
    if (isPhone(viewport)) await shot(page, 'inspector-sheet-phone.png')
    else await shot(page, 'inspector-sheet-tablet.png')

    // A tap on empty canvas lets go of the shape (and puts the phone sheet away), then a
    // finger-drawn box in Select mode picks both: the touch route to a two-body selection.
    await tapCanvas(page, isPhone(viewport) ? { fx: 0.6, fy: 0.1 } : { fx: 0.8, fy: 0.8 })
    await expect(view(page)).toHaveAttribute('data-selected-count', '0')
    const session = await cdp(page)
    await marqueeBoth(page, session, viewport)
    await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-enabled', 'true')
    if (isPhone(viewport)) await shot(page, 'operations-toolbar-phone.png')
    else await shot(page, 'operations-toolbar-tablet.png')
  })

  test('phone: the Library open with a shape selected', async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'phone only')
    await openScene(page, viewport)
    await tapCanvas(page, CUBES[390].a)
    await expect(view(page)).toHaveAttribute('data-selected-count', '1')
    await openLibrary(page)
    await expect(page.getByTestId('inspector-tab')).toBeVisible()
    await shot(page, 'mobile-library-with-selection.png')
  })

  test('phone: nav chrome folded and open, File menu', async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'phone only')
    await openScene(page, viewport)
    await tapCanvas(page, CUBES[390].a)
    await expect(view(page)).toHaveAttribute('data-selected-count', '1')
    await expect(page.getByTestId('nav-expand-toggle')).toHaveAttribute('aria-expanded', 'false')
    await shot(page, 'nav-chrome-folded-phone.png')
    await tap(page, 'nav-expand-toggle')
    await expect(page.getByTestId('nav-expand-toggle')).toHaveAttribute('aria-expanded', 'true')
    await shot(page, 'nav-chrome-open-phone.png')
    await tap(page, 'nav-expand-toggle')

    await tap(page, 'file-menu-button')
    await expect(page.getByTestId('file-menu')).toBeVisible()
    await shot(page, 'file-menu-phone.png')
  })

  test('phone: the sketch editor sheet', async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'phone only')
    await openApp(page)
    await openLibrary(page)
    const session = await cdp(page)
    const row = await page.getByTestId('library-row-primitive.sketch').boundingBox()
    const to = await canvasPoint(page, { fx: 0.5, fy: 0.3 })
    await fingerDrag(page, session, { x: row.x + row.width / 2, y: row.y + row.height / 2 }, to, { steps: 16, ms: 700 })
    await expect(view(page)).toHaveAttribute('data-sketch-mode', 'true')
    await tap(page, 'sketch-extrude-toggle')
    await expect(page.getByTestId('sketch-panel-sheet')).toBeVisible()
    await shot(page, 'sketch-sheet-phone.png')
  })

  test('mobile-drag-cube', { tag: '@movie' }, async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'phone only')
    await openApp(page)
    await expect(view(page)).toHaveAttribute('data-body-count', '0')
    const session = await cdp(page)
    await startMovie(page, 'mobile-drag-cube', { width: 390, height: 844 })
    await tap(page, 'library-tab')
    await expect(page.getByTestId('library-rows')).toBeVisible()
    const row = await page.getByTestId('library-row-primitive.cuboid').boundingBox()
    const to = await canvasPoint(page, { fx: 0.5, fy: 0.4 })
    await fingerDrag(page, session, { x: row.x + row.width / 2, y: row.y + row.height / 2 }, to, { steps: 28, ms: 1400, hold: 400 })
    await expect(view(page)).toHaveAttribute('data-body-count', '1')
    await endMovie(page, 'mobile-drag-cube', { fps: 10, width: 300 })
  })

  test('mobile-pinch-pan', { tag: '@movie' }, async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'phone only')
    await openApp(page)
    await loadScene(page, 'cubes-overlap.ndjson', 2)
    const session = await cdp(page)
    const c = await canvasPoint(page, { fx: 0.5, fy: 0.45 })
    const before = await camera(page)
    await startMovie(page, 'mobile-pinch-pan', { width: 390, height: 844 })
    // Two fingers sliding together: pan.
    await twoFingerGesture(page, session, [{ x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }], [{ x: c.x - 40 + 70, y: c.y - 60 }, { x: c.x + 40 + 70, y: c.y - 60 }])
    const panned = await camera(page)
    expect(panned.target).not.toBe(before.target)
    // Two fingers spreading apart: zoom in. Then together: zoom out.
    await twoFingerGesture(page, session, [{ x: c.x - 30, y: c.y }, { x: c.x + 30, y: c.y }], [{ x: c.x - 110, y: c.y }, { x: c.x + 110, y: c.y }])
    const zoomed = await camera(page)
    expect(zoomed.dist).toBeLessThan(panned.dist)
    await twoFingerGesture(page, session, [{ x: c.x - 110, y: c.y }, { x: c.x + 110, y: c.y }], [{ x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }])
    expect((await camera(page)).dist).toBeGreaterThan(zoomed.dist)
    // Tap the orientation triad's Top cap to snap the view.
    await tap(page, 'gizmo-view-top')
    await expect(view(page)).toHaveAttribute('data-camera-elevation', '90.00')
    await endMovie(page, 'mobile-pinch-pan', { fps: 8, width: 260 })
  })

  test('mobile-subtract', { tag: '@movie' }, async ({ page, viewport }) => {
    test.skip(!isPhone(viewport), 'phone only')
    await openScene(page, viewport)
    const session = await cdp(page)
    await startMovie(page, 'mobile-subtract', { width: 390, height: 844 })
    await marqueeBoth(page, session, viewport)
    await page.waitForTimeout(500)
    await tap(page, 'operation-subtract')
    await expect(view(page)).toHaveAttribute('data-body-count', '1')
    await endMovie(page, 'mobile-subtract', { fps: 10, width: 300 })
  })
})

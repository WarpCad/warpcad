// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The navigation pad folds away at every width, and the fold is remembered (`TODO/ui-163`). Driven
 * against `/`, on all three viewports and all three engines: the pad sits over the WebGL canvas,
 * the taps are touch input, and the fold is persisted to `localStorage`.
 *
 * The owner's case is an iPad in landscape ("the orbit controls at the bottom left take up a lot of
 * room"), so the tablet projects also run the 1180x820 landscape size.
 */

/** @param {import('@playwright/test').Page} page */
async function ready(page) {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await expect(page.getByTestId('navigation-chrome')).toBeVisible()
}

/** A tap where the project has touch, a click where it has not (Firefox, laptop). */
async function tapAt(page, hasTouch, x, y) {
  if (hasTouch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

/** Tap the centre of a test id's box. */
async function tapTestId(page, hasTouch, testid) {
  const box = await page.getByTestId(testid).boundingBox()
  if (!box) throw new Error(`${testid} has no box`)
  await tapAt(page, hasTouch, box.x + box.width / 2, box.y + box.height / 2)
}

/** @param {import('@playwright/test').Page} page */
async function azimuth(page) {
  return Number(await page.getByTestId('viewport').getAttribute('data-camera-azimuth'))
}

/**
 * A one-finger drag over the canvas, as pointer events with `pointerType: 'touch'` (the same
 * handlers a finger drives, on engines that cannot emulate a real touch).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ dx: number, dy: number }} delta
 */
async function dragCanvasOneFinger(page, { dx, dy }) {
  await page.evaluate(
    ({ dx, dy }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      const fire = (type, cx, cy) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: cx,
            clientY: cy,
            bubbles: true,
            cancelable: true,
          }),
        )
      fire('pointerdown', x, y)
      fire('pointermove', x + dx / 2, y + dy / 2)
      fire('pointermove', x + dx, y + dy)
      fire('pointerup', x + dx, y + dy)
    },
    { dx, dy },
  )
  await page.waitForTimeout(80)
}

/** What the browser's hit test finds at a point, as a test id or tag. */
function hitAt(page, x, y) {
  return page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py)
      if (!el) return 'nothing'
      const owner = el.closest('[data-testid]')
      return owner ? owner.getAttribute('data-testid') : el.tagName
    },
    [x, y],
  )
}

/**
 * Fold, check the folded form, tap the old pad area, orbit, reload, unfold. Shared by the three
 * viewports and the landscape case.
 *
 * @param {import('@playwright/test').Page} page
 * @param {boolean} hasTouch
 */
async function foldAndUnfold(page, hasTouch) {
  const chrome = page.getByTestId('navigation-chrome')
  const toggle = page.getByTestId('nav-expand-toggle')
  const fold = page.getByTestId('nav-fold')

  // Open by default (a first visit finds the pad), with the fold button inside the cluster.
  await expect(page.getByTestId('nav-step-right')).toBeVisible()
  await expect(toggle).toBeHidden()
  await expect(fold).toBeVisible()
  await expect(fold).toHaveAttribute('aria-label', 'Hide navigation controls')
  const open = await chrome.boundingBox()
  const foldBox = await fold.boundingBox()
  if (!open || !foldBox) throw new Error('no cluster box')
  expect(foldBox.x + foldBox.width, 'the fold button is in the cluster').toBeLessThanOrEqual(open.x + open.width + 0.5)
  expect(foldBox.width, 'fold button tap size').toBeGreaterThanOrEqual(36)

  // A drag mode chosen before the fold must survive it.
  await tapTestId(page, hasTouch, 'nav-mode-pan')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-drag-mode', 'pan')
  // The pad's centre, to tap once it has gone.
  const padBox = await page.getByTestId('nav-reset').boundingBox()
  if (!padBox) throw new Error('no pad box')
  const oldPad = { x: padBox.x + padBox.width / 2, y: padBox.y + padBox.height / 2 }
  const before = await azimuth(page)

  await tapTestId(page, hasTouch, 'nav-fold')

  // Feedback: one ✥ View button, no bigger than 60 px each way, aria-expanded false.
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('nav-expand-word')).toHaveText('View')
  await expect(page.getByTestId('nav-step-right')).toBeHidden()
  await expect(fold).toBeHidden()
  const folded = await chrome.boundingBox()
  const toggleBox = await toggle.boundingBox()
  if (!folded || !toggleBox) throw new Error('no folded box')
  expect(folded.width, 'folded cluster width').toBeLessThanOrEqual(60)
  expect(folded.height, 'folded cluster height').toBeLessThanOrEqual(60)
  expect(toggleBox.width, 'folded control width').toBeLessThanOrEqual(60)
  expect(toggleBox.height, 'folded control height').toBeLessThanOrEqual(60)
  expect(toggleBox.width, 'folded control stays a tap target').toBeGreaterThanOrEqual(36)

  // The canvas under the old pad takes a tap: the hit test finds the canvas, and the tap does not
  // press a pad button (which would have moved the camera).
  expect(await hitAt(page, oldPad.x, oldPad.y)).not.toMatch(/^nav-/)
  expect(await hitAt(page, oldPad.x, oldPad.y)).not.toBe('navigation-chrome')
  await tapAt(page, hasTouch, oldPad.x, oldPad.y)
  await page.waitForTimeout(150)
  expect(await azimuth(page)).toBeCloseTo(before, 1)

  // One-finger orbit still works while folded (Orbit mode: the drag mode is Pan, so go back to
  // Orbit is not possible from here; a pan drag moves the target instead, and the camera is live).
  const targetBefore = await page.getByTestId('viewport').getAttribute('data-camera-target')
  await dragCanvasOneFinger(page, { dx: 90, dy: 30 })
  await expect
    .poll(async () => page.getByTestId('viewport').getAttribute('data-camera-target'), { timeout: 5000 })
    .not.toBe(targetBefore)

  // Unfold: the whole pad comes back, in the drag mode it was left in.
  await tapTestId(page, hasTouch, 'nav-expand-toggle')
  await expect(page.getByTestId('nav-step-right')).toBeVisible()
  await expect(fold).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-drag-mode', 'pan')
  await expect(page.getByTestId('nav-mode-pan')).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('warpcad.navFolded'))).toBe('0')

  // Fold again, reload: still folded, and stored under the documented key.
  await tapTestId(page, hasTouch, 'nav-fold')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('nav-step-right')).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('warpcad.navFolded'))).toBe('1')
  await tapTestId(page, hasTouch, 'nav-expand-toggle')
  await expect(page.getByTestId('nav-step-right')).toBeVisible()

  // And the unfolded pad is the working pad: Orbit mode, then a step moves the azimuth.
  await tapTestId(page, hasTouch, 'nav-mode-orbit')
  await tapTestId(page, hasTouch, 'nav-step-left')
  await expect.poll(() => azimuth(page), { timeout: 5000 }).not.toBeCloseTo(before, 1)
}

test.describe('navigation pad fold (TODO/ui-163)', () => {
  test('folds to one View button, keeps the canvas tappable and the mode, and is remembered across a reload', async ({
    page,
    hasTouch,
  }) => {
    await ready(page)
    await foldAndUnfold(page, hasTouch)
  })

  test('a one-finger drag orbits while the pad is folded', async ({ page, hasTouch }) => {
    await ready(page)
    await tapTestId(page, hasTouch, 'nav-fold')
    await expect(page.getByTestId('nav-expand-toggle')).toHaveAttribute('aria-expanded', 'false')
    const before = await azimuth(page)
    await dragCanvasOneFinger(page, { dx: 120, dy: 0 })
    await expect.poll(() => azimuth(page), { timeout: 5000 }).not.toBeCloseTo(before, 0)
  })

  test('a corrupt stored value opens the pad rather than hiding it', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('warpcad.navFolded', 'garbage'))
    await ready(page)
    await expect(page.getByTestId('nav-step-right')).toBeVisible()
  })

  test('at 1180x820 landscape (the iPad) the pad folds, stays folded on reload and unfolds', async ({ page, hasTouch }, info) => {
    test.skip(!info.project.name.endsWith('-tablet'), 'the landscape iPad case lives in the tablet projects')
    await page.setViewportSize({ width: 1180, height: 820 })
    await ready(page)
    await foldAndUnfold(page, hasTouch)
  })

  test('on a phone the sheet folds the pad and the remembered state wins when it closes', async ({ page, hasTouch }, info) => {
    test.skip(!info.project.name.endsWith('-phone'), 'the sheet raises the pad at phone width only')
    await ready(page)
    // One body, so the Inspector has a sheet to open from its tab (nothing selected).
    await page.evaluate(async () => {
      const documentModule = await window.__e2eImport('/src/stores/document.js')
      documentModule.useDocumentStore().append({
        id: 'cubeA',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [40, 40, 40], center: [0, 0, 20] },
      })
    })
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    const toggle = page.getByTestId('nav-expand-toggle')
    const inspector = page.getByTestId('inspector')

    // Remembered state open: a sheet folds the pad (ui-046), closing it brings the pad back.
    await tapTestId(page, hasTouch, 'inspector-tab')
    await expect(inspector).toHaveAttribute('data-open', 'true')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('nav-step-right')).toBeHidden()
    await tapTestId(page, hasTouch, 'inspector-tab')
    await expect(inspector).toHaveAttribute('data-open', 'false')
    await expect(page.getByTestId('nav-step-right')).toBeVisible()
    await expect(toggle).toBeHidden()

    // Remembered state folded: it stays folded through a sheet and after it closes.
    await tapTestId(page, hasTouch, 'nav-fold')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await tapTestId(page, hasTouch, 'inspector-tab')
    await expect(inspector).toHaveAttribute('data-open', 'true')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await tapTestId(page, hasTouch, 'inspector-tab')
    await expect(inspector).toHaveAttribute('data-open', 'false')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('nav-step-right')).toBeHidden()

    // An unfold over an open sheet opens the pad for that sheet, and the unfold is remembered.
    await tapTestId(page, hasTouch, 'inspector-tab')
    await expect(inspector).toHaveAttribute('data-open', 'true')
    await tapTestId(page, hasTouch, 'nav-expand-toggle')
    await expect(page.getByTestId('nav-step-right')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('warpcad.navFolded'))).toBe('0')
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The in-app Help (`TODO/ui-061`), driven against `/`: a **?** in a tool pop-up's header, **File ▾ →
 * Help**, the `?` / F1 keys, and the bundled docs opening offline.
 *
 * **All three reference viewports and all three engines.** The offline half is the
 * engine-sensitive one (service-worker lifecycle differs in WebKit and Firefox), and the phone
 * sheet's layout differs from the laptop's, hence a snapshot at each viewport.
 *
 * The offline test needs the **production build** — `vite dev` registers no service worker — so
 * it runs under `E2E_PREVIEW=1` (`playwright.config.js`) and reports itself skipped, with the
 * reason, in a plain dev run:
 *
 *     E2E_PREVIEW=1 npx playwright test e2e/help.e2e.js
 */

const PREVIEW = process.env.E2E_PREVIEW === '1'

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * A real pointer drag of a Library row into the viewport.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} options
 */
async function dragRowIntoViewport(page, { op, fx, fy }) {
  await page.evaluate(
    ({ op, fx, fy }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error(`missing row ${op} or viewport`)
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const startX = from.left + from.width / 2
      const startY = from.top + from.height / 2
      const endX = to.left + to.width * fx
      const endY = to.top + to.height * fy
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      fire(row, 'pointerdown', startX, startY)
      for (const t of [0.25, 0.5, 0.75, 1]) {
        fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      }
      fire(window, 'pointerup', endX, endY)
    },
    { op, fx, fy },
  )
  await page.waitForTimeout(120)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 * @param {{ shift?: boolean }} [modifiers]
 */
async function clickViewportAt(page, fx, fy, modifiers = {}) {
  await page.evaluate(
    ({ fx, fy, shift }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const x = box.left + box.width * fx
      const y = box.top + box.height * fy
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 3,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            shiftKey: shift === true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy, shift: modifiers.shift === true },
  )
  await page.waitForTimeout(90)
}

const CUBE = { drop: { fx: 0.28, fy: 0.42 }, click: { fx: 0.28, fy: 0.38 } }
const CYLINDER = { drop: { fx: 0.72, fy: 0.3 }, click: { fx: 0.72, fy: 0.26 } }

/**
 * Place a Cube and a Cylinder and select both, Cube first.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeAndSelectTwo(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', ...CYLINDER.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await clickViewportAt(page, CYLINDER.click.fx, CYLINDER.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
}

/** @param {import('@playwright/test').Page} page */
async function openHelpFromFileMenu(page) {
  await page.getByTestId('file-menu-button').click()
  await page.getByTestId('file-help').click()
  await expect(page.getByTestId('help-sheet')).toBeVisible()
}

test.describe('Help from a tool pop-up', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
  })

  test('? in the Align pop-up opens its docs section; closing returns to the pop-up intact', async ({ page }) => {
    await placeAndSelectTwo(page)
    await page.getByTestId('operation-align').click()
    const popover = page.getByTestId('align-popover')
    await expect(popover).toBeVisible()

    // Fields the user had already set: they must survive the round trip.
    await page.getByTestId('align-relation').selectOption('inside')
    await page.getByTestId('align-offset').fill('7')
    const boxBefore = await page.getByTestId('align-offset').boundingBox()

    await page.getByTestId('help-align').click()
    const sheet = page.getByTestId('help-sheet')
    await expect(sheet).toBeVisible()
    // `TODO/ui-060` retitles the page around the one Align tool.
    await expect(page.getByTestId('help-current-page')).toContainText('Align')
    // Scrolled to the tool's section, heading marked.
    const target = page.getByTestId('help-content').locator('.help-target')
    await expect(target).toHaveText(/popover's fields/)
    await expect(target).toBeInViewport()
    // The pop-up is still there underneath, untouched.
    await expect(popover).toBeVisible()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

    await expect(sheet).toHaveScreenshot('help-from-align.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
      mask: [page.getByTestId('help-content').locator('img')],
    })

    await page.getByTestId('help-close').click()
    await expect(sheet).toBeHidden()
    await expect(popover).toBeVisible()
    await expect(page.getByTestId('align-relation')).toHaveValue('inside')
    await expect(page.getByTestId('align-offset')).toHaveValue('7')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
    // The new header button did not move the pop-up's own controls.
    const boxAfter = await page.getByTestId('align-offset').boundingBox()
    expect(boxAfter?.y).toBeCloseTo(boxBefore?.y ?? 0, 0)
    // And the pop-up still commits: help did not disarm it.
    await expect(page.getByTestId('align-x-center')).toBeEnabled()
  })

  test('Escape closes help first and leaves the pop-up open', async ({ page }) => {
    await placeAndSelectTwo(page)
    await page.getByTestId('operation-align').click()
    await expect(page.getByTestId('align-popover')).toBeVisible()
    await page.getByTestId('help-align').click()
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('help-sheet')).toBeHidden()
    await expect(page.getByTestId('align-popover')).toBeVisible()
  })

  test('the ? is enabled even when the tool it documents is disabled', async ({ page }) => {
    await expect(page.getByTestId('operation-align')).toBeDisabled()
    const help = page.getByTestId('help-boolean')
    // A narrow viewport column has no room for it beside "N selected"; File ▾ → Help is the route there.
    test.skip(!(await help.isVisible()), 'toolbar ? is hidden in a narrow viewport column')
    await help.click()
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await expect(page.getByTestId('help-current-page')).toContainText('Union, Subtract and Intersect')
    await page.getByTestId('help-close').click()
    await expect(page.getByTestId('help-sheet')).toBeHidden()
  })
})

test.describe('Help from the main UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
  })

  test('File ▾ → Help opens Getting started; an in-page link stays in the sheet and Back returns', async ({ page }) => {
    await openHelpFromFileMenu(page)
    await expect(page.getByTestId('help-current-page')).toContainText('Getting started')
    await expect(page.getByTestId('help-content')).toContainText('Subtract')

    const link = page.getByTestId('help-content').locator('a[data-help-page]').first()
    const nextPage = await link.getAttribute('data-help-page')
    expect(nextPage).not.toBe('getting-started')
    await link.click()
    await expect(page.getByTestId('help-sheet')).toHaveAttribute('data-page', String(nextPage))
    // Still the same single-screen app: no navigation happened.
    await expect(page).toHaveURL(/\/(#\/help\/[\w-]+)?$/)

    await page.getByTestId('help-back').click()
    await expect(page.getByTestId('help-sheet')).toHaveAttribute('data-page', 'getting-started')
  })

  test('Contents lists every page and opens the one picked (behind a button at phone width)', async ({ page, viewport }) => {
    await openHelpFromFileMenu(page)
    if ((viewport?.width ?? 1440) <= 640) {
      await expect(page.getByTestId('help-contents')).toBeHidden()
      await page.getByTestId('help-contents-toggle').click()
    }
    await expect(page.getByTestId('help-contents')).toBeVisible()
    // One entry per bundled page: the count comes from the built index, not from a literal.
    const pages = await page.evaluate(async () => (await (await fetch('/help/index.json')).json()).pages.length)
    expect(pages).toBeGreaterThan(20)
    await expect(page.getByTestId('help-contents').locator('a')).toHaveCount(pages)
    await page.getByTestId('help-contents-booleans').click()
    await expect(page.getByTestId('help-sheet')).toHaveAttribute('data-page', 'booleans')
    await expect(page.getByTestId('help-current-page')).toContainText('Union, Subtract and Intersect')
    await expect(page).toHaveScreenshot(`help-contents-${viewport?.width}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
      mask: [page.getByTestId('viewport-canvas'), page.getByTestId('help-content').locator('img'), page.getByTestId('save-status')],
    })
  })

  test('? and F1 open it from the keyboard, but not while typing in a field', async ({ page }) => {
    await page.keyboard.press('?')
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('help-sheet')).toBeHidden()

    await page.keyboard.press('F1')
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('help-sheet')).toBeHidden()

    // A text field keeps its ?.
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('project-settings').click()
    const field = page.locator('#project-settings-text')
    await field.focus()
    await page.keyboard.type('why?')
    await expect(field).toHaveValue('why?')
    await expect(page.getByTestId('help-sheet')).toBeHidden()
  })

  test('the Project settings dialog has a ? that opens the sheet above it', async ({ page }) => {
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('project-settings').click()
    await expect(page.getByTestId('project-settings-dialog')).toBeVisible()
    await page.getByTestId('help-project-settings').click()
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    // The sheet is on top: its Close button is the element at its own centre.
    const close = page.getByTestId('help-close')
    const box = await close.boundingBox()
    const topmost = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
      { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 },
    )
    expect(topmost).toBe('help-close')
    await close.click()
    await expect(page.getByTestId('project-settings-dialog')).toBeVisible()
  })
})

test.describe('Help offline', () => {
  test.skip(!PREVIEW, 'the service worker exists only in the production build — run with E2E_PREVIEW=1')
  // WebKit is configured to block service workers under E2E_PREVIEW (their requests cannot be
  // routed, which other specs rely on); this one needs the real thing and routes nothing.
  test.use({ serviceWorkers: 'allow' })
  test.setTimeout(120_000)

  test('after the service worker is active, Help still opens with text and a picture', async ({
    page,
    context,
    browserName,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
    // Active, and controlling this page: the precache (including help/) is complete by then.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await expect
      .poll(async () => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 60_000 })
      .toBe(true)

    // The docs are in the precache, on every engine: text, the index and a still picture.
    const precached = await page.evaluate(async () => {
      const urls = ['/help/index.json', '/help/getting-started.html', '/help/img/screenshots/tour-step-1-place.png']
      return Promise.all(urls.map(async (url) => (await caches.match(url, { ignoreSearch: true })) !== undefined))
    })
    expect(precached).toEqual([true, true, true])

    if (browserName === 'webkit') {
      // Playwright's WebKit takes the network offline *beneath* the service worker: even a request
      // the worker would answer from its cache fails ("WebKit encountered an internal error" on
      // reload, "Load failed" on fetch — reproduced with a bare fetch outside this app). So the
      // cache contents above are what can be proven there; the offline reload cannot be.
      test.info().annotations.push({
        type: 'limitation',
        description: 'WebKit: setOffline defeats service-worker responses; precache contents asserted instead',
      })
      return
    }

    await context.setOffline(true)
    try {
      // Offline, the whole app still loads from the worker, and so does Help.
      await page.reload()
      await expect(page.getByTestId('viewport')).toBeVisible()
      await openHelpFromFileMenu(page)
      await expect(page.getByTestId('help-content')).toContainText('Subtract')
      // A still (precached). The page's GIFs are runtime-cached on first sight, not precached.
      const image = page.getByTestId('help-content').locator('img[src$=".png"]').first()
      await image.scrollIntoViewIfNeeded()
      await expect
        .poll(async () => image.evaluate((el) => /** @type {HTMLImageElement} */ (el).complete && /** @type {HTMLImageElement} */ (el).naturalWidth), {
          timeout: 20_000,
        })
        .toBeGreaterThan(0)
    } finally {
      await context.setOffline(false)
    }
  })
})

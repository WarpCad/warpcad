// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from '@playwright/test'

/**
 * The kernel evaluation worker, in the real app (`TODO/core-029`).
 *
 * `core-029` moved the one piece of kernel work the main thread repeated on every
 * mutation — the union behind a composite body's volume — into a module worker
 * (`src/core/kernel/evaluation.worker.js`). A unit spec proves the job function and the
 * client's cancellation against a fake worker; this proves the part a unit spec cannot:
 * that a **real** module worker is constructed, bundled and answering in each engine,
 * and that what it answers is **identical** to the main thread's own measurement of the
 * same geometry — compared in the page itself, to the digit the DOM prints.
 *
 * Engines: Chromium and WebKit. A module worker is a real bundling-and-engine surface
 * (`perf-001` found the same for the export worker), so this is not Chromium-only.
 * Firefox cannot be launched in this sandbox (`TROUBLESHOOTING.md`, 2026-09-17).
 * Viewport: the claim is not layout, but the placement path differs per form factor
 * (the Library is a bottom sheet on a phone), so it runs at all three.
 */

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.getByTestId('library-rows-raspberrypi').scrollIntoViewIfNeeded()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport with real `PointerEvent`s.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} op
 * @param {number} fx
 * @param {number} fy
 */
async function dragRowIntoViewport(page, op, fx, fy) {
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
      /** @param {EventTarget} target @param {string} type @param {number} x @param {number} y */
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 29,
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
      for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      fire(window, 'pointerup', endX, endY)
    },
    { op, fx, fy },
  )
  await page.waitForTimeout(120)
}

/**
 * Each body's volume as the DOM prints it, once every one has landed, next to the same
 * body's volume measured **on the page's main thread** by the very function the worker
 * runs (`measureGeometry`), formatted the same way.
 *
 * @param {import('@playwright/test').Page} page
 */
async function volumesBothWays(page) {
  await page.waitForFunction(() => {
    const items = [...document.querySelectorAll('[data-testid="scene-bodies"] li')]
    return items.length > 0 && items.every((node) => node.hasAttribute('data-body-volume'))
  })
  return page.evaluate(async () => {
    const { useDocumentStore } = await import('/src/stores/document.js')
    const { measureGeometry } = await import('/src/core/kernel/measure.js')
    const store = useDocumentStore()
    return store.raw.bodies().map((body) => ({
      id: body.id,
      fromDom: document.querySelector(`[data-body-id="${body.id}"]`)?.getAttribute('data-body-volume') ?? null,
      fromMainThread: measureGeometry(body.geometry).volumeMm3.toFixed(3),
    }))
  })
}

test.skip(({ browserName }) => browserName === 'firefox', 'Firefox cannot launch in this sandbox — TROUBLESHOOTING.md')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('a placed composite is measured by a real evaluation worker, identically to the main thread', async ({ page }) => {
  /** @type {string[]} */
  const workers = []
  page.on('worker', (worker) => workers.push(worker.url()))

  await openLibrary(page)
  await dragRowIntoViewport(page, 'raspberrypi.bplus', 0.35, 0.3)
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  const [pi] = await volumesBothWays(page)
  expect(Number(pi.fromDom)).toBeGreaterThan(1000)
  expect(pi.fromDom).toBe(pi.fromMainThread)
  // The answer really came from a worker, not the no-worker fallback.
  expect(workers.some((url) => /evaluation\.worker/.test(url))).toBe(true)
})

test('Undo re-folds, and every composite is re-measured by the worker to the same volume', async ({ page }) => {
  await openLibrary(page)
  await dragRowIntoViewport(page, 'raspberrypi.bplus', 0.3, 0.3)
  await dragRowIntoViewport(page, 'raspberrypi.bplus', 0.7, 0.3)
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const before = await volumesBothWays(page)
  expect(before.every((body) => body.fromDom === body.fromMainThread)).toBe(true)

  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const after = await volumesBothWays(page)
  expect(after).toHaveLength(1)
  expect(after[0].fromDom).toBe(after[0].fromMainThread)
  expect(after[0].fromDom).toBe(before.find((body) => body.id === after[0].id)?.fromDom)
})

import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/core-035` — the design resolution (File ▾ → Resolution…) and the per-export
 * override (File ▾ → Export… → Resolution), against the real app at `/`.
 *
 * Runs at all three reference viewports (a new popover, and a change to the Export
 * popover) with a snapshot of each popover at each, and against every engine the config
 * runs: it touches kernel worker output, persistence and the rendered viewport.
 *
 * What is asserted is what a user can see or hold: the menu label, the Undo button's
 * label, the curved body's measured volume (a finer cylinder is a fuller one), and the
 * downloaded file itself — parsed here by a reader that shares no code with the
 * serializer, as `export-ui.e2e.js` does.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'resolution-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

/**
 * @param {import('@playwright/test').Locator} locator
 * @param {import('@playwright/test').TestInfo} testInfo
 */
async function press(locator, testInfo) {
  if (testInfo.project.use.hasTouch) await locator.tap()
  else await locator.click()
}

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
 * Drag a Library row into the viewport with real PointerEvents, the path a user's drag
 * takes (the same helper every placement spec uses).
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} target
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
      /** @param {EventTarget} target @param {string} type @param {number} x @param {number} y */
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

/** @param {import('@playwright/test').Page} page */
async function placeCylinder(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.5, fy: 0.42 })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
}

/** The one body's measured volume, once the evaluation worker has reported it. */
async function bodyVolume(page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((node) => node.hasAttribute('data-body-volume')),
  )
  return page.$eval('[data-testid="scene-bodies"] li', (node) => Number(node.getAttribute('data-body-volume')))
}

/** @param {import('@playwright/test').Page} page @param {import('@playwright/test').TestInfo} testInfo */
async function openFileMenu(page, testInfo) {
  await press(page.getByTestId('file-menu-button'), testInfo)
  await expect(page.getByTestId('file-menu')).toBeVisible()
}

/**
 * Does a tap at the element's centre land on it (not on a sheet stacked over it)?
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 */
async function isReachable(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return { found: false }
    const box = el.getBoundingClientRect()
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return {
      found: true,
      height: box.height,
      onScreen: box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight,
      topmostIsItem: top !== null && (el === top || el.contains(top) || top.contains(el)),
    }
  }, testId)
}

/** Triangle count of a binary STL, read by its fixed layout (and length-checked). */
function stlTriangleCount(bytes) {
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true)
  expect(bytes.byteLength, 'binary STL length = 84 + 50 per triangle').toBe(84 + 50 * count)
  return count
}

/** @param {import('@playwright/test').Page} page */
async function pressExport(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-commit').click()])
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) }
}

test('File ▾ → Resolution… → Fine re-facets the cylinder as one Undo; the menu label reads it; Undo reverts', async ({
  page,
}, testInfo) => {
  await placeCylinder(page)
  const atNormal = await bodyVolume(page)

  await openFileMenu(page, testInfo)
  await expect(page.getByTestId('file-resolution')).toHaveText('Resolution: Normal…')
  await press(page.getByTestId('file-resolution'), testInfo)
  const popover = page.getByTestId('resolution-popover')
  await expect(popover).toBeVisible()
  await expect(page.getByTestId('file-menu')).toHaveCount(0)
  await expect(page.getByTestId('resolution-option-normal')).toBeChecked()
  await expect(page.getByTestId('resolution-option-legacy')).toHaveCount(0)
  await expect(page.getByTestId('resolution-option-fine-label')).toContainText('Ø20 hole: 52 sides, ≤0.02 mm off')

  // Reachable at every width: on screen, a 44 px row, and not under the Inspector sheet.
  for (const id of ['resolution-option-fine-label', 'resolution-close']) {
    const reach = await isReachable(page, id)
    expect(reach.onScreen, `${id} on screen`).toBe(true)
    expect(reach.topmostIsItem, `${id} is the topmost thing under a tap`).toBe(true)
    expect(reach.height, `${id} meets the 44 px tap target`).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({ path: join(SNAPSHOT_DIR, `design-popover-${testInfo.project.name}.png`) })

  await press(page.getByTestId('resolution-option-fine-label'), testInfo)
  await expect(page.getByTestId('resolution-option-fine')).toBeChecked()
  await expect(page.getByTestId('undo-button')).toHaveAttribute('data-undo-label', 'Resolution → Fine')
  // A finer cylinder is a fuller one: its flats sit closer to the true circle.
  await expect.poll(() => bodyVolume(page)).toBeGreaterThan(atNormal)
  const atFine = await bodyVolume(page)
  await press(page.getByTestId('resolution-close'), testInfo)
  await expect(popover).toHaveCount(0)

  await openFileMenu(page, testInfo)
  await expect(page.getByTestId('file-resolution')).toHaveText('Resolution: Fine…')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('file-menu')).toHaveCount(0)

  await press(page.getByTestId('undo-button'), testInfo)
  await expect.poll(() => bodyVolume(page)).toBeLessThan(atFine)
  expect(await bodyVolume(page)).toBeCloseTo(atNormal, 6)
  await openFileMenu(page, testInfo)
  await expect(page.getByTestId('file-resolution')).toHaveText('Resolution: Normal…')
})

test('File ▾ → Export… → Resolution: Print writes more triangles than Same as design, and the design is unchanged', async ({
  page,
}, testInfo) => {
  await placeCylinder(page)
  const volume = await bodyVolume(page)

  // Same as design first.
  await openFileMenu(page, testInfo)
  await press(page.getByTestId('file-export'), testInfo)
  await expect(page.getByTestId('export-popover')).toBeVisible()
  const select = page.getByTestId('export-resolution')
  await expect(select).toHaveValue('design')
  await expect(select.locator('option').first()).toHaveText('Same as design (Normal)')
  await expect(page.getByTestId('export-resolution-note')).toHaveCount(0)
  const atDesign = await pressExport(page)
  const designTriangles = stlTriangleCount(atDesign.bytes)
  await expect(page.getByTestId('save-status')).toContainText(`${designTriangles.toLocaleString('en-US')} triangles`)

  // Then Print, for this export only.
  await openFileMenu(page, testInfo)
  await press(page.getByTestId('file-export'), testInfo)
  await expect(page.getByTestId('export-popover')).toBeVisible()
  await select.selectOption('print')
  await expect(page.getByTestId('export-resolution-note')).toHaveText(
    'Re-evaluating at Print resolution — the design itself is unchanged.',
  )
  const reach = await isReachable(page, 'export-resolution')
  expect(reach.onScreen && reach.topmostIsItem).toBe(true)
  expect(reach.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `export-override-${testInfo.project.name}.png`) })

  const atPrint = await pressExport(page)
  expect(atPrint.name).toBe(atDesign.name)
  const printTriangles = stlTriangleCount(atPrint.bytes)
  expect(printTriangles).toBeGreaterThan(designTriangles)
  await expect(page.getByTestId('save-status')).toContainText(`${printTriangles.toLocaleString('en-US')} triangles`)

  // The design itself did not move: same setting, same body, nothing on the Undo stack for it.
  await openFileMenu(page, testInfo)
  await expect(page.getByTestId('file-resolution')).toHaveText('Resolution: Normal…')
  expect(await bodyVolume(page)).toBeCloseTo(volume, 6)
  await expect(page.getByTestId('undo-button')).not.toHaveAttribute('data-undo-label', /Resolution/)
})

test('the design resolution survives a reload with the project', async ({ page }, testInfo) => {
  await placeCylinder(page)
  await openFileMenu(page, testInfo)
  await press(page.getByTestId('file-resolution'), testInfo)
  await press(page.getByTestId('resolution-option-print-label'), testInfo)
  await expect(page.getByTestId('resolution-option-print')).toBeChecked()
  const atPrint = await bodyVolume(page)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('resolution-popover')).toHaveCount(0)
  await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 })

  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  expect(await bodyVolume(page)).toBeCloseTo(atPrint, 6)
  await openFileMenu(page, testInfo)
  await expect(page.getByTestId('file-resolution')).toHaveText('Resolution: Print…')
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/ui-151`: **File ▾ → Appearance…** opens a sheet with the Theme modes and the six Style tiles.
 * Tapping one repaints the panels and the 3D view and is remembered across a reload; the same picker
 * still sits in Help and no longer waits for the Help page to load. Against the real app at `/`.
 *
 * A panel pixel (read from a real screenshot, so it is what the user sees) and a canvas background
 * pixel (read from the WebGL canvas) are both sampled, because CSS tokens paint the first and
 * `useTheme`'s resolved value paints the second.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three engines and all three viewports, with a snapshot of the open sheet at each: it reads WebGL
 * canvas pixels and `localStorage`, Glass uses `backdrop-filter`, the styles' fonts differ by engine,
 * and the tiles must fit and stay tappable at phone width.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'appearance')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

test.use({ colorScheme: 'dark' })

/** @param {import('@playwright/test').Page} page */
async function openApp(page) {
  await page.goto('/')
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-webgl', 'ready')
  await expect.poll(async () => Number(await viewport.getAttribute('data-frames-rendered'))).toBeGreaterThan(1)
}

/** @param {import('@playwright/test').Page} page */
async function openAppearance(page) {
  await page.getByTestId('file-menu-button').click()
  await page.getByTestId('file-appearance').click()
  await expect(page.getByTestId('appearance-sheet')).toBeVisible()
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} choice a mode or a style
 * @param {string} [prefix] `appearance` (the sheet) or `help`
 */
async function choose(page, choice, prefix = 'appearance') {
  const button = page.getByTestId(`${prefix}-theme-${choice}`)
  await button.scrollIntoViewIfNeeded()
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
}

/**
 * Luminance 0-255 of a 2x2 screenshot clip inside the sheet, decoded in the page.
 * @param {import('@playwright/test').Page} page
 * @param {string} sheetId
 * @returns {Promise<number>}
 */
async function panelLuma(page, sheetId) {
  const box = await page.getByTestId(sheetId).boundingBox()
  if (!box) throw new Error(`${sheetId} has no box`)
  const png = await page.screenshot({ clip: { x: box.x + 3, y: box.y + box.height - 6, width: 2, height: 2 } })
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const off = document.createElement('canvas')
    off.width = bitmap.width
    off.height = bitmap.height
    const ctx = /** @type {CanvasRenderingContext2D} */ (off.getContext('2d'))
    ctx.drawImage(bitmap, 0, 0)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return (r + g + b) / 3
  }, png.toString('base64'))
}

/**
 * Luminance of the canvas' top-left corner, the scene background.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
function canvasLuma(page) {
  return page.evaluate(() => {
    const source = /** @type {HTMLCanvasElement} */ (document.querySelector('[data-testid="viewport-canvas"]'))
    const off = document.createElement('canvas')
    off.width = 1
    off.height = 1
    const ctx = /** @type {CanvasRenderingContext2D} */ (off.getContext('2d'))
    ctx.drawImage(source, 0, 0, 8, 8, 0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return (r + g + b) / 3
  })
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} sheetId
 * @param {'dark' | 'light'} side
 */
async function expectPainted(page, sheetId, side) {
  const test = side === 'light' ? (/** @type {number} */ v) => v > 150 : (/** @type {number} */ v) => v < 90
  await expect.poll(async () => test(await panelLuma(page, sheetId)), { message: `panel is ${side}` }).toBe(true)
  await expect.poll(async () => test(await canvasLuma(page)), { message: `canvas is ${side}` }).toBe(true)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} name
 */
async function snapshot(page, testInfo, name) {
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}-${name}.png`) })
}

test.describe('Appearance sheet', () => {
  test('opens from File, repaints panels and the 3D view for a mode and a style, and remembers the choice', async ({ page }, testInfo) => {
    await openApp(page)
    await openAppearance(page)
    await expect(page.getByTestId('appearance-theme-system')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await snapshot(page, testInfo, 'open')

    await choose(page, 'light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expectPainted(page, 'appearance-sheet', 'light')
    const lightCanvas = await canvasLuma(page)

    await choose(page, 'blueprint')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blueprint')
    for (const mode of ['system', 'dark', 'light']) {
      await expect(page.getByTestId(`appearance-theme-${mode}`)).toHaveAttribute('aria-pressed', 'false')
    }
    await expect.poll(async () => Math.abs((await canvasLuma(page)) - lightCanvas)).toBeGreaterThan(20)
    await snapshot(page, testInfo, 'blueprint')

    for (const style of ['kids', 'glass', 'deco', 'minimal', 'pixel']) {
      await choose(page, style)
      await expect(page.locator('html')).toHaveAttribute('data-theme', style)
      await expect(page.getByTestId('appearance-sheet')).toBeVisible()
    }

    await choose(page, 'blueprint')
    await page.reload()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'blueprint')
    await openAppearance(page)
    await expect(page.getByTestId('appearance-theme-blueprint')).toHaveAttribute('aria-pressed', 'true')

    await choose(page, 'system')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expectPainted(page, 'appearance-sheet', 'dark')
  })

  test('the sheet fits every viewport: tiles and segments are at least 44 px tall, nothing scrolls sideways', async ({ page }, testInfo) => {
    await openApp(page)
    await openAppearance(page)
    const sheet = page.getByTestId('appearance-sheet')
    const buttons = sheet.locator('button[aria-pressed]')
    expect(await buttons.count()).toBe(9)
    for (const button of await buttons.all()) {
      const box = await button.boundingBox()
      expect(box?.height ?? 0, await button.getAttribute('data-testid') ?? '').toBeGreaterThanOrEqual(44)
    }
    const overflow = await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const page_ = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(page_).toBeLessThanOrEqual(0)
    const size = page.viewportSize()
    const columns = await page.getByTestId('appearance-style').locator('.theme-picker__grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    expect(columns).toBe((size?.width ?? 0) <= 640 ? 2 : 3)
    await snapshot(page, testInfo, 'fit')
  })

  test('Escape closes the sheet and focus returns to the File button; the backdrop and × close it too', async ({ page }) => {
    await openApp(page)
    await openAppearance(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('appearance-sheet')).toHaveCount(0)
    await expect(page.getByTestId('file-menu-button')).toBeFocused()

    await openAppearance(page)
    await page.getByTestId('appearance-close').click()
    await expect(page.getByTestId('appearance-sheet')).toHaveCount(0)

    await openAppearance(page)
    await page.getByTestId('appearance-sheet-backdrop').click({ position: { x: 2, y: 2 } })
    await expect(page.getByTestId('appearance-sheet')).toHaveCount(0)
  })

  test('opening it leaves the selection alone', async ({ page }) => {
    await openApp(page)
    await openAppearance(page)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  })
})

test.describe('the picker in Help', () => {
  test('still works when the Help page cannot be fetched', async ({ page }) => {
    await page.route('**/help/**', (route) => route.abort())
    await openApp(page)
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-help').click()
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await expect(page.getByTestId('help-error')).toBeVisible()
    await expect(page.getByTestId('help-theme-light')).toBeVisible()
    await choose(page, 'light', 'help')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await choose(page, 'pixel', 'help')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'pixel')
  })
})

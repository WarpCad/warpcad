// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { installNativeShell } from './fixtures/nativeShell.js'

/**
 * `TODO/ui-113`: the user chooses System, Dark or Light in the Help sheet's footer, the whole app
 * repaints at once (panels and the 3D view), and the choice is remembered. Against the real app at `/`.
 *
 * Both a panel pixel (read from a real screenshot, so it is what the user sees) and a canvas
 * background pixel (read from the WebGL canvas) are sampled, because the two are painted by
 * different code: CSS tokens for the panel, `useTheme`'s resolved value for the scene.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three viewports with a snapshot at each, on all three engines: it reads WebGL canvas pixels
 * and persists a preference, and the control must be tappable at phone width.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'theme-switch')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** @param {import('@playwright/test').Page} page */
async function openApp(page) {
  await page.goto('/')
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-webgl', 'ready')
  await expect.poll(async () => Number(await viewport.getAttribute('data-frames-rendered'))).toBeGreaterThan(1)
}

/** @param {import('@playwright/test').Page} page */
async function openHelp(page) {
  // A reload keeps the sheet open: the Help deep link lives in the URL hash.
  if (!(await page.getByTestId('help-sheet').isVisible())) {
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-help').click()
  }
  await expect(page.getByTestId('help-sheet')).toBeVisible()
  await expect(page.getByTestId('help-theme')).toBeAttached()
}

/**
 * Pick a segment in the Help footer.
 * @param {import('@playwright/test').Page} page
 * @param {'system' | 'dark' | 'light' | 'kids' | 'minimal' | 'deco' | 'blueprint'} choice
 */
async function choose(page, choice) {
  const button = page.getByTestId(`help-theme-${choice}`)
  await button.scrollIntoViewIfNeeded()
  // Help re-renders its footer while the page settles; under load a click can land on the element
  // being replaced, so repeat it until the segment shows as pressed.
  await expect(async () => {
    await button.click({ timeout: 2000 })
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
  }).toPass({ timeout: 15000 })
}

/**
 * Luminance 0-255 of a screenshot clip, decoded in the page so no image library is needed.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
async function panelLuma(page) {
  const box = await page.getByTestId('help-sheet').boundingBox()
  if (!box) throw new Error('help sheet has no box')
  const png = await page.screenshot({ clip: { x: box.x + 4, y: box.y + box.height / 2, width: 2, height: 2 } })
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
 * Luminance of the canvas' top-left corner, which is the scene background.
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
 * Assert both pixels are on one side, polling because the canvas redraws on the next frame.
 * @param {import('@playwright/test').Page} page
 * @param {'dark' | 'light'} side
 */
async function expectPainted(page, side) {
  const test = side === 'light' ? (/** @type {number} */ v) => v > 150 : (/** @type {number} */ v) => v < 90
  await expect.poll(async () => test(await panelLuma(page)), { message: `panel is ${side}` }).toBe(true)
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

test.describe('theme switch on a dark system', () => {
  test.use({ colorScheme: 'dark' })

  test('Light repaints panels and the 3D view, sticks across a reload, and System goes back', async ({ page }, testInfo) => {
    await openApp(page)
    await openHelp(page)
    await expect(page.getByTestId('help-theme-system')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expectPainted(page, 'dark')
    await snapshot(page, testInfo, 'system-dark')

    await choose(page, 'light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expectPainted(page, 'light')
    await snapshot(page, testInfo, 'forced-light')

    await page.reload()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await openHelp(page)
    await expect(page.getByTestId('help-theme-light')).toHaveAttribute('aria-pressed', 'true')
    await expectPainted(page, 'light')

    await choose(page, 'system')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expectPainted(page, 'dark')
    await snapshot(page, testInfo, 'system-again')
  })
})

test.describe('theme switch on a light system', () => {
  test.use({ colorScheme: 'light' })

  test('Dark overrides the system, and the system flipping does not move it', async ({ page }, testInfo) => {
    await openApp(page)
    await openHelp(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expectPainted(page, 'light')

    await choose(page, 'dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expectPainted(page, 'dark')
    await snapshot(page, testInfo, 'forced-dark')

    await page.emulateMedia({ colorScheme: 'dark' })
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expectPainted(page, 'dark')
  })
})

/**
 * `TODO/ui-121`: inside the native shell the theme is told to the shell as `system`, `light` or `dark`
 * (a style as its scheme), so the iOS status bar follows the app. The fake shell records each call.
 * On the web nothing is sent (see `useTheme.spec.js`).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
const themeCalls = (page) =>
  page.evaluate(() => /** @type {any} */ (window).__nativeShell.calls.filter((/** @type {{ cmd: string }} */ c) => c.cmd === 'set_theme').map((/** @type {{ args: { theme: string } }} */ c) => c.args.theme))

test.describe('theme switch inside the native shell', () => {
  test.use({ colorScheme: 'dark' })

  test('the shell is told System, then each mode, and a light and a dark style by their scheme', async ({ page }, testInfo) => {
    await installNativeShell(page, { platform: 'ios' })
    await openApp(page)
    await expect.poll(() => themeCalls(page)).toEqual(['system'])
    await openHelp(page)

    await choose(page, 'light')
    await expect.poll(() => themeCalls(page)).toEqual(['system', 'light'])

    await choose(page, 'kids') // a light style: the scheme is unchanged, so nothing more is sent
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'kids')
    await choose(page, 'minimal')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'minimal')
    expect(await themeCalls(page)).toEqual(['system', 'light'])
    await snapshot(page, testInfo, 'native-light-style')

    await choose(page, 'blueprint') // a dark style
    await expect.poll(() => themeCalls(page)).toEqual(['system', 'light', 'dark'])
    await snapshot(page, testInfo, 'native-dark-style')

    await choose(page, 'system')
    await expect.poll(() => themeCalls(page)).toEqual(['system', 'light', 'dark', 'system'])
  })

  test('the web build sends nothing', async ({ page }) => {
    await openApp(page)
    await openHelp(page)
    await choose(page, 'light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => '__nativeShell' in window)).toBe(false)
  })
})

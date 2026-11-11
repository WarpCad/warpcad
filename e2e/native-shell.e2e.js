// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'

import { installNativeShell, nativeCalls } from './fixtures/nativeShell.js'
import { closeLibrary, openLibrary, pointer, sceneBodies, sleep, viewportPoint } from './support/humanInput.js'

/**
 * The app inside the native shell (`TODO/build-017`), driven against `/` with a fake Tauri bridge
 * (`e2e/fixtures/nativeShell.js`) standing in for the webview's `__TAURI_INTERNALS__`. Inside the
 * shell no service worker registers, Help's version line names the platform and the shell
 * version, and a box dragged out of the Library stays. The same page without the bridge is the
 * web app, whose version line and service worker are unchanged.
 *
 * The shell's own checks: Chromium, Firefox and WebKit, because the service-worker path differs by
 * engine; laptop only, since nothing about the layout changes. Help read from the network
 * (`TODO/ui-119`) has its own describe at the end, at every width. The service-worker checks need the production build (the
 * default `E2E_PREVIEW=1`); under `E2E_DEV=1` there is no worker either way, so they are skipped.
 *
 *     npx playwright test e2e/native-shell.e2e.js --project=chromium-laptop --project=firefox-laptop --project=webkit-laptop
 */

const PREVIEW = process.env.E2E_PREVIEW === '1'
const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
const RELEASE = pkg.version === '0.0.0' ? 'dev' : pkg.version
const COMMIT = '(?:[0-9a-f]{7}|dev)'
const escape = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The default config blocks workers for every other spec; this one checks whether one registers.
test.use({ serviceWorkers: 'allow' })


/** @param {import('@playwright/test').Page} page */
const registrations = (page) => page.evaluate(async () => ('serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0))

/** @param {import('@playwright/test').Page} page */
async function openHelp(page) {
  await page.getByTestId('file-menu-button').click()
  await page.getByTestId('file-help').click()
  await expect(page.getByTestId('help-sheet')).toBeVisible()
  await expect(page.getByTestId('help-version')).toBeVisible()
}

test.describe('the shell itself', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop viewport only: the shell changes no layout')

  test('inside the native shell: no service worker, Help names the iOS app, and a placed box stays', async ({ page }, info) => {
    await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')

    // Drag a Cube out of the Library, as a person would, and let go over the view.
    const input = await pointer(page, info)
    await openLibrary(page, input.press)
    const drop = await viewportPoint(page, 0.4, 0.5)
    await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), drop.x, drop.y)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    await closeLibrary(page, input.press)
    // It stays: still there after the scene has had time to settle.
    await sleep(1500)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    expect((await sceneBodies(page)).map((b) => b.op)).toEqual(['primitive.cuboid'])

    await openHelp(page)
    await expect(page.getByTestId('help-version')).toHaveText(new RegExp(`^WarpCad ${escape(RELEASE)} \\(${COMMIT}\\) · iOS app 1\\.13\\.0$`))
    expect(await nativeCalls(page)).toContain('shell_info')

    // Several seconds after load, with the app in use: the shell never registered a worker.
    if (PREVIEW) {
      expect(await registrations(page)).toBe(0)
      expect(await page.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull()
    }
  })

  test('the shell reports its own platform: a macOS shell reads `macOS app`', async ({ page }) => {
    await installNativeShell(page, { platform: 'macos', version: '0.2.0' })
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
    await openHelp(page)
    await expect(page.getByTestId('help-version')).toHaveText(new RegExp(` · macOS app 0\\.2\\.0$`))
  })

  test('without the shell, the web app is unchanged: `WarpCad build <commit>`, and its worker registers', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
    await openHelp(page)
    await expect(page.getByTestId('help-version')).toHaveText(new RegExp(`^WarpCad build ${COMMIT}$`))
    await expect(page.getByTestId('help-version')).not.toContainText(' app')

    // The control for the first test: on the same build, the web app does register its worker.
    if (PREVIEW) await expect.poll(() => registrations(page), { timeout: 30_000 }).toBeGreaterThan(0)
  })
})

/**
 * `TODO/ui-119`: the native app reads Help from app.warpcad.com and sanitises it. In this spec the
 * page is the web build, so Help comes from the same origin; the network is stubbed at `help/` to
 * stand in for app.warpcad.com (served, offline, another version, hostile markup). Every width, with
 * a snapshot at each. No WebGL: Chromium for the layout, plus WebKit, the engine that stands in for
 * WKWebView.
 *
 *     npx playwright test e2e/native-shell.e2e.js --project=chromium-phone --project=chromium-tablet --project=chromium-laptop --project=webkit-phone --project=webkit-tablet --project=webkit-laptop
 */
test.describe('Help in the native app (ui-119)', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Chromium for the layout, WebKit for WKWebView')

  const PAGE = '<h1 id="stubbed-help">Stubbed help</h1><p>Served by the test.</p><p>A bad picture<img src=x onerror="window.__helpPwned=1"></p>'

  /** Help's own files (the index, a page, a picture), not the dev server's `/src/help/*.js` modules. @param {URL} url */
  const isHelpFile = (url) => /\/help\/(?:index\.json|[\w-]+\.html|img\/.+)$/.test(url.pathname) && !url.pathname.includes('/src/')

  /** @param {import('@playwright/test').Page} page */
  const serveHelp = (page) =>
    page.route('**/help/*.html', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE }))

  /**
   * The Help index the server serves: the built file under the preview build (`dist-e2e`, what
   * `vite preview` serves byte for byte), one request before the page loads under `E2E_DEV=1`,
   * where the dev plugin renders it on request.
   *
   * @param {import('@playwright/test').APIRequestContext} request
   * @returns {Promise<Record<string, unknown>>}
   */
  async function realHelpIndex(request) {
    if (PREVIEW) return JSON.parse(readFileSync(join(process.cwd(), 'dist-e2e', 'help', 'index.json'), 'utf8'))
    const response = await request.get('/help/index.json')
    expect(response.ok()).toBe(true)
    return response.json()
  }

  /** Open the sheet through File ▾ → Help, the route that exists at every width. @param {import('@playwright/test').Page} page */
  async function openHelpSheet(page) {
    await page.getByTestId('file-menu-button').click()
    await page.getByTestId('file-help').click()
    await expect(page.getByTestId('help-sheet')).toBeVisible()
  }

  test.beforeEach(async ({ page }) => {
    await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
  })

  test('Help opens with a served page, and hostile markup in it is stripped', async ({ page }) => {
    await serveHelp(page)
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
    await openHelpSheet(page)
    const content = page.getByTestId('help-content')
    await expect(content).toContainText('Served by the test.')
    await expect(content.locator('[onerror]')).toHaveCount(0)
    await expect(content.locator('img')).toHaveCount(0)
    expect(await page.evaluate(() => /** @type {any} */ (window).__helpPwned)).toBeUndefined()
    await expect(page.getByTestId('help-version-skew')).toHaveCount(0)
    await expect(page.getByTestId('help-sheet')).toHaveScreenshot('native-help-served.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
      mask: [page.getByTestId('help-version')],
    })
  })

  test('offline, the sheet says Help needs a connection, and Retry loads it once back online', async ({ page }) => {
    await page.route(isHelpFile, (route) => route.abort('internetdisconnected'))
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
    await openHelpSheet(page)
    const error = page.getByTestId('help-error')
    await expect(error).toContainText('Help needs a connection. Everything else in WarpCad works offline.')
    await expect(page.getByTestId('help-retry')).toHaveText('Retry')
    await expect(page.getByTestId('help-sheet')).toHaveScreenshot('native-help-offline.png', { animations: 'disabled', maxDiffPixelRatio: 0.03 })

    // Back online: the same Retry button loads the page, and the Contents with it.
    await page.unroute(isHelpFile)
    await serveHelp(page)
    await page.getByTestId('help-retry').click()
    await expect(page.getByTestId('help-content')).toContainText('Served by the test.')
    await expect(error).toHaveCount(0)
  })

  test('the skew line names both versions when the fetched Help is for another WarpCad', async ({ page, request }) => {
    // The real index, read before the page loads and served from memory: no live `route.fetch()`
    // inside the app's index → page chain. Under the full matrix that one upstream GET has stalled
    // past the 5 s the content assertion below measures, leaving the sheet on Loading… (ui-119).
    // Fulfilling with `json` alone also lets Playwright size the body; a copied `response` keeps
    // the original `content-length`, which is right only while both versions have the same length.
    const json = { ...(await realHelpIndex(request)), version: '99.0.0' }
    await serveHelp(page)
    await page.route('**/help/index.json', (route) => route.fulfill({ json }))
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toBeVisible()
    await openHelpSheet(page)
    await expect(page.getByTestId('help-content')).toContainText('Served by the test.')
    await expect(page.getByTestId('help-version-skew')).toHaveText(`This help is for WarpCad 99.0.0; this app is ${pkg.version}.`)
    await expect(page.getByTestId('help-sheet')).toHaveScreenshot('native-help-skew.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
      mask: [page.getByTestId('help-version')],
    })
  })
})

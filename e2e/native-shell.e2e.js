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
 * Chromium, Firefox and WebKit, because the service-worker path differs by engine. Laptop only:
 * nothing about the layout changes. The service-worker checks need the production build (the
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

test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop viewport only: the shell changes no layout')

/** @param {import('@playwright/test').Page} page */
const registrations = (page) => page.evaluate(async () => ('serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0))

/** @param {import('@playwright/test').Page} page */
async function openHelp(page) {
  await page.getByTestId('file-menu-button').click()
  await page.getByTestId('file-help').click()
  await expect(page.getByTestId('help-sheet')).toBeVisible()
  await expect(page.getByTestId('help-version')).toBeVisible()
}

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

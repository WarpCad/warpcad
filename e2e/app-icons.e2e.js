// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The tab icon and the install icons (PUBLISH-CHECKLIST.md, "PWA icons and favicon"). Chromium
 * will not offer *Install* without 192 px and 512 px manifest icons, and a missing tab icon is a
 * 404 on every page load, so both are checked against what the running app actually serves —
 * not against `public/`, which a broken `BASE_PATH` rewrite would still pass.
 *
 * All the files are rendered from `public/favicon.svg` by `npm run icons`
 * (`scripts/app-icons.mjs`, whose own spec covers the manifest list and the `.ico` encoder).
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * Chromium at all three viewports (`TODO/build-006`), because the install prompt is Chromium's.
 * The head links also run on WebKit, because Safari and iOS are what read the
 * `apple-touch-icon`. No layout, WebGL, canvas, touch or persistence is involved, so Firefox
 * adds nothing and there is no snapshot. The manifest test runs only against the production
 * build (`E2E_PREVIEW=1`), because vite-plugin-pwa emits the manifest at build time and the dev
 * server has none.
 */

/** @param {import('@playwright/test').TestInfo} testInfo @param {string[]} engines */
const onlyOn = (testInfo, engines) =>
  test.skip(!engines.some((engine) => testInfo.project.name.startsWith(`${engine}-`)), `runs on ${engines.join(' and ')} only`)

/**
 * The pixel size a PNG declares in its IHDR chunk.
 *
 * @param {Buffer} png
 * @returns {[number, number]}
 */
const pngSize = (png) => [png.readUInt32BE(16), png.readUInt32BE(20)]

test('the page links a tab icon, an SVG icon and an apple-touch-icon, and each one is served', async ({ page, request }, testInfo) => {
  onlyOn(testInfo, ['chromium', 'webkit'])
  await page.goto('/')
  const links = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((els) => els.map((el) => ({ rel: el.getAttribute('rel'), href: /** @type {HTMLLinkElement} */ (el).href })))
  expect(links.map((l) => l.href.split('/').pop())).toEqual(['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'])

  for (const { href } of links) {
    const response = await request.get(href)
    expect(response.status(), href).toBe(200)
    expect(response.headers()['content-type'], href).toMatch(/^image\//)
  }
  const apple = await request.get(links[2].href)
  expect(pngSize(await apple.body())).toEqual([180, 180])
})

test('the install manifest lists 192 px, 512 px and maskable icons at their real sizes', async ({ page, request }, testInfo) => {
  onlyOn(testInfo, ['chromium'])
  test.skip(process.env.E2E_PREVIEW !== '1', 'the manifest exists only in the production build')
  await page.goto('/')
  const manifestUrl = await page.locator('link[rel="manifest"]').evaluate((el) => /** @type {HTMLLinkElement} */ (el).href)
  const manifest = await (await request.get(manifestUrl)).json()
  // The install splash and title bar paint the colour index.html paints before any CSS loads
  // (dark `--surface-0`). Read from that inline style, not computed: once tokens.css loads, a
  // light-scheme browser repaints the page light, but the splash is fixed at install time.
  const firstPaint = await page.locator('head style').first().textContent()
  expect(firstPaint).toMatch(/background:\s*#10131a/) // the build minifies away the space
  expect([manifest.theme_color, manifest.background_color]).toEqual(['#10131a', '#10131a'])

  const purposes = manifest.icons.map((/** @type {any} */ icon) => `${icon.sizes} ${icon.purpose ?? 'any'}`)
  expect(purposes).toEqual(['192x192 any', '512x512 any', '512x512 maskable'])

  for (const icon of manifest.icons) {
    const response = await request.get(new URL(icon.src, manifestUrl).href)
    expect(response.status(), icon.src).toBe(200)
    const [w, h] = pngSize(await response.body())
    expect(`${w}x${h}`, icon.src).toBe(icon.sizes)
  }
})

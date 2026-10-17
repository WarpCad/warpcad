// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * `TODO/build-007`: tests never send a hit. Every Google Analytics and Tag Manager host is
 * blocked at the context, and the app — which gates analytics off for an automated browser
 * (`navigator.webdriver`), localhost and plain http — must still load, show the Library, and never
 * even *attempt* one of those requests, with or without a measurement id in the build
 * (`GA_MEASUREMENT_ID=G-TEST000000 E2E_PREVIEW=1`).
 *
 * Chromium-class behaviour only is under test (a plain script, no WebGL or persistence), but the
 * spec is viewport-agnostic and cheap, so it runs in the standard matrix with no snapshot.
 */
const GOOGLE = /^https?:\/\/([a-z0-9-]+\.)*(googletagmanager|google-analytics|analytics\.google|doubleclick)\.(com|net)\//

test('the app loads and never attempts a Google Analytics request', async ({ page }) => {
  const attempted = []
  await page.context().route(GOOGLE, (route) => {
    attempted.push(route.request().url())
    return route.abort()
  })
  page.on('request', (request) => {
    if (GOOGLE.test(request.url())) attempted.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  // Give a (wrongly) scheduled load handler time to fire.
  await page.waitForLoadState('load')
  await page.waitForTimeout(500)
  expect(attempted).toEqual([])
  expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(0)
  expect(await page.evaluate(() => ({ layer: 'dataLayer' in window, gtag: 'gtag' in window }))).toEqual({ layer: false, gtag: false })
})

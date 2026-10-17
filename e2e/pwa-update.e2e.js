// SPDX-License-Identifier: AGPL-3.0-or-later
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * A reload picks up a new deploy, and an open tab is told (`TODO/build-005`), driven against `/`
 * of the **production build** (`E2E_PREVIEW=1`; `vite dev` has no service worker):
 *
 *     E2E_PREVIEW=1 npx playwright test e2e/pwa-update.e2e.js
 *
 * Two deploys are simulated by serving a copy of `dist` ("build A") and then switching the same
 * server to a patched copy ("build B": a new `<meta name="version">`, a new precache revision for
 * `index.html`, a changed `sw.js`), exactly what a GitHub Pages deploy changes. `sw.js` is served
 * with Pages' `Cache-Control: max-age=600`, so `registration.update()` bypassing the HTTP cache is
 * part of what is proven.
 *
 * **All nine projects.** Service-worker lifecycle differs per engine and WebKit's Playwright
 * build is configured to block workers in the other specs; this one turns them back on. What
 * the engines can and cannot exercise is recorded in `docs/decisions/hosting.md` "Update path".
 */

const PREVIEW = process.env.E2E_PREVIEW === '1'
const BUILD_A = 'A-0.0.0+aaaaaaa'
const BUILD_B = 'B-9.9.9+bbbbbbb'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.gif': 'image/gif',
}

/**
 * Copy `dist` to `dir`, stamped as one build. Build B also gets a new precache revision for
 * `index.html` and a changed worker body, so the browser sees a different `sw.js`.
 *
 * @param {string} dir
 * @param {string} build `BUILD_A` or `BUILD_B`
 */
function stampedCopy(dir, build) {
  cpSync(join(process.cwd(), 'dist'), dir, { recursive: true })
  const indexPath = join(dir, 'index.html')
  const html = readFileSync(indexPath, 'utf8')
  expect(html).toMatch(/<meta name="version" content="[^"]*">/)
  writeFileSync(indexPath, html.replace(/(<meta name="version" content=")[^"]*(">)/, `$1${build}$2`))
  const swPath = join(dir, 'sw.js')
  const sw = readFileSync(swPath, 'utf8')
  const revision = /url:"index\.html",revision:"[^"]*"/
  expect(sw).toMatch(revision)
  const hash = build === BUILD_A ? 'a'.repeat(32) : 'b'.repeat(32)
  writeFileSync(swPath, `${sw.replace(revision, `url:"index.html",revision:"${hash}"`)}\n// ${build}\n`)
}

/**
 * A static server whose served build can be switched, like a deploy to Pages.
 *
 * @param {{ a: string, b: string }} roots
 * @returns {Promise<{ url: string, deployB: () => void, close: () => Promise<void> }>}
 */
async function serveDeploys(roots) {
  let root = roots.a
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0])
    const file = join(root, normalize(path === '/' ? '/index.html' : path))
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': file.endsWith('sw.js') ? 'max-age=600' : 'no-cache',
    })
    res.end(readFileSync(file))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const address = /** @type {import('node:net').AddressInfo} */ (server.address())
  return {
    url: `http://localhost:${address.port}/`,
    deployB: () => {
      root = roots.b
    },
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  }
}

/** @param {import('@playwright/test').Page} page */
const buildOf = (page) => page.evaluate(() => document.querySelector('meta[name="version"]')?.getAttribute('content'))

/** @param {import('@playwright/test').Page} page */
async function waitForWorker(page) {
  await expect(page.getByTestId('viewport')).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 60_000 })
    .toBe(true)
}

/** @param {import('@playwright/test').Page} page */
async function openHelp(page) {
  await page.getByTestId('file-menu-button').click()
  await page.getByTestId('file-help').click()
  await expect(page.getByTestId('help-sheet')).toBeVisible()
}

/**
 * Press **Check for updates** like a person would, again after a few seconds if nothing has
 * appeared yet, until the banner shows. Closes Help afterwards.
 *
 * @param {import('@playwright/test').Page} page
 */
async function checkUntilToast(page) {
  await openHelp(page)
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.getByTestId('pwa-check-update').click()
    try {
      await expect(page.getByTestId('pwa-update-toast')).toBeVisible({
        timeout: 8000,
      })
      break
    } catch {
      // The new worker is still installing; ask again.
    }
  }
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('pwa-update-toast')).toBeVisible()
}

/** Drag a Cube in from the Library with pointer events (mouse and touch alike). @param {import('@playwright/test').Page} page */
async function placeCube(page) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="library-row-primitive.cuboid"]')
    const view = document.querySelector('[data-testid="viewport"]')
    if (!row || !view) throw new Error('missing library row or viewport')
    const from = row.getBoundingClientRect()
    const to = view.getBoundingClientRect()
    const [sx, sy] = [from.left + from.width / 2, from.top + from.height / 2]
    const [ex, ey] = [to.left + to.width * 0.5, to.top + to.height * 0.25]
    const fire = (
      /** @type {EventTarget} */ target,
      /** @type {string} */ type,
      /** @type {number} */ x,
      /** @type {number} */ y,
    ) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 43,
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
    fire(row, 'pointerdown', sx, sy)
    for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', sx + (ex - sx) * t, sy + (ey - sy) * t)
    fire(window, 'pointerup', ex, ey)
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  // The autosave has landed, so a reload cannot beat it.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })
}

test.describe('App update (production build, two deploys)', () => {
  test.skip(!PREVIEW, 'the service worker exists only in the production build — run with E2E_PREVIEW=1')
  // WebKit is configured to block workers under E2E_PREVIEW for the other specs; this one needs them.
  test.use({ serviceWorkers: 'allow' })
  test.setTimeout(180_000)

  /** @type {string} */
  let work
  /** @type {Awaited<ReturnType<typeof serveDeploys>>} */
  let site

  test.beforeEach(async () => {
    work = mkdtempSync(join(tmpdir(), 'warpcad-deploys-'))
    stampedCopy(join(work, 'a'), BUILD_A)
    stampedCopy(join(work, 'b'), BUILD_B)
    site = await serveDeploys({ a: join(work, 'a'), b: join(work, 'b') })
  })

  test.afterEach(async () => {
    await site.close()
    rmSync(work, { recursive: true, force: true })
  })

  test('an open tab is told, Reload applies it, the project is intact, Help shows the new build', async ({ page }) => {
    await page.goto(site.url)
    await waitForWorker(page)
    expect(await buildOf(page)).toBe(BUILD_A)
    await placeCube(page)
    await page.evaluate(() => {
      ;/** @type {any} */ (window).__stillTheSamePage = true
    })

    site.deployB()
    await checkUntilToast(page)

    // Told, never reloaded under the user: the page is the same document, still on build A.
    await expect(page.getByTestId('pwa-update-toast')).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByTestId('pwa-update-toast')).toContainText('A new version of WarpCad is available.')
    expect(await page.evaluate(() => /** @type {any} */ (window).__stillTheSamePage === true)).toBe(true)
    expect(await buildOf(page)).toBe(BUILD_A)

    // The toast sits in flow below the viewport: it never covers the viewport's own chrome.
    const toast = await page.getByTestId('pwa-update-toast').boundingBox()
    const view = await page.getByTestId('viewport').boundingBox()
    expect(toast && view && toast.y >= view.y + view.height - 1).toBe(true)
    const reload = await page.getByTestId('pwa-update-reload').boundingBox()
    expect(reload?.height ?? 0).toBeGreaterThanOrEqual(44)

    // Help's Check for updates answered, too.
    await openHelp(page)
    await expect(page.getByTestId('pwa-check-message')).toHaveText(
      /Update found, reload to apply|You are on the latest version/,
      {
        timeout: 30_000,
      },
    )
    await page.keyboard.press('Escape')

    await page.getByTestId('pwa-update-reload').click()
    await expect.poll(() => buildOf(page), { timeout: 30_000 }).toBe(BUILD_B)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    await expect(page.getByTestId('pwa-update-toast')).toBeHidden()
    await openHelp(page)
    await expect(page.getByTestId('help-version')).toContainText('WarpCad')
  })

  test('a plain reload or two is enough: no banner, no clearing site data', async ({ page }) => {
    await page.goto(site.url)
    await waitForWorker(page)
    expect(await buildOf(page)).toBe(BUILD_A)
    site.deployB()
    let build = BUILD_A
    for (let reloads = 0; reloads < 3 && build !== BUILD_B; reloads++) {
      // Give the new worker time to install between reloads, as a person would.
      await page.waitForTimeout(2000)
      await page.reload()
      await expect(page.getByTestId('viewport')).toBeVisible()
      build = (await buildOf(page)) ?? ''
    }
    expect(build).toBe(BUILD_B)
  })

  test('Reload asks first while a drag is in progress; Later hides the banner', async ({ page }) => {
    await page.goto(site.url)
    await waitForWorker(page)
    site.deployB()
    await checkUntilToast(page)

    // A Library drag is in progress (pointer down and moved, not yet released).
    if (!(await page.getByTestId('library-rows').isVisible())) {
      await page.getByTestId('library-tab').click()
      await expect(page.getByTestId('library-rows')).toBeVisible()
    }
    await page.evaluate(() => {
      const row = document.querySelector('[data-testid="library-row-primitive.cuboid"]')
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error('missing library row or viewport')
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const opts = {
        pointerId: 44,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      }
      row.dispatchEvent(
        new PointerEvent('pointerdown', {
          ...opts,
          clientX: from.left + 5,
          clientY: from.top + 5,
        }),
      )
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          ...opts,
          clientX: to.left + to.width / 2,
          clientY: to.top + to.height / 2,
        }),
      )
    })
    await page.getByTestId('pwa-update-reload').dispatchEvent('click')
    await expect(page.getByTestId('pwa-update-confirm-text')).toContainText('Reload anyway?')
    expect(await buildOf(page)).toBe(BUILD_A)
    await page.getByTestId('pwa-update-later').click()
    await expect(page.getByTestId('pwa-update-toast')).toBeHidden()
  })

  test('Help still opens with the network off after the update (ui-061 repro)', async ({
    page,
    context,
    browserName,
  }) => {
    await page.goto(site.url)
    await waitForWorker(page)
    const precached = await page.evaluate(async () => {
      const urls = ['/help/index.json', '/help/getting-started.html', '/help/img/screenshots/tour-step-1-place.png']
      return Promise.all(urls.map(async (url) => (await caches.match(url, { ignoreSearch: true })) !== undefined))
    })
    expect(precached).toEqual([true, true, true])
    if (browserName === 'webkit') {
      // Playwright's WebKit takes the network offline beneath the service worker (see help.e2e.js).
      test.info().annotations.push({
        type: 'limitation',
        description: 'WebKit: offline reload cannot be exercised; precache asserted',
      })
      return
    }
    await context.setOffline(true)
    try {
      await page.reload()
      await expect(page.getByTestId('viewport')).toBeVisible()
      await openHelp(page)
      await expect(page.getByTestId('help-content')).toContainText('Subtract')
    } finally {
      await context.setOffline(false)
    }
  })
})

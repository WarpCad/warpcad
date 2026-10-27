// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { closeLibrary, isPhone, openLibrary, pointer, sleep, usesTrustedTouch, viewportPoint } from './support/humanInput.js'

/**
 * **Share a project by link** (`TODO/io-016`, Stage 2), driven against `/` — the real root view,
 * the real Share button and sheet, and a cold open of `/#/share/v1/…` in a **fresh browser
 * context** (no IndexedDB, no service worker), the way a link from a text message opens.
 *
 * This spec is also the **cold-link contract**: once a share link is in someone's Messages it is
 * a public URL, like `testing-012`'s `#/help/<slug>`, and it must mount at boot. `perf-003`
 * (deferring code not used at boot) is directly at risk of breaking it, and points here.
 *
 * The five cases the task names:
 *   1. build a cube and a sphere, **Share → Copy link**, open the link in a fresh context: both
 *      bodies are in the Shared view and the editor chrome is absent;
 *   2. **Make my own copy to edit**: the editor holds both, and editing works;
 *   3. a context that already has a saved session: opening a link leaves the autosave record
 *      byte-identical, and the copy button asks the existing **Replace the project?** question;
 *   4. a truncated link shows the "looks incomplete" screen, not the editor;
 *   5. a link for the project already open offers **Merge their changes**, not Replace.
 * Plus: the empty-scene precondition, `#/help/<slug>` and `#/share/…` coexisting, a touch orbit in
 * the Shared view (`ui-072`'s re-run) and no horizontal scroll at any width.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support / Responsive Layout)
 *
 * **All three engines and all three viewports**: it touches IndexedDB, WebGL, touch input and
 * `CompressionStream`, and WebKit is where an iPhone receiving the link lives. A snapshot of the
 * Share sheet and of the Shared view is written at each project
 * (`test-results/share-link-snapshots/`) for a person to look at — a pixel baseline of a WebGL
 * scene is not stable across engines, so the layout claims are measured instead.
 *
 * The clipboard and `navigator.share` are mocked at the boundary (`CLAUDE.md`): the page's
 * `writeText` records what it was given, and `navigator.share` is removed, so **Copy link** is
 * the route in every engine, except in the one test that stubs Send….
 *
 * Driven by hand (not here): `TODO/ACCEPTANCE.md` scenario 29, on a real iPhone receiving the
 * link in Messages.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'share-link-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** The clipboard and the OS share sheet, at the boundary. */
const MOCK_BOUNDARY = () => {
  /** @type {any} */ (window).__copied = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (/** @type {string} */ text) => /** @type {any} */ (window).__copied.push(text) },
  })
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined })
}

/** Drop points: on a phone the Library sheet covers the lower half and the toolbar the top-left. */
const DROPS = (/** @type {import('@playwright/test').TestInfo} */ info) =>
  isPhone(info) ? { a: [0.3, 0.22], b: [0.7, 0.2], c: [0.5, 0.26] } : { a: [0.3, 0.45], b: [0.62, 0.38], c: [0.48, 0.62] }

/** @param {import('@playwright/test').Page} page @param {number} count */
const expectBodyCount = (page, count) => expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))

/** @param {import('@playwright/test').Page} page */
async function openApp(page, path = '/') {
  await page.addInitScript(MOCK_BOUNDARY)
  await page.goto(path)
}

/** @param {import('@playwright/test').Page} page */
async function editorReady(page) {
  await expect(page.getByTestId('app-header')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
}

/**
 * A fresh browser context — its own IndexedDB, no service worker — at the same size as the test's.
 *
 * @param {import('@playwright/test').Browser} browser
 * @param {import('@playwright/test').TestInfo} info
 * @param {string | undefined} baseURL
 */
async function freshContext(browser, info, baseURL) {
  return browser.newContext({
    baseURL,
    viewport: info.project.use.viewport,
    hasTouch: info.project.use.hasTouch,
    serviceWorkers: 'block',
  })
}

/**
 * Place a Cube and a Sphere by dragging them out of the Library, at human pace.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Awaited<ReturnType<typeof pointer>>} input
 * @param {import('@playwright/test').TestInfo} info
 * @param {string[]} [ops]
 */
async function placeShapes(page, input, info, ops = ['primitive.cuboid', 'primitive.sphere']) {
  const drops = DROPS(info)
  const at = [drops.a, drops.b, drops.c]
  const before = Number(await page.getByTestId('viewport').getAttribute('data-body-count'))
  await openLibrary(page, input.press)
  for (const [index, op] of ops.entries()) {
    const p = await viewportPoint(page, at[index][0], at[index][1])
    await input.dragRow(page.getByTestId(`library-row-${op}`), p.x, p.y)
  }
  await expectBodyCount(page, before + ops.length)
  await closeLibrary(page, input.press)
}

/**
 * **Share → Copy link**, and the link's hash (`#/share/v1/…`) from what reached the clipboard.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Awaited<ReturnType<typeof pointer>>} input
 */
async function copyLink(page, input) {
  await openShareSheet(page, input)
  await expect(page.getByTestId('share-copy')).toBeEnabled()
  await expect(page.getByTestId('share-send')).toHaveCount(0)
  await expect(page.getByTestId('share-disclosure')).toHaveText(
    "Anyone with this link can open and copy this project, including its notes. It can't be taken back.",
  )
  await input.press(page.getByTestId('share-copy'))
  await expect(page.getByTestId('share-toast')).toHaveText(/^Link copied, \d+\.\d KB$/)
  await expect(page.getByTestId('share-sheet')).toHaveCount(0)
  const copied = await page.evaluate(() => /** @type {any} */ (window).__copied.at(-1))
  expect(copied).toMatch(/^Here's a model I made in WarpCad: .+\nhttps:\/\/app\.warpcad\.com\/#\/share\/v1\/[A-Za-z0-9_-]+$/)
  return /** @type {string} */ (copied).slice(copied.indexOf('#'))
}

/** The stored autosave record, read straight from IndexedDB (`src/storage/indexeddb.js`). @param {import('@playwright/test').Page} page */
const readAutosave = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('warpcad')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('projects')) return resolve(null)
          const get = db.transaction('projects', 'readonly').objectStore('projects').get('autosave')
          get.onsuccess = () => {
            resolve(get.result ?? null)
            db.close()
          }
          get.onerror = () => reject(get.error)
        }
      }),
  )

/** No page-level horizontal scroll at this width (`CLAUDE.md`, Responsive Layout). @param {import('@playwright/test').Page} page */
async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

/**
 * The header row itself fits: the page not scrolling is not enough, because the bar clips (Firefox
 * also counts the bar's end padding), and a clipped Assistant button is just as unreachable.
 *
 * @param {import('@playwright/test').Page} page
 */
async function expectHeaderFits(page) {
  const bar = await page.getByTestId('app-header').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
  expect(bar.scroll, 'the header row is wider than the header').toBeLessThanOrEqual(bar.client)
  const width = /** @type {{ width: number }} */ (page.viewportSize()).width
  for (const id of ['assistant-button', 'file-menu-button']) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box && box.x + box.width, `${id} is pushed off the row`).toBeLessThanOrEqual(width)
  }
}

/**
 * Open the Share sheet: the header's Share button, or **File ▾ → Share…** where the button is not
 * in the row (the dev host's phone header, which its Live MCP entry fills).
 *
 * @param {import('@playwright/test').Page} page
 * @param {Awaited<ReturnType<typeof pointer>>} input
 */
async function openShareSheet(page, input) {
  const button = page.getByTestId('share-open')
  if (await button.isVisible()) {
    await input.press(button)
  } else {
    await input.press(page.getByTestId('file-menu-button'))
    await input.press(page.getByTestId('file-share'))
  }
  await expect(page.getByTestId('share-sheet')).toBeVisible()
}

/** The editor's chrome — none of it may be in the Shared view. @param {import('@playwright/test').Page} page */
async function expectNoEditorChrome(page) {
  for (const testid of ['app-header', 'library-panel', 'inspector', 'timeline-panel', 'file-menu-button', 'share-open', 'operations-toolbar', 'assistant-button', 'transform-gizmo']) {
    await expect(page.getByTestId(testid), `${testid} is in the Shared view`).toHaveCount(0)
  }
}

/**
 * Drag across the canvas — trusted touch where the engine has it, a mouse otherwise.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} info
 */
async function dragCanvas(page, info) {
  const from = await viewportPoint(page, 0.4, 0.5)
  const to = await viewportPoint(page, 0.7, 0.55)
  if (usesTrustedTouch(info)) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
    for (let i = 1; i <= 12; i += 1) {
      const t = i / 12
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 }] })
      await sleep(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    for (let i = 1; i <= 12; i += 1) {
      await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12)
      await sleep(16)
    }
    await page.mouse.up()
  }
}

/**
 * A link made in the page by the app's own encoder, for a project with a cube and a sphere.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
function makeLinkHash(page, name) {
  return page.evaluate(async (title) => {
    const { createDocument } = await window.__e2eImport('/src/core/document.js')
    const { serializeProject } = await window.__e2eImport('/src/core/project.js')
    const { parseNdjson } = await window.__e2eImport('/src/core/ndjson.js')
    const { encodeShareLink } = await window.__e2eImport('/src/core/shareLink.js')
    const doc = createDocument()
    doc.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [-15, 0, 10] } }, { origin: 'local' })
    doc.append({ id: 'sphere-1', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 20, center: [15, 0, 10] } }, { origin: 'local' })
    const url = await encodeShareLink(parseNdjson(serializeProject(doc)).records, { name: title })
    return url.slice(url.indexOf('#'))
  }, name)
}

test.describe('share a project by link', () => {
  test('1. build a cube and a sphere, Copy link, open it cold: both bodies, no editor chrome', { tag: '@smoke' }, async ({ page, browser, baseURL }, info) => {
    await openApp(page)
    await editorReady(page)
    const input = await pointer(page, info)

    // Precondition: an empty scene has Share, dimmed, with the reason — beside it at laptop width,
    // in the sheet a tap opens below that (the header has no room for the words).
    const share = page.getByTestId('share-open')
    await expect(share).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('share-reason')).toHaveText('Nothing to share yet')
    if (info.project.name.endsWith('-laptop')) await expect(page.getByTestId('share-reason')).toBeVisible()
    if (await share.isVisible()) {
      await input.press(share)
      await expect(page.getByTestId('share-empty')).toBeVisible()
      await expect(page.getByTestId('share-copy')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('share-sheet')).toHaveCount(0)
    } else {
      // The dev host's phone header: File ▾ → Share…, dimmed with the same reason.
      await input.press(page.getByTestId('file-menu-button'))
      await expect(page.getByTestId('file-share-reason')).toHaveText('Nothing to share yet')
      await page.keyboard.press('Escape')
    }
    await expectHeaderFits(page)

    await placeShapes(page, input, info)
    await expect(share).not.toHaveAttribute('aria-disabled', 'true')
    await expectNoHorizontalScroll(page)
    await expectHeaderFits(page)

    // The sheet, then a snapshot of it, then Copy link.
    await openShareSheet(page, input)
    await expect(page.getByTestId('share-name')).toHaveValue('Untitled')
    await page.getByTestId('share-name').fill('Phone stand')
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-share-sheet.png`) })
    await page.keyboard.press('Escape')
    const hash = await copyLink(page, input)

    const context = await freshContext(browser, info, baseURL)
    try {
      const other = await context.newPage()
      await openApp(other, `/${hash}`)
      const view = other.getByTestId('shared-view')
      await expect(view).toHaveAttribute('data-state', 'ready')
      await expect(other.getByTestId('shared-title')).toHaveText('Phone stand')
      await expect(other.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
      await expectBodyCount(other, 2)
      const ops = await other.$$eval('[data-testid="scene-bodies"] li', (nodes) => nodes.map((n) => n.getAttribute('data-body-op')).sort())
      expect(ops).toEqual(['primitive.cuboid', 'primitive.sphere'])
      await expect(other.getByTestId('navigation-chrome')).toBeVisible()
      await expect(other.getByTestId('orientation-gizmo')).toBeVisible()
      await expect(other.getByTestId('shared-copy')).toBeVisible()
      await expect(other.getByTestId('shared-save-file')).toBeVisible()
      await expectNoEditorChrome(other)
      // The address bar no longer carries the project.
      expect(new URL(other.url()).hash).toBe('')
      await expectNoHorizontalScroll(other)

      // `ui-072` re-run: a drag turns the model; tapping a body selects nothing.
      const azimuth = await other.getByTestId('viewport').getAttribute('data-camera-azimuth')
      await dragCanvas(other, info)
      await expect(other.getByTestId('viewport')).not.toHaveAttribute('data-camera-azimuth', String(azimuth))
      const centre = await viewportPoint(other, 0.5, 0.5)
      await other.mouse.click(centre.x, centre.y)
      await expect(other.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
      // No selection box either: no Select mode, and a Ctrl-drag box selects nothing (it would be
      // judged against the hidden live document).
      await expect(other.getByTestId('nav-mode-select')).toHaveCount(0)
      const corner = await viewportPoint(other, 0.1, 0.15)
      const across = await viewportPoint(other, 0.9, 0.7)
      await other.keyboard.down('Control')
      await other.mouse.move(corner.x, corner.y)
      await other.mouse.down()
      await other.mouse.move(across.x, across.y, { steps: 8 })
      await other.mouse.up()
      await other.keyboard.up('Control')
      await expect(other.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')

      // The action is in the thumb zone at phone width, beside the title from 641px.
      const action = await other.getByTestId('shared-copy').boundingBox()
      const title = await other.getByTestId('shared-title').boundingBox()
      const size = other.viewportSize()
      if (!action || !title || !size) throw new Error('missing boxes')
      expect(action.height).toBeGreaterThanOrEqual(44)
      if (isPhone(info)) {
        expect(action.y).toBeGreaterThan(size.height * 0.75)
        expect(action.width).toBeGreaterThan(size.width - 40)
      } else {
        expect(action.y).toBeLessThan(title.y + title.height + 40)
      }
      await other.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-shared-view.png`) })
    } finally {
      await context.close()
    }
  })

  test('2. Make my own copy to edit: the editor holds both, and editing works', async ({ page, browser, baseURL }, info) => {
    await openApp(page)
    await editorReady(page)
    const hash = await makeLinkHash(page, 'Phone stand')
    const context = await freshContext(browser, info, baseURL)
    try {
      const other = await context.newPage()
      await openApp(other, `/${hash}`)
      await expect(other.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
      const input = await pointer(other, info)
      await input.press(other.getByTestId('shared-copy'))
      // A first-time visitor (empty IndexedDB) is asked nothing.
      await expect(other.getByTestId('file-open-confirm')).toHaveCount(0)
      await editorReady(other)
      await expectBodyCount(other, 2)
      await expect(other.getByTestId('shared-view')).toHaveCount(0)
      // Editing works: a third shape, and it autosaves.
      await placeShapes(other, input, info, ['primitive.cylinder'])
      await expect(other.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })
      const stored = /** @type {any} */ (await readAutosave(other))
      expect(stored?.text).toContain('primitive.cylinder')
      await expectNoHorizontalScroll(other)
      await expectHeaderFits(other)

      // `#/help/<slug>` and `#/share/…` coexist: a help link opens Help after a share was loaded…
      await other.evaluate(() => {
        window.location.hash = '#/help/save-load'
      })
      await expect(other.getByTestId('help-sheet')).toBeVisible()
      await other.getByTestId('help-close').click()
      await expect(other.getByTestId('help-sheet')).toHaveCount(0)
      // …and a share link pasted into the open tab opens the Shared view again.
      await other.evaluate((next) => {
        window.location.hash = next
      }, hash)
      await expect(other.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
      await expect(other.getByTestId('help-sheet')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  test('3. a saved session is untouched by opening a link, and the copy asks Replace the project?', async ({ page, browser, baseURL }, info) => {
    const context = await freshContext(browser, info, baseURL)
    try {
      const mine = await context.newPage()
      await openApp(mine)
      await editorReady(mine)
      const input = await pointer(mine, info)
      await placeShapes(mine, input, info, ['primitive.cylinder'])
      await expect(mine.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })
      const before = await readAutosave(mine)
      expect(before).not.toBeNull()
      const hash = await makeLinkHash(mine, 'Their project')
      await mine.close()

      const viewer = await context.newPage()
      await openApp(viewer, `/${hash}`)
      await expect(viewer.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
      // Longer than the autosave debounce, then everything that would flush: hidden, then back.
      await sleep(1200)
      await viewer.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
        window.dispatchEvent(new Event('pagehide'))
      })
      await sleep(400)
      expect(await readAutosave(viewer)).toEqual(before)

      // The hidden live session has a body: a Ctrl-drag box over the whole view still selects nothing.
      const corner = await viewportPoint(viewer, 0.05, 0.1)
      const across = await viewportPoint(viewer, 0.95, 0.75)
      await viewer.keyboard.down('Control')
      await viewer.mouse.move(corner.x, corner.y)
      await viewer.mouse.down()
      await viewer.mouse.move(across.x, across.y, { steps: 8 })
      await viewer.mouse.up()
      await viewer.keyboard.up('Control')
      await expect(viewer.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')

      const vinput = await pointer(viewer, info)
      await vinput.press(viewer.getByTestId('shared-copy'))
      const confirm = viewer.getByTestId('file-open-confirm')
      await expect(confirm).toBeVisible()
      await expect(confirm).toContainText('Replace the project?')
      await expect(viewer.getByTestId('file-open-confirm-save')).toBeVisible()
      await vinput.press(viewer.getByTestId('file-open-confirm-cancel'))
      await expect(viewer.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
      expect(await readAutosave(viewer)).toEqual(before)
    } finally {
      await context.close()
    }
  })

  test('4. a truncated link shows the "looks incomplete" screen, not the editor', async ({ page, browser, baseURL }, info) => {
    await openApp(page)
    await editorReady(page)
    const hash = await makeLinkHash(page, 'Phone stand')
    const truncated = hash.slice(0, Math.floor(hash.length * 0.6))
    const context = await freshContext(browser, info, baseURL)
    try {
      const other = await context.newPage()
      await openApp(other, `/${truncated}`)
      await expect(other.getByTestId('shared-incomplete')).toBeVisible()
      await expect(other.getByTestId('shared-incomplete')).toContainText('This link looks incomplete')
      await expect(other.getByTestId('viewport')).toHaveCount(0)
      await expect(other.getByTestId('app-header')).toHaveCount(0)
      await expectNoHorizontalScroll(other)
      const input = await pointer(other, info)
      await input.press(other.getByTestId('shared-start'))
      await editorReady(other)
      await expectBodyCount(other, 0)
      expect(new URL(other.url()).hash).toBe('')
    } finally {
      await context.close()
    }
  })

  test('5. a link for the project already open offers Merge their changes, not Replace', async ({ page }, info) => {
    await openApp(page)
    await editorReady(page)
    const input = await pointer(page, info)
    await placeShapes(page, input, info, ['primitive.cuboid'])
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })
    // The sender's newer copy of this same project: edited on another device (another replica,
    // the same project id) with a sphere added, then shared.
    const hash = await page.evaluate(async () => {
      const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
      const { createDocument } = await window.__e2eImport('/src/core/document.js')
      const { parseProject, serializeProject } = await window.__e2eImport('/src/core/project.js')
      const { parseNdjson } = await window.__e2eImport('/src/core/ndjson.js')
      const { encodeShareLink } = await window.__e2eImport('/src/core/shareLink.js')
      const parsed = parseProject(serializeProject(useDocumentStore().raw))
      const elsewhere = createDocument({ resolution: parsed.resolution })
      elsewhere.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, parsed.merge === undefined ? {} : { merge: parsed.merge })
      elsewhere.append({ id: 'their-sphere', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 20, center: [40, 0, 10] } }, { origin: 'local' })
      const url = await encodeShareLink(parseNdjson(serializeProject(elsewhere)).records, { name: 'Phone stand v2' })
      return url.slice(url.indexOf('#'))
    })
    await expectBodyCount(page, 1)

    // Opened in the tab that already has the project (a link pasted into the address bar).
    await page.evaluate((next) => {
      window.location.hash = next
    }, hash)
    await expect(page.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
    await expectBodyCount(page, 2)
    await input.press(page.getByTestId('shared-copy'))
    const confirm = page.getByTestId('file-open-confirm')
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('Merge their changes?')
    await expect(page.getByTestId('file-open-confirm-replace')).toHaveText('Open theirs instead')
    await expect(page.getByTestId('file-open-confirm-save')).toHaveCount(0)
    await input.press(page.getByTestId('file-open-confirm-merge'))
    await editorReady(page)
    await expectBodyCount(page, 2)
    await expect(page.getByTestId('merge-toast')).toBeVisible()
    await expect(page.getByTestId('merge-toast-text')).toContainText('Phone stand v2')
    await expect(page.getByTestId('merge-undo')).toBeVisible()
  })

  test('Send… hands the OS share sheet a message and the link; cancelling it says nothing', async ({ page }, info) => {
    await page.addInitScript(() => {
      /** @type {any} */ (window).__shared = []
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (/** @type {any} */ data) => {
          /** @type {any} */ (window).__shared.push(data)
          if (/** @type {any} */ (window).__cancelShare) throw new DOMException('cancelled', 'AbortError')
        },
      })
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    })
    await page.goto('/')
    await editorReady(page)
    const input = await pointer(page, info)
    await placeShapes(page, input, info, ['primitive.cuboid'])

    await page.evaluate(() => {
      /** @type {any} */ (window).__cancelShare = true
    })
    await openShareSheet(page, input)
    await page.getByTestId('share-name').fill('Phone stand')
    await expect(page.getByTestId('share-send')).toBeEnabled()
    await input.press(page.getByTestId('share-send'))
    await expect(page.getByTestId('share-problem')).toHaveCount(0)
    await expect(page.getByTestId('share-sheet')).toBeVisible()

    await page.evaluate(() => {
      /** @type {any} */ (window).__cancelShare = false
    })
    await input.press(page.getByTestId('share-send'))
    await expect(page.getByTestId('share-sheet')).toHaveCount(0)
    const shared = await page.evaluate(() => /** @type {any} */ (window).__shared.at(-1))
    expect(shared.title).toBe('Phone stand')
    expect(shared.text).toBe("Here's a model I made in WarpCad: Phone stand")
    expect(shared.url).toMatch(/^https:\/\/app\.warpcad\.com\/#\/share\/v1\//)
  })
})

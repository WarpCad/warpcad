// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fakeGitHub, projectFileOf, routeFakeGitHub, watchEscapes } from './support/fakeGistApi.js'
import { closeLibrary, isPhone, openLibrary, pointer, sleep, viewportPoint } from './support/humanInput.js'

/**
 * **Store and share a project as a GitHub gist** (`TODO/io-017`, Stage 2), driven against `/` —
 * the real root view, the real Share sheet, File menu and token dialog, and cold opens of
 * `/#/gist/<id>` in **fresh browser contexts**, the way a short link from a text message opens.
 *
 * GitHub is a **fake** (`e2e/support/fakeGistApi.js`), by route interception: no real network and
 * no real token. The tokens typed here are sentinels the fake knows.
 *
 * The cases the task names (its Testing section, E2E):
 *   1. connect a token, place a cube and a sphere, **Share → Publish to a gist**: the README the
 *      fake received names both bodies and carries the link, and the project file is
 *      byte-identical to a Download copy taken *before* publishing (one taken after carries
 *      `merge.gist`, which a file cannot know before the gist exists);
 *   2. the link opened in a fresh context: both bodies in the Shared view, no editor chrome;
 *   3. change the model, **Update gist**: the same id patched, and a reload of the link shows it;
 *   4. a context with a saved session opens a gist link: its autosave is byte-identical before and
 *      after (opening never writes) — read through the raw host, as a file over about 1 MB is;
 *   5. **Stop sharing** deletes it, and the link then shows the "can't be found" screen;
 *   6. rate-limited and deleted-gist responses show their plain messages;
 *   7. the owner opening their own link gets **Open it to edit**, not a read-only copy; someone
 *      else's **Make my own copy to edit** does not own the sender's gist;
 *   8. a project over the long link's ceiling shows the gist button as the way to share it;
 *  11. the owner on two devices (`TODO/io-019`): both update the same gist, and each **Update gist**
 *      merges the other's step in first (the merge toast, then *Gist updated*), so both contexts
 *      and the gist end with every body.
 * Plus: the hosted-repository and gist credentials never overwrite each other through the UI
 * (`io-002`'s closed findings, on the second key), and `#/gist/` coexisting with `#/help/<slug>`
 * (`M20-testing-012` has no spec yet, so the case lives here until it does).
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support / Responsive Layout)
 *
 * **All three engines and all three viewports**: IndexedDB (the credential store and autosave),
 * WebGL, touch input and `fetch` to GitHub, and WebKit is where an iPhone receiving the link
 * lives. The Share sheet's gist group is compared against a baseline at each project
 * (`toHaveScreenshot`, DOM only); the Shared view and the published sheet are written to
 * `test-results/gist-share-snapshots/` for a person to look at (a WebGL scene is not pixel-stable
 * across engines).
 *
 * The clipboard is mocked at the boundary: `write` (the `ClipboardItem` path the sheet uses so
 * Safari keeps the tap's activation across the network calls) and `writeText` both record.
 *
 * Driven by hand (not here): `TODO/ACCEPTANCE.md` scenario 30.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'gist-share-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** Sentinels, not credentials. Nothing in this repository has ever been a real token. */
const GIST_TOKEN = 'github_pat_E2E_SENTINEL_gist_not_a_real_token'
const OTHER_TOKEN = 'github_pat_E2E_SENTINEL_other_gist_account'
const REPO_TOKEN = 'github_pat_E2E_SENTINEL_repo_not_a_real_token'
const LOGIN = 'warpcad-tester'
const SECRET_DISCLOSURE =
  "A secret gist is not private: anyone with the link can read it, including this project's notes and instructions. Publishing sends the whole project to GitHub."
const BUSY = 'GitHub is busy. Try again in a few minutes.'
const NOT_FOUND = "This shared project can't be found. It may have been deleted, or the link may be wrong."

/** A fake whose tokens are the sentinels above. */
function newFake() {
  return fakeGitHub({
    tokens: {
      [GIST_TOKEN]: { login: LOGIN, kind: 'fine-grained', expiry: '2026-11-27 14:05:00 UTC' },
      [OTHER_TOKEN]: { login: 'someone-else', kind: 'fine-grained' },
      [REPO_TOKEN]: { login: LOGIN, kind: 'fine-grained' },
    },
    repo: { owner: 'warpcad-test', repo: 'parts' },
  })
}

/** The clipboard and the OS share sheet, at the boundary. */
const MOCK_BOUNDARY = () => {
  const copied = /** @type {string[]} */ ([])
  Object.defineProperty(window, '__copied', { configurable: true, value: copied })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (/** @type {string} */ text) => copied.push(text),
      write: async (/** @type {ClipboardItem[]} */ items) => {
        for (const item of items) {
          const blob = await item.getType('text/plain')
          copied.push(await blob.text())
        }
      },
    },
  })
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined })
}

/** Drop points: on a phone the Library sheet covers the lower half and the toolbar the top-left. */
const DROPS = (/** @type {import('@playwright/test').TestInfo} */ info) =>
  isPhone(info) ? { a: [0.3, 0.22], b: [0.7, 0.2], c: [0.5, 0.26] } : { a: [0.3, 0.45], b: [0.62, 0.38], c: [0.48, 0.62] }

/** @param {import('@playwright/test').Page} page @param {number} count */
const expectBodyCount = (page, count) => expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))

/**
 * @param {import('@playwright/test').Page} page
 * @param {ReturnType<typeof newFake>} fake
 */
async function openApp(page, fake, path = '/') {
  await routeFakeGitHub(page, fake)
  watchEscapes(page, fake)
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
function freshContext(browser, info, baseURL) {
  return browser.newContext({
    baseURL,
    viewport: info.project.use.viewport,
    hasTouch: info.project.use.hasTouch,
    serviceWorkers: 'block',
  })
}

/**
 * Tap a control that may be below the fold of a scrolling sheet or menu.
 *
 * @param {Awaited<ReturnType<typeof pointer>>} input
 * @param {import('@playwright/test').Locator} locator
 */
async function tap(input, locator) {
  await locator.scrollIntoViewIfNeeded()
  await input.press(locator)
}

/**
 * Place shapes by dragging them out of the Library, at human pace.
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
 * Open the Share sheet: the header's Share button, or **File ▾ → Share…** where it is not in the row.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Awaited<ReturnType<typeof pointer>>} input
 */
async function openShareSheet(page, input) {
  const button = page.getByTestId('share-open')
  // Retried as a whole: straight after the Library closes, under a loaded run, the first press can land
  // while the panel is still leaving and open nothing. A press that did open the sheet is never repeated.
  await expect(async () => {
    if (await page.getByTestId('share-sheet').isVisible()) return
    if (await button.isVisible()) {
      await input.press(button)
    } else {
      await input.press(page.getByTestId('file-menu-button'))
      await tap(input, page.getByTestId('file-share'))
    }
    await expect(page.getByTestId('share-sheet')).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 15_000 })
}

/** @param {import('@playwright/test').Page} page */
async function closeShareSheet(page) {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('share-sheet')).toHaveCount(0)
}

/**
 * Type a token into the open gist dialog and connect.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Awaited<ReturnType<typeof pointer>>} input
 * @param {string} token
 */
async function connectInDialog(page, input, token) {
  const dialog = page.getByTestId('gist-connect-dialog')
  await expect(dialog).toBeVisible()
  await page.getByTestId('gist-connect-token').fill(token)
  await tap(input, page.getByTestId('gist-connect-submit'))
  await expect(page.getByTestId('gist-connect-status')).toContainText(`Connected as ${LOGIN}`)
  // The token is never shown back, and the field is gone.
  await expect(page.getByTestId('gist-connect-token')).toHaveCount(0)
  expect(await page.content()).not.toContain(token)
  await tap(input, page.getByTestId('gist-connect-done'))
  await expect(dialog).toHaveCount(0)
}

/**
 * Open File ▾ (never toggling an open one shut). Playwright's `click`, not the human-pace press:
 * at laptop width the save-status text beside the button changes length as connections come and
 * go, which can move the button between the press's hit check and its click. The steps here are
 * about credentials, not gestures; the gestures are pressed by hand everywhere else.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Awaited<ReturnType<typeof pointer>>} _input
 */
async function openFileMenu(page, _input) {
  await expect(page.getByTestId('file-menu')).toHaveCount(0)
  await page.getByTestId('file-menu-button').click()
  await expect(page.getByTestId('file-menu')).toBeVisible()
}

/** Close whatever File ▾ owns that is on top, with Escape, and wait for it to go. @param {import('@playwright/test').Page} page @param {string} testid */
async function escapeFrom(page, testid) {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId(testid)).toHaveCount(0)
}

/**
 * **File ▾ → Connect GitHub for gists…**, then connect.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Awaited<ReturnType<typeof pointer>>} input
 */
async function connectFromMenu(page, input, token = GIST_TOKEN) {
  await openFileMenu(page, input)
  await expect(page.getByTestId('gist-connect-open')).toHaveText('Connect GitHub for gists…')
  await tap(input, page.getByTestId('gist-connect-open'))
  await connectInDialog(page, input, token)
}

/**
 * **Send the file** — the project file as Download copy writes it — read back as text.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Awaited<ReturnType<typeof pointer>>} input
 */
async function downloadCopy(page, input) {
  await openShareSheet(page, input)
  const waiting = page.waitForEvent('download')
  await tap(input, page.getByTestId('share-file'))
  const download = await waiting
  const path = await download.path()
  return readFileSync(/** @type {string} */ (path), 'utf8')
}

/** The stored autosave record, read straight from IndexedDB. @param {import('@playwright/test').Page} page */
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

/** No page-level horizontal scroll at this width. @param {import('@playwright/test').Page} page */
async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

/** The header row itself fits, with the Published chip in it. @param {import('@playwright/test').Page} page */
async function expectHeaderFits(page) {
  const bar = await page.getByTestId('app-header').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
  expect(bar.scroll, 'the header row is wider than the header').toBeLessThanOrEqual(bar.client)
  const width = /** @type {{ width: number }} */ (page.viewportSize()).width
  for (const id of ['assistant-button', 'file-menu-button']) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box && box.x + box.width, `${id} is pushed off the row`).toBeLessThanOrEqual(width)
  }
}

/** Every visible button and link in `scope` is at least 44px tall. @param {import('@playwright/test').Locator} scope */
async function expectTapTargets(scope) {
  const small = await scope.evaluate((root) =>
    Array.from(root.querySelectorAll('button, a, input[type="checkbox"]'))
      .map((el) => {
        const target = el.matches('input') ? /** @type {HTMLElement} */ (el.closest('label') ?? el) : el
        const box = target.getBoundingClientRect()
        return { id: el.getAttribute('data-testid') ?? el.textContent?.trim(), height: box.height, shown: box.width > 0 && box.height > 0 }
      })
      .filter((row) => row.shown && row.height < 44),
  )
  expect(small, 'tap targets under 44px').toEqual([])
}

/** The editor's chrome — none of it may be in the Shared view. @param {import('@playwright/test').Page} page */
async function expectNoEditorChrome(page) {
  for (const testid of ['app-header', 'library-panel', 'inspector', 'timeline-panel', 'file-menu-button', 'share-open', 'operations-toolbar', 'assistant-button', 'transform-gizmo']) {
    await expect(page.getByTestId(testid), `${testid} is in the Shared view`).toHaveCount(0)
  }
}

/** The open project's body names, from the document store. @param {import('@playwright/test').Page} page */
const bodyNames = (page) =>
  page.evaluate(async () => {
    const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
    return useDocumentStore().bodies.map((/** @type {{ name: string }} */ body) => body.name)
  })

/** The open project's gist field. @param {import('@playwright/test').Page} page */
const gistFieldOf = (page) =>
  page.evaluate(async () => {
    const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
    return useDocumentStore().raw.gist()
  })

/**
 * Project text for a cube and a sphere, from the app's own serializer.
 *
 * @param {import('@playwright/test').Page} page
 */
const cubeAndSphereText = (page) =>
  page.evaluate(async () => {
    const { createDocument } = await window.__e2eImport('/src/core/document.js')
    const { serializeProject } = await window.__e2eImport('/src/core/project.js')
    const doc = createDocument()
    doc.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [-15, 0, 10] } }, { origin: 'local' })
    doc.append({ id: 'sphere-1', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 20, center: [15, 0, 10] } }, { origin: 'local' })
    return serializeProject(doc)
  })

/**
 * Put a gist straight into the fake, as someone else's publish would have.
 *
 * @param {ReturnType<typeof newFake>} fake
 * @param {string} text
 * @param {string} description
 */
function seedGist(fake, text, description = 'Phone stand') {
  const id = 'c0ffee00c0ffee00c0ffee00c0ffee00'.slice(0, 32)
  fake.gists.set(id, {
    id,
    public: false,
    description,
    owner: 'someone-else',
    files: { 'phone-stand.ndjson': text, 'README.md': '# Phone stand\n' },
    revisions: ['a'.repeat(40)],
    updatedAt: new Date().toISOString(),
  })
  return id
}

/** Leave the Shared view's "hidden tab" flush path a chance to write, then check it did not. @param {import('@playwright/test').Page} page */
async function flushAutosave(page) {
  await sleep(1200)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
  })
  await sleep(400)
}

test.describe('store and share a project as a GitHub gist', () => {
  test('1-3, 5, 7: publish, open cold, update, a copy owns nothing, the owner edits, stop sharing', async ({ page, browser, baseURL }, info) => {
    test.setTimeout(150_000)
    const fake = newFake()
    await openApp(page, fake)
    await editorReady(page)
    const input = await pointer(page, info)

    // Connect from File ▾ (the second route; the Share sheet's own button is case 8).
    await connectFromMenu(page, input)
    await input.press(page.getByTestId('file-menu-button'))
    await expect(page.getByTestId('gist-connect-open')).toHaveText(`GitHub gists: ${LOGIN}…`)
    await page.keyboard.press('Escape')

    await placeShapes(page, input, info)
    const names = await bodyNames(page)
    expect(names).toHaveLength(2)

    // A Download copy taken before publishing — what the published file must equal.
    const before = await downloadCopy(page, input)
    // So far GitHub has seen the write probe and the login read, nothing else.
    expect(fake.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([`PATCH /gists/${'0'.repeat(32)}`, 'GET /user'])
    const writesBefore = fake.requests.length

    // The sheet, connected and not yet published: compared at every project.
    await openShareSheet(page, input)
    const group = page.getByTestId('share-gist-group')
    await expect(group).toHaveAttribute('data-state', 'connected')
    await expect(page.getByTestId('share-gist-disclosure')).toHaveText(SECRET_DISCLOSURE)
    await expect(page.getByTestId('share-gist-public')).not.toBeChecked()
    await expect(page.getByTestId('share-gist-publish')).toBeEnabled()
    await page.getByTestId('share-name').blur()
    await expectTapTargets(group)
    await expectNoHorizontalScroll(page)
    // The Download-copy toast can still be up over the popover's corner at laptop width: masked.
    await expect(page.getByTestId('share-sheet')).toHaveScreenshot('gist-share-sheet.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
      mask: [page.getByTestId('share-toast')],
    })
    // Nothing was sent by opening the sheet.
    expect(fake.requests.length).toBe(writesBefore)

    // 1. Publish.
    await tap(input, page.getByTestId('share-gist-publish'))
    await expect(page.getByTestId('share-toast')).toHaveText('Published. Link copied')
    await expect(group).toHaveAttribute('data-state', 'published')
    await expect(page.getByTestId('share-gist-status')).toHaveText(/^Published · secret · \d\d:\d\d$/)
    const copied = await page.evaluate(() => /** @type {any} */ (window).__copied.at(-1))
    expect(copied).toMatch(/^https:\/\/app\.warpcad\.com\/#\/gist\/[0-9a-f]{32}$/)
    const id = /** @type {string} */ (copied).slice(-32)
    const hash = `#/gist/${id}`
    const gist = fake.gists.get(id)
    expect(gist?.public).toBe(false)
    expect(gist?.owner).toBe(LOGIN)
    // Exactly two files: the project (named by the sheet's Name, `Untitled` for a never-saved project) and its README.
    expect(Object.keys(gist?.files ?? {}).sort()).toEqual(['README.md', 'untitled.ndjson'])
    const readme = gist?.files['README.md'] ?? ''
    for (const name of names) expect(readme).toContain(name)
    expect(readme).toContain(`https://app.warpcad.com/#/gist/${id}`)
    expect(projectFileOf(gist)?.text).toBe(before)
    // Every write carried the gist token, and only to the gist API.
    for (const request of fake.requests.filter((r) => r.method !== 'GET')) {
      expect(request.auth).toBe(`Bearer ${GIST_TOKEN}`)
      expect(request.url.startsWith('https://api.github.com/gists')).toBe(true)
      expect(request.url).not.toContain(GIST_TOKEN)
    }
    expect(fake.escaped).toEqual([])
    await sleep(300)
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-published-sheet.png`) })
    // Dark is the primary theme (`CLAUDE.md`, UI): the same sheet, for a person to judge contrast.
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-published-sheet-dark.png`) })
    await page.emulateMedia({ colorScheme: 'light' })
    await expectTapTargets(group)
    await closeShareSheet(page)
    // The chip beside Share, and the header still fits.
    await expect(page.getByTestId('share-gist-chip')).toHaveCount(1)
    await expectHeaderFits(page)
    // A Download copy taken now carries the gist; the published file could not have.
    const after = await downloadCopy(page, input)
    expect(after).not.toBe(before)
    expect(after).toContain(id)

    const context = await freshContext(browser, info, baseURL)
    try {
      // 2. The link, cold, in a context with nothing in it.
      const other = await context.newPage()
      await openApp(other, fake, `/${hash}`)
      await expect(other.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
      await expect(other.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
      await expectBodyCount(other, 2)
      await expect(other.getByTestId('shared-copy')).toBeVisible()
      await expect(other.getByTestId('shared-gist-edit')).toHaveCount(0)
      await expectNoEditorChrome(other)
      expect(new URL(other.url()).hash).toBe('')
      await expectNoHorizontalScroll(other)
      await other.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-shared-view.png`) })

      // 3. Change the model, Update gist: the same id, a new revision, and the link shows it.
      const revisions = gist?.revisions.length ?? 0
      await placeShapes(page, input, info, ['primitive.cylinder'])
      await openShareSheet(page, input)
      await tap(input, page.getByTestId('share-gist-update'))
      await expect(page.getByTestId('share-toast')).toHaveText('Gist updated')
      expect(fake.gists.get(id)?.revisions.length).toBe(revisions + 1)
      const patched = fake.requests.filter((r) => r.method === 'PATCH').at(-1)
      expect(patched?.url).toBe(`https://api.github.com/gists/${id}`)
      expect(fake.gists.size).toBe(1)
      await closeShareSheet(page)

      await other.goto(`/${hash}`)
      await expect(other.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
      await expectBodyCount(other, 3)

      // 7b. Someone else's copy starts a project that owns nothing — not the sender's gist.
      const oinput = await pointer(other, info)
      await oinput.press(other.getByTestId('shared-copy'))
      await editorReady(other)
      await expectBodyCount(other, 3)
      expect(await gistFieldOf(other)).toBeNull()
      await openShareSheet(other, oinput)
      await expect(other.getByTestId('share-gist-group')).toHaveAttribute('data-state', 'off')
      await closeShareSheet(other)

      // 7. The owner opening their own link: Open it to edit, not a read-only copy.
      await page.evaluate((next) => {
        window.location.hash = next
      }, hash)
      await expect(page.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
      await expect(page.getByTestId('shared-gist-edit')).toBeVisible()
      await expect(page.getByTestId('shared-gist-copy')).toBeVisible()
      await expect(page.getByTestId('shared-copy')).toHaveCount(0)
      await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-own-link.png`) })
      await input.press(page.getByTestId('shared-gist-edit'))
      await editorReady(page)
      await expectBodyCount(page, 3)
      expect((await gistFieldOf(page))?.id).toBe(id)

      // 5. Stop sharing: asks first, then deletes; the link then says it can't be found.
      await openShareSheet(page, input)
      await tap(input, page.getByTestId('share-gist-stop'))
      await expect(page.getByTestId('share-gist-stop-confirm')).toContainText('the link stops working')
      await expect(page.getByTestId('share-gist-stop-confirm')).toContainText('may remain')
      await tap(input, page.getByTestId('share-gist-stop-yes'))
      await expect(page.getByTestId('share-toast')).toHaveText('Stopped sharing. The link no longer works')
      expect(fake.gists.has(id)).toBe(false)
      await expect(page.getByTestId('share-gist-group')).toHaveAttribute('data-state', 'connected')
      await closeShareSheet(page)
      await expect(page.getByTestId('share-gist-chip')).toHaveCount(0)
      expect(await gistFieldOf(page)).toBeNull()

      await other.goto(`/${hash}`)
      await expect(other.getByTestId('shared-incomplete')).toBeVisible()
      await expect(other.getByTestId('shared-gist-message')).toHaveText(NOT_FOUND)
      await expect(other.getByTestId('viewport')).toHaveCount(0)
      expect(fake.escaped).toEqual([])
    } finally {
      await context.close()
    }
  })

  test('11. the owner on two devices: each Update gist merges the other\'s changes first (io-019)', async ({ page, browser, baseURL }, info) => {
    test.setTimeout(150_000)
    const fake = newFake()
    await openApp(page, fake)
    await editorReady(page)
    const input = await pointer(page, info)

    // A, the laptop: connect, two shapes, publish.
    await connectFromMenu(page, input)
    await placeShapes(page, input, info)
    await openShareSheet(page, input)
    await tap(input, page.getByTestId('share-gist-publish'))
    await expect(page.getByTestId('share-toast')).toHaveText('Published. Link copied')
    const id = /** @type {string} */ (await page.evaluate(() => /** @type {any} */ (window).__copied.at(-1))).slice(-32)
    await closeShareSheet(page)
    // The project file, carrying its gist field, is how the owner's second device gets the project.
    const file = await downloadCopy(page, input)
    if (await page.getByTestId('share-sheet').isVisible()) await closeShareSheet(page)
    expect(file).toContain(id)

    const context = await freshContext(browser, info, baseURL)
    try {
      // B, the owner's phone: open the file, connect the same account — it is published here too.
      const phone = await context.newPage()
      // The `<input type=file>` picker every engine has, which Playwright can answer (`merge-file.e2e.js`).
      await phone.addInitScript(() => Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }))
      await openApp(phone, fake)
      await editorReady(phone)
      const pinput = await pointer(phone, info)
      await openFileMenu(phone, pinput)
      const chooserEvent = phone.waitForEvent('filechooser')
      // Playwright's click, as `merge-file.e2e.js` opens it: the picker needs the click's activation.
      await phone.getByTestId('file-open').click()
      const chooser = await chooserEvent
      await chooser.setFiles({ name: 'untitled.ndjson', mimeType: 'text/plain', buffer: Buffer.from(file) })
      await expectBodyCount(phone, 2)
      await connectFromMenu(phone, pinput)
      expect((await gistFieldOf(phone))?.id).toBe(id)

      // B edits and updates first: the gist is where B left it, so no merge.
      await placeShapes(phone, pinput, info, ['primitive.cylinder'])
      await openShareSheet(phone, pinput)
      await tap(pinput, phone.getByTestId('share-gist-update'))
      await expect(phone.getByTestId('share-toast')).toHaveText('Gist updated')
      await expect(phone.getByTestId('merge-toast')).toHaveCount(0)
      await closeShareSheet(phone)

      // A edits too and updates: B's cylinder is merged in first, then the gist gets both.
      await placeShapes(page, input, info, ['primitive.cuboid'])
      const patches = fake.requests.filter((r) => r.method === 'PATCH').length
      await openShareSheet(page, input)
      await tap(input, page.getByTestId('share-gist-update'))
      await expect(page.getByTestId('merge-toast-text')).toHaveText('Merged 1 step from the gist')
      await expect(page.getByTestId('merge-undo')).toBeVisible()
      await expect(page.getByTestId('share-toast')).toHaveText('Gist updated')
      await expect(page.getByTestId('share-gist-error')).toHaveCount(0)
      expect(fake.requests.filter((r) => r.method === 'PATCH').length).toBe(patches + 1)
      await sleep(300)
      await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-update-merged.png`) })
      await closeShareSheet(page)
      await expectBodyCount(page, 4)

      // B updates again: A's cuboid comes in, and both devices end with all four bodies.
      await openShareSheet(phone, pinput)
      await tap(pinput, phone.getByTestId('share-gist-update'))
      await expect(phone.getByTestId('merge-toast-text')).toHaveText('Merged 1 step from the gist')
      await expect(phone.getByTestId('share-toast')).toHaveText('Gist updated')
      await closeShareSheet(phone)
      await expectBodyCount(phone, 4)
      expect((await bodyNames(phone)).sort()).toEqual((await bodyNames(page)).sort())

      // One gist, holding the four bodies.
      expect(fake.gists.size).toBe(1)
      const records = (projectFileOf(fake.gists.get(id))?.text ?? '').split('\n').filter((line) => line !== '' && !line.startsWith('{"warpcad"'))
      expect(records).toHaveLength(4)
      await expectNoHorizontalScroll(phone)
      expect(fake.escaped).toEqual([])
    } finally {
      await context.close()
    }
  })

  test('4. opening a gist link never writes; a file over the inline limit is read from the raw host', async ({ browser, baseURL }, info) => {
    const fake = newFake()
    const context = await freshContext(browser, info, baseURL)
    try {
      const mine = await context.newPage()
      await openApp(mine, fake)
      await editorReady(mine)
      const input = await pointer(mine, info)
      await placeShapes(mine, input, info, ['primitive.cylinder'])
      await expect(mine.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })
      const before = await readAutosave(mine)
      expect(before).not.toBeNull()
      const text = await cubeAndSphereText(mine)
      await mine.close()

      // Served truncated, the whole file at its raw URL — the real API's shape for about 1 MB up.
      fake.truncateOver = 200
      const id = seedGist(fake, text)
      const viewer = await context.newPage()
      await openApp(viewer, fake, `/#/gist/${id}`)
      await expect(viewer.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
      await expect(viewer.getByTestId('shared-title')).toHaveText('Phone stand')
      await expectBodyCount(viewer, 2)
      expect(fake.requests.some((r) => r.url.startsWith('https://gist.githubusercontent.com/'))).toBe(true)
      // No token was ever sent to read it.
      expect(fake.requests.every((r) => r.auth === undefined)).toBe(true)
      await flushAutosave(viewer)
      expect(await readAutosave(viewer)).toEqual(before)
    } finally {
      await context.close()
    }
  })

  test('6. a rate-limited read and a deleted gist each say so in plain words, with Start WarpCad', async ({ page }, info) => {
    const fake = newFake()
    await openApp(page, fake)
    await editorReady(page)
    const id = seedGist(fake, await cubeAndSphereText(page))

    fake.mode = 'rate-limited'
    await page.goto(`/#/gist/${id}`)
    await expect(page.getByTestId('shared-incomplete')).toBeVisible()
    await expect(page.getByTestId('shared-gist-message')).toHaveText(BUSY)
    await expect(page.getByTestId('shared-incomplete')).not.toContainText('looks incomplete')
    await expect(page.getByTestId('viewport')).toHaveCount(0)
    await expectNoHorizontalScroll(page)

    // The failed link keeps its hash, so a reload reads it again — now deleted.
    fake.mode = 'ok'
    fake.gists.delete(id)
    await page.reload()
    await expect(page.getByTestId('shared-gist-message')).toHaveText(NOT_FOUND)
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-not-found.png`) })
    const input = await pointer(page, info)
    await input.press(page.getByTestId('shared-start'))
    await editorReady(page)
    expect(new URL(page.url()).hash).toBe('')
  })

  test('8. over the long-link ceiling, the gist is the way to share; connect from the Share sheet', async ({ page, browser, baseURL }, info) => {
    test.setTimeout(120_000)
    const fake = newFake()
    await openApp(page, fake)
    await editorReady(page)
    const input = await pointer(page, info)
    // Many bodies with incompressible names: far past SHARE_LINK_MAX_CHARS once compressed.
    await page.evaluate(async () => {
      const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
      const store = useDocumentStore()
      for (let i = 0; i < 80; i += 1) {
        const noise = Array.from(crypto.getRandomValues(new Uint8Array(40)), (b) => b.toString(36)).join('')
        store.append({ id: `big-${i}`, op: 'primitive.cuboid', name: `Part ${noise}`, params: { size: [4, 4, 4], center: [(i % 10) * 6, Math.floor(i / 10) * 6, 2] } })
      }
    })
    await expectBodyCount(page, 80)

    await openShareSheet(page, input)
    await expect(page.getByTestId('share-too-big')).toBeVisible()
    await expect(page.getByTestId('share-copy')).toHaveCount(0)
    await expect(page.getByTestId('share-too-big')).toContainText('Publish it as a gist')
    const connect = page.getByTestId('share-gist-connect')
    await expect(connect).toHaveClass(/share-gist__button--primary/)

    // The dialog opens over the sheet; Escape closes the dialog only.
    await tap(input, connect)
    await expect(page.getByTestId('gist-connect-dialog')).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('gist-connect-dialog')).toHaveCount(0)
    await expect(page.getByTestId('share-sheet')).toBeVisible()
    await tap(input, connect)
    await connectInDialog(page, input, GIST_TOKEN)
    await expect(page.getByTestId('share-sheet')).toBeVisible()

    const publish = page.getByTestId('share-gist-publish')
    await expect(publish).toHaveClass(/share-gist__button--primary/)
    await tap(input, publish)
    await expect(page.getByTestId('share-toast')).toHaveText('Published. Link copied')
    const link = await page.evaluate(() => /** @type {any} */ (window).__copied.at(-1))
    expect(link.length).toBeLessThan(80)

    // Opened elsewhere: the whole project, though the file is served truncated.
    fake.truncateOver = 4000
    const context = await freshContext(browser, info, baseURL)
    try {
      const other = await context.newPage()
      await openApp(other, fake, `/${link.slice(link.indexOf('#'))}`)
      await expect(other.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
      await expectBodyCount(other, 80)
    } finally {
      await context.close()
    }
  })

  test('9. a never-saved project: the Share sheet\'s Name is the gist\'s title, and Update renames it (io-020)', async ({ page }, info) => {
    test.setTimeout(120_000)
    const fake = newFake()
    await openApp(page, fake)
    await editorReady(page)
    const input = await pointer(page, info)
    await page.evaluate(async () => {
      const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
      const store = useDocumentStore()
      store.append({ id: 'base', op: 'primitive.cuboid', name: 'Base', params: { size: [10, 10, 2], center: [0, 0, 1] } })
      store.append({ id: 'plate', op: 'primitive.cuboid', name: 'Back plate', params: { size: [10, 2, 8], center: [0, -4, 5] } })
    })
    await expectBodyCount(page, 2)

    await openShareSheet(page, input)
    await tap(input, page.getByTestId('share-gist-connect'))
    await connectInDialog(page, input, GIST_TOKEN)
    await expect(page.getByTestId('share-gist-publish')).toBeEnabled()

    // Nothing is saved, so the sheet offers Untitled; the owner types the title.
    await page.getByTestId('share-name').fill('Fan Duct')
    await page.getByTestId('share-name').blur()
    await tap(input, page.getByTestId('share-gist-publish'))
    await expect(page.getByTestId('share-toast')).toHaveText('Published. Link copied')
    const copied = await page.evaluate(() => /** @type {any} */ (window).__copied.at(-1))
    const id = /** @type {string} */ (copied).slice(-32)
    const gist = fake.gists.get(id)
    expect(gist?.description).toBe('Fan Duct')
    expect(Object.keys(gist?.files ?? {}).sort()).toEqual(['README.md', 'fan-duct.ndjson'])
    expect(gist?.files['README.md']).toContain('# Fan Duct')

    // Rename in the same sheet and update: the gist follows the Name, and the old file goes.
    await page.getByTestId('share-name').fill('Desk stand')
    await page.getByTestId('share-name').blur()
    await tap(input, page.getByTestId('share-gist-update'))
    await expect(page.getByTestId('share-toast')).toHaveText('Gist updated')
    const renamed = fake.gists.get(id)
    expect(renamed?.description).toBe('Desk stand')
    expect(Object.keys(renamed?.files ?? {}).sort()).toEqual(['README.md', 'desk-stand.ndjson'])
    expect(renamed?.files['README.md']).toContain('# Desk stand')
  })

  test('10. the prompts that made the project are in the README under How this was made, until the box is unticked (io-022)', async ({ page }, info) => {
    test.setTimeout(120_000)
    const fake = newFake()
    await openApp(page, fake)
    await editorReady(page)
    const input = await pointer(page, info)
    await page.evaluate(async () => {
      const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
      const store = useDocumentStore()
      store.append({ id: 'base', op: 'primitive.cuboid', name: 'Base', params: { size: [10, 10, 2], center: [0, 0, 1] } })
      store.raw.recordPrompt({ text: 'a 140 × 250 mm fan duct, 1.6 mm walls', produced: ['base'] }, { origin: 'mcp' })
      store.refresh()
    })
    await expectBodyCount(page, 1)

    await openShareSheet(page, input)
    await tap(input, page.getByTestId('share-gist-connect'))
    await connectInDialog(page, input, GIST_TOKEN)
    await expect(page.getByTestId('share-gist-prompts')).toBeChecked()
    await expect(page.getByTestId('share-gist-prompts-note')).toHaveText('1 prompt — the request and the reply — will be in the README. The project file has them either way.')
    await tap(input, page.getByTestId('share-gist-publish'))
    await expect(page.getByTestId('share-toast')).toHaveText('Published. Link copied')
    const copied = await page.evaluate(() => /** @type {any} */ (window).__copied.at(-1))
    const id = /** @type {string} */ (copied).slice(-32)
    expect(fake.gists.get(id)?.files['README.md']).toContain('## How this was made')
    expect(fake.gists.get(id)?.files['README.md']).toContain('> a 140 × 250 mm fan duct, 1\\.6 mm walls')
    expect(fake.gists.get(id)?.files['README.md']).toContain('- Made: Base')

    // Untick, then update: the README drops the section, and the project file still has the prompt.
    await tap(input, page.getByTestId('share-gist-prompts'))
    await expect(page.getByTestId('share-gist-prompts')).not.toBeChecked()
    await expect(page.getByTestId('share-gist-prompts-note')).toHaveText('The request and the reply are left out of the README. The project file still has them.')
    await tap(input, page.getByTestId('share-gist-update'))
    await expect(page.getByTestId('share-toast')).toHaveText('Gist updated')
    const updated = fake.gists.get(id)
    expect(updated?.files['README.md']).not.toContain('How this was made')
    const file = Object.entries(updated?.files ?? {}).find(([name]) => name !== 'README.md')
    expect(String(file?.[1])).toContain('a 140 × 250 mm fan duct')
  })

  test('12. the README is the project\'s brief: description, request and reply, variables with ranges; unticking keeps the description and variables (io-023)', async ({ page }, info) => {
    test.setTimeout(120_000)
    const fake = newFake()
    await openApp(page, fake)
    await editorReady(page)
    const input = await pointer(page, info)
    // An agent's work: a body, the request, the reply, two variables (one with a range).
    await page.evaluate(async () => {
      const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
      const { defineVariable } = await window.__e2eImport('/src/core/variables.js')
      const store = useDocumentStore()
      store.append({ id: 'base', op: 'primitive.cuboid', name: 'Base', params: { size: [10, 10, 2], center: [0, 0, 1] } })
      const prompt = store.raw.recordPrompt({ text: 'a fan duct, inlet between 40 and 120 mm', produced: ['base'] }, { origin: 'mcp' })
      store.raw.addPromptResponse(prompt.id, 'Built it. Problems met: none.', { origin: 'mcp' })
      defineVariable(store.raw, { name: 'inlet_diameter', kind: 'number', value: 80, unit: 'mm', min: 40, max: 120 }, { origin: 'mcp' })
      defineVariable(store.raw, { name: 'wall', kind: 'number', value: 1.6, unit: 'mm' }, { origin: 'mcp' })
      store.refresh()
    })
    await expectBodyCount(page, 1)

    // A person writes the description: File ▾ → Project settings… → Description, with its preview.
    await openFileMenu(page, input)
    await tap(input, page.getByTestId('project-settings'))
    await expect(page.getByTestId('project-settings-dialog')).toBeVisible()
    await page.getByTestId('project-settings-description').fill('A **wall** duct for a closet.\n\n- prints in *PETG*')
    await expect(page.getByTestId('project-settings-description-preview').locator('strong')).toHaveText('wall')
    await expect(page.getByTestId('project-settings-description-preview').locator('li')).toHaveText('prints in PETG')
    await tap(input, page.getByTestId('project-settings-save'))
    await expect(page.getByTestId('project-settings-dialog')).toHaveCount(0)

    await openShareSheet(page, input)
    await tap(input, page.getByTestId('share-gist-connect'))
    await connectInDialog(page, input, GIST_TOKEN)
    await expect(page.getByTestId('share-gist-prompts')).toBeChecked()
    await tap(input, page.getByTestId('share-gist-publish'))
    await expect(page.getByTestId('share-toast')).toHaveText('Published. Link copied')
    const copied = await page.evaluate(() => /** @type {any} */ (window).__copied.at(-1))
    const id = /** @type {string} */ (copied).slice(-32)
    const readme = String(fake.gists.get(id)?.files['README.md'])
    const order = [
      '# ',
      'A **wall** duct for a closet\\.',
      '- prints in *PETG*',
      '[Open in WarpCad]',
      '- 1 body: Base',
      '## How this was made',
      '> a fan duct, inlet between 40 and 120 mm',
      '**Reply**',
      '> Built it\\. Problems met: none\\.',
      '- Made: Base',
      '## Variables',
      '| Name | Value | Range |',
      '| inlet\\_diameter | 80 mm | 40–120 mm |',
      '| wall | 1\\.6 mm | — |',
      'Made with WarpCad.',
    ]
    const at = order.map((marker) => readme.indexOf(marker))
    expect(at, readme).not.toContain(-1)
    expect([...at].sort((a, b) => a - b)).toEqual(at)

    // Untick, then update: the request and the reply leave the README; the description and the
    // variables stay, and the project file keeps everything.
    await tap(input, page.getByTestId('share-gist-prompts'))
    await expect(page.getByTestId('share-gist-prompts-note')).toHaveText('The request and the reply are left out of the README. The project file still has them.')
    await tap(input, page.getByTestId('share-gist-update'))
    await expect(page.getByTestId('share-toast')).toHaveText('Gist updated')
    const updated = fake.gists.get(id)
    const after = String(updated?.files['README.md'])
    expect(after).not.toContain('How this was made')
    expect(after).not.toContain('a fan duct')
    expect(after).not.toContain('Built it')
    expect(after).toContain('A **wall** duct for a closet\\.')
    expect(after).toContain('| inlet\\_diameter | 80 mm | 40–120 mm |')
    const file = String(Object.entries(updated?.files ?? {}).find(([name]) => name !== 'README.md')?.[1])
    expect(file).toContain('Built it. Problems met: none.')
    expect(file).toContain('"description":["A **wall** duct for a closet.')
  })

  test('13. a gist whose project has a description opens with it as a popup, and the README leads with it; the owner\'s own link has no popup (ui-091)', async ({ page, browser, baseURL }, info) => {
    test.setTimeout(150_000)
    const fake = newFake()
    await openApp(page, fake)
    await editorReady(page)
    const input = await pointer(page, info)
    await page.evaluate(async () => {
      const { useDocumentStore } = await window.__e2eImport('/src/stores/document.js')
      const store = useDocumentStore()
      store.append({ id: 'base', op: 'primitive.cuboid', name: 'Base', params: { size: [10, 10, 2], center: [0, 0, 1] } })
      store.setDescription('Fan duct for a **120 mm** fan.\n\n- Print upright')
    })
    await expectBodyCount(page, 1)

    await openShareSheet(page, input)
    await expect(page.getByTestId('description-hint-line')).toHaveText('Fan duct for a 120 mm fan.')
    await tap(input, page.getByTestId('share-gist-connect'))
    await connectInDialog(page, input, GIST_TOKEN)
    await tap(input, page.getByTestId('share-gist-publish'))
    await expect(page.getByTestId('share-toast')).toHaveText('Published. Link copied')
    const copied = await page.evaluate(() => /** @type {any} */ (window).__copied.at(-1))
    const id = /** @type {string} */ (copied).slice(-32)
    const hash = `#/gist/${id}`
    const readme = String(fake.gists.get(id)?.files['README.md'])
    expect(readme).toContain('Fan duct for a **120 mm** fan\\.')
    expect(readme).toContain('- Print upright')

    // Someone else, cold: the popup over the model; one button dismisses it; About brings it back.
    const context = await freshContext(browser, info, baseURL)
    try {
      const other = await context.newPage()
      await openApp(other, fake, `/${hash}`)
      await expect(other.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
      const popup = other.getByTestId('shared-about')
      await expect(popup).toBeVisible()
      await expect(other.getByTestId('shared-about-text').locator('strong')).toHaveText('120 mm')
      await other.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-shared-about-popup.png`) })
      const reader = await pointer(other, info)
      await reader.press(other.getByTestId('shared-about-close'))
      await expect(popup).toHaveCount(0)
      await expect(other.getByTestId('shared-about-open')).toBeVisible()
      await reader.press(other.getByTestId('shared-about-open'))
      await expect(popup).toBeVisible()
    } finally {
      await context.close()
    }

    // The owner opening their own link: no popup (they wrote it), but the About button is there.
    await page.evaluate((next) => {
      window.location.hash = next
    }, hash)
    await expect(page.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
    await expect(page.getByTestId('shared-gist-edit')).toBeVisible()
    await expect(page.getByTestId('shared-about')).toHaveCount(0)
    await expect(page.getByTestId('shared-about-open')).toBeVisible()
    expect(fake.escaped).toEqual([])
  })

  test('the repository token and the gist token never overwrite each other through the UI', async ({ page }, info) => {
    const fake = newFake()
    await openApp(page, fake)
    await editorReady(page)
    const input = await pointer(page, info)

    // The repository token (io-002), through its own dialog.
    await openFileMenu(page, input)
    await tap(input, page.getByTestId('hosted-connect'))
    await page.getByTestId('hosted-token').fill(REPO_TOKEN)
    await page.getByTestId('hosted-repo').fill('warpcad-test/parts')
    await tap(input, page.getByTestId('hosted-connect-submit'))
    await expect(page.getByTestId('hosted-connect-saved')).toContainText('Token saved in this browser')
    await tap(input, page.getByTestId('hosted-connect-done'))

    // Then the gist token, through its own.
    await connectFromMenu(page, input)
    const stored = () =>
      page.evaluate(async () => {
        const { createCredentialStore, GIST_CREDENTIAL_KEY, HOSTED_CREDENTIAL_KEY } = await window.__e2eImport('/src/storage/tokenStorage.js')
        const credentials = createCredentialStore()
        const gist = await credentials.read(GIST_CREDENTIAL_KEY)
        const hosted = await credentials.read(HOSTED_CREDENTIAL_KEY)
        credentials.close()
        return { gist: gist?.token ?? null, hosted: hosted?.token ?? null }
      })
    expect(await stored()).toEqual({ gist: GIST_TOKEN, hosted: REPO_TOKEN })

    // Disconnecting the gist leaves the repository connected, and the reverse.
    await openFileMenu(page, input)
    await tap(input, page.getByTestId('gist-connect-open'))
    await tap(input, page.getByTestId('gist-disconnect'))
    await expect(page.getByTestId('gist-connect-note')).toContainText('deleted from this browser')
    await escapeFrom(page, 'gist-connect-dialog')
    expect(await stored()).toEqual({ gist: null, hosted: REPO_TOKEN })
    await openFileMenu(page, input)
    await expect(page.getByTestId('hosted-save')).toBeVisible()
    await expect(page.getByTestId('gist-connect-open')).toHaveText('Connect GitHub for gists…')
    await escapeFrom(page, 'file-menu')

    await connectFromMenu(page, input)
    await openFileMenu(page, input)
    await tap(input, page.getByTestId('hosted-disconnect'))
    expect(await stored()).toEqual({ gist: GIST_TOKEN, hosted: null })
    await openFileMenu(page, input)
    await expect(page.getByTestId('gist-connect-open')).toHaveText(`GitHub gists: ${LOGIN}…`)
    await expect(page.getByTestId('hosted-connect')).toBeVisible()
    await escapeFrom(page, 'file-menu')

    // Each token only ever went with its own calls.
    for (const request of fake.requests) {
      if (request.url.includes('/repos/')) expect(request.auth).toBe(`Bearer ${REPO_TOKEN}`)
      if (request.url.includes('/gists') || request.url.endsWith('/user')) expect(request.auth).toBe(`Bearer ${GIST_TOKEN}`)
    }
  })

  test('#/gist/ and #/help/<slug> coexist: a gist link, then Help, then out of Help', async ({ page }, info) => {
    const fake = newFake()
    await openApp(page, fake)
    await editorReady(page)
    const id = seedGist(fake, await cubeAndSphereText(page))
    await page.goto(`/#/gist/${id}`)
    await expect(page.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
    const input = await pointer(page, info)
    await input.press(page.getByTestId('shared-copy'))
    await editorReady(page)

    // Help by its link, then back out of it with its own close: the editor holds the copy.
    await page.evaluate(() => {
      window.location.hash = '#/help/sharing'
    })
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await page.getByTestId('help-close').click()
    await expect(page.getByTestId('help-sheet')).toHaveCount(0)
    await expect(page.getByTestId('shared-view')).toHaveCount(0)
    await expectBodyCount(page, 2)
    expect(new URL(page.url()).hash).toBe('')

    // With Help open, a gist link pasted in keeps priority: the Shared view opens, and Help's hash
    // mirror never writes `#/help/…` over it (the gist route clears the hash once it has loaded).
    await page.evaluate(() => {
      window.location.hash = '#/help/save-load'
    })
    await expect(page.getByTestId('help-sheet')).toBeVisible()
    await page.evaluate((next) => {
      window.location.hash = next
    }, `#/gist/${id}`)
    await expect(page.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
    await expect.poll(() => new URL(page.url()).hash).toBe('')
    await page.getByTestId('help-close').click()
    await expect(page.getByTestId('help-sheet')).toHaveCount(0)
    await expect(page.getByTestId('shared-view')).toHaveAttribute('data-state', 'ready')
    expect(new URL(page.url()).hash).toBe('')
  })
})

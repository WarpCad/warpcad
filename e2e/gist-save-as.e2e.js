// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { fakeGitHub, projectFileOf, routeFakeGitHub, watchEscapes } from './support/fakeGistApi.js'
import { closeLibrary, isPhone, openLibrary, pointer, viewportPoint } from './support/humanInput.js'

/**
 * **File ▾ → Save as gist…**, then **Save to gist** (`TODO/io-021`), driven against `/` — the real
 * root view, the real File menu, the Save as gist dialog and the gist token dialog.
 *
 * GitHub is a **fake** (`e2e/support/fakeGistApi.js`), by route interception: no real network and
 * no real token. The token typed here is a sentinel the fake knows.
 *
 * The case: place a cube and a sphere; **Save as gist…** asks to connect first, then the name and
 * Secret / Public; Save creates the gist (POST) and the chip reads *Saved to gist · hh:mm*; one
 * more shape and the chip says the gist is a change behind (nothing is pushed); the same item now
 * reads **Save to gist** and saves at once with a **PATCH** of the same gist — no second gist — and
 * the gist keeps the name it was created under.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support / Responsive Layout)
 *
 * **All three engines and all three viewports**: IndexedDB (the credential store and autosave),
 * `fetch` to GitHub, touch input, and the dialog's bottom sheet at 390px. A screenshot of the open
 * dialog at each project is written to `test-results/gist-save-as-snapshots/` for a person to look
 * at (the scene behind it is WebGL, not pixel-stable across engines).
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'gist-save-as-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** A sentinel, not a credential. */
const GIST_TOKEN = 'github_pat_E2E_SENTINEL_gist_not_a_real_token'
const LOGIN = 'warpcad-tester'
/** The write probe the token dialog sends to check the token can write gists. */
const PROBE = `/gists/${'0'.repeat(32)}`

const MOCK_CLIPBOARD = () => {
  const copied = /** @type {string[]} */ ([])
  Object.defineProperty(window, '__copied', { configurable: true, value: copied })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (/** @type {string} */ text) => copied.push(text) },
  })
}

/** Drop points: on a phone the Library sheet covers the lower half and the toolbar the top-left. */
const DROPS = (/** @type {import('@playwright/test').TestInfo} */ info) =>
  isPhone(info) ? [[0.3, 0.22], [0.7, 0.2], [0.5, 0.26]] : [[0.3, 0.45], [0.62, 0.38], [0.48, 0.62]]

/** @param {import('@playwright/test').Page} page @param {number} count */
const expectBodyCount = (page, count) => expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))

/**
 * Place shapes by dragging them out of the Library, at human pace.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Awaited<ReturnType<typeof pointer>>} input
 * @param {import('@playwright/test').TestInfo} info
 * @param {string[]} ops
 * @param {number} from Which drop point the first shape takes.
 */
async function placeShapes(page, input, info, ops, from = 0) {
  const at = DROPS(info)
  const before = Number(await page.getByTestId('viewport').getAttribute('data-body-count'))
  await openLibrary(page, input.press)
  for (const [index, op] of ops.entries()) {
    const [fx, fy] = at[from + index]
    const p = await viewportPoint(page, fx, fy)
    await input.dragRow(page.getByTestId(`library-row-${op}`), p.x, p.y)
  }
  await expectBodyCount(page, before + ops.length)
  await closeLibrary(page, input.press)
}

/**
 * Open File ▾. Playwright's `click`: the chip text beside the button changes length as saves land,
 * which can move the button between the press's hit check and its click. The menu's own items are
 * pressed by hand.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openFileMenu(page) {
  await expect(page.getByTestId('file-menu')).toHaveCount(0)
  await page.getByTestId('file-menu-button').click()
  await expect(page.getByTestId('file-menu')).toBeVisible()
}

/** The chip's words, read from the File menu's first line (a phone shows the chip as a dot). @param {import('@playwright/test').Page} page */
async function expectChip(page, /** @type {RegExp | string} */ text) {
  await openFileMenu(page)
  await expect(page.getByTestId('file-menu-status')).toHaveText(text)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('file-menu')).toHaveCount(0)
}

/** The gist API calls that write, the token dialog's probe left out. @param {ReturnType<typeof fakeGitHub>} fake */
const writes = (fake) =>
  fake.requests
    .filter((r) => r.method !== 'GET' && new URL(r.url).pathname !== PROBE && new URL(r.url).pathname.startsWith('/gists'))
    .map((r) => `${r.method} ${new URL(r.url).pathname}`)

/** Every visible button, link and choice in `scope` is at least 44px tall. @param {import('@playwright/test').Locator} scope */
async function expectTapTargets(scope) {
  const small = await scope.evaluate((root) =>
    Array.from(root.querySelectorAll('button, a, input[type="radio"]'))
      .map((el) => {
        const target = el.matches('input') ? /** @type {HTMLElement} */ (el.closest('label') ?? el) : el
        const box = target.getBoundingClientRect()
        return { id: el.getAttribute('data-testid') ?? el.textContent?.trim(), height: box.height, shown: box.width > 0 && box.height > 0 }
      })
      .filter((row) => row.shown && row.height < 44),
  )
  expect(small, 'tap targets under 44px').toEqual([])
}

test.describe('save a project as a GitHub gist from File ▾', () => {
  test('Save as gist… creates it (connect first), the chip counts what the gist lacks, Save to gist PATCHes the same gist', async ({ page }, info) => {
    test.setTimeout(120_000)
    const fake = fakeGitHub({ tokens: { [GIST_TOKEN]: { login: LOGIN, kind: 'fine-grained' } } })
    await routeFakeGitHub(page, fake)
    watchEscapes(page, fake)
    await page.addInitScript(MOCK_CLIPBOARD)
    await page.goto('/')
    await expect(page.getByTestId('app-header')).toBeVisible()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
    const input = await pointer(page, info)

    // An empty scene: the item is there, dimmed, with its reason.
    await openFileMenu(page)
    await expect(page.getByTestId('file-save-as-gist')).toContainText('Save as gist…')
    await expect(page.getByTestId('file-save-as-gist')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('file-save-as-gist-reason')).toHaveText('Nothing to save yet')
    await page.keyboard.press('Escape')

    await placeShapes(page, input, info, ['primitive.cuboid', 'primitive.sphere'])

    // Save as gist… with no token: the connect step first.
    await openFileMenu(page)
    await expect(page.getByTestId('file-save-as-gist-reason')).toHaveCount(0)
    await input.press(page.getByTestId('file-save-as-gist'))
    const dialog = page.getByTestId('save-gist-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('save-gist-name')).toHaveCount(0)
    await input.press(page.getByTestId('save-gist-connect'))
    await expect(page.getByTestId('gist-connect-dialog')).toBeVisible()
    await page.getByTestId('gist-connect-token').fill(GIST_TOKEN)
    await input.press(page.getByTestId('gist-connect-submit'))
    await expect(page.getByTestId('gist-connect-status')).toContainText(`Connected as ${LOGIN}`)
    await input.press(page.getByTestId('gist-connect-done'))
    await expect(page.getByTestId('gist-connect-dialog')).toHaveCount(0)
    expect(writes(fake)).toEqual([])

    // Back in the same dialog, now the form: the name (io-020's pre-fill) and Secret by default.
    await expect(dialog).toBeVisible()
    const name = page.getByTestId('save-gist-name')
    await expect(name).toHaveValue('Untitled')
    await expect(page.getByTestId('save-gist-secret')).toBeChecked()
    await expect(page.getByTestId('save-gist-public')).not.toBeChecked()
    await name.fill('Desk bracket')
    await name.blur()
    await expectTapTargets(dialog)
    const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await dialog.boundingBox())
    const viewport = /** @type {{ width: number, height: number }} */ (page.viewportSize())
    if (isPhone(info)) {
      // A bottom sheet at 390px, the gist token dialog's frame.
      expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(viewport.height - 2)
    }
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-dialog.png`) })

    // Save: one new gist, secret, under the typed name.
    await input.press(page.getByTestId('save-gist-submit'))
    await expect(dialog).toHaveCount(0)
    const toast = page.getByTestId('save-gist-toast')
    await expect(toast).toContainText('Saved to gist: Desk bracket')
    expect(writes(fake)[0]).toBe('POST /gists')
    const [id] = [...fake.gists.keys()]
    expect(fake.gists.get(id)?.public).toBe(false)
    expect(Object.keys(fake.gists.get(id)?.files ?? {}).sort()).toEqual(['README.md', 'desk-bracket.ndjson'])
    expect(writes(fake)).toEqual(['POST /gists', `PATCH /gists/${id}`])

    // Copy link, in the toast.
    await input.press(page.getByTestId('save-gist-toast-copy'))
    await expect(toast).toContainText('Gist link copied')
    expect(await page.evaluate(() => /** @type {any} */ (window).__copied.at(-1))).toBe(`https://app.warpcad.com/#/gist/${id}`)
    await expectChip(page, /^Saved to gist · \d\d:\d\d$/)

    // Edit: the gist falls behind, and the chip says so instead of pushing.
    await placeShapes(page, input, info, ['primitive.cylinder'], 2)
    await expectChip(page, /^Gist: \d+ changes? not saved$/)
    expect(writes(fake)).toEqual(['POST /gists', `PATCH /gists/${id}`])

    // Save to gist: the same item, no ellipsis, saves at once — a PATCH of the same gist.
    await openFileMenu(page)
    await expect(page.getByTestId('file-save-as-gist')).toHaveText('Save to gist')
    await input.press(page.getByTestId('file-save-as-gist'))
    await expect(page.getByTestId('save-gist-dialog')).toHaveCount(0)
    await expect(toast).toContainText('Saved to gist: Desk bracket')
    expect(writes(fake)).toEqual(['POST /gists', `PATCH /gists/${id}`, `PATCH /gists/${id}`])
    expect(fake.gists.size).toBe(1)
    const gist = fake.gists.get(id)
    expect(Object.keys(gist?.files ?? {}).sort()).toEqual(['README.md', 'desk-bracket.ndjson'])
    expect(projectFileOf(gist)?.text).toContain('primitive.cylinder')
    await expectChip(page, /^Saved to gist · \d\d:\d\d$/)
    // Every write carried the gist token, and only to the gist API.
    for (const request of fake.requests.filter((r) => r.method !== 'GET')) {
      expect(request.auth).toBe(`Bearer ${GIST_TOKEN}`)
      expect(request.url.startsWith('https://api.github.com/gists')).toBe(true)
    }
    expect(fake.escaped).toEqual([])
  })
})

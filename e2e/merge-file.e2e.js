// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * **File ▾ → Merge file…**, the merge toast and banner, the conflict chip and **Undo merge**
 * (`TODO/ui-062`), driven against `/` — the real root view, the real File menu and the browser's
 * real file chooser.
 *
 * Two copies of one project are two **browser contexts** (two tabs, or a laptop and a phone,
 * as far as the app can tell): each has its own document, replica id and autosave. The project
 * travels between them the way a user moves it — Download copy on one, Open… on the other —
 * and then Merge file… brings the second copy's changes into the first.
 *
 * Setup edits (placing a cube, moving it, filleting it) go through the document store, the
 * same command layer the UI calls, the way the other persistence specs seed a scene; what this
 * spec is about — the menu item, the picker, the toast, the banner, Show, the chip and its
 * reason, Suppress, Undo merge — is all clicked for real.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support / Responsive Layout)
 *
 * - **All three engines**: file reading through `<input type=file>`, IndexedDB autosave after
 *   the merge, and the WebGL result are engine-sensitive. The `<input type=file>` fallback is
 *   forced everywhere (desktop Chromium would otherwise offer the native picker, which nothing
 *   headless can drive; the native path is the same `files.open()` Open uses).
 * - **All three viewports**, with a snapshot of the toast and of the banner at each
 *   (`test-results/merge-file-snapshots/`): at ≤640px the strip must sit at the top of the
 *   viewport under the header, full width, and must not cover the Operations toolbar or the
 *   nav chrome (`ui-043`'s gap) — measured, not eyeballed.
 *
 * ## Reachability is this spec's job; "does it work" is not
 *
 * `TODO/ACCEPTANCE.md` scenario 22 — the same thing driven by hand with a real second device,
 * including one deliberate conflict and one Undo merge — is the other half.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'merge-file-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** Force the `<input type=file>` / `<a download>` fallback on every engine. */
const FORCE_FALLBACK = () => {
  Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
}

const CUBE = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }
const MOVE = { id: 'move-1', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [30, 0, 0] } }
const CYLINDER = { id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 16, height: 20, center: [-40, 0, 10] } }
const FILLET = { id: 'fillet-1', op: 'modify.filletRim', target: 'cube-1', supersedes: 'cube-1', params: { face: 'top', radius: 2 } }

/** @param {import('@playwright/test').TestInfo} info */
const isPhone = (info) => info.project.name.endsWith('phone')

/**
 * Run `fn` against the page's document store — the command layer, never a raw mutation.
 *
 * @param {import('@playwright/test').Page} page
 * @param {(api: any, arg: any) => any} fn
 * @param {any} [arg]
 */
function withStore(page, fn, arg) {
  return page
    .evaluateHandle(async () => {
      const documentModule = await window.__e2eImport('/src/stores/document.js')
      const api = { documentStore: documentModule.useDocumentStore() }
      return api
    })
    .then(async (handle) => {
      try {
        return await handle.evaluate(fn, arg)
      } finally {
        await handle.dispose()
      }
    })
}

/** @param {import('@playwright/test').Page} page */
async function openApp(page) {
  await page.addInitScript(FORCE_FALLBACK)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
}

/** @param {import('@playwright/test').Page} page */
async function openFileMenu(page) {
  await page.getByTestId('file-menu-button').click()
  await expect(page.getByTestId('file-menu')).toBeVisible()
}

/** @param {import('@playwright/test').Page} page @param {number} count */
async function expectBodyCount(page, count) {
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))
}

/**
 * File ▾ → Download copy, and the file's text.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function downloadCopy(page) {
  await openFileMenu(page)
  const downloading = page.waitForEvent('download')
  await page.getByTestId('file-save').click()
  const download = await downloading
  return readFileSync(/** @type {string} */ (await download.path()), 'utf8')
}

/**
 * File ▾ → Open… a file's text (confirming the replace if the scene has anything in it).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {string} text
 */
async function openFile(page, name, text) {
  await openFileMenu(page)
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  if (await page.getByTestId('file-open-confirm').isVisible().catch(() => false)) {
    await page.getByTestId('file-open-confirm-replace').click()
  }
  const chooser = await chooserEvent
  await chooser.setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })
  await expect(page.getByTestId('save-status')).toContainText(`Opened ${name}`)
}

/**
 * File ▾ → Merge file… — straight to the chooser, no replace-confirm.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {string} text
 */
async function mergeFile(page, name, text) {
  await openFileMenu(page)
  const item = page.getByTestId('file-merge')
  await expect(item).toBeVisible()
  await expect(item).not.toHaveAttribute('aria-disabled', 'true')
  const chooserEvent = page.waitForEvent('filechooser')
  await item.click()
  const chooser = await chooserEvent
  await expect(page.getByTestId('file-open-confirm')).toHaveCount(0)
  await chooser.setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })
}

/**
 * A second copy of the project: another browser context (its own storage, replica and
 * autosave) that opens the downloaded file.
 *
 * @param {import('@playwright/test').Browser} browser
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function secondCopy(browser, page, text) {
  const context = await browser.newContext({
    viewport: page.viewportSize(),
    hasTouch: await page.evaluate(() => 'ontouchstart' in window),
  })
  const other = await context.newPage()
  await openApp(other)
  await openFile(other, 'bracket.ndjson', text)
  return { context, other }
}

/** @param {import('@playwright/test').Page} page */
async function openHistory(page) {
  const panel = page.getByTestId('timeline-panel')
  if (await panel.isVisible().catch(() => false)) return
  await page.getByTestId('timeline-toggle').click()
  await expect(panel).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function historyRows(page) {
  return page.$$eval('[data-testid="timeline-panel"] [data-step-id]', (rows) => rows.map((row) => row.getAttribute('data-step-id')))
}

/** @param {import('@playwright/test').Page} page @param {string} testId */
async function rectOf(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return null
    const box = el.getBoundingClientRect()
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
  }, testId)
}

/** @param {{ left: number, top: number, right: number, bottom: number }} a @param {{ left: number, top: number, right: number, bottom: number }} b */
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** Trial-click: does the topmost element at the control's centre belong to it? */
async function trialClickable(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return false
    const box = el.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return hit !== null && (hit === el || el.contains(hit))
  }, testId)
}

/**
 * The strip sits under the header, at the top of the viewport; full width at ≤640px; and it
 * covers neither the Operations toolbar nor the nav chrome, both of which still take a tap.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} stripId
 * @param {import('@playwright/test').TestInfo} info
 */
async function assertPlacement(page, stripId, info) {
  const strip = await rectOf(page, stripId)
  const header = await rectOf(page, 'app-header')
  const viewport = await rectOf(page, 'viewport')
  expect(strip).not.toBeNull()
  expect(strip.top).toBeGreaterThanOrEqual(header.bottom - 1)
  expect(viewport.top).toBeGreaterThanOrEqual(strip.bottom - 1)
  if (isPhone(info)) {
    expect(strip.left).toBeLessThanOrEqual(0.5)
    expect(strip.width).toBeGreaterThanOrEqual(page.viewportSize().width - 1)
  }
  for (const id of ['operations-toolbar', 'navigation-chrome']) {
    const rect = await rectOf(page, id)
    expect(rect, `${id} rendered`).not.toBeNull()
    expect(overlaps(strip, rect), `${stripId} ${JSON.stringify(strip)} covers ${id} ${JSON.stringify(rect)}`).toBe(false)
  }
  expect(await trialClickable(page, 'nav-step-up').catch(() => false) || (await trialClickable(page, 'nav-expand-toggle'))).toBe(true)
  // No horizontal scroll of primary UI (CLAUDE.md, Responsive Layout).
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width)
}

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test('Merge file… brings the other copy\'s change in beside this one\'s, with a toast and Undo merge (TODO/ui-062)', async ({
  page,
  browser,
}, testInfo) => {
  // A project, saved.
  await withStore(page, (api, cube) => api.documentStore.append(cube), CUBE)
  await expectBodyCount(page, 1)
  const saved = await downloadCopy(page)

  // The same file open somewhere else.
  const { context, other } = await secondCopy(browser, page, saved)
  try {
    await expectBodyCount(other, 1)

    // Change A here (move the cube), change B there (add a cylinder).
    await withStore(page, (api, move) => api.documentStore.append(move), MOVE)
    await withStore(other, (api, cylinder) => api.documentStore.append(cylinder), CYLINDER)
    await expectBodyCount(other, 2)
    const theirs = await downloadCopy(other)

    // Merge B's file into A through the real menu and picker.
    await mergeFile(page, 'bracket-copy.ndjson', theirs)

    // Both changes, in the viewport…
    await expectBodyCount(page, 2)
    const bodies = page.getByTestId('scene-bodies')
    await expect(bodies.locator('[data-body-name="Cylinder 1"]')).toHaveCount(1)
    await expect(bodies.locator('[data-body-name="Cube 1"]')).toHaveAttribute('data-body-center', '30.00,0.00,10.00')
    // …the toast, with Undo merge, and the same sentence on the one status surface…
    const toast = page.getByTestId('merge-toast')
    await expect(toast).toBeVisible()
    await expect(page.getByTestId('merge-toast-text')).toHaveText('Merged 1 step from bracket-copy.ndjson')
    await expect(page.getByTestId('merge-undo')).toBeVisible()
    await expect(page.getByTestId('merge-banner')).toHaveCount(0)
    await assertPlacement(page, 'merge-toast', testInfo)
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}-toast.png`) })

    // …and in History, with the merged row's origin chip.
    await openHistory(page)
    expect(await historyRows(page)).toEqual(['cube-1', 'move-1', 'cyl-1'])
    const cylinderRow = page.locator('[data-testid="timeline-panel"] [data-step-id="cyl-1"]')
    await expect(cylinderRow).toBeVisible()

    // Not on the header Undo stack: its label is still the user's own move.
    await expect(page.getByTestId('undo-button')).toHaveAttribute('data-undo-label', 'Move Cube 1')

    // Undo merge takes the cylinder back out and leaves the user's move alone.
    await page.getByTestId('merge-undo').click()
    await expectBodyCount(page, 1)
    await expect(bodies.locator('[data-body-name="Cube 1"]')).toHaveAttribute('data-body-center', '30.00,0.00,10.00')
    expect(await historyRows(page)).toEqual(['cube-1', 'move-1'])
    await expect(page.getByTestId('merge-toast-text')).toHaveText('Took the merge from bracket-copy.ndjson back out')
    await expect(page.getByTestId('merge-undo')).toHaveCount(0)
    await expect(page.getByTestId('undo-button')).toHaveAttribute('data-undo-label', 'Move Cube 1')
  } finally {
    await context.close()
  }
})

test('a move-versus-fillet conflict: the banner, Show, the chip and its reason, fixed by Suppress (TODO/ui-062)', async ({
  page,
  browser,
}, testInfo) => {
  await withStore(page, (api, cube) => api.documentStore.append(cube), CUBE)
  const saved = await downloadCopy(page)
  const { context, other } = await secondCopy(browser, page, saved)
  try {
    // Here the cube is moved; there it is filleted. A setting changed there first makes the
    // fillet the later-stamped row, which is the one a merge flags (`docs-022`).
    await withStore(page, (api, move) => api.documentStore.append(move), MOVE)
    await withStore(other, (api) => api.documentStore.setStandingInstructions('Round every top edge'))
    await withStore(other, (api, fillet) => api.documentStore.append(fillet), FILLET)
    const theirs = await downloadCopy(other)

    await mergeFile(page, 'bracket-copy.ndjson', theirs)

    const banner = page.getByTestId('merge-banner')
    await expect(banner).toBeVisible()
    await expect(page.getByTestId('merge-banner-text')).toHaveText('Merged 1 step from bracket-copy.ndjson — 1 step conflicted')
    await expect(page.getByTestId('merge-toast')).toHaveCount(0)
    await expect(banner.getByTestId('merge-undo')).toBeVisible()
    // The move kept the cube where the user put it.
    await expect(page.getByTestId('scene-bodies').locator('[data-body-name="Cube 1"]')).toHaveAttribute('data-body-center', '30.00,0.00,10.00')
    await assertPlacement(page, 'merge-banner', testInfo)
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${testInfo.project.name}-banner.png`) })

    // Show: History opens (the bottom sheet on a phone) with the conflicted row selected.
    await page.getByTestId('merge-banner-show').click()
    await expect(page.getByTestId('timeline-panel')).toBeVisible()
    const row = page.locator('[data-testid="timeline-panel"] [data-step-id="fillet-1"]')
    await expect(row).toHaveAttribute('aria-current', 'true')
    await expect(row.getByTestId('chip-broken')).toBeVisible()
    // The reason, readable without hover (a phone has none).
    const reason = page.getByTestId('timeline-broken-reason')
    await expect(reason).toBeVisible()
    await expect(reason).toHaveText('conflicts with step 2 (Move Cube 1)')
    await expect(row.getByTestId('chip-broken')).toHaveAttribute('title', 'conflicts with step 2 (Move Cube 1)')
    // The banner stays until dismissed.
    await expect(banner).toBeVisible()

    // Fix the row with its own action: Suppress. It then builds, and the chip goes.
    await page.getByTestId('timeline-suppress').click()
    await expect(row).toHaveAttribute('data-suppressed', 'true')
    await expect(row.getByTestId('chip-broken')).toHaveCount(0)
    await expect(page.getByTestId('timeline-broken-reason')).toHaveCount(0)

    await page.getByTestId('merge-banner-dismiss').click()
    await expect(banner).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('a different project is refused with the sentence, and the History does not change (TODO/ui-062)', async ({ page }, testInfo) => {
  // Two older (version-1) files that both have a `cube-1`, but not the same one: that is how a
  // file says it is not a copy of this project.
  const mine = `${JSON.stringify(CUBE)}\n${JSON.stringify(CYLINDER)}\n`
  const stranger = `${JSON.stringify({ ...CUBE, params: { ...CUBE.params, size: [5, 5, 5] } })}\n`
  await openFile(page, 'bracket.ndjson', mine)
  await expectBodyCount(page, 2)
  await openHistory(page)
  const rowsBefore = await historyRows(page)
  if (isPhone(testInfo)) await page.getByTestId('timeline-toggle').click()

  await mergeFile(page, 'bracket-v2.ndjson', stranger)

  await expect(page.getByTestId('merge-toast-text')).toHaveText(
    'bracket-v2.ndjson is a different project. Merge only works between copies of the same project.',
  )
  await expect(page.getByTestId('merge-undo')).toHaveCount(0)
  await expectBodyCount(page, 2)
  await openHistory(page)
  expect(await historyRows(page)).toEqual(rowsBefore)
  await expect(page.getByTestId('scene-bodies').locator('[data-body-name="Cube 1"]')).toHaveAttribute('data-body-bounds', '-10.00,-10.00,0.00,10.00,10.00,20.00')
})

test('two projects each started from New in the app are refused, and the History does not change (TODO/data-013)', async ({ page }, testInfo) => {
  // Not two fixtures: each project is built here. New clears the document; the first change
  // mints its project id (`data-013`), so the second New + body is a different project.
  /** @param {import('@playwright/test').Page} p */
  const newProject = async (p) => {
    await openFileMenu(p)
    await p.getByTestId('file-new').click()
    if (await p.getByTestId('file-open-confirm').isVisible().catch(() => false)) {
      await p.getByTestId('file-open-confirm-replace').click()
    }
    await expectBodyCount(p, 0)
  }
  await newProject(page)
  await withStore(page, (api, cube) => api.documentStore.append(cube), { ...CUBE, id: 'cube-first' })
  await expectBodyCount(page, 1)
  const first = await downloadCopy(page)
  expect(first).toMatch(/"project":"[a-z2-7]{16}"/)

  await newProject(page)
  await withStore(page, (api, cyl) => api.documentStore.append(cyl), { ...CYLINDER, id: 'cyl-second' })
  await expectBodyCount(page, 1)
  await openHistory(page)
  const rowsBefore = await historyRows(page)
  if (isPhone(testInfo)) await page.getByTestId('timeline-toggle').click()

  await mergeFile(page, 'first-project.ndjson', first)

  await expect(page.getByTestId('merge-toast-text')).toHaveText(
    'first-project.ndjson is a different project. Merge only works between copies of the same project.',
  )
  await expect(page.getByTestId('merge-undo')).toHaveCount(0)
  await expectBodyCount(page, 1)
  await openHistory(page)
  expect(await historyRows(page)).toEqual(rowsBefore)
  await expect(page.getByTestId('scene-bodies').locator('[data-body-name="Cylinder 1"]')).toHaveCount(1)
})

test('Merge file… is dimmed with its reason on an empty project, and a cancelled picker changes nothing (TODO/ui-062, ui-033)', async ({
  page,
}) => {
  await openFileMenu(page)
  await expect(page.getByTestId('file-merge')).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('file-merge-reason')).toHaveText('Nothing to merge into')
  // `aria-disabled`, not `disabled` (it stays focusable and says why), so Playwright's
  // actionability check refuses it; force the press a user can still make.
  await page.getByTestId('file-merge').click({ force: true })
  await expect(page.getByTestId('file-menu')).toBeVisible() // a dimmed item does nothing
  // Escape, not a backdrop click: at phone width the menu is a sheet that covers the
  // backdrop's centre, so a centred click lands on the menu itself.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('file-menu')).toHaveCount(0)

  await withStore(page, (api, cube) => api.documentStore.append(cube), CUBE)
  await openFileMenu(page)
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-merge').click()
  const chooser = await chooserEvent
  await chooser.setFiles([])
  await expectBodyCount(page, 1)
  await expect(page.getByTestId('merge-toast')).toHaveCount(0)
  await expect(page.getByTestId('merge-banner')).toHaveCount(0)
})

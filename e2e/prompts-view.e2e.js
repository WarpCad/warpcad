// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { agentCall, installFakeWebMcp, registeredNames } from './support/fakeWebMcp.js'

/**
 * `TODO/ui-092`, part 3 — the **Prompts view**, its highlight and the part → request link, against
 * the real app at `/`. A browser agent (the WebMCP stand-in) sends two requests over overlapping
 * bodies: the first makes cubes A and B, the second makes cube C and moves B. So B is **Made** by
 * the first and **Changed** by the second.
 *
 * - No prompts: no **Prompts (N) ›** bar and no **Prompts** tab.
 * - Opened from the bar (tablet, laptop) or the third tab (phone). One **Add reply…** per expanded row.
 * - Expanding a row lights its parts (`data-hover-bodies`), and the canvas pixels change — the
 *   attribute alone has passed before while the screen did not. Collapsing clears both. A mouse
 *   hover and keyboard focus light a row, one part row lights one part (not at phone width, which
 *   is tap-driven only, with no `hover()`).
 * - `ui-089` re-run: a hidden part lights nothing. `ui-049` re-run: a lit body that leaves the
 *   scene leaves the highlight, under a resting pointer.
 * - **Made by… ›** opens the right row; several prompts filter the list; a part row selects that
 *   body and returns to the Inspector.
 * - Part 4, editing: **Edit reply**, **Edit request** (then **Edited**; past 20,000 characters it is
 *   refused in words), **Remove request** and **Combine with next** (not on the last row), each
 *   one step on the top-bar **Undo** and **Redo**, and a reload that keeps them. A 5,000-character
 *   request is stored whole.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three viewports with a snapshot at each: this changes the Inspector's layout and the phone
 * sheet. All three engines: the highlight is WebGL painting (tint and x-ray twins), and the edits
 * are document state persisted through IndexedDB and read back after a reload.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'prompts-view-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const FIRST = 'Two 20 mm cubes side by side\nA on the left, B in the middle'
const SECOND = 'A third cube on the right, and move B 10 mm back'

/** @param {import('@playwright/test').TestInfo} testInfo */
const isPhone = (testInfo) => testInfo.project.name.endsWith('-phone')

/**
 * Seed the two requests. Returns the three body ids.
 *
 * @param {import('@playwright/test').Page} page
 */
async function seed(page) {
  expect((await agentCall(page, 'record_prompt', { prompt: FIRST })).ok).toBe(true)
  const a = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [-35, 0, 0], params: { size: [20, 20, 20] } })
  const b = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } })
  expect((await agentCall(page, 'record_prompt', { prompt: SECOND })).ok).toBe(true)
  const c = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [35, 0, 0], params: { size: [20, 20, 20] } })
  for (const result of [a, b, c]) expect(result.ok, JSON.stringify(result)).toBe(true)
  const ids = { a: a.applied[0].bodyId, b: b.applied[0].bodyId, c: c.applied[0].bodyId }
  const moved = await agentCall(page, 'operate', { op: 'transform.translate', operands: [{ id: ids.b }], params: { deltaMm: [0, 10, 0] } })
  expect(moved.ok, JSON.stringify(moved)).toBe(true)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  return ids
}

/** @param {import('@playwright/test').Page} page */
async function boot(page) {
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installFakeWebMcp(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect.poll(() => registeredNames(page)).toContain('record_prompt')
  return errors
}

/**
 * The phone sheet is closed until its tab is tapped; wider layouts always show the panel.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openSheet(page) {
  const inspector = page.getByTestId('inspector')
  const tab = page.getByTestId('inspector-tab')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await tab.isVisible())) {
    await tab.click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
}

/**
 * A tap where the device has a touchscreen; elsewhere a click, then the mouse parked away, so a
 * resting pointer is not mistaken for the thing under test.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 * @param {import('@playwright/test').TestInfo} testInfo
 */
async function press(page, locator, testInfo) {
  await locator.scrollIntoViewIfNeeded()
  if (testInfo.project.use.hasTouch) {
    // Into the middle of its scroller, clear of the sheet's sticky Delete row at the bottom edge.
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    const box = await settledBox(locator)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    // The finger must land on the control itself, not on something drawn over it.
    const onTop = await locator.evaluate((el, at) => {
      const top = document.elementFromPoint(at.x, at.y)
      return el.contains(top) ? '' : `${top?.tagName}.${top?.className} [${top?.getAttribute('data-testid') ?? ''}] at ${Math.round(at.x)},${Math.round(at.y)}`
    }, { x, y })
    expect(onTop, 'the tap lands on the control, not on what is drawn over it').toBe('')
    await page.touchscreen.tap(x, y)
  } else {
    await locator.click()
    await parkPointer(page)
  }
}

/**
 * A box that has stopped moving (a sheet that is still scrolling or growing reports a stale one).
 *
 * @param {import('@playwright/test').Locator} locator
 */
async function settledBox(locator) {
  /** @type {{ x: number, y: number, width: number, height: number } | null} */
  let last = null
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const box = await locator.boundingBox()
    if (box && last && Math.abs(box.x - last.x) < 0.5 && Math.abs(box.y - last.y) < 0.5 && Math.abs(box.height - last.height) < 0.5) return box
    last = box
    await locator.page().waitForTimeout(50)
  }
  return /** @type {{ x: number, y: number, width: number, height: number }} */ (last)
}

/**
 * A real mouse arriving at a control, away from its centre: a touch tap leaves a phantom mouse at
 * the tap point, which the app rightly ignores (ui-049), and a previous tap may have been there.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 */
async function mouseOver(page, locator) {
  await parkPointer(page)
  await locator.scrollIntoViewIfNeeded()
  const box = await settledBox(locator)
  await page.mouse.move(box.x + 14, box.y + box.height / 2 - 3, { steps: 4 })
}

/** @param {import('@playwright/test').Page} page */
async function parkPointer(page) {
  await page.mouse.move(4, 4)
}

/** @param {import('@playwright/test').Page} page @param {import('@playwright/test').TestInfo} testInfo */
async function openPromptsView(page, testInfo) {
  await openSheet(page)
  if (isPhone(testInfo)) {
    await expect(page.getByTestId('inspector-prompts-open')).toBeHidden()
    await press(page, page.getByTestId('inspector-view-prompts'), testInfo)
  } else {
    await expect(page.getByTestId('inspector-view-prompts')).toBeHidden()
    await press(page, page.getByTestId('inspector-prompts-open'), testInfo)
  }
  await expect(page.getByTestId('prompts-view')).toBeVisible()
}

/**
 * Select a body from the Inspector's object list, the way a user who cannot see it would.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
async function selectFromList(page, id) {
  await openSheet(page)
  const list = page.getByTestId('object-list')
  const header = page.getByTestId('inspector-objects-header')
  await expect(list.or(header)).toBeVisible()
  if (!(await list.isVisible())) await header.click()
  await page.getByTestId(`objects-row-${id}`).click()
  await expect(page.getByTestId('inspector-name')).toBeVisible()
}

/** @param {import('@playwright/test').Page} page @param {string} promptIndex `0` or `1` */
const item = (page, promptIndex) => page.getByTestId('prompts-item').nth(Number(promptIndex))

/** @param {import('@playwright/test').Page} page */
const hoverBodies = (page) => page.getByTestId('viewport')

/** @param {string[]} ids */
const sorted = (...ids) => [...ids].sort().join(',')

/**
 * Photograph the WebGL canvas alone into a named slot in the page; only a count ever crosses
 * back. After `e2e/inspector-hidden-parts.e2e.js`: everything else is `visibility:hidden` (no
 * reflow), with `filter` and `backdrop-filter` off (`TODO/render-007`) — an opacity fade, and then
 * hiding only the viewport's own overlays, both still photographed a status toast at phone width. A copy is written to
 * the snapshot folder as evidence.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
async function snapshotCanvas(page, key) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const handle = await page.addStyleTag({
    // Everything but the canvas and its ancestors: the agent's status toasts sit over the canvas
    // at phone width too, outside the viewport and the Inspector, and come and go between shots.
    content:
      'body *:not(:has([data-testid=viewport-canvas])):not([data-testid=viewport-canvas])' +
      '{visibility:hidden !important;filter:none !important;backdrop-filter:none !important}',
  })
  try {
    const png = await page.getByTestId('viewport-canvas').screenshot({ path: join(SNAPSHOT_DIR, `canvas-${key}-${test.info().project.name}.png`) })
    await page.evaluate(
      async ({ b64, key }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const surface = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = /** @type {OffscreenCanvasRenderingContext2D} */ (surface.getContext('2d'))
        context.drawImage(bitmap, 0, 0)
        const store = /** @type {any} */ (window)
        store.__canvasSnaps = store.__canvasSnaps ?? {}
        store.__canvasSnaps[key] = context.getImageData(0, 0, bitmap.width, bitmap.height)
      },
      { b64: png.toString('base64'), key },
    )
  } finally {
    await handle.evaluate((node) => node.remove())
  }
}

/**
 * How many pixels differ visibly between two stored snapshots.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} a
 * @param {string} b
 * @returns {Promise<number>}
 */
function changedPixels(page, a, b) {
  return page.evaluate(
    ({ a, b }) => {
      const snaps = /** @type {any} */ (window).__canvasSnaps
      const first = snaps[a]
      const second = snaps[b]
      if (first.width !== second.width || first.height !== second.height) return -1
      let changed = 0
      for (let index = 0; index < first.data.length; index += 4) {
        const delta =
          Math.abs(first.data[index] - second.data[index]) +
          Math.abs(first.data[index + 1] - second.data[index + 1]) +
          Math.abs(first.data[index + 2] - second.data[index + 2])
        if (delta > 24) changed += 1
      }
      return changed
    },
    { a, b },
  )
}

/**
 * A baseline that has stopped changing: Chromium paints its touch tap highlight (a grey box over
 * the tapped control, drawn by the compositor, so no style hides it) for a moment after a tap, and
 * a baseline photographed under it never matches a later shot.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} key
 */
async function stableBaseline(page, key) {
  await expect
    .poll(
      async () => {
        await snapshotCanvas(page, key)
        await page.waitForTimeout(250)
        await snapshotCanvas(page, `${key}-again`)
        return changedPixels(page, key, `${key}-again`)
      },
      { timeout: 15_000 },
    )
    .toBeLessThan(40)
}

/**
 * Poll the canvas against `before` until the change count satisfies `expectation`; returns the
 * count. Only a settled picture is counted (two shots 250 ms apart agree), so a tap highlight
 * fading over the canvas can neither pass the "changed" check nor fail the "reverted" one.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} before
 * @param {string} key
 * @param {'changed' | 'reverted'} expectation
 */
async function canvasAgainst(page, before, key, expectation) {
  let changed = 0
  const poll = expect.poll(
    async () => {
      await snapshotCanvas(page, `${key}-first`)
      await page.waitForTimeout(250)
      await snapshotCanvas(page, key)
      if ((await changedPixels(page, `${key}-first`, key)) >= 40) return expectation === 'changed' ? -1 : Infinity
      changed = await changedPixels(page, before, key)
      return changed
    },
    { timeout: 15_000 },
  )
  if (expectation === 'changed') await poll.toBeGreaterThan(40)
  else await poll.toBeLessThan(40)
  return changed
}

/** @param {import('@playwright/test').Page} page */
const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test('no prompts: no Prompts bar and no Prompts tab', async ({ page }, testInfo) => {
  const errors = await boot(page)
  const made = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } })
  expect(made.ok, JSON.stringify(made)).toBe(true)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await openSheet(page)
  if (isPhone(testInfo)) await expect(page.getByTestId('inspector-view-variables')).toBeVisible()
  else await expect(page.getByTestId('inspector-objects')).toBeVisible()
  await expect(page.getByTestId('inspector-prompts-open')).toHaveCount(0)
  await expect(page.getByTestId('inspector-view-prompts')).toHaveCount(0)

  // Selecting the body adds no link either: no prompt made it.
  await selectFromList(page, made.applied[0].bodyId)
  await expect(page.getByTestId('inspector-prompt-link')).toHaveCount(0)
  await expect(page.getByTestId('inspector-prompts-open')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the Prompts view: two requests, one Add reply… each, a row lights its parts on the canvas; hidden parts and removed bodies light nothing', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const errors = await boot(page)
  const ids = await seed(page)
  const viewport = hoverBodies(page)

  await openPromptsView(page, testInfo)
  // The rest of the Inspector is replaced; the 3D view stays.
  await expect(page.getByTestId('inspector-objects')).toBeHidden()
  await expect(page.getByTestId('viewport-canvas')).toBeVisible()
  if (!isPhone(testInfo)) await expect(page.getByTestId('prompts-view-back')).toBeVisible()
  else await expect(page.getByTestId('prompts-view-back')).toBeHidden()

  // Oldest first; collapsed rows say first line, N parts, No reply.
  await expect(page.getByTestId('prompts-row')).toHaveCount(2)
  await expect(item(page, '0').getByTestId('prompts-row-text')).toHaveText('Two 20 mm cubes side by side')
  await expect(item(page, '0').getByTestId('prompts-row-parts')).toHaveText('2 parts')
  await expect(item(page, '1').getByTestId('prompts-row-parts')).toHaveText('2 parts')
  await expect(item(page, '1').getByTestId('prompts-row-reply')).toHaveText('No reply')
  await expect(page.getByTestId('prompt-reply-add')).toHaveCount(0)
  for (const row of await page.getByTestId('prompts-row').all()) expect((await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)

  // Nothing lit yet: the baseline picture.
  await parkPointer(page)
  await expect(viewport).toHaveAttribute('data-hover-bodies', '')
  await stableBaseline(page, 'before')

  // Expand the second request: its whole text, one Add reply…, its parts and roles; B and C lit.
  await press(page, item(page, '1').getByTestId('prompts-row'), testInfo)
  await expect(item(page, '1').getByTestId('prompts-row')).toHaveAttribute('aria-expanded', 'true')
  await expect(item(page, '1').getByTestId('prompts-row-full')).toHaveText(SECOND)
  await expect(item(page, '1').getByTestId('prompt-reply-add')).toHaveCount(1)
  await expect(page.getByTestId('prompt-reply-add')).toHaveCount(1)
  await expect(item(page, '1').getByTestId('prompts-part')).toHaveCount(2)
  await expect(item(page, '1').locator(`[data-testid="prompts-part"][data-body-id="${ids.b}"] [data-testid="prompts-part-role"]`)).toHaveText('Changed')
  await expect(item(page, '1').locator(`[data-testid="prompts-part"][data-body-id="${ids.c}"] [data-testid="prompts-part-role"]`)).toHaveText('Made')
  await expect(viewport).toHaveAttribute('data-hover-bodies', sorted(ids.b, ids.c))
  await expect(item(page, '1').getByTestId('prompts-row-highlighting')).toHaveText('Highlighting 2 parts')
  expect(Number(await viewport.getAttribute('data-hover-twins'))).toBeGreaterThan(0)
  // The rendered check: the lit parts' pixels actually change.
  const lit = await canvasAgainst(page, 'before', 'expanded', 'changed')
  testInfo.annotations.push({ type: 'pixels changed on expand', description: String(lit) })
  for (const part of await page.getByTestId('prompts-part').all()) expect((await part.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await noSidewaysScroll(page)).toBe(true)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `prompts-view-${testInfo.project.name}.png`) })

  // Expanding the first moves the highlight to A and B; collapsing it clears it, and the canvas reverts.
  await press(page, item(page, '0').getByTestId('prompts-row'), testInfo)
  await expect(item(page, '1').getByTestId('prompts-row')).toHaveAttribute('aria-expanded', 'false')
  await expect(item(page, '0').getByTestId('prompt-reply-add')).toHaveCount(1)
  await expect(page.getByTestId('prompt-reply-add')).toHaveCount(1)
  await expect(viewport).toHaveAttribute('data-hover-bodies', sorted(ids.a, ids.b))
  await press(page, item(page, '0').getByTestId('prompts-row'), testInfo)
  await expect(viewport).toHaveAttribute('data-hover-bodies', '')
  await canvasAgainst(page, 'before', 'collapsed', 'reverted')

  if (!isPhone(testInfo)) {
    // A mouse over a row lights it; leaving clears it.
    await mouseOver(page, item(page, '0').getByTestId('prompts-row'))
    await expect(viewport).toHaveAttribute('data-hover-bodies', sorted(ids.a, ids.b))
    await parkPointer(page)
    await expect(viewport).toHaveAttribute('data-hover-bodies', '')
    // Keyboard focus lights a row (not a click's own focus: wait out the press window).
    await page.waitForTimeout(900)
    await item(page, '1').getByTestId('prompts-row').focus()
    await expect(viewport).toHaveAttribute('data-hover-bodies', sorted(ids.b, ids.c))
    await page.getByTestId('prompts-view-back').focus()
    await expect(viewport).toHaveAttribute('data-hover-bodies', '')
    // One part row lights only that part, over its expanded row's highlight; leaving returns to the row.
    await press(page, item(page, '1').getByTestId('prompts-row'), testInfo)
    await expect(viewport).toHaveAttribute('data-hover-bodies', sorted(ids.b, ids.c))
    await mouseOver(page, item(page, '1').locator(`[data-testid="prompts-part"][data-body-id="${ids.c}"]`))
    await expect(viewport).toHaveAttribute('data-hover-bodies', ids.c)
    await expect(viewport).toHaveAttribute('data-hover', ids.c)
    await expect(item(page, '1').getByTestId('prompts-row-highlighting')).toHaveText('Highlighting 1 part')
    await parkPointer(page)
    await expect(viewport).toHaveAttribute('data-hover-bodies', sorted(ids.b, ids.c))
    await press(page, item(page, '1').getByTestId('prompts-row'), testInfo)
    await expect(viewport).toHaveAttribute('data-hover-bodies', '')
  }

  // ui-089 re-run: a hidden part lights nothing. Hide C, expand the second request: only B lit.
  await page.evaluate(async (id) => {
    const documentModule = await /** @type {any} */ (window).__e2eImport('/src/stores/document.js')
    documentModule.useDocumentStore().setViewHidden(id, { hidden: true })
  }, ids.c)
  await press(page, item(page, '1').getByTestId('prompts-row'), testInfo)
  await expect(item(page, '1').locator(`[data-testid="prompts-part"][data-body-id="${ids.c}"] [data-testid="prompts-part-hidden"]`)).toHaveText('hidden')
  await expect(viewport).toHaveAttribute('data-hover-bodies', ids.b)
  await expect(item(page, '1').getByTestId('prompts-row-highlighting')).toHaveText('Highlighting 1 part')
  if (!isPhone(testInfo)) {
    await mouseOver(page, item(page, '1').locator(`[data-testid="prompts-part"][data-body-id="${ids.c}"]`))
    await expect(viewport).toHaveAttribute('data-hover-bodies', '')
    await expect(viewport).toHaveAttribute('data-hover-twins', '0')
    await parkPointer(page)
    await expect(viewport).toHaveAttribute('data-hover-bodies', ids.b)
  }
  // Collapse, then show C again.
  await press(page, item(page, '1').getByTestId('prompts-row'), testInfo)
  await expect(viewport).toHaveAttribute('data-hover-bodies', '')
  await page.evaluate(async (id) => {
    const documentModule = await /** @type {any} */ (window).__e2eImport('/src/stores/document.js')
    documentModule.useDocumentStore().setViewHidden(id, { hidden: false })
  }, ids.c)

  // ui-049 re-run: a lit body that leaves the scene (an undo of the last agent step is not ours to
  // take, so a delete) leaves the highlight, under a resting pointer, and its twins with it.
  await press(page, item(page, '0').getByTestId('prompts-row'), testInfo)
  await expect(viewport).toHaveAttribute('data-hover-bodies', sorted(ids.a, ids.b))
  const twinsBefore = Number(await viewport.getAttribute('data-hover-twins'))
  await page.evaluate(async (id) => {
    const documentModule = await /** @type {any} */ (window).__e2eImport('/src/stores/document.js')
    documentModule.useDocumentStore().deleteBodies([id])
  }, ids.a)
  await expect(viewport).toHaveAttribute('data-body-count', '2')
  await expect(viewport).toHaveAttribute('data-hover-bodies', ids.b)
  expect(Number(await viewport.getAttribute('data-hover-twins'))).toBeLessThan(twinsBefore)
  await expect(item(page, '0').getByTestId('prompts-row-parts')).toHaveText('1 part')

  // Closing the view clears the highlight.
  if (isPhone(testInfo)) await press(page, page.getByTestId('inspector-view-inspector'), testInfo)
  else await press(page, page.getByTestId('prompts-view-back'), testInfo)
  await expect(page.getByTestId('prompts-view')).toHaveCount(0)
  await expect(viewport).toHaveAttribute('data-hover-bodies', '')
  expect(errors).toEqual([])
})

test('Made by… › opens the right request; several prompts filter the list; a part row selects and returns to the Inspector', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const errors = await boot(page)
  const ids = await seed(page)
  const viewport = hoverBodies(page)

  // B: made by the first request, changed by the second.
  await selectFromList(page, ids.b)
  const link = page.getByTestId('inspector-prompt-link')
  await link.scrollIntoViewIfNeeded()
  await expect(link.getByTestId('inspector-prompt-link-lead')).toHaveText('Made by 1, changed by 1')
  expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  if (!isPhone(testInfo)) {
    // A mouse over the link lights the requests' parts, as a row does.
    await mouseOver(page, link)
    await expect(viewport).toHaveAttribute('data-hover-bodies', sorted(ids.a, ids.b, ids.c))
    await parkPointer(page)
    await expect(viewport).toHaveAttribute('data-hover-bodies', '')
  }
  await press(page, link, testInfo)
  await expect(page.getByTestId('prompts-view')).toBeVisible()
  await expect(page.getByTestId('prompts-view-filter')).toContainText('For ')
  await expect(page.getByTestId('prompts-row')).toHaveCount(2)
  // Opening the view left the selection alone.
  await expect(viewport).toHaveAttribute('data-selected-id', ids.b)
  await expect(item(page, '0')).toHaveAttribute('data-marked', 'true')
  await expect(item(page, '1')).toHaveAttribute('data-marked', 'true')

  // A part row selects that body and returns to the Inspector.
  await press(page, item(page, '1').getByTestId('prompts-row'), testInfo)
  await press(page, item(page, '1').locator(`[data-testid="prompts-part"][data-body-id="${ids.c}"]`), testInfo)
  await expect(page.getByTestId('prompts-view')).toHaveCount(0)
  await expect(viewport).toHaveAttribute('data-selected-id', ids.c)
  await expect(page.getByTestId('inspector-name')).toBeVisible()
  await expect(viewport).toHaveAttribute('data-hover-bodies', '')

  // C: made by the second request only. Its link names it and opens it, expanded and in view.
  const cLink = page.getByTestId('inspector-prompt-link')
  await cLink.scrollIntoViewIfNeeded()
  await expect(cLink.getByTestId('inspector-prompt-link-lead')).toHaveText('Made by')
  await expect(cLink.getByTestId('inspector-prompt-link-text')).toHaveText(SECOND)
  await press(page, cLink, testInfo)
  await expect(page.getByTestId('prompts-view')).toBeVisible()
  await expect(page.getByTestId('prompts-view-filter')).toHaveCount(0)
  const second = page.locator('[data-testid="prompts-item"][data-expanded="true"]')
  await expect(second).toHaveCount(1)
  await expect(second.getByTestId('prompts-row-full')).toHaveText(SECOND)
  await expect(second).toBeInViewport()
  await expect(viewport).toHaveAttribute('data-hover-bodies', sorted(ids.b, ids.c))
  expect(await noSidewaysScroll(page)).toBe(true)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `prompts-link-${testInfo.project.name}.png`) })

  // Selecting in the 3D view keeps the view open (here through the store, as a viewport pick does).
  await page.evaluate(async (id) => {
    const selectionModule = await /** @type {any} */ (window).__e2eImport('/src/stores/selection.js')
    selectionModule.useSelectionStore().select(id)
  }, ids.a)
  await expect(page.getByTestId('prompts-view')).toBeVisible()
  await expect(item(page, '0')).toHaveAttribute('data-marked', 'true')
  await expect(item(page, '1')).toHaveAttribute('data-marked', 'false')
  expect(errors).toEqual([])
})

/** @param {import('@playwright/test').Page} page */
async function waitForAutosave(page) {
  await expect(page.getByTestId('save-status-text')).toHaveText(/^Saved · \d\d:\d\d$/, { timeout: 15_000 })
}

/**
 * Press Undo or Redo in the top bar, after checking it names the step.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'undo' | 'redo'} which
 * @param {string} label
 * @param {import('@playwright/test').TestInfo} testInfo
 */
async function history(page, which, label, testInfo) {
  const button = page.getByTestId(`${which}-button`)
  await expect(button).toHaveAttribute(`data-${which}-label`, label)
  await expect(button).toBeEnabled()
  await press(page, button, testInfo)
}

const EDITED_SECOND = 'A third cube on the right; move B 10 mm back, along +Y'
const REPLY = 'Placed C and moved B.'
const EDITED_REPLY = 'Placed C; moved B 10 mm back.'

test('editing (part 4): Edit reply, Edit request, Remove request, Combine with next — each undone and redone, and kept by a reload', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000)
  const errors = await boot(page)
  const ids = await seed(page)
  // The agent's reply lands on the request it is bound to: the second.
  const replied = await agentCall(page, 'record_response', { response: REPLY })
  expect(replied.ok, JSON.stringify(replied)).toBe(true)
  await openPromptsView(page, testInfo)
  const viewport = hoverBodies(page)

  // Expanded, a row offers every edit; the last row has no Combine with next.
  await press(page, item(page, '1').getByTestId('prompts-row'), testInfo)
  await expect(item(page, '1').getByTestId('prompt-reply-text')).toHaveText(REPLY)
  await expect(item(page, '1').getByTestId('prompts-edit-request')).toBeVisible()
  await expect(item(page, '1').getByTestId('prompts-remove-request')).toBeVisible()
  await expect(item(page, '1').getByTestId('prompts-combine-next')).toHaveCount(0)
  for (const control of await item(page, '1').locator('[data-testid="prompts-row-edits"] button, [data-testid="prompt-reply-edit"], [data-testid="prompt-reply-remove"], [data-testid="prompt-reply-add"]').all()) {
    // To 1/100 px: Firefox lays out in 1/60 px units and reports a 44 px button as 43.99997.
    expect(Math.round(((await control.boundingBox())?.height ?? 0) * 100) / 100).toBeGreaterThanOrEqual(44)
  }
  expect(await noSidewaysScroll(page)).toBe(true)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `prompts-edit-${testInfo.project.name}.png`) })

  // Edit reply: a text area holding the whole reply; Save; Undo; Redo.
  await press(page, item(page, '1').getByTestId('prompt-reply-edit'), testInfo)
  const replyInput = item(page, '1').getByTestId('prompt-reply-edit-input')
  await expect(replyInput).toHaveValue(REPLY)
  await replyInput.fill(EDITED_REPLY)
  expect(await noSidewaysScroll(page)).toBe(true)
  await press(page, item(page, '1').getByTestId('prompt-reply-edit-save'), testInfo)
  await expect(item(page, '1').getByTestId('prompt-reply-text')).toHaveText(EDITED_REPLY)
  await history(page, 'undo', 'Edit reply', testInfo)
  await expect(item(page, '1').getByTestId('prompt-reply-text')).toHaveText(REPLY)
  await history(page, 'redo', 'Edit reply', testInfo)
  await expect(item(page, '1').getByTestId('prompt-reply-text')).toHaveText(EDITED_REPLY)

  // Edit request: past the cap it is refused in words and nothing changes; then saved, it reads Edited.
  await press(page, item(page, '1').getByTestId('prompts-edit-request'), testInfo)
  const requestInput = item(page, '1').getByTestId('prompts-edit-request-input')
  await expect(requestInput).toHaveValue(SECOND)
  await requestInput.fill('x'.repeat(20_001))
  await press(page, item(page, '1').getByTestId('prompts-edit-request-save'), testInfo)
  await expect(item(page, '1').getByTestId('prompts-row-problem')).toContainText('over the cap of 20000')
  await expect(page.getByTestId('undo-button')).toHaveAttribute('data-undo-label', 'Edit reply')
  await requestInput.fill(EDITED_SECOND)
  await press(page, item(page, '1').getByTestId('prompts-edit-request-save'), testInfo)
  await expect(item(page, '1').getByTestId('prompts-row-full')).toHaveText(EDITED_SECOND)
  await expect(item(page, '1').getByTestId('prompts-row-edited')).toHaveText('Edited')
  await expect(item(page, '1').getByTestId('prompts-row-problem')).toHaveCount(0)
  await history(page, 'undo', 'Edit request', testInfo)
  await expect(item(page, '1').getByTestId('prompts-row-full')).toHaveText(SECOND)
  await expect(item(page, '1').getByTestId('prompts-row-edited')).toHaveCount(0)
  await history(page, 'redo', 'Edit request', testInfo)
  await expect(item(page, '1').getByTestId('prompts-row-full')).toHaveText(EDITED_SECOND)

  // Remove request: the record only — its parts stay. Undo brings it back in its place.
  await press(page, item(page, '1').getByTestId('prompts-remove-request'), testInfo)
  await expect(page.getByTestId('prompts-row')).toHaveCount(1)
  await expect(viewport).toHaveAttribute('data-body-count', '3')
  await history(page, 'undo', 'Remove request', testInfo)
  await expect(page.getByTestId('prompts-row')).toHaveCount(2)
  await expect(item(page, '1').getByTestId('prompts-row-text')).toHaveText(EDITED_SECOND)
  await history(page, 'redo', 'Remove request', testInfo)
  await expect(page.getByTestId('prompts-row')).toHaveCount(1)
  await history(page, 'undo', 'Remove request', testInfo)
  await expect(page.getByTestId('prompts-row')).toHaveCount(2)

  // Combine with next, from the first row: one request, this then a blank line then next; all
  // three parts; the second's reply. Undo restores two; Redo combines again.
  const firstRow = item(page, '0').getByTestId('prompts-row')
  if ((await firstRow.getAttribute('aria-expanded')) !== 'true') await press(page, firstRow, testInfo)
  await expect(item(page, '0').getByTestId('prompts-combine-next')).toBeVisible()
  await press(page, item(page, '0').getByTestId('prompts-combine-next'), testInfo)
  await expect(page.getByTestId('prompts-row')).toHaveCount(1)
  await expect(item(page, '0').getByTestId('prompts-row-full')).toHaveText(`${FIRST}\n\n${EDITED_SECOND}`)
  expect(await item(page, '0').getByTestId('prompts-row-full').textContent()).toBe(`${FIRST}\n\n${EDITED_SECOND}`)
  await expect(item(page, '0').getByTestId('prompts-row-edited')).toHaveText('Edited')
  await expect(item(page, '0').getByTestId('prompts-row-parts')).toHaveText('3 parts')
  await expect(item(page, '0').getByTestId('prompt-reply-text')).toHaveText(EDITED_REPLY)
  await expect(item(page, '0').getByTestId('prompt-reply-add')).toHaveCount(1)
  await expect(item(page, '0').getByTestId('prompts-combine-next')).toHaveCount(0)
  await expect(viewport).toHaveAttribute('data-hover-bodies', sorted(ids.a, ids.b, ids.c))
  await history(page, 'undo', 'Combine requests', testInfo)
  await expect(page.getByTestId('prompts-row')).toHaveCount(2)
  await expect(item(page, '0').getByTestId('prompts-row-text')).toHaveText('Two 20 mm cubes side by side')
  await expect(item(page, '0').getByTestId('prompts-row-edited')).toHaveCount(0)
  await expect(item(page, '1').getByTestId('prompts-row-text')).toHaveText(EDITED_SECOND)
  await history(page, 'redo', 'Combine requests', testInfo)
  await expect(page.getByTestId('prompts-row')).toHaveCount(1)
  expect(await noSidewaysScroll(page)).toBe(true)

  // A reload keeps the combined request, its Edited label, its parts and its reply.
  await waitForAutosave(page)
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  await openPromptsView(page, testInfo)
  await expect(page.getByTestId('prompts-row')).toHaveCount(1)
  await expect(item(page, '0').getByTestId('prompts-row-edited')).toHaveText('Edited')
  await expect(item(page, '0').getByTestId('prompts-row-parts')).toHaveText('3 parts')
  await press(page, item(page, '0').getByTestId('prompts-row'), testInfo)
  await expect(item(page, '0').getByTestId('prompts-row-full')).toHaveText(`${FIRST}\n\n${EDITED_SECOND}`)
  expect(await item(page, '0').getByTestId('prompts-row-full').textContent()).toBe(`${FIRST}\n\n${EDITED_SECOND}`)
  await expect(item(page, '0').getByTestId('prompt-reply-text')).toHaveText(EDITED_REPLY)
  expect(errors).toEqual([])
})

test('a 5,000-character request is stored whole, and kept by a reload', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors = await boot(page)
  const paragraph = (/** @type {number} */ i) => `Section ${i}: a long request, as the owner sends one.`.padEnd(499, '.')
  // Ten paragraphs on their own lines, past the old 4,000 cap, exactly 5,000 characters.
  const long = Array.from({ length: 10 }, (_, i) => paragraph(i + 1)).join('\n').padEnd(5000, '.')
  expect(long).toHaveLength(5000)
  const recorded = await agentCall(page, 'record_prompt', { prompt: long })
  expect(recorded.ok, JSON.stringify(recorded)).toBe(true)
  const made = await agentCall(page, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } })
  expect(made.ok, JSON.stringify(made)).toBe(true)
  await openPromptsView(page, testInfo)
  await expect(page.getByTestId('prompts-row')).toHaveCount(1)
  await press(page, item(page, '0').getByTestId('prompts-row'), testInfo)
  const full = item(page, '0').getByTestId('prompts-row-full')
  await expect(full).toHaveText(long)
  // Exactly, newlines and all — `toHaveText` alone folds whitespace.
  expect(await full.textContent()).toBe(long)
  expect(await page.evaluate(async () => {
    const documentModule = await /** @type {any} */ (window).__e2eImport('/src/stores/document.js')
    return documentModule.useDocumentStore().raw.prompts()[0].text.length
  })).toBe(5000)
  expect(await noSidewaysScroll(page)).toBe(true)
  await waitForAutosave(page)
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await openPromptsView(page, testInfo)
  await press(page, item(page, '0').getByTestId('prompts-row'), testInfo)
  await expect(item(page, '0').getByTestId('prompts-row-full')).toHaveText(long)
  expect(await item(page, '0').getByTestId('prompts-row-full').textContent()).toBe(long)
  expect(errors).toEqual([])
})

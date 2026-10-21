// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The Operations toolbar and `NavigationChrome` never intersect at phone width
 * (`TODO/ui-043`), for every combination of selection count and phone-width bottom
 * sheet the two controls have to coexist with.
 *
 * ## The measured baseline this spec guards against regressing
 *
 * At **390x844 WebKit**, with **exactly one body selected and the Inspector's bottom
 * sheet open** (which auto-opens on any selection — `ui-011`), the toolbar measured
 * `top 61, bottom 228` and the chrome `top 207, bottom 407` — a **21px overlap**,
 * reproducing `TODO/ui-043`'s own recorded numbers exactly. Investigating further
 * (this task's own Step 3, not assumed from the TODO file) found a **second,
 * previously unmeasured overlap**: at **two** selected with the Inspector still open
 * (`ui-041`/`ui-042`'s own drives only ever measured two-selected with the *Objects*
 * sheet open, never with the Inspector's own full sheet), the toolbar measured
 * `bottom 213` against the same chrome `top 207` — a further **6px overlap**. Both are
 * asserted against here, not just the one the file named.
 *
 * The fix (`OperationsToolbar.vue`) shortens the disabled-state legend at phone width
 * so it stops wrapping to a second line, and trims the toolbar's own internal
 * spacing (container gap/padding, the gap between wrapped button rows) within the
 * same `@media (max-width: 640px)` block that already governs this toolbar's other
 * phone-only compaction — never `--inspector-sheet-height`/`--bottom-panel-height`
 * (CLAUDE.md's explicit "do not shrink a bottom sheet's height" rule) and never
 * `--tap-compact` (the shared 38px touch-target token `NavigationChrome.vue` and
 * `SketchToolbar.vue` also read).
 *
 * ## Engines and viewports
 *
 * All three reference viewports (this file's whole point is a phone-width layout
 * bug, but `CLAUDE.md` asks any layout/overlay spec to run at all three and guard
 * against a laptop/tablet regression too — at >=641px neither sheet pushes the
 * chrome at all, so the overlap assertions are expected to hold trivially there,
 * which is itself the regression guard). Chromium and WebKit (Firefox fails at
 * browser launch in this sandbox — `TROUBLESHOOTING.md` — and is not claimed).
 */

/** @param {import('@playwright/test').Page} page */
function storeApi(page) {
  return {
    /** @param {(api: any, arg: any) => any} fn @param {any} [arg] */
    run: (fn, arg) =>
      page
        .evaluateHandle(async () => {
          const documentModule = await window.__e2eImport('/src/stores/document.js')
          const selectionModule = await window.__e2eImport('/src/stores/selection.js')
          const api = {
            documentStore: documentModule.useDocumentStore(),
            selection: selectionModule.useSelectionStore(),
          }
          return api
        })
        .then(async (handle) => {
          try {
            return await handle.evaluate(fn, arg)
          } finally {
            await handle.dispose()
          }
        }),
  }
}

/**
 * A cube and a translated-away hardware bolt (a composite with named parts, so the
 * object list's disclosure chevron has something to expand — `TODO/ui-042`).
 * Neither overlaps the other; nothing here runs a boolean, so overlap is irrelevant.
 *
 * The translate record deliberately carries `consumes`, not `supersedes` — the same
 * shortcut `inspector-object-list.e2e.js`'s own `seedEnclosed` uses — so this fixture never
 * assumes which id (the created record's or the translate's) ends up naming the
 * lineage; {@link bodyIdByName} below reads it back rather than hardcoding it,
 * exactly as that file's own `bodyNamed` does.
 *
 * @param {import('@playwright/test').Page} page
 */
async function seedScene(page) {
  await storeApi(page).run((api) => {
    api.documentStore.append({
      id: 'cubeA',
      op: 'primitive.cuboid',
      name: 'Cube 1',
      params: { size: [40, 40, 40], center: [0, 0, 20] },
    })
    api.documentStore.append({
      id: 'boltA',
      op: 'hardware.bolt',
      name: 'Bolt 1',
      params: { spec: 'm10 hex', length: 30 },
    })
    api.documentStore.append({
      id: 'boltAt',
      op: 'transform.translate',
      name: 'Bolt 1',
      target: 'boltA',
      consumes: ['boltA'],
      params: { vector: [120, 0, 0] },
    })
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
}

/**
 * The scene list's own reported id for a body named `name` — never assumed from the
 * id an `append` call happened to use, since `consumes` mints a fresh lineage rooted
 * at its own record id (see {@link seedScene}'s own note).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function bodyIdByName(page, name) {
  const id = await page.evaluate((name) => {
    const li = Array.from(document.querySelectorAll('[data-testid="scene-bodies"] li')).find(
      (node) => node.getAttribute('data-body-name') === name,
    )
    return li?.getAttribute('data-body-id') ?? null
  }, name)
  if (!id) throw new Error(`no body named ${name} in the scene list`)
  return id
}

/**
 * Select exactly `count` bodies (0, 1 or 2) through the selection store directly —
 * this spec's whole claim is about layout, not about how a selection is reached, so
 * seeding it this way (the same technique `inspector-object-list.e2e.js`/`ui-041` uses) keeps
 * every state cheap and exact rather than depending on click geometry.
 *
 * @param {import('@playwright/test').Page} page
 * @param {0 | 1 | 2} count
 * @param {[string, string]} ids The two real body ids, in selection order.
 */
async function selectCount(page, count, ids) {
  await storeApi(page).run(
    (api, { count, ids }) => {
      api.selection.clear()
      for (let index = 0; index < count; index += 1) api.selection.toggle(ids[index])
    },
    { count, ids },
  )
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', String(count))
}

/**
 * Bounding rectangle of a test id, or `null` when it is not rendered (a sheet that
 * is closed, a toolbar hidden while the sketch editor is open — neither happens in this spec, but the
 * null case is checked explicitly rather than assumed away).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testId
 */
function rectOf(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return null
    const box = el.getBoundingClientRect()
    if (box.width === 0 && box.height === 0) return null
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
  }, testId)
}

/** @param {{ left: number, top: number, right: number, bottom: number }} a @param {typeof a} b */
function rectsOverlap(a, b) {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
}

/** Trial-click: does the topmost element at the target's own centre belong to it? */
async function trialClickable(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return { found: false, topmostIsItem: false }
    const box = el.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const top = document.elementFromPoint(x, y)
    return {
      found: true,
      topmostIsItem: top !== null && (el === top || el.contains(top) || top.contains(el)),
    }
  }, testId)
}

const TOOLBAR_BUTTONS = [
  'operation-union',
  'operation-subtract',
  'operation-intersect',
  'operation-group',
  'operation-align', // one button since TODO/ui-060 (Snap folded into it)
  'operation-fillet',
  'operation-chamfer',
  'operation-enlarge',
  'operation-fit',
  'operation-bisect',
]

const CHROME_BUTTONS = ['nav-mode-orbit', 'nav-mode-pan', 'nav-mode-select']

/**
 * Put the object list on screen. Since `TODO/ui-049` it lives in the Inspector, so
 * "the Objects sheet" is the Inspector's own sheet showing the list: tap the tab if the
 * sheet is down (it reads `Objects (n)` with nothing selected — the new state this task
 * adds, and so the one most worth measuring), then the section header if it is folded.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openObjects(page) {
  const list = page.getByTestId('object-list')
  if (await list.isVisible()) return
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
  }
  if (!(await list.isVisible())) await page.getByTestId('inspector-objects-header').click()
  await expect(list).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function openHistory(page) {
  const panel = page.getByTestId('timeline-panel')
  if (await panel.isVisible()) return
  await page.getByTestId('timeline-toggle').click()
  await expect(panel).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function closeSheets(page) {
  // With nothing selected an open Inspector sheet is the list the user opened from its
  // tab: tap the tab to put it down again. With a selection the sheet is the Inspector's
  // own auto-open, which is the `inspector-auto` state this spec measures on purpose.
  const inspector = page.getByTestId('inspector')
  if (
    (await inspector.getAttribute('data-state')) === 'empty' &&
    (await inspector.getAttribute('data-open')) === 'true' &&
    (await page.getByTestId('inspector-tab').isVisible())
  ) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'false')
  }
  const history = page.getByTestId('timeline-panel')
  if (await history.isVisible()) {
    await page.getByTestId('timeline-toggle').click()
    await expect(history).toBeHidden()
  }
}

/**
 * Assert the toolbar and the chrome do not intersect right now, and that every
 * toolbar button and every named chrome button passes a trial click — "receives
 * pointer events", not just "exists in the DOM", per `ui-035`'s own precedent
 * (`boolean-operations.e2e.js`) for exactly this class of defect.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label For the assertion messages.
 */
async function assertNoOverlapAndReachable(page, label) {
  // Since `TODO/ui-046` the chrome collapses to a single toggle while a sheet raises
  // it at phone width. This spec's claim is about the *expanded* footprint — the
  // largest the chrome gets next to the toolbar — so open it first when collapsed.
  const expand = page.getByTestId('nav-expand-toggle')
  if ((await expand.isVisible()) && (await expand.getAttribute('aria-expanded')) === 'false') {
    await expand.click()
    await expect(expand).toHaveAttribute('aria-expanded', 'true')
  }

  const toolbar = await rectOf(page, 'operations-toolbar')
  const chrome = await rectOf(page, 'navigation-chrome')
  expect(toolbar, `${label}: toolbar must be rendered`).not.toBeNull()
  expect(chrome, `${label}: chrome must be rendered`).not.toBeNull()
  expect(
    rectsOverlap(/** @type {any} */ (toolbar), /** @type {any} */ (chrome)),
    `${label}: toolbar ${JSON.stringify(toolbar)} intersects chrome ${JSON.stringify(chrome)}`,
  ).toBe(false)

  for (const testId of TOOLBAR_BUTTONS) {
    const reach = await trialClickable(page, testId)
    expect(reach.found, `${label}: ${testId} must be rendered`).toBe(true)
    expect(reach.topmostIsItem, `${label}: ${testId} trial click lands on it`).toBe(true)
  }
  for (const testId of CHROME_BUTTONS) {
    const reach = await trialClickable(page, testId)
    expect(reach.found, `${label}: ${testId} must be rendered`).toBe(true)
    expect(reach.topmostIsItem, `${label}: ${testId} trial click lands on it`).toBe(true)
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('Operations toolbar and navigation chrome never intersect, every control stays clickable, across 0/1/2 selected and none/Inspector/Objects/History sheets (TODO/ui-043)', async ({
  page,
}) => {
  await seedScene(page)
  const cubeId = await bodyIdByName(page, 'Cube 1')
  const boltId = await bodyIdByName(page, 'Bolt 1')

  for (const count of /** @type {const} */ ([0, 1, 2])) {
    // --- none: at 0 selected this is really "nothing open"; at 1/2 selected the
    // Inspector auto-opens (`ui-011`) — this is the state the TODO's own 21px number
    // and this task's own newly-found 6px number both come from. ---------------------
    await closeSheets(page)
    await selectCount(page, count, [cubeId, boltId])
    await assertNoOverlapAndReachable(page, `count=${count} sheet=inspector-auto`)

    // --- The object list open in the Inspector (ui-041/ui-042's regression surface,
    // moved by ui-049; at 0 selected this is the sheet opened from its `Objects (n)` tab). -
    await openObjects(page)
    await assertNoOverlapAndReachable(page, `count=${count} sheet=objects`)
    await closeSheets(page)

    // --- History sheet open (ui-032's own regression surface). ------------------------
    await openHistory(page)
    await assertNoOverlapAndReachable(page, `count=${count} sheet=history`)
    await closeSheets(page)
  }
})

test('a taller object list (a composite expanded, TODO/ui-042, in the Inspector since ui-049) does not reintroduce the overlap (TODO/ui-043)', async ({
  page,
}) => {
  await seedScene(page)
  const cubeId = await bodyIdByName(page, 'Cube 1')
  const boltId = await bodyIdByName(page, 'Bolt 1')
  await selectCount(page, 1, [cubeId, boltId])
  await openObjects(page)

  const expandButton = page.getByTestId(`objects-expand-${boltId}`)
  await expect(expandButton).toBeVisible()
  await expandButton.click()
  await expect(page.getByTestId(`objects-parts-${boltId}`)).toBeVisible()

  await assertNoOverlapAndReachable(page, 'count=1 sheet=objects (composite expanded)')

  // Select a second body too — the combination `ui-042`'s own re-check drove but this
  // task's own toolbar-height change had not yet landed for.
  await selectCount(page, 2, [cubeId, boltId])
  await assertNoOverlapAndReachable(page, 'count=2 sheet=objects (composite expanded)')
})

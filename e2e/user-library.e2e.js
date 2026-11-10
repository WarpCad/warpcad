// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { showRowSettings, withRowSettings } from './support/libraryRow.js'
import { importPartFile, myPartsCount } from './support/importModel.js'
import { serializePartFile } from '../src/core/userPartFile.js'

/**
 * Save a group to the library and place it again (`TODO/ui-055`), driven against `/`.
 *
 * The flow is the TODO's own example, end to end: place a Cube and a Cylinder, combine them
 * into a group, **Save to library…**, name it *Standoff*, reload, start **File ▸ New**, find it
 * under **My parts**, drag it in, and check it is the same thing — one body, the same two named
 * sub-parts, the same size — not a partial one.
 *
 * **Input is real, not synthetic.** A synthetic `PointerEvent` goes straight to the element and
 * never hit-tests, which is how two phone-width bugs (a sheet burying a drag handle; a
 * `pointercancel` at 0,0) once passed a spec and failed in a hand. So: Chromium at phone and
 * tablet width drives **trusted touch** through CDP (`Input.dispatchTouchEvent`); every other
 * project uses Playwright's real mouse (or `tap()` where the project has touch), with human-ish
 * pacing, and every press first asserts `document.elementFromPoint` at its target is that target.
 *
 * All three engines and all three viewports: IndexedDB (the library), canvas (the drop and the
 * thumbnail) and touch. Firefox cannot launch in some sandboxes (`TROUBLESHOOTING.md`,
 * 2026-09-17); that is the environment, not this spec.
 */

/** @param {import('@playwright/test').TestInfo} info */
const isPhone = (info) => info.project.name.endsWith('-phone')
/** @param {import('@playwright/test').TestInfo} info */
const usesTrustedTouch = (info) => info.project.name.startsWith('chromium') && !info.project.name.endsWith('-laptop')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const wobble = (n) => (Math.random() - 0.5) * n

/**
 * Pointer helpers bound to one page: real mouse, or trusted CDP touch where the project has it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').TestInfo} info
 */
async function pointer(page, info) {
  const cdp = usesTrustedTouch(info) ? await page.context().newCDPSession(page) : null
  const touchTap = info.project.use.hasTouch && !info.project.name.startsWith('firefox')

  /** The element under (x, y) must be (inside) the target — the hit test a synthetic event skips. */
  async function expectHit(x, y, testid) {
    const hit = await page.evaluate(
      ([px, py, id]) => {
        const el = document.elementFromPoint(px, py)
        return { ok: !!el && !!el.closest(`[data-testid="${id}"]`), what: el ? `${el.tagName}[${el.getAttribute('data-testid') ?? ''}]` : 'nothing' }
      },
      [x, y, testid],
    )
    expect(hit.ok, `${testid} at ${Math.round(x)},${Math.round(y)} is covered by ${hit.what}`).toBe(true)
  }

  /**
   * Scroll only the target's nearest scroller (as a finger would) so it sits in the upper part of its sheet (clear of any tab stacked over the bottom), and return its centre.
   * @param {import('@playwright/test').Locator} locator
   */
  async function centreOf(locator) {
    await locator.evaluate((el) => {
      let a = el.parentElement
      while (a && !(a.scrollHeight > a.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(a).overflowY))) a = a.parentElement
      if (!a) return
      const er = el.getBoundingClientRect()
      const ar = a.getBoundingClientRect()
      a.scrollTop += er.top + er.height / 2 - (ar.top + ar.height * 0.35)
    })
    await sleep(80)
    const b = await locator.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })
    return { x: b.x + b.width / 2 + wobble(Math.min(6, b.width / 3)), y: b.y + b.height / 2 + wobble(Math.min(6, b.height / 3)) }
  }

  /** @param {import('@playwright/test').Locator} locator */
  async function press(locator) {
    const testid = await locator.getAttribute('data-testid')
    const { x, y } = await centreOf(locator)
    await expectHit(x, y, String(testid))
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
      await sleep(60)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } else if (touchTap) {
      await page.touchscreen.tap(x, y)
    } else {
      await page.mouse.move(x - 12, y - 6, { steps: 4 })
      await page.mouse.move(x, y, { steps: 3 })
      await page.mouse.down()
      await sleep(50)
      await page.mouse.up()
    }
    await sleep(160)
  }

  /**
   * Drag a Library row to (ex, ey): press, glide with wobble, hold, release.
   * @param {import('@playwright/test').Locator} row
   */
  async function dragRow(row, ex, ey) {
    const testid = await row.getAttribute('data-testid')
    const start = await centreOf(row)
    await expectHit(start.x, start.y, String(testid))
    const steps = 22
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }] })
      await sleep(110)
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: start.x + (ex - start.x) * t + (i < steps ? wobble(3) : 0), y: start.y + (ey - start.y) * t + (i < steps ? wobble(3) : 0), id: 1 }],
        })
        await sleep(14)
      }
      await sleep(110)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } else {
      await page.mouse.move(start.x, start.y, { steps: 3 })
      await page.mouse.down()
      await sleep(90)
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps
        await page.mouse.move(start.x + (ex - start.x) * t + (i < steps ? wobble(3) : 0), start.y + (ey - start.y) * t + (i < steps ? wobble(3) : 0))
        await sleep(12)
      }
      await sleep(110)
      await page.mouse.up()
    }
    await sleep(350)
  }

  return { press, dragRow }
}

/** @param {import('@playwright/test').Page} page @param {number} fx @param {number} fy */
async function viewportPoint(page, fx, fy) {
  const box = await page.getByTestId('viewport-canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  return { x: box.x + box.width * fx, y: box.y + box.height * fy }
}

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page, press) {
  const tab = page.getByTestId('library-tab')
  if ((await tab.isVisible()) && (await page.getByTestId('library-panel').getAttribute('data-open')) !== 'true') {
    await press(tab)
    await expect(page.getByTestId('library-panel')).toHaveAttribute('data-open', 'true')
  }
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page, press) {
  const tab = page.getByTestId('library-tab')
  if ((await tab.isVisible()) && (await page.getByTestId('library-panel').getAttribute('data-open')) === 'true') {
    await press(tab)
    await expect(page.getByTestId('library-panel')).toHaveAttribute('data-open', 'false')
  }
}

/** @param {import('@playwright/test').Page} page */
const sceneBodies = (page) =>
  page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((n) => ({ id: n.getAttribute('data-body-id') ?? '', op: n.getAttribute('data-body-op') ?? '', name: n.getAttribute('data-body-name') ?? '' })),
  )

/** The selected body's overall size as the Inspector words it — what a dropped copy must match. */
const boundsText = (page) => page.getByTestId('inspector-fit-bounds').innerText()
const partNames = (page) => page.$$eval('[data-testid="inspector-parts"] li', (n) => n.map((x) => (x.textContent ?? '').trim()))

// Drop points: phone keeps the Library sheet over the lower half and the toolbar over the top-left.
const DROPS = (info) => (isPhone(info) ? { a: [0.3, 0.22], b: [0.7, 0.2], c: [0.5, 0.25] } : { a: [0.3, 0.45], b: [0.6, 0.38], c: [0.5, 0.62] })

/**
 * Cube + Cylinder placed and combined into one selected group.
 *
 * @param {import('@playwright/test').Page} page
 * @param {ReturnType<typeof pointer> extends Promise<infer T> ? T : never} input
 * @param {import('@playwright/test').TestInfo} info
 */
async function buildGroup(page, input, info) {
  const drops = DROPS(info)
  await openLibrary(page, input.press)
  let p = await viewportPoint(page, ...drops.a)
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), p.x, p.y)
  p = await viewportPoint(page, ...drops.b)
  await input.dragRow(page.getByTestId('library-row-primitive.cylinder'), p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await closeLibrary(page, input.press)
  // The cylinder is selected (it was placed last): add the cube through the Objects list's check,
  // which is the only multi-select a touch screen has.
  const list = page.getByTestId('object-list')
  if (!(await list.isVisible().catch(() => false))) await input.press(page.getByTestId('inspector-objects-header'))
  await input.press(page.locator('[data-testid^="objects-check-cuboid-"]'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await input.press(page.getByTestId('operation-group'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the Library has no import buttons; File > Import part file… adds the parts to My parts and says where they went (TODO/ui-107)', async ({ page }, info) => {
  const input = await pointer(page, info)
  await openLibrary(page, input.press)
  // Neither the column's My parts header nor the rail has an import control any more.
  await expect(page.getByTestId('library-import')).toHaveCount(0)
  await expect(page.getByTestId('library-import-model')).toHaveCount(0)
  await expect(page.getByTestId('library-rail-more')).toHaveCount(0)
  await closeLibrary(page, input.press)
  expect(await myPartsCount(page)).toBe(0)

  const standoff = {
    op: 'user.standoff',
    name: 'Standoff',
    version: 1,
    result: 'r1',
    records: [{ id: 'r1', op: 'primitive.cuboid', params: { size: [10, 10, 20], center: [0, 0, 10] } }],
    params: [],
  }
  const text = serializePartFile([standoff], {})
  await importPartFile(page, input.press, { name: 'standoff.warpcad-part.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  await expect(page.getByTestId('library-toast')).toHaveText('Added Standoff to My parts. Open Library to place it')
  expect(await myPartsCount(page)).toBe(1)
  // The project did not change: a part file is a set of library entries, not a placed object.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await openLibrary(page, input.press)
  await expect(page.getByTestId('library-row-user.standoff')).toBeVisible()
  await info.attach(`library-import-part-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' })
})

test('Save to library is gated on exactly one selected body, and says why when it is not', async ({ page }, info) => {
  const input = await pointer(page, info)
  const toolbarSave = page.getByTestId('op-library-save')
  // 0 selected.
  await expect(toolbarSave).toBeDisabled()
  await expect(toolbarSave).toHaveAttribute('title', /select a group or body/i)

  await openLibrary(page, input.press)
  let p = await viewportPoint(page, ...DROPS(info).a)
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), p.x, p.y)
  p = await viewportPoint(page, ...DROPS(info).b)
  await input.dragRow(page.getByTestId('library-row-primitive.cylinder'), p.x, p.y)
  await closeLibrary(page, input.press)

  // 1 selected: enabled.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(toolbarSave).toBeEnabled()
  await expect(page.getByTestId('library-save')).toBeEnabled()

  // 2 selected: disabled, and the visible reason names Combine into group.
  if (!(await page.getByTestId('object-list').isVisible().catch(() => false))) await input.press(page.getByTestId('inspector-objects-header'))
  await input.press(page.locator('[data-testid^="objects-check-cuboid-"]'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(toolbarSave).toBeDisabled()
  await expect(page.getByTestId('library-save')).toBeDisabled()
  await expect(page.getByTestId('library-save-reason')).toContainText(/combine into group/i)
})

test('Standoff: build a group, Save to library, reload, File > New, drag it in from My parts — complete, with its sub-parts', async ({ page }, info) => {
  const input = await pointer(page, info)
  await buildGroup(page, input, info)

  // What the original looks like, to compare the dropped copy to.
  const original = { bounds: await boundsText(page), parts: await partNames(page) }
  expect([...original.parts].sort()).toEqual(['Cube 1', 'Cylinder 1'])

  await input.press(page.getByTestId('op-library-save'))
  await expect(page.getByTestId('save-library-sheet')).toBeVisible()

  // Name validation: empty blocks Save and says so.
  const name = page.getByTestId('save-library-name')
  await name.fill('')
  await expect(page.getByTestId('save-library-submit')).toBeDisabled()
  await expect(page.getByTestId('save-library-name-problem')).toContainText(/name/i)
  await name.fill('Standoff')
  await expect(page.getByTestId('save-library-submit')).toBeEnabled()
  // A saved part is fixed: the sheet offers no Adjustable sizes (TODO/ui-105).
  await expect(page.locator('[data-testid^="save-library-param-"]')).toHaveCount(0)
  await expect(page.getByTestId('save-library-no-params')).toHaveCount(0)
  await input.press(page.getByTestId('save-library-submit'))

  await expect(page.getByTestId('library-toast')).toHaveText('Saved Standoff')
  await expect(page.getByTestId('save-library-sheet')).toHaveCount(0)

  // Reload: it is still there (IndexedDB), under My parts, with a thumbnail drawn from its geometry.
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('library-user-count')).toHaveText('1')

  // File > New: still there, and the scene is empty.
  await input.press(page.getByTestId('file-menu-button'))
  await input.press(page.getByTestId('file-new'))
  const replace = page.getByTestId('file-open-confirm-replace')
  if (await replace.isVisible().catch(() => false)) await input.press(replace)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('library-user-count')).toHaveText('1')

  await openLibrary(page, input.press)
  const toggle = page.getByTestId('library-section-toggle-user')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await input.press(toggle)
  const row = page.getByTestId('library-row-user.standoff')
  await expect(row).toBeVisible()
  // In the icons tier the labelled row (with its thumbnail test id) is in the row's pop-out (TODO/ui-084).
  await withRowSettings(page, 'user.standoff', async () => {
    await expect(page.getByTestId('library-thumb-user.standoff')).toBeVisible()
    // The thumbnail is a real picture, not an empty canvas: it decoded to a non-zero size.
    expect(await page.getByTestId('library-thumb-user.standoff').evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(0)
  })

  // Scenario 1's rule: the dropped part does not replace what is already there. A Cube first.
  const drops = DROPS(info)
  let p = await viewportPoint(page, ...drops.a)
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  p = await viewportPoint(page, ...drops.c)
  await input.dragRow(row, p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const bodies = await sceneBodies(page)
  expect(bodies.map((b) => b.op).sort()).toEqual(['primitive.cuboid', 'user.standoff'])

  // Complete, not partial: same overall size and the same named sub-parts as the original.
  await closeLibrary(page, input.press)
  await expect(page.getByTestId('inspector-name')).toHaveText('Standoff 1')
  expect(await boundsText(page)).toBe(original.bounds)
  expect(await partNames(page)).toEqual(original.parts)
  // It is "in this project" now.
  await openLibrary(page, input.press)
  await withRowSettings(page, 'user.standoff', () => expect(page.getByTestId('library-in-project-user.standoff')).toBeVisible())
})

test('a part saved earlier with an exposed size still places with its field, and editing it resizes the part (TODO/ui-105 keeps reading these)', async ({ page }, info) => {
  const input = await pointer(page, info)
  // Seeded straight into IndexedDB: the Save sheet no longer makes a part with exposed sizes.
  await seedParts(page, [
    [
      'user.old-standoff',
      {
        definition: {
          op: 'user.old-standoff',
          name: 'Old standoff',
          version: 1,
          result: 'r1',
          records: [{ id: 'r1', op: 'primitive.cylinder', params: { height: 50, diameter: 8, center: [0, 0, 25] } }],
          params: [{ name: 'cylinder-1-height', unit: 'mm', default: 50, min: 5, max: 500, binds: [{ record: 'r1', path: 'height' }] }],
        },
        savedAt: Date.now(),
      },
    ],
  ])
  await openLibrary(page, input.press)
  const p = await viewportPoint(page, ...DROPS(info).c)
  const toggle = page.getByTestId('library-section-toggle-user')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await input.press(toggle)
  await input.dragRow(page.getByTestId('library-row-user.old-standoff'), p.x, p.y)
  await closeLibrary(page, input.press)
  await expect(page.getByTestId('inspector-name')).toHaveText('Old standoff 1')
  const before = await boundsText(page)

  const field = page.getByTestId('inspector-param-cylinder-1-height')
  await field.scrollIntoViewIfNeeded()
  await expect(field).toHaveValue('50')
  await field.fill('30')
  await field.press('Enter')
  await expect.poll(() => boundsText(page)).not.toBe(before)
})

test('the My parts menu: Duplicate, Rename, Export, and Delete that keeps a copy in the project', async ({ page }, info) => {
  const input = await pointer(page, info)
  await buildGroup(page, input, info)
  await input.press(page.getByTestId('op-library-save'))
  await page.getByTestId('save-library-name').fill('Standoff')
  await input.press(page.getByTestId('save-library-submit'))
  await expect(page.getByTestId('library-toast')).toHaveText('Saved Standoff')

  await openLibrary(page, input.press)
  /** Open a My parts row's ⋯ menu; in the icons tier it is in the row's pop-out (TODO/ui-084). */
  const openMenu = async (/** @type {string} */ op) => {
    await showRowSettings(page, op)
    await input.press(page.getByTestId(`user-part-menu-${op}`))
  }

  // Place one so Delete has an instance to protect.
  const p = await viewportPoint(page, ...DROPS(info).c)
  await input.dragRow(page.getByTestId('library-row-user.standoff'), p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await openLibrary(page, input.press)

  // Duplicate.
  await openMenu('user.standoff')
  await expect(page.getByTestId('user-part-menu')).toBeVisible()
  await input.press(page.getByTestId('user-part-duplicate'))
  await expect(page.getByTestId('library-row-user.standoff-copy')).toBeVisible()

  // Rename, with its own validation: a duplicate name is refused.
  await openMenu('user.standoff-copy')
  await input.press(page.getByTestId('user-part-rename'))
  const rename = page.getByTestId('user-part-rename-input')
  await rename.fill('Standoff')
  await expect(page.getByTestId('user-part-rename-problem')).toContainText(/already/i)
  await expect(page.getByTestId('user-part-rename-save')).toBeDisabled()
  await rename.fill('Spacer')
  await input.press(page.getByTestId('user-part-rename-save'))
  await expect(page.getByTestId('library-row-user.standoff-copy')).toHaveAttribute('data-label', 'Spacer')

  // Export hands the browser a part file.
  const download = page.waitForEvent('download')
  await openMenu('user.standoff')
  await input.press(page.getByTestId('user-part-export'))
  expect((await download).suggestedFilename()).toBe('standoff.warpcad-part.json')

  // Delete a part with a placed instance: the default keeps a copy in the project.
  await openLibrary(page, input.press)
  await openMenu('user.standoff')
  await input.press(page.getByTestId('user-part-delete'))
  await expect(page.getByTestId('user-part-delete-message')).toContainText(/1 placed instance/)
  await expect(page.getByTestId('user-part-delete-confirm')).toHaveText('Keep a copy in the project')
  await input.press(page.getByTestId('user-part-delete-confirm'))
  // The placed geometry is untouched, and the row stays (from the project's copy), no longer a library one.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('library-row-user.standoff')).toBeVisible()
  // TODO/ui-096: the row says so, and Delete… is no longer a dead button.
  await showRowSettings(page, 'user.standoff')
  await expect(page.getByTestId('library-only-project-user.standoff')).toHaveText('Only in this project')
  await openMenu('user.standoff')
  await expect(page.getByTestId('user-part-delete')).toBeEnabled()
})

/**
 * `TODO/ui-096`: build the Standoff group, save it as a part, place it once, then delete it from
 * My parts keeping a copy in the project. Leaves the placed Standoff selected, the Library closed.
 */
async function standoffOnlyInProject(page, input, info) {
  await buildGroup(page, input, info)
  await input.press(page.getByTestId('op-library-save'))
  await page.getByTestId('save-library-name').fill('Standoff')
  await input.press(page.getByTestId('save-library-submit'))
  await expect(page.getByTestId('library-toast')).toHaveText('Saved Standoff')
  await openLibrary(page, input.press)
  const toggle = page.getByTestId('library-section-toggle-user')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await input.press(toggle)
  const p = await viewportPoint(page, ...DROPS(info).c)
  await input.dragRow(page.getByTestId('library-row-user.standoff'), p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await openLibrary(page, input.press)
  await showRowSettings(page, 'user.standoff')
  await input.press(page.getByTestId('user-part-menu-user.standoff'))
  await input.press(page.getByTestId('user-part-delete'))
  await input.press(page.getByTestId('user-part-delete-confirm'))
  await expect(page.getByTestId('library-toast')).toHaveText('Deleted Standoff from My parts')
  await closeLibrary(page, input.press)
}

test('a part only in this project says so, explains itself in text, and leaves My parts with its last placed copy; Undo brings it back (TODO/ui-096)', async ({ page }, info) => {
  const input = await pointer(page, info)
  await standoffOnlyInProject(page, input, info)

  await openLibrary(page, input.press)
  await showRowSettings(page, 'user.standoff')
  await expect(page.getByTestId('library-only-project-user.standoff')).toHaveText('Only in this project')
  await expect(page.getByTestId('library-in-project-user.standoff')).toBeVisible()
  await input.press(page.getByTestId('user-part-menu-user.standoff'))
  // The reason is text on screen, not a title; nothing scrolls sideways, at any width.
  await expect(page.getByTestId('user-part-project-only-note')).toHaveText("Not in My parts. It's listed because it's placed once in this project.")
  await expect(page.getByTestId('user-part-project-only-note')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByTestId('user-part-rename')).toBeDisabled()
  await expect(page.getByTestId('user-part-delete')).toBeEnabled()

  // Delete… names what keeps it there and offers only Cancel.
  await input.press(page.getByTestId('user-part-delete'))
  await expect(page.getByTestId('user-part-delete-message')).toHaveText(
    "Standoff isn't in My parts any more. It's listed here because it's placed once in this project. Delete those from the view and it leaves this list. To keep Standoff, choose Duplicate.",
  )
  await expect(page.getByTestId('user-part-delete-confirm')).toHaveCount(0)
  await input.press(page.getByTestId('user-part-delete-cancel'))
  await expect(page.getByTestId('user-part-delete-dialog')).toHaveCount(0)
  await expect(page.getByTestId('library-row-user.standoff')).toBeVisible()
  await closeLibrary(page, input.press)

  // Delete the placed copy in the view: the row leaves My parts at once.
  await expect(page.getByTestId('inspector-name')).toHaveText('Standoff 1')
  await input.press(page.getByTestId('inspector-delete'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await openLibrary(page, input.press)
  await expect(page.getByTestId('library-row-user.standoff')).toHaveCount(0)
  await expect(page.getByTestId('library-user-count')).toHaveText('0')
  await closeLibrary(page, input.press)

  // Undo: the copy and the row come back.
  await input.press(page.getByTestId('undo-button'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await openLibrary(page, input.press)
  await expect(page.getByTestId('library-row-user.standoff')).toBeVisible()
  await showRowSettings(page, 'user.standoff')
  await expect(page.getByTestId('library-only-project-user.standoff')).toBeVisible()
})

test('a part nested inside a placed part is listed with the reason naming that part (TODO/ui-096)', async ({ page }, info) => {
  const input = await pointer(page, info)
  await seedParts(page, [
    storedPart('user.feather', 'Feather', 'primitive.cuboid', { size: [10, 4, 2] }),
    storedPart('user.feather-box', 'Feather enclosure', 'user.feather'),
  ])
  await openLibrary(page, input.press)
  const toggle = page.getByTestId('library-section-toggle-user')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await input.press(toggle)
  // Place the enclosure (which nests the Feather).
  const p = await viewportPoint(page, ...DROPS(info).c)
  await input.dragRow(page.getByTestId('library-row-user.feather-box'), p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  // Delete the enclosure from My parts keeping its copy, then the Feather (nothing saved nests it now).
  await openLibrary(page, input.press)
  await showRowSettings(page, 'user.feather-box')
  await input.press(page.getByTestId('user-part-menu-user.feather-box'))
  await input.press(page.getByTestId('user-part-delete'))
  await input.press(page.getByTestId('user-part-delete-confirm'))
  await expect(page.getByTestId('library-toast')).toHaveText('Deleted Feather enclosure from My parts')
  await showRowSettings(page, 'user.feather')
  await input.press(page.getByTestId('user-part-menu-user.feather'))
  await input.press(page.getByTestId('user-part-delete'))
  await input.press(page.getByTestId('user-part-delete-confirm'))
  await expect(page.getByTestId('library-toast')).toHaveText('Deleted Feather from My parts')

  // Feather is no placed instance's own part, yet its row stays and says why.
  await showRowSettings(page, 'user.feather')
  await expect(page.getByTestId('library-only-project-user.feather')).toHaveText('Only in this project')
  await expect(page.getByTestId('library-in-project-user.feather')).toBeVisible()
  await input.press(page.getByTestId('user-part-menu-user.feather'))
  await expect(page.getByTestId('user-part-project-only-note')).toHaveText(
    "Not in My parts. It's listed because Feather enclosure, placed in this project, uses it.",
  )
  await input.press(page.getByTestId('user-part-delete'))
  await expect(page.getByTestId('user-part-delete-message')).toContainText('Delete Feather enclosure from the view and it leaves this list.')
  await expect(page.getByTestId('user-part-delete-confirm')).toHaveCount(0)
  await input.press(page.getByTestId('user-part-delete-cancel'))
})

test('a placed project-only part saves under its suggested name, carries the part it nests into My parts, and a second body cannot take that name (TODO/ui-105)', async ({ page }, info) => {
  const input = await pointer(page, info)
  // The placed "Standoff 1" is selected; its part, Standoff, is only in this project.
  await standoffOnlyInProject(page, input, info)
  await expect(page.getByTestId('inspector-name')).toHaveText('Standoff 1')

  await input.press(page.getByTestId('op-library-save'))
  await expect(page.getByTestId('save-library-sheet')).toBeVisible()
  await expect(page.getByTestId('save-library-name')).toHaveValue('Standoff 1')
  // No Adjustable sizes, and no refusal: the project's parts never block a library name.
  await expect(page.locator('[data-testid^="save-library-param-"]')).toHaveCount(0)
  await expect(page.getByTestId('save-library-no-params')).toHaveCount(0)
  await expect(page.getByTestId('save-library-submit')).toBeEnabled()

  // A name the body is built from is refused, in words.
  await page.getByTestId('save-library-name').fill('Standoff')
  await expect(page.getByTestId('save-library-name-problem')).toHaveText('Standoff is built from a part with that name — pick another name')
  await expect(page.getByTestId('save-library-submit')).toBeDisabled()

  await page.getByTestId('save-library-name').fill('Standoff 1')
  await expect(page.getByTestId('save-library-submit')).toBeEnabled()
  await input.press(page.getByTestId('save-library-submit'))
  await expect(page.getByTestId('library-toast')).toHaveText('Saved Standoff 1')
  await expect(page.getByTestId('save-library-sheet')).toHaveCount(0)

  // Both rows are in My parts now; the nested Standoff lost its "Only in this project" badge.
  await openLibrary(page, input.press)
  await expect(page.getByTestId('library-row-user.standoff-1')).toBeVisible()
  await showRowSettings(page, 'user.standoff')
  await expect(page.getByTestId('library-only-project-user.standoff')).toHaveCount(0)
  await showRowSettings(page, 'user.standoff-1')
  await expect(page.getByTestId('library-only-project-user.standoff-1')).toHaveCount(0)

  // A second body under that same name is refused with the library sentence.
  const p = await viewportPoint(page, ...DROPS(info).a)
  await input.dragRow(page.getByTestId('library-row-primitive.cuboid'), p.x, p.y)
  await closeLibrary(page, input.press)
  await input.press(page.getByTestId('op-library-save'))
  await page.getByTestId('save-library-name').fill('Standoff 1')
  await expect(page.getByTestId('save-library-name-problem')).toHaveText('A part called "Standoff 1" already exists — pick another name')
  await expect(page.getByTestId('save-library-submit')).toBeDisabled()
  await input.press(page.getByTestId('save-library-cancel'))
})

test('Save to library refuses a repeat, says why in a visible line, and still saves the source (TODO/ui-076)', async ({ page }) => {
  // A real project file with a repeat in it (the Pi + bolt scene of core-061), opened through
  // File ▸ Open… on an empty project — so there is no confirm step in the way.
  const { piBoltRepeated } = await import('../src/core/__fixtures__/piScenes.js')
  const { serializeProject } = await import('../src/core/project.js')
  const text = serializeProject(piBoltRepeated())
  // The native picker is a real OS dialog; force the <input type=file> fallback, which is a chooser event.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
  })
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  const chooser = await chooserEvent
  await chooser.setFiles({ name: 'repeat.ndjson', mimeType: 'text/plain', buffer: Buffer.from(text) })

  const repeatRow = page.locator('[data-testid="scene-bodies"] li[data-body-id="rep-1"]')
  await expect(repeatRow).toHaveCount(1, { timeout: 30_000 })
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  if (!(await page.getByTestId('object-list').isVisible())) await page.getByTestId('inspector-objects-header').click()
  await expect(page.getByTestId('object-list')).toBeVisible()
  await page.getByTestId('objects-row-rep-1').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')

  await expect(page.getByTestId('library-save')).toBeDisabled()
  await expect(page.getByTestId('op-library-save')).toBeDisabled()
  await expect(page.getByTestId('library-save-reason')).toContainText(/repeat can't be saved/i)
  await expect(page.getByTestId('library-save-reason')).toContainText(/source/i)

  // *Go to Bolt 1* is the way back to the source, an ordinary body: the same control is enabled for it.
  await page.getByTestId('repeat-goto-source').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId('library-save')).toBeEnabled()
})

/**
 * Write entries straight into the `warpcad-parts` IndexedDB (the library's own database, store
 * `parts`, keyed by op), then reload so the app reads them at start. Done with `page.evaluate`
 * plus a reload rather than `addInitScript`: an init script re-seeds on every reload, which would
 * undo the Delete the spec is checking.
 *
 * @param {import('@playwright/test').Page} page
 * @param {[string, unknown][]} entries
 */
async function seedParts(page, entries) {
  await page.evaluate(
    (rows) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('warpcad-parts', 1)
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains('parts')) open.result.createObjectStore('parts')
        }
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('parts', 'readwrite')
          for (const [key, value] of rows) tx.objectStore('parts').put(value, key)
          tx.oncomplete = () => {
            db.close()
            resolve(undefined)
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    entries,
  )
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
}

/** @param {string} op @param {string} name @param {string} child @param {object} [params] */
const storedPart = (op, name, child, params = {}) => [
  op,
  { definition: { op, name, version: 1, result: 'r1', records: [{ id: 'r1', op: child, params }], params: [] }, savedAt: Date.now() },
]

/** Open My parts and, in the icon rail, the broken tile's pop-out; return where its text lives. */
async function showBroken(page, input, op) {
  await openLibrary(page, input.press)
  const toggle = page.getByTestId('library-section-toggle-user')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await input.press(toggle)
  const broken = page.getByTestId(`library-broken-${op}`)
  await expect(broken).toBeVisible()
  if ((await broken.getAttribute('aria-haspopup')) === 'dialog') {
    await broken.click()
    await expect(page.getByTestId('library-row-popout')).toHaveAttribute('data-op', op)
  }
}

test('a My parts entry that fails to load shows as a row you can delete, and stays gone after a reload (TODO/ui-095)', async ({ page }, info) => {
  const input = await pointer(page, info)
  await seedParts(page, [storedPart('user.feather-box', 'Feather enclosure', 'user.missing-thing')])
  await showBroken(page, input, 'user.feather-box')

  // The row names the part and says why, and it wraps: nothing scrolls sideways at any width.
  const reason = page.getByTestId('library-broken-reason-user.feather-box')
  await expect(reason).toContainText("Can't be loaded: it uses missing-thing, which is no longer in My parts")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // It is not a drag source: no placement row exists for it.
  await expect(page.getByTestId('library-row-user.feather-box')).toHaveCount(0)
  // The banner (the labelled column and the phone sheet) names the part, not only the child.
  const banner = page.getByTestId('library-load-problem')
  if ((await banner.count()) > 0) await expect(banner).toContainText(/Feather enclosure: it uses missing-thing/)

  const shot = (await page.getByTestId('library-row-popout').count()) > 0 ? page.getByTestId('library-row-popout') : page.getByTestId('library-user-body')
  await expect(shot).toHaveScreenshot('user-library-broken-row.png', { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.05 })

  await input.press(page.getByTestId('user-part-menu-user.feather-box'))
  await expect(page.getByTestId('user-part-rename')).toHaveCount(0)
  await input.press(page.getByTestId('user-part-delete'))
  await input.press(page.getByTestId('user-part-delete-confirm'))
  await expect(page.getByTestId('library-toast')).toHaveText('Deleted Feather enclosure from My parts')
  await expect(page.getByTestId('library-broken-user.feather-box')).toHaveCount(0)
  await expect(page.getByTestId('library-load-problem')).toHaveCount(0)

  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('library-broken-user.feather-box')).toHaveCount(0)
  await expect(page.getByTestId('library-user-count')).toHaveText('0')
})

test('a part another saved part nests cannot be deleted: the dialog names the user and only offers Cancel (TODO/ui-095)', async ({ page }, info) => {
  const input = await pointer(page, info)
  await seedParts(page, [
    storedPart('user.feather', 'Feather', 'primitive.cuboid', { size: [10, 4, 2] }),
    storedPart('user.feather-box', 'Feather enclosure', 'user.feather'),
  ])
  await openLibrary(page, input.press)
  const toggle = page.getByTestId('library-section-toggle-user')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await input.press(toggle)
  await showRowSettings(page, 'user.feather')
  await input.press(page.getByTestId('user-part-menu-user.feather'))
  await input.press(page.getByTestId('user-part-delete'))
  await expect(page.getByTestId('user-part-delete-message')).toHaveText(
    'Feather is used inside Feather enclosure in My parts. Delete Feather enclosure first.',
  )
  await expect(page.getByTestId('user-part-delete-confirm')).toHaveCount(0)
  await input.press(page.getByTestId('user-part-delete-cancel'))
  await expect(page.getByTestId('user-part-delete-dialog')).toHaveCount(0)
  await expect(page.getByTestId('library-user-count')).toHaveText('2')
})

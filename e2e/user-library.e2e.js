// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

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
  await input.press(page.getByTestId('objects-check-cuboid-1'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await input.press(page.getByTestId('operation-group'))
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
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
  await input.press(page.getByTestId('objects-check-cuboid-1'))
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
  // Expose the cylinder's height as an adjustable size.
  await input.press(page.getByTestId('save-library-param-cylinder-2:height'))
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
  await expect(page.getByTestId('library-thumb-user.standoff')).toBeVisible()
  // The thumbnail is a real picture, not an empty canvas: it decoded to a non-zero size.
  expect(await page.getByTestId('library-thumb-user.standoff').evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth)).toBeGreaterThan(0)

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
  await expect(page.getByTestId('library-in-project-user.standoff')).toBeVisible()
})

test('a placed part shows its exposed size as a field, and editing it resizes the part with its sub-parts intact', async ({ page }, info) => {
  const input = await pointer(page, info)
  await buildGroup(page, input, info)
  const before = await boundsText(page)
  await input.press(page.getByTestId('op-library-save'))
  await page.getByTestId('save-library-name').fill('Standoff')
  await input.press(page.getByTestId('save-library-param-cylinder-2:height'))
  await input.press(page.getByTestId('save-library-submit'))
  await expect(page.getByTestId('library-toast')).toHaveText('Saved Standoff')

  await openLibrary(page, input.press)
  const p = await viewportPoint(page, ...DROPS(info).c)
  const toggle = page.getByTestId('library-section-toggle-user')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await input.press(toggle)
  await input.dragRow(page.getByTestId('library-row-user.standoff'), p.x, p.y)
  await closeLibrary(page, input.press)
  await expect(page.getByTestId('inspector-name')).toHaveText('Standoff 1')

  const field = page.getByTestId('inspector-param-cylinder-1-height')
  await field.scrollIntoViewIfNeeded()
  await expect(field).toHaveValue('50')
  await field.fill('30')
  await field.press('Enter')
  await expect.poll(() => boundsText(page)).not.toBe(before)
  expect((await partNames(page)).sort()).toEqual(['Cube 1', 'Cylinder 1'])
})

test('the My parts menu: Duplicate, Rename, Export, and Delete that keeps a copy in the project', async ({ page }, info) => {
  const input = await pointer(page, info)
  await buildGroup(page, input, info)
  await input.press(page.getByTestId('op-library-save'))
  await page.getByTestId('save-library-name').fill('Standoff')
  await input.press(page.getByTestId('save-library-submit'))
  await expect(page.getByTestId('library-toast')).toHaveText('Saved Standoff')

  await openLibrary(page, input.press)
  const menuFor = (op) => page.getByTestId(`user-part-menu-${op}`)

  // Place one so Delete has an instance to protect.
  const p = await viewportPoint(page, ...DROPS(info).c)
  await input.dragRow(page.getByTestId('library-row-user.standoff'), p.x, p.y)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await openLibrary(page, input.press)

  // Duplicate.
  await input.press(menuFor('user.standoff'))
  await expect(page.getByTestId('user-part-menu')).toBeVisible()
  await input.press(page.getByTestId('user-part-duplicate'))
  await expect(page.getByTestId('library-row-user.standoff-copy')).toBeVisible()

  // Rename, with its own validation: a duplicate name is refused.
  await input.press(menuFor('user.standoff-copy'))
  await input.press(page.getByTestId('user-part-rename'))
  const rename = page.getByTestId('user-part-rename-input')
  await rename.fill('Standoff')
  await expect(page.getByTestId('user-part-rename-problem')).toContainText(/already/i)
  await expect(page.getByTestId('user-part-rename-save')).toBeDisabled()
  await rename.fill('Spacer')
  await input.press(page.getByTestId('user-part-rename-save'))
  await expect(page.getByTestId('library-row-user.standoff-copy')).toContainText('Spacer')

  // Export hands the browser a part file.
  const download = page.waitForEvent('download')
  await input.press(menuFor('user.standoff'))
  await input.press(page.getByTestId('user-part-export'))
  expect((await download).suggestedFilename()).toBe('standoff.warpcad-part.json')

  // Delete a part with a placed instance: the default keeps a copy in the project.
  await openLibrary(page, input.press)
  await input.press(menuFor('user.standoff'))
  await input.press(page.getByTestId('user-part-delete'))
  await expect(page.getByTestId('user-part-delete-message')).toContainText(/1 placed instance/)
  await expect(page.getByTestId('user-part-delete-confirm')).toHaveText('Keep a copy in the project')
  await input.press(page.getByTestId('user-part-delete-confirm'))
  // The placed geometry is untouched, and the row stays (from the project's copy), no longer a library one.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('library-row-user.standoff')).toBeVisible()
  await input.press(menuFor('user.standoff'))
  await expect(page.getByTestId('user-part-delete')).toBeDisabled()
})

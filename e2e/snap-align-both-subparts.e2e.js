// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/ui-063`: Snap/Align with a named part on **both** operands, driven against `/`.
 *
 * The user's own flow, verbatim: drag a Raspberry Pi 5 and a touchScreen2 out of the
 * Library, tick `hole1` in the Pi's Objects list, add the screen at `piMountingPost1`,
 * check the popover's top line names **both** parts, Align X and Y; then re-address the
 * Pi to `mb`, Snap Z, and read the parts back through the Inspector. Before this task the
 * second address silently overwrote the first, so the Pi was measured whole: its centre
 * went on the post in plan, and its SD card (not `mb`) went on the post's top.
 *
 * Every selection here is a user gesture on the Objects list (a hole cannot be clicked in
 * the 3D view: `ui-016`'s occlusion limit). The store is read only to learn the ids the
 * Library drop generated, so the list's test ids can be named.
 *
 * Viewports: all three — the Objects list and the popover are bottom-sheet-anchored at
 * phone width. Engines: all three — list ticking and the kernel round trip are
 * engine-sensitive. Firefox may fail at launch in this sandbox (`TROUBLESHOOTING.md`,
 * 2026-09-17).
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'snap-align-both-subparts-snapshots')

/** Inspector fields print two decimals; 0.02 mm is one rounding step either way. */
const TOL_MM = 0.02

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

/**
 * Put the Library's rows on screen (a bottom sheet behind a tab at phone width).
 *
 * @param {import('@playwright/test').Page} page
 */
async function openLibrary(page) {
  if (!(await page.getByTestId('library-rows').isVisible())) await page.getByTestId('library-tab').click()
  await expect(page.getByTestId('library-rows')).toBeVisible()
}

/**
 * Drag one Library row onto the viewport with real pointer events (the app's own
 * drag-to-place path, `ui-010`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} op
 * @param {number} fx Drop point, as a fraction of the viewport's width.
 * @param {number} fy
 */
async function dragFromLibrary(page, op, fx, fy) {
  await openLibrary(page)
  await page.getByTestId(`library-row-${op}`).scrollIntoViewIfNeeded()
  await page.evaluate(
    ({ op, fx, fy }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error('missing row or viewport')
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const sx = from.left + from.width / 2
      const sy = from.top + from.height / 2
      const ex = to.left + to.width * fx
      const ey = to.top + to.height * fy
      /** @param {EventTarget} target @param {string} type @param {number} x @param {number} y */
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 63, pointerType: 'mouse', isPrimary: true, button: 0,
            buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true,
          }),
        )
      fire(row, 'pointerdown', sx, sy)
      for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', sx + (ex - sx) * t, sy + (ey - sy) * t)
      fire(window, 'pointerup', ex, ey)
    },
    { op, fx, fy },
  )
}

/**
 * The id the Library drop gave the body with this op, once the kernel has measured it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} op
 */
async function bodyIdOf(page, op) {
  const item = page.locator(`[data-testid="scene-bodies"] li[data-body-op="${op}"]`)
  await expect(item).toHaveAttribute('data-body-volume', /.+/, { timeout: 30_000 })
  return /** @type {string} */ (await item.getAttribute('data-body-id'))
}

/**
 * Put the Inspector's Objects list on screen the way a user does (see
 * `inspector-object-list.e2e.js`'s helper of the same name).
 *
 * @param {import('@playwright/test').Page} page
 */
async function openObjectList(page) {
  const list = page.getByTestId('object-list')
  if (await list.isVisible()) return
  const inspector = page.getByTestId('inspector')
  if ((await inspector.getAttribute('data-open')) !== 'true' && (await page.getByTestId('inspector-tab').isVisible())) {
    await page.getByTestId('inspector-tab').click()
    await expect(inspector).toHaveAttribute('data-open', 'true')
  }
  if (!(await list.isVisible())) await page.getByTestId('inspector-objects-header').click()
  await expect(list).toBeVisible()
}

/**
 * Open a body's part rows in the list, if they are not already showing.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} bodyId
 */
async function expandParts(page, bodyId) {
  await openObjectList(page)
  const toggle = page.getByTestId(`objects-expand-${bodyId}`)
  await toggle.scrollIntoViewIfNeeded()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
}

/**
 * A plain tap on a part row: that body, at that part, and nothing else.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} bodyId
 * @param {string} partName
 */
async function tapPart(page, bodyId, partName) {
  await expandParts(page, bodyId)
  const row = page.getByTestId(`objects-part-${bodyId}-${partName}`)
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText(partName)
}

/**
 * The part row's check: add this body to the selection at this part (the touch route to
 * "2 selected", with no Shift key).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} bodyId
 * @param {string} partName
 */
async function checkPart(page, bodyId, partName) {
  await expandParts(page, bodyId)
  const check = page.getByTestId(`objects-part-check-${bodyId}-${partName}`)
  await check.scrollIntoViewIfNeeded()
  await check.click()
  await expect(check).toHaveAttribute('aria-checked', 'true')
}

/**
 * A part's box as the Inspector reads it, with that part selected: centre and size.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} bodyId
 * @param {string} partName
 * @returns {Promise<{ centre: number[], size: number[] }>}
 */
async function inspectPart(page, bodyId, partName) {
  await tapPart(page, bodyId, partName)
  /** @param {string} testId */
  const num = async (testId) => Number((await page.getByTestId(testId).inputValue()).replace(/[^\d.+-]/g, ''))
  const centre = []
  const size = []
  for (const axis of ['x', 'y', 'z']) {
    centre.push(await num(`inspector-position-${axis}`))
    size.push(await num(`inspector-size-${axis}`))
  }
  return { centre, size }
}

/**
 * Tap the open Align popover's buttons on the given axes (`TODO/ui-060`: one tap, one
 * commit) — `◇ ctr` against the second body, or a Snap button when `snap` is given — waiting
 * for the moving body to be re-measured after each, then close the popover with Escape.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} movingId
 * @param {('x' | 'y' | 'z')[]} axes
 * @param {{ relation: 'outside' | 'inside' | 'center', side: 'minus' | 'plus' }} [snap]
 */
async function commitPopover(page, movingId, axes, snap) {
  const item = page.locator(`[data-testid="scene-bodies"] li[data-body-id="${movingId}"]`)
  if (snap) await page.getByTestId('align-relation').selectOption(snap.relation)
  for (const axis of axes) {
    const before = await item.getAttribute('data-body-bounds')
    await page.getByTestId(snap ? `align-${axis}-snap-${snap.side}` : `align-${axis}-center`).click()
    await expect(page.getByTestId('align-error')).toHaveCount(0)
    await expect.poll(() => item.getAttribute('data-body-bounds'), { timeout: 15_000 }).not.toBe(before)
  }
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('align-popover')).toHaveCount(0)
}

test('a Pi’s hole1 aligned onto a screen’s post, then its mb snapped onto the post top — both sides addressed (TODO/ui-063)', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  await openLibrary(page)
  await page.getByTestId('library-rows-raspberrypi').scrollIntoViewIfNeeded()
  await page.getByTestId('library-choice-raspberrypi.bplus').selectOption('5')
  await dragFromLibrary(page, 'raspberrypi.bplus', 0.3, 0.2)
  const pi = await bodyIdOf(page, 'raspberrypi.bplus')
  // TODO/core-058: the six screens are one row now, picked by its Screen model dropdown.
  await page.getByTestId('library-choice-raspberrypi.screen').selectOption('touchScreen2')
  await dragFromLibrary(page, 'raspberrypi.screen', 0.7, 0.25)
  const screen = await bodyIdOf(page, 'raspberrypi.screen')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const library = page.getByTestId('library-rows')
  if (await page.getByTestId('library-tab').isVisible() && (await library.isVisible())) {
    await page.getByTestId('library-tab').click()
  }

  // --- XY: hole1 on piMountingPost1 -------------------------------------------------
  await tapPart(page, pi, 'hole1')
  await checkPart(page, screen, 'piMountingPost1')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  // Both rows stay ticked: the screen's address did not take the Pi's.
  await expect(page.getByTestId(`objects-part-check-${pi}-hole1`)).toHaveAttribute('aria-checked', 'true')

  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('align-popover')).toHaveAttribute('data-target', 'second')
  await expect(page.getByTestId('align-operand-moving')).toHaveText('Raspberry Pi 1 › hole1')
  await expect(page.getByTestId('align-operand-target')).toHaveText('Touchscreen 2 1 › piMountingPost1')
  await expect(page.getByTestId('align-operands')).toHaveAttribute('data-subpart', 'true')
  await commitPopover(page, pi, ['x', 'y'])

  const hole1 = await inspectPart(page, pi, 'hole1')
  const post1 = await inspectPart(page, screen, 'piMountingPost1')
  expect(Math.abs(hole1.centre[0] - post1.centre[0])).toBeLessThan(TOL_MM)
  expect(Math.abs(hole1.centre[1] - post1.centre[1])).toBeLessThan(TOL_MM)
  // One commit placed all four: the farthest hole is on the farthest post too.
  const hole4 = await inspectPart(page, pi, 'hole4')
  const post4 = await inspectPart(page, screen, 'piMountingPost4')
  expect(Math.abs(hole4.centre[0] - post4.centre[0])).toBeLessThan(TOL_MM)
  expect(Math.abs(hole4.centre[1] - post4.centre[1])).toBeLessThan(TOL_MM)

  // --- Z: mb on the post's top ------------------------------------------------------
  await tapPart(page, pi, 'mb')
  await checkPart(page, screen, 'piMountingPost1')
  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('align-popover')).toHaveAttribute('data-target', 'second')
  await expect(page.getByTestId('align-operand-moving')).toHaveText(/› mb$/)
  await expect(page.getByTestId('align-operand-target')).toHaveText(/› piMountingPost1$/)
  // `outside-` (the board's underside on the post's top) is Outside, **+ side**: the board
  // ends up on the post's + Z side (`TODO/ui-060`).
  await commitPopover(page, pi, ['z'], { relation: 'outside', side: 'plus' })

  const mb = await inspectPart(page, pi, 'mb')
  const post = await inspectPart(page, screen, 'piMountingPost1')
  const mbBottom = mb.centre[2] - mb.size[2] / 2
  const postTop = post.centre[2] + post.size[2] / 2
  // No gap and no penetration: the board, not the SD card under it, rests on the post.
  expect(Math.abs(mbBottom - postTop)).toBeLessThan(TOL_MM)
  const sd = await inspectPart(page, pi, 'microsd')
  expect(sd.centre[2] - sd.size[2] / 2).toBeLessThan(postTop - 1)
  // The z step moved nothing in plan.
  const holeAfter = await inspectPart(page, pi, 'hole1')
  expect(Math.abs(holeAfter.centre[0] - post.centre[0])).toBeLessThan(TOL_MM)
  expect(Math.abs(holeAfter.centre[1] - post.centre[1])).toBeLessThan(TOL_MM)

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `pi-on-screen-posts-${testInfo.project.name}.png`) })
})

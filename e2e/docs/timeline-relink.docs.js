// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { endMovie, humanDrag, openApp, setCaption, startMovie } from './support.js'

/**
 * Docs movie for "When the move was yours: Re-link to the moved step" in `docs/timeline.md`
 * (`TODO/data-006`, swept by `TODO/docs-020`): the page's own worked example — a Cube, a chamfer
 * on its top face, a Sphere; roll back to the cube; move the cube; the chamfer goes amber and
 * `broken`; Re-link; Roll forward. Laptop only, Chromium.
 *
 * Kept in its own file (not `timeline.docs.js`) so adding it does not re-record the rewind and
 * edit-step movies, whose recordings are keyed to that file's hash. Real mouse, human-paced; the
 * move is a typed Position X in the Inspector (one move step, the same record a gizmo drag makes).
 * Every beat ends on an attribute assertion, and the last one checks the cube really sits at its
 * new place with the chamfer still on it.
 */
test.describe('docs media: timeline re-link', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** @param {import('@playwright/test').Page} page @param {string} testId */
  async function press(page, testId) {
    const el = page.getByTestId(testId)
    await el.scrollIntoViewIfNeeded()
    const b = await el.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await page.waitForTimeout(250)
    await el.click()
  }

  /** @param {import('@playwright/test').Page} page @param {string} op @param {{ fx: number, fy: number }} at */
  async function dropFromLibrary(page, op, at) {
    const row = await page.getByTestId(`library-row-${op}`).boundingBox()
    const view = await page.getByTestId('viewport').boundingBox()
    await humanDrag(
      page,
      { x: row.x + row.width / 2, y: row.y + row.height / 2 },
      { x: view.x + view.width * at.fx, y: view.y + view.height * at.fy },
      { steps: 14, ms: 500 },
    )
  }

  /**
   * `TODO/docs-039`: the History list is short and scrolls inside its panel, so the broken row would sit on the panel's
   * bottom edge. Scroll it to the end (smoothly, so it reads as a move) so the broken row and its reason are in frame.
   *
   * @param {import('@playwright/test').Page} page
   */
  async function scrollHistoryToEnd(page) {
    await page.getByTestId('timeline-rows').evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }))
    await page.waitForTimeout(500)
  }

  /**
   * `TODO/docs-041`: glide to a control, put its caption up, hold so the pointer is seen on it, then press. The caption
   * comes as the pointer arrives, not before.
   *
   * @param {import('@playwright/test').Page} page @param {string} testId @param {string} text @param {number} [hold]
   */
  async function hoverCaptionPress(page, testId, text, hold = 800) {
    const el = page.getByTestId(testId)
    await el.scrollIntoViewIfNeeded()
    const b = await el.boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await caption(page, text)
    await page.waitForTimeout(hold)
    await el.click()
  }

  /**
   * `TODO/docs-041`: enlarge (or restore) the History panel so its reason text is plain at GIF size. A transform keeps
   * the layout and the recorded pointer positions as they are.
   *
   * @param {import('@playwright/test').Page} page @param {boolean} on
   */
  async function zoomHistory(page, on) {
    await page.getByTestId('timeline-panel').evaluate((el, scale) => {
      const k = 1.4
      el.dataset.fullWidth ??= String(el.getBoundingClientRect().width)
      el.style.transformOrigin = 'bottom left'
      el.style.transition = 'transform 400ms ease'
      el.style.transform = scale ? `scale(${k})` : ''
      // The panel is as wide as the window, so narrow it by the factor and the scaled copy still ends at the edge.
      el.style.width = scale ? `${Number(el.dataset.fullWidth) / k}px` : ''
    }, on)
    await page.waitForTimeout(500)
  }

  /** The bottom of this movie shows the History panel, so its captions sit at the top of the 3D view. */
  const caption = (page, text) => setCaption(page, text, { at: 'top' })

  test('timeline-relink', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    const viewport = page.getByTestId('viewport')
    await startMovie(page, 'timeline-relink')

    // Cube 1, chamfered on its top face, then a Sphere.
    // `TODO/docs-041`: the build-up beats are captioned as each one starts.
    await caption(page, 'Drag a Cube from the library into the view')
    await dropFromLibrary(page, 'primitive.cuboid', { fx: 0.45, fy: 0.5 })
    await expect(viewport).toHaveAttribute('data-body-count', '1')
    await caption(page, 'Chamfer the top face: 5 mm')
    await press(page, 'operation-chamfer')
    await page.getByTestId('fillet-chamfer-face').selectOption('z+')
    await page.getByTestId('fillet-chamfer-radius').fill('5')
    await page.waitForTimeout(400)
    await press(page, 'fillet-chamfer-commit')
    await expect(page.getByTestId('fillet-chamfer-popover')).toBeHidden()
    await caption(page, 'Drag a Sphere in beside it')
    await dropFromLibrary(page, 'primitive.sphere', { fx: 0.7, fy: 0.5 })
    await expect(viewport).toHaveAttribute('data-body-count', '2')
    await caption(page, 'A cube with a chamfer on its top, and a sphere')
    await page.waitForTimeout(300)

    // Roll back to the bare cube, so the chamfer is inactive tail. `TODO/docs-041`: the caption comes with the press.
    await caption(page, 'Open History and select step 1, the bare cube')
    await press(page, 'timeline-toggle')
    await expect(page.getByTestId('timeline-panel')).toBeVisible()
    await press(page, 'timeline-row-1')
    await hoverCaptionPress(page, 'timeline-rollback', 'Press Roll back to step 1', 500)
    await expect(page.getByTestId('timeline-row-2')).toHaveAttribute('data-active', 'false')

    // Move the cube while rolled back: the chamfer now points at a superseded step.
    await caption(page, 'Move the cube: Position X = 60')
    const cubeRow = page.locator('[data-testid^="objects-row-"]', { hasText: 'Cube 1' }).first()
    await cubeRow.click()
    const field = page.getByTestId('inspector-position-x')
    const fb = await field.boundingBox()
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2, { steps: 12 })
    await field.click()
    await field.press('ControlOrMeta+a')
    await page.keyboard.type('60', { delay: 200 })
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('timeline-row-3').getByTestId('chip-broken')).toBeVisible()
    await expect(page.getByTestId('timeline-relink')).toBeVisible()
    await caption(page, 'The chamfer (step 3) is now amber and broken, with Re-link on its row')
    await scrollHistoryToEnd(page)
    await page.waitForTimeout(800)

    // Select the broken row: the reason is printed under it. `TODO/docs-040`: each caption goes up as its action starts.
    await caption(page, 'Select step 3: the reason is printed under the row')
    await press(page, 'timeline-row-3')
    await expect(page.getByTestId('timeline-broken-reason')).toContainText('another step already changed the part it works on')
    await expect(page.getByTestId('timeline-relink')).toBeEnabled()
    await scrollHistoryToEnd(page)
    await zoomHistory(page, true) // the reason text, larger
    await page.waitForTimeout(400)
    // `TODO/docs-040`: hover on Re-link with its caption up long enough to land on a sampled frame, then press.
    const relink = page.getByTestId('timeline-relink')
    const rb = await relink.boundingBox()
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2, { steps: 12 })
    await caption(page, 'Press Re-link')
    await page.waitForTimeout(1100)
    await relink.click()
    await expect(page.getByTestId('timeline-relink')).toHaveCount(0)
    await expect(page.getByTestId('timeline-row-3').getByTestId('chip-broken')).toHaveCount(0)
    await zoomHistory(page, false)
    await caption(page, 'The broken label is gone')
    await page.waitForTimeout(500)

    // Roll forward: chamfered cube (moved) and sphere are both back.
    await hoverCaptionPress(page, 'timeline-roll-forward', 'Press Roll forward: the moved, chamfered cube and the sphere are back', 500)
    await expect(page.getByTestId('timeline-rollback-strip')).toHaveCount(0)
    await expect(viewport).toHaveAttribute('data-body-count', '2')
    await expect(page.getByTestId('timeline-row-3').getByTestId('chip-broken')).toHaveCount(0)
    const cube = page.locator('[data-testid="scene-bodies"] li', { hasText: 'Cube 1' }).first()
    await expect(cube).toHaveAttribute('data-body-center', /^60(\.0+)?,/)
    await page.waitForTimeout(600)
    await setCaption(page) // the caption would hide the part: end on the result itself
    // `TODO/docs-040`: step in on the cube so the chamfer is plain at GIF size.
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('nav-zoom-in').click()
      await page.waitForTimeout(250)
    }
    await page.waitForTimeout(700)
    await endMovie(page, 'timeline-relink', { fps: 6, width: 560 })
  })
})

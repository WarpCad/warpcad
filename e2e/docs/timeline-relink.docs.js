// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { endMovie, humanDrag, openApp, setCaption, startMovie } from './support.js'

/**
 * Docs movie for "When the move was yours: Re-link to the moved step" in `docs/timeline.md`
 * (`TODO/data-006`, swept by `TODO/docs-020`): the page's own worked example — a Cube, a chamfer
 * on its top face, a Sphere; roll back to the cube; move the cube; the chamfer goes amber and
 * `broken`; Re-link to the moved step; Roll forward. Laptop only, Chromium.
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

  /** The bottom of this movie shows the History panel, so its captions sit at the top of the 3D view. */
  const caption = (page, text) => setCaption(page, text, { at: 'top' })

  test('timeline-relink', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    const viewport = page.getByTestId('viewport')
    await startMovie(page, 'timeline-relink')

    // Cube 1, chamfered on its top face, then a Sphere.
    await dropFromLibrary(page, 'primitive.cuboid', { fx: 0.45, fy: 0.5 })
    await expect(viewport).toHaveAttribute('data-body-count', '1')
    await press(page, 'operation-chamfer')
    await page.getByTestId('fillet-chamfer-face').selectOption('z+')
    await page.getByTestId('fillet-chamfer-radius').fill('5')
    await page.waitForTimeout(400)
    await press(page, 'fillet-chamfer-commit')
    await expect(page.getByTestId('fillet-chamfer-popover')).toBeHidden()
    await dropFromLibrary(page, 'primitive.sphere', { fx: 0.7, fy: 0.5 })
    await expect(viewport).toHaveAttribute('data-body-count', '2')
    await caption(page, 'A cube with a chamfer on its top, and a sphere')
    await page.waitForTimeout(700)

    // Roll back to the bare cube, so the chamfer is inactive tail.
    await caption(page, 'Roll back to step 1, the bare cube')
    await press(page, 'timeline-toggle')
    await expect(page.getByTestId('timeline-panel')).toBeVisible()
    await press(page, 'timeline-row-1')
    await press(page, 'timeline-rollback')
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
    await caption(page, 'The chamfer (step 3) is now broken: 1 item built on Cube 1 no longer builds')
    await page.waitForTimeout(1800)

    // Select the broken row: the reason and the offered button.
    await press(page, 'timeline-row-3')
    await caption(page, 'Select step 3: the reason is printed and Re-link to the moved step is offered')
    await expect(page.getByTestId('timeline-broken-reason')).toContainText('a later step already changed the part it works on')
    await expect(page.getByTestId('timeline-relink')).toBeEnabled()
    await page.waitForTimeout(1800)
    await caption(page, 'Press Re-link to the moved step')
    await press(page, 'timeline-relink')
    await expect(page.getByTestId('timeline-relink')).toHaveCount(0)
    await expect(page.getByTestId('timeline-row-3').getByTestId('chip-broken')).toHaveCount(0)
    await caption(page, 'The broken label is gone')
    await page.waitForTimeout(900)

    // Roll forward: chamfered cube (moved) and sphere are both back.
    await caption(page, 'Roll forward: the moved, chamfered cube and the sphere are back')
    await press(page, 'timeline-roll-forward')
    await expect(page.getByTestId('timeline-rollback-strip')).toHaveCount(0)
    await expect(viewport).toHaveAttribute('data-body-count', '2')
    await expect(page.getByTestId('timeline-row-3').getByTestId('chip-broken')).toHaveCount(0)
    const cube = page.locator('[data-testid="scene-bodies"] li', { hasText: 'Cube 1' }).first()
    await expect(cube).toHaveAttribute('data-body-center', /^60(\.0+)?,/)
    await page.waitForTimeout(900)
    await setCaption(page) // the caption would hide the part: end on the result itself
    await page.waitForTimeout(1300)
    await endMovie(page, 'timeline-relink', { fps: 6, width: 560 })
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * Pick depth inside a group (`TODO/ui-016`), driven against `/` — the running
 * app, not a Storybook iframe.
 *
 * `docs/decisions/interaction-model-qa.md` control 6, and `TODO/ACCEPTANCE.md`
 * scenario 6: a first click on an unselected group always selects the **whole**
 * group; a second, distinct click landing on one member's own mesh narrows to
 * that sub-part, with a breadcrumb making the depth change visible rather than a
 * silent field swap. Clicking the breadcrumb's group segment steps back up.
 *
 * **All three viewports, all three engines** (no `test.skip` narrowing here,
 * unlike `group-combine.e2e.js`): this task changed how every Group-valued body
 * becomes a mesh — one `Mesh` per part under a `THREE.Group` instead of one mesh
 * from the combined solid — and made the pick raycast recursive. Both are
 * WebGL/canvas surfaces per CLAUDE.md's Browser Support section, and Q16 calls
 * out sub-part hit targets as a phone-width concern specifically.
 */

/**
 * Open the Library if this viewport keeps it behind a tab.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/**
 * Put the Library sheet away, if this viewport has one.
 *
 * @param {import('@playwright/test').Page} page
 */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport and release inside it — real
 * `PointerEvent`s, the same helper `group-combine.e2e.js` uses, so this spec's
 * setup is genuinely the one that feature ships with.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} options
 */
async function dragRowIntoViewport(page, { op, fx, fy }) {
  await page.evaluate(
    ({ op, fx, fy }) => {
      const row = document.querySelector(`[data-testid="library-row-${op}"]`)
      const view = document.querySelector('[data-testid="viewport"]')
      if (!row || !view) throw new Error(`missing row ${op} or viewport`)
      const from = row.getBoundingClientRect()
      const to = view.getBoundingClientRect()
      const startX = from.left + from.width / 2
      const startY = from.top + from.height / 2
      const endX = to.left + to.width * fx
      const endY = to.top + to.height * fy

      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )

      fire(row, 'pointerdown', startX, startY)
      for (const t of [0.25, 0.5, 0.75, 1]) {
        fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
      }
      fire(window, 'pointerup', endX, endY)
    },
    { op, fx, fy },
  )
  await page.waitForTimeout(120)
}

/**
 * Click at a fraction of the viewport, as a press that does not move.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fx
 * @param {number} fy
 * @param {{ shift?: boolean }} [modifiers]
 */
async function clickViewportAt(page, fx, fy, modifiers = {}) {
  await page.evaluate(
    ({ fx, fy, shift }) => {
      const canvas = document.querySelector('[data-testid="viewport-canvas"]')
      if (!canvas) throw new Error('no canvas')
      const box = canvas.getBoundingClientRect()
      const x = box.left + box.width * fx
      const y = box.top + box.height * fy
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 3,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            shiftKey: shift === true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
    },
    { fx, fy, shift: modifiers.shift === true },
  )
  await page.waitForTimeout(90)
}

/**
 * The three dimension lines' quoted lengths, in millimetres.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number[]>}
 */
function dimensionLengths(page) {
  return page.$$eval('[data-testid^="dimension-"][data-length-mm]', (nodes) =>
    nodes.map((node) => Number(node.getAttribute('data-length-mm'))),
  )
}

// The same proven drop/click positions `group-combine.e2e.js` uses: far enough
// apart that the second cube does not snap onto the first, which is what makes
// "the combined box is much bigger than one part's" a real distinction.
const CUBE_A = { drop: { fx: 0.28, fy: 0.42 }, click: { fx: 0.28, fy: 0.38 } }
const CUBE_B = { drop: { fx: 0.72, fy: 0.3 }, click: { fx: 0.72, fy: 0.26 } }
const EMPTY = { fx: 0.04, fy: 0.06 }

/**
 * Two cubes, dropped apart and combined into one group by the Operations
 * toolbar — this spec's precondition, and `ui-015`'s own shipped path.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>} The resulting group body's id.
 */
async function placeAndGroupTwoCubes(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_B.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await clickViewportAt(page, CUBE_B.click.fx, CUBE_B.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await page.getByTestId('operation-group').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  return (await page.getByTestId('viewport').getAttribute('data-selected-id')) ?? ''
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('a first click on an unselected group selects the whole group, never a sub-part', async ({
  page,
}) => {
  const groupId = await placeAndGroupTwoCubes(page)

  // Deselect, so the next click is genuinely a *first* click (scenario 6 step 3).
  await clickViewportAt(page, EMPTY.fx, EMPTY.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', '')

  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', groupId)
  // No part depth: this is the whole-group contract, unchanged from `ui-015`. (Since
  // `ui-049` the breadcrumb itself is always there with its root `Objects` crumb; what
  // must be absent is the part segment.)
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)

  const lengths = await dimensionLengths(page)
  expect(lengths).toHaveLength(3)
  // The combined box spans both 40 mm cubes, which are far apart along X.
  expect(Math.max(...lengths)).toBeGreaterThan(80)
})

test('a second click on a member mesh narrows to that sub-part, with a breadcrumb and no gizmo', async ({
  page,
}) => {
  await placeAndGroupTwoCubes(page)
  await clickViewportAt(page, EMPTY.fx, EMPTY.fy)
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  const wholeGroupLengths = await dimensionLengths(page)

  // The second, distinct click — same member, now that the group is selected.
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)

  const breadcrumb = page.getByTestId('inspector-breadcrumb')
  await expect(breadcrumb).toBeVisible()
  await expect(page.getByTestId('inspector-breadcrumb-group')).toHaveText(/Group/)
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Cube 1')
  await expect(page.getByTestId('inspector-name')).toHaveText('Cube 1')

  // Display only: dimension lines stay (they measure), the gizmo goes (it would
  // be a drag handle for a transform that cannot target one named part).
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(0)
  await expect(page.getByTestId('dimension-lines')).toHaveAttribute('data-axis-count', '3')

  const partLengths = await dimensionLengths(page)
  expect(partLengths).toHaveLength(3)
  // One 40 mm cube, not the pair's combined span.
  for (const length of partLengths) expect(length).toBeCloseTo(40, 1)
  expect(Math.max(...partLengths)).toBeLessThan(Math.max(...wholeGroupLengths))

  // The sub-part's own params, read-only — and not the group's `names` param.
  await expect(page.getByTestId('inspector-param-size-x')).toBeAttached()
  await expect(page.getByTestId('inspector-position-x')).toHaveAttribute('readonly', '')
})

test('clicking a different member re-targets straight to that sibling, no step-up first', async ({
  page,
}) => {
  await placeAndGroupTwoCubes(page)
  await clickViewportAt(page, EMPTY.fx, EMPTY.fy)
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Cube 1')

  // Straight to the sibling while already drilled in — this task's own explicit
  // call on the one behaviour control 6's Q&A left implicit.
  await clickViewportAt(page, CUBE_B.click.fx, CUBE_B.click.fy)
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Cube 2')
  await expect(page.getByTestId('inspector-name')).toHaveText('Cube 2')
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(0)
})

test('the breadcrumb group segment steps back up, and empty space clears everything', async ({
  page,
}) => {
  const groupId = await placeAndGroupTwoCubes(page)
  await clickViewportAt(page, EMPTY.fx, EMPTY.fy)
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await expect(page.getByTestId('inspector-breadcrumb')).toBeVisible()

  await page.getByTestId('inspector-breadcrumb-group').click()

  // Back to the whole-group contract: the part segment gone, gizmo reattached, and
  // the dimension lines sized to the combined bounding box again.
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', groupId)
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)
  expect(Math.max(...(await dimensionLengths(page)))).toBeGreaterThan(80)

  await clickViewportAt(page, EMPTY.fx, EMPTY.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', '')
  await expect(page.getByTestId('transform-gizmo')).toHaveCount(0)
  await expect(page.getByTestId('dimension-lines')).toHaveAttribute('data-axis-count', '0')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-state', 'empty')
})

test('a group still renders both members after per-part meshing — neither is lost', async ({
  page,
}) => {
  // The regression this task's render change could plausibly cause, and the one
  // `ACCEPTANCE.md` scenario 1 is about: replacing one combined mesh with one
  // mesh per part must not drop a part on the floor. Both members stay pickable
  // at their own screen positions, which is only true if both were drawn.
  await placeAndGroupTwoCubes(page)
  await clickViewportAt(page, EMPTY.fx, EMPTY.fy)

  for (const cube of [CUBE_A, CUBE_B]) {
    await clickViewportAt(page, cube.click.fx, cube.click.fy)
    await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-selected-id', '')
    await clickViewportAt(page, EMPTY.fx, EMPTY.fy)
  }
})

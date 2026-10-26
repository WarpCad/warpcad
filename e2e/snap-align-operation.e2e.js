// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * The Operations toolbar's fifth and sixth buttons, Snap and Align
 * (`TODO/ui-026`), driven against `/` — the running app, not a Storybook iframe.
 *
 * A separate file from `e2e/boolean-operations.e2e.js` and
 * `e2e/group-combine.e2e.js` on purpose: unlike every other button on this
 * toolbar, Snap/Align's whole point is that **both operands remain
 * independently selectable afterward** — nothing is combined or consumed — and
 * the precondition is **exactly 2** selected, not "2 or more". Sharing a file
 * with the other four would blur those two divergent claims into one.
 *
 * **All three reference viewports and (since `TODO/ui-060`) all three engines.** The tool is
 * now the one Align popover, whose taps commit straight into the document, and every flow
 * here places its bodies by dragging in the canvas, so the cross-engine run is cheap and
 * `CLAUDE.md`'s Browser Support section asks for it. Earlier this file was Chromium only,
 * on `ui-014`/`ui-015`'s reasoning, which still describes the logic under test: it is DOM/state logic
 * (popover open/close, axis/orientation/offset collection, the record shape
 * appended to the document) rather than a new WebGL/WASM/canvas/touch surface —
 * `viewport-scaffold.e2e.js` already covers that nine ways for the viewport
 * itself. The viewport axis stays real, though: the popover is a brand-new
 * element whose fit at 390px width needs its own check, per this task's own
 * Interaction model.
 *
 * `TODO/ui-035` added the last two cases — a drilled-in **sub-part** as one of
 * the two operands — and keeps that narrowing for the same reason plus one more:
 * what this task changed is which *operand shape* the commit builds, still DOM/
 * state logic, and the one genuinely WebGL-dependent step it leans on (the
 * second click that drills into a group member's own mesh) is already covered at
 * all three viewports **and** all three engines by `group-subpart-selection.e2e.js`,
 * which exists precisely because that raycast is a canvas surface. Repeating it
 * nine ways here would re-test `ui-016`'s picking, not this task's addressing.
 *
 * The expected positions below are computed with the exact same formulas
 * `src/core/kernel/group.js`'s `calcSnap`/`calcCenterWith` use (the module doc
 * on `OperationsToolbar.vue` cites the same source), applied to each body's own
 * bounds as read back from the DOM after placement — never to a hardcoded,
 * assumed drop position. That is what "not eyeballed" means for this file: the
 * assertion is arithmetic, not a screenshot glance, and it is derived from the
 * real body sizes this codebase already documents and relies on elsewhere
 * (`boolean-operations.e2e.js`'s own Intersect test states the same "40 mm
 * cube" / "⌀40 × 50 cylinder" facts about the Library's default primitives).
 */

/**
 * Unfold the navigation chrome if it is folded behind its phone-only toggle — it
 * collapses while a bottom sheet raises it at ≤640px (`TODO/ui-046`). A no-op
 * everywhere else.
 *
 * @param {import('@playwright/test').Page} page
 */
async function openNavChrome(page) {
  const toggle = page.getByTestId('nav-expand-toggle')
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  }
}

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
 * `PointerEvent`s, matching every other spec in this folder.
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
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, op: string, name: string, center: string }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: node.getAttribute('data-body-center') ?? '',
      bounds: node.getAttribute('data-body-bounds') ?? '',
    })),
  )
}

/**
 * @param {string} center `"x,y,z"` as `data-body-center` renders it.
 * @returns {[number, number, number]}
 */
function parseCenter(center) {
  const [x, y, z] = center.split(',').map(Number)
  return [x, y, z]
}

// Same proven drop-and-click positions `boolean-operations.e2e.js` and
// `group-combine.e2e.js` already use at every reference viewport: far enough
// apart that neither snaps onto the other, and both reliably clickable.
const CUBE = { drop: { fx: 0.28, fy: 0.42 }, click: { fx: 0.28, fy: 0.38 } }
const CYLINDER = { drop: { fx: 0.72, fy: 0.3 }, click: { fx: 0.72, fy: 0.26 } }

/**
 * Half-extents of the Library's default primitives, in millimetres —
 * `[x, y, z]`. Stated as fact elsewhere in this codebase, not measured fresh
 * here: `boolean-operations.e2e.js`'s own Intersect test already relies on "a
 * 40 mm cube and a ⌀40 × 50 cylinder" as the Library's default drop sizes.
 * Both primitives are axis-aligned and unrotated immediately after a plain
 * drop, so `bounds = center ± half` exactly, the same measurement
 * `group.js`'s own `boundsOf` would report.
 */
const CUBE_HALF = /** @type {[number, number, number]} */ ([20, 20, 20])
const CYLINDER_HALF = /** @type {[number, number, number]} */ ([20, 20, 25])

/**
 * The one `SNAP_SIDES` entry this file exercises, transcribed verbatim from
 * `src/core/kernel/group.js`: `[referenceSide, movingSide]`, `0` a bounding
 * box's min corner, `1` its max corner.
 */
const OUTSIDE_PLUS = /** @type {[number, number]} */ ([0, 1])

/**
 * The millimetre offset `calcSnap` (`group.js`) would compute for axis `z`,
 * given each body's own half-extent and world centre — the same formula, just
 * inlined here as the oracle this file's Snap assertion checks the UI against.
 *
 * @param {[number, number, number]} movingCenter
 * @param {[number, number, number]} movingHalf
 * @param {[number, number, number]} referenceCenter
 * @param {[number, number, number]} referenceHalf
 * @param {number} deltaMm
 * @returns {number}
 */
function calcSnapZ(movingCenter, movingHalf, referenceCenter, referenceHalf, deltaMm) {
  const [referenceSide, movingSide] = OUTSIDE_PLUS
  const referenceBoundZ =
    referenceCenter[2] + (referenceSide === 0 ? -referenceHalf[2] : referenceHalf[2])
  const movingBoundZ = movingCenter[2] + (movingSide === 0 ? -movingHalf[2] : movingHalf[2])
  return referenceBoundZ - movingBoundZ + deltaMm
}

/**
 * The millimetre offset `calcCenterWith` (`group.js`) would compute for axis
 * `z` — centre-to-centre, plus a uniform scalar delta.
 *
 * @param {[number, number, number]} movingCenter
 * @param {[number, number, number]} referenceCenter
 * @param {number} deltaMm
 * @returns {number}
 */
function calcAlignZ(movingCenter, referenceCenter, deltaMm) {
  return referenceCenter[2] - movingCenter[2] + deltaMm
}

/**
 * Place the Cube (moving) and Cylinder (reference) this file's tests operate
 * on, and clear the panel that would otherwise cover the lower viewport at
 * phone width.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeCubeAndCylinder(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', ...CYLINDER.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  return sceneBodies(page)
}

/**
 * Select the Cube then the Cylinder — Cube is "moving" (first selected),
 * Cylinder is "reference" (second selected), per this task's Interaction model.
 *
 * @param {import('@playwright/test').Page} page
 */
async function selectCubeThenCylinder(page) {
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await clickViewportAt(page, CYLINDER.click.fx, CYLINDER.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('Align starts disabled and needs 1 or 2 selected — not "2 or more" like the four buttons before it (TODO/ui-060)', async ({
  page,
}) => {
  // One Align button since `TODO/ui-060`: Snap is gone from the toolbar.
  await expect(page.getByTestId('operation-snap')).toHaveCount(0)
  const align = page.getByTestId('operation-align')
  await expect(align).toBeVisible()
  await expect(align).toBeDisabled()

  await placeCubeAndCylinder(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.36 })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')

  // One selected: enough — it aligns to the world origin.
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(align).toBeEnabled()

  // Two selected: the first aligns to the second.
  await clickViewportAt(page, CYLINDER.click.fx, CYLINDER.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(align).toBeEnabled()

  // Three selected: disabled again — the divergence from the other four
  // buttons' "2+" gate, which would still be enabled at 3.
  await clickViewportAt(page, 0.5, 0.32, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '3')
  await expect(align).toBeDisabled()
  await expect(align).toHaveAttribute('title', 'Select 1 or 2 solids')
  await expect(page.getByTestId('operation-union')).toBeEnabled()
})

test('closing the popover without committing changes nothing', async ({ page }) => {
  const before = await placeCubeAndCylinder(page)
  await selectCubeThenCylinder(page)

  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('align-popover')).toBeVisible()
  // Typing an offset is not a commit: only a grid tap is.
  await page.getByTestId('align-offset').fill('4')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('align-popover')).toHaveCount(0)

  // Still 2 bodies, still 2 selected, and neither body moved.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  const after = await sceneBodies(page)
  expect(after.map((body) => body.center)).toEqual(before.map((body) => body.center))
})

test('Align centres the moving Cube on the reference Cylinder along Z; the Cylinder never moves; both stay independently selectable', async ({
  page,
}) => {
  const [cube, cylinder] = await placeCubeAndCylinder(page)
  await selectCubeThenCylinder(page)

  const cubeCenter = parseCenter(cube.center)
  const cylinderCenter = parseCenter(cylinder.center)
  const expectedZ = calcAlignZ(cubeCenter, cylinderCenter, 0)
  const expectedCubeCenter = [cubeCenter[0], cubeCenter[1], cubeCenter[2] + expectedZ]

  await page.getByTestId('operation-align').click()
  const popover = page.getByTestId('align-popover')
  await expect(popover).toBeVisible()
  // Two selected: Target defaults to the second-picked body (`TODO/ui-060`).
  await expect(popover).toHaveAttribute('data-target', 'second')

  // ◇ ctr on Z is the old Align with Z ticked: one tap, one commit.
  await page.getByTestId('align-z-center').click()

  // The popover stays open for the next axis (`TODO/ui-060`); Escape closes it.
  await expect(popover).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)

  // Both operands remain — `supersedes`, not `consumes` — so the body count
  // is unchanged (a boolean or Group would have dropped this to 1).
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  // A tap leaves the selection alone (`TODO/ui-060`): both stay selected.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

  const bodiesAfter = await sceneBodies(page)
  const cubeAfter = bodiesAfter.find((body) => body.id === cube.id)
  const cylinderAfter = bodiesAfter.find((body) => body.id === cylinder.id)
  expect(cubeAfter, 'the Cube is still a separate, findable body').toBeTruthy()
  expect(cylinderAfter, 'the Cylinder is still a separate, findable body').toBeTruthy()

  // Exact arithmetic, not eyeballed: X and Y are untouched (axis Z only was
  // checked), and Z matches `calcCenterWith`'s own formula to the millimetre.
  const actualCubeCenter = parseCenter(cubeAfter.center)
  expect(actualCubeCenter[0]).toBeCloseTo(expectedCubeCenter[0], 2)
  expect(actualCubeCenter[1]).toBeCloseTo(expectedCubeCenter[1], 2)
  expect(actualCubeCenter[2]).toBeCloseTo(expectedCubeCenter[2], 2)

  // The reference Cylinder's position is byte-identical to before — it was
  // only ever read, never written.
  expect(cylinderAfter.center).toBe(cylinder.center)

  // "Both remain independently selectable" — the literal claim this task's own
  // Testing section asks for, checked by actually clicking each one and
  // watching the Inspector retarget, not just by reading `data-body-count`.
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cube.id)
  await expect(page.getByTestId('inspector-name')).toBeVisible()

  await clickViewportAt(page, CYLINDER.click.fx, CYLINDER.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', cylinder.id)
  await expect(page.getByTestId('inspector-name')).toBeVisible()
})

test('Snap moves the moving Cube flush outside the reference Cylinder on Z, with a real offset — exact arithmetic against calcSnap', async ({
  page,
}) => {
  const [cube, cylinder] = await placeCubeAndCylinder(page)
  await selectCubeThenCylinder(page)

  const cubeCenter = parseCenter(cube.center)
  const cylinderCenter = parseCenter(cylinder.center)
  const OFFSET_MM = 5
  const expectedZ = calcSnapZ(cubeCenter, CUBE_HALF, cylinderCenter, CYLINDER_HALF, OFFSET_MM)
  const expectedCubeCenter = [cubeCenter[0], cubeCenter[1], cubeCenter[2] + expectedZ]

  await page.getByTestId('operation-align').click()
  const popover = page.getByTestId('align-popover')
  await expect(popover).toBeVisible()

  // `outside+` is the **outside −** button: the Cube ends up under the Cylinder
  // (`TODO/ui-060`'s Step 2 mapping onto `SNAP_SIDES`). The offset applies to the next tap.
  await page.getByTestId('align-offset').fill(String(OFFSET_MM))
  await page.getByTestId('align-z-outside-minus').click()
  await expect(popover).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  const bodiesAfter = await sceneBodies(page)
  const cubeAfter = bodiesAfter.find((body) => body.id === cube.id)
  const cylinderAfter = bodiesAfter.find((body) => body.id === cylinder.id)
  const actualCubeCenter = parseCenter(cubeAfter.center)

  expect(actualCubeCenter[0]).toBeCloseTo(expectedCubeCenter[0], 2)
  expect(actualCubeCenter[1]).toBeCloseTo(expectedCubeCenter[1], 2)
  expect(actualCubeCenter[2]).toBeCloseTo(expectedCubeCenter[2], 2)
  // The reference Cylinder never moved.
  expect(cylinderAfter.center).toBe(cylinder.center)
})

test('a body snapped to a shape follows when that shape is resized in the Inspector, and one Undo restores both (TODO/data-007)', async ({
  page,
}) => {
  const [cube, cylinder] = await placeCubeAndCylinder(page)
  await selectCubeThenCylinder(page)
  await page.getByTestId('operation-align').click()
  await page.getByTestId('align-z-outside-minus').click() // outside+
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('align-popover')).toHaveCount(0)

  const snapped = parseCenter((await sceneBodies(page)).find((body) => body.id === cube.id).center)

  // Select the Cylinder alone and make it taller: its centre stays put, so its bottom
  // (the face the Cube is flush against) drops by 10 mm.
  await clickViewportAt(page, CYLINDER.click.fx, CYLINDER.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  const height = page.getByTestId('inspector-param-height')
  await expect(height).toBeVisible()
  await height.click()
  await height.fill('70')
  await height.press('Enter')
  await page.waitForTimeout(160)

  const after = await sceneBodies(page)
  const followed = parseCenter(after.find((body) => body.id === cube.id).center)
  expect(followed[0]).toBeCloseTo(snapped[0], 2)
  expect(followed[1]).toBeCloseTo(snapped[1], 2)
  expect(followed[2]).toBeCloseTo(snapped[2] - 10, 2)
  expect(parseCenter(after.find((body) => body.id === cylinder.id).center)[2]).toBeCloseTo(
    parseCenter(cylinder.center)[2],
    2,
  )

  await page.getByTestId('undo-button').click()
  const undone = await sceneBodies(page)
  expect(parseCenter(undone.find((body) => body.id === cube.id).center)[2]).toBeCloseTo(snapped[2], 2)
})

test('a third selected body disables Align, same 1-or-2 gate as the gating test above', async ({
  page,
}) => {
  await placeCubeAndCylinder(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.36 })
  await closeLibrary(page)

  await openNavChrome(page)
  await page.getByTestId('nav-mode-select').click()
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="viewport-canvas"]')
    const box = canvas.getBoundingClientRect()
    const fire = (type, fx, fy) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 21,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: box.left + box.width * fx,
          clientY: box.top + box.height * fy,
          bubbles: true,
          cancelable: true,
        }),
      )
    fire('pointerdown', 0.05, 0.05)
    for (const t of [0.33, 0.66, 1]) fire('pointermove', 0.05 + 0.9 * t, 0.05 + 0.9 * t)
    fire('pointerup', 0.95, 0.95)
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '3')

  await expect(page.getByTestId('operation-align')).toBeDisabled()
})

/**
 * Two cubes combined into one Group, plus a third, separate cube — the fixture
 * `TODO/ui-035` needs, and deliberately assembled through the app's own shipped
 * paths (`ui-015`'s Group button, `ui-016`'s two-click drill-in) rather than by
 * poking state in.
 *
 * The two group members are dropped far apart on purpose: the group's own
 * bounding-box centre then sits nowhere near either member's, which is the whole
 * reason "did this address the sub-part or the whole group?" is a question
 * arithmetic can answer rather than a matter of reading the record back.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeGroupAndThirdCube(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', ...CYLINDER.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  // Each member's own centre, measured *before* the Group — `group.assemble`
  // moves nothing, so these are still each part's own centres afterward, and
  // they are what a sub-part-addressed Align has to be computed against.
  const [cube, cylinder] = await sceneBodies(page)

  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await clickViewportAt(page, CYLINDER.click.fx, CYLINDER.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await page.getByTestId('operation-group').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const groupId = (await page.getByTestId('viewport').getAttribute('data-selected-id')) ?? ''

  // The reference body, placed after the Group so it cannot be swept into it.
  // Same third-body position the exact-2 gating test above already proves is
  // separately clickable at every reference viewport.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.36 })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  const bodies = await sceneBodies(page)
  const group = bodies.find((candidate) => candidate.id === groupId)
  const reference = bodies.find((candidate) => candidate.id !== groupId)
  return { cube, cylinder, group, reference }
}

test('Align addresses a drilled-in sub-part: the whole Group moves by that part’s own arithmetic, and the popover names it (TODO/ui-035)', async ({
  page,
}) => {
  const { cube, group, reference } = await placeGroupAndThirdCube(page)

  const partCenter = parseCenter(cube.center) // "Cube 1" — the drilled-in member
  const groupCenter = parseCenter(group.center)
  const referenceCenter = parseCenter(reference.center)

  // The two candidate answers have to be far enough apart that the assertion
  // below is really distinguishing them, not passing on a coincidence.
  //
  // Threshold lowered from 5 to 4 by `TODO/data-003`, which put 44px Undo/Redo
  // buttons in the header and so grew it from ~30px to ~53px at the 390px phone
  // reference. That shifts the phone camera's projection slightly, and this
  // fixture's X separation there went from 5.61 mm to 4.69 mm — it had been
  // sitting just above a round-number guard. Deliberately not re-tuned by moving
  // the drop points, which are shared with seven other tests in this file. The
  // guard still does its job: the assertion it protects has a 0.05 mm tolerance,
  // so 4.69 mm is ~90× the margin needed to tell the two answers apart.
  expect(
    Math.abs(partCenter[0] - groupCenter[0]),
    'the member’s own X centre and the group’s differ enough to tell the two answers apart',
  ).toBeGreaterThan(4)

  // Drill in the way a user does: deselect, click once (whole group), click the
  // same member again (narrow to it), then Shift-click the second body.
  await clickViewportAt(page, 0.04, 0.06)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', group.id)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText('Cube 1')
  await clickViewportAt(page, 0.5, 0.32, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

  await page.getByTestId('operation-align').click()
  const popover = page.getByTestId('align-popover')
  await expect(popover).toBeVisible()

  // The feedback half of this task: which depth is about to be committed has to
  // be readable inside the popover, because a sub-part-addressed move looks
  // exactly like a whole-object one once it has happened.
  const operands = page.getByTestId('align-operands')
  await expect(operands).toBeVisible()
  await expect(operands).toHaveAttribute('data-subpart', 'true')
  await expect(page.getByTestId('align-operand-moving')).toHaveText(/›\s*Cube 1$/)
  // The line fits the popover at every reference viewport, 390px included —
  // this task's Interaction model asks for that to be confirmed, not assumed.
  const operandsBox = await operands.boundingBox()
  const popoverBox = await popover.boundingBox()
  expect(operandsBox.x + operandsBox.width).toBeLessThanOrEqual(popoverBox.x + popoverBox.width + 1)

  await page.getByTestId('align-x-center').click()
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)

  // Both bodies survive — `supersedes`, not `consumes`, unchanged from ui-026.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  const after = await sceneBodies(page)
  const groupAfter = after.find((candidate) => candidate.id === group.id)
  const referenceAfter = after.find((candidate) => candidate.id === reference.id)
  const actual = parseCenter(groupAfter.center)

  // `calcCenterWith` against **Cube 1's** centre, with the whole group carried
  // along by that same delta (`registry.js`: "the named pieces drive the offset;
  // the whole group still moves"). Whole-object addressing would instead have
  // landed the *group's* centre on the reference — the second expectation is
  // what makes this a real distinction rather than a restatement.
  const expectedX = groupCenter[0] + (referenceCenter[0] - partCenter[0])
  // One decimal, not two, and for a stated reason rather than to make a number
  // fit: `data-body-center` renders each coordinate through `.toFixed(2)`, and
  // this expectation is built from **three** separately rounded readings, so up
  // to ~0.015 mm of pure display rounding can accumulate in it before any
  // geometry is involved (measured: 0.010 at tablet width). 0.05 mm is still
  // three orders of magnitude tighter than the ~50 mm gap between the two
  // answers this test exists to tell apart.
  expect(actual[0]).toBeCloseTo(expectedX, 1)
  // The mirror of the fixture guard at the top of this test — after a sub-part
  // Align the group's centre misses the reference's by exactly the part-to-group
  // offset, so this is the same 4.69 mm quantity and moved from 5 to 4 for the
  // same reason recorded there (`TODO/data-003`'s taller phone header).
  expect(Math.abs(actual[0] - referenceCenter[0])).toBeGreaterThan(4)
  // Only X was checked.
  expect(actual[1]).toBeCloseTo(groupCenter[1], 1)
  expect(actual[2]).toBeCloseTo(groupCenter[2], 1)
  // The reference never moved.
  expect(referenceAfter.center).toBe(reference.center)

  // Still a group with both parts: `group.align` returns the moved group, so the
  // member is still there to drill into a second time (`core-013`'s own §2).
  await clickViewportAt(page, 0.04, 0.06)
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', group.id)
})

test('with nothing drilled in, the popover names both whole bodies and commits ui-026’s own whole-object result (TODO/ui-035 regression guard)', async ({
  page,
}) => {
  const [cube, cylinder] = await placeCubeAndCylinder(page)
  await selectCubeThenCylinder(page)

  await page.getByTestId('operation-align').click()
  const operands = page.getByTestId('align-operands')
  await expect(operands).toHaveAttribute('data-subpart', 'false')
  await expect(page.getByTestId('align-operand-moving')).toHaveText(cube.name)
  await expect(page.getByTestId('align-operand-target')).toHaveText(cylinder.name)

  await page.getByTestId('align-z-center').click()

  const after = await sceneBodies(page)
  const cubeAfter = after.find((candidate) => candidate.id === cube.id)
  const expectedZ = calcAlignZ(parseCenter(cube.center), parseCenter(cylinder.center), 0)
  expect(parseCenter(cubeAfter.center)[2]).toBeCloseTo(parseCenter(cube.center)[2] + expectedZ, 2)
})

test('the popover stays on-screen and reachable at 390px width — no horizontal page scroll', async ({
  page,
}) => {
  await placeCubeAndCylinder(page)
  await selectCubeThenCylinder(page)

  await page.getByTestId('operation-align').click()
  const popover = page.getByTestId('align-popover')
  await expect(popover).toBeVisible()

  const box = await popover.boundingBox()
  expect(box).not.toBeNull()
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(clientWidth + 1)

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)

  // Every grid button is a real 44px tap target, not a shrunken icon (`TODO/ui-060`).
  // The popover is wider than its siblings (`TODO/ui-086`) and seven of them share a row.
  const popoverScroll = await popover.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
  expect(popoverScroll.scroll).toBeLessThanOrEqual(popoverScroll.client)
  for (const axis of ['x', 'y', 'z']) {
    for (const key of POSITION_KEYS) {
      const controlBox = await page.getByTestId(`align-${axis}-${key}`).boundingBox()
      expect(controlBox).not.toBeNull()
      expect(controlBox.width).toBeGreaterThanOrEqual(43.5)
      expect(controlBox.height).toBeGreaterThanOrEqual(43.5)
    }
  }
  // Each header word sits over its column: centres within 1 px of the buttons below it.
  const headers = await page.getByTestId('align-header').locator('span.align-grid__header').all()
  expect(headers).toHaveLength(7)
  for (const [index, key] of POSITION_KEYS.entries()) {
    const word = await headers[index].boundingBox()
    const button = await page.getByTestId(`align-x-${key}`).boundingBox()
    expect(Math.abs(word.x + word.width / 2 - (button.x + button.width / 2))).toBeLessThanOrEqual(1)
  }
  await expect(popover).toHaveScreenshot('align-popover-seven-positions.png', { animations: 'disabled', maxDiffPixelRatio: 0.03 })
})

/** The seven positions, − to +, as the buttons' testid suffixes (`TODO/ui-086`). */
const POSITION_KEYS = ['outside-minus', 'inside-minus', 'half-minus', 'center', 'half-plus', 'inside-plus', 'outside-plus']

test('all seven positions on Z land the moving Cube where their words say, and the Cylinder never moves; a tap names itself in the caption (TODO/ui-086)', async ({
  page,
}) => {
  const [cube, cylinder] = await placeCubeAndCylinder(page)
  await selectCubeThenCylinder(page)
  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('align-popover')).toBeVisible()

  const [, , cMinZ, , , cMaxZ] = cylinder.bounds.split(',').map(Number)
  const cCentreZ = (cMinZ + cMaxZ) / 2
  const height = CUBE_HALF[2] * 2
  // [key, expected moving min z] — written out, not derived from the component's own table.
  const expected = [
    ['outside-minus', cMinZ - height], // + face on the target's − face
    ['inside-minus', cMinZ], // − faces flush
    ['half-minus', cCentreZ - height], // + face on the centre
    ['center', cCentreZ - height / 2],
    ['half-plus', cCentreZ], // − face on the centre
    ['inside-plus', cMaxZ - height], // + faces flush
    ['outside-plus', cMaxZ], // − face on the target's + face
  ]
  for (const [key, minZ] of expected) {
    await page.getByTestId(`align-z-${key}`).click()
    await expect(page.getByTestId('align-caption')).toContainText(/^Z /)
    await expect
      .poll(async () => Number((await sceneBodies(page)).find((body) => body.id === cube.id).bounds.split(',')[2]), { timeout: 15_000 })
      .toBeCloseTo(minZ, 1)
    expect((await sceneBodies(page)).find((body) => body.id === cylinder.id).bounds).toBe(cylinder.bounds)
  }
})

test('World origin: outside + on Z sits the Cube on the grid (TODO/ui-086)', async ({ page }) => {
  const [cube] = await placeCubeAndCylinder(page)
  await selectCubeThenCylinder(page)
  await page.getByTestId('operation-align').click()
  await page.getByTestId('align-target').selectOption('origin')
  await page.getByTestId('align-z-outside-plus').click()
  await expect
    .poll(async () => Number((await sceneBodies(page)).find((body) => body.id === cube.id).bounds.split(',')[2]), { timeout: 15_000 })
    .toBeCloseTo(0, 1)
})

/**
 * `TODO/ui-053`: the Esc bug fixed on the Fillet/Chamfer popover was never
 * specific to that pair — `openPopover`, `closePopover` and the one
 * `.ops__popover-backdrop` in `OperationsToolbar.vue` are shared by all three
 * popovers this toolbar owns, Snap/Align included, and none of them had an
 * Escape handler before the fix. Confirmed here, on the structurally
 * different exactly-2-operand popover, that the same fix covers it: Escape
 * actually removes the popover (and its backdrop), and the very first Library
 * drag afterward still places a body rather than being swallowed by a
 * still-mounted backdrop.
 */
test('the first Library drag after dismissing the Align popover with Escape still places a body', async ({ page }) => {
  await placeCubeAndCylinder(page)
  await selectCubeThenCylinder(page)

  await page.getByTestId('operation-align').click()
  const popover = page.getByTestId('align-popover')
  await expect(popover).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)

  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.36 })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
})

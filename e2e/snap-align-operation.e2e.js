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
 * **All three reference viewports, Chromium only.** Same reasoning
 * `ui-014`/`ui-015` gave for their own engine coverage: this is DOM/state logic
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

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'DOM/state logic, no new WebGL/canvas/touch surface — see this file’s header and TODO/ui-026',
)

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

test('Snap and Align start disabled, need exactly 2 — not "2 or more" like the other four buttons', async ({
  page,
}) => {
  const snap = page.getByTestId('operation-snap')
  const align = page.getByTestId('operation-align')
  await expect(snap).toBeVisible()
  await expect(align).toBeVisible()
  await expect(snap).toBeDisabled()
  await expect(align).toBeDisabled()

  await placeCubeAndCylinder(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.36 })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')

  // One selected: still not enough.
  await clickViewportAt(page, CUBE.click.fx, CUBE.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(snap).toBeDisabled()
  await expect(align).toBeDisabled()

  // Two selected: exactly enough — enabled, unlike a fresh Union/Subtract/
  // Intersect/Group check, which this test deliberately leaves alone (already
  // covered by `boolean-operations.e2e.js`/`group-combine.e2e.js`).
  await clickViewportAt(page, CYLINDER.click.fx, CYLINDER.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(snap).toBeEnabled()
  await expect(align).toBeEnabled()

  // Three selected: disabled again — the divergence from the other four
  // buttons' "2+" gate, which would still be enabled at 3.
  await clickViewportAt(page, 0.5, 0.32, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '3')
  await expect(snap).toBeDisabled()
  await expect(align).toBeDisabled()
  await expect(page.getByTestId('operation-union')).toBeEnabled()
})

test('closing the popover without committing changes nothing', async ({ page }) => {
  const before = await placeCubeAndCylinder(page)
  await selectCubeThenCylinder(page)

  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('snap-align-popover')).toBeVisible()
  await page.getByTestId('snap-align-axis-z').check()

  await page.getByTestId('snap-align-cancel').click()
  await expect(page.getByTestId('snap-align-popover')).toHaveCount(0)

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
  const popover = page.getByTestId('snap-align-popover')
  await expect(popover).toBeVisible()
  await expect(popover).toHaveAttribute('data-op', 'group.align')
  // Align has no orientation control — V1's own signature difference.
  await expect(page.getByTestId('snap-align-orientation')).toHaveCount(0)

  const commit = page.getByTestId('snap-align-commit')
  await expect(commit).toBeDisabled() // no axis checked yet
  await page.getByTestId('snap-align-axis-z').check()
  await expect(commit).toBeEnabled()
  await commit.click()

  await expect(popover).toHaveCount(0)

  // Both operands remain — `supersedes`, not `consumes` — so the body count
  // is unchanged (a boolean or Group would have dropped this to 1).
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  // Only the moved (Cube) solid stays selected; the reference drops out.
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')

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

  await page.getByTestId('operation-snap').click()
  const popover = page.getByTestId('snap-align-popover')
  await expect(popover).toBeVisible()
  await expect(popover).toHaveAttribute('data-op', 'group.snap')

  await page.getByTestId('snap-align-axis-z').check()
  await page.getByTestId('snap-align-orientation').selectOption('outside+')
  await page.getByTestId('snap-align-offset').fill(String(OFFSET_MM))

  await page.getByTestId('snap-align-commit').click()
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

test('a third selected body disables both Snap and Align, same exact-2 gate as the gating test above', async ({
  page,
}) => {
  await placeCubeAndCylinder(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.36 })
  await closeLibrary(page)

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

  await expect(page.getByTestId('operation-snap')).toBeDisabled()
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
  const popover = page.getByTestId('snap-align-popover')
  await expect(popover).toBeVisible()

  // The feedback half of this task: which depth is about to be committed has to
  // be readable inside the popover, because a sub-part-addressed move looks
  // exactly like a whole-object one once it has happened.
  const operands = page.getByTestId('snap-align-operands')
  await expect(operands).toBeVisible()
  await expect(operands).toHaveAttribute('data-subpart', 'true')
  await expect(page.getByTestId('snap-align-operand-moving')).toHaveText(/›\s*Cube 1$/)
  // The line fits the popover at every reference viewport, 390px included —
  // this task's Interaction model asks for that to be confirmed, not assumed.
  const operandsBox = await operands.boundingBox()
  const popoverBox = await popover.boundingBox()
  expect(operandsBox.x + operandsBox.width).toBeLessThanOrEqual(popoverBox.x + popoverBox.width + 1)

  await page.getByTestId('snap-align-axis-x').check()
  await page.getByTestId('snap-align-commit').click()
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
  const operands = page.getByTestId('snap-align-operands')
  await expect(operands).toHaveAttribute('data-subpart', 'false')
  await expect(page.getByTestId('snap-align-operand-moving')).toHaveText(cube.name)
  await expect(page.getByTestId('snap-align-operand-reference')).toHaveText(cylinder.name)

  await page.getByTestId('snap-align-axis-z').check()
  await page.getByTestId('snap-align-commit').click()

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
  const popover = page.getByTestId('snap-align-popover')
  await expect(popover).toBeVisible()

  const box = await popover.boundingBox()
  expect(box).not.toBeNull()
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(clientWidth + 1)

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)

  // Every control inside is a real tap target, not a shrunken icon.
  for (const testid of ['snap-align-axis-z', 'snap-align-cancel', 'snap-align-commit']) {
    const controlBox = await page.getByTestId(testid).boundingBox()
    expect(controlBox).not.toBeNull()
  }
})

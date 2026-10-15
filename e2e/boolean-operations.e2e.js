// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Boolean operations and their selection-count gate (`TODO/ui-014`), driven
 * against `/` — the running app, not a Storybook iframe.
 *
 * **All three reference viewports, Chromium only.** The viewport axis is real:
 * the toolbar's placement at phone width is a stated requirement of the task, so
 * "same as desktop" would be a claim nobody checked, and each viewport captures a
 * snapshot. The engine axis deliberately is not: nothing here introduces a new
 * WebGL, WASM, canvas, touch or persistence surface beyond what
 * `viewport-scaffold.e2e.js` already covers nine ways for the viewport itself.
 * What is new is DOM and state logic — button enablement, selection *order*, and
 * whether the document retires the operands — and that does not diverge by
 * rendering engine. (`CLAUDE.md` Browser Support: a spec with no such involvement
 * "can stay Chromium-only across viewports".)
 *
 * The load-bearing test in this file is the last one. Everything above it proves
 * the count gate, which a scripted spec is good at; the ordering test proves the
 * *base* is the solid picked first, by running the same two solids through
 * Subtract in both orders and asserting the results differ. A boolean that
 * quietly ignored operand order would pass every other assertion here.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'boolean-snapshots')

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

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'DOM/state logic, no new WebGL/canvas/touch surface — see this file’s header and TODO/ui-014',
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
 * Drag a Library row into the viewport and release inside it. Real
 * `PointerEvent`s, matching every other spec in this folder, so one helper
 * drives every project regardless of touch emulation.
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
 * @returns {Promise<{ id: string, op: string, name: string, center: string, bounds: string, volume: number, role: string }[]>}
 */
async function sceneBodies(page) {
  // A composite's volume is a kernel union, measured in the evaluation worker since
  // `TODO/core-029`: `data-body-volume` is absent until it lands, so wait for it.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="scene-bodies"] li')].every((node) => node.hasAttribute('data-body-volume')),
  )
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: node.getAttribute('data-body-center') ?? '',
      // `TODO/ui-040` reads these two: a sub-part-addressed boolean's whole
      // claim is that the *result's extent* follows the named part rather than
      // the whole composite, which the centre alone cannot settle.
      bounds: node.getAttribute('data-body-bounds') ?? '',
      volume: Number(node.getAttribute('data-body-volume') ?? '0'),
      role: node.getAttribute('data-selection-role') ?? '',
    })),
  )
}

/**
 * The proven drop-and-click positions this folder's other specs already use at
 * every reference viewport: far enough apart that neither snaps onto the other,
 * and both reliably clickable. A body renders slightly *above* the point it was
 * dropped at (the drop lands on the ground plane and the solid extends upward),
 * which is why each pair's click fraction is a little higher than its drop.
 */
const CUBE_A = { drop: { fx: 0.28, fy: 0.42 }, click: { fx: 0.28, fy: 0.38 } }
const CUBE_B = { drop: { fx: 0.72, fy: 0.3 }, click: { fx: 0.72, fy: 0.26 } }

/**
 * Place the two cubes this file's gating tests operate on, and clear the panel
 * that would otherwise cover the lower viewport at phone width.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeTwoCubes(page) {
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_A.drop })
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', ...CUBE_B.drop })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  return sceneBodies(page)
}

/**
 * Select both cubes, in the given order, with a plain click then a Shift-click.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'a-first' | 'b-first'} order
 */
async function selectBothCubes(page, order) {
  const [first, second] = order === 'a-first' ? [CUBE_A, CUBE_B] : [CUBE_B, CUBE_A]
  await clickViewportAt(page, first.click.fx, first.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await clickViewportAt(page, second.click.fx, second.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
}

const OPERATIONS = ['union', 'subtract', 'intersect']

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

test('the root view mounts the Operations toolbar, disabled, with nothing selected', async ({
  page,
}, testInfo) => {
  // Reachability, per CLAUDE.md: a control that is not in the app's real render
  // tree is not shipped, whatever its own component tests say.
  const toolbar = page.getByTestId('operations-toolbar')
  await expect(toolbar).toBeVisible()
  await expect(toolbar).toHaveAttribute('data-enabled', 'false')

  for (const name of OPERATIONS) {
    const button = page.getByTestId(`operation-${name}`)
    await expect(button).toBeVisible()
    await expect(button).toBeDisabled()
  }

  // The count is legible *before* the precondition is met — that is the whole
  // point of showing a disabled control rather than hiding it.
  await expect(page.getByTestId('operations-count')).toContainText('0 selected')
  await expect(page.getByTestId('operation-subtract')).toHaveAttribute(
    'title',
    'Select 2 or more solids',
  )

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `disabled-${testInfo.project.name}.png`) })
})

test('one selected solid is still not enough, and two enables all three operations', async ({
  page,
}, testInfo) => {
  const [cubeA, cubeB] = await placeTwoCubes(page)

  // A drop selects what it placed, so the scene already sits at one selected —
  // and one is not two. This is the count gate, not a presence gate.
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-enabled', 'false')
  await expect(page.getByTestId('operations-count')).toContainText('1 selected')
  for (const name of OPERATIONS) await expect(page.getByTestId(`operation-${name}`)).toBeDisabled()

  await clickViewportAt(page, CUBE_B.click.fx, CUBE_B.click.fy, { shift: true })

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')
  await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-enabled', 'true')
  await expect(page.getByTestId('operations-count')).toContainText('2 selected')
  for (const name of OPERATIONS) await expect(page.getByTestId(`operation-${name}`)).toBeEnabled()

  // ACCEPTANCE.md scenario 4, step 4: the base/subtrahend order reads off the
  // scene before Subtract is pressed. The first-picked solid keeps the ordinary
  // selection highlight; the second gets its own, so the two are told apart by
  // colour and not only by memory of the click order.
  const bodies = await sceneBodies(page)
  const roleOf = (/** @type {string} */ id) =>
    bodies.find((body) => body.id === id)?.role ?? '(missing)'
  expect(roleOf(cubeA.id)).toBe('base')
  expect(roleOf(cubeB.id)).toBe('secondary')

  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `enabled-${testInfo.project.name}.png`) })
})

test('the base/subtrahend roles follow the click order, not the document order', async ({
  page,
}) => {
  // The same two solids, picked the other way round. If the roles were read off
  // creation order rather than selection order, this would be identical to the
  // test above and the ordering claim would be worthless.
  const [cubeA, cubeB] = await placeTwoCubes(page)
  await selectBothCubes(page, 'b-first')

  const bodies = await sceneBodies(page)
  const roleOf = (/** @type {string} */ id) =>
    bodies.find((body) => body.id === id)?.role ?? '(missing)'
  expect(roleOf(cubeB.id)).toBe('base')
  expect(roleOf(cubeA.id)).toBe('secondary')
})

for (const name of OPERATIONS) {
  test(`${name} turns the two selected solids into one, and re-disables the toolbar`, async ({
    page,
  }) => {
    await placeTwoCubes(page)
    await selectBothCubes(page, 'a-first')

    await page.getByTestId(`operation-${name}`).click()

    const viewport = page.getByTestId('viewport')
    // The operands stop being independently selectable bodies: two in, one out.
    // Not three (the operands left behind alongside the result) and not zero.
    await expect(viewport).toHaveAttribute('data-body-count', '1')

    // The result is selected, so the ordinary selection → inspector → gizmo
    // contract picks it up with no special case...
    await expect(viewport).toHaveAttribute('data-selected-count', '1')
    const [result] = await sceneBodies(page)
    await expect(viewport).toHaveAttribute('data-selected-id', result.id)
    expect(result.op).toBe(`boolean.${name}`)
    await expect(page.getByTestId('transform-gizmo')).toHaveCount(1)

    // ...and exactly one solid selected means the precondition is no longer met,
    // so the toolbar dims again rather than inviting a second press that cannot
    // work.
    await expect(page.getByTestId('operations-toolbar')).toHaveAttribute('data-enabled', 'false')
    for (const other of OPERATIONS) {
      await expect(page.getByTestId(`operation-${other}`)).toBeDisabled()
    }
  })
}

test('Subtract cuts the later-selected solid out of the first — reversing the order reverses the result', async ({
  page,
}) => {
  // The claim no count-based assertion can make: *order* drove the operation,
  // not just membership. Two solids far enough apart not to overlap make this
  // sharpest — A minus B is A where it stands, B minus A is B where it stands —
  // so the two results land in visibly different places rather than differing by
  // some fraction of a shared volume.
  const [cubeA, cubeB] = await placeTwoCubes(page)
  await selectBothCubes(page, 'a-first')
  await page.getByTestId('operation-subtract').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const [aMinusB] = await sceneBodies(page)

  // Back to the same two solids in the same two places. This used to reload for a
  // fresh document ("nothing is persisted"); since `io-001` a reload restores the last
  // session on purpose, so the way back is Undo — which also proves the subtract came
  // back out cleanly, the precondition of the comparison below meaning anything.
  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const [freshA, freshB] = await sceneBodies(page)
  expect(freshA.center).toBe(cubeA.center)
  expect(freshB.center).toBe(cubeB.center)

  await selectBothCubes(page, 'b-first')
  await page.getByTestId('operation-subtract').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const [bMinusA] = await sceneBodies(page)

  expect(aMinusB.center).not.toBe(bMinusA.center)
  // And each result sits where its own base was, which says *which* way round
  // rather than only that the two differ.
  expect(aMinusB.center).toBe(cubeA.center)
  expect(bMinusA.center).toBe(cubeB.center)
})

test('Intersect of two genuinely overlapping solids leaves a real solid, not an empty one', async ({
  page,
}) => {
  // Every other test in this file uses two solids that do not overlap, which is
  // fine for Union and Subtract and useless for Intersect: an empty result would
  // still report one body, still select it, and still dim the toolbar, so every
  // assertion above would pass over a body with no geometry at all. This is the
  // one case that catches that, and it is why the pair here is deliberately
  // dropped close enough to snap together (the positions `snap-placement.e2e.js`
  // already proves engage the snap at every reference viewport).
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.44, fy: 0.32 })
  await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.46, fy: 0.33 })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  // Both solids are stacked on the same spot, so a click cannot reliably pick
  // one and then the other — the marquee (`ui-024`) is the gesture that selects
  // an overlapping pair, and it is reachable by touch at every width.
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
    fire('pointerdown', 0.1, 0.08)
    for (const t of [0.33, 0.66, 1]) fire('pointermove', 0.1 + 0.75 * t, 0.08 + 0.52 * t)
    fire('pointerup', 0.85, 0.6)
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

  await page.getByTestId('operation-intersect').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  // The result is selected, so the dimension lines are measuring it — and an
  // empty intersection would measure zero on every axis.
  await expect(page.getByTestId('dimension-lines')).toHaveAttribute('data-axis-count', '3')
  const lengths = await page.$$eval('[data-testid^="dimension-"][data-length-mm]', (nodes) =>
    nodes.map((node) => Number(node.getAttribute('data-length-mm'))),
  )
  expect(lengths).toHaveLength(3)
  for (const length of lengths) expect(length).toBeGreaterThan(1)
  // Nor is it simply one of the operands passed through: the shared volume of a
  // 40 mm cube and a ⌀40 × 50 cylinder is shorter than the cylinder is tall.
  expect(Math.max(...lengths)).toBeLessThan(50)
})

test('the toolbar stays clear of the page edges and the panels at every width', async ({ page }) => {
  // The toolbar's whole job is to be visible while the user is mid-selection, so
  // it must not be the thing that pushes the page sideways or hide behind the
  // bottom sheets the phone layout puts over the viewport.
  await placeTwoCubes(page)
  await selectBothCubes(page, 'a-first')

  const toolbar = await page.getByTestId('operations-toolbar').boundingBox()
  const viewport = await page.getByTestId('viewport').boundingBox()
  expect(toolbar).not.toBeNull()
  expect(toolbar.x).toBeGreaterThanOrEqual(viewport.x - 1)
  expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(viewport.x + viewport.width + 1)
  expect(toolbar.y).toBeGreaterThanOrEqual(viewport.y - 1)

  // Every button is a real tap target, not an icon shrunk to fit.
  for (const name of OPERATIONS) {
    const box = await page.getByTestId(`operation-${name}`).boundingBox()
    expect(box.height, `${name} tap height`).toBeGreaterThanOrEqual(36)
  }

  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }))
  expect(overflow.x).toBeLessThanOrEqual(1)
  expect(overflow.y).toBeLessThanOrEqual(1)
})

// --- Sub-part-addressed operands (TODO/ui-040) -------------------------------

/**
 * `"minX,minY,minZ,maxX,maxY,maxZ"` as rendered by `data-body-bounds`, parsed.
 *
 * @param {string} bounds
 * @returns {number[]}
 */
function parseBounds(bounds) {
  return bounds.split(',').map(Number)
}

/**
 * The largest per-component gap between two bounding boxes — how far apart two
 * candidate answers are, measured without assuming *which* axis separates them.
 * Deliberately not an X-only comparison: the drop fractions these fixtures use
 * are screen-space, and the camera's projection differs per reference viewport,
 * so which world axis two on-screen-separated bodies end up separated along is
 * not the same at 390px as at 1440px (found by running this file at all three,
 * not reasoned about up front).
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function maxBoundsGap(a, b) {
  return Math.max(...a.map((value, index) => Math.abs(value - b[index])))
}

/**
 * The axis-aligned bounding box of two bodies taken together — what a Union of
 * them has to span. Plain min/max arithmetic is exact here because every body
 * in this fixture is an axis-aligned cuboid, so this is the real expected
 * answer rather than an approximation of one.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function mergeBounds(a, b) {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.max(a[3], b[3]),
    Math.max(a[4], b[4]),
    Math.max(a[5], b[5]),
  ]
}

/**
 * Two cubes combined into one Group, plus a third cube placed afterwards — the
 * same fixture shape `snap-align-operation.e2e.js` uses for `TODO/ui-035`,
 * reused rather than re-invented, because it is the one already proven to place
 * and click reliably at all three reference viewports. The two members sit far
 * apart on screen, which is what makes "did the boolean use the member or the
 * whole group?" a question this file's bounds arithmetic can answer.
 *
 * Returns each member's own bounds as measured **before** the Group —
 * `group.assemble` moves nothing, so they are still each part's own bounds
 * afterwards.
 *
 * @param {import('@playwright/test').Page} page
 */
async function placeGroupAndThirdCube(page) {
  const [memberA, memberB] = await placeTwoCubes(page)
  await selectBothCubes(page, 'a-first')
  await page.getByTestId('operation-group').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const groupId = (await page.getByTestId('viewport').getAttribute('data-selected-id')) ?? ''

  // Placed after the Group so it cannot be swept into it. Same third-body
  // position ui-035's own fixture already proves is separately clickable at
  // every reference viewport, and comfortably above the ~0.45 fy band where a
  // 390px-wide drop starts missing the grid entirely.
  await openLibrary(page)
  await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.5, fy: 0.36 })
  await closeLibrary(page)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')

  const bodies = await sceneBodies(page)
  const group = bodies.find((candidate) => candidate.id === groupId)
  const third = bodies.find((candidate) => candidate.id !== groupId)
  return { memberA, memberB, group, third }
}

/** Where the third cube renders, for clicking it. */
const THIRD_CUBE_CLICK = { fx: 0.5, fy: 0.32 }

/**
 * Deselect, click the group once (whole), click the same member again (drill
 * in) — `ui-016`'s pick depth, driven the way a user reaches it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ id: string }} group
 * @param {string} partName
 */
async function drillIntoMemberA(page, group, partName) {
  await clickViewportAt(page, 0.04, 0.06)
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', group.id)
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy)
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText(partName)
}

test('Subtract addresses a drilled-in sub-part: the result is that member, not the whole group (TODO/ui-040)', async ({
  page,
}) => {
  const { memberA, memberB, group, third } = await placeGroupAndThirdCube(page)

  const memberBounds = parseBounds(memberA.bounds)
  const groupBounds = parseBounds(group.bounds)
  // The fixture guard: the two candidate answers have to be far enough apart
  // that the assertion below is really telling them apart rather than passing
  // on a coincidence. These are whole cube-widths apart at every viewport.
  expect(
    maxBoundsGap(groupBounds, memberBounds),
    'the member’s own extent and the group’s differ enough to tell the two answers apart',
  ).toBeGreaterThan(10)

  await drillIntoMemberA(page, group, memberA.name)
  await clickViewportAt(page, THIRD_CUBE_CLICK.fx, THIRD_CUBE_CLICK.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

  // The feedback half of this task: which depth is armed has to be readable
  // *before* the click, because a sub-part boolean and a whole-body one can
  // look identical until the geometry changes. Two channels, because the
  // visible line does not fit at phone width — see the component's own phone
  // media-query comment for that measurement. The long-press title carries it
  // at every width; the line itself is shown above 640px.
  await expect(page.getByTestId('operation-subtract')).toHaveAttribute(
    'title',
    new RegExp(`›\\s*${memberA.name}.*Group uses the whole body`),
  )

  const operands = page.getByTestId('operation-operands')
  const width = page.viewportSize().width
  if (width <= 640) {
    await expect(operands).toBeHidden()
  } else {
    await expect(operands).toBeVisible()
    await expect(operands).toHaveAttribute('data-subpart', 'true')
    await expect(page.getByTestId('operation-operand-base')).toHaveText(
      new RegExp(`›\\s*${memberA.name}$`),
    )
    await expect(page.getByTestId('operation-operand-rest')).toHaveText(third.name)
    // The note that says the depth applies to the booleans and not to Group.
    await expect(page.getByTestId('operation-operands-note')).toBeVisible()
    // It fits the toolbar rather than spilling out of it.
    const operandsBox = await operands.boundingBox()
    const toolbarBox = await page.getByTestId('operations-toolbar').boundingBox()
    expect(operandsBox.x + operandsBox.width).toBeLessThanOrEqual(
      toolbarBox.x + toolbarBox.width + 1,
    )
  }

  // And nothing this task added pushes a button of this toolbar under the
  // navigation chrome. A trial click is the assertion rather than rectangle
  // arithmetic, because "receives pointer events" is the property that actually
  // broke: the first pass of this task put the operand line *above* the
  // buttons, and its wrapped lines at 390px moved Align underneath the chrome's
  // Pan button — still visible, still the right size, and no longer clickable.
  // The two containers' bounding boxes have always touched by ~1px at phone
  // width, so rectangle arithmetic here would fail on a condition that predates
  // this task and say nothing about the one that does not.
  for (const name of [...OPERATIONS, 'group', 'align']) {
    await page.getByTestId(`operation-${name}`).click({ trial: true, timeout: 3000 })
  }

  await page.getByTestId('operation-subtract').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('operation-error')).toHaveCount(0)

  const [result] = await sceneBodies(page)
  const actual = parseBounds(result.bounds)
  // The base was `{ id, pieces: "<member A>" }`, and the third cube does not
  // overlap it, so the result is that member alone — never the whole group,
  // whose far member is still 10+ mm beyond this extent.
  for (let index = 0; index < 6; index += 1) {
    expect(actual[index], `bounds[${index}] follows the addressed member`).toBeCloseTo(
      memberBounds[index],
      1,
    )
  }
  // Stated as its own assertion rather than left implicit in the loop: the
  // whole-group answer is excluded, which is the claim that fails if `pieces`
  // were silently dropped on the way to the kernel.
  expect(maxBoundsGap(actual, groupBounds)).toBeGreaterThan(10)
  expect(memberB.name).not.toBe(memberA.name)
})

test('a drilled-in body picked *second* addresses its part too — the base-first order Subtract needs (TODO/ui-040)', async ({
  page,
}) => {
  const { memberA, group, third } = await placeGroupAndThirdCube(page)
  const memberBounds = parseBounds(memberA.bounds)
  const groupBounds = parseBounds(group.bounds)
  const thirdBounds = parseBounds(third.bounds)

  await drillIntoMemberA(page, group, memberA.name)
  // The documented route to "base first, drilled-in body second": Shift-click
  // the drilled body out of the selection and back in, which lands it at the
  // end with its depth intact (`toggle` is the one selection path that
  // deliberately does not prune a pick depth).
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
  await clickViewportAt(page, THIRD_CUBE_CLICK.fx, THIRD_CUBE_CLICK.fy, { shift: true })
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

  // The order is now third-cube-first, so *it* is the base and the drilled body
  // is the operand — the arrangement scenario 5 asks for. Read from the title,
  // which carries the same summary at every width, phone included.
  await expect(page.getByTestId('operation-union')).toHaveAttribute(
    'title',
    new RegExp(`${third.name} then .*›\\s*${memberA.name}`),
  )

  // Union rather than Subtract here, deliberately: these two solids do not
  // overlap, so a Subtract could not distinguish the two candidate answers at
  // all (the base comes back unchanged either way) while a Union's extent
  // follows exactly whichever operand was really used.
  await page.getByTestId('operation-union').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')

  const [result] = await sceneBodies(page)
  const actual = parseBounds(result.bounds)
  const expected = mergeBounds(thirdBounds, memberBounds)
  const wholeGroupAnswer = mergeBounds(thirdBounds, groupBounds)
  expect(maxBoundsGap(wholeGroupAnswer, expected)).toBeGreaterThan(10)
  for (let index = 0; index < 6; index += 1) {
    expect(actual[index], `bounds[${index}]`).toBeCloseTo(expected[index], 1)
  }
})

test('with nothing drilled in, a boolean still spans the whole group — ui-014’s own result, unchanged (TODO/ui-040 regression guard)', async ({
  page,
}) => {
  const { group, third } = await placeGroupAndThirdCube(page)
  const groupBounds = parseBounds(group.bounds)
  const thirdBounds = parseBounds(third.bounds)

  await clickViewportAt(page, 0.04, 0.06)
  await clickViewportAt(page, THIRD_CUBE_CLICK.fx, THIRD_CUBE_CLICK.fy)
  await clickViewportAt(page, CUBE_A.click.fx, CUBE_A.click.fy, { shift: true })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '2')

  // No depth anywhere in the selection, so both channels name two plain bodies
  // and neither carries a part marker.
  const title = (await page.getByTestId('operation-union').getAttribute('title')) ?? ''
  expect(title).toContain(`then ${group.name}`)
  expect(title).not.toContain('›')
  if (page.viewportSize().width > 640) {
    await expect(page.getByTestId('operation-operands')).toHaveAttribute('data-subpart', 'false')
    await expect(page.getByTestId('operation-operand-rest')).toHaveText(group.name)
    await expect(page.getByTestId('operation-operands-note')).toHaveCount(0)
  }

  await page.getByTestId('operation-union').click()
  const [result] = await sceneBodies(page)
  const actual = parseBounds(result.bounds)
  const expected = mergeBounds(thirdBounds, groupBounds)
  for (let index = 0; index < 6; index += 1) {
    expect(actual[index], `bounds[${index}]`).toBeCloseTo(expected[index], 1)
  }
})

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
 * @returns {Promise<{ id: string, op: string, name: string, center: string, role: string }[]>}
 */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      op: node.getAttribute('data-body-op') ?? '',
      name: node.getAttribute('data-body-name') ?? '',
      center: node.getAttribute('data-body-center') ?? '',
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

  // A fresh scene: nothing here is persisted, so a reload is an empty document.
  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '0')
  const [freshA, freshB] = await placeTwoCubes(page)
  // The same two solids, in the same two places, as a precondition of the
  // comparison below meaning anything.
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

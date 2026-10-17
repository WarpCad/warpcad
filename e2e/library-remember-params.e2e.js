// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * The Library remembers each part's last-used params, and the next drag uses them
 * (`TODO/ui-068`), driven against `/` with real pointer drags.
 *
 * The user's own words: *"if I drag a screw in, then change the size to a m2.5 socket head,
 * the next screw dragged in should be a m2.5 socket head."* Steps 1-3 (remember, survive a
 * reload, Reset) run on **all three engines and viewports**: the reload step is a
 * `localStorage` persistence path, and the row gains a summary line and a 44 px Reset button at
 * phone width. Steps 4-5 (a Pi's Model; an AI-origin edit) are Chromium-only.
 *
 * The checks that matter are the second screw's Inspector, the row's own dropdowns, and that the
 * first screw is still there (*adding one must not overwrite the other*, the second attempt's
 * own failure).
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'library-remember-params-snapshots')
const BOLT = 'hardware.bolt'

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (!(await rows.isVisible())) {
    await page.getByTestId('library-tab').click()
    await expect(rows).toBeVisible()
  }
  await page.getByTestId('library-rows-hardware').scrollIntoViewIfNeeded()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/** @param {import('@playwright/test').Page} page */
async function showInspector(page) {
  await closeLibrary(page)
  if (!(await page.getByTestId('inspector-sheet').isVisible())) {
    await page.getByTestId('inspector-tab').click()
  }
  await expect(page.getByTestId('inspector-sheet')).toBeVisible()
}

/**
 * Drag a Library row into the viewport with pointer events, mouse and touch alike.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ op: string, fx: number, fy: number }} drop
 */
async function dragRowIntoViewport(page, { op, fx, fy }) {
  await openLibrary(page)
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
      const fire = (/** @type {EventTarget} */ target, /** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 41,
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
  await page.waitForTimeout(300)
}

/** @param {import('@playwright/test').Page} page @param {number} count */
const expectBodyCount = (page, count) => expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))

/** @param {import('@playwright/test').Page} page */
function sceneBodies(page) {
  return page.$$eval('[data-testid="scene-bodies"] li', (nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-body-id') ?? '',
      volume: Number(node.getAttribute('data-body-volume') ?? 'NaN'),
    })),
  )
}

/** @param {import('@playwright/test').Page} page */
function bomRows(page) {
  return page.$$eval('[data-testid="bom-row"]', (nodes) =>
    nodes.map((node) => (/** @type {HTMLElement} */ (node).innerText ?? '').replace(/\s+/g, ' ').trim()),
  )
}

/**
 * Drag a Bolt / screw in and turn it into an M2.5 socket cap, 8 mm, in the Inspector.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ fx: number, fy: number }} at
 */
async function placeM25Socket(page, at) {
  await dragRowIntoViewport(page, { op: BOLT, ...at })
  await showInspector(page)
  const type = page.getByTestId('inspector-param-type')
  await expect(type).toBeVisible()
  await type.selectOption('socket')
  await page.getByTestId('inspector-param-spec').selectOption('m2.5')
  const length = page.getByTestId('inspector-param-length')
  await length.fill('8')
  await length.press('Enter')
  await expect(length).toHaveValue(/^8/)
  await expect(page.getByTestId('repair-dialog')).toHaveCount(0)
}

/** @param {import('@playwright/test').Page} page */
async function expectBoltRowRemembers(page) {
  await openLibrary(page)
  await expect(page.getByTestId(`library-choice-${BOLT}`)).toHaveValue('socket')
  await expect(page.getByTestId(`library-choice-${BOLT}-spec`)).toHaveValue('m2.5')
  await expect(page.getByTestId(`library-remembered-${BOLT}`)).toContainText('× 8 mm')
  await expect(page.getByTestId(`library-reset-${BOLT}`)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
})

test('drag a screw in, make it an M2.5 socket cap 8 mm, drag again: the second one is the same, the first stays', async ({
  page,
}, testInfo) => {
  await placeM25Socket(page, { fx: 0.3, fy: 0.15 })
  await expectBodyCount(page, 1)
  await expectBoltRowRemembers(page)

  // The ghost previews the remembered part: the drag shows it before the drop. Dropping commits it.
  await dragRowIntoViewport(page, { op: BOLT, fx: 0.7, fy: 0.25 })
  await expectBodyCount(page, 2)

  await showInspector(page)
  await expect(page.getByTestId('inspector-param-type')).toHaveValue('socket')
  await expect(page.getByTestId('inspector-param-spec')).toHaveValue('m2.5')
  await expect(page.getByTestId('inspector-param-length')).toHaveValue(/^8/)

  // Two bodies, same part: neither overwrote the other.
  const bodies = await sceneBodies(page)
  expect(bodies).toHaveLength(2)
  expect(bodies[0].id).not.toBe(bodies[1].id)
  expect(bodies[1].volume).toBeCloseTo(bodies[0].volume, 3)
  await expect.poll(() => bomRows(page).then((rows) => rows.join('|'))).toMatch(/M2\.5 socket × 8 mm × 2/)

  await openLibrary(page)
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page
    .getByTestId(`library-row-${BOLT}`)
    .locator('xpath=ancestor::li[1]')
    .screenshot({ path: join(SNAPSHOT_DIR, `bolt-row-${testInfo.project.name}.png`) })
  if (testInfo.project.name.endsWith('phone')) {
    const box = await page.getByTestId(`library-reset-${BOLT}`).boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(43)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43)
  }
})

test('the memory survives a reload', async ({ page }) => {
  await placeM25Socket(page, { fx: 0.4, fy: 0.2 })
  await expectBodyCount(page, 1)

  await page.reload()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
  await expectBoltRowRemembers(page)
  // The project itself may be restored too (autosave); drag relative to whatever came back.
  await page.waitForTimeout(1000)
  const before = Number(await page.getByTestId('viewport').getAttribute('data-body-count'))
  await dragRowIntoViewport(page, { op: BOLT, fx: 0.5, fy: 0.25 })
  await expectBodyCount(page, before + 1)
  await showInspector(page)
  await expect(page.getByTestId('inspector-param-type')).toHaveValue('socket')
  await expect(page.getByTestId('inspector-param-spec')).toHaveValue('m2.5')
  await expect(page.getByTestId('inspector-param-length')).toHaveValue(/^8/)
})

test('Reset puts the row back to Hex M10 x 20 and the summary and button go away', async ({ page }) => {
  await placeM25Socket(page, { fx: 0.4, fy: 0.2 })
  await expectBoltRowRemembers(page)

  await page.getByTestId(`library-reset-${BOLT}`).click()
  await expect(page.getByTestId(`library-reset-${BOLT}`)).toHaveCount(0)
  await expect(page.getByTestId(`library-remembered-${BOLT}`)).toHaveCount(0)
  await expect(page.getByTestId(`library-choice-${BOLT}`)).toHaveValue('hex')
  await expect(page.getByTestId(`library-choice-${BOLT}-spec`)).toHaveValue('m10')

  await dragRowIntoViewport(page, { op: BOLT, fx: 0.7, fy: 0.25 })
  await expectBodyCount(page, 2)
  await showInspector(page)
  await expect(page.getByTestId('inspector-param-type')).toHaveValue('hex')
  await expect(page.getByTestId('inspector-param-spec')).toHaveValue('m10')
  await expect(page.getByTestId('inspector-param-length')).toHaveValue(/^20/)
})

test.describe('Chromium only', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('chromium'), 'a Pi model and the scripted AI path add no engine-specific surface')
  })

  test("changing a placed Pi's Model in the Inspector moves the Library row's Model dropdown", async ({ page }) => {
    await dragRowIntoViewport(page, { op: 'raspberrypi.bplus', fx: 0.5, fy: 0.25 })
    await expectBodyCount(page, 1)
    await showInspector(page)
    await page.getByTestId('inspector-param-model').selectOption('5')
    await expect(page.getByTestId('inspector-param-model')).toHaveValue('5')
    await openLibrary(page)
    await expect(page.getByTestId('library-choice-raspberrypi.bplus')).toHaveValue('5')
    // The board has nothing else to say, so the row shows no summary line.
    await expect(page.getByTestId('library-remembered-raspberrypi.bplus')).toHaveCount(0)
  })

  test('an AI-origin screw does not change what the next drag drops', async ({ page }) => {
    test.skip(process.env.E2E_PREVIEW === '1', 'scripted mode is dev-only')
    const script = JSON.parse(readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'ai', 'library-memory.json'), 'utf8'))
    await page.addInitScript((value) => {
      /** @type {any} */ (window).__WARPCAD_SCRIPTED__ = value
    }, script)
    await page.context().route('https://api.anthropic.com/**', (route) => {
      throw new Error(`the scripted provider must not reach the network: ${route.request().url()}`)
    })
    await page.goto('/')
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')

    await page.getByTestId('assistant-button').click()
    await page.getByTestId('ai-input').fill('add a screw')
    await page.getByTestId('ai-send').click()
    await expect(page.getByTestId('assistant-panel')).toHaveAttribute('data-running', 'false', { timeout: 30_000 })
    await expectBodyCount(page, 1)
    // The chat overlays the viewport (and the Library tab) at phone width: put it away first.
    await page.getByTestId('assistant-close').click()
    await expect(page.getByTestId('assistant-panel')).toBeHidden()

    await openLibrary(page)
    await expect(page.getByTestId(`library-choice-${BOLT}`)).toHaveValue('hex')
    await expect(page.getByTestId(`library-choice-${BOLT}-spec`)).toHaveValue('m10')
    await expect(page.getByTestId(`library-remembered-${BOLT}`)).toHaveCount(0)
    await expect(page.getByTestId(`library-reset-${BOLT}`)).toHaveCount(0)
  })
})

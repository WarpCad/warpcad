// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { withRowSettings } from './support/libraryRow.js'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/ui-069`: **⟳ Repeat** — place a part once against one target, then apply the same steps
 * to every matching target — driven against `/` with real pointer input.
 *
 * The user's own request, verbatim: a Pi 5 seated on a Touchscreen 2's posts (`ui-063`'s flow),
 * drill into the Pi's `hole1`, press **⟳ Repeat**, check `hole1`-`hole4` are ticked, drag a
 * Bolt in (M2.5 socket cap), turn it head-up, Align X/Y to `hole1`, Snap it Inside on Z against
 * `mb` with Offset -5 (tip 5 mm into the post), press **Apply to 3 more**, and read all four
 * bolts back through the Inspector. Then: Undo and Redo through the toast and the History
 * buttons, change Bolt 1's Length and check every repeat follows, Go to Bolt 1, Remove one
 * repeat, Detach the rest, delete the source (the confirm), Cancel and Escape, and the project
 * surviving a reload.
 *
 * Every selection is a gesture on the Objects list (a hole cannot be clicked in the 3D view:
 * `ui-016`'s occlusion limit); the store is never read. Viewports: all three (the panel is a
 * bottom sheet that shrinks to a bar at phone width). Engines: all three (Library drag,
 * Objects-list ticking and the kernel round trip are engine-sensitive). Firefox may fail at
 * launch in this sandbox (`TROUBLESHOOTING.md`, 2026-09-17).
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'repeat-placement-snapshots')
const TOL_MM = 0.02

/** @type {string[]} */
let pageErrors = []

test.beforeEach(async ({ page }) => {
  pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

async function openLibrary(page) {
  if (!(await page.getByTestId('library-rows').isVisible())) await page.getByTestId('library-tab').click()
  await expect(page.getByTestId('library-rows')).toBeVisible()
}

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
      const fire = (target, type, x, y) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 69, pointerType: 'mouse', isPrimary: true, button: 0,
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

async function bodyIdOf(page, op) {
  const item = page.locator(`[data-testid="scene-bodies"] li[data-body-op="${op}"]`)
  await expect(item).toHaveAttribute('data-body-volume', /.+/, { timeout: 30_000 })
  return await item.getAttribute('data-body-id')
}

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

async function expandParts(page, bodyId) {
  await openObjectList(page)
  const toggle = page.getByTestId(`objects-expand-${bodyId}`)
  await toggle.scrollIntoViewIfNeeded()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
}

async function tapPart(page, bodyId, partName) {
  await expandParts(page, bodyId)
  const row = page.getByTestId(`objects-part-${bodyId}-${partName}`)
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(page.getByTestId('inspector-breadcrumb-part')).toHaveText(partName)
}

async function checkPart(page, bodyId, partName) {
  await expandParts(page, bodyId)
  const check = page.getByTestId(`objects-part-check-${bodyId}-${partName}`)
  await check.scrollIntoViewIfNeeded()
  await check.click()
  await expect(check).toHaveAttribute('aria-checked', 'true')
}

/** Tap a body's own row in the Objects list: that body, whole. */
async function tapBody(page, bodyId) {
  await openObjectList(page)
  const row = page.getByTestId(`objects-row-${bodyId}`)
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', bodyId)
}

const num = async (page, testId) => Number((await page.getByTestId(testId).inputValue()).replace(/[^\d.+-]/g, ''))

async function inspectPart(page, bodyId, partName) {
  await tapPart(page, bodyId, partName)
  const centre = []
  const size = []
  for (const axis of ['x', 'y', 'z']) {
    centre.push(await num(page, `inspector-position-${axis}`))
    size.push(await num(page, `inspector-size-${axis}`))
  }
  return { centre, size }
}

async function commitPopover(page, movingId, axes, snap) {
  const item = page.locator(`[data-testid="scene-bodies"] li[data-body-id="${movingId}"]`)
  if (snap) {
    if (snap.offset !== undefined) await page.getByTestId('align-offset').fill(String(snap.offset))
  }
  for (const axis of axes) {
    const before = await item.getAttribute('data-body-bounds')
    await page.getByTestId(snap ? `align-${axis}-${snap.position}` : `align-${axis}-center`).click()
    await expect(page.getByTestId('align-error')).toHaveCount(0)
    await expect.poll(() => item.getAttribute('data-body-bounds'), { timeout: 15_000 }).not.toBe(before)
  }
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('align-popover')).toHaveCount(0)
}

/** Type a value into an Inspector field and commit with Enter. */
async function typeInto(page, testId, value) {
  const field = page.getByTestId(testId)
  await field.click()
  await field.fill(String(value))
  await field.press('Enter')
  await page.waitForTimeout(200)
}

/**
 * The Pi seated on the screen's posts (`ui-063`'s flow), before any Repeat: the setup the
 * user's request starts from.
 */
async function seatPiOnScreen(page) {
  await openLibrary(page)
  await page.getByTestId('library-rows-raspberrypi').scrollIntoViewIfNeeded()
  await withRowSettings(page, 'raspberrypi.bplus', () => page.getByTestId('library-choice-raspberrypi.bplus').selectOption('5'))
  await dragFromLibrary(page, 'raspberrypi.bplus', 0.3, 0.2)
  const pi = await bodyIdOf(page, 'raspberrypi.bplus')
  await withRowSettings(page, 'raspberrypi.screen', () =>
    page.getByTestId('library-choice-raspberrypi.screen').selectOption('touchScreen2'),
  )
  await dragFromLibrary(page, 'raspberrypi.screen', 0.7, 0.25)
  const screen = await bodyIdOf(page, 'raspberrypi.screen')
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  const library = page.getByTestId('library-rows')
  if ((await page.getByTestId('library-tab').isVisible()) && (await library.isVisible())) {
    await page.getByTestId('library-tab').click()
  }
  await tapPart(page, pi, 'hole1')
  await checkPart(page, screen, 'piMountingPost1')
  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('align-popover')).toHaveAttribute('data-target', 'second')
  await commitPopover(page, pi, ['x', 'y'])
  await tapPart(page, pi, 'mb')
  await checkPart(page, screen, 'piMountingPost1')
  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('align-popover')).toHaveAttribute('data-target', 'second')
  await commitPopover(page, pi, ['z'], { position: 'outside-plus' })
  return { pi, screen }
}


/** Whether a body of this op has been added/removed: the scene list, by op. */
const bodiesOf = (page, op) => page.locator(`[data-testid="scene-bodies"] li[data-body-op="${op}"]`)

/** @param {import('@playwright/test').Page} page @param {string} bodyId @returns {Promise<number[]>} */
async function bodyBox(page, bodyId) {
  const raw = await page.locator(`[data-testid="scene-bodies"] li[data-body-id="${bodyId}"]`).getAttribute('data-body-bounds')
  return (raw ?? '').split(',').map(Number)
}

/** Bounds and centre of a body as the kernel last measured them. */
async function bodyCentre(page, bodyId) {
  const raw = await page.locator(`[data-testid="scene-bodies"] li[data-body-id="${bodyId}"]`).getAttribute('data-body-center')
  return (raw ?? '').split(',').map(Number)
}

/** Close the Library sheet at phone width so the Inspector's sheet can be reached. */
async function closeLibraryIfSheet(page) {
  const library = page.getByTestId('library-rows')
  if ((await page.getByTestId('library-tab').isVisible()) && (await library.isVisible())) {
    await page.getByTestId('library-tab').click()
  }
}

/** Press Apply wherever it is: the panel's button, or the phone bar's. */
async function pressApply(page) {
  const apply = page.getByTestId('repeat-apply')
  if (await apply.isVisible()) await apply.click()
  else await page.getByTestId('repeat-bar-apply').click()
}

/**
 * The user's request, end to end, up to and including **Apply to 3 more**.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ beforeApply?: (ids: { pi: string, screen: string, bolt: string }) => Promise<void> }} [options]
 *   `beforeApply` runs once Bolt 1 is seated and before the panel is read (`TODO/core-063`: a
 *   step the user did not make lands on the first part).
 */
async function repeatOnFourHoles(page, { beforeApply } = {}) {
  const { pi, screen } = await seatPiOnScreen(page)

  // The gate: nothing drilled into, no Repeat. A hole drilled into, Repeat.
  const repeatButton = page.getByTestId('op-repeat')
  await expect(repeatButton).toBeVisible()
  await expect(repeatButton).toBeDisabled()
  await tapBody(page, pi)
  await expect(repeatButton).toBeDisabled()
  await expect(repeatButton).toHaveAttribute('title', /Drill into a part first/)
  await tapPart(page, pi, 'hole1')
  await expect(repeatButton).toBeEnabled()
  await repeatButton.click()

  const sheet = page.getByTestId('repeat-sheet')
  await expect(sheet).toBeVisible()
  await expect(page.getByTestId('repeat-headline')).toHaveText('Repeat on Raspberry Pi 1 › hole1 and 3 more')
  for (const hole of ['hole1', 'hole2', 'hole3', 'hole4']) {
    await expect(page.getByTestId(`repeat-target-${hole}`)).toBeChecked()
  }
  await expect(page.getByTestId('repeat-target-hole1')).toBeDisabled()
  await expect(page.getByTestId('repeat-target-mb')).not.toBeChecked()
  await expect(page.getByTestId('repeat-status')).toContainText('Now make one part on hole1')
  await expect(page.getByTestId('repeat-apply')).toBeDisabled()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-repeat-outlines', '3')

  // The Library says what it is for while the session is armed.
  await openLibrary(page)
  await expect(page.getByTestId('library-repeat-hint')).toContainText('Repeating on 4 targets')
  await expect(page.getByTestId('library-repeat-hint')).toContainText('hole1')

  // The first part, the normal way: an M2.5 socket bolt, 12 mm, head up.
  await dragFromLibrary(page, 'hardware.bolt', 0.5, 0.3)
  const bolt = await bodyIdOf(page, 'hardware.bolt')
  await closeLibraryIfSheet(page)
  await expect(page.getByTestId('repeat-status')).toContainText('Recording Bolt / screw 1')
  if ((await page.getByTestId('inspector-tab').isVisible()) && (await page.getByTestId('inspector').getAttribute('data-open')) !== 'true') {
    await page.getByTestId('inspector-tab').click()
  }
  await page.getByTestId('inspector-param-type').selectOption('socket')
  await page.getByTestId('inspector-param-spec').selectOption('m2.5')
  await typeInto(page, 'inspector-param-length', 12)
  await typeInto(page, 'inspector-rotation-x', 180)

  // Align X/Y: the bolt (first) onto the Pi's hole1 (second).
  await tapBody(page, bolt)
  await checkPart(page, pi, 'hole1')
  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('align-operand-target')).toHaveText('Raspberry Pi 1 › hole1')
  await commitPopover(page, bolt, ['x', 'y'])
  // Escape closed the popover, not the Repeat panel (`ui-060`'s Escape order).
  await expect(sheet).toBeVisible()

  // Snap Z: Inside, - face, Offset -5, against mb: the tip ends 5 mm below the board, in the post.
  await tapBody(page, bolt)
  await checkPart(page, pi, 'mb')
  await page.getByTestId('operation-align').click()
  await expect(page.getByTestId('align-operand-target')).toHaveText('Raspberry Pi 1 › mb')
  await commitPopover(page, bolt, ['z'], { position: 'inside-minus', offset: -5 })
  await expect(sheet).toBeVisible()

  await beforeApply?.({ pi, screen, bolt })

  // The panel lists what it recorded and which steps get re-aimed.
  await expandPanel(page)
  await expect(page.getByTestId('repeat-step').filter({ hasText: /Align/ })).toHaveCount(2)
  await expect(page.locator('[data-testid="repeat-step"][data-mentions-seed="true"]')).toHaveCount(2)
  await expect(page.getByTestId('repeat-step').filter({ hasText: /Snap/ })).toHaveAttribute('data-mentions-seed', 'false')
  await expect(page.getByTestId('repeat-apply')).toHaveText('Apply to 3 more')
  await expect(page.getByTestId('repeat-apply')).toBeEnabled()
  const bolt1 = await bodyBox(page, bolt)
  await shot(page, 'repeat-sheet')

  if ((page.viewportSize()?.width ?? 1000) <= 640) {
    // Phone: Apply stays in reach however long the step list grows, and the sheet shrinks to
    // one bar whose own Apply works without expanding it.
    await expect(page.getByTestId('repeat-apply')).toBeInViewport()
    await page.getByTestId('repeat-minimize').click()
    await expect(sheet).toHaveAttribute('data-minimized', 'true')
    await expect(page.getByTestId('repeat-bar')).toContainText('Repeating on 4 · Bolt / screw 1: 5 steps')
    await shot(page, 'repeat-bar')
    await page.getByTestId('repeat-bar-apply').click()
  } else {
    await pressApply(page)
  }
  await expect(sheet).toHaveCount(0)
  await expect(page.getByTestId('repeat-toast-text')).toHaveText('Repeated Bolt / screw 1 on 3 more holes')
  const repeat = /** @type {string} */ (await bodiesOf(page, 'pattern.repeat').getAttribute('data-body-id'))
  await expect(page.locator(`[data-testid="scene-bodies"] li[data-body-id="${repeat}"]`)).toHaveAttribute('data-body-volume', /.+/, { timeout: 30_000 })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', repeat)
  return { pi, screen, bolt, repeat, bolt1 }
}

const ASSISTANT_KEY = 'sk-ant-api03-E2EREPEATSENTINEL-0123456789-abcdefghij'
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }

/** @param {object} data */
const frame = (data) => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`

/**
 * One streamed Assistant reply in the Messages API's wire format (as `ai-chat.e2e.js` scripts it).
 *
 * @param {{ text?: string, calls?: Array<{ name: string, input: object }> }} step
 * @param {number} turn
 */
function sse(step, turn) {
  let body = frame({ type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 1200, output_tokens: 1 } } })
  let index = 0
  if (step.text) {
    body += frame({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
    body += frame({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: step.text } })
    body += frame({ type: 'content_block_stop', index })
    index += 1
  }
  for (const [k, call] of (step.calls ?? []).entries()) {
    body += frame({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_repeat_${turn}_${k}`, name: call.name, input: {} } })
    body += frame({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) } })
    body += frame({ type: 'content_block_stop', index })
    index += 1
  }
  body += frame({ type: 'message_delta', delta: { stop_reason: (step.calls ?? []).length > 0 ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 40 } })
  body += frame({ type: 'message_stop' })
  return body
}

/**
 * The Assistant (the Anthropic API stubbed through Playwright routing, never a live model) lifts
 * `bolt` by 3 mm: a step on the first part that the user did not make (`TODO/core-063`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} bolt
 */
async function assistantLiftsBolt(page, bolt) {
  const script = [
    { text: 'Lifting Bolt 1 by 3 mm.', calls: [{ name: 'operate', input: { op: 'transform.translate', operands: [{ id: bolt }], params: { deltaMm: [0, 0, 3] }, rationale: 'Lift the bolt 3 mm' } }] },
    { text: 'Done.' },
  ]
  let requests = 0
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.url().endsWith('/count_tokens')) {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"input_tokens":8}' })
    }
    requests += 1
    const step = script[requests - 1]
    if (step === undefined) return route.fulfill({ status: 500, headers: CORS, body: '{}' })
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(step, requests) })
  })
  await page.getByTestId('assistant-button').click()
  await page.getByTestId('ai-key-input').fill(ASSISTANT_KEY)
  await page.getByTestId('ai-key-save').click()
  await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
  await page.getByTestId('ai-key-done').click()
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
  await page.getByTestId('ai-input').fill('lift Bolt 1 by 3 mm')
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('ai-assistant-message').last()).toHaveText('Done.', { timeout: 30_000 })
  await page.getByTestId('assistant-close').click()
  await expect(page.getByTestId('assistant-panel')).toHaveCount(0)
}

/** At phone width the panel may have shrunk to its bar: open it again. */
async function expandPanel(page) {
  const expand = page.getByTestId('repeat-expand')
  if ((await expand.isVisible()) && !(await page.getByTestId('repeat-apply').isVisible())) await expand.click()
  await expect(page.getByTestId('repeat-apply')).toBeVisible()
}

/** A snapshot into test-results, per project, for the human reading the run. */
async function shot(page, name) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SNAPSHOT_DIR, `${name}-${test.info().project.name}.png`) })
}

/**
 * The four bolts, read back through the Inspector: Bolt 1's own box, and each repeat member's.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ pi: string, bolt: string, repeat: string }} ids
 */
async function readFourBolts(page, { pi, bolt, repeat }) {
  const bolt1 = { centre: await bodyCentre(page, bolt), box: await bodyBox(page, bolt) }
  /** @type {Record<string, { centre: number[], size: number[], hole: number[] }>} */
  const members = {}
  for (const hole of ['hole2', 'hole3', 'hole4']) {
    const member = await inspectPart(page, repeat, hole)
    const target = await inspectPart(page, pi, hole)
    members[hole] = { centre: member.centre, size: member.size, hole: target.centre }
  }
  const hole1 = await inspectPart(page, pi, 'hole1')
  return { bolt1, hole1: hole1.centre, members }
}

test.afterEach(() => {
  expect(pageErrors).toEqual([])
})

test('Repeat: one bolt placed by hand on hole1, Apply to 3 more, and all four bolts sit on their holes (TODO/ui-069)', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const ids = await repeatOnFourHoles(page)
  const read = await readFourBolts(page, ids)

  // Bolt 1 is on hole1's axis; each repeat is on its own hole's axis, same height, same turn.
  expect(Math.abs(read.bolt1.centre[0] - read.hole1[0])).toBeLessThan(TOL_MM)
  expect(Math.abs(read.bolt1.centre[1] - read.hole1[1])).toBeLessThan(TOL_MM)
  const height = read.bolt1.box[5] - read.bolt1.box[2]
  for (const [hole, member] of Object.entries(read.members)) {
    expect(Math.abs(member.centre[0] - member.hole[0]), `${hole} x`).toBeLessThan(TOL_MM)
    expect(Math.abs(member.centre[1] - member.hole[1]), `${hole} y`).toBeLessThan(TOL_MM)
    expect(Math.abs(member.centre[2] - read.bolt1.centre[2]), `${hole} z`).toBeLessThan(TOL_MM)
    expect(Math.abs(member.size[2] - height), `${hole} height`).toBeLessThan(TOL_MM)
  }
  // The tip is 5 mm below the board's underside (the Offset -5): inside the post.
  const mb = await inspectPart(page, ids.pi, 'mb')
  expect(Math.abs(read.bolt1.box[2] - (mb.centre[2] - mb.size[2] / 2 + -5))).toBeLessThan(TOL_MM)
  // History carries one row for the whole thing.
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-rows').locator('li', { hasText: 'Repeat → hole2, hole3, hole4' })).toHaveCount(1)
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toHaveCount(0)
  // Not one merged body, not four loose ones: Bolt 1 plus one linked Repeat row.
  await expect(bodiesOf(page, 'hardware.bolt')).toHaveCount(1)
  await expect(bodiesOf(page, 'pattern.repeat')).toHaveCount(1)

  // One Undo takes the whole Repeat back and leaves Bolt 1 (the toast's Undo, then Redo).
  await tapBody(page, ids.bolt)
  await expect(page.getByTestId('repeat-toast')).toBeVisible()
  await page.getByTestId('repeat-toast-undo').click()
  await expect(bodiesOf(page, 'pattern.repeat')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '3')
  await expect(page.getByTestId('repeat-toast')).toHaveCount(0)
  await page.getByTestId('redo-button').click()
  await expect(bodiesOf(page, 'pattern.repeat')).toHaveCount(1)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '4')
  const repeat = /** @type {string} */ (await bodiesOf(page, 'pattern.repeat').getAttribute('data-body-id'))

  // Linked: Bolt 1's Length 12 -> 16 makes every repeat 4 mm longer too.
  await tapBody(page, ids.bolt)
  await typeInto(page, 'inspector-param-length', 16)
  await expect(page.getByTestId('inspector-param-length')).toHaveValue(/^16/)
  await expect.poll(async () => (await bodyBox(page, ids.bolt))[5] - (await bodyBox(page, ids.bolt))[2], { timeout: 20_000 }).toBeCloseTo(height + 4, 1)
  for (const hole of ['hole2', 'hole3', 'hole4']) {
    await expect
      .poll(async () => (await inspectPart(page, repeat, hole)).size[2], { timeout: 20_000 })
      .toBeCloseTo(height + 4, 1)
  }

  await shot(page, 'four-bolts')

  // Reload: the project comes back with the same bodies, the Repeat row among them.
  const before = await page.locator('[data-testid="scene-bodies"] li').evaluateAll((n) => n.map((x) => x.getAttribute('data-body-op')))
  await page.reload()
  await expect(page.getByTestId('app-root')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '4')
  await expect(bodiesOf(page, 'pattern.repeat')).toHaveCount(1)
  const after = await page.locator('[data-testid="scene-bodies"] li').evaluateAll((n) => n.map((x) => x.getAttribute('data-body-op')))
  expect(after).toEqual(before)
})

test('Repeat: a step the Assistant made on the first part is listed under Not part of the repeat, Apply stays on, and no copy carries it (TODO/core-063)', async ({
  page,
}) => {
  test.setTimeout(240_000)
  let boltId = ''
  const ids = await repeatOnFourHoles(page, {
    beforeApply: async ({ bolt }) => {
      boltId = bolt
      await assistantLiftsBolt(page, bolt)
      await expandPanel(page)
      // The panel says it in words a person can read, and Apply did not go grey.
      const left = page.getByTestId('repeat-outside-step')
      await expect(left).toHaveCount(1)
      await expect(left).toHaveAttribute('data-origin', 'ai')
      await expect(page.getByTestId('repeat-outside').getByTestId('repeat-outside-reason')).toHaveText('From the Assistant, so it is left out of the copies')
      await expect(page.getByTestId('repeat-outside')).toContainText('Not part of the repeat')
      await expect(page.getByTestId('repeat-reason')).toHaveCount(0)
      await expect(page.getByTestId('repeat-apply')).toBeEnabled()
      await expect(page.getByTestId('repeat-apply')).toHaveText('Apply to 3 more')
      await shot(page, 'repeat-left-out')
    },
  })
  expect(boltId).toBe(ids.bolt)
  // The Assistant's lift moved Bolt 1 up 3 mm; the copies are where the user's own steps put them.
  const read = await readFourBolts(page, ids)
  for (const [hole, member] of Object.entries(read.members)) {
    expect(Math.abs(member.centre[0] - member.hole[0]), `${hole} x`).toBeLessThan(TOL_MM)
    expect(Math.abs(member.centre[1] - member.hole[1]), `${hole} y`).toBeLessThan(TOL_MM)
    expect(Math.abs(read.bolt1.centre[2] - member.centre[2] - 3), `${hole} is 3 mm below Bolt 1`).toBeLessThan(TOL_MM)
  }
})

test('Repeat body: source line, Go to Bolt 1, read-only Position, Remove this repeat, then Detach (TODO/ui-069)', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const ids = await repeatOnFourHoles(page)
  await tapBody(page, ids.repeat)

  // The Inspector says what it repeats, and why there are no gizmo handles to drag.
  await expect(page.getByTestId('inspector-repeat-source')).toContainText('Repeats')
  await expect(page.getByTestId('inspector-repeat-source')).toContainText('Bolt / screw 1')
  await expect(page.getByTestId('inspector-repeat-source')).toContainText('hole2, hole3 and hole4')
  await expect(page.getByTestId('inspector-transform-note')).toHaveAttribute('data-repeat', 'true')
  for (const field of ['inspector-position-x', 'inspector-rotation-z']) {
    await expect(page.getByTestId(field)).toHaveJSProperty('readOnly', true)
  }
  // A typed value into a read-only field is refused quietly, never an uncaught error.
  await page.getByTestId('inspector-position-x').click()
  await page.keyboard.type('12')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('inspector-repeat-source')).toBeVisible()

  // Go to Bolt 1: the source is selected; the Inspector offers its own params again.
  await page.getByTestId('repeat-goto-source').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', ids.bolt)
  await expect(page.getByTestId('inspector-param-length')).toBeVisible()

  // Drill into one member and remove just that repeat.
  await tapPart(page, ids.repeat, 'hole3')
  await expect(page.getByTestId('inspector-repeat-member')).toContainText('hole3')
  const remove = page.getByTestId('inspector-remove-part')
  await expect(remove).toContainText('Remove this repeat')
  await remove.click()
  await expandParts(page, ids.repeat)
  await expect(page.getByTestId(`objects-part-${ids.repeat}-hole3`)).toHaveCount(0)
  await expect(page.getByTestId(`objects-part-${ids.repeat}-hole2`)).toBeVisible()
  await expect(page.getByTestId(`objects-part-${ids.repeat}-hole4`)).toBeVisible()
  await expect(bodiesOf(page, 'pattern.repeat')).toHaveCount(1)

  // Detach what is left: two independent bolts, no Repeat row.
  await tapBody(page, ids.repeat)
  await expect(page.getByTestId('repeat-detach')).toBeEnabled()
  await page.getByTestId('repeat-detach').click()
  await expect(bodiesOf(page, 'pattern.repeat')).toHaveCount(0)
  await expect(bodiesOf(page, 'hardware.bolt')).toHaveCount(3)
  await shot(page, 'detached')
})

test('deleting the source asks first: Cancel, Leave broken, Delete the repeats (TODO/ui-069)', async ({ page }) => {
  test.setTimeout(240_000)
  const ids = await repeatOnFourHoles(page)
  await tapBody(page, ids.bolt)
  const confirm = page.getByTestId('delete-repeats-confirm')

  await page.getByTestId('inspector-delete').click()
  await expect(confirm).toBeVisible()
  await expect(page.getByTestId('delete-repeats-question')).toContainText('Bolt / screw 1 ×3 follows Bolt / screw 1')
  await page.getByTestId('delete-repeats-cancel').click()
  await expect(confirm).toHaveCount(0)
  await expect(bodiesOf(page, 'hardware.bolt')).toHaveCount(1)

  await page.getByTestId('inspector-delete').click()
  await page.getByTestId('delete-repeats-leave-broken').click()
  await expect(bodiesOf(page, 'hardware.bolt')).toHaveCount(0)
  // The repeats are broken as a whole, so none is drawn; History keeps the row, labelled broken.
  await expect(bodiesOf(page, 'pattern.repeat')).toHaveCount(0)
  await page.getByTestId('timeline-toggle').click()
  const row = page.getByTestId('timeline-rows').locator('li', { hasText: 'Repeat → hole2, hole3, hole4' })
  await expect(row).toHaveCount(1)
  await expect(row.getByTestId('chip-broken')).toBeVisible()
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-panel')).toHaveCount(0)
  await page.getByTestId('undo-button').click()
  await expect(bodiesOf(page, 'hardware.bolt')).toHaveCount(1)

  await tapBody(page, ids.bolt)
  await page.getByTestId('inspector-delete').click()
  await page.getByTestId('delete-repeats-too').click()
  await expect(bodiesOf(page, 'hardware.bolt')).toHaveCount(0)
  await expect(bodiesOf(page, 'pattern.repeat')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
})

test('Cancel and Escape end a Repeat session and keep the first part (TODO/ui-069)', async ({ page }) => {
  test.setTimeout(240_000)
  const { pi } = await seatPiOnScreen(page)
  await tapPart(page, pi, 'hole1')
  await page.getByTestId('op-repeat').click()
  await expect(page.getByTestId('repeat-sheet')).toBeVisible()

  // Untick a target: the headline and the count follow.
  await page.getByTestId('repeat-target-hole4').uncheck()
  await expect(page.getByTestId('repeat-headline')).toHaveText('Repeat on Raspberry Pi 1 › hole1 and 2 more')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('repeat-sheet')).toHaveCount(0)

  // Armed again, a bolt made, Cancel: the bolt stays exactly as it is.
  await tapPart(page, pi, 'hole1')
  await page.getByTestId('op-repeat').click()
  await expect(page.getByTestId('repeat-sheet')).toBeVisible()
  await dragFromLibrary(page, 'hardware.bolt', 0.5, 0.3)
  await bodyIdOf(page, 'hardware.bolt')
  await closeLibraryIfSheet(page)
  await expandPanel(page)
  await page.getByTestId('repeat-cancel').click()
  await expect(page.getByTestId('repeat-sheet')).toHaveCount(0)
  await expect(bodiesOf(page, 'hardware.bolt')).toHaveCount(1)
  await expect(bodiesOf(page, 'pattern.repeat')).toHaveCount(0)
  await expect(page.getByTestId('library-repeat-hint')).toHaveCount(0)
})




test('phone: the shrunk Repeat bar never covers the Inspector s Delete row or the Library tab (TODO/ui-069)', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) > 640, 'phone-only: the bar exists below 641px')
  test.setTimeout(240_000)
  const { pi } = await seatPiOnScreen(page)
  await tapPart(page, pi, 'hole1')
  await page.getByTestId('op-repeat').click()
  await dragFromLibrary(page, 'hardware.bolt', 0.5, 0.3)
  await bodyIdOf(page, 'hardware.bolt')
  await closeLibraryIfSheet(page)
  if ((await page.getByTestId('repeat-sheet').getAttribute('data-minimized')) !== 'true') {
    await page.getByTestId('repeat-minimize').click()
  }
  await expect(page.getByTestId('repeat-sheet')).toHaveAttribute('data-minimized', 'true')
  const bar = /** @type {NonNullable<Awaited<ReturnType<ReturnType<typeof page.getByTestId>['boundingBox']>>>} */ (
    await page.getByTestId('repeat-sheet').boundingBox()
  )
  const del = /** @type {NonNullable<Awaited<ReturnType<ReturnType<typeof page.getByTestId>['boundingBox']>>>} */ (
    await page.getByTestId('inspector-delete-row').boundingBox()
  )
  // Disjoint boxes, and the Library tab is still the bottom-most thing.
  expect(del.y + del.height).toBeLessThanOrEqual(bar.y + 1)
  const tab = /** @type {NonNullable<Awaited<ReturnType<ReturnType<typeof page.getByTestId>['boundingBox']>>>} */ (
    await page.getByTestId('library-tab').boundingBox()
  )
  expect(bar.y + bar.height).toBeLessThanOrEqual(tab.y + 1)
  await expect(page.getByTestId('inspector-delete')).toBeInViewport()
  await shot(page, 'phone-bar-clear')
})


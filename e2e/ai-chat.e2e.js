// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/ai-006` — the Assistant's chat, against the real app at `/` with the Anthropic API
 * **stubbed through Playwright routing** as a scripted provider (never a live model, never a
 * real key):
 *
 * - open the chat with a stored key, type a request, **Send**: streamed text, one activity row
 *   per tool call, the new body in the viewport, a History row, a token readout;
 * - tapping an activity row selects the body it made (the viewport answers the chat);
 * - **Stop** mid-turn keeps nothing; **Undo AI turn** takes the landed turn back and then
 *   switches itself off;
 * - the sheet never hides the viewport: at phone/tablet width the nav chrome stays above it at
 *   every height; at laptop width the chat is a column and the canvas keeps most of the screen;
 * - no horizontal scroll, every control at least 44 px.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three reference viewports with a snapshot of the chat at each, and all three engines: the
 * sheet's keyboard lift (`visualViewport`), the key read back from IndexedDB and the canvas
 * under a translucent `backdrop-filter` sheet are each engine-sensitive — the Safari-only class
 * of bug both earlier attempts shipped. Firefox may fail to launch in this sandbox
 * (`TROUBLESHOOTING.md`).
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'ai-chat-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const KEY = 'sk-ant-api03-E2ECHATSENTINEL-0123456789-abcdefghij'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const FORCE_FALLBACK = () => {
  Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
}

/** @param {object} data */
const frame = (data) => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`

/**
 * One streamed assistant reply in the Messages API's wire format.
 *
 * @param {{ text?: string, calls?: Array<{ name: string, input: object }> }} step
 */
function sse(step, turn = 0) {
  let body = frame({ type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 1200, output_tokens: 1 } } })
  let index = 0
  if (step.text) {
    body += frame({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
    body += frame({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: step.text } })
    body += frame({ type: 'content_block_stop', index })
    index += 1
  }
  for (const [k, call] of (step.calls ?? []).entries()) {
    body += frame({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_e2e_${turn}_${k}`, name: call.name, input: {} } })
    body += frame({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) } })
    body += frame({ type: 'content_block_stop', index })
    index += 1
  }
  body += frame({ type: 'message_delta', delta: { stop_reason: (step.calls ?? []).length > 0 ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 340 } })
  body += frame({ type: 'message_stop' })
  return body
}

const CUBE = { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [40, 40, 40] }, rationale: 'The cube' }

/**
 * The scripted provider. `script` is consumed one `/v1/messages` request at a time; a step of
 * `'hang'` never answers (for Stop). Key tests (`count_tokens`) always succeed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array<{ text?: string, calls?: any[] } | 'hang'>} script
 */
async function scriptedProvider(page, script) {
  const state = { requests: /** @type {string[]} */ ([]) }
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.url().endsWith('/count_tokens')) {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"input_tokens":8}' })
    }
    state.requests.push(request.postData() ?? '')
    const step = script[state.requests.length - 1]
    if (step === undefined) return route.fulfill({ status: 500, headers: CORS, body: '{}' })
    if (step === 'hang') {
      // Never answered; the page aborts the fetch when Stop is pressed.
      return new Promise(() => {})
    }
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(step, state.requests.length) })
  })
  return state
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(FORCE_FALLBACK)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

/** Connect a key through the real key sheet, then land in the chat. */
async function connect(/** @type {import('@playwright/test').Page} */ page) {
  await page.getByTestId('assistant-button').click()
  await page.getByTestId('ai-key-input').fill(KEY)
  await page.getByTestId('ai-key-save').click()
  await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
  await page.getByTestId('ai-key-done').click()
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
}

const bodyCount = (/** @type {import('@playwright/test').Page} */ page) => page.getByTestId('viewport')

test('ask for a cube: streamed text, an activity row, the body in the viewport, a History row, a readout', async ({ page }, info) => {
  await scriptedProvider(page, [{ text: 'Making a 40 mm cube.', calls: [{ name: 'create', input: CUBE }] }, { text: 'Done — one cube.' }])
  await connect(page)
  await expect(bodyCount(page)).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('ai-empty')).toBeVisible()
  await expect(page.getByTestId('ai-send')).toBeDisabled()

  await page.getByTestId('ai-input').fill('a 40 mm cube')
  await page.getByTestId('ai-send').click()

  await expect(page.getByTestId('ai-user-message')).toHaveText('a 40 mm cube')
  await expect(page.getByTestId('ai-activity-label')).toContainText('Created')
  await expect(page.getByTestId('ai-assistant-message').last()).toHaveText('Done — one cube.')
  await expect(bodyCount(page)).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('ai-usage')).toContainText('out')
  // The History row is there and says the assistant wrote it.
  await page.getByTestId('timeline-toggle').click()
  await expect(page.getByTestId('timeline-row-1')).toBeAttached()
  await page.getByTestId('timeline-toggle').click()

  await page.screenshot({ path: join(SNAPSHOT_DIR, `chat-${info.project.name}.png`) })
})

test('tapping an activity row selects the body it made', async ({ page }) => {
  await scriptedProvider(page, [{ calls: [{ name: 'create', input: CUBE }] }, { text: 'Done.' }])
  await connect(page)
  await page.getByTestId('ai-input').fill('a cube')
  await page.getByTestId('ai-send').click()
  await expect(bodyCount(page)).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-selected-id', /.+/)

  await page.locator('[data-testid^="ai-activity-toolu"]').first().click()

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', /.+/)
})

test('Enter sends, Shift+Enter breaks the line', async ({ page }) => {
  const api = await scriptedProvider(page, [{ text: 'Hello.' }])
  await connect(page)
  const input = page.getByTestId('ai-input')
  await input.fill('line one')
  await input.press('Shift+Enter')
  await input.pressSequentially('line two')
  expect(api.requests).toHaveLength(0)
  await input.press('Enter')
  await expect(page.getByTestId('ai-user-message')).toHaveText('line one\nline two')
  expect(api.requests).toHaveLength(1)
})

test('Undo AI turn takes the turn back, then switches itself off', async ({ page }) => {
  await scriptedProvider(page, [{ calls: [{ name: 'create', input: CUBE }] }, { text: 'Done.' }])
  await connect(page)
  await expect(page.getByTestId('ai-undo-turn')).toBeDisabled()
  await page.getByTestId('ai-input').fill('a cube')
  await page.getByTestId('ai-send').click()
  await expect(bodyCount(page)).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('ai-undo-turn')).toBeEnabled()

  await page.getByTestId('ai-undo-turn').click()

  await expect(bodyCount(page)).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('ai-undo-turn')).toBeDisabled()
  await expect(page.getByTestId('ai-notice').last()).toContainText('Took the last AI turn back')
})

test('Stop mid-turn keeps nothing and the chat is usable again', async ({ page }) => {
  await scriptedProvider(page, ['hang'])
  await connect(page)
  await page.getByTestId('ai-input').fill('a cube')
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('ai-stop')).toBeVisible()
  await expect(page.getByTestId('ai-status')).toContainText('Working')

  await page.getByTestId('ai-stop').click()

  await expect(page.getByTestId('ai-notice').last()).toContainText('Nothing from this turn was kept')
  await expect(page.getByTestId('ai-send')).toBeVisible()
  await expect(bodyCount(page)).toHaveAttribute('data-body-count', '0')
  await expect(page.getByTestId('ai-undo-turn')).toBeDisabled()
})

test('a failed call shows as an error row that says what the assistant did next', async ({ page }) => {
  await scriptedProvider(page, [
    { calls: [{ name: 'create', input: { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [-5, 5, 5] } } }] },
    { calls: [{ name: 'describe_scene', input: {} }] },
    { text: 'That size was invalid; nothing changed.' },
  ])
  await connect(page)
  await page.getByTestId('ai-input').fill('a negative cube')
  await page.getByTestId('ai-send').click()
  const errorRow = page.locator('[data-testid^="ai-activity-toolu"][data-status="error"]')
  await expect(errorRow).toHaveCount(1)
  await expect(errorRow.getByTestId('ai-activity-next')).toContainText('Then:')
  await expect(bodyCount(page)).toHaveAttribute('data-body-count', '0')
})

test('attach an image: a removable thumbnail is sent with the message', async ({ page }) => {
  const api = await scriptedProvider(page, [{ text: 'I see it.' }])
  await connect(page)
  // A 1×1 PNG.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await page.getByTestId('ai-attach-input').setInputFiles({ name: 'sketch.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByTestId('ai-attachments').locator('img')).toHaveCount(1)
  await page.getByTestId('ai-attachment-remove').click()
  await expect(page.getByTestId('ai-attachments')).toHaveCount(0)
  await page.getByTestId('ai-attach-input').setInputFiles({ name: 'sketch.png', mimeType: 'image/png', buffer: png })
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('ai-user-message')).toContainText('1 image')
  expect(api.requests[0]).toContain('"type":"image"')
})

test('the chat never hides the viewport, scrolls sideways or uses a target under 44 px', async ({ page }, info) => {
  await scriptedProvider(page, [])
  await connect(page)
  const { width } = page.viewportSize()
  const wide = width >= 1100

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  for (const id of ['ai-send', 'ai-attach', 'assistant-close', 'ai-undo-turn', 'ai-input']) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44)
    expect(box.width, `${id} width`).toBeGreaterThanOrEqual(44)
  }

  const canvas = await page.getByTestId('viewport').boundingBox()
  if (wide) {
    // A column: the canvas keeps most of the screen and the panel does not overlap it.
    const panel = await page.getByTestId('assistant-panel').boundingBox()
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(panel.x + 1)
    expect(canvas.width / width).toBeGreaterThan(0.4)
    return
  }
  // A sheet: at every height the viewport's own nav chrome stays above it.
  for (const height of ['peek', 'half', 'full']) {
    await page.getByTestId(`ai-sheet-${height}`).click()
    const sheet = await page.getByTestId('assistant-panel').boundingBox()
    const chrome = await page.getByTestId('navigation-chrome').boundingBox()
    expect(chrome.y + chrome.height, `nav chrome clear of the ${height} sheet`).toBeLessThanOrEqual(sheet.y + 1)
    await page.screenshot({ path: join(SNAPSHOT_DIR, `sheet-${height}-${info.project.name}.png`) })
  }
})

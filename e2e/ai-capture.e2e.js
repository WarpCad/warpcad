// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/ai-007` — the assistant looks at its own work: `capture_view` against the real app at `/`,
 * with the Anthropic API **stubbed through Playwright routing** as a scripted provider (never a
 * live model, never a real key), the same way `e2e/ai-chat.e2e.js` drives the chat.
 *
 * - **The user's view is untouched.** A capture renders offscreen with its own camera: the
 *   viewport's camera attributes and selection are the same after the turn, and the on-screen
 *   canvas is sampled on **every animation frame** while the turn runs — one distinct picture
 *   throughout, so no flash reached the screen.
 * - **The PNG is not blank** — a pixel-variance check, because the second attempt shipped "the
 *   scene is too dark to see" with green tests — and its background matches the on-screen
 *   canvas's, which is what proves the offscreen target is colour-encoded like the screen.
 * - **The model got it**: the next request carries the PNG as an image block in a tool_result.
 * - **The human sees it**: the activity row has a thumbnail that opens full width when tapped.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three reference viewports with a snapshot at each, and all three engines: the capture is
 * WebGL (an sRGB render target, `readPixels`) plus canvas PNG encoding, both engine-sensitive.
 * Firefox may fail to launch in this sandbox (`TROUBLESHOOTING.md`).
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'ai-capture-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

const KEY = 'sk-ant-api03-E2ECAPTURESENTINEL-0123456789-abcdefghij'

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
    body += frame({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_cap_${turn}_${k}`, name: call.name, input: {} } })
    body += frame({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) } })
    body += frame({ type: 'content_block_stop', index })
    index += 1
  }
  body += frame({ type: 'message_delta', delta: { stop_reason: (step.calls ?? []).length > 0 ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 120 } })
  body += frame({ type: 'message_stop' })
  return body
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {Array<{ text?: string, calls?: any[] }>} script
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
    const entry = script[state.requests.length - 1]
    const step = typeof entry === 'function' ? entry(state.requests.at(-1) ?? '') : entry
    if (step === undefined) return route.fulfill({ status: 500, headers: CORS, body: '{}' })
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(step, state.requests.length) })
  })
  return state
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(FORCE_FALLBACK)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-webgl', 'ready')
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

/** The viewport attributes a capture must not change. */
async function viewState(/** @type {import('@playwright/test').Page} */ page) {
  const viewport = page.getByTestId('viewport')
  return {
    azimuth: await viewport.getAttribute('data-camera-azimuth'),
    elevation: await viewport.getAttribute('data-camera-elevation'),
    distance: await viewport.getAttribute('data-camera-distance'),
    target: await viewport.getAttribute('data-camera-target'),
    selected: await viewport.getAttribute('data-selected-id'),
    count: await viewport.getAttribute('data-selected-count'),
  }
}

/**
 * Start sampling the on-screen WebGL canvas once per animation frame (a 24 × 24 downscale,
 * checksummed). `preserveDrawingBuffer` keeps it readable (`src/render/scene.js`).
 */
async function watchCanvas(/** @type {import('@playwright/test').Page} */ page) {
  await page.evaluate(() => {
    const source = /** @type {HTMLCanvasElement} */ (document.querySelector('[data-testid="viewport"] canvas'))
    const probe = document.createElement('canvas')
    probe.width = 24
    probe.height = 24
    const context = /** @type {CanvasRenderingContext2D} */ (probe.getContext('2d', { willReadFrequently: true }))
    const seen = new Set()
    const w = /** @type {any} */ (window)
    w.__captureWatch = { seen, running: true }
    const tick = () => {
      if (!w.__captureWatch.running) return
      context.clearRect(0, 0, 24, 24)
      context.drawImage(source, 0, 0, 24, 24)
      const data = context.getImageData(0, 0, 24, 24).data
      let hash = 0
      for (let i = 0; i < data.length; i += 1) hash = (Math.imul(hash, 31) + data[i]) | 0
      seen.add(hash)
      requestAnimationFrame(tick)
    }
    tick()
  })
}

/** @returns {Promise<number>} How many distinct on-screen pictures were seen. */
async function stopWatching(/** @type {import('@playwright/test').Page} */ page) {
  return page.evaluate(() => {
    const w = /** @type {any} */ (window)
    w.__captureWatch.running = false
    return w.__captureWatch.seen.size
  })
}

/**
 * Pixel statistics of an image (a `data:` URL, or the on-screen canvas when `null`): the spread
 * of luma, and the most common colour (the background, in a framed CAD view).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string | null} src
 */
async function imageStats(page, src) {
  return page.evaluate(async (url) => {
    /** @type {CanvasImageSource} */
    let source
    let width
    let height
    if (url === null) {
      const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector('[data-testid="viewport"] canvas'))
      source = canvas
      width = canvas.width
      height = canvas.height
    } else {
      // Through an <img>, not fetch(): the app's CSP limits connect-src, and img-src allows data:.
      const img = document.createElement('img')
      img.src = url
      await img.decode()
      source = img
      width = img.naturalWidth
      height = img.naturalHeight
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
    context.drawImage(source, 0, 0)
    const data = context.getImageData(0, 0, width, height).data
    let sum = 0
    let squares = 0
    /** @type {Map<number, number>} */
    const colours = new Map()
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      sum += luma
      squares += luma * luma
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
      colours.set(key, (colours.get(key) ?? 0) + 1)
    }
    const count = data.length / 4
    const mean = sum / count
    let mode = 0
    let best = 0
    for (const [key, n] of colours) {
      if (n > best) {
        best = n
        mode = key
      }
    }
    return { width, height, meanLuma: mean, stdDev: Math.sqrt(Math.max(0, squares / count - mean * mean)), mode: [(mode >> 16) & 255, (mode >> 8) & 255, mode & 255] }
  }, src)
}

const CUBE = { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [40, 40, 40] }, rationale: 'The cube' }

test('capture_view: the model sees a non-blank picture, the user’s camera, selection and screen do not change', async ({ page }, info) => {
  const api = await scriptedProvider(page, [
    { text: 'Making a cube.', calls: [{ name: 'create', input: CUBE }] },
    { text: 'Done.' },
    { calls: [{ name: 'capture_view', input: { view: 'iso' } }] },
    { text: 'It looks like a 40 mm cube.' },
  ])
  await connect(page)

  // Turn 1: the cube lands, and the user selects it by tapping its row.
  await page.getByTestId('ai-input').fill('a 40 mm cube')
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await page.locator('[data-testid^="ai-activity-toolu"]').first().click()
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-id', /.+/)

  const before = await viewState(page)
  const screenBefore = await imageStats(page, null)
  await watchCanvas(page)

  // Turn 2: the model looks.
  await page.getByTestId('ai-input').fill('look at it')
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('ai-assistant-message').last()).toHaveText('It looks like a 40 mm cube.')

  const distinctFrames = await stopWatching(page)
  expect(distinctFrames, 'the on-screen canvas never showed anything but the user’s own view').toBe(1)
  expect(await viewState(page)).toEqual(before)

  // The human sees what the model saw.
  const thumbnail = page.getByTestId('ai-activity-thumbnail-img')
  await expect(thumbnail).toBeVisible()
  const src = /** @type {string} */ (await thumbnail.getAttribute('src'))
  expect(src.startsWith('data:image/png;base64,')).toBe(true)

  // Not blank, and not dark: real variation, and the same background colour as the screen.
  const shot = await imageStats(page, src)
  expect(shot.width).toBe(768)
  expect(shot.height).toBe(576)
  expect(shot.stdDev, 'pixel variance: the capture is not one flat colour').toBeGreaterThan(8)
  for (let channel = 0; channel < 3; channel += 1) {
    expect(Math.abs(shot.mode[channel] - screenBefore.mode[channel]), `background channel ${channel} matches the screen`).toBeLessThanOrEqual(12)
  }

  // The model got it as an image block inside the tool_result.
  const followUp = JSON.parse(api.requests[3])
  const results = followUp.messages.at(-1).content.filter((/** @type {any} */ block) => block.type === 'tool_result')
  expect(results).toHaveLength(1)
  const image = results[0].content.find((/** @type {any} */ block) => block.type === 'image')
  expect(image.source.media_type).toBe('image/png')
  expect(image.source.data.length).toBeGreaterThan(1000)

  // Tapping the thumbnail opens it full width; tapping again folds it.
  const button = page.getByTestId('ai-activity-thumbnail')
  const small = await thumbnail.boundingBox()
  await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  const large = await thumbnail.boundingBox()
  expect(large.width).toBeGreaterThan(small.width)
  const box = await button.boundingBox()
  expect(box.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `capture-${info.project.name}.png`) })
  await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'false')

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('a failed check reads as a distinct row: a 0.3 mm fin is flagged by check_printability', async ({ page }) => {
  await scriptedProvider(page, [
    {
      calls: [
        { name: 'create', input: { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } } },
        { name: 'create', input: { op: 'primitive.cuboid', positionMm: [15, 0, 5], params: { size: [10, 0.3, 10] } } },
      ],
    },
    // Ids carry a per-load replica (`TODO/data-008`), so read them back from the create results
    // (the replica form only: the tool descriptions in the same request quote a bare `cuboid-1`).
    (body) => ({ calls: [{ name: 'check_printability', input: { ids: [...new Set(body.match(/cuboid-[a-z2-7]{6}-\d+/g) ?? [])].slice(0, 2) } }] }),
    { text: 'The fin is too thin to print.' },
  ])
  await connect(page)
  await page.getByTestId('ai-input').fill('a block with a thin fin, and check it')
  await page.getByTestId('ai-send').click()
  await expect(page.getByTestId('ai-assistant-message').last()).toHaveText('The fin is too thin to print.')
  const row = page.locator('[data-testid^="ai-activity-toolu"][data-check="fail"]')
  await expect(row).toHaveCount(1)
  await expect(row.getByTestId('ai-activity-summary')).toContainText('nozzle')
})

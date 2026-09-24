/**
 * How long each document mutation blocks the main thread, in a real browser
 * (`TODO/core-029`).
 *
 * `export-mainthread.mjs`'s frame-gap method, pointed at evaluation instead of export:
 * the number reported is the **worst gap between animation frames** while one real
 * interaction runs, which is what a user feels and what `CLAUDE.md`'s 16 ms frame
 * budget is written against. Four interactions, each through the real controls:
 *
 * 1. **drag-place** — a Cube dragged from the Library into the viewport.
 * 2. **undo** — the Undo button, undoing that placement (a full re-fold of the log).
 * 3. **boolean** — two bodies ticked in the Objects list, then Union.
 * 4. **inspector** — the Union's X position typed into the Inspector and committed.
 *
 * The scene is loaded through **File ▾ → Open…** with a generated `.ndjson`, not through
 * the store: this has to run against the production build (`perf-benchmark.md` rule 2),
 * where there is no `/src/stores/…` module to import.
 *
 * The measured window for each interaction runs from the trigger until the change is
 * visible in the DOM **and** every body's `data-body-volume` has landed — so work a
 * worker finishes later is still inside the window, and only its main-thread share can
 * show up as a gap.
 *
 * CPU throttling (CDP `Emulation.setCPUThrottlingRate`) stands in for a phone and is
 * Chromium-only, exactly as in `export-mainthread.mjs`.
 *
 * Usage (a server must already be running):
 *   npm run build && npx vite preview --port 4173 &
 *   node bench/evaluation-mainthread.mjs --url http://localhost:4173 --runs 5
 *   node bench/evaluation-mainthread.mjs --scene 24-bodies --rates 1,4 --runs 3
 *
 * @module bench/evaluation-mainthread
 */

import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
/** @param {string} flag @param {string} [fallback] */
const option = (flag, fallback) => {
  const index = args.indexOf(flag)
  return index === -1 ? fallback : args[index + 1]
}

const URL_BASE = option('--url', 'http://localhost:4173')
const RUNS = Number(option('--runs', '5'))
const RATES = (option('--rates', '1,4,6') ?? '1,4,6').split(',').map(Number)
const ONLY = option('--scene')
const JSON_OUT = option('--json')

/** `data-004`'s fixture: 50 cubes, each moved, rim-filleted and moved again (200 records). */
function filletScene() {
  const records = []
  for (let index = 0; index < 50; index += 1) {
    const at = [(index % 10) * 40, Math.floor(index / 10) * 40, 0]
    records.push({ id: `c${index}`, op: 'primitive.cuboid', name: `Cube ${index + 1}`, params: { size: [20, 20, 20], center: [0, 0, 10] } })
    records.push({ id: `t${index}`, op: 'transform.translate', target: `c${index}`, supersedes: `c${index}`, params: { vector: at } })
    records.push({ id: `f${index}`, op: 'modify.filletRim', target: `t${index}`, supersedes: `t${index}`, params: { face: 'top', radius: 4 } })
    records.push({ id: `u${index}`, op: 'transform.translate', target: `f${index}`, supersedes: `f${index}`, params: { vector: [0, 0, 5] } })
  }
  return records
}

/** `perf-001`'s 24-body scene: 12 Pi boards and 12 bolts on a 150 mm grid. */
function twentyFourScene() {
  return Array.from({ length: 12 }, (unused, index) => {
    const at = [(index % 4) * 150, Math.floor(index / 4) * 150, 0]
    return [
      { id: `pi${index}`, op: 'raspberrypi.bplus', name: `Board ${index + 1}`, params: {} },
      { id: `pit${index}`, op: 'transform.translate', name: `Board ${index + 1}`, target: `pi${index}`, consumes: [`pi${index}`], params: { vector: at } },
      { id: `bolt${index}`, op: 'hardware.bolt', name: `Bolt ${index + 1}`, params: { spec: 'm10 hex', length: 30 } },
      { id: `boltt${index}`, op: 'transform.translate', name: `Bolt ${index + 1}`, target: `bolt${index}`, consumes: [`bolt${index}`], params: { vector: [at[0] + 70, at[1], 0] } },
    ]
  }).flat()
}

/** @type {Record<string, { records: any[], bodies: number }>} */
const SCENES = {
  'fillet-50': { records: filletScene(), bodies: 50 },
  '24-bodies': { records: twentyFourScene(), bodies: 24 },
}

/** @param {number[]} samples */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (/** @type {number} */ q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
  return { n: sorted.length, min: sorted[0], median: at(0.5), p95: at(0.95), worst: sorted[sorted.length - 1] }
}

/** @param {import('@playwright/test').Page} page */
async function bodyCount(page) {
  return Number(await page.getByTestId('viewport').getAttribute('data-body-count'))
}

/**
 * Resolve once the DOM shows `expected` bodies and every one of them carries a volume —
 * i.e. the interaction is finished, including anything a worker was still computing.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} expected
 */
async function settled(page, expected) {
  await page.waitForFunction(
    (count) => {
      const view = document.querySelector('[data-testid="viewport"]')
      if (Number(view?.getAttribute('data-body-count')) !== count) return false
      const items = [...document.querySelectorAll('[data-testid="scene-bodies"] > li')]
      return items.length === count && items.every((item) => item.hasAttribute('data-body-volume'))
    },
    expected,
    { timeout: 120_000, polling: 50 },
  )
}

/** @param {import('@playwright/test').Page} page */
async function startWatch(page) {
  await page.evaluate(() => {
    const watch = /** @type {any} */ (window).__gapWatch
    watch.worst = 0
    watch.last = performance.now()
    watch.on = true
    watch.startedAt = performance.now()
  })
}

/** @param {import('@playwright/test').Page} page */
async function stopWatch(page) {
  return page.evaluate(() => {
    const watch = /** @type {any} */ (window).__gapWatch
    watch.on = false
    return { worst: watch.worst, elapsed: performance.now() - watch.startedAt }
  })
}

/**
 * The Library row drag every placement spec uses: real `PointerEvent`s.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} op
 */
async function dragRowIntoViewport(page, op) {
  await page.evaluate((rowOp) => {
    const row = document.querySelector(`[data-testid="library-row-${rowOp}"]`)
    const view = document.querySelector('[data-testid="viewport"]')
    if (!row || !view) throw new Error(`missing row ${rowOp} or viewport`)
    const from = row.getBoundingClientRect()
    const to = view.getBoundingClientRect()
    const startX = from.left + from.width / 2
    const startY = from.top + from.height / 2
    const endX = to.left + to.width * 0.8
    const endY = to.top + to.height * 0.8
    /** @param {EventTarget} target @param {string} type @param {number} x @param {number} y */
    const fire = (target, type, x, y) =>
      target.dispatchEvent(
        new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true }),
      )
    fire(row, 'pointerdown', startX, startY)
    for (const t of [0.25, 0.5, 0.75, 1]) fire(window, 'pointermove', startX + (endX - startX) * t, startY + (endY - startY) * t)
    fire(window, 'pointerup', endX, endY)
  }, op)
}

const browser = await chromium.launch()
/** @type {any[]} */
const rows = []

for (const sceneName of ONLY ? [ONLY] : Object.keys(SCENES)) {
  const scene = SCENES[sceneName]
  if (!scene) throw new Error(`unknown scene "${sceneName}"`)
  const text = scene.records.map((record) => JSON.stringify(record)).join('\n') + '\n'

  for (const rate of RATES) {
    /** @type {Record<string, number[]>} */
    const gaps = { 'drag-place': [], undo: [], boolean: [], inspector: [] }
    /** @type {Record<string, number[]>} */
    const spans = { 'drag-place': [], undo: [], boolean: [], inspector: [] }

    for (let run = 0; run < RUNS; run += 1) {
      // A fresh context every run: autosave restores the last document from IndexedDB.
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await context.newPage()
      // Chromium would offer the native File System Access picker, which nothing headless
      // can drive; force the <input type=file> fallback, as e2e/save-load-ui.e2e.js does.
      await page.addInitScript(() => {
        Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
        Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
      })
      const session = await context.newCDPSession(page)
      await page.goto(URL_BASE)
      await page.waitForSelector('[data-testid="viewport"]')

      // Seed through the real Open… path.
      await page.getByTestId('file-menu-button').click()
      const chooserEvent = page.waitForEvent('filechooser')
      await page.getByTestId('file-open').click()
      const chooser = await chooserEvent
      await chooser.setFiles({ name: `${sceneName}.ndjson`, mimeType: 'text/plain', buffer: Buffer.from(text) })
      await settled(page, scene.bodies)

      await page.evaluate(() => {
        const watch = { worst: 0, last: performance.now(), on: false, startedAt: 0 }
        Object.assign(window, { __gapWatch: watch })
        const tick = () => {
          const now = performance.now()
          if (watch.on) watch.worst = Math.max(watch.worst, now - watch.last)
          watch.last = now
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      // Let the load's own work (meshes, framing, autosave) drain before measuring.
      await page.waitForTimeout(1500)
      if (rate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate })

      /**
       * @param {string} name
       * @param {() => Promise<void>} act
       * @param {number} expected
       */
      const measure = async (name, act, expected) => {
        await page.waitForTimeout(300)
        await startWatch(page)
        await act()
        await settled(page, expected)
        // A few more frames, so a result that lands just after the DOM settles is counted.
        await page.waitForTimeout(250)
        const { worst, elapsed } = await stopWatch(page)
        gaps[name].push(worst)
        spans[name].push(elapsed)
      }

      const before = await bodyCount(page)
      await measure('drag-place', () => dragRowIntoViewport(page, 'primitive.cuboid'), before + 1)
      await measure('undo', () => page.getByTestId('undo-button').click(), before)

      // Select the last two bodies through the Objects list (not measured), then Union.
      const ids = await page.$$eval('[data-testid="scene-bodies"] > li', (items) => items.map((item) => item.getAttribute('data-body-id')))
      await page.getByTestId('objects-toggle').click()
      await page.getByTestId(`objects-check-${ids.at(-2)}`).click()
      await page.getByTestId(`objects-check-${ids.at(-1)}`).click()
      await page.getByTestId('objects-toggle').click()
      await page.waitForFunction(() => document.querySelector('[data-testid="viewport"]')?.getAttribute('data-selected-count') === '2')
      await measure('boolean', () => page.getByTestId('operation-union').click(), before - 1)

      // The Union result is selected; move it with the Inspector's X field.
      const field = page.getByTestId('inspector-position-x')
      await field.click()
      await field.fill('37')
      await measure('inspector', () => field.press('Enter'), before - 1)

      if (rate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      await context.close()
    }

    for (const name of Object.keys(gaps)) {
      const gap = stats(gaps[name])
      const span = stats(spans[name])
      rows.push({ scene: sceneName, rate, interaction: name, gap, span })
      console.log(
        `${sceneName.padEnd(10)} cpu ${String(rate).padStart(2)}x ${name.padEnd(10)} | worst frame gap median ${gap.median.toFixed(1).padStart(7)} ms (min ${gap.min.toFixed(1)}, worst ${gap.worst.toFixed(1)}) | trigger→settled median ${span.median.toFixed(0)} ms`,
      )
    }
  }
}

await browser.close()
console.log(`\nn=${RUNS} per cell · ${URL_BASE} · Chromium · laptop viewport 1440x900 · headless`)
if (JSON_OUT) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(JSON_OUT, JSON.stringify({ url: URL_BASE, runs: RUNS, rows }, null, 2))
}

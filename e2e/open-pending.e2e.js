// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/core-032` — **File ▾ → Open…** announces itself before it folds, driven against `/`.
 *
 * An Open folds records this page has never built, on the main thread (slice 4 of
 * `docs/decisions/kernel-evaluation-worker.md` measured that and chose to keep the fold
 * synchronous). What this spec proves is the order the user sees:
 *
 * 1. the File button goes **busy** — `file-open-pending` ("Opening…" and a spinner) — and the
 *    chip reads `Opening <name>…`;
 * 2. a frame is painted with that state while the previous document is still on screen;
 * 3. only then is the document replaced, the indicator goes, and the chip reads `Opened …`.
 *
 * And for a file that cannot be folded: the same pending state, then the same refusal as
 * before — the chip names the file and the step, and the scene is unchanged.
 *
 * ## Observed in-page, not polled
 *
 * The pending state lasts one frame plus the fold — tens to hundreds of milliseconds — and
 * the fold itself holds the main thread, so neither Playwright's polling nor a screenshot can
 * reliably land inside it. A `MutationObserver` installed before the file is handed over
 * records the state the moment the indicator appears, and again from the very next
 * animation frame; both records are asserted afterwards. The layout of the busy button is
 * *measured* at that moment (no horizontal overflow, the button inside the viewport), and
 * screenshots of the settled result go to `test-results/open-pending-snapshots/`.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support / Responsive Layout)
 *
 * All three reference viewports — the busy indicator changes the header's 390px-budgeted File
 * button — on **chromium and webkit**: file choosers, the frame timing this relies on and the
 * compositor-driven spinner are engine-sensitive. Firefox cannot launch in this sandbox
 * (`TROUBLESHOOTING.md`, 2026-09-17); the claim is chromium + webkit.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'open-pending-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** `data-004`'s 200-record scene: enough fold that the pending state is a real interval. */
function filletFifty() {
  const lines = []
  for (let index = 0; index < 50; index += 1) {
    const at = [(index % 10) * 40, Math.floor(index / 10) * 40, 0]
    lines.push({ id: `c${index}`, op: 'primitive.cuboid', name: `Cube ${index + 1}`, params: { size: [20, 20, 20], center: [0, 0, 10] } })
    lines.push({ id: `t${index}`, op: 'transform.translate', target: `c${index}`, supersedes: `c${index}`, params: { vector: at } })
    lines.push({ id: `f${index}`, op: 'modify.filletRim', target: `t${index}`, supersedes: `t${index}`, params: { face: 'top', radius: 4 } })
    lines.push({ id: `u${index}`, op: 'transform.translate', target: `f${index}`, supersedes: `f${index}`, params: { vector: [0, 0, 5] } })
  }
  return lines.map((line) => JSON.stringify(line)).join('\n') + '\n'
}

/** One cube: the "current project" the refused Open must leave alone. */
const ONE_CUBE =
  '{"id":"mine","op":"primitive.cuboid","name":"Mine","params":{"size":[20,20,20],"center":[0,0,10]}}\n'

/**
 * Parses fine, folds to step 3 and is refused there by name: a rim fillet over a chamfered
 * rim is not prismatic, so the kernel refuses it rather than return wrong geometry.
 */
const REFUSED = [
  { id: 'c', op: 'primitive.cuboid', name: 'Cube', params: { size: [20, 20, 20], center: [0, 0, 10] } },
  { id: 'c-ch', op: 'modify.chamferRim', target: 'c', supersedes: 'c', params: { radius: 5 } },
  { id: 'c-fi', op: 'modify.filletRim', target: 'c-ch', supersedes: 'c-ch', params: { face: 'bottom', radius: 2 } },
]
  .map((line) => JSON.stringify(line))
  .join('\n')
  .concat('\n')

test.beforeEach(async ({ page }) => {
  // The <input type=file> fallback on every engine, as save-load-ui.e2e.js does: desktop
  // Chromium would otherwise offer the native picker, which nothing headless can drive.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

/**
 * Record the pending state from the inside: when `file-open-pending` first appears, and
 * from the next animation frame after that, and when it goes away.
 *
 * @param {import('@playwright/test').Page} page
 */
async function watchOpen(page) {
  await page.evaluate(() => {
    /** @type {any[]} */
    const log = []
    Object.assign(window, { __openLog: log })
    const sample = (/** @type {string} */ phase) => {
      const button = /** @type {HTMLElement} */ (document.querySelector('[data-testid="file-menu-button"]'))
      const box = button.getBoundingClientRect()
      return {
        phase,
        pending: document.querySelector('[data-testid="file-open-pending"]') !== null,
        pendingText: document.querySelector('[data-testid="file-open-pending"]')?.textContent?.trim() ?? '',
        busy: button.getAttribute('aria-busy'),
        label: button.getAttribute('aria-label'),
        bodies: Number(document.querySelector('[data-testid="viewport"]')?.getAttribute('data-body-count')),
        chip: document.querySelector('[data-testid="save-status-text"]')?.textContent?.trim() ?? '',
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        button: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
        innerWidth: window.innerWidth,
      }
    }
    let appeared = false
    let cleared = false
    const observer = new MutationObserver(() => {
      const now = sample('mutation')
      if (now.pending && !appeared) {
        appeared = true
        log.push({ ...now, phase: 'appeared' })
        requestAnimationFrame(() => log.push(sample('next-frame')))
      } else if (!now.pending && appeared && !cleared) {
        cleared = true
        log.push({ ...now, phase: 'cleared' })
        observer.disconnect()
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
  })
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, any>>}
 */
async function openLog(page) {
  const log = await page.evaluate(() => /** @type {any} */ (window).__openLog)
  return Object.fromEntries(log.map((/** @type {any} */ entry) => [entry.phase, entry]))
}

/**
 * File ▾ → Open… (→ Replace, when there is a project to lose) → hand the chooser a file.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string, text: string, confirm: boolean }} file
 */
async function openThroughMenu(page, { name, text, confirm }) {
  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  if (confirm) await page.getByTestId('file-open-confirm-replace').click()
  const chooser = await chooserEvent
  await watchOpen(page)
  await chooser.setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })
}

test('Open… shows the File button busy, paints a frame with it, then replaces the project', async ({ page }, info) => {
  await expect(page.getByTestId('file-open-pending')).toHaveCount(0)
  await openThroughMenu(page, { name: 'fillet-50.ndjson', text: filletFifty(), confirm: false })

  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '50', { timeout: 60_000 })
  await expect(page.getByTestId('save-status-text')).toHaveText('Opened fillet-50.ndjson · 200 steps')
  await expect(page.getByTestId('file-open-pending')).toHaveCount(0)
  await expect(page.getByTestId('file-menu-button')).not.toHaveAttribute('aria-busy', 'true')

  const log = await openLog(page)
  // 1. Announced, with nothing replaced yet.
  expect(log.appeared).toMatchObject({ pending: true, busy: 'true', bodies: 0, chip: 'Opening fillet-50.ndjson…' })
  expect(log.appeared.pendingText).toBe('Opening…')
  expect(log.appeared.label).toContain('Opening fillet-50.ndjson…')
  // 2. A whole frame ran with it on screen before the fold.
  expect(log['next-frame']).toMatchObject({ pending: true, bodies: 0 })
  // 3. Cleared only once the new project is in.
  expect(log.cleared).toMatchObject({ pending: false })
  // The busy button fits the header at every viewport: no sideways scroll, nothing clipped.
  expect(log.appeared.overflow).toBeLessThanOrEqual(0)
  expect(log.appeared.button.left).toBeGreaterThanOrEqual(0)
  expect(log.appeared.button.right).toBeLessThanOrEqual(log.appeared.innerWidth)

  // Open… is live again.
  await page.getByTestId('file-menu-button').click()
  await expect(page.getByTestId('file-open')).toBeEnabled()
  await page.screenshot({ path: join(SNAPSHOT_DIR, `opened-${info.project.name}.png`) })
})

test('a refused Open shows the same pending state, then refuses by name and changes nothing', async ({ page }, info) => {
  // A current project with history, reached through the same Open.
  await openThroughMenu(page, { name: 'mine.ndjson', text: ONE_CUBE, confirm: false })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  await expect(page.getByTestId('save-status-text')).toHaveText('Opened mine.ndjson · 1 step')
  // What the refusal must leave exactly as it was.
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="scene-bodies"] > li')].map((item) => item.getAttribute('data-body-id')),
  )

  await openThroughMenu(page, { name: 'broken.ndjson', text: REFUSED, confirm: true })

  await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'error')
  await expect(page.getByTestId('save-status-text')).toContainText("Couldn't open broken.ndjson: Step 3 (")
  await expect(page.getByTestId('file-open-pending')).toHaveCount(0)
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
  const after = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="scene-bodies"] > li')].map((item) => item.getAttribute('data-body-id')),
  )
  expect(after).toEqual(before)

  const log = await openLog(page)
  expect(log.appeared).toMatchObject({ pending: true, busy: 'true', bodies: 1, chip: 'Opening broken.ndjson…' })
  expect(log['next-frame']).toMatchObject({ pending: true, bodies: 1 })
  expect(log.cleared).toMatchObject({ pending: false, bodies: 1 })
  expect(log.appeared.overflow).toBeLessThanOrEqual(0)

  // The File menu's first line carries the same message (the phone reads it there).
  await page.getByTestId('file-menu-button').click()
  await expect(page.getByTestId('file-menu-status')).toContainText("Couldn't open broken.ndjson: Step 3 (")
  await expect(page.getByTestId('file-open')).toBeEnabled()
  await page.screenshot({ path: join(SNAPSHOT_DIR, `refused-${info.project.name}.png`) })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The File ▾ menu (`TODO/ui-033`), driven against `/` — the control surface for the local
 * (`io-001`) and hosted (`io-002`) persistence mechanisms: Save / Save As… / Download copy,
 * Open… with its replace-confirm, Connect repository…, Save to / Load from, Auto-push,
 * Disconnect, the Connect dialog, the conflict dialog, the File-button status dot, and the
 * save-status chip they all report through.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support / Responsive Layout)
 *
 * - **All three reference viewports, chromium + webkit.** The File popover is a new overlay
 *   in the 390px-budgeted header, teleported above the Library and Inspector bottom sheets;
 *   `ui-036` found a real phone defect in exactly this class (a popover under a sheet), so
 *   layout is *measured* here, not eyeballed. IndexedDB (credential + autosave) and file
 *   pickers/downloads are engine-sensitive, so both engines run. Firefox cannot launch in
 *   this sandbox (`TROUBLESHOOTING.md`, 2026-09-17) — the claim is chromium + webkit.
 * - **File System Access is desktop-Chromium-only.** So the **fallback** path is driven for
 *   real on every engine (the browser's own `download` and `filechooser` events), forced with
 *   an init script where an engine would otherwise offer the native one. The **native** path
 *   is proven against an injected fake `showSaveFilePicker`/`showOpenFilePicker` — an OS
 *   dialog nothing headless can drive is the one thing not clicked for real (`TODO/VERIFY.md`).
 *
 * ## No request ever leaves this machine
 *
 * `https://api.github.com/**` is answered by `page.route` from an in-memory repository, and
 * every hosted test asserts nothing else with an external origin was requested. There is no
 * real token in this file: `TOKEN` is a sentinel, and the spec asserts it never appears in a
 * request URL, in the page's text or HTML, or in the console.
 *
 * ## Reachability is this spec's job; "does it work" is not
 *
 * A scripted sequence proves only its author's click order. `TODO/ACCEPTANCE.md` scenario 10,
 * driven by hand with wandering, differently-ordered actions, is the other half.
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'save-load-ui-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** A sentinel, not a credential. Nothing in this repository has ever been a real token. */
const TOKEN = 'github_pat_E2E_UI_SENTINEL_not_a_real_token'
const OWNER = 'warpcad-test'
const REPO = 'parts'
const PATH = 'warpcad-project.ndjson'
const LABEL = `${OWNER}/${REPO}`

/** @param {import('@playwright/test').TestInfo} info */
const isPhone = (info) => info.project.name.endsWith('phone')

/** A project file with one cube in it, as `project.js` writes one. */
const CUBE_LINE =
  '{"id":"remote-cube","op":"primitive.cuboid","name":"Remote Cube","params":{"size":[20,20,20],"center":[0,0,10]}}\n'
const SECOND_LINE =
  '{"id":"their-cube","op":"primitive.cuboid","name":"Their Cube","params":{"size":[5,5,5],"center":[50,0,2.5]}}\n'
/** An unrelated project: no row in common with `CUBE_LINE`, so it is never merged (`TODO/io-011`). */
const STRANGER_LINE =
  '{"id":"stranger-1","op":"primitive.cuboid","name":"Stranger","params":{"size":[5,5,5],"center":[50,0,2.5]}}\n'
const THIRD_LINE =
  '{"id":"third","op":"primitive.cuboid","name":"Third","params":{"size":[1,1,1],"center":[0,0,0.5]}}\n'

/**
 * Force the fallback (`<a download>` / `<input type=file>`) on every engine, so the same
 * assertions hold on desktop Chromium — which otherwise offers the native pickers.
 */
const FORCE_FALLBACK = () => {
  Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
}

/**
 * A fake File System Access: an in-memory "disk" plus counters, so the native path is
 * exercised end to end without an OS dialog.
 */
const FAKE_NATIVE = () => {
  const disk = { text: null, name: null, pickerCalls: 0, openCalls: 0, cancelNext: false, openText: '' }
  Object.defineProperty(window, '__fsa', { value: disk, configurable: true })
  const handleFor = (name) => ({
    name,
    async createWritable() {
      let buffer = ''
      return {
        async write(text) {
          buffer += text
        },
        async close() {
          disk.text = buffer
          disk.name = name
        },
      }
    },
    async getFile() {
      // A real handle reads back what was last written to it (`TODO/ai-009`: Save re-reads the
      // file first, to notice an outside change); until then, the file the test "picked".
      return new File([disk.name === name && disk.text !== null ? disk.text : disk.openText], name, { type: 'text/plain' })
    },
  })
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: async () => {
      disk.pickerCalls += 1
      if (disk.cancelNext) {
        disk.cancelNext = false
        throw new DOMException('The user aborted a request.', 'AbortError')
      }
      return handleFor('warpcad-project.ndjson')
    },
  })
  Object.defineProperty(window, 'showOpenFilePicker', {
    configurable: true,
    value: async () => {
      disk.openCalls += 1
      return [handleFor('picked-project.ndjson')]
    },
  })
}

/** @param {import('@playwright/test').Page} page */
async function openLibrary(page) {
  const rows = page.getByTestId('library-rows')
  if (await rows.isVisible()) return
  await page.getByTestId('library-tab').click()
  await expect(rows).toBeVisible()
}

/** @param {import('@playwright/test').Page} page */
async function closeLibrary(page) {
  const tab = page.getByTestId('library-tab')
  if (!(await tab.isVisible())) return
  if (await page.getByTestId('library-rows').isVisible()) await tab.click()
  await expect(page.getByTestId('library-rows')).toBeHidden()
}

/**
 * Drag a Library row into the viewport and release — real `PointerEvent`s, like every other
 * placement spec in this folder.
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
      // At 390 px the open Library is a bottom sheet over the viewport (and `ui-070` lifts it
      // above the Inspector's tab), so a drop point low in the viewport lands on the sheet,
      // which a real release there would also miss. Name that, instead of a body count that
      // never moves.
      const under = document.elementFromPoint(endX, endY)
      if (!under || !view.contains(under)) {
        throw new Error(
          `drop point (${Math.round(endX)}, ${Math.round(endY)}) is covered by ${under?.getAttribute('data-testid') ?? under?.tagName}, not the viewport; pick a higher fy`,
        )
      }
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

/** @param {import('@playwright/test').Page} page @param {number} count */
async function expectBodyCount(page, count) {
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', String(count))
}

/** Wait for the autosave to land, so a reload cannot beat it. */
async function expectAutosaved(page) {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })
}

/**
 * The dev-server module instances the running app itself loaded — used only to *seed* a
 * document quickly and to *read back* what the UI did; every action under test is a click.
 *
 * @param {import('@playwright/test').Page} page
 */
function storeApi(page) {
  return {
    /** @param {(api: any, arg: any) => any} fn @param {any} [arg] */
    run: (fn, arg) =>
      page
        .evaluateHandle(async () => {
          const documentModule = await window.__e2eImport('/src/stores/document.js')
          const hostedModule = await window.__e2eImport('/src/stores/hosted.js')
          const projectModule = await window.__e2eImport('/src/core/project.js')
          const api = {
            documentStore: documentModule.useDocumentStore(),
            hosted: hostedModule.useHostedStore(),
            serializeProject: projectModule.serializeProject,
          }
          return api
        })
        .then(async (handle) => {
          try {
            return await handle.evaluate(fn, arg)
          } finally {
            await handle.dispose()
          }
        }),
  }
}

/** Seed `count` cubes through the document, the way other specs seed a scene. */
async function seedCubes(page, count) {
  await storeApi(page).run(async (api, n) => {
    for (let i = 0; i < n; i += 1) {
      api.documentStore.append({
        id: `seed-${i + 1}`,
        op: 'primitive.cuboid',
        name: `Seed ${i + 1}`,
        params: { size: [10, 10, 10], center: [i * 40, 0, 5] },
      })
    }
  }, count)
  await expectBodyCount(page, count)
}

/** @param {import('@playwright/test').Page} page */
async function openFileMenu(page) {
  await page.getByTestId('file-menu-button').click()
  await expect(page.getByTestId('file-menu')).toBeVisible()
}

/** Trial-click: does the topmost element at the item's centre belong to the item? */
async function isReachable(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return { found: false }
    const box = el.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const top = document.elementFromPoint(x, y)
    return {
      found: true,
      box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height },
      onScreen:
        box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight,
      topmostIsItem: top !== null && (el === top || el.contains(top)),
    }
  }, testId)
}

// ---------------------------------------------------------------------------------------
// The fake git host — the same in-memory repository `hosted-persistence.e2e.js` uses.
// ---------------------------------------------------------------------------------------

function fakeRepository() {
  return {
    /** @type {string | null} */
    text: null,
    sha: /** @type {string | null} */ (null),
    commits: /** @type {string[]} */ ([]),
    mode: /** @type {'ok' | 'unauthorized' | 'offline' | 'missing-repo'} */ ('ok'),
    requests: /** @type {Array<{ method: string, url: string, auth: string | undefined }>} */ ([]),
    escaped: /** @type {string[]} */ ([]),
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {ReturnType<typeof fakeRepository>} repository
 */
async function mockHost(page, repository) {
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    repository.requests.push({ method: request.method(), url: request.url(), auth: request.headers().authorization })
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (repository.mode === 'offline') return route.abort('failed')
    if (repository.mode === 'unauthorized') return json(401, { message: 'Bad credentials' })

    const contentsPath = `/repos/${OWNER}/${REPO}/contents/${PATH}`
    const repoPath = `/repos/${OWNER}/${REPO}`

    if (request.method() === 'GET' && url.pathname === repoPath) {
      return repository.mode === 'missing-repo' ? json(404, { message: 'Not Found' }) : json(200, { full_name: LABEL })
    }
    if (url.pathname === contentsPath && request.method() === 'GET') {
      if (repository.mode === 'missing-repo' || repository.text === null) return json(404, { message: 'Not Found' })
      return json(200, {
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(repository.text, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n'),
        sha: repository.sha,
        size: Buffer.byteLength(repository.text, 'utf8'),
      })
    }
    if (url.pathname === contentsPath && request.method() === 'PUT') {
      const body = JSON.parse(request.postData() ?? '{}')
      if ((body.sha ?? null) !== repository.sha) return json(409, { message: 'does not match' })
      repository.text = Buffer.from(body.content, 'base64').toString('utf8')
      repository.sha = `sha-${repository.commits.length + 1}`
      repository.commits.push(body.message)
      return json(200, { content: { sha: repository.sha }, commit: { sha: `commit-${repository.commits.length}` } })
    }
    return json(404, { message: 'Not Found' })
  })

  page.on('request', (request) => {
    const url = request.url()
    if (url.startsWith('http://localhost:') || url.startsWith('data:') || url.startsWith('blob:')) return
    if (url.startsWith('https://api.github.com/')) return
    repository.escaped.push(url)
  })
}

/** @param {ReturnType<typeof fakeRepository>} repository */
function assertNothingEscaped(repository) {
  expect(repository.escaped, 'a request left for a non-mocked origin').toEqual([])
  for (const request of repository.requests) {
    expect(request.url).not.toContain(TOKEN)
    expect(request.auth).toBe(`Bearer ${TOKEN}`)
  }
}

/**
 * Connect through the real dialog.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ token?: string, repo?: string }} [fields]
 */
async function connectThroughDialog(page, { token = TOKEN, repo = LABEL } = {}) {
  await openFileMenu(page)
  await page.getByTestId('hosted-connect').click()
  await expect(page.getByTestId('hosted-connect-dialog')).toBeVisible()
  await page.getByTestId('hosted-token').fill(token)
  await page.getByTestId('hosted-repo').fill(repo)
  await page.getByTestId('hosted-connect-submit').click()
}

/** @param {import('@playwright/test').Page} page */
async function clearConnection(page) {
  await storeApi(page).run(async (api) => {
    await api.hosted.disconnect()
  })
}

// =======================================================================================
// Layout and reachability — every viewport, both engines
// =======================================================================================

test.describe('the File ▾ menu is mounted in the header and stays reachable (all viewports)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(FORCE_FALLBACK)
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
  })

  test('the button sits in the header cluster with a full-size tap target and opens a menu that is entirely on screen', async ({
    page,
  }, info) => {
    const button = page.getByTestId('file-menu-button')
    await expect(button).toBeVisible()
    const box = await button.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(43.5)
    expect(box.width).toBeGreaterThanOrEqual(43.5)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width)

    // The cluster order the Q&A fixes: Undo, Redo, History, File ▾, chip — none displaced.
    const order = await page.evaluate(() =>
      ['undo-button', 'redo-button', 'timeline-toggle', 'file-menu-button', 'save-status'].map(
        (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().left ?? -1,
      ),
    )
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(order.every((x) => x >= 0)).toBe(true)

    // No horizontal overflow of the header at any width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)

    await openFileMenu(page)
    const items = ['file-save', 'file-open', 'hosted-connect']
    for (const id of items) {
      const reach = await isReachable(page, id)
      expect(reach.found, id).toBe(true)
      expect(reach.onScreen, `${id} is off screen`).toBe(true)
      expect(reach.topmostIsItem, `${id} is covered by something`).toBe(true)
      expect(reach.box.height, `${id} tap target`).toBeGreaterThanOrEqual(43.5)
    }
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-menu-open.png`) })
  })

  test('the popover stays above the Library sheet, the Inspector sheet and the History sheet, and never overlaps the nav chrome it must not cover', async ({
    page,
  }, info) => {
    // Inspector sheet: a placed, selected body auto-opens it at phone width.
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.3, fy: 0.3 })
    await expectBodyCount(page, 1)
    await closeLibrary(page)
    await page.getByTestId('timeline-toggle').click()
    await expect(page.getByTestId('timeline-panel')).toBeVisible()

    await openFileMenu(page)
    for (const id of ['file-save', 'file-open', 'hosted-connect']) {
      const reach = await isReachable(page, id)
      expect(reach.onScreen, `${id} off screen`).toBe(true)
      expect(reach.topmostIsItem, `${id} covered (a sheet is above the popover)`).toBe(true)
    }
    // A real trial click on the last item, not just a hit-test.
    await page.getByTestId('hosted-connect').click()
    await expect(page.getByTestId('hosted-connect-dialog')).toBeVisible()
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-menu-over-sheets.png`) })

    // Opening the menu did not touch the selection (data-002 cross-cutting rule).
    await page.getByTestId('hosted-connect-cancel').click()
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '1')
  })

  test('Escape and an outside tap both close the menu, and reopening works', async ({ page }) => {
    await openFileMenu(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('file-menu')).toBeHidden()
    await openFileMenu(page)
    // The backdrop is the outside: tap the far bottom-left corner of the page.
    await page.mouse.click(4, page.viewportSize().height - 4)
    await expect(page.getByTestId('file-menu')).toBeHidden()
    // Tapping the button again is a tap on the backdrop that covers it, which closes the menu
    // — the same result, and the standard popover behaviour.
    await openFileMenu(page)
    const box = await page.getByTestId('file-menu-button').boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByTestId('file-menu')).toBeHidden()
  })

  // TODO/testing-001: the autosave chip used to change width when "Saved · HH:MM" replaced the
  // pre-save text (~500 ms after an edit), sliding the File button ~9-30 px under a pointer that
  // had already been aimed at it — a click in that window missed. Firefox under load hit it.
  test('the File button does not move when an edit autosaves and the save-status chip changes text', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const button = document.querySelector('[data-testid="file-menu-button"]')
      const seen = new Set()
      window.__fileButtonLefts = seen
      const tick = () => {
        seen.add(Math.round(button.getBoundingClientRect().left * 10) / 10)
        requestAnimationFrame(tick)
      }
      tick()
    })
    await page.waitForTimeout(1200) // let the first status settle; the probe starts from here
    await page.evaluate(() => window.__fileButtonLefts.clear())
    await addCube(page, 'shift-probe')
    await expect(page.getByTestId('save-status-text')).toHaveText(/Saved/)
    await page.waitForTimeout(400)
    const lefts = await page.evaluate(() => [...window.__fileButtonLefts])
    expect(lefts, 'the File button stayed put while the chip changed').toHaveLength(1)
  })

})

// =======================================================================================
// The local half — the fallback path, for real, on every engine
// =======================================================================================

test.describe('Download copy and Open… (the fallback path — real download and file-chooser events)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(FORCE_FALLBACK)
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
  })

  test('the only save item is labelled "Download copy" — never "Save" — and downloads a timestamped project file', async ({
    page,
  }) => {
    await seedCubes(page, 2)
    await openFileMenu(page)
    await expect(page.getByTestId('file-save')).toHaveText(/^\s*Download copy\s*$/)
    await expect(page.getByTestId('file-save-as')).toHaveCount(0)

    const downloading = page.waitForEvent('download')
    await page.getByTestId('file-save').click()
    const download = await downloading
    expect(download.suggestedFilename()).toMatch(/^warpcad-project-\d{8}-\d{4}\.ndjson$/)
    const text = readFileSync(await download.path(), 'utf8')
    expect(text.split('\n').filter(Boolean)[0]).toContain('"id":"seed-1"')
    expect(text).toContain('"id":"seed-2"')

    // The word is "started": a download cannot be confirmed to have landed.
    await expect(page.getByTestId('save-status')).toContainText(`Download started: ${download.suggestedFilename()}`)
    // A click on Download copy closed the menu.
    await expect(page.getByTestId('file-menu')).toBeHidden()
  })

  test('Ctrl/Cmd+S downloads a copy without opening anything, and the browser\'s own Save Page never fires', async ({
    page,
  }, info) => {
    test.skip(isPhone(info) || info.project.name.includes('tablet'), 'a keyboard shortcut — laptop only (touch has the menu)')
    await seedCubes(page, 1)
    const downloading = page.waitForEvent('download')
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S')
    const download = await downloading
    expect(download.suggestedFilename()).toMatch(/^warpcad-project-\d{8}-\d{4}\.ndjson$/)
  })

  test('Open… on a non-empty scene confirms first (Cancel changes nothing), then Replace opens the chooser and loads the file', async ({
    page,
  }) => {
    await seedCubes(page, 2)
    await openFileMenu(page)
    await page.getByTestId('file-open').click()
    const dialog = page.getByTestId('file-open-confirm')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(
      'Open replaces the current project. Save or download it first if you want to keep it.',
    )
    // Top-anchored, full width minus 16px at phone (never bottom-anchored, so a keyboard can't hide it).
    const box = await dialog.boundingBox()
    expect(box.y).toBeLessThan(page.viewportSize().height / 2)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width)

    await page.getByTestId('file-open-confirm-cancel').click()
    await expect(dialog).toBeHidden()
    await expectBodyCount(page, 2) // Cancel lost nothing

    await openFileMenu(page)
    await page.getByTestId('file-open').click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('file-open-confirm-replace').click()
    const chooser = await chooserEvent
    await chooser.setFiles({
      name: 'warpcad-project.ndjson',
      mimeType: 'text/plain',
      buffer: Buffer.from(CUBE_LINE + SECOND_LINE),
    })
    await expectBodyCount(page, 2)
    await expect(page.getByTestId('save-status')).toContainText('Opened warpcad-project.ndjson · 2 steps')
    const ids = await page.$$eval('[data-testid="scene-bodies"] li', (nodes) => nodes.map((n) => n.getAttribute('data-body-id')))
    expect(ids).toEqual(['remote-cube', 'their-cube']) // the seeded bodies are gone
    // Open is not undoable, and says so by leaving both buttons off.
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    await expect(page.getByTestId('redo-button')).toBeDisabled()
  })

  test('Open… on an EMPTY scene goes straight to the chooser with no confirm', async ({ page }) => {
    await openFileMenu(page)
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('file-open').click()
    const chooser = await chooserEvent
    await expect(page.getByTestId('file-open-confirm')).toHaveCount(0)
    await chooser.setFiles({ name: 'p.ndjson', mimeType: 'text/plain', buffer: Buffer.from(CUBE_LINE) })
    await expectBodyCount(page, 1)
    await expect(page.getByTestId('save-status')).toContainText('Opened p.ndjson · 1 step')
  })

  test('New (TODO/ui-054) on an EMPTY scene starts at once with no confirm; on content it asks, and Replace empties the scene', async ({
    page,
  }) => {
    await openFileMenu(page)
    await expect(page.getByTestId('file-new')).toBeEnabled()
    await page.getByTestId('file-new').click()
    await expect(page.getByTestId('file-open-confirm')).toHaveCount(0)
    await expect(page.getByTestId('save-status')).toContainText(/New project · \d\d:\d\d/)

    await seedCubes(page, 2)
    await openFileMenu(page)
    await page.getByTestId('file-new').click()
    await expect(page.getByTestId('file-open-confirm')).toBeVisible()
    await expectBodyCount(page, 2) // nothing changes behind the dialog
    await page.getByTestId('file-open-confirm-replace').click()
    await expectBodyCount(page, 0)
    await expectAutosaved(page) // the empty project is what autosave now holds
  })

  test('Ctrl/Cmd+Alt+N starts a new project (the browser keeps plain Ctrl/Cmd+N)', async ({ page }, info) => {
    test.skip(isPhone(info) || info.project.name.includes('tablet'), 'a keyboard shortcut — laptop only (touch has the menu)')
    await seedCubes(page, 1)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Alt+N' : 'Control+Alt+N')
    await expect(page.getByTestId('file-open-confirm')).toBeVisible()
    await page.getByTestId('file-open-confirm-replace').click()
    await expectBodyCount(page, 0)
  })

  test('a garbage file is refused BY NAME, persistently, and the current project is untouched', async ({ page }) => {
    await seedCubes(page, 2)
    // Let the seed's own autosave land first: a *successful* autosave clears a persistent
    // error by design (io-001), and it would otherwise race the refusal below.
    await expectAutosaved(page)
    await openFileMenu(page)
    await page.getByTestId('file-open').click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('file-open-confirm-replace').click()
    const chooser = await chooserEvent
    await chooser.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('this is not a WarpCad project\n') })

    const chip = page.getByTestId('save-status')
    await expect(chip).toHaveAttribute('data-tone', 'error')
    await expect(chip).toContainText('notes.txt')
    await expect(chip).toContainText(/line 1/i)
    await expectBodyCount(page, 2)
    // Persistent: still there a moment later.
    await page.waitForTimeout(1500)
    await expect(chip).toHaveAttribute('data-tone', 'error')

    // The erroring chip is a button that opens the File menu (data-002 §8), whose first line
    // repeats the message and which offers to dismiss it — errors persist "until the next
    // success or until dismissed".
    await chip.click()
    await expect(page.getByTestId('file-menu')).toBeVisible()
    await expect(page.getByTestId('file-menu-status')).toContainText('notes.txt')
    await page.getByTestId('file-menu-status-dismiss').click()
    await expect(page.getByTestId('file-menu')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(chip).not.toHaveAttribute('data-tone', 'error')
  })

  test('an edited project is a version-2 file: reopening it shows the same History and re-saving writes the same bytes (TODO/data-011)', async ({
    page,
  }) => {
    await seedCubes(page, 2)
    await expectAutosaved(page)

    /** Download a copy and return its text. */
    const downloadCopy = async () => {
      await openFileMenu(page)
      const downloading = page.waitForEvent('download')
      await page.getByTestId('file-save').click()
      const download = await downloading
      return { name: download.suggestedFilename(), text: readFileSync(await download.path(), 'utf8') }
    }
    /** The History rows' text, in order. */
    const historyRows = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-testid]')]
          .filter((element) => /^timeline-row-\d+$/.test(element.getAttribute('data-testid') ?? ''))
          .map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim()),
      )

    await page.getByTestId('timeline-toggle').click()
    await expect(page.getByTestId('timeline-row-1')).toBeVisible()
    const before = await historyRows()
    expect(before).toHaveLength(2)

    const first = await downloadCopy()
    const lines = first.text.trimEnd().split('\n')
    const state = JSON.parse(lines[lines.length - 1])
    expect(state.version).toBe(2)
    expect(state.merge.clock).toBeGreaterThan(0)
    // Every record line is still a plain action record.
    for (const line of lines.slice(0, -1)) expect(JSON.parse(line).op).toBeTruthy()

    // Open the same file back over the current project.
    await openFileMenu(page)
    await page.getByTestId('file-open').click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('file-open-confirm-replace').click()
    const chooser = await chooserEvent
    await chooser.setFiles({ name: first.name, mimeType: 'text/plain', buffer: Buffer.from(first.text) })
    await expect(page.getByTestId('save-status')).toContainText(`Opened ${first.name} · 2 steps`)
    await expectBodyCount(page, 2)

    await expect(page.getByTestId('timeline-row-1')).toBeVisible()
    expect(await historyRows()).toEqual(before)
    const second = await downloadCopy()
    expect(second.text).toBe(first.text)
  })

  test('a file from a newer state-line version is refused with the update sentence and the project is untouched (TODO/data-011)', async ({
    page,
  }) => {
    await seedCubes(page, 2)
    await expectAutosaved(page)
    await openFileMenu(page)
    await page.getByTestId('file-open').click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('file-open-confirm-replace').click()
    const chooser = await chooserEvent
    await chooser.setFiles({
      name: 'from-the-future.ndjson',
      mimeType: 'text/plain',
      buffer: Buffer.from(CUBE_LINE + '{"warpcad":"project-state","version":3,"merge":{"clock":1}}\n'),
    })

    const chip = page.getByTestId('save-status')
    await expect(chip).toHaveAttribute('data-tone', 'error')
    await expect(chip).toContainText('from-the-future.ndjson')
    await expect(chip).toContainText('saved by a newer WarpCad')
    await expect(chip).toContainText('Update the app to open it')
    await expectBodyCount(page, 2)
  })

  test('a cancelled chooser is silent', async ({ page }) => {
    await openFileMenu(page)
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('file-open').click()
    const chooser = await chooserEvent
    await chooser.setFiles([]) // dismissed with no file
    await page.waitForTimeout(300)
    await expect(page.getByTestId('save-status')).not.toHaveAttribute('data-tone', 'error')
  })

  test('the round trip: download a copy, change the scene, Open that file, and the change is gone', async ({ page }) => {
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.3, fy: 0.3 })
    await dragRowIntoViewport(page, { op: 'primitive.cylinder', fx: 0.65, fy: 0.3 })
    await expectBodyCount(page, 2)
    await closeLibrary(page)

    await openFileMenu(page)
    const downloading = page.waitForEvent('download')
    await page.getByTestId('file-save').click()
    const download = await downloading
    const saved = readFileSync(await download.path())

    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.sphere', fx: 0.5, fy: 0.2 })
    await expectBodyCount(page, 3)
    await closeLibrary(page)

    await openFileMenu(page)
    await page.getByTestId('file-open').click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('file-open-confirm-replace').click()
    const chooser = await chooserEvent
    await chooser.setFiles({ name: download.suggestedFilename(), mimeType: 'text/plain', buffer: saved })
    await expectBodyCount(page, 2)
    await expect(page.getByTestId('save-status')).toContainText(`Opened ${download.suggestedFilename()} · 2 steps`)
  })

  test('Open… while History is previewing replaces the document AND ends the preview', async ({ page }) => {
    await seedCubes(page, 2)
    await page.getByTestId('timeline-toggle').click()
    await page.getByTestId('timeline-row-1').click()
    await expect(page.getByTestId('timeline-preview-strip')).toBeVisible()

    // Save/Open stay reachable while previewing; the menu says what Save would write.
    await openFileMenu(page)
    await expect(page.getByTestId('file-save')).toBeEnabled()
    await expect(page.getByTestId('file-open')).toBeEnabled()
    await expect(page.getByTestId('file-menu-preview-note')).toContainText(/current project/i)

    await page.getByTestId('file-open').click()
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByTestId('file-open-confirm-replace').click()
    const chooser = await chooserEvent
    // The SAME ids as the seeded document: the case where a preview would otherwise survive.
    const ids = ['seed-1', 'seed-2']
      .map(
        (id, i) =>
          `{"id":"${id}","op":"primitive.cuboid","name":"Seed ${i + 1}","params":{"size":[10,10,10],"center":[${i * 40},0,5]}}\n`,
      )
      .join('')
    await chooser.setFiles({ name: 'same.ndjson', mimeType: 'text/plain', buffer: Buffer.from(ids) })
    await expect(page.getByTestId('save-status')).toContainText('Opened same.ndjson · 2 steps')
    await expect(page.getByTestId('timeline-preview-strip')).toHaveCount(0)
    await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-previewing', 'true')
  })
})

// =======================================================================================
// The local half — the native File System Access path, against a fake
// =======================================================================================

/** Add one more cube with a fresh id. */
async function addCube(page, id) {
  await storeApi(page).run(async (api, id) => {
    api.documentStore.append({
      id,
      op: 'primitive.cuboid',
      name: id,
      params: { size: [10, 10, 10], center: [200, 0, 5] },
    })
  }, id)
}

test.describe('Save / Save As… (the native File System Access path, against a fake picker)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(FAKE_NATIVE)
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
  })

  test('labelled Save and Save As…; Save reuses the handle with no second prompt; Save As always prompts; a cancelled picker is silent', async ({
    page,
  }) => {
    await seedCubes(page, 1)
    await openFileMenu(page)
    await expect(page.getByTestId('file-save')).toHaveText(/^\s*Save\s*$/)
    await expect(page.getByTestId('file-save-as')).toHaveText(/^\s*Save As…\s*$/)

    await page.getByTestId('file-save').click()
    await expect(page.getByTestId('save-status')).toContainText(/Saved to warpcad-project\.ndjson · \d\d:\d\d/)
    let disk = await page.evaluate(() => ({ ...window.__fsa }))
    expect(disk.pickerCalls).toBe(1)
    expect(disk.text).toContain('"id":"seed-1"')

    // Change the scene, Save again: written to the SAME handle, no second picker.
    await addCube(page, 'extra-1')
    await openFileMenu(page)
    await page.getByTestId('file-save').click()
    await expect.poll(() => page.evaluate(() => window.__fsa.text)).toContain('"id":"extra-1"')
    disk = await page.evaluate(() => ({ ...window.__fsa }))
    expect(disk.pickerCalls).toBe(1)

    // Save As… always opens the picker.
    await openFileMenu(page)
    await page.getByTestId('file-save-as').click()
    await expect.poll(() => page.evaluate(() => window.__fsa.pickerCalls)).toBe(2)

    // Cancelling the picker shows no error at all.
    await page.evaluate(() => {
      window.__fsa.cancelNext = true
    })
    await openFileMenu(page)
    await page.getByTestId('file-save-as').click()
    await expect.poll(() => page.evaluate(() => window.__fsa.pickerCalls)).toBe(3)
    await expect(page.getByTestId('save-status')).not.toHaveAttribute('data-tone', 'error')
  })

  test('New (TODO/ui-054): Cancel keeps the project; Replace empties it, then Save asks for a file instead of overwriting the old one, and placing still works', async ({
    page,
  }) => {
    await seedCubes(page, 1)
    await openFileMenu(page)
    await page.getByTestId('file-save').click()
    await expect(page.getByTestId('save-status')).toContainText(/Saved to warpcad-project\.ndjson/)
    expect((await page.evaluate(() => ({ ...window.__fsa }))).pickerCalls).toBe(1)

    // Cancel: nothing touched.
    await openFileMenu(page)
    await page.getByTestId('file-new').click()
    await expect(page.getByTestId('file-open-confirm')).toBeVisible()
    await expect(page.getByTestId('file-open-confirm')).toContainText('New replaces the current project')
    await page.getByTestId('file-open-confirm-cancel').click()
    await expect(page.getByTestId('file-open-confirm')).toHaveCount(0)
    await expectBodyCount(page, 1)

    // Replace: empty scene, no selection, fresh undo history, a status notice.
    await openFileMenu(page)
    await page.getByTestId('file-new').click()
    await page.getByTestId('file-open-confirm-replace').click()
    await expectBodyCount(page, 0)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-selected-count', '0')
    await expect(page.getByTestId('save-status')).toContainText(/New project · \d\d:\d\d/)
    const state = await storeApi(page).run((api) => ({
      steps: api.documentStore.raw.entries.length,
      canUndo: api.documentStore.canUndo,
    }))
    expect(state).toEqual({ steps: 0, canUndo: false })

    // The old file is not the Save target any more: Save opens the picker (call 2), and the
    // previous file's bytes are replaced only by what that picker chose.
    await seedCubes(page, 1)
    await openFileMenu(page)
    await page.getByTestId('file-save').click()
    await expect.poll(() => page.evaluate(() => window.__fsa.pickerCalls)).toBe(2)

    // The scene still accepts a real Library drag on the first try (ui-053, scenario 1).
    await openLibrary(page)
    await dragRowIntoViewport(page, { op: 'primitive.cuboid', fx: 0.3, fy: 0.3 })
    await closeLibrary(page)
    await expectBodyCount(page, 2)
  })

  test('Open… through the native picker loads the picked file', async ({ page }) => {
    await page.evaluate((text) => {
      window.__fsa.openText = text
    }, CUBE_LINE)
    await seedCubes(page, 2)
    await openFileMenu(page)
    await page.getByTestId('file-open').click()
    await page.getByTestId('file-open-confirm-replace').click()
    await expect(page.getByTestId('save-status')).toContainText('Opened picked-project.ndjson · 1 step')
    await expectBodyCount(page, 1)
  })
})

// =======================================================================================
// The hosted half — the git host fully mocked
// =======================================================================================

/**
 * `TODO/io-008`: a browser that defines both pickers and then refuses the write — the editor's
 * integrated browser. The picker "creates" a file (its name is the part the notice must report),
 * then `createWritable()` throws `NotAllowedError`. Defined on every engine, so Firefox and
 * WebKit drive the same path Chromium does.
 */
const FAKE_REFUSING = () => {
  const state = { pickerCalls: 0 }
  Object.defineProperty(window, '__refusing', { value: state, configurable: true })
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: async () => {
      state.pickerCalls += 1
      return {
        name: 'chamfer error.ndjson',
        async createWritable() {
          throw new DOMException(
            "Failed to execute 'createWritable' on 'FileSystemFileHandle': The request is not allowed by the user agent or the platform in the current context.",
            'NotAllowedError',
          )
        },
      }
    },
  })
  Object.defineProperty(window, 'showOpenFilePicker', {
    configurable: true,
    value: async () => {
      throw new DOMException('not offered', 'NotAllowedError')
    },
  })
}

test.describe('a browser that offers the picker but refuses the write falls back to a download (TODO/io-008)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(FAKE_REFUSING)
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
  })

  test('Save downloads a copy from the same click, says what happened (both files), and the menu then reads Download copy', async ({
    page,
  }, info) => {
    await seedCubes(page, 2)
    await openFileMenu(page)
    await expect(page.getByTestId('file-save')).toHaveText(/^\s*Save\s*$/)
    await expect(page.getByTestId('file-save-as')).toHaveText(/^\s*Save As…\s*$/)

    const downloading = page.waitForEvent('download')
    await page.getByTestId('file-save').click()
    const download = await downloading
    expect(download.suggestedFilename()).toMatch(/^warpcad-project-\d{8}-\d{4}\.ndjson$/)
    const text = readFileSync(await download.path(), 'utf8')
    expect(text).toContain('"id":"seed-1"')
    expect(text).toContain('"id":"seed-2"')

    // A notice, not an error: both file names, and the empty one called out.
    const chip = page.getByTestId('save-status')
    await expect(chip).toContainText(`A copy was downloaded instead: ${download.suggestedFilename()}`)
    await expect(chip).toContainText('An empty file named chamfer error.ndjson may have been left')
    await expect(chip).not.toHaveAttribute('data-tone', 'error')
    // The whole notice is readable on screen (the chip must not clip it off at phone width).
    const box = await chip.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)

    // The menu stops promising a Save it cannot keep.
    await openFileMenu(page)
    // At phone width the chip is a dot: the File menu's own status line is where the words are
    // read, and the long notice must wrap inside the menu rather than run off screen.
    const menuStatus = page.getByTestId('file-menu-status')
    await expect(menuStatus).toContainText('An empty file named chamfer error.ndjson may have been left')
    const statusBox = await menuStatus.boundingBox()
    expect(statusBox.x).toBeGreaterThanOrEqual(0)
    expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(viewport.width + 1)
    await page.screenshot({ path: join(SNAPSHOT_DIR, `refused-write-${info.project.name}.png`) })
    await expect(page.getByTestId('file-save')).toHaveText(/^\s*Download copy\s*$/)
    await expect(page.getByTestId('file-save-as')).toHaveCount(0)

    // A second Save goes straight to a download: no picker, no new notice about an empty file.
    const again = page.waitForEvent('download')
    await page.getByTestId('file-save').click()
    await again
    expect(await page.evaluate(() => window.__refusing.pickerCalls)).toBe(1)
  })
})

test.describe('hosted storage through the File menu (host fully mocked)', () => {
  /** @type {ReturnType<typeof fakeRepository>} */
  let repository
  /** @type {string[]} */
  let consoleLines

  test.beforeEach(async ({ page }) => {
    repository = fakeRepository()
    consoleLines = []
    page.on('console', (message) => consoleLines.push(message.text()))
    await page.addInitScript(FORCE_FALLBACK)
    await mockHost(page, repository)
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
    await clearConnection(page)
  })

  test('Connect: a rejected token shows the reason in the dialog and stores nothing; the right token connects and is never shown again', async ({
    page,
  }, info) => {
    repository.mode = 'unauthorized'
    await connectThroughDialog(page)
    await expect(page.getByTestId('hosted-connect-error')).toContainText(/rejected this token/i)
    await expect(page.getByTestId('hosted-connect-dialog')).toBeVisible()
    await expect(page.getByTestId('file-menu-dot')).toHaveCount(0) // nothing connected

    repository.mode = 'ok'
    await page.getByTestId('hosted-connect-submit').click()
    await expect(page.getByTestId('hosted-connect-saved')).toContainText('Token saved in this browser')
    await expect(page.getByTestId('hosted-connect-saved')).toContainText(LABEL)
    await expect(page.getByTestId('hosted-token')).toHaveCount(0)
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-connect-saved.png`) })

    await page.getByTestId('hosted-connect-done').click()
    await expect(page.getByTestId('hosted-connect-dialog')).toHaveCount(0)
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'in-sync')
    await expect(page.getByTestId('save-status')).toContainText(/No project file yet/i)

    // Auto-push is OFF for a new connection, and the menu now carries the connected group.
    await openFileMenu(page)
    await expect(page.getByTestId('hosted-save')).toContainText(`Save to ${LABEL}`)
    await expect(page.getByTestId('hosted-load')).toContainText(`Load from ${LABEL}`)
    await expect(page.getByTestId('hosted-autopush')).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('hosted-connect')).toHaveCount(0)

    // The credential is nowhere a person, a log, or a URL could see it.
    const html = await page.content()
    expect(html).not.toContain(TOKEN)
    expect(consoleLines.join('\n')).not.toContain(TOKEN)
    assertNothingEscaped(repository)
  })

  test('the Connect dialog is top-anchored, scrollable, on-screen, with 16px inputs, at every viewport', async ({ page }) => {
    await openFileMenu(page)
    await page.getByTestId('hosted-connect').click()
    const dialog = page.getByTestId('hosted-connect-dialog')
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    const view = page.viewportSize()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(view.width)
    expect(box.y).toBeLessThan(view.height / 2)
    // iOS zooms the page on focus of any input under 16px; that would push the dialog off screen.
    for (const id of ['hosted-token', 'hosted-repo', 'hosted-path']) {
      const size = await page.getByTestId(id).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
      expect(size, id).toBeGreaterThanOrEqual(16)
    }
    const token = page.getByTestId('hosted-token')
    await expect(token).toHaveAttribute('type', 'password')
    await expect(token).toHaveAttribute('autocomplete', 'off')
    await expect(token).toHaveAttribute('autocapitalize', 'none')
    // The Connect button is reachable (the dialog scrolls rather than clipping it).
    await page.getByTestId('hosted-connect-submit').scrollIntoViewIfNeeded()
    const reach = await isReachable(page, 'hosted-connect-submit')
    expect(reach.onScreen).toBe(true)
    expect(reach.topmostIsItem).toBe(true)
  })

  test('Save to owner/repo commits the SAME bytes as Download copy, as one commit, and reports it on the chip and the dot', async ({
    page,
  }) => {
    await seedCubes(page, 2)
    await connectThroughDialog(page)
    await page.getByTestId('hosted-connect-done').click()

    await openFileMenu(page)
    await page.getByTestId('hosted-save').click()
    await expect(page.getByTestId('save-status')).toContainText(new RegExp(`Saved to ${LABEL} · \\d\\d:\\d\\d`))
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'in-sync')
    expect(repository.commits).toEqual(['WarpCad: save'])

    const local = await storeApi(page).run(async (api) => api.serializeProject(api.documentStore.raw))
    expect(repository.text).toBe(local)
    assertNothingEscaped(repository)
  })

  test('Ctrl/Cmd+S and Download copy never touch the network — connected, with auto-push ON', async ({ page }, info) => {
    await seedCubes(page, 1)
    await connectThroughDialog(page)
    await page.getByTestId('hosted-connect-done').click()
    await openFileMenu(page)
    await page.getByTestId('hosted-autopush').click() // turning it on pushes once, immediately
    await expect.poll(() => repository.commits.length).toBe(1)
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'in-sync')
    const before = repository.requests.length

    await openFileMenu(page)
    const downloading = page.waitForEvent('download')
    await page.getByTestId('file-save').click()
    await downloading
    if (!isPhone(info) && !info.project.name.includes('tablet')) {
      const again = page.waitForEvent('download')
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S')
      await again
    }
    await page.waitForTimeout(600)
    expect(repository.requests.length, 'a local save reached the network').toBe(before)
    expect(repository.commits).toHaveLength(1)
    assertNothingEscaped(repository)
  })

  test('a repository copy of THIS project that changed is merged, pushed and announced; no dialog (TODO/io-011)', async ({
    page,
  }, info) => {
    repository.text = CUBE_LINE
    repository.sha = 'sha-theirs'
    await connectThroughDialog(page)
    await page.getByTestId('hosted-connect-done').click()
    await openFileMenu(page)
    await page.getByTestId('hosted-load').click()
    await expectBodyCount(page, 1)

    // A second device commits another step to the same project.
    repository.text = CUBE_LINE + SECOND_LINE
    repository.sha = 'sha-theirs-2'
    await addCube(page, 'mine-1')
    await openFileMenu(page)
    await page.getByTestId('hosted-save').click()

    await expect(page.getByTestId('merge-toast')).toContainText(`Merged 1 step from ${LABEL}`)
    await expect(page.getByTestId('hosted-conflict')).toHaveCount(0)
    await expectBodyCount(page, 3)
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'in-sync')
    expect(repository.text).toContain('their-cube')
    expect(repository.text).toContain('mine-1')
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-merged.png`) })
    assertNothingEscaped(repository)
  })

  test('a repository copy of a DIFFERENT project raises the three-button dialog; Cancel writes nothing and leaves the dot at "!"; Overwrite and Load do what they say', async ({
    page,
  }, info) => {
    repository.text = CUBE_LINE
    repository.sha = 'sha-theirs'
    await connectThroughDialog(page)
    await page.getByTestId('hosted-connect-done').click()

    // Load from the repository so this session has genuinely seen its copy (empty scene: no confirm).
    await openFileMenu(page)
    await page.getByTestId('hosted-load').click()
    await expectBodyCount(page, 1)
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'in-sync')

    // A second writer replaces it with a different project.
    repository.text = STRANGER_LINE
    repository.sha = 'sha-theirs-2'
    const theirs = repository.text

    await addCube(page, 'mine-1')
    await openFileMenu(page)
    await page.getByTestId('hosted-save').click()
    const conflict = page.getByTestId('hosted-conflict')
    await expect(conflict).toBeVisible()
    await expect(conflict).toContainText('The repository copy changed since you last loaded or saved it.')
    await expect(page.getByTestId('hosted-conflict-overwrite')).toHaveText(/Overwrite remote/)
    await expect(page.getByTestId('hosted-conflict-load')).toHaveText(/Load remote \(replaces this project\)/)
    await expect(page.getByTestId('hosted-conflict-cancel')).toHaveText(/Cancel/)
    // The sentence is not repeated directly underneath itself (found by looking at the phone screenshot).
    await expect(page.getByTestId('hosted-conflict-detail')).toHaveCount(0)
    expect(repository.text, 'the repository was written anyway').toBe(theirs)
    await page.screenshot({ path: join(SNAPSHOT_DIR, `${info.project.name}-conflict.png`) })

    // Cancel: nothing written, dot stays "!" (dismissing a dialog is not resolving a divergence).
    await page.getByTestId('hosted-conflict-cancel').click()
    await expect(conflict).toHaveCount(0)
    expect(repository.text).toBe(theirs)
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'paused')
    await page.waitForTimeout(500)
    await expect(conflict).toHaveCount(0) // it does not come back on its own

    // An explicit Save raises it again; Load remote replaces the project (their one cube), undo cleared.
    await openFileMenu(page)
    await page.getByTestId('hosted-save').click()
    await expect(conflict).toBeVisible()
    await page.getByTestId('hosted-conflict-load').click()
    await expectBodyCount(page, 1)
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'in-sync')

    // Overwrite remote: a deliberate, user-chosen overwrite goes through.
    repository.text = THIRD_LINE
    repository.sha = 'sha-theirs-3'
    await addCube(page, 'mine-2')
    await openFileMenu(page)
    await page.getByTestId('hosted-save').click()
    await expect(conflict).toBeVisible()
    await page.getByTestId('hosted-conflict-overwrite').click()
    await expect(conflict).toHaveCount(0)
    const local = await storeApi(page).run(async (api) => api.serializeProject(api.documentStore.raw))
    await expect.poll(() => repository.text).toBe(local)
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'in-sync')
    assertNothingEscaped(repository)
  })

  test('the first Save into a repository that already has a project file goes down the conflict path, never a silent overwrite', async ({
    page,
  }) => {
    repository.text = CUBE_LINE
    repository.sha = 'sha-existing'
    await seedCubes(page, 1)
    await connectThroughDialog(page)
    await page.getByTestId('hosted-connect-done').click()
    await openFileMenu(page)
    await page.getByTestId('hosted-save').click()
    await expect(page.getByTestId('hosted-conflict')).toBeVisible()
    await expect(page.getByTestId('hosted-conflict-detail')).toContainText(/already has a project file/i)
    expect(repository.text).toBe(CUBE_LINE)
    expect(repository.commits).toEqual([])
    await page.getByTestId('hosted-conflict-cancel').click()
    assertNothingEscaped(repository)
  })

  test('a conflict raised while the File menu is open is DEFERRED until it closes, never landing under the menu', async ({
    page,
  }) => {
    repository.text = CUBE_LINE
    repository.sha = 'sha-theirs'
    await connectThroughDialog(page)
    await page.getByTestId('hosted-connect-done').click()
    await openFileMenu(page)
    await page.getByTestId('hosted-load').click()
    await expectBodyCount(page, 1)
    repository.text = STRANGER_LINE
    repository.sha = 'sha-theirs-2'
    await addCube(page, 'mine-1')

    // Open the menu, THEN let the conflict arise from elsewhere (a background push would do this).
    await openFileMenu(page)
    await storeApi(page).run(async (api) => {
      await api.hosted.saveToRemote()
    })
    await page.waitForTimeout(300)
    await expect(page.getByTestId('hosted-conflict')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('file-menu')).toBeHidden()
    await expect(page.getByTestId('hosted-conflict')).toBeVisible()
    await page.getByTestId('hosted-conflict-cancel').click()
  })

  test('Auto-push: off until switched on, then pushes once at once; a burst of edits becomes ONE commit after the debounce', async ({
    page,
  }, info) => {
    test.skip(isPhone(info) || info.project.name.includes('tablet'), 'timing behaviour, not layout — laptop only')
    await page.clock.install()
    await seedCubes(page, 1)
    await connectThroughDialog(page)
    await page.getByTestId('hosted-connect-done').click()
    expect(repository.commits).toEqual([])
    await openFileMenu(page)
    await expect(page.getByTestId('hosted-autopush')).toHaveAttribute('aria-checked', 'false')
    await page.getByTestId('hosted-autopush').click()
    await expect.poll(() => repository.commits.length).toBe(1)
    expect(repository.commits[0]).toBe('WarpCad: save')

    // Two edits in a burst → hollow "pending" ring; after the debounce, exactly one auto-push commit.
    await addCube(page, 'burst-1')
    await addCube(page, 'burst-2')
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'pending')
    await page.clock.runFor(31_000)
    await expect.poll(() => repository.commits.length).toBe(2)
    expect(repository.commits[1]).toMatch(/^WarpCad: auto-push /)
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'in-sync')
    assertNothingEscaped(repository)
  })

  test('New (TODO/ui-054) with auto-push ON pauses it and pushes nothing over the repository file; the connection survives', async ({
    page,
  }, info) => {
    test.skip(isPhone(info) || info.project.name.includes('tablet'), 'timing behaviour, not layout — laptop only')
    await page.clock.install()
    await seedCubes(page, 1)
    await connectThroughDialog(page)
    await page.getByTestId('hosted-connect-done').click()
    await openFileMenu(page)
    await page.getByTestId('hosted-autopush').click()
    await expect.poll(() => repository.commits.length).toBe(1)
    const pushedText = repository.text

    await openFileMenu(page)
    await page.getByTestId('file-new').click()
    await page.getByTestId('file-open-confirm-replace').click()
    await expectBodyCount(page, 0)
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'paused')

    // Edits to the new project, and plenty of time: nothing reaches the remote.
    await addCube(page, 'fresh-1')
    await page.clock.runFor(5 * 60_000)
    expect(repository.commits).toHaveLength(1)
    expect(repository.text).toBe(pushedText)

    await openFileMenu(page)
    await expect(page.getByTestId('hosted-autopush')).toContainText('Auto-push paused — new project')
    await expect(page.getByTestId('hosted-save')).toBeVisible() // still connected
    assertNothingEscaped(repository)
  })

  test('a restored connection with auto-push ON is started at boot: the dot is there after a reload, and edits made before the reload are scheduled', async ({
    page,
  }, info) => {
    test.skip(isPhone(info) || info.project.name.includes('tablet'), 'boot wiring, not layout — laptop only')
    await seedCubes(page, 1)
    await connectThroughDialog(page)
    await page.getByTestId('hosted-connect-done').click()
    await openFileMenu(page)
    await page.getByTestId('hosted-autopush').click()
    await expect.poll(() => repository.commits.length).toBe(1)
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'in-sync')

    // Edit, let the local autosave land, reload before the 30 s debounce could fire.
    await addCube(page, 'unpushed-1')
    // The chip is now showing the hosted "pending" state (it outranks autosave's text), so wait
    // out the 500 ms autosave debounce rather than reading the chip.
    await page.waitForTimeout(1200)
    await page.reload()
    await expect(page.getByTestId('app-root')).toBeVisible()

    // Nothing was clicked: hosted.start() alone restored the connection …
    await expect(page.getByTestId('file-menu-dot')).toBeVisible()
    // … and, the restored document being ahead of the last push, one push is scheduled.
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'pending')
    await openFileMenu(page)
    await expect(page.getByTestId('hosted-save')).toContainText(`Save to ${LABEL}`)
    await expect(page.getByTestId('hosted-autopush')).toHaveAttribute('aria-checked', 'true')
    assertNothingEscaped(repository)
  })

  test('Disconnect deletes the credential and the connected group goes away, leaving the model on screen', async ({ page }) => {
    await seedCubes(page, 1)
    await connectThroughDialog(page)
    await page.getByTestId('hosted-connect-done').click()
    await openFileMenu(page)
    await page.getByTestId('hosted-disconnect').click()
    await expect(page.getByTestId('file-menu-dot')).toHaveCount(0)
    await expectBodyCount(page, 1)
    await openFileMenu(page)
    await expect(page.getByTestId('hosted-connect')).toBeVisible()
    await expect(page.getByTestId('hosted-save')).toHaveCount(0)

    const stored = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const request = indexedDB.open('warpcad-credentials')
          request.onsuccess = () => {
            const db = request.result
            if (!db.objectStoreNames.contains('credentials')) return resolve(null)
            const read = db.transaction('credentials', 'readonly').objectStore('credentials').get('hosted-git')
            read.onsuccess = () => resolve(read.result ?? null)
            read.onerror = () => resolve(null)
          }
          request.onerror = () => resolve(null)
        }),
    )
    expect(stored).toBeNull()
    expect(consoleLines.join('\n')).not.toContain(TOKEN)
    assertNothingEscaped(repository)
  })

  test('a token rejected mid-session is a persistent error chip, the dot goes red, and Replace token reconnects', async ({
    page,
  }) => {
    await seedCubes(page, 1)
    await connectThroughDialog(page)
    await page.getByTestId('hosted-connect-done').click()

    repository.mode = 'unauthorized'
    await openFileMenu(page)
    await page.getByTestId('hosted-save').click()
    const chip = page.getByTestId('save-status')
    await expect(chip).toHaveAttribute('data-tone', 'error')
    await expect(chip).toContainText(/rejected this token/i)
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'failed')

    // Clicking the erroring chip opens the File menu (data-002 §8) — the escape hatch.
    await chip.click()
    await expect(page.getByTestId('file-menu')).toBeVisible()
    repository.mode = 'ok'
    await page.getByTestId('hosted-replace-token').click()
    await page.getByTestId('hosted-token').fill(TOKEN)
    await page.getByTestId('hosted-connect-submit').click()
    await expect(page.getByTestId('hosted-connect-saved')).toBeVisible()
    await page.getByTestId('hosted-connect-done').click()
    await expect(page.getByTestId('file-menu-dot')).toHaveAttribute('data-dot-state', 'in-sync')
    assertNothingEscaped(repository)
  })
})

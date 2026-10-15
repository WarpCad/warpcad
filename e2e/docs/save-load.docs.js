// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { openApp, loadScene, startMovie, endMovie, humanDrag, shot, settle } from './support.js'

/**
 * Docs media for `docs/save-load.md` (`TODO/docs-016`): the File menu, the save-status chip in
 * three states, the New / Open confirm dialogs, the hosted Connect and conflict dialogs as
 * stills; the save -> reload round trip and File > Open as movies. Laptop, Chromium only.
 *
 * ## The hosted backend never touches the network
 *
 * `https://api.github.com/**` is answered by `page.route` from an in-memory repository, the
 * same boundary mock the real hosted specs use. The only credential anywhere in this file is
 * the obviously fake `ghp_EXAMPLE`; `assertOnlyTheFakeToken` checks the page's DOM and the
 * requests the app made contain nothing else that looks like a token, and that nothing left
 * for a non-mocked origin.
 *
 * ## Determinism
 *
 * The chip's "Saved - HH:MM" would change every minute, so `pinClock` rewrites the digits in
 * place (the text node's value, so Vue's own node is still the one it patches) instead of
 * masking the whole chip. The "Saving..." state lasts half a second in real use; a docs-only
 * init script holds the autosaver's 500 ms debounce while `window.__docsHold` is set. The
 * "Not saved" picture makes IndexedDB refuse transactions while `window.__docsBreak` is set.
 *
 * Movies assert end state (body count survives the reload; the opened project's two bodies
 * appear), waiting on document state rather than fixed timeouts. Not an acceptance check:
 * scenarios 8, 10 and 14 are driven by hand.
 */
test.describe('docs media: saving, opening, hosted storage', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'laptop-only')

  /** The one fake credential in this file. */
  const FAKE_TOKEN = 'ghp_EXAMPLE'
  const OWNER = 'janecoder'
  const REPO = 'enclosure-parts'
  const LABEL = `${OWNER}/${REPO}`
  const PATH = 'warpcad-project.ndjson'
  const CUBE_LINE =
    '{"id":"remote-cube","op":"primitive.cuboid","name":"Remote Cube","params":{"size":[40,40,40],"center":[0,0,20]}}\n'
  const SECOND_LINE =
    '{"id":"their-cube","op":"primitive.cuboid","name":"Their Cube","params":{"size":[20,20,20],"center":[50,0,10]}}\n'

  /** @param {import('@playwright/test').Page} page */
  const viewport = (page) => page.getByTestId('viewport')
  const bodyCount = (page, n) => expect(viewport(page)).toHaveAttribute('data-body-count', String(n))

  /**
   * Docs-only timing hooks, installed before the app loads: hold the autosave debounce while
   * `window.__docsHold`, and make IndexedDB refuse to open a transaction while `window.__docsBreak`.
   *
   * @param {import('@playwright/test').Page} page
   */
  const installHooks = (page) =>
    page.addInitScript(() => {
      const realSetTimeout = window.setTimeout.bind(window)
      window.setTimeout = (fn, ms, ...rest) => {
        if (ms === 500 && typeof fn === 'function') {
          const wrapped = (...args) => (window.__docsHold ? realSetTimeout(wrapped, 50, ...args) : fn(...args))
          return realSetTimeout(wrapped, ms, ...rest)
        }
        return realSetTimeout(fn, ms, ...rest)
      }
      const realTransaction = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (...args) {
        if (window.__docsBreak) throw new DOMException('Storage is blocked in this window', 'SecurityError')
        return realTransaction.apply(this, args)
      }
    })

  /**
   * Rewrite any HH:MM in the status texts to the clock the page's example uses, in place.
   *
   * @param {import('@playwright/test').Page} page
   */
  const pinClock = (page) =>
    page.evaluate(() => {
      const roots = ['save-status', 'file-menu-status'].flatMap((id) =>
        [...document.querySelectorAll(`[data-testid="${id}"]`)],
      )
      for (const root of roots) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          node.nodeValue = node.nodeValue.replace(/\b\d\d:\d\d\b/, '14:02')
        }
      }
    })

  /** A still with the clock pinned instead of the chip masked. */
  const clockShot = async (page, name, options = {}) => {
    await settle(page)
    await pinClock(page)
    await shot(page, name, { mask: [], ...options })
  }

  const glideTo = async (page, point) => {
    await page.mouse.move(point.x, point.y, { steps: 14 })
    await page.waitForTimeout(200)
  }

  const centreOf = async (locator) => {
    const b = await locator.boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }

  /** A human-paced real click on an element. */
  const press = async (page, testId) => {
    const el = page.getByTestId(testId)
    await glideTo(page, await centreOf(el))
    await el.click()
  }

  const openFileMenu = async (page) => {
    await page.getByTestId('file-menu-button').click()
    await expect(page.getByTestId('file-menu')).toBeVisible()
  }

  /** Drag a Library row into the 3D view and wait for the body to land. */
  const place = async (page, op, fx, fy, count) => {
    const row = await centreOf(page.getByTestId(`library-row-${op}`))
    const view = await viewport(page).boundingBox()
    await humanDrag(page, row, { x: view.x + view.width * fx, y: view.y + view.height * fy }, { steps: 18, ms: 600 })
    await bodyCount(page, count)
  }

  const expectAutosaved = (page) =>
    expect(page.getByTestId('save-status')).toHaveAttribute('data-tone', 'saved', { timeout: 8000 })

  /**
   * The git host, answered from memory.
   *
   * @param {import('@playwright/test').Page} page
   */
  async function mockHost(page) {
    const repository = {
      /** @type {string | null} */ text: null,
      sha: 'sha-0',
      commits: /** @type {string[]} */ ([]),
      requests: /** @type {Array<{ url: string, auth: string | undefined }>} */ ([]),
      escaped: /** @type {string[]} */ ([]),
    }
    await page.route('https://api.github.com/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      repository.requests.push({ url: request.url(), auth: request.headers().authorization })
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      const contents = `/repos/${OWNER}/${REPO}/contents/${PATH}`
      if (request.method() === 'GET' && url.pathname === `/repos/${OWNER}/${REPO}`) {
        return json(200, { full_name: LABEL })
      }
      if (url.pathname === contents && request.method() === 'GET') {
        if (repository.text === null) return json(404, { message: 'Not Found' })
        return json(200, {
          type: 'file',
          encoding: 'base64',
          content: Buffer.from(repository.text, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n'),
          sha: repository.sha,
          size: Buffer.byteLength(repository.text, 'utf8'),
        })
      }
      if (url.pathname === contents && request.method() === 'PUT') {
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
    return repository
  }

  /**
   * Nothing left for a real origin, every credential header is the fake one, and the page
   * shows nothing token-shaped other than it.
   */
  const assertOnlyTheFakeToken = async (page, repository) => {
    expect(repository.escaped, 'a request left for a non-mocked origin').toEqual([])
    for (const request of repository.requests) {
      expect(request.url).not.toContain(FAKE_TOKEN)
      expect(request.auth).toBe(`Bearer ${FAKE_TOKEN}`)
    }
    const html = await page.content()
    const visible = await page.locator('body').innerText()
    const typed = await page.evaluate(() =>
      [...document.querySelectorAll('input')].map((input) => input.value).join('\n'),
    )
    for (const haystack of [html, visible, typed]) {
      expect(haystack).not.toMatch(/github_pat_|gh[pousr]_(?!EXAMPLE)[A-Za-z0-9]{6,}/)
    }
    expect(typed.includes(FAKE_TOKEN) || !typed.includes('ghp_')).toBe(true)
  }

  /** Fill and submit the Connect dialog, optionally stopping before Connect. */
  const connect = async (page, { submit = true } = {}) => {
    await openFileMenu(page)
    await press(page, 'hosted-connect')
    await expect(page.getByTestId('hosted-connect-dialog')).toBeVisible()
    await page.getByTestId('hosted-token').fill(FAKE_TOKEN)
    await page.getByTestId('hosted-repo').fill(LABEL)
    if (!submit) return
    await press(page, 'hosted-connect-submit')
    await expect(page.getByTestId('hosted-connect-saved')).toContainText('Token saved in this browser')
    await press(page, 'hosted-connect-done')
    await expect(page.getByTestId('hosted-connect-dialog')).toHaveCount(0)
  }

  test('file-menu still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'cube-cylinder-union.ndjson', 1)
    await openFileMenu(page)
    // Every entry of the default (not connected) menu: New, the save item, Open, Export,
    // Resolution, and the hosted group's single entry.
    for (const id of ['file-new', 'file-save', 'file-open', 'file-export', 'file-resolution', 'hosted-connect']) {
      await expect(page.getByTestId(id)).toBeVisible()
    }
    await clockShot(page, 'file-menu.png', { locator: page.getByTestId('file-menu') })
  })

  test('file-menu-connected still', async ({ page }) => {
    const repository = await mockHost(page)
    await openApp(page)
    await loadScene(page, 'cube-cylinder-union.ndjson', 1)
    await connect(page)
    await openFileMenu(page)
    // Once connected the hosted group offers the rest of its entries.
    for (const id of ['hosted-save', 'hosted-load', 'hosted-autopush', 'hosted-replace-token', 'hosted-disconnect']) {
      await expect(page.getByTestId(id)).toBeVisible()
    }
    await expect(page.getByTestId('hosted-connect')).toHaveCount(0)
    await clockShot(page, 'file-menu-connected.png', { locator: page.getByTestId('file-menu') })
    await assertOnlyTheFakeToken(page, repository)
  })

  test('save-status still', async ({ page }) => {
    await installHooks(page)
    await openApp(page)
    const chip = page.getByTestId('save-status')
    await bodyCount(page, 0)

    // Saving: hold the debounce, make one real change, and crop the chip while it waits.
    await page.evaluate(() => (window.__docsHold = true))
    await place(page, 'primitive.cuboid', 0.5, 0.5, 1)
    await expect(chip).toHaveAttribute('data-tone', 'saving')
    await expect(chip).toContainText('Saving…')
    await shot(page, 'save-status-saving.png', { locator: chip, mask: [] })

    // Saved: let the write land.
    await page.evaluate(() => (window.__docsHold = false))
    await expectAutosaved(page)
    await expect(chip).toContainText('Saved ·')
    await settle(page)
    await pinClock(page)
    await shot(page, 'save-status-saved.png', { locator: chip, mask: [] })

    // Not saved: the browser refuses storage, and the next change cannot be kept.
    await page.evaluate(() => (window.__docsBreak = true))
    await place(page, 'primitive.cylinder', 0.3, 0.6, 2)
    await expect(chip).toHaveAttribute('data-tone', 'error', { timeout: 8000 })
    await expect(chip).toContainText('Not saved')
    await shot(page, 'save-status-unsaved.png', { locator: chip, mask: [] })
  })

  test('save-refused-notice still', async ({ page }) => {
    // The integrated-browser case (`TODO/io-008`): both pickers exist, the write is refused.
    // Non-configurable on purpose: `openApp` installs its own init script that forces the download
    // fallback, and redefining a locked property throws there, leaving these in place.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: false,
        value: async () => ({
          name: 'bracket.ndjson',
          async createWritable() {
            throw new DOMException('The request is not allowed by the user agent', 'NotAllowedError')
          },
        }),
      })
      Object.defineProperty(window, 'showOpenFilePicker', { configurable: false, value: async () => [] })
    })
    await openApp(page)
    // Placed by hand: `loadScene` needs the file-chooser fallback this test deliberately lacks.
    await place(page, 'primitive.cuboid', 0.5, 0.5, 1)
    await openFileMenu(page)
    const downloading = page.waitForEvent('download')
    await press(page, 'file-save')
    await downloading
    const chip = page.getByTestId('save-status')
    await expect(chip).toContainText('A copy was downloaded instead')
    await expect(chip).toContainText('An empty file named bracket.ndjson may have been left')
    // Pin the timestamp in the downloaded name, in place, like the clock elsewhere in this file.
    await page.evaluate(() => {
      const root = document.querySelector('[data-testid="save-status"]')
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        node.nodeValue = node.nodeValue.replace(/\d{8}-\d{4}/, '20260921-1402')
      }
    })
    await shot(page, 'save-refused-notice.png', { locator: chip, mask: [] })
  })

  test('new-project-confirm still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'cube-and-cylinder.ndjson', 2)
    await openFileMenu(page)
    await press(page, 'file-new')
    const dialog = page.getByTestId('file-open-confirm')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('New replaces the current project with an empty one')
    await expect(page.getByTestId('file-open-confirm-replace')).toBeVisible()
    await clockShot(page, 'new-project-confirm.png')
    await page.getByTestId('file-open-confirm-cancel').click()
    await bodyCount(page, 2) // Cancel left everything as it was
  })

  test('replace-confirm-dialog still', async ({ page }) => {
    await openApp(page)
    await loadScene(page, 'cube-and-cylinder.ndjson', 2)
    await openFileMenu(page)
    await press(page, 'file-open')
    const dialog = page.getByTestId('file-open-confirm')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Open replaces the current project')
    await clockShot(page, 'replace-confirm-dialog.png')
    await page.getByTestId('file-open-confirm-cancel').click()
    await bodyCount(page, 2)
  })

  test('hosted-connect-dialog still', async ({ page }) => {
    const repository = await mockHost(page)
    await openApp(page)
    await loadScene(page, 'cube-and-cylinder.ndjson', 2)
    await connect(page, { submit: false })
    // The field is a password input: the picture shows dots, the DOM holds only the fake value.
    await expect(page.getByTestId('hosted-token')).toHaveAttribute('type', 'password')
    await expect(page.getByTestId('hosted-token')).toHaveValue(FAKE_TOKEN)
    await clockShot(page, 'hosted-connect-dialog.png')
    await assertOnlyTheFakeToken(page, repository)
    await page.getByTestId('hosted-connect-cancel').click()
  })

  test('hosted-conflict-dialog still', async ({ page }) => {
    const repository = await mockHost(page)
    repository.text = CUBE_LINE
    repository.sha = 'sha-theirs'
    await openApp(page)
    await connect(page)
    // Load the repository's copy so this session has genuinely seen it.
    await openFileMenu(page)
    await press(page, 'hosted-load')
    await bodyCount(page, 1)
    // A second writer commits over it, then we make a change and Save: a stale write.
    repository.text = CUBE_LINE + SECOND_LINE
    repository.sha = 'sha-theirs-2'
    const theirs = repository.text
    await place(page, 'primitive.cylinder', 0.7, 0.65, 2)
    await openFileMenu(page)
    await press(page, 'hosted-save')
    const conflict = page.getByTestId('hosted-conflict')
    await expect(conflict).toBeVisible()
    await expect(conflict).toContainText('The repository copy changed since you last loaded or saved it.')
    expect(repository.text, 'the repository was written anyway').toBe(theirs)
    await clockShot(page, 'hosted-conflict-dialog.png')
    await page.getByTestId('hosted-conflict-cancel').click()
    await expect(conflict).toHaveCount(0)
    expect(repository.text).toBe(theirs)
    await assertOnlyTheFakeToken(page, repository)
  })

  test('save-reload-roundtrip', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await bodyCount(page, 0)
    await startMovie(page, 'save-reload-roundtrip')

    await place(page, 'primitive.cuboid', 0.4, 0.55, 1)
    await place(page, 'primitive.cylinder', 0.62, 0.5, 2)
    // Wait for the real autosave to land before reloading — the chip is the thing to watch.
    await expectAutosaved(page)
    await page.waitForTimeout(900)

    await page.reload()
    await expect(viewport(page)).toHaveAttribute('data-webgl', 'ready')
    // Both bodies are back, rebuilt from the browser's own copy.
    await bodyCount(page, 2)
    await expect(page.getByTestId('save-status')).toContainText('Restored your last session')
    await page.waitForTimeout(1500)
    await endMovie(page, 'save-reload-roundtrip', { fps: 8, width: 600 })
  })

  test('open-project', { tag: '@movie' }, async ({ page }) => {
    await openApp(page)
    await bodyCount(page, 0)
    await startMovie(page, 'open-project')

    await glideTo(page, await centreOf(page.getByTestId('file-menu-button')))
    await page.getByTestId('file-menu-button').click()
    await expect(page.getByTestId('file-menu')).toBeVisible()
    await page.waitForTimeout(500)
    const chooserEvent = page.waitForEvent('filechooser')
    await press(page, 'file-open')
    const chooser = await chooserEvent
    await chooser.setFiles({
      name: 'warpcad-project.ndjson',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        [
          '{"id":"cube-1","op":"primitive.cuboid","name":"Cube 1","params":{"size":[40,40,40],"center":[0,0,20]}}',
          '{"id":"cyl-1","op":"primitive.cylinder","name":"Cylinder 1","params":{"diameter":24,"height":60,"center":[0,0,25]}}',
          '',
        ].join('\n'),
      ),
    })
    // The scene appears, and the chip says what it opened.
    await bodyCount(page, 2)
    await expect(page.getByTestId('save-status')).toContainText('Opened warpcad-project.ndjson · 2 steps')
    await page.waitForTimeout(1800)
    await endMovie(page, 'open-project', { fps: 8, width: 600 })
  })
})

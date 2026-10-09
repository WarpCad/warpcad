// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `TODO/ai-004` — the Assistant's key sheet, against the real app at `/` with the Anthropic
 * API **stubbed through Playwright routing** (no real network, no real key, ever):
 *
 * - the header's **Assistant** button is always there; with no key it opens the key sheet,
 *   with one it opens the connected state (dot + model name);
 * - paste a key, **Save and test**, reload: still there (IndexedDB), and **Forget key** really
 *   deletes it;
 * - a bad key, a rate limit, a server error, a blocked request (CORS / blocker) and an offline
 *   tab each give a distinct plain message;
 * - the key is in **no saved file, no localStorage, no other IndexedDB record, no page text and
 *   no URL** (`docs/decisions/ai-partner.md` decision 8; `TODO/ACCEPTANCE.md` scenario 10);
 * - IndexedDB unavailable degrades to session-only with a visible note.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`)
 *
 * All three reference viewports (the sheet is full width at phone and must not scroll
 * sideways, with 44 px targets), with a snapshot of the sheet at each. All three engines:
 * the key is persisted in IndexedDB and read back after a reload, which is engine-sensitive.
 * Firefox may fail to launch in this sandbox (`TROUBLESHOOTING.md`).
 */

const SNAPSHOT_DIR = join(process.cwd(), 'test-results', 'ai-key-snapshots')
test.beforeAll(() => mkdirSync(SNAPSHOT_DIR, { recursive: true }))

/** Shaped like a real key, distinctive enough to grep every surface for. */
const KEY = 'sk-ant-api03-E2ESENTINEL_sentinel-0123456789-abcdefghij'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

/** Force the `<input type=file>` / `<a download>` path on every engine. */
const FORCE_FALLBACK = () => {
  Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true })
}

/**
 * Stub `https://api.anthropic.com/**`. `answer` is a function of the parsed request so a test
 * can switch behaviour; every request is recorded (headers and body) for assertions.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ status?: number, body?: object, headers?: Record<string, string>, abort?: boolean }} initial
 */
async function stubApi(page, initial = {}) {
  const state = { answer: { status: 200, body: { input_tokens: 8 }, ...initial }, requests: [] }
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    state.requests.push({ url: request.url(), headers: request.headers(), body: request.postData() ?? '' })
    if (state.answer.abort) {
      await route.abort('failed')
      return
    }
    await route.fulfill({
      status: state.answer.status,
      headers: { ...CORS, 'content-type': 'application/json', ...(state.answer.headers ?? {}) },
      body: JSON.stringify(state.answer.body),
    })
  })
  return state
}

/** @param {import('@playwright/test').TestInfo} info */
const isPhone = (info) => info.project.name.endsWith('phone')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(FORCE_FALLBACK)
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) =>
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`),
    )
  })
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
})

/** @param {import('@playwright/test').Page} page */
async function pasteAndSave(page, key = KEY) {
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await page.getByTestId('ai-key-input').fill(key)
  await page.getByTestId('ai-key-save').click()
  await expect(page.getByTestId('ai-key-status-text')).not.toHaveText(/testing/i)
}

test('the Assistant button is always in the header, and with no key it opens the key sheet', async ({ page }, info) => {
  const button = page.getByTestId('assistant-button')
  await expect(button).toBeVisible()
  // No dot at all without a key: an empty slot would read as a status.
  await expect(page.getByTestId('assistant-dot')).toHaveCount(0)
  await button.click()
  const sheet = page.getByTestId('ai-key-sheet')
  await expect(sheet).toBeVisible()
  await expect(page.getByTestId('assistant-panel')).toHaveCount(0)
  await expect(page.getByTestId('ai-key-note')).toContainText('Stored only in this browser')
  // The field is a password field a phone's paste menu can fill, at 16px so iOS does not zoom.
  const input = page.getByTestId('ai-key-input')
  await expect(input).toHaveAttribute('type', 'password')
  await expect(input).toHaveAttribute('autocomplete', 'off')
  expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px')
  await expect(page.getByTestId('ai-key-save')).toBeDisabled()
  await page.screenshot({ path: join(SNAPSHOT_DIR, `key-sheet-${info.project.name}.png`) })
})

test('the header does not overflow sideways with the Assistant button in it', async ({ page }) => {
  const header = await page.getByTestId('app-header').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
  expect(header.scroll).toBeLessThanOrEqual(header.client)
  const box = await page.getByTestId('assistant-button').boundingBox()
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)
  const viewportWidth = page.viewportSize().width
  expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth)
  const page_ = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(page_).toBe(true)
})

test('paste, Save and test, reload: still connected; the request carried the key only as x-api-key', async ({ page }, info) => {
  const api = await stubApi(page)
  await pasteAndSave(page)
  await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
  await expect(page.getByTestId('ai-key-dot')).toHaveAttribute('data-dot-state', 'ok')
  // The key field is gone, not emptied: the sheet never shows it back.
  await expect(page.getByTestId('ai-key-input')).toHaveCount(0)
  await page.screenshot({ path: join(SNAPSHOT_DIR, `key-connected-${info.project.name}.png`) })

  expect(api.requests).toHaveLength(1)
  const [request] = api.requests
  expect(request.url).toBe('https://api.anthropic.com/v1/messages/count_tokens')
  expect(request.headers['x-api-key']).toBe(KEY)
  expect(request.headers['anthropic-version']).toBe('2023-06-01')
  expect(request.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  expect(request.url).not.toContain(KEY)
  expect(request.body).not.toContain(KEY)
  expect(JSON.parse(request.body).model).toBe('claude-opus-5-5')

  await page.getByTestId('ai-key-done').click()
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
  await expect(page.getByTestId('assistant-model-name')).toHaveText('Claude Opus 5.5')
  await expect(page.getByTestId('assistant-panel-dot')).toHaveAttribute('data-dot-state', 'ok')
  await page.getByTestId('assistant-close').click()
  await expect(page.getByTestId('assistant-dot')).toHaveAttribute('data-dot-state', 'ok')

  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  // Restored with every sheet closed: the dot is a ring (saved, not yet tested this session).
  await expect(page.getByTestId('assistant-dot')).toHaveAttribute('data-dot-state', 'saved')
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
  await expect(page.getByTestId('ai-key-sheet')).toHaveCount(0)
  await expect(page.getByTestId('assistant-model-name')).toHaveText('Claude Opus 5.5')
  await expect(page.getByTestId('assistant-connection-text')).toContainText('Key saved in this browser')

  // …and the stored key still works: Test from the key sheet.
  await page.getByTestId('assistant-keys').click()
  await page.getByTestId('ai-key-test').click()
  await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
  expect(api.requests).toHaveLength(2)
  expect(api.requests[1].headers['x-api-key']).toBe(KEY)
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([])
})

test('changing the model is one setting: it persists, re-tests, and the next request uses it', async ({ page }) => {
  const api = await stubApi(page)
  await pasteAndSave(page)
  await page.getByTestId('ai-model-select').selectOption('claude-sonnet-5-5')
  await expect.poll(() => api.requests.length).toBe(2)
  expect(JSON.parse(api.requests[1].body).model).toBe('claude-sonnet-5-5')
  await page.reload()
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('assistant-model-name')).toHaveText('Claude Sonnet 5.5')
})

test('Forget key deletes the stored key: the sheet empties, a reload finds nothing, and the record is gone from IndexedDB', async ({ page }) => {
  await stubApi(page)
  await pasteAndSave(page)
  expect(await credentialRecord(page)).not.toBeNull()
  await page.getByTestId('ai-key-forget').click()
  await expect(page.getByTestId('ai-key-input')).toBeVisible()
  await expect(page.getByTestId('assistant-dot')).toHaveCount(0)
  expect(await credentialRecord(page)).toBeNull()
  await page.reload()
  await expect(page.getByTestId('viewport')).toBeVisible()
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await expect(page.getByTestId('assistant-panel')).toHaveCount(0)
})

test('Escape closes the sheet, and Cancel on the empty form leaves nothing stored', async ({ page }) => {
  await page.getByTestId('assistant-button').click()
  await expect(page.getByTestId('ai-key-sheet')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('ai-key-sheet')).toHaveCount(0)
  await page.getByTestId('assistant-button').click()
  await page.getByTestId('ai-key-cancel').click()
  await expect(page.getByTestId('ai-key-sheet')).toHaveCount(0)
  expect(await credentialRecord(page)).toBeNull()
})

test.describe('each failure is distinct and plain, and none quotes the key', () => {
  /** @type {Array<[string, object, RegExp]>} */
  const CASES = [
    ['a bad key (401)', { status: 401, body: { error: { message: `invalid ${KEY}` } } }, /rejected this key/i],
    ['a rate limit (429)', { status: 429, headers: { 'retry-after': '7' }, body: { error: { message: KEY } } }, /rate limit/i],
    ['a server error (500)', { status: 500, body: { error: { message: KEY } } }, /having trouble.*500/i],
    ['a blocked request (CORS refusal / blocker)', { abort: true }, /blocked|CORS/i],
  ]
  for (const [name, answer, pattern] of CASES) {
    test(name, async ({ page }) => {
      await stubApi(page, answer)
      await pasteAndSave(page)
      const text = await page.getByTestId('ai-key-status-text').innerText()
      expect(text).toMatch(pattern)
      expect(text).not.toContain(KEY)
      await expect(page.getByTestId('ai-key-dot')).toHaveAttribute('data-dot-state', 'failed')
      // A failed test keeps the key (the user may just be offline) — it is still stored.
      expect(await credentialRecord(page)).not.toBeNull()
      expect(await page.content()).not.toContain(KEY)
    })
  }

  test('an offline tab', async ({ page }) => {
    const api = await stubApi(page)
    await page.getByTestId('assistant-button').click()
    await page.getByTestId('ai-key-input').fill(KEY)
    // Routed requests are answered before the network, so offline needs the route to fail too.
    api.answer = { abort: true }
    await page.context().setOffline(true)
    await page.getByTestId('ai-key-save').click()
    await expect(page.getByTestId('ai-key-status-text')).toContainText(/offline/i)
    await page.context().setOffline(false)
    api.answer = { status: 200, body: { input_tokens: 8 } }
    await page.getByTestId('ai-key-test').click()
    await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
  })
})

test('the key is in no saved file, localStorage, autosave record, page text or URL (scenario 10)', async ({ page }) => {
  await stubApi(page)
  // A real scene, so the saved file is not empty and the autosave database has a record.
  await page.getByTestId('file-menu-button').click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByTestId('file-open').click()
  await (await chooserEvent).setFiles({
    name: 'cube-and-cylinder.ndjson',
    mimeType: 'text/plain',
    buffer: readFileSync(join(process.cwd(), 'e2e', 'docs', 'fixtures', 'cube-and-cylinder.ndjson')),
  })
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '2')
  await pasteAndSave(page)
  await page.getByTestId('ai-key-done').click()
  await page.getByTestId('assistant-close').click()

  // The File ▸ Download copy path: the project file's bytes.
  await page.getByTestId('file-menu-button').click()
  const downloading = page.waitForEvent('download')
  await page.getByTestId('file-save').click()
  const download = await downloading
  const saved = readFileSync(await download.path(), 'utf8')
  expect(saved.length).toBeGreaterThan(0)
  expect(saved).not.toContain(KEY)

  const surfaces = await page.evaluate(async () => {
    const out = { localStorage: JSON.stringify({ ...localStorage }), sessionStorage: JSON.stringify({ ...sessionStorage }), url: location.href, text: document.documentElement.outerHTML }
    const names = (await indexedDB.databases?.())?.map((d) => d.name) ?? []
    out.databases = {}
    for (const name of names) {
      if (name === 'warpcad-credentials') continue
      out.databases[name] = await new Promise((resolve) => {
        const open = indexedDB.open(name)
        open.onerror = () => resolve('<unreadable>')
        open.onsuccess = () => {
          const db = open.result
          const dump = {}
          const stores = [...db.objectStoreNames]
          if (stores.length === 0) return resolve(JSON.stringify(dump))
          const tx = db.transaction(stores, 'readonly')
          let pending = stores.length
          for (const store of stores) {
            const all = tx.objectStore(store).getAll()
            all.onsuccess = () => {
              dump[store] = all.result
              if (--pending === 0) resolve(JSON.stringify(dump, (k, v) => (v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? '<bytes>' : v)))
            }
            all.onerror = () => {
              if (--pending === 0) resolve(JSON.stringify(dump))
            }
          }
        }
      })
    }
    return out
  })
  expect(Object.keys(surfaces.databases).length).toBeGreaterThan(0)
  expect(surfaces.localStorage).not.toContain(KEY)
  expect(surfaces.sessionStorage).not.toContain(KEY)
  expect(surfaces.url).not.toContain(KEY)
  expect(surfaces.text).not.toContain(KEY)
  expect(JSON.stringify(surfaces.databases)).not.toContain(KEY)
  // The one place it IS: the credential store.
  expect(JSON.stringify(await credentialRecord(page))).toContain(KEY)
})

test('IndexedDB unavailable degrades to session-only, with a visible note, and still connects this session', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.addInitScript(FORCE_FALLBACK)
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }))
  await stubApi(page)
  await page.goto('/')
  await expect(page.getByTestId('viewport')).toBeVisible()
  await pasteAndSave(page)
  await expect(page.getByTestId('ai-key-status-text')).toContainText('Connected')
  await expect(page.getByTestId('ai-key-storage-note')).toContainText(/this session only/i)
  await page.getByTestId('ai-key-done').click()
  await expect(page.getByTestId('assistant-storage-note')).toBeVisible()
  await context.close()
})

test('the sheet fits the viewport: no sideways scroll, 44px targets, the field above the fold', async ({ page }, info) => {
  await stubApi(page)
  await page.getByTestId('assistant-button').click()
  const sheet = page.getByTestId('ai-key-sheet')
  await expect(sheet).toBeVisible()
  const fit = await sheet.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, doc: document.documentElement.scrollWidth, inner: window.innerWidth }))
  expect(fit.scroll).toBeLessThanOrEqual(fit.client)
  expect(fit.doc).toBeLessThanOrEqual(fit.inner)
  const box = await sheet.boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width)
  for (const id of ['ai-key-input', 'ai-model-select', 'ai-key-cancel', 'ai-key-save']) {
    const rect = await page.getByTestId(id).boundingBox()
    expect(rect.height, id).toBeGreaterThanOrEqual(44)
  }
  const input = await page.getByTestId('ai-key-input').boundingBox()
  expect(input.y + input.height).toBeLessThan(page.viewportSize().height * (isPhone(info) ? 0.6 : 1))
  // Paste works as a person would do it: focus, then a clipboard-style fill.
  await page.getByTestId('ai-key-input').fill(KEY)
  await expect(page.getByTestId('ai-key-save')).toBeEnabled()
  // Saved-state buttons too.
  await page.getByTestId('ai-key-save').click()
  await expect(page.getByTestId('ai-key-forget')).toBeVisible()
  const after = await sheet.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
  expect(after.scroll).toBeLessThanOrEqual(after.client)
  for (const id of ['ai-key-forget', 'ai-key-replace', 'ai-key-test', 'ai-key-done']) {
    const rect = await page.getByTestId(id).boundingBox()
    expect(rect.height, id).toBeGreaterThanOrEqual(44)
    expect(rect.x + rect.width, id).toBeLessThanOrEqual(page.viewportSize().width)
  }
})

/**
 * What `warpcad-credentials` holds under the AI key's name, read straight from IndexedDB.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, any> | null>}
 */
async function credentialRecord(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('warpcad-credentials')
        open.onerror = () => resolve(null)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('credentials')) return resolve(null)
          const get = db.transaction('credentials', 'readonly').objectStore('credentials').get('ai-anthropic')
          get.onsuccess = () => resolve(get.result ?? null)
          get.onerror = () => resolve(null)
        }
      }),
  )
}

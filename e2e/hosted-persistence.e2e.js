// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'

/**
 * Hosted git-backend persistence (`TODO/io-002`), driven against `/` with the git
 * host **fully intercepted** — connect, explicit save/load, the sha-based conflict
 * refusal and its three resolutions, a rejected token, a network failure, and
 * Disconnect.
 *
 * ## No request ever leaves this machine
 *
 * Every `https://api.github.com/**` request is answered by `page.route` from the
 * in-memory repository below, and **every test asserts that nothing else with an
 * external origin was requested at all** (`assertNothingEscaped`). There is no real
 * token anywhere in this file: `TOKEN` is a sentinel string, and the spec asserts it
 * never appears in a request URL, in visible page text, or in the console.
 *
 * ## Engines and viewports, stated (`CLAUDE.md`, Browser Support)
 *
 * - **Engines: chromium + webkit.** The *mechanism* has no WebGL, canvas or touch
 *   involvement — it is `fetch` plus IndexedDB — so the nine-way matrix is not
 *   warranted. IndexedDB (the credential store) and `fetch` error handling are both
 *   engine-sensitive, and WebKit is the engine an iPhone actually runs, so
 *   Chromium-only would not be an honest claim either. Firefox cannot launch in this
 *   sandbox (`TROUBLESHOOTING.md`, 2026-09-17), so the claim is chromium + webkit.
 * - **Laptop viewport only.** Nothing here is a layout concern: this task built no
 *   controls. The File menu, Connect dialog and conflict modal got the three-viewport
 *   layout treatment in `ui-033`'s own spec.
 *
 * ## What is and is not reachable by a real click here
 *
 * **`e2e/save-load-ui.e2e.js` (`TODO/ui-033`) is where the File ▾ menu's hosted group, the
 * Connect dialog and the `hosted-conflict` modal are clicked.** This spec keeps driving the
 * layer underneath them, as `e2e/local-persistence.e2e.js` does for the file mechanism: the
 * **same store functions the menu calls** — `src/stores/hosted.js` — imported from the Vite
 * dev server so they are the module instances the running app itself loaded, with the real
 * `fetch` client and the real IndexedDB credential store underneath.
 */

/** A sentinel, not a credential. Nothing in this repository has ever been a real token. */
const TOKEN = 'github_pat_E2E_SENTINEL_not_a_real_token'
const OWNER = 'warpcad-test'
const REPO = 'parts'
const PATH = 'warpcad-project.ndjson'
const LABEL = `${OWNER}/${REPO}`

/** @param {import('@playwright/test').TestInfo} info */
const isLaptop = (info) => info.project.name.endsWith('laptop')

/**
 * The fake repository. One file, one blob sha, plus the switches a test needs to
 * make the host misbehave.
 */
function fakeRepository() {
  return {
    /** @type {string | null} */
    text: null,
    sha: /** @type {string | null} */ (null),
    commits: /** @type {string[]} */ ([]),
    /** `ok`, or a failure every request answers with. */
    mode: /** @type {'ok' | 'unauthorized' | 'offline' | 'missing-repo'} */ ('ok'),
    /** Every intercepted request, for the credential assertions. */
    requests: /** @type {Array<{ method: string, url: string, auth: string | undefined }>} */ ([]),
    /** Anything that tried to leave for a non-mocked external origin. */
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
    repository.requests.push({
      method: request.method(),
      url: request.url(),
      auth: request.headers().authorization,
    })

    if (repository.mode === 'offline') {
      // A dropped connection, not an HTTP error: this is the `fetch`-throws path.
      await route.abort('failed')
      return
    }
    if (repository.mode === 'unauthorized') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Bad credentials' }) })
      return
    }

    const contentsPath = `/repos/${OWNER}/${REPO}/contents/${PATH}`
    const repoPath = `/repos/${OWNER}/${REPO}`

    if (request.method() === 'GET' && url.pathname === repoPath) {
      if (repository.mode === 'missing-repo') {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ full_name: LABEL }) })
      return
    }

    if (url.pathname === contentsPath && request.method() === 'GET') {
      if (repository.mode === 'missing-repo' || repository.text === null) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'file',
          encoding: 'base64',
          // Wrapped at 60 columns, exactly as the real Contents API answers.
          content: Buffer.from(repository.text, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n'),
          sha: repository.sha,
          size: Buffer.byteLength(repository.text, 'utf8'),
        }),
      })
      return
    }

    if (url.pathname === contentsPath && request.method() === 'PUT') {
      const body = JSON.parse(request.postData() ?? '{}')
      const supplied = body.sha ?? null
      if (supplied !== repository.sha) {
        // The whole conflict mechanism, exactly as GitHub implements it.
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message: `${PATH} does not match ${supplied ?? 'no sha'}` }),
        })
        return
      }
      repository.text = Buffer.from(body.content, 'base64').toString('utf8')
      repository.sha = `sha-${repository.commits.length + 1}`
      repository.commits.push(body.message)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: { sha: repository.sha }, commit: { sha: `commit-${repository.commits.length}` } }),
      })
      return
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) })
  })

  // Anything else with an external origin is a bug in this spec or in the client.
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
    // The credential goes in a header and only in a header.
    expect(request.url).not.toContain(TOKEN)
    expect(request.auth).toBe(`Bearer ${TOKEN}`)
  }
}

/**
 * The dev-server module instances the running app itself loaded — the same
 * functions `ui-033` will call from its File menu.
 *
 * @param {import('@playwright/test').Page} page
 */
function storeApi(page) {
  return {
    /** @param {(api: any, arg: any) => any} fn @param {any} [arg] */
    run: (fn, arg) =>
      page.evaluate(
        async ({ source, arg }) => {
          const hostedModule = await import('/src/stores/hosted.js')
          const documentModule = await import('/src/stores/document.js')
          const persistenceModule = await import('/src/stores/persistence.js')
          const projectModule = await import('/src/core/project.js')
          const api = {
            hosted: hostedModule.useHostedStore(),
            documentStore: documentModule.useDocumentStore(),
            persistence: persistenceModule.usePersistenceStore(),
            serializeProject: projectModule.serializeProject,
          }
          return await new Function('api', 'arg', `return (${source})(api, arg)`)(api, arg)
        },
        { source: fn.toString(), arg },
      ),
  }
}

const CONNECT = { token: TOKEN, owner: OWNER, repo: REPO, path: PATH }

/** A project file with one cube in it, as `project.js` writes one. */
const REMOTE_PROJECT =
  '{"id":"remote-cube","op":"primitive.cuboid","name":"Remote Cube","params":{"size":[20,20,20],"center":[0,0,10]}}\n'

test.describe('hosted git-backend persistence (host fully mocked)', () => {
  /** @type {ReturnType<typeof fakeRepository>} */
  let repository
  /** @type {string[]} */
  let consoleLines

  test.beforeEach(async ({ page }, info) => {
    test.skip(!isLaptop(info), 'the hosted mechanism has no layout surface — laptop only (see header)')
    repository = fakeRepository()
    consoleLines = []
    page.on('console', (message) => consoleLines.push(message.text()))
    await mockHost(page, repository)
    await page.goto('/')
    await expect(page.getByTestId('app-root')).toBeVisible()
    // A previous test's connection must not leak into this one.
    await storeApi(page).run(async (api) => {
      await api.hosted.disconnect()
    })
  })

  test('Connect validates against the host before storing anything, and a rejected token stores nothing', async ({
    page,
  }) => {
    const api = storeApi(page)
    repository.mode = 'unauthorized'

    const refused = await api.run(async (api, arg) => {
      const result = await api.hosted.connect(arg)
      return { result, connected: api.hosted.connected, error: api.hosted.errorMessage }
    }, CONNECT)

    expect(refused.result.ok).toBe(false)
    expect(refused.result.message).toMatch(/rejected this token/i)
    expect(refused.connected).toBe(false)
    // Nothing was written: the credential database holds no record for a token the
    // host refused.
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

    repository.mode = 'ok'
    const accepted = await api.run(async (api, arg) => {
      const result = await api.hosted.connect(arg)
      return { result, label: api.hosted.repoLabel, status: api.hosted.statusText, auto: api.hosted.autoPushEnabled }
    }, CONNECT)
    expect(accepted.result).toMatchObject({ ok: true, exists: false })
    expect(accepted.label).toBe(LABEL)
    expect(accepted.status).toMatch(/no project file yet/i)
    expect(accepted.auto).toBe(false) // auto-push is off for every new connection

    assertNothingEscaped(repository)
  })

  test('Save writes the same bytes as the local project file, as one commit', async ({ page }) => {
    const api = storeApi(page)
    const saved = await api.run(async (api, arg) => {
      await api.hosted.connect(arg)
      api.documentStore.append({
        id: 'cube-1',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [10, 10, 10], center: [0, 0, 5] },
      })
      const result = await api.hosted.saveToRemote()
      return { result, local: api.serializeProject(api.documentStore.raw), status: api.hosted.statusText }
    }, CONNECT)

    expect(saved.result.ok).toBe(true)
    expect(repository.text).toBe(saved.local)
    expect(repository.commits).toEqual(['WarpCad: save'])
    expect(saved.status).toMatch(new RegExp(`Saved to ${LABEL}`, 'i'))
    assertNothingEscaped(repository)
  })

  test('a repository copy that changed is REFUSED, not overwritten, and the three resolutions do what they say', async ({
    page,
  }) => {
    const api = storeApi(page)
    repository.text = REMOTE_PROJECT
    repository.sha = 'sha-theirs'

    // Connect, then load, so this session has genuinely seen the repository's copy.
    const loaded = await api.run(async (api, arg) => {
      await api.hosted.connect(arg)
      const result = await api.hosted.loadFromRemote()
      return { result, ids: api.documentStore.raw.entries.map((entry) => entry.record.id) }
    }, CONNECT)
    expect(loaded.result.ok).toBe(true)
    expect(loaded.ids).toEqual(['remote-cube'])

    // A second tab (or an MCP session) commits over it.
    repository.text = `${REMOTE_PROJECT}{"id":"their-cube","op":"primitive.cuboid","name":"Their Cube","params":{"size":[5,5,5],"center":[50,0,2.5]}}\n`
    repository.sha = 'sha-theirs-2'
    const theirText = repository.text

    const refused = await api.run(async (api) => {
      api.documentStore.append({
        id: 'mine-1',
        op: 'primitive.cuboid',
        name: 'Mine',
        params: { size: [10, 10, 10], center: [0, 0, 5] },
      })
      const result = await api.hosted.saveToRemote()
      return {
        result,
        conflictOpen: api.hosted.conflictOpen,
        message: api.hosted.conflict?.message ?? '',
        dot: api.hosted.dotState,
      }
    })
    expect(refused.result.ok).toBe(false)
    expect(refused.conflictOpen).toBe(true)
    expect(refused.message).toMatch(/changed/i)
    expect(repository.text, 'the repository was written anyway').toBe(theirText)

    // Cancel: nothing is written, and the dialog does not come back on its own.
    const cancelled = await api.run(async (api) => {
      await api.hosted.resolveConflict('cancel')
      return { conflictOpen: api.hosted.conflictOpen }
    })
    expect(cancelled.conflictOpen).toBe(false)
    expect(repository.text).toBe(theirText)

    // Load remote: replaces the project (their two cubes), clearing undo.
    const pulled = await api.run(async (api) => {
      await api.hosted.saveToRemote() // raises it again, as the docs say it does
      const result = await api.hosted.resolveConflict('load')
      return {
        result,
        ids: api.documentStore.raw.entries.map((entry) => entry.record.id),
        canUndo: api.documentStore.canUndo,
      }
    })
    expect(pulled.result.ok).toBe(true)
    expect(pulled.ids).toEqual(['remote-cube', 'their-cube'])
    expect(pulled.canUndo).toBe(false)

    // Overwrite remote: a deliberate, user-chosen overwrite does go through.
    repository.text = `${theirText}{"id":"third","op":"primitive.cuboid","name":"Third","params":{"size":[1,1,1],"center":[0,0,0.5]}}\n`
    repository.sha = 'sha-theirs-3'
    const overwritten = await api.run(async (api) => {
      api.documentStore.append({
        id: 'mine-2',
        op: 'primitive.cuboid',
        name: 'Mine 2',
        params: { size: [10, 10, 10], center: [30, 0, 5] },
      })
      await api.hosted.saveToRemote()
      const result = await api.hosted.resolveConflict('overwrite')
      return { result, local: api.serializeProject(api.documentStore.raw), dot: api.hosted.dotState }
    })
    expect(overwritten.result.ok).toBe(true)
    expect(repository.text).toBe(overwritten.local)
    expect(overwritten.dot).toBe('in-sync')

    assertNothingEscaped(repository)
  })

  test('a bad remote file is refused by name and the current project is untouched', async ({ page }) => {
    const api = storeApi(page)
    repository.text = 'this is not a WarpCad project at all\n'
    repository.sha = 'sha-garbage'

    const result = await api.run(async (api, arg) => {
      api.documentStore.append({
        id: 'local-1',
        op: 'primitive.cuboid',
        name: 'Local',
        params: { size: [10, 10, 10], center: [0, 0, 5] },
      })
      const before = api.serializeProject(api.documentStore.raw)
      await api.hosted.connect(arg)
      const load = await api.hosted.loadFromRemote()
      return {
        load,
        error: api.hosted.errorMessage,
        unchanged: api.serializeProject(api.documentStore.raw) === before,
        bodies: api.documentStore.count,
      }
    }, CONNECT)

    expect(result.load.ok).toBe(false)
    expect(result.error).toContain(LABEL)
    expect(result.error).toMatch(/line 1/i)
    expect(result.unchanged).toBe(true)
    expect(result.bodies).toBe(1)
    await expect(page.getByTestId('viewport')).toHaveAttribute('data-body-count', '1')
    assertNothingEscaped(repository)
  })

  test('a token rejected mid-session pauses auto-push with a persistent error, and does not retry', async ({
    page,
  }) => {
    const api = storeApi(page)
    const connected = await api.run(async (api, arg) => {
      await api.hosted.connect(arg)
      await api.hosted.setAutoPush(true)
      return { auto: api.hosted.autoPushEnabled, dot: api.hosted.dotState }
    }, CONNECT)
    expect(connected.auto).toBe(true)
    expect(connected.dot).toBe('in-sync')
    expect(repository.commits).toHaveLength(1) // turning it on pushes once, immediately

    repository.mode = 'unauthorized'
    const rejected = await api.run(async (api) => {
      api.documentStore.append({
        id: 'cube-9',
        op: 'primitive.cuboid',
        name: 'Cube 9',
        params: { size: [10, 10, 10], center: [0, 0, 5] },
      })
      const result = await api.hosted.saveToRemote()
      return { result, dot: api.hosted.dotState, error: api.hosted.errorMessage, conflict: api.hosted.conflictOpen }
    })
    expect(rejected.result.ok).toBe(false)
    expect(rejected.error).toMatch(/rejected this token/i)
    expect(rejected.conflict).toBe(false) // a bad token is not a conflict

    const before = repository.requests.length
    await page.waitForTimeout(2000)
    expect(repository.requests.length, 'a rejected token was retried').toBe(before)
    assertNothingEscaped(repository)
  })

  test('a network failure is reported as retrying, with no dialog, and recovers on its own', async ({ page }) => {
    test.slow() // one real backoff interval elapses here, on purpose
    const api = storeApi(page)
    await api.run(async (api, arg) => {
      await api.hosted.connect(arg)
    }, CONNECT)

    repository.mode = 'offline'
    const offline = await api.run(async (api) => {
      await api.hosted.setAutoPush(true)
      return { dot: api.hosted.dotState, status: api.hosted.statusText, conflict: api.hosted.conflictOpen }
    })
    expect(offline.dot).toBe('paused')
    expect(offline.status).toMatch(/offline|retry/i)
    expect(offline.conflict).toBe(false) // never a dialog for a network failure

    // The first backoff step is 10 s; when the network comes back the retry lands
    // with no user action at all.
    repository.mode = 'ok'
    await expect
      .poll(async () => repository.commits.length, { timeout: 20_000, intervals: [1000] })
      .toBeGreaterThan(0)
    const recovered = await api.run(async (api) => ({ dot: api.hosted.dotState }))
    expect(recovered.dot).toBe('in-sync')
    assertNothingEscaped(repository)
  })

  test('Disconnect deletes the stored credential, and the token never appears on the page', async ({ page }) => {
    const api = storeApi(page)
    await api.run(async (api, arg) => {
      await api.hosted.connect(arg)
      await api.hosted.setAutoPush(true)
    }, CONNECT)

    const readCredential = () =>
      page.evaluate(
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

    const stored = await readCredential()
    expect(stored, 'the connection was not stored at all').not.toBeNull()
    expect(stored.owner).toBe(OWNER)

    const after = await api.run(async (api) => {
      await api.hosted.disconnect()
      return {
        connected: api.hosted.connected,
        auto: api.hosted.autoPushEnabled,
        save: await api.hosted.saveToRemote(),
      }
    })
    expect(after.connected).toBe(false)
    expect(after.auto).toBe(false)
    expect(after.save.ok).toBe(false)
    await expect.poll(readCredential).toBeNull()

    // The token is not on screen and was never logged — it is entered once and never shown again.
    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body).not.toContain('sentinel')
    expect(consoleLines.join('\n')).not.toContain(TOKEN)
    assertNothingEscaped(repository)
  })
})

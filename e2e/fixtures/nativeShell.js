// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * A fake Tauri bridge for Playwright (`TODO/build-017`): the boundary mock every native-shell
 * `*.e2e.js` spec reuses. The real `globalThis.__TAURI_INTERNALS__` is injected by the Tauri
 * webview before any page script runs, so this installs one the same way, with an `addInitScript`,
 * and backs its `invoke` with an in-memory command table. `src/native/shell.js` is the only app code
 * that reads it. It works the same in Chromium, Firefox and WebKit.
 *
 * Every call is logged in `window.__nativeShell.calls`. A command the table does not have rejects
 * with the string Tauri itself rejects with, so a spec sees the app's "not available" path.
 *
 * `TODO/ai-026`: it also stands in for the native MCP host. Tauri events work as the real bridge
 * does them (`transformCallback` + `plugin:event|listen`), so a spec can emit host messages
 * ({@link emitNativeMcp}); and `mcp_set_access`, `mcp_reply` and `mcp_rotate_token` answer as the
 * Rust host does, emitting the `status` it would. Refusing a call while access is off is the Rust
 * gate's job (`warpcad-native/src-tauri/src/mcp/gate.rs`, tested there); {@link nativeMcpCall}
 * mirrors it, so a spec can show a call after **Turn off** never reaches the page.
 *
 *     import { installNativeShell } from './fixtures/nativeShell.js'
 *     await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
 */

import { createFakeTauriFs } from '../../src/native/__fixtures__/fakeFs.js'

/**
 * @typedef {object} NativeShellOptions
 * @property {string} [platform] what `shell_info` reports as the OS (`ios`, `macos`, `android`, `windows`); default `ios`
 * @property {string} [version] what `shell_info` reports as the shell's version; default `1.13.0`
 * @property {Record<string, unknown>} [commands] further commands and the JSON each resolves with
 */

/**
 * The page side of the fake bridge. Serialised into the page with `toString()` (see
 * {@link installNativeShell}), so it must be self-contained.
 *
 * @param {Record<string, unknown>} commands the JSON command table
 * @param {typeof createFakeTauriFs} createFs the in-memory Documents folder (`TODO/io-014`)
 * @param {boolean} desktop whether the folder keeps the Mac and Windows scope, `WarpCad/` only (`TODO/io-029`)
 */
function installInPage(commands, createFs, desktop) {
  /** @type {Map<string, unknown>} */
  const table = new Map(Object.entries(commands))
  const fs = createFs({ desktop })
  /**
   * The fake Keychain (`TODO/ai-025`): account to string, in the page, so a reload starts it empty.
   * @type {Map<string, string>}
   */
  const keychain = new Map()
  /** @type {Array<{ cmd: string, args: unknown }>} */
  const calls = []
  /** Tauri event handlers (`transformCallback`) and listeners (`plugin:event|listen`). */
  /** @type {Map<number, (event: unknown) => void>} */
  const callbacks = new Map()
  /** @type {Array<{ event: string, handler: number }>} */
  const listeners = []
  let nextCallback = 1
  /** @param {string} event @param {unknown} payload */
  const emit = (event, payload) => {
    for (const listener of listeners.filter((l) => l.event === event)) callbacks.get(listener.handler)?.({ event, id: 0, payload })
  }
  /** The fake MCP host's state (`TODO/ai-026`). */
  const mcp = { lease: 'off', lan: false, connection: 'idle', token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9', expiresAt: /** @type {number | null} */ (null), nextId: 1, surface: /** @type {any} */ (null), rotations: 0, lanRefusal: /** @type {string | null} */ (null), failAccess: /** @type {string | null} */ (null) }
  /** @type {Array<{ id: number, result: any }>} */
  const replies = []
  const mcpStatus = () => ({
    type: 'status',
    access: mcp.lease === 'off' ? 'off' : 'enabled',
    expiresAt: mcp.expiresAt,
    connection: mcp.lease === 'off' ? 'idle' : mcp.connection,
    reason: mcp.lease === 'off' ? 'Live MCP access is off.' : '',
  })
  /**
   * `TODO/ai-042`: as the Rust host's `LoopbackPolicy`, a loopback client needs the token on iOS and
   * Android, not on a Mac or PC. The host says so, and then shows the token whenever it listens.
   */
  const loopbackNeedsToken = !desktop
  const mcpEndpoint = () => {
    const on = mcp.lease !== 'off'
    return {
      port: on ? 5184 : null,
      url: on ? 'http://127.0.0.1:5184/mcp' : null,
      lanUrl: on && mcp.lan ? 'http://192.168.1.20:5184/mcp' : null,
      token: on && (mcp.lan || loopbackNeedsToken) ? mcp.token : null,
      lanError: /** @type {string | null} */ (null),
      loopbackNeedsToken,
    }
  }
  const internals = {
    /**
     * @param {string} cmd
     * @param {unknown} [args]
     * @param {{ headers?: Record<string, string> }} [options]
     */
    invoke(cmd, args = {}, options = {}) {
      const binary = args instanceof ArrayBuffer || ArrayBuffer.isView(args)
      calls.push({ cmd, args: binary ? { bytes: /** @type {ArrayBufferView} */ (args).byteLength, headers: options?.headers ?? {} } : JSON.parse(JSON.stringify(args)) })
      if (table.has(cmd)) return Promise.resolve(JSON.parse(JSON.stringify(table.get(cmd))))
      if (cmd === 'plugin:event|listen') {
        listeners.push({ event: args.event, handler: args.handler })
        return Promise.resolve(args.handler)
      }
      if (cmd === 'plugin:event|unlisten') return Promise.resolve(null)
      if (cmd === 'mcp_set_access') {
        // `TODO/ai-043`: the Rust host's `Err` (no port would open) rejects with its words and sends no status.
        if (mcp.failAccess !== null) {
          const message = mcp.failAccess
          mcp.failAccess = null
          return Promise.reject(message)
        }
        mcp.lease = args.lease
        const wantsLan = args.lease !== 'off' && args.lan === true
        // `TODO/ai-043`: no Wi-Fi address, or it would not bind: the switch stays off and `lanError` says why.
        mcp.lan = wantsLan && mcp.lanRefusal === null
        if (args.surface) mcp.surface = args.surface
        mcp.expiresAt = args.lease === '15m' ? Date.now() + 15 * 60_000 : args.lease === '1h' ? Date.now() + 60 * 60_000 : null
        if (args.lease === 'off') mcp.connection = 'idle'
        setTimeout(() => emit('warpcad-mcp-host', mcpStatus()), 0)
        const endpoint = mcpEndpoint()
        if (wantsLan && mcp.lanRefusal !== null) endpoint.lanError = mcp.lanRefusal
        return Promise.resolve(endpoint)
      }
      if (cmd === 'mcp_reply') {
        replies.push({ id: args.id, result: args.result })
        return Promise.resolve(null)
      }
      if (cmd === 'mcp_rotate_token') {
        mcp.rotations += 1
        mcp.token = `${String(mcp.rotations).padStart(2, '0')}${mcp.token.slice(2)}`
        mcp.connection = 'idle'
        setTimeout(() => emit('warpcad-mcp-host', mcpStatus()), 0)
        return Promise.resolve(mcpEndpoint())
      }
      if (cmd === 'keychain_get') return Promise.resolve(keychain.get(args.account) ?? null)
      if (cmd === 'keychain_set') return Promise.resolve(void keychain.set(args.account, args.value))
      if (cmd === 'keychain_delete') return Promise.resolve(void keychain.delete(args.account))
      if (fs.handles(cmd)) return fs.invoke(cmd, args, options)
      return Promise.reject(`Command ${cmd} not found`)
    },
    /** @param {(event: unknown) => void} fn */
    transformCallback(fn) {
      const id = nextCallback++
      callbacks.set(id, fn)
      return id
    },
    /** @param {number} id */
    unregisterCallback(id) {
      callbacks.delete(id)
    },
    metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
  }
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', { configurable: true, value: internals })
  /** @type {any} */
  const testSide = window
  testSide.__nativeShell = {
    calls,
    fs,
    /** The fake Keychain's items, `{ account: value }`. */
    keychain: () => Object.fromEntries(keychain),
    /** @param {string} name @param {unknown} value */
    set: (name, value) => table.set(name, value),
    names: () => [...table.keys()].sort(),
    /** The fake MCP host (`TODO/ai-026`). */
    mcp: {
      state: () => JSON.parse(JSON.stringify(mcp)),
      replies: () => JSON.parse(JSON.stringify(replies)),
      /** @param {string} event @param {unknown} payload */
      emit,
      /** `TODO/ai-043`: the Wi-Fi switch is refused with `reason` (`null` lets it on again). @param {string | null} reason */
      refuseLan(reason) {
        mcp.lanRefusal = reason
      },
      /** `TODO/ai-043`: the next `mcp_set_access` rejects with `message`. @param {string} message */
      failAccess(message) {
        mcp.failAccess = message
      },
      /** A client connected (or `'ambiguous'`, two), as the host's status says. @param {'idle' | 'connected' | 'ambiguous'} connection */
      connection(connection) {
        mcp.connection = connection
        emit('warpcad-mcp-host', mcpStatus())
      },
      /**
       * A client's `tools/call`, as the host relays it: refused while access is off (the Rust gate),
       * else sent to the page as a `call` host message.
       *
       * @param {string} name @param {unknown} input @param {string} [request]
       */
      call(name, input, request) {
        if (mcp.lease === 'off') return { refused: `WarpCad refused ${name}: live MCP access is off. In WarpCad, open Assistant → Live MCP access and explicitly enable it, then retry.` }
        const id = mcp.nextId++
        emit('warpcad-mcp-host', { type: 'call', id, name, input, ...(request === undefined ? {} : { request }) })
        return { id }
      },
    },
  }
}

/**
 * Install the fake bridge before any app script runs. Call before `page.goto`.
 *
 * Besides the command table, the bridge answers `tauri-plugin-fs` and `tauri-plugin-dialog` from
 * an in-memory Documents folder (`src/native/__fixtures__/fakeFs.js`, `TODO/io-014`). It lives in
 * the page, so a reload starts it empty again.
 *
 * @param {import('@playwright/test').Page} page
 * @param {NativeShellOptions} [options]
 */
export async function installNativeShell(page, options = {}) {
  const table = {
    set_theme: null,
    shell_info: { platform: options.platform ?? 'ios', version: options.version ?? '1.13.0' },
    ...options.commands,
  }
  // A script string, not a function: the fake folder's source goes in with it.
  await page.addInitScript({ content: `(${installInPage.toString()})(${JSON.stringify(table)}, ${createFakeTauriFs.toString()}, ${JSON.stringify(['macos', 'windows'].includes(options.platform ?? 'ios'))})` })
}

/**
 * The commands the app has sent to the fake shell so far, in order.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
export const nativeCalls = (page) => page.evaluate(() => /** @type {any} */ (window).__nativeShell.calls.map((/** @type {{ cmd: string }} */ c) => c.cmd))

/**
 * Add or replace a command after the page has loaded.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {unknown} value the JSON the command resolves with
 */
export const setNativeCommand = (page, name, value) =>
  page.evaluate(({ name, value }) => /** @type {any} */ (window).__nativeShell.set(name, value), { name, value })

/**
 * Every file in the fake Documents folder, sorted, Documents-relative (`Exports/part.stl`).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
export const nativeDocuments = (page) => page.evaluate(() => /** @type {any} */ (window).__nativeShell.fs.documents())

/**
 * A file's text in the fake Documents folder, or `null`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} path Documents-relative
 * @returns {Promise<string | null>}
 */
export const nativeFileText = (page, path) => page.evaluate((path) => /** @type {any} */ (window).__nativeShell.fs.text(path), path)

/**
 * Put a file outside Documents (iCloud Drive) and make it the next document-picker answer.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} path an absolute path
 * @param {string} text
 */
export const queueNativePick = (page, path, text) =>
  page.evaluate(({ path, text }) => {
    const fs = /** @type {any} */ (window).__nativeShell.fs
    fs.putOutside(path, text)
    fs.queuePick(path)
  }, { path, text })

/**
 * Make the next call of a native command reject with `message`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} cmd
 * @param {string} message
 */
export const failNativeCommand = (page, cmd, message) =>
  page.evaluate(({ cmd, message }) => /** @type {any} */ (window).__nativeShell.fs.fail(cmd, message), { cmd, message })

/**
 * Every file in the fake `$APPDATA` folder (`TODO/io-015`), as `{ path: text }`. The fake lives in
 * the page and a reload empties it, so a spec that reloads reads this first and hands it to
 * {@link seedNativeAppData}: the real folder survives a relaunch; the fake does not.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, string>>}
 */
export const nativeAppData = (page) =>
  page.evaluate(() => {
    const fs = /** @type {any} */ (window).__nativeShell.fs
    return Object.fromEntries(fs.appData().map((/** @type {string} */ path) => [path, fs.appText(path)]))
  })

/**
 * Put files into the fake `$APPDATA` folder before the next page load's scripts run, as the app's
 * earlier session would have left them. Call after {@link installNativeShell}, before `page.goto` or `reload`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, string>} files `$APPDATA`-relative path → text
 */
export async function seedNativeAppData(page, files) {
  await page.addInitScript((files) => {
    const fs = /** @type {any} */ (window).__nativeShell.fs
    for (const [path, text] of Object.entries(files)) fs.putAppData(path, text)
  }, files)
}

/**
 * Every item in the fake Keychain (`TODO/ai-025`), `{ account: value }`. The fake lives in the page
 * and a reload empties it.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, string>>}
 */
export const nativeKeychain = (page) => page.evaluate(() => /** @type {any} */ (window).__nativeShell.keychain())

/**
 * Emit a Tauri event into the page as the native host would (`TODO/ai-026`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} event `warpcad-mcp-host` or `warpcad-mcp-paused`
 * @param {unknown} payload
 */
export const emitNativeMcp = (page, event, payload) =>
  page.evaluate(({ event, payload }) => /** @type {any} */ (window).__nativeShell.mcp.emit(event, payload), { event, payload })

/**
 * The fake MCP host's state: lease, Wi-Fi switch, connection, token, and the surface the page sent.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ lease: string, lan: boolean, connection: string, token: string, surface: any }>}
 */
export const nativeMcpState = (page) => page.evaluate(() => /** @type {any} */ (window).__nativeShell.mcp.state())

/**
 * Say a client connected, as the host's status would.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'idle' | 'connected' | 'ambiguous'} connection
 */
export const setNativeMcpConnection = (page, connection) =>
  page.evaluate((connection) => /** @type {any} */ (window).__nativeShell.mcp.connection(connection), connection)

/**
 * A client's `tools/call` through the fake host: `{ id }` when relayed to the page, `{ refused }`
 * when the host refuses it (access off).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {unknown} input
 * @param {string} [request]
 * @returns {Promise<{ id?: number, refused?: string }>}
 */
export const nativeMcpCall = (page, name, input, request) =>
  page.evaluate(({ name, input, request }) => /** @type {any} */ (window).__nativeShell.mcp.call(name, input, request), { name, input, request })

/**
 * Every `mcp_reply` the page sent, in order.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{ id: number, result: { content: Array<{ type: string, text?: string }>, isError?: boolean } }>>}
 */
export const nativeMcpReplies = (page) => page.evaluate(() => /** @type {any} */ (window).__nativeShell.mcp.replies())

/**
 * `TODO/ai-043`: make **Allow devices on this Wi-Fi** be refused as the Rust host refuses it (no
 * Wi-Fi address, a VPN route, a bind failure): access stays on for this device, the Wi-Fi half
 * stays off, and the endpoint's `lanError` is `reason`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} reason the host's words
 */
export const refuseNativeMcpWifi = (page, reason) =>
  page.evaluate((reason) => /** @type {any} */ (window).__nativeShell.mcp.refuseLan(reason), reason)

/**
 * `TODO/ai-043`: make the next `mcp_set_access` reject with `message`, as the Rust host's `Err` does
 * (no port would open). No status follows.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} message
 */
export const failNativeMcpAccess = (page, message) =>
  page.evaluate((message) => /** @type {any} */ (window).__nativeShell.mcp.failAccess(message), message)

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The live bridge's preview host (`docs/decisions/ai-partner.md`, Decision 11, amended 2026-11-06):
 * the same bridge as `mcp/liveBridge.js`, served by `npm run preview` from a build made with
 * `VITE_LIVE_BRIDGE=1`.
 *
 *     VITE_LIVE_BRIDGE=1 npm run build && npm run preview
 *
 * Without the flag, nothing is registered and the production bundle has no bridge code (the tab
 * side is gated on the same flag, `src/composables/useLiveBridge.js`). With it, the preview server
 * (fixed port 4173, see `vite.config.js`) serves:
 *
 * - **MCP client side**: Streamable HTTP MCP at `http://127.0.0.1:4173/mcp`, the same handler the
 *   dev host uses (`./liveHttp.js`), with the same loopback and Origin gate.
 * - **Tab side**: `GET /__warpcad_bridge/events?tab=<id>` (Server-Sent Events, one stream per tab)
 *   and `POST /__warpcad_bridge/message?tab=<id>` (the tab's messages), both the protocol in
 *   `src/ai/bridge/protocol.js` (`PREVIEW_BRIDGE_PATH`). The tab's stream is its identity; its end
 *   is `tabDisconnected`, exactly as a closed Vite socket is on the dev host.
 * - **Core**: `./bridge.js`, the same lease, origin and queue rules as the dev host.
 *
 * `WARPCAD_LIVE_BRIDGE=0 npm run preview` turns it off here too (it was a no-op on preview before
 * this file existed). Diagnostics go to Vite's logger as `warpcad live bridge: …` lines.
 *
 * @module mcp/livePreview
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { LIVE_MCP_PATH, PREVIEW_BRIDGE_PATH, PREVIEW_TAB_ID } from '../src/ai/bridge/protocol.js'
import { createBridge, createRequestGate, devAllowList } from './bridge.js'
import { liveBridgeEnabled } from './liveBridge.js'

/**
 * The marker a flagged build leaves in its output folder. The preview server mounts the bridge only
 * when it finds this file, so `npm run preview` needs no flag of its own: it serves what was built.
 * A default build empties the folder (Vite’s `emptyOutDir`), so the marker never survives into one.
 */
export const LIVE_PREVIEW_MARKER = '.live-bridge'

/** A Server-Sent Events comment every this often, so an idle stream is not cut by a proxy. */
const HEARTBEAT_MS = 20_000
/** A tab message is one call's result or one access change; anything larger is not from the tab. */
const MAX_BODY_BYTES = 64 * 1024
/** The preview port `vite.config.js` pins. Used only if the server reports no address. */
const DEFAULT_PORT = 4173

/**
 * The plugin list `vite.config.js` spreads in. The build side writes the marker only in a flagged
 * build (`VITE_LIVE_BRIDGE=1`); the preview side mounts the host when the marker is there and the
 * setting is not off (`WARPCAD_LIVE_BRIDGE=0` turns it off here too). A default build gets neither.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {import('vite').Plugin[]}
 */
export function livePreviewBridgePlugins(env = process.env) {
  const plugins = []
  if (env.VITE_LIVE_BRIDGE === '1') plugins.push(warpcadLiveBridgeMarker())
  if (liveBridgeEnabled(env.WARPCAD_LIVE_BRIDGE)) plugins.push(warpcadLivePreviewBridge())
  return plugins
}

/**
 * Writes {@link LIVE_PREVIEW_MARKER} into the output folder after a build. `apply: 'build'`, so the
 * dev server never writes it.
 *
 * @returns {import('vite').Plugin}
 */
export function warpcadLiveBridgeMarker() {
  /** @type {string} */
  let outDir = 'dist'
  return {
    name: 'warpcad-live-bridge-marker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      writeFileSync(join(outDir, LIVE_PREVIEW_MARKER), 'the WarpCad live bridge is in this build (VITE_LIVE_BRIDGE=1)\n')
    },
  }
}

/**
 * `apply: 'serve'` is what `vite preview` runs under, so this hook is reached there; `vite dev`
 * never calls `configurePreviewServer`, so the dev host and this host never both run.
 *
 * @returns {import('vite').Plugin}
 */
export function warpcadLivePreviewBridge() {
  return {
    name: 'warpcad-live-bridge-preview',
    apply: 'serve',
    configurePreviewServer(server) {
      // A build without the marker has no bridge, so the preview server mounts nothing.
      if (!existsSync(join(server.config.build.outDir, LIVE_PREVIEW_MARKER))) return
      /** @param {string} line */
      const log = (line) => server.config.logger.info(`warpcad live bridge: ${line}`, { timestamp: true })
      const bridge = createBridge({ log })
      /** @type {Map<string, { tab: { send: (message: any) => void }, res: import('node:http').ServerResponse }>} */
      const tabs = new Map()

      const port = () => {
        const address = server.httpServer?.address()
        return typeof address === 'object' && address !== null ? address.port : DEFAULT_PORT
      }
      /**
       * The same loopback Host and Origin gate `/mcp` uses (Decision 11 point 5a), applied to the
       * tab routes too, so a foreign page cannot post into a tab.
       *
       * @param {import('node:http').IncomingMessage} req
       * @returns {string | null}
       */
      const refusalFor = (req) => createRequestGate(devAllowList(port()))({ origin: req.headers.origin, host: req.headers.host })

      /** The MCP handler, loaded on first use: the SDK is installed under `mcp/`, not at the root. */
      /** @type {Promise<{ handle: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>, close: () => Promise<void> } | null> | null} */
      let httpPromise = null
      /** @returns {Promise<{ handle: Function, close: () => Promise<void> } | null>} */
      const mcpHttp = () => {
        httpPromise ??= import('./liveHttp.js')
          .then(({ createLiveHttpHandler }) => createLiveHttpHandler({ bridge, allow: () => devAllowList(port()), log }))
          .catch(() => {
            server.config.logger.warn('warpcad live bridge: off — the MCP server’s dependencies are not installed. Run `npm run mcp:install`, then restart `npm run preview`.')
            return null
          })
        return httpPromise
      }

      server.httpServer?.once('close', () => {
        bridge.close()
        // A Server-Sent Events response never ends on its own, and the HTTP server will not finish
        // closing while one is open, so end each stream here.
        for (const { res } of tabs.values()) res.end()
        tabs.clear()
        void httpPromise?.then((http) => http?.close())
      })

      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname === LIVE_MCP_PATH) {
          void mcpHttp().then((http) => {
            if (http === null) {
              res.writeHead(503, { 'content-type': 'text/plain' })
              res.end('The WarpCad live bridge is off: run `npm run mcp:install`, then restart `npm run preview`.')
              return
            }
            void http.handle(req, res)
          })
          return
        }
        if (url.pathname === `${PREVIEW_BRIDGE_PATH}/events` && req.method === 'GET') {
          if (refused(req, res)) return
          openStream(url.searchParams.get('tab'), req, res)
          return
        }
        if (url.pathname === `${PREVIEW_BRIDGE_PATH}/message` && req.method === 'POST') {
          if (refused(req, res)) return
          void acceptMessage(url.searchParams.get('tab'), req, res)
          return
        }
        next()
      })

      /**
       * @param {import('node:http').IncomingMessage} req
       * @param {import('node:http').ServerResponse} res
       * @returns {boolean} True when the request was answered with a refusal.
       */
      function refused(req, res) {
        const reason = refusalFor(req)
        if (reason === null) return false
        res.writeHead(403, { 'content-type': 'text/plain' })
        res.end(reason)
        return true
      }

      /**
       * @param {string | null} id
       * @param {import('node:http').IncomingMessage} req
       * @param {import('node:http').ServerResponse} res
       */
      function openStream(id, req, res) {
        if (id === null || !PREVIEW_TAB_ID.test(id)) {
          res.writeHead(400, { 'content-type': 'text/plain' })
          res.end('A tab id is required.')
          return
        }
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
        res.write(': open\n\n')
        /** @type {{ send: (message: any) => void }} */
        const tab = {
          send: (message) => {
            // No `event:` line: the tab's `EventSource.onmessage` receives only unnamed events.
            if (!res.writableEnded) res.write(`data: ${JSON.stringify(message)}\n\n`)
          },
        }
        // A tab id that reconnects replaces its old entry; the old stream's close then does nothing.
        tabs.set(id, { tab, res })
        const beat = setInterval(() => {
          if (!res.writableEnded) res.write(': ping\n\n')
        }, HEARTBEAT_MS)
        req.on('close', () => {
          clearInterval(beat)
          if (tabs.get(id)?.res === res) tabs.delete(id)
          bridge.tabDisconnected(tab)
        })
      }

      /**
       * @param {string | null} id
       * @param {import('node:http').IncomingMessage} req
       * @param {import('node:http').ServerResponse} res
       */
      async function acceptMessage(id, req, res) {
        const entry = id === null ? undefined : tabs.get(id)
        const type = req.headers['content-type'] ?? ''
        if (!/^application\/json\b/i.test(type)) {
          // Only a JSON body can be a tab message. A form post from another page cannot send this
          // content type without a preflight, which this server never grants.
          res.writeHead(415, { 'content-type': 'text/plain' })
          res.end('Tab messages are application/json.')
          return
        }
        if (entry === undefined) {
          res.writeHead(410, { 'content-type': 'text/plain' })
          res.end('The WarpCad tab is not connected to the live bridge. Reopen it.')
          return
        }
        let body
        try {
          body = await readBody(req)
        } catch {
          res.writeHead(413, { 'content-type': 'text/plain' })
          res.end('Tab message too large.')
          return
        }
        let data
        try {
          data = JSON.parse(body)
        } catch {
          res.writeHead(400, { 'content-type': 'text/plain' })
          res.end('Tab message is not JSON.')
          return
        }
        bridge.tabMessage(entry.tab, data)
        res.writeHead(204)
        res.end()
      }
    },
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    req.on('data', (/** @type {Buffer} */ chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too large'))
        req.resume()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

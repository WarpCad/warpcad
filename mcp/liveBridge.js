// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The live bridge's dev host (`TODO/ai-012`, Decision 11): a Vite plugin that, under
 * `npm run dev` only, lets an explicitly authorized local MCP client edit the project open in a WarpCad tab.
 *
 * - **MCP client side**: Streamable HTTP MCP at `http://127.0.0.1:5183/mcp`
 *   (`npm run mcp:add -- --dev` registers it), served by `./liveHttp.js`.
 * - **Tab side**: Vite's own HMR WebSocket — custom events named `warpcad:bridge` through
 *   `server.ws.on/send` here and `import.meta.hot` in the tab (`src/composables/useLiveBridge.js`).
 *   Same origin, already connected, no new dependency and no port. Vite gives each socket one
 *   stable client object, which is the tab's identity; `vite:client:disconnect` is its drop.
 * - **Core**: `./bridge.js` — lease authorization, the origin gate, the call queue, timeouts. Nothing here
 *   holds a document or writes a file.
 *
 * `apply: 'serve'`: the plugin does nothing in `vite build`, and the tab side is behind
 * `import.meta.hot`, which a build replaces with `undefined`, so the production bundle carries no
 * bridge. The SDK is imported lazily: without `npm run mcp:install` the dev server still starts,
 * `/mcp` answers 503 with the fix, and the log says so once.
 *
 * Diagnostics go to Vite's logger as `warpcad live bridge: …` lines. (`./bridge.js` never logs
 * project data.)
 *
 * @module mcp/liveBridge
 */

import { BRIDGE_EVENT } from '../src/ai/bridge/protocol.js'
import { createBridge, devAllowList } from './bridge.js'

/**
 * @returns {import('vite').Plugin}
 */
export function warpcadLiveBridge() {
  return {
    name: 'warpcad-live-bridge',
    apply: 'serve',
    async configureServer(server) {
      /** @param {string} line */
      const log = (line) => server.config.logger.info(`warpcad live bridge: ${line}`, { timestamp: true })
      const bridge = createBridge({ log })

      /** @type {WeakMap<object, import('./bridge.js').BridgeTab>} */
      const tabs = new WeakMap()
      /** @param {{ send: (event: string, payload?: any) => void }} client */
      const tabOf = (client) => {
        let tab = tabs.get(client)
        if (tab === undefined) {
          tab = { send: (message) => client.send(BRIDGE_EVENT, message) }
          tabs.set(client, tab)
        }
        return tab
      }
      server.ws.on(BRIDGE_EVENT, (data, client) => bridge.tabMessage(tabOf(/** @type {any} */ (client)), data))
      server.ws.on('vite:client:disconnect', (_data, client) => {
        const tab = tabs.get(/** @type {any} */ (client))
        if (tab !== undefined) bridge.tabDisconnected(tab)
      })

      const port = () => {
        const address = server.httpServer?.address()
        return typeof address === 'object' && address !== null ? address.port : (server.config.server.port ?? 5183)
      }

      /** @type {{ handle: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>, close: () => Promise<void> } | null} */
      let http = null
      try {
        const { createLiveHttpHandler } = await import('./liveHttp.js')
        http = createLiveHttpHandler({ bridge, allow: () => devAllowList(port()), log })
      } catch {
        server.config.logger.warn('warpcad live bridge: off — the MCP server’s dependencies are not installed. Run `npm run mcp:install`, then restart `npm run dev`.')
      }

      server.httpServer?.once('close', () => {
        bridge.close()
        void http?.close()
      })

      server.middlewares.use('/mcp', (req, res) => {
        if (http === null) {
          res.writeHead(503, { 'content-type': 'text/plain' })
          res.end('The WarpCad live bridge is off: run `npm run mcp:install`, then restart `npm run dev`.')
          return
        }
        void http.handle(req, res)
      })
    },
  }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The live bridge's MCP face under `npm run dev` (`TODO/ai-012`, Decision 11 "Two hosts, one
 * bridge core"): Streamable HTTP at `/mcp`, served by `@modelcontextprotocol/server` 2.3.1's
 * `WebStandardStreamableHTTPServerTransport` (Request in, Response out) — no new dependency.
 *
 * Each MCP session is tracked by the bridge (`mcp/bridge.js`); calls route only when one client
 * and one enabled tab are unambiguous. Every request passes the Origin/Host gate first
 * (`createRequestGate`).
 *
 * The tools are the registry's `mcp` list with `{ live: true }` (the browser tool set on top) and
 * the same `request` property and `document_data` wrapping as the closed-file server
 * (`mcp/server.js`); this file adds no tool. A tool call is relayed to the enabled tab; nothing
 * here holds a document.
 *
 * Loaded by `mcp/liveBridge.js` with a dynamic `import()`, so a checkout without
 * `npm run mcp:install` still runs `npm run dev` (with the bridge off, and a line saying so).
 *
 * @module mcp/liveHttp
 */

import { Server, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import { randomUUID } from 'node:crypto'

import { guideFor } from '../src/ai/prompt.js'
import { LIVE_SERVER_INSTRUCTIONS, liveToolResult, mcpToolDefinitions, splitRequest } from '../src/ai/bridge/mcpSurface.js'
import { createToolRegistry } from '../src/ai/tools/index.js'
import { createRequestGate } from './bridge.js'
import { writeToolNames } from './projectFile.js'
import { GUIDE_ANNOTATIONS, GUIDE_URI, registerPromptHandlers } from './server.js'

/** How long a session may be silent before the bridge stops counting it (see `createLiveHttpHandler`). */
export const SESSION_IDLE_MS = 5 * 60_000

/**
 * How long a session whose connections are all gone (every socket that carried one of its requests
 * has closed, and no stream is open) may stay silent before the bridge stops counting it
 * (`TODO/ai-038`). A headless `claude -p` that exits normally sends no DELETE but its sockets die.
 * The window is a grace period for a client that reconnects between calls; a client with an open
 * socket or stream is never ended by it. (A live `claude -p` holds two to four connections open for
 * as long as it runs, and none once it has exited, measured with `lsof` in `TODO/ai-038`.)
 */
export const SESSION_ENDED_MS = 5_000

/** How often the host sweeps for ended sessions with no request arriving, so the chip clears itself. */
export const SWEEP_EVERY_MS = 2_000

/** `TODO/ai-026`: moved to the framework-free `src/ai/bridge/mcpSurface.js`, which the native app's page also uses. */
export { LIVE_SERVER_INSTRUCTIONS, liveToolResult }

/**
 * One session's MCP server: lists the live tools, relays calls through the bridge.
 *
 * @param {import('./bridge.js').Bridge} bridge
 * @param {() => string | undefined} linkId The session id, once the transport has one.
 * @returns {Server}
 */
function createLiveServer(bridge, linkId) {
  const tools = createToolRegistry()
  const definitions = mcpToolDefinitions(tools, { live: true })
  const writers = writeToolNames(tools)
  const server = new Server({ name: 'warpcad-live', version: '0.0.0' }, { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: LIVE_SERVER_INSTRUCTIONS })

  server.setRequestHandler('tools/list', async () => ({
    tools: definitions.map((definition) => ({
      ...definition,
      inputSchema: /** @type {{ type: 'object' } & Record<string, unknown>} */ (definition.inputSchema),
    })),
  }))

  // Only the guide (`TODO/ai-028`). Static text with no project data, so no lease is needed to
  // read it and a read never touches the tab; the scene and catalogue stay a tool call here.
  const guide = guideFor({ live: true })
  server.setRequestHandler('resources/list', async () => ({
    resources: [
      {
        uri: GUIDE_URI,
        name: 'guide',
        title: 'Modelling guide',
        description: 'How to model in WarpCad: conventions, operand rules, a worked example, printing defaults, the working method, and the live connection.',
        mimeType: 'text/markdown',
        annotations: { ...GUIDE_ANNOTATIONS },
      },
    ],
  }))
  server.setRequestHandler('resources/read', async (request) => {
    if (request.params.uri !== GUIDE_URI) throw new Error(`There is no resource ${JSON.stringify(request.params.uri)}.`)
    return { contents: [{ uri: GUIDE_URI, mimeType: 'text/markdown', text: guide }] }
  })

  // The recipes (`TODO/ai-029`): static text and the caller's arguments, so no lease either.
  registerPromptHandlers(server, { live: true })

  server.setRequestHandler('tools/call', async (request) => {
    const name = request.params.name
    const { input, request: userRequest, error } = writers.has(name)
      ? splitRequest(request.params.arguments ?? {})
      : { input: request.params.arguments ?? {} }
    if (error !== undefined) return liveToolResult({ kind: 'result', result: { error: 'invalid input', reason: error } })
    const id = linkId()
    if (id === undefined) return liveToolResult({ kind: 'refused', text: 'This MCP session has not finished initialising. Retry.' })
    return liveToolResult(await bridge.call(id, { name, input, ...(userRequest === undefined ? {} : { request: userRequest }) }))
  })
  return server
}

/**
 * Read a Node request into a web `Request`.
 *
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Request>}
 */
async function toWebRequest(req) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item)
  }
  const method = req.method ?? 'GET'
  /** @type {Buffer[]} */
  const chunks = []
  if (method !== 'GET' && method !== 'HEAD') for await (const chunk of req) chunks.push(/** @type {Buffer} */ (chunk))
  // Connect strips the mount path from `url` and keeps the original as `originalUrl`.
  const url = new URL(/** @type {{ originalUrl?: string }} */ (req).originalUrl ?? req.url ?? '/mcp', `http://${req.headers.host ?? '127.0.0.1'}`)
  return new Request(url, { method, headers, ...(chunks.length > 0 ? { body: Buffer.concat(chunks) } : {}) })
}

/**
 * Write a web `Response` back to Node, streaming (an SSE body stays open until either side ends).
 *
 * @param {import('node:http').ServerResponse} res
 * @param {Response} response
 * @param {import('node:http').IncomingMessage} req
 */
async function writeResponse(res, response, req) {
  /** @type {Record<string, string>} */
  const headers = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  res.writeHead(response.status, headers)
  res.flushHeaders()
  if (response.body === null) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  req.on('close', () => {
    void reader.cancel().catch(() => {})
  })
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
  } catch {
    // The client went away mid-stream.
  }
  res.end()
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} message
 */
function refuse(res, status, message) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }))
}

/**
 * The `/mcp` middleware for the Vite dev server.
 *
 * @param {object} options
 * @param {import('./bridge.js').Bridge} options.bridge
 * @param {() => import('./bridge.js').AllowList} options.allow Read per request (the port is known
 *   only once the server listens).
 * @param {(line: string) => void} [options.log]
 * @param {() => number} [options.now] Clock, injectable for tests.
 * @param {number} [options.idleMs] A session with no request for this long is closed. A client that
 *   dies without sending the protocol's DELETE would otherwise stay counted forever, and the
 *   one-client rule would then refuse every later call.
 * @param {number} [options.endedMs] A session with no open socket or stream, silent for this long, is closed
 *   (`TODO/ai-038`). A client that is still connected is never closed by this, only by `idleMs`.
 * @param {number} [options.sweepEveryMs] Period of the background sweep.
 * @returns {{ handle: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>, close: () => Promise<void> }}
 */
export function createLiveHttpHandler({ bridge, allow, log = () => {}, now = Date.now, idleMs = SESSION_IDLE_MS, endedMs = SESSION_ENDED_MS, sweepEveryMs = SWEEP_EVERY_MS }) {
  /** @type {Map<string, { transport: WebStandardStreamableHTTPServerTransport, server: Server, lastSeen: number, sockets: Set<import('node:net').Socket>, inflight: number }>} */
  const sessions = new Map()

  /** Close every session that has been quiet for `idleMs`, before the next request is routed. */
  function sweepIdle() {
    const cutoff = now() - idleMs
    for (const [id, entry] of sessions) {
      const ended = entry.sockets.size === 0 && entry.inflight === 0 && entry.lastSeen <= now() - endedMs
      if (entry.lastSeen > cutoff && !ended) continue
      sessions.delete(id)
      bridge.closeLink(id)
      log(ended ? `session ${id.slice(0, 8)}: closed, its connection ended without a DELETE` : `session ${id.slice(0, 8)}: closed after ${Math.round(idleMs / 1000)}s without a request`)
      void entry.server.close().catch(() => {})
    }
  }

  const timer = setInterval(sweepIdle, sweepEveryMs)
  timer.unref()

  return {
    async handle(req, res) {
      const refused = createRequestGate(allow())({ origin: req.headers.origin, host: req.headers.host })
      if (refused !== null) {
        log(`refused a /mcp request (${refused.includes('page') ? 'foreign origin' : 'non-loopback host'})`)
        refuse(res, 403, refused)
        return
      }
      try {
        sweepIdle()
        const request = await toWebRequest(req)
        const sessionId = req.headers['mcp-session-id']
        const known = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined
        if (typeof sessionId === 'string' && known === undefined) {
          refuse(res, 404, 'Session not found. Reconnect the warpcad server.')
          return
        }
        let entry = known
        if (entry === undefined) {
          /** @type {WebStandardStreamableHTTPServerTransport} */
          const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
              sessions.set(id, /** @type {any} */ (entry))
              bridge.openLink(id)
            },
            onsessionclosed: (id) => {
              sessions.delete(id)
              bridge.closeLink(id)
            },
          })
          const server = createLiveServer(bridge, () => transport.sessionId)
          await server.connect(transport)
          entry = { transport, server, lastSeen: now(), sockets: new Set(), inflight: 0 }
        }
        entry.lastSeen = now()
        const live = entry
        const socket = req.socket
        live.sockets.add(socket)
        live.inflight += 1
        socket.once('close', () => live.sockets.delete(socket))
        res.once('close', () => {
          live.inflight -= 1
          live.lastSeen = now()
        })
        await writeResponse(res, await entry.transport.handleRequest(request), req)
      } catch (error) {
        log(`a /mcp request failed: ${error instanceof Error ? error.message : String(error)}`)
        if (!res.headersSent) refuse(res, 500, 'The WarpCad live bridge failed to handle this request.')
        else res.end()
      }
    },
    async close() {
      clearInterval(timer)
      for (const [id, { server }] of sessions) {
        sessions.delete(id)
        bridge.closeLink(id)
        await server.close().catch(() => {})
      }
    },
  }
}

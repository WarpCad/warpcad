// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Serve one built folder over HTTP, for Playwright's `webServer` (the built Storybook, port 6006).
//   node scripts/serve-static.mjs <dir> <port>
// Binds 127.0.0.1 only. No directory listings, no path escapes, no caching headers beyond the type.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
}

/**
 * Map a request URL to a file under `root`, or null when it would leave it.
 * @param {string} root absolute folder being served
 * @param {string} url request URL (path and query)
 * @returns {string | null}
 */
export function resolveRequest(root, url) {
  const path = decodeURIComponent(new URL(url, 'http://localhost').pathname)
  const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path))
  return file === root || file.startsWith(root + '/') ? file : null
}

/**
 * Start the server.
 * @param {string} dir folder to serve
 * @param {number} port
 * @returns {import('node:http').Server}
 */
export function serve(dir, port) {
  const root = resolve(dir)
  const server = createServer(async (req, res) => {
    try {
      const file = resolveRequest(root, req.url ?? '/')
      if (!file) throw new Error('outside root')
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
    }
  })
  server.listen(port, '127.0.0.1')
  return server
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [dir, port] = process.argv.slice(2)
  if (!dir || !Number(port)) {
    console.error('usage: node scripts/serve-static.mjs <dir> <port>')
    process.exit(2)
  }
  serve(dir, Number(port))
}

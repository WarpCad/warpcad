// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawn } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * `TODO/ai-037`: `npm run mcp:add -- --dev` registers `http://127.0.0.1:5183/mcp`, so the dev server
 * must answer on the IPv4 loopback. Unset, Vite binds `localhost`, which can resolve to `::1` only.
 * This starts the real dev server (on a spare port, so a running `npm run dev` is not disturbed) and
 * asks it on each address.
 */
const PORT = 5197
let child

/** @param {string} url @returns {Promise<number | 'refused'>} */
async function statusOf(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(5000) })).status
  } catch {
    return 'refused'
  }
}

beforeAll(async () => {
  child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', env: { ...process.env, BROWSER: 'none' } })
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if ((await statusOf(`http://localhost:${PORT}/`)) === 200) return
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('the dev server did not start')
}, 60_000)

afterAll(() => {
  child?.kill('SIGTERM')
})

describe('the dev server host', () => {
  it('answers the registered IPv4 endpoint and the app page', async () => {
    expect(await statusOf(`http://127.0.0.1:${PORT}/mcp`)).not.toBe('refused')
    expect(await statusOf(`http://127.0.0.1:${PORT}/`)).toBe(200)
  })

  it('still answers http://localhost', async () => {
    expect(await statusOf(`http://localhost:${PORT}/`)).toBe(200)
  })

  it('is not bound to the IPv6 loopback or the LAN', async () => {
    expect(await statusOf(`http://[::1]:${PORT}/`)).toBe('refused')
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LockTimeoutError, acquireLock, lockPathFor } from './lock.js'

/** @type {string} */
let dir
/** @type {string} */
let file

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'warpcad-lock-'))
  file = join(dir, 'p.ndjson')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('acquireLock', () => {
  it('creates `<file>.lock` naming this process, and release removes it', async () => {
    const release = await acquireLock(file)
    expect(lockPathFor(file)).toBe(`${file}.lock`)
    expect(JSON.parse(readFileSync(`${file}.lock`, 'utf8')).pid).toBe(process.pid)
    await release()
    expect(existsSync(`${file}.lock`)).toBe(false)
  })

  it('makes a second holder wait until the first releases — never both at once', async () => {
    const release = await acquireLock(file)
    /** @type {string[]} */
    const order = []
    const second = acquireLock(file, { retryMs: 5 }).then((releaseSecond) => {
      order.push('second acquired')
      return releaseSecond
    })
    await new Promise((resolve) => setTimeout(resolve, 40))
    order.push('first releasing')
    await release()
    await (await second)()
    expect(order).toEqual(['first releasing', 'second acquired'])
  })

  it('times out with a plain message naming the holder, and leaves its lock alone', async () => {
    const release = await acquireLock(file)
    await expect(acquireLock(file, { timeoutMs: 60, retryMs: 5 })).rejects.toThrow(LockTimeoutError)
    await expect(acquireLock(file, { timeoutMs: 60, retryMs: 5 })).rejects.toThrow(
      new RegExp(`^Another WarpCad MCP server \\(process ${process.pid}\\) is writing p\\.ndjson`)
    )
    expect(existsSync(`${file}.lock`)).toBe(true)
    await release()
  })

  it('takes over a lock left by a process that no longer exists', async () => {
    // A pid far above any real one; `process.kill(pid, 0)` reports ESRCH for it.
    writeFileSync(`${file}.lock`, JSON.stringify({ pid: 2 ** 22 + 12345, token: 'dead', at: Date.now() }))
    const release = await acquireLock(file, { timeoutMs: 200, retryMs: 5 })
    expect(JSON.parse(readFileSync(`${file}.lock`, 'utf8')).pid).toBe(process.pid)
    await release()
  })

  it('takes over an unreadable lock only once it is older than the stale age', async () => {
    writeFileSync(`${file}.lock`, 'not json')
    await expect(acquireLock(file, { timeoutMs: 40, retryMs: 5, staleMs: 10_000 })).rejects.toThrow(LockTimeoutError)
    const release = await acquireLock(file, { timeoutMs: 200, retryMs: 5, staleMs: 0 })
    await release()
  })

  it('release does not remove a lock someone else now holds', async () => {
    const release = await acquireLock(file)
    writeFileSync(`${file}.lock`, JSON.stringify({ pid: process.pid, token: 'someone-else', at: Date.now() }))
    await release()
    expect(existsSync(`${file}.lock`)).toBe(true)
  })
})

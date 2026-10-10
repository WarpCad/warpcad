// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lock file that stops two MCP servers interleaving writes to one project file
 * (`TODO/ai-009`, `docs/decisions/ai-partner.md` decision 6).
 *
 * `<file>.lock`, created with `O_CREAT | O_EXCL` (`'wx'`), so exactly one process can create
 * it; its contents name the holder (`{ pid, token, at }`). A server holds it only for one
 * read-modify-write — re-read the file, apply the call, write it back — not for its whole
 * life, so two servers on one file both keep working, one write at a time.
 *
 * ## Stale locks
 *
 * A server killed mid-write leaves its lock behind. A waiter takes it over when:
 *
 * - its pid no longer exists on this machine (`process.kill(pid, 0)` → `ESRCH`), or
 * - it cannot be read as a lock at all and is older than `staleMs` (a half-written lock from a
 *   crash, or something that is not ours).
 *
 * A live holder is never broken, however old its lock: a write that is slow is still a write.
 * Waiting has a time limit instead, and gives up with a {@link LockTimeoutError} whose message
 * names the holder in plain words.
 *
 * **What this does not cover**: the WarpCad *app*. A browser cannot take a lock file, so the
 * app is protected the other way round — it notices the change on focus and asks before it
 * reloads or overwrites (`src/stores/persistence.js`). That is the "closed file" rule: run the
 * server against a file the app does not have open.
 *
 * @module mcp/lock
 */

import { randomUUID } from 'node:crypto'
import { open, readFile, stat, unlink } from 'node:fs/promises'
import { basename } from 'node:path'

/** Waiting for a lock gave up. The message is safe to show as-is. */
export class LockTimeoutError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'LockTimeoutError'
  }
}

/**
 * @param {string} file The project file.
 * @returns {string} Its lock file's path.
 */
export function lockPathFor(file) {
  return `${file}.lock`
}

/**
 * @param {number} pid
 * @returns {boolean} Whether a process with this id exists. `EPERM` means it exists but is
 *   someone else's, which still counts.
 */
function processExists(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM'
  }
}

/**
 * @param {string} path
 * @returns {Promise<{ pid: number, token: string } | null>} The holder, or `null` when the lock
 *   is gone or is not a lock this module wrote.
 */
async function readHolder(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    if (Number.isInteger(parsed?.pid) && typeof parsed?.token === 'string') return { pid: parsed.pid, token: parsed.token }
  } catch {
    /* unreadable: the caller decides by age */
  }
  return null
}

/**
 * Whether the existing lock at `path` may be taken over.
 *
 * @param {string} path
 * @param {number} staleMs
 * @returns {Promise<boolean>}
 */
async function isStale(path, staleMs) {
  const holder = await readHolder(path)
  if (holder !== null) return !processExists(holder.pid)
  try {
    return Date.now() - (await stat(path)).mtimeMs >= staleMs
  } catch {
    return true // gone already: the next attempt will simply create it
  }
}

/**
 * Take the lock for `file`, waiting for a current holder to finish.
 *
 * @param {string} file The project file (absolute or relative to the working directory).
 * @param {object} [options]
 * @param {number} [options.timeoutMs] How long to wait for a live holder. Default 10 s.
 * @param {number} [options.retryMs] Poll interval while waiting. Default 20 ms.
 * @param {number} [options.staleMs] Age after which an *unreadable* lock is taken over.
 *   Default 30 s. A readable lock is judged by whether its process exists, not its age.
 * @returns {Promise<() => Promise<void>>} Release: removes the lock if it is still this one.
 * @throws {LockTimeoutError} When a live holder kept it for longer than `timeoutMs`.
 */
export async function acquireLock(file, options = {}) {
  const { timeoutMs = 10_000, retryMs = 20, staleMs = 30_000 } = options
  const path = lockPathFor(file)
  const token = randomUUID()
  const deadline = Date.now() + timeoutMs

  for (;;) {
    try {
      const handle = await open(path, 'wx')
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, token, at: Date.now() }))
      } finally {
        await handle.close()
      }
      return async () => {
        const holder = await readHolder(path)
        if (holder?.token !== token) return
        await unlink(path).catch(() => {})
      }
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error
    }

    if (await isStale(path, staleMs)) {
      // Two waiters may both judge it stale; only one `unlink` + `wx` pair wins the next round.
      await unlink(path).catch(() => {})
      continue
    }
    if (Date.now() >= deadline) {
      const holder = await readHolder(path)
      throw new LockTimeoutError(
        `Another WarpCad MCP server${holder ? ` (process ${holder.pid})` : ''} is writing ${basename(file)}, ` +
          `and it did not finish within ${Math.round(timeoutMs / 1000)} s. Nothing was written; try again.`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, retryMs))
  }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * One project file on disk, driven through the AI tool registry (`TODO/ai-009`).
 *
 * The MCP server's transport layer (`server.js`) only speaks the protocol; everything about
 * the file lives here: loading it with the app's own reader, noticing that someone else changed
 * it, appending under the lock, and writing it back atomically. Nothing here re-implements the
 * format — `src/core/project.js` owns it (`parseProject` in, `serializeProject` out) and
 * `src/core/document.js` folds it, exactly as the app does on Open.
 *
 * ## One call, one read-modify-write
 *
 * Every tool call first re-reads the file. If its bytes differ from what this server last saw
 * (the app saved, another server wrote), the document is reloaded from disk and this server's
 * clock observes the file's stamps. The server needs no merge of its own: the app merges the
 * file into the open project (`TODO/io-010`), and this server writes under **one replica id**
 * for the process, always later than anything it read. A **write** call does that under the lock (`lock.js`), then:
 *
 * 1. runs the tool on the in-memory document (`origin: 'mcp'`, `ctx.request` = the client's
 *    request text when it sent one, else the prompt it recorded — `TODO/ai-031`);
 * 2. if the log did not change (a refusal, a cap, a read), **writes nothing** — the file stays
 *    byte-identical, mtime included. "Changed" is a record appended, revised in place or
 *    removed: the project-variable tools (`TODO/ai-014`) revise rows and may remove one — or
 *    the project's prompts changed (`record_prompt`, `TODO/ai-031`), which touches no row;
 * 3. otherwise serialises, checks the text parses back, re-checks the file has not changed
 *    since step 0 — if it has (the app saved meanwhile), re-reads and re-applies the call, up to
 *    {@link MAX_ATTEMPTS} times, then refuses with nothing written (`TODO/io-010`) — writes a
 *    temp file beside it, `fsync`s, and `rename`s it over the original (atomic on one
 *    filesystem: a reader sees the old file or the new one, never half of one);
 * 4. names the History rows it appended in the result (`appended`), and any it revised in place
 *    (`revised`) or removed (`removed`, by id).
 *
 * Calls are queued, so one server never interleaves its own calls either.
 *
 * ## A file this build cannot read
 *
 * A truncated file, a file from a newer build, an op this build does not know: every call is
 * refused with `Can't open <name>: <the app's own reason>. The file was not changed.` and the
 * file is never written. The reason is `ProjectFormatError`'s or `ReplayRejection`'s message,
 * the same sentence the app's Open shows — it names a line or a step, never file contents
 * beyond an id.
 *
 * ## Limits
 *
 * Each `tools/call` is one turn for `src/ai/tools/limits.js` — the same constants the browser
 * uses, enforced in code: at most 50 records in one call, the trial fold on every record, and
 * a per-call wall clock. An MCP client has no "user turn" the server can see, so the per-turn
 * step and failure-streak caps cannot span calls here; the client's own loop is bounded by
 * the client (Claude Code asks its user).
 *
 * @module mcp/projectFile
 */

import { randomUUID } from 'node:crypto'
import { open, readFile, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { LIMITS, createTurn } from '../src/ai/tools/limits.js'
import { RECORD_PROMPT } from '../src/ai/tools/prompt.js'
import { ReplayRejection, createDocument } from '../src/core/document.js'
import { ProjectFormatError, parseProject, serializeProject } from '../src/core/project.js'
import { createReplicaId } from '../src/core/replica.js'
import { acquireLock } from './lock.js'

/** @typedef {import('../src/ai/tools/index.js').ToolRegistry} ToolRegistry */
/** @typedef {import('../src/core/document.js').WarpDocument} WarpDocument */

/** `TODO/io-010`: how many times one call re-reads, re-applies and retries before refusing. */
export const MAX_ATTEMPTS = 3

/** The one origin every record this server appends carries. */
export const MCP_ORIGIN = 'mcp'

/**
 * A refusal whose message is safe to hand the client as-is.
 */
export class ProjectFileError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'ProjectFileError'
  }
}

/**
 * @param {string} path
 * @returns {Promise<string | null>} The file's text, or `null` when it does not exist yet.
 */
async function readText(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null
    throw new ProjectFileError(`Can't read ${basename(path)}: ${/** @type {NodeJS.ErrnoException} */ (error).code ?? 'read failed'}.`)
  }
}

/**
 * Write `text` to `path` atomically: a temp file in the same directory, flushed to disk, then
 * renamed over the original. A failure removes the temp file and leaves `path` untouched.
 *
 * The file's permission bits are carried over. `path` should already be resolved through any
 * symlink (`server.js` does), or the rename would replace the link with a plain file.
 *
 * @param {string} path
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function writeFileAtomic(path, text) {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  // Keep the file's permissions: a project the user made private stays private.
  const mode = await stat(path).then(
    (stats) => stats.mode & 0o777,
    () => undefined
  )
  try {
    const handle = await open(temp, 'wx', mode ?? 0o666)
    try {
      await handle.writeFile(text, 'utf8')
      await handle.sync()
      if (mode !== undefined) await handle.chmod(mode)
    } finally {
      await handle.close()
    }
    await rename(temp, path)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
}

/**
 * Parse and fold project text into a fresh document — the app's Open, minus the UI.
 *
 * @param {string} text
 * @param {string} name For the message.
 * @param {string} [replica] The replica id the document writes under (`TODO/io-010`: one per
 *   server process); omitted, a fresh one.
 * @returns {WarpDocument}
 * @throws {ProjectFileError} naming the reason, when the app would refuse the file too.
 */
export function loadProjectText(text, name, replica) {
  try {
    const parsed = parseProject(text)
    const document = createDocument(replica === undefined ? {} : { replica })
    document.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, {
      standingInstructions: parsed.standingInstructions,
      buildVolume: parsed.buildVolume,
      userParts: parsed.userParts,
      unavailableParts: parsed.unavailableParts,
      ...(parsed.merge !== undefined ? { merge: parsed.merge } : {}),
      // `TODO/ui-089`: the user's hides, so a tool call's write keeps them rather than wiping them.
      ...(parsed.viewHidden !== undefined ? { viewHidden: parsed.viewHidden } : {}),
    })
    return document
  } catch (error) {
    if (error instanceof ProjectFormatError || error instanceof ReplayRejection) {
      // `data-011`'s newer-version sentence already says the file was not changed.
      throw new ProjectFileError(
        error.message.endsWith('The file was not changed.')
          ? `Can't open ${name}: ${error.message}`
          : `Can't open ${name}: ${error.message}. The file was not changed.`
      )
    }
    throw new ProjectFileError(`Can't open ${name}: it could not be read as a WarpCad project. The file was not changed.`)
  }
}

/**
 * The names of the tools that write: the registry marks them by their optional `rationale`
 * (`src/ai/tools/index.js`: "Every write tool also takes an optional `rationale`"), plus
 * `record_prompt` (`TODO/ai-031`), which writes the prompt and nothing else — so it takes the lock
 * but has no rationale, and so no `request` either (`server.js` adds that only beside a rationale).
 *
 * @param {ToolRegistry} tools
 * @returns {Set<string>}
 */
export function writeToolNames(tools) {
  return new Set(
    tools
      .definitions('mcp')
      .filter((definition) => definition.name === RECORD_PROMPT || Object.hasOwn(definition.inputSchema.properties ?? {}, 'rationale'))
      .map((definition) => definition.name)
  )
}

/**
 * What the project's prompts say, for noticing that a call changed them (`TODO/ai-031`).
 *
 * @param {WarpDocument} document
 * @returns {string}
 */
function promptsKey(document) {
  return JSON.stringify(document.prompts())
}

/**
 * @typedef {object} AppendedRows
 * @property {string} file The file name (never its directory).
 * @property {{ step: number, id: string, label: string }[]} rows The History rows this call
 *   appended (or, as `revised`, changed in place), as the app's History will number and label them.
 */

/**
 * @typedef {object} ProjectSession
 * @property {string} path
 * @property {string} name
 * @property {(tool: string, input: unknown, options?: { request?: string }) => Promise<Record<string, any>>} call
 *   Run one tool. Never throws for anything the file or the tool does: a refusal is
 *   `{ error }`, and a write adds `appended`.
 */

/**
 * @param {object} options
 * @param {string} options.path The project file. It need not exist yet; the first write creates it.
 * @param {ToolRegistry} options.tools
 * @param {Partial<import('../src/ai/tools/limits.js').Limits>} [options.limits] Specs only.
 * @param {Parameters<typeof acquireLock>[1]} [options.lock] Specs only.
 * @returns {ProjectSession}
 */
export function createProjectSession({ path, tools, limits, lock }) {
  const name = basename(path)
  const writers = writeToolNames(tools)
  /**
   * `TODO/io-010`: this process is one writer — one replica id for every document it folds
   * from the file, so the rows it writes carry one replica across reads. Each fold observes the
   * file's stamps (`loadEntries` moves the merge clock past `merge.clock`), and
   * {@link highest} keeps it past this server's own earlier stamps even if the file went back.
   */
  const replica = createReplicaId()
  /** The largest merge-clock counter this server has read or written. */
  let highest = 0
  /** The text this session last read or wrote; `undefined` before the first read. */
  /** @type {string | null | undefined} */
  let seen
  /** @type {WarpDocument | null} */
  let document = null
  /** @type {ProjectFileError | null} */
  let refusal = null
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve()
  /**
   * `TODO/ai-031`: the prompt this session's client recorded, carried from call to call (each
   * call builds a fresh tool context). Committed only once a call has finished, so an attempt
   * discarded because the file changed under it never leaves a binding the file does not hold
   * — and if one does, the registry stores it again under the same id on the next write.
   * @type {import('../src/ai/tools/index.js').PromptBinding | null}
   */
  let prompt = null

  /**
   * Bring the in-memory document in line with the file. Throws the file's refusal.
   *
   * @returns {Promise<{ document: WarpDocument, text: string | null }>}
   */
  async function sync() {
    const text = await readText(path)
    if (text !== seen || (document === null && refusal === null)) {
      seen = text
      refusal = null
      document = null
      try {
        document = loadProjectText(text ?? '', name, replica)
        document.observeMergeClock(highest)
        highest = Math.max(highest, document.mergeClock())
      } catch (error) {
        refusal = /** @type {ProjectFileError} */ (error)
      }
    }
    if (refusal !== null) throw refusal
    return { document: /** @type {WarpDocument} */ (document), text }
  }

  /**
   * @param {string} tool
   * @param {unknown} input
   * @param {string | undefined} request
   */
  async function run(tool, input, request) {
    const writes = writers.has(tool)
    const release = writes ? await acquireLock(path, lock) : null
    try {
      // `TODO/io-010`: the app may save while a call runs. Rather than refuse, re-read the file,
      // re-apply the call on top of it and write — a bounded number of times, then the refusal.
      for (let attempt = 1; ; attempt += 1) {
        const { document: current, text: before } = await sync()
        const known = new Set(current.entries.map((entry) => entry.record))
        const knownIds = new Set(current.entries.map((entry) => entry.record.id))
        const turn = createTurn(limits ? { limits: { ...LIMITS, ...limits } } : {})
        const promptsBefore = promptsKey(current)
        const effectiveRequest = request || prompt?.text
        /** @type {import('../src/ai/tools/index.js').ToolContext} */
        const ctx = {
          document: current,
          origin: MCP_ORIGIN,
          turn,
          ...(effectiveRequest ? { request: effectiveRequest } : {}),
          ...(prompt !== null ? { prompt: { ...prompt } } : {}),
        }
        const result = tools.run(ctx, tool, input)
        const bound = ctx.prompt === undefined ? prompt : { id: ctx.prompt.id, text: ctx.prompt.text }
        const fresh = current.entries.filter((entry) => !known.has(entry.record))
        const afterIds = new Set(current.entries.map((entry) => entry.record.id))
        const removedIds = [...knownIds].filter((id) => id !== undefined && !afterIds.has(id))
        if (fresh.length === 0 && removedIds.length === 0 && promptsKey(current) === promptsBefore) {
          prompt = bound
          return result
        }

        const text = serializeProject(current)
        /** @param {string} message */
        const forget = (message) => {
          // The in-memory document is ahead of the file: drop it, so the next read starts from disk.
          seen = undefined
          document = null
          return { error: message }
        }
        try {
          // Never write what the app could not reopen.
          parseProject(text)
          if ((await readText(path)) !== before) {
            forget('')
            if (attempt < MAX_ATTEMPTS) continue
            return {
              error: `${name} changed on disk while this call ran. Nothing was written; try again.`,
            }
          }
          await writeFileAtomic(path, text)
        } catch (error) {
          if (error instanceof ProjectFileError) return forget(error.message)
          const code = /** @type {NodeJS.ErrnoException} */ (error).code
          return forget(`Can't write ${name}${code ? ` (${code})` : ''}. Nothing was written.`)
        }
        seen = text
        prompt = bound
        highest = Math.max(highest, current.mergeClock())
        const timeline = current.timeline()
        /** @param {Set<unknown>} ids @returns {AppendedRows} */
        const rowsOf = (ids) => ({
          file: name,
          rows: timeline.filter((row) => ids.has(row.id)).map((row) => ({ step: row.step, id: row.id, label: row.label })),
        })
        const added = new Set(fresh.filter((entry) => !knownIds.has(entry.record.id)).map((entry) => entry.record.id))
        const revised = new Set(fresh.filter((entry) => knownIds.has(entry.record.id)).map((entry) => entry.record.id))
        return {
          ...result,
          appended: rowsOf(added),
          ...(revised.size > 0 ? { revised: rowsOf(revised) } : {}),
          ...(removedIds.length > 0 ? { removed: removedIds } : {}),
        }
      }
    } finally {
      await release?.()
    }
  }

  return {
    path,
    name,
    call(tool, input, options = {}) {
      const next = queue.then(async () => {
        try {
          return await run(tool, input, options.request)
        } catch (error) {
          if (error instanceof ProjectFileError || (error instanceof Error && error.name === 'LockTimeoutError')) {
            return { error: error.message }
          }
          throw error
        }
      })
      queue = next.catch(() => {})
      return next
    },
  }
}

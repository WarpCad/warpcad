// @ts-nocheck — this spec drives hand-written duck-typed fakes of browser globals (`window`,
// `indexedDB` via `idb`, the File System Access handles). Typing each fake against the full DOM
// / `idb` interfaces would be more code than the fakes; the *modules under test* are fully
// typed and checked by `npm run typecheck`, which is what the gate is for.
import { describe, expect, it, vi } from 'vitest'

import {
  ACCEPT_ATTRIBUTE,
  createFileStorage,
  formatFileStamp,
  getFileCapabilities,
  projectFileName,
} from './fileSystem.js'

/**
 * `TODO/io-001` — file Save / Open, with the capability check `ui-033` reads.
 *
 * Both paths are mocked at the boundary: a fake `env` stands in for `window`,
 * so neither a real picker nor a real download is ever triggered. The
 * **fallback path is tested first and hardest**, because `docs/decisions/
 * persistence-export.md` measured File System Access at ~31% of users, all of
 * them desktop Chromium — on every phone and tablet the fallback is the *only*
 * path, not the edge case.
 */

/** A `File`-shaped object. */
function fakeFile(name, text) {
  return { name, text: async () => text }
}

/** A minimal DOM: just enough for an `<a download>` click and a hidden `<input type=file>`. */
function fakeDom() {
  /** @type {any[]} */
  const created = []
  const body = {
    /** @type {any[]} */
    children: [],
    appendChild(node) {
      body.children.push(node)
      return node
    },
    removeChild(node) {
      body.children = body.children.filter((child) => child !== node)
      return node
    },
  }
  const document = {
    body,
    createElement(tag) {
      /** @type {Record<string, Function[]>} */
      const listeners = {}
      const node = {
        tag,
        style: {},
        files: /** @type {any[]} */ ([]),
        clicked: false,
        addEventListener(type, fn) {
          ;(listeners[type] ??= []).push(fn)
        },
        removeEventListener() {},
        fire(type) {
          for (const fn of listeners[type] ?? []) fn({ type })
        },
        click() {
          node.clicked = true
          node.onClick?.()
        },
        remove() {
          body.removeChild(node)
        },
      }
      created.push(node)
      return node
    },
  }
  return { document, created, body }
}

/** @param {object} [overrides] */
function fallbackEnv(overrides = {}) {
  const dom = fakeDom()
  const urls = { created: /** @type {any[]} */ ([]), revoked: /** @type {string[]} */ ([]) }
  const timers = /** @type {Function[]} */ ([])
  const env = {
    document: dom.document,
    Blob: class {
      constructor(parts, options) {
        this.parts = parts
        this.options = options
      }
    },
    URL: {
      createObjectURL(blob) {
        urls.created.push(blob)
        return `blob:fake/${urls.created.length}`
      },
      revokeObjectURL(url) {
        urls.revoked.push(url)
      },
    },
    setTimeout(fn) {
      timers.push(fn)
      return timers.length
    },
    ...overrides,
  }
  return { env, dom, urls, timers }
}

/** @param {object} [handleOptions] */
function nativeEnv(handleOptions = {}) {
  const written = { chunks: /** @type {string[]} */ ([]), closed: 0 }
  const handle = {
    name: handleOptions.name ?? 'chosen.ndjson',
    async createWritable() {
      return {
        async write(chunk) {
          written.chunks.push(chunk)
        },
        async close() {
          written.closed += 1
        },
      }
    },
    async getFile() {
      return fakeFile(handleOptions.name ?? 'chosen.ndjson', handleOptions.text ?? 'opened text')
    },
  }
  const showSaveFilePicker = vi.fn(async () => handle)
  const showOpenFilePicker = vi.fn(async () => [handle])
  return { env: { showSaveFilePicker, showOpenFilePicker }, handle, written, showSaveFilePicker, showOpenFilePicker }
}

describe('getFileCapabilities', () => {
  it('reports the fallback for an env with no pickers — labels honest about what it can do', () => {
    expect(getFileCapabilities({})).toEqual({
      mode: 'fallback',
      canSaveInPlace: false,
      saveLabel: 'Download copy',
      saveAsLabel: null,
      openLabel: 'Open…',
    })
  })

  it('reports native only when BOTH pickers exist', () => {
    const native = getFileCapabilities({
      showSaveFilePicker: () => {},
      showOpenFilePicker: () => {},
    })
    expect(native).toMatchObject({
      mode: 'native',
      canSaveInPlace: true,
      saveLabel: 'Save',
      saveAsLabel: 'Save As…',
    })
    expect(getFileCapabilities({ showSaveFilePicker: () => {} }).mode).toBe('fallback')
    expect(getFileCapabilities({ showOpenFilePicker: () => {} }).mode).toBe('fallback')
  })

  it('feature-detects the function, not the presence of the key — a stubbed non-function is not support', () => {
    expect(
      getFileCapabilities({ showSaveFilePicker: true, showOpenFilePicker: 'yes' }).mode,
    ).toBe('fallback')
  })
})

describe('file names', () => {
  it('formats a local timestamp as YYYYMMDD-HHMM', () => {
    expect(formatFileStamp(new Date(2026, 8, 19, 14, 2))).toBe('20260919-1402')
    expect(formatFileStamp(new Date(2026, 0, 5, 3, 7))).toBe('20260105-0307')
  })

  it('uses the plain name on the native path and a timestamped one on the fallback', () => {
    const date = new Date(2026, 8, 19, 14, 2)
    expect(projectFileName('native', date)).toBe('warpcad-project.ndjson')
    expect(projectFileName('fallback', date)).toBe('warpcad-project-20260919-1402.ndjson')
  })

  it('offers an accept list iOS will not grey the file out under', () => {
    for (const token of ['.ndjson', '.json', '.txt', 'text/plain']) {
      expect(ACCEPT_ATTRIBUTE).toContain(token)
    }
  })
})

describe('fallback Save — <a download> on a Blob (the primary path on phones and tablets)', () => {
  it('downloads the exact text under a timestamped name', async () => {
    const { env, dom, urls } = fallbackEnv()
    const storage = createFileStorage(env)
    const result = await storage.save('{"op":"a"}\n', { now: new Date(2026, 8, 19, 14, 2) })

    expect(result).toEqual({
      ok: true,
      mode: 'fallback',
      name: 'warpcad-project-20260919-1402.ndjson',
    })
    const anchor = dom.created.find((node) => node.tag === 'a')
    expect(anchor.download).toBe('warpcad-project-20260919-1402.ndjson')
    expect(anchor.href).toBe('blob:fake/1')
    expect(anchor.clicked).toBe(true)
    expect(urls.created[0].parts).toEqual(['{"op":"a"}\n'])
    expect(dom.body.children).toHaveLength(0) // the anchor cleaned itself up
  })

  it('revokes the object URL later, not synchronously (revoking at once can cancel the download)', async () => {
    const { env, urls, timers } = fallbackEnv()
    await createFileStorage(env).save('x')
    expect(urls.revoked).toEqual([])
    timers.forEach((fn) => fn())
    expect(urls.revoked).toEqual(['blob:fake/1'])
  })

  it('every save is a new download — there is no in-place Save on this path', async () => {
    const { env, dom } = fallbackEnv()
    const storage = createFileStorage(env)
    await storage.save('a')
    await storage.save('b')
    expect(dom.created.filter((node) => node.tag === 'a')).toHaveLength(2)
    expect(storage.capabilities.canSaveInPlace).toBe(false)
  })

  it('reports a failure to build the download instead of throwing', async () => {
    const { env } = fallbackEnv({
      URL: {
        createObjectURL() {
          throw new Error('blocked')
        },
        revokeObjectURL() {},
      },
    })
    const result = await createFileStorage(env).save('x')
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ error: expect.stringMatching(/blocked/) })
  })
})

describe('fallback Open — a hidden <input type=file>', () => {
  it('clicks the input synchronously, inside the caller’s user gesture', () => {
    const { env, dom } = fallbackEnv()
    // No await between the call and the click: iOS drops the picker if the gesture has lapsed.
    void createFileStorage(env).open()
    const input = dom.created.find((node) => node.tag === 'input')
    expect(input.clicked).toBe(true)
    expect(input.type).toBe('file')
    expect(input.accept).toBe(ACCEPT_ATTRIBUTE)
  })

  it('reads the chosen file’s name and text', async () => {
    const { env, dom } = fallbackEnv()
    const pending = createFileStorage(env).open()
    const input = dom.created.find((node) => node.tag === 'input')
    input.files = [fakeFile('mine.ndjson', '{"op":"a"}\n')]
    input.fire('change')
    await expect(pending).resolves.toMatchObject({ ok: true, name: 'mine.ndjson', text: '{"op":"a"}\n' })
    expect(dom.body.children).toHaveLength(0)
  })

  it('treats the dialog being dismissed as a cancel, not an error', async () => {
    const { env, dom } = fallbackEnv()
    const pending = createFileStorage(env).open()
    dom.created.find((node) => node.tag === 'input').fire('cancel')
    await expect(pending).resolves.toEqual({ ok: false, cancelled: true })
  })

  it('treats a change event with no file as a cancel', async () => {
    const { env, dom } = fallbackEnv()
    const pending = createFileStorage(env).open()
    dom.created.find((node) => node.tag === 'input').fire('change')
    await expect(pending).resolves.toEqual({ ok: false, cancelled: true })
  })

  it('reports an unreadable file by name instead of throwing', async () => {
    const { env, dom } = fallbackEnv()
    const pending = createFileStorage(env).open()
    const input = dom.created.find((node) => node.tag === 'input')
    input.files = [
      {
        name: 'locked.ndjson',
        text: async () => {
          throw new Error('NotReadableError')
        },
      },
    ]
    input.fire('change')
    const result = await pending
    expect(result).toMatchObject({ ok: false, name: 'locked.ndjson' })
    expect(/** @type {any} */ (result).error).toMatch(/NotReadableError/)
  })
})

describe('native Save / Open — File System Access (desktop Chromium only)', () => {
  it('Save As opens the picker with the suggested name and writes the text', async () => {
    const { env, written, showSaveFilePicker } = nativeEnv()
    const storage = createFileStorage(env)
    expect(storage.capabilities.mode).toBe('native')

    const result = await storage.save('the log\n', { saveAs: true })
    expect(showSaveFilePicker).toHaveBeenCalledOnce()
    expect(showSaveFilePicker.mock.calls[0][0]).toMatchObject({ suggestedName: 'warpcad-project.ndjson' })
    expect(written.chunks).toEqual(['the log\n'])
    expect(written.closed).toBe(1)
    expect(result).toEqual({ ok: true, mode: 'native', name: 'chosen.ndjson' })
  })

  it('a second Save rewrites the same file with no second prompt', async () => {
    const { env, written, showSaveFilePicker } = nativeEnv()
    const storage = createFileStorage(env)
    await storage.save('one')
    await storage.save('two')
    expect(showSaveFilePicker).toHaveBeenCalledOnce()
    expect(written.chunks).toEqual(['one', 'two'])
  })

  it('Save As prompts again even when a handle is retained', async () => {
    const { env, showSaveFilePicker } = nativeEnv()
    const storage = createFileStorage(env)
    await storage.save('one')
    await storage.save('two', { saveAs: true })
    expect(showSaveFilePicker).toHaveBeenCalledTimes(2)
  })

  it('a cancelled picker is silent — cancelled, not an error', async () => {
    const { env } = nativeEnv()
    env.showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('user dismissed', 'AbortError')
    })
    await expect(createFileStorage(env).save('x')).resolves.toEqual({ ok: false, cancelled: true })
  })

  it('a write failure is an error naming the file (permission revoked, disk full)', async () => {
    const { env, handle } = nativeEnv()
    handle.createWritable = async () => {
      throw new DOMException('permission revoked', 'NotAllowedError')
    }
    const result = await createFileStorage(env).save('x', { saveAs: true })
    expect(result).toMatchObject({ ok: false, name: 'chosen.ndjson' })
    expect(/** @type {any} */ (result).error).toMatch(/permission revoked/)
  })

  it('Open returns the text and does not adopt the handle until told to', async () => {
    const { env, showSaveFilePicker, written } = nativeEnv({ name: 'theirs.ndjson', text: 'their doc' })
    const storage = createFileStorage(env)
    const opened = await storage.open()
    expect(opened).toMatchObject({ ok: true, name: 'theirs.ndjson', text: 'their doc' })

    // A file that then failed validation must not become the Save target — otherwise the next
    // Save would overwrite it with the *current* document. So nothing is retained yet:
    await storage.save('mine', { saveAs: false })
    expect(showSaveFilePicker).toHaveBeenCalledOnce() // it had to ask, because no handle was adopted
    expect(written.chunks).toEqual(['mine'])
  })

  it('once an opened file is adopted, Save writes back to it without prompting', async () => {
    const { env, showSaveFilePicker, written } = nativeEnv({ name: 'theirs.ndjson', text: 'their doc' })
    const storage = createFileStorage(env)
    const opened = await storage.open()
    storage.adopt(opened)
    const result = await storage.save('edited')
    expect(showSaveFilePicker).not.toHaveBeenCalled()
    expect(written.chunks).toEqual(['edited'])
    expect(result).toMatchObject({ ok: true, name: 'theirs.ndjson' })
    expect(storage.currentName).toBe('theirs.ndjson')
  })

  it('a cancelled Open picker is silent', async () => {
    const { env } = nativeEnv()
    env.showOpenFilePicker = vi.fn(async () => {
      throw new DOMException('dismissed', 'AbortError')
    })
    await expect(createFileStorage(env).open()).resolves.toEqual({ ok: false, cancelled: true })
  })
})

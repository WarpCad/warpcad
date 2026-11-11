// SPDX-License-Identifier: AGPL-3.0-or-later
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
import { createFakeTauriFs } from '../native/__fixtures__/fakeFs.js'

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

  it('forgetHandle makes the next plain Save a Save As — the previous file is never written again', async () => {
    const { env, written, showSaveFilePicker } = nativeEnv()
    const storage = createFileStorage(env)
    await storage.save('first project')
    expect(storage.currentName).toBe('chosen.ndjson')

    storage.forgetHandle()
    expect(storage.currentName).toBeNull()
    await storage.save('second project')

    expect(showSaveFilePicker).toHaveBeenCalledTimes(2)
    expect(written.chunks).toEqual(['first project', 'second project'])
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

  it('a write failure is an error naming the file (disk full)', async () => {
    const { env, handle } = nativeEnv()
    handle.createWritable = async () => {
      throw new DOMException('permission revoked', 'QuotaExceededError')
    }
    const result = await createFileStorage(env).save('x', { saveAs: true })
    expect(result).toMatchObject({ ok: false, name: 'chosen.ndjson' })
    expect(/** @type {any} */ (result).error).toMatch(/permission revoked/)
  })

  describe('the browser offers the picker but refuses the write (TODO/io-008)', () => {
    /** A native env whose handle's createWritable throws `name`, with a fallback-capable DOM. */
    function refusingEnv(name = 'NotAllowedError') {
      const base = nativeEnv({ name: 'chamfer error.ndjson' })
      base.handle.createWritable = async () => {
        throw new DOMException('The request is not allowed by the user agent', name)
      }
      const dom = fallbackEnv()
      Object.assign(base.env, {
        document: dom.env.document,
        Blob: dom.env.Blob,
        URL: dom.env.URL,
        setTimeout: dom.env.setTimeout,
      })
      return { ...base, dom }
    }

    it('falls back to a download in the same call and names the file left behind', async () => {
      const { env, dom } = refusingEnv()
      const storage = createFileStorage(env)
      const result = await storage.save('x', { now: new Date(2026, 8, 19, 14, 2) })
      expect(result).toEqual({
        ok: true,
        mode: 'fallback',
        name: 'warpcad-project-20260919-1402.ndjson',
        refusedName: 'chamfer error.ndjson',
      })
      expect(dom.dom.created.filter((node) => node.tag === 'a')).toHaveLength(1)
    })

    it('does not retain the handle, and capabilities flip to the fallback shape', async () => {
      const { env } = refusingEnv()
      const storage = createFileStorage(env)
      expect(storage.capabilities.mode).toBe('native')
      await storage.save('x')
      expect(storage.currentName).toBeNull()
      expect(storage.capabilities).toMatchObject({
        mode: 'fallback',
        canSaveInPlace: false,
        saveLabel: 'Download copy',
        saveAsLabel: null,
      })
    })

    it('the second Save goes straight to a download and never reopens the picker', async () => {
      const { env, showSaveFilePicker, dom } = refusingEnv()
      const storage = createFileStorage(env)
      await storage.save('one')
      const second = await storage.save('two')
      expect(showSaveFilePicker).toHaveBeenCalledOnce()
      expect(second).toMatchObject({ ok: true, mode: 'fallback' })
      expect(second).not.toHaveProperty('refusedName')
      expect(dom.dom.created.filter((node) => node.tag === 'a')).toHaveLength(2)
    })

    it('SecurityError (a blocked context) falls back the same way', async () => {
      const { env } = refusingEnv('SecurityError')
      const result = await createFileStorage(env).save('x')
      expect(result).toMatchObject({ ok: true, mode: 'fallback', refusedName: 'chamfer error.ndjson' })
    })

    it('a retained handle that is later refused also falls back, and is dropped', async () => {
      const { env, handle, dom } = refusingEnv()
      const good = handle.createWritable
      handle.createWritable = async () => ({ async write() {}, async close() {} })
      const storage = createFileStorage(env)
      await storage.save('one')
      expect(storage.currentName).toBe('chamfer error.ndjson')
      handle.createWritable = good
      const result = await storage.save('two')
      expect(result).toMatchObject({ ok: true, mode: 'fallback' })
      expect(storage.currentName).toBeNull()
      expect(dom.dom.created.filter((node) => node.tag === 'a')).toHaveLength(1)
    })

    it.each(['QuotaExceededError', 'AbortError', 'NotFoundError'])(
      'a %s is a real failure, not a refusal: no download, no flip, handle not kept',
      async (name) => {
        const { env, dom } = refusingEnv(name)
        const storage = createFileStorage(env)
        const result = await storage.save('x')
        expect(result).toMatchObject({ ok: false, name: 'chamfer error.ndjson' })
        expect(dom.dom.created.filter((node) => node.tag === 'a')).toHaveLength(0)
        expect(storage.capabilities.mode).toBe('native')
        expect(storage.currentName).toBeNull()
      },
    )

    it('a cancelled picker is still just cancelled and does not flip anything', async () => {
      const { env } = refusingEnv()
      env.showSaveFilePicker = vi.fn(async () => {
        throw new DOMException('dismissed', 'AbortError')
      })
      const storage = createFileStorage(env)
      await expect(storage.save('x')).resolves.toEqual({ ok: false, cancelled: true })
      expect(storage.capabilities.mode).toBe('native')
    })

    it('a refusal whose fallback download also fails reports the failure', async () => {
      const { env } = refusingEnv()
      env.URL = {
        createObjectURL() {
          throw new Error('blocked')
        },
        revokeObjectURL() {},
      }
      const result = await createFileStorage(env).save('x')
      expect(result).toMatchObject({ ok: false })
    })
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

describe('readCurrent — noticing the file changed on disk (TODO/ai-009)', () => {
  /** A handle whose file can be changed under it, the way the MCP server changes one. */
  function diskEnv() {
    const disk = { text: 'v1\n', lastModified: 1000, reads: 0, fail: false }
    const handle = {
      name: 'bracket.ndjson',
      async createWritable() {
        return { async write(text) { disk.text = text; disk.lastModified += 1 }, async close() {} }
      },
      async getFile() {
        if (disk.fail) throw new DOMException('gone', 'NotFoundError')
        return {
          name: 'bracket.ndjson',
          lastModified: disk.lastModified,
          text: async () => {
            disk.reads += 1
            return disk.text
          },
        }
      },
    }
    const env = { showSaveFilePicker: vi.fn(async () => handle), showOpenFilePicker: vi.fn(async () => [handle]) }
    return { env, disk }
  }

  it('is null with nothing to read: no file opened yet, and always on the fallback path', async () => {
    expect(await createFileStorage(diskEnv().env).readCurrent()).toBeNull()
    expect(await createFileStorage(fallbackEnv().env).readCurrent()).toBeNull()
  })

  it('Open reports the file’s lastModified, and readCurrent sees a later change', async () => {
    const { env, disk } = diskEnv()
    const storage = createFileStorage(env)
    const opened = await storage.open()
    expect(opened).toMatchObject({ ok: true, text: 'v1\n', lastModified: 1000 })
    storage.adopt(opened)

    disk.text = 'v1\nv2\n'
    disk.lastModified = 2000
    expect(await storage.readCurrent({ lastModified: 1000 })).toEqual({
      ok: true,
      name: 'bracket.ndjson',
      text: 'v1\nv2\n',
      lastModified: 2000,
    })
  })

  it('does not read the text when lastModified has not moved — the cheap focus check', async () => {
    const { env, disk } = diskEnv()
    const storage = createFileStorage(env)
    storage.adopt(await storage.open())
    const readsAfterOpen = disk.reads
    expect(await storage.readCurrent({ lastModified: 1000 })).toEqual({ ok: true, name: 'bracket.ndjson', text: '', lastModified: 1000 })
    expect(disk.reads).toBe(readsAfterOpen)
  })

  it('reports a file that can no longer be read, by name, without throwing', async () => {
    const { env, disk } = diskEnv()
    const storage = createFileStorage(env)
    storage.adopt(await storage.open())
    disk.fail = true
    expect(await storage.readCurrent()).toEqual({ ok: false, error: 'NotFoundError: gone', name: 'bracket.ndjson' })
  })
})

/**
 * `TODO/io-014`: the third mode, inside the native app. `native-app` is checked **first**: the
 * macOS shell's WebKit and a Chromium test page both define the File System Access pickers, and
 * the app's own Documents folder must still win over them.
 */
describe('native-app mode (TODO/io-014)', () => {
  /** An env with the fake Tauri bridge, and both FSA pickers present to prove the order. */
  function appEnv() {
    const fs = createFakeTauriFs()
    const env = {
      __TAURI_INTERNALS__: { invoke: (cmd, args, options) => (cmd === 'shell_info' ? Promise.resolve({ platform: 'ios', version: '1.13.0' }) : fs.invoke(cmd, args, options)) },
      showSaveFilePicker: vi.fn(),
      showOpenFilePicker: vi.fn(),
    }
    return { env, fs }
  }

  it('mode order: native-app wins over File System Access when the bridge is present', () => {
    const { env } = appEnv()
    expect(getFileCapabilities(env)).toEqual({
      mode: 'native-app',
      canSaveInPlace: true,
      saveLabel: 'Save',
      saveAsLabel: 'Save As…',
      openLabel: 'Open…',
    })
    expect(createFileStorage(env).capabilities.mode).toBe('native-app')
  })

  it('without the bridge the order is unchanged: native, then fallback', () => {
    expect(getFileCapabilities({ showSaveFilePicker: () => {}, showOpenFilePicker: () => {} }).mode).toBe('native')
    expect(getFileCapabilities({}).mode).toBe('fallback')
  })

  it('offers a plain default name for the name sheet', () => {
    expect(projectFileName('native-app')).toBe('warpcad-project.ndjson')
  })

  it('the first Save writes Documents/<name>.ndjson; the second overwrites the same file, never a copy', async () => {
    const { env, fs } = appEnv()
    const storage = createFileStorage(env)
    expect(storage.currentName).toBeNull()
    await expect(storage.save('one\n', { name: 'bracket' })).resolves.toEqual({ ok: true, mode: 'native-app', name: 'bracket.ndjson' })
    expect(storage.currentName).toBe('bracket.ndjson')
    await expect(storage.save('two\n')).resolves.toEqual({ ok: true, mode: 'native-app', name: 'bracket.ndjson' })
    expect(fs.documents()).toEqual(['bracket.ndjson'])
    expect(fs.text('bracket.ndjson')).toBe('two\n')
    expect(env.showSaveFilePicker).not.toHaveBeenCalled()
  })

  it('Save with no file and no name writes nothing and says a name is needed', async () => {
    const { env, fs } = appEnv()
    const result = await createFileStorage(env).save('x')
    expect(result).toMatchObject({ ok: false, needsName: true })
    expect(fs.documents()).toEqual([])
  })

  it('Save As… names a new file and moves the Save target to it', async () => {
    const { env, fs } = appEnv()
    const storage = createFileStorage(env)
    await storage.save('one', { name: 'bracket' })
    await expect(storage.save('two', { saveAs: true, name: 'bracket v2' })).resolves.toMatchObject({ ok: true, name: 'bracket v2.ndjson' })
    await storage.save('three')
    expect(fs.text('bracket.ndjson')).toBe('one')
    expect(fs.text('bracket v2.ndjson')).toBe('three')
  })

  it('a new name that is already taken is refused, and the existing file is not overwritten', async () => {
    const { env, fs } = appEnv()
    fs.put('bracket.ndjson', 'someone else’s')
    const result = await createFileStorage(env).save('mine', { name: 'bracket' })
    expect(result).toMatchObject({ ok: false, exists: true, name: 'bracket.ndjson' })
    expect(result.error).toMatch(/already/)
    expect(fs.text('bracket.ndjson')).toBe('someone else’s')
  })

  it('a name that is not a plain file name is refused before anything is written', async () => {
    const { env, fs } = appEnv()
    const result = await createFileStorage(env).save('x', { name: '../escape' })
    expect(result).toMatchObject({ ok: false })
    expect(result.error).toMatch(/name/i)
    expect(fs.documents()).toEqual([])
  })

  it('a refused write says so and never falls back to a download (io-008 in native-app mode)', async () => {
    const { env, fs } = appEnv()
    const dom = { createElement: vi.fn(), body: { appendChild: vi.fn() } }
    env.document = dom
    fs.fail('plugin:fs|write_text_file', 'forbidden path: .bracket.ndjson.tmp')
    const storage = createFileStorage(env)
    const result = await storage.save('x', { name: 'bracket' })
    expect(result).toEqual({ ok: false, error: 'forbidden path: .bracket.ndjson.tmp', name: 'bracket.ndjson' })
    expect(dom.createElement).not.toHaveBeenCalled()
    expect(storage.capabilities.mode).toBe('native-app')
    // A failed first save leaves no Save target behind.
    expect(storage.currentName).toBeNull()
  })

  it('lists the app’s own projects, newest first', async () => {
    const { env, fs } = appEnv()
    fs.put('a.ndjson', '1')
    fs.put('b.ndjson', '2')
    await expect(createFileStorage(env).list()).resolves.toEqual([
      { name: 'b.ndjson', lastModified: fs.mtime('b.ndjson') },
      { name: 'a.ndjson', lastModified: fs.mtime('a.ndjson') },
    ])
  })

  it('opening one of its projects reads it, and adopting it makes Save write back to it', async () => {
    const { env, fs } = appEnv()
    fs.put('bracket.ndjson', 'v1\n')
    const storage = createFileStorage(env)
    const opened = await storage.openNamed('bracket.ndjson')
    expect(opened).toEqual({ ok: true, name: 'bracket.ndjson', text: 'v1\n', handle: 'bracket.ndjson', lastModified: fs.mtime('bracket.ndjson') })
    storage.adopt(opened)
    await storage.save('v2\n')
    expect(fs.text('bracket.ndjson')).toBe('v2\n')
  })

  it('opening a project that has gone is an error by name', async () => {
    const { env } = appEnv()
    const opened = await createFileStorage(env).openNamed('gone.ndjson')
    expect(opened).toMatchObject({ ok: false, name: 'gone.ndjson' })
  })

  it('Browse… (open) uses the system document picker and returns a copy: no Save target, nothing to re-read', async () => {
    const { env, fs } = appEnv()
    fs.putOutside('/iCloud/shelf.ndjson', 'remote\n')
    fs.queuePick('/iCloud/shelf.ndjson')
    const storage = createFileStorage(env)
    const opened = await storage.open()
    expect(opened).toEqual({ ok: true, name: 'shelf.ndjson', text: 'remote\n', copy: true })
    expect(env.showOpenFilePicker).not.toHaveBeenCalled()
    storage.adopt(opened)
    expect(storage.currentName).toBeNull()
    expect(await storage.readCurrent()).toBeNull()
  })

  it('a dismissed document picker is a cancel', async () => {
    const { env, fs } = appEnv()
    fs.queuePick(null)
    await expect(createFileStorage(env).open()).resolves.toEqual({ ok: false, cancelled: true })
  })

  it('readCurrent re-reads the app’s file, so the focus merge (io-010) sees a change made elsewhere', async () => {
    const { env, fs } = appEnv()
    const storage = createFileStorage(env)
    await storage.save('v1\n', { name: 'bracket' })
    const first = fs.mtime('bracket.ndjson')
    expect(await storage.readCurrent({ lastModified: first })).toEqual({ ok: true, name: 'bracket.ndjson', text: '', lastModified: first })
    fs.put('bracket.ndjson', 'v1\nv2\n')
    expect(await storage.readCurrent({ lastModified: first })).toEqual({
      ok: true,
      name: 'bracket.ndjson',
      text: 'v1\nv2\n',
      lastModified: fs.mtime('bracket.ndjson'),
    })
  })

  it('readCurrent reports a file that has gone, by name, without throwing', async () => {
    const { env, fs } = appEnv()
    const storage = createFileStorage(env)
    await storage.save('v1\n', { name: 'bracket' })
    fs.fail('plugin:fs|stat', 'No such file or directory (os error 2)')
    expect(await storage.readCurrent()).toEqual({ ok: false, error: 'No such file or directory (os error 2)', name: 'bracket.ndjson' })
  })

  it('forgetHandle makes the next Save ask for a name again', async () => {
    const { env } = appEnv()
    const storage = createFileStorage(env)
    await storage.save('v1', { name: 'bracket' })
    storage.forgetHandle()
    expect(storage.currentName).toBeNull()
    await expect(storage.save('v2')).resolves.toMatchObject({ ok: false, needsName: true })
  })
})

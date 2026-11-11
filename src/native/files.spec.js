// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — the bridge here is a duck-typed fake of `__TAURI_INTERNALS__`.
import { describe, expect, it, vi } from 'vitest'

import { createFakeTauriFs } from './__fixtures__/fakeFs.js'
import {
  APPDATA_BASE_DIR,
  DOCUMENT_BASE_DIR,
  exportPlace,
  listProjects,
  pickFile,
  projectFileNameFor,
  readPickedFile,
  readProjectFile,
  statProjectFile,
  takeOpenedFiles,
  importOpenedFile,
  listAppData,
  readAppData,
  removeAppData,
  writeAppData,
  writeExport,
  writeProjectFile,
} from './files.js'

/**
 * `TODO/io-014`: the iOS app's real files, through `tauri-plugin-fs` and `tauri-plugin-dialog`
 * over `src/native/shell.js`'s `invoke`. The bridge is mocked at the boundary with an in-memory
 * Documents folder (`__fixtures__/fakeFs.js`), so no real filesystem is touched.
 */

/** A global with the fake bridge installed, and the fake itself. */
function shell({ platform = 'ios', userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' } = {}) {
  const fs = createFakeTauriFs()
  const invoke = vi.fn((cmd, args, options) => (cmd === 'shell_info' ? Promise.resolve({ platform, version: '1.13.0' }) : fs.invoke(cmd, args, options)))
  return { fs, invoke, global: { __TAURI_INTERNALS__: { invoke }, navigator: { userAgent, maxTouchPoints: 5 } } }
}

describe('project file names', () => {
  it('adds the extension to a typed name and keeps one that has it', () => {
    expect(projectFileNameFor('bracket')).toBe('bracket.ndjson')
    expect(projectFileNameFor('bracket.ndjson')).toBe('bracket.ndjson')
    expect(projectFileNameFor('  phone stand  ')).toBe('phone stand.ndjson')
  })

  it('refuses a name that is empty, hidden, or reaches outside the folder', () => {
    for (const bad of ['', '   ', '.ndjson', '.hidden', '..', '../escape', 'a/b', 'a\\b']) {
      expect(projectFileNameFor(bad), bad).toBeNull()
    }
  })
})

describe('writeProjectFile — a temp file, then a rename (never a torn project)', () => {
  it('writes the text to a hidden temp file in Documents and renames it over the target', async () => {
    const { fs, global } = shell()
    await writeProjectFile('bracket.ndjson', '{"a":1}\n', global, 'abc')
    expect(fs.calls.map((c) => [c.cmd, c.path, c.newPath])).toEqual([
      ['plugin:fs|write_text_file', '.bracket.ndjson.abc.tmp', undefined],
      ['plugin:fs|rename', '.bracket.ndjson.abc.tmp', 'bracket.ndjson'],
      ['plugin:fs|stat', 'bracket.ndjson', undefined],
    ])
    expect(fs.documents()).toEqual(['bracket.ndjson'])
    expect(fs.text('bracket.ndjson')).toBe('{"a":1}\n')
  })

  it('sends the bytes as the payload and the path and Documents base dir as headers, as the plugin reads them', async () => {
    const { invoke, global } = shell()
    await writeProjectFile('my part.ndjson', 'x', global, 't1')
    const [cmd, payload, options] = invoke.mock.calls[0]
    expect(cmd).toBe('plugin:fs|write_text_file')
    expect(payload).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(payload)).toBe('x')
    expect(options.headers.path).toBe(encodeURIComponent('.my part.ndjson.t1.tmp'))
    expect(JSON.parse(options.headers.options)).toEqual({ baseDir: DOCUMENT_BASE_DIR })
    expect(DOCUMENT_BASE_DIR).toBe(6)
  })

  it('a second write replaces the same file: one file, the new text', async () => {
    const { fs, global } = shell()
    await writeProjectFile('bracket.ndjson', 'one', global)
    await writeProjectFile('bracket.ndjson', 'two', global)
    expect(fs.documents()).toEqual(['bracket.ndjson'])
    expect(fs.text('bracket.ndjson')).toBe('two')
  })

  it('returns the file’s modification time after the rename', async () => {
    const { fs, global } = shell()
    const written = await writeProjectFile('bracket.ndjson', 'one', global)
    expect(written).toEqual({ name: 'bracket.ndjson', lastModified: fs.mtime('bracket.ndjson') })
  })

  it('a failed rename removes the temp file, leaves the original untouched, and rejects', async () => {
    const { fs, global } = shell()
    fs.put('bracket.ndjson', 'original')
    fs.fail('plugin:fs|rename', 'failed to rename: Operation not permitted (os error 1)')
    await expect(writeProjectFile('bracket.ndjson', 'new', global, 'r1')).rejects.toThrow(/Operation not permitted/)
    expect(fs.documents()).toEqual(['bracket.ndjson'])
    expect(fs.text('bracket.ndjson')).toBe('original')
    expect(fs.calls.map((c) => c.cmd)).toEqual(['plugin:fs|write_text_file', 'plugin:fs|rename', 'plugin:fs|remove'])
    expect(fs.calls[2].path).toBe('.bracket.ndjson.r1.tmp')
    // Never a direct write to the target.
    expect(fs.calls.filter((c) => c.cmd === 'plugin:fs|write_text_file').map((c) => c.path)).toEqual(['.bracket.ndjson.r1.tmp'])
  })

  it('a failed write also tries to remove the temp file, and rejects with the plugin’s reason', async () => {
    const { fs, global } = shell()
    fs.fail('plugin:fs|write_text_file', 'No space left on device (os error 28)')
    await expect(writeProjectFile('bracket.ndjson', 'new', global, 'w1')).rejects.toThrow('No space left on device (os error 28)')
    expect(fs.calls.map((c) => c.cmd)).toEqual(['plugin:fs|write_text_file', 'plugin:fs|remove'])
    expect(fs.documents()).toEqual([])
  })

  it('refuses a name outside the folder before touching the bridge', async () => {
    const { fs, global } = shell()
    await expect(writeProjectFile('../x.ndjson', 'x', global)).rejects.toThrow(/name/)
    expect(fs.calls).toEqual([])
  })

  it('rejects without the native shell', async () => {
    await expect(writeProjectFile('a.ndjson', 'x', {})).rejects.toThrow(/needs the native shell/)
  })
})

describe('readProjectFile, statProjectFile and listProjects', () => {
  it('reads a project’s text and modification time', async () => {
    const { fs, global } = shell()
    fs.put('bracket.ndjson', 'hello\n')
    await expect(readProjectFile('bracket.ndjson', global)).resolves.toEqual({
      name: 'bracket.ndjson',
      text: 'hello\n',
      lastModified: fs.mtime('bracket.ndjson'),
    })
    await expect(statProjectFile('bracket.ndjson', global)).resolves.toEqual({ lastModified: fs.mtime('bracket.ndjson') })
  })

  it('decodes an ArrayBuffer answer as well as a byte array', async () => {
    const bytes = new TextEncoder().encode('é\n')
    const invoke = vi.fn((cmd) => Promise.resolve(cmd === 'plugin:fs|stat' ? { mtime: 5 } : bytes.buffer))
    await expect(readProjectFile('a.ndjson', { __TAURI_INTERNALS__: { invoke } })).resolves.toEqual({ name: 'a.ndjson', text: 'é\n', lastModified: 5 })
  })

  it('lists Documents’ projects newest first, leaving out folders, temp files and other files', async () => {
    const { fs, global } = shell()
    fs.put('old.ndjson', 'a')
    fs.put('notes.txt', 'b')
    fs.put('.bracket.ndjson.x.tmp', 'c')
    fs.put('Exports/part.stl', 'd')
    fs.put('new.ndjson', 'e')
    const list = await listProjects(global)
    expect(list).toEqual([
      { name: 'new.ndjson', lastModified: fs.mtime('new.ndjson') },
      { name: 'old.ndjson', lastModified: fs.mtime('old.ndjson') },
    ])
  })

  it('lists nothing in an empty folder', async () => {
    const { global } = shell()
    await expect(listProjects(global)).resolves.toEqual([])
  })
})

describe('writeExport — Documents/Exports, and where to find it', () => {
  it('creates Exports/, writes through a temp file, and says where the file is on an iPhone', async () => {
    const { fs, global } = shell()
    const bytes = new Uint8Array([1, 2, 3])
    const written = await writeExport('part.stl', bytes, global, 'e1')
    expect(fs.documents()).toEqual(['Exports/part.stl'])
    expect(written).toEqual({ path: 'Exports/part.stl', place: 'Files › On My iPhone › WarpCad › Exports › part.stl' })
    expect(fs.calls.map((c) => [c.cmd, c.path, c.newPath])).toEqual([
      ['plugin:fs|mkdir', 'Exports', undefined],
      ['plugin:fs|write_file', 'Exports/.part.stl.e1.tmp', undefined],
      ['plugin:fs|rename', 'Exports/.part.stl.e1.tmp', 'Exports/part.stl'],
    ])
  })

  it('writes text (a project copy, a part file) as UTF-8 bytes', async () => {
    const { fs, global } = shell()
    await writeExport('copy.ndjson', 'línea\n', global)
    expect(fs.text('Exports/copy.ndjson')).toBe('línea\n')
  })

  it('a second export of the same name replaces it', async () => {
    const { fs, global } = shell()
    await writeExport('part.stl', 'one', global)
    await writeExport('part.stl', 'two', global)
    expect(fs.documents()).toEqual(['Exports/part.stl'])
    expect(fs.text('Exports/part.stl')).toBe('two')
  })

  it('a failed rename leaves no temp file behind and rejects', async () => {
    const { fs, global } = shell()
    fs.fail('plugin:fs|rename', 'Operation not permitted (os error 1)')
    await expect(writeExport('part.stl', 'x', global)).rejects.toThrow(/Operation not permitted/)
    expect(fs.documents()).toEqual([])
  })

  it('names the place by device: iPad, and the Documents folder on a Mac', () => {
    expect(exportPlace('Exports/part.stl', 'ios', false)).toBe('Files › On My iPhone › WarpCad › Exports › part.stl')
    expect(exportPlace('Exports/part.stl', 'ios', true)).toBe('Files › On My iPad › WarpCad › Exports › part.stl')
    expect(exportPlace('Exports/part.stl', 'macos', false)).toBe('Documents › Exports › part.stl')
    expect(exportPlace('Exports/part.stl', '', false)).toBe('Documents › Exports › part.stl')
  })

  it('an iPad reports itself as a Mac with touch; the place says iPad', async () => {
    const { global } = shell({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
    const written = await writeExport('part.stl', 'x', global)
    expect(written.place).toBe('Files › On My iPad › WarpCad › Exports › part.stl')
  })
})

describe('pickFile and readPickedFile — Browse… through tauri-plugin-dialog', () => {
  it('opens the dialog for project files and returns the picked path and its name', async () => {
    const { fs, invoke, global } = shell()
    fs.putOutside('/iCloud/WarpCad/shelf%20bracket.ndjson', 'x')
    fs.queuePick('file:///iCloud/WarpCad/shelf%20bracket.ndjson')
    await expect(pickFile(global)).resolves.toEqual({ path: 'file:///iCloud/WarpCad/shelf%20bracket.ndjson', name: 'shelf bracket.ndjson' })
    const [cmd, args] = invoke.mock.calls[0]
    expect(cmd).toBe('plugin:dialog|open')
    expect(args.options).toMatchObject({ multiple: false, directory: false })
    expect(args.options.filters[0].extensions).toEqual(expect.arrayContaining(['ndjson', 'json', 'txt']))
  })

  it('a dismissed dialog is null, not an error', async () => {
    const { fs, global } = shell()
    fs.queuePick(null)
    await expect(pickFile(global)).resolves.toBeNull()
  })

  it('reads the picked file’s text', async () => {
    const { fs, global } = shell()
    fs.putOutside('/iCloud/a.ndjson', 'picked\n')
    fs.queuePick('/iCloud/a.ndjson')
    const picked = await pickFile(global)
    await expect(readPickedFile(picked.path, global)).resolves.toBe('picked\n')
  })
})

describe('takeOpenedFiles and importOpenedFile — a project tapped in the Files app or Mail', () => {
  it('returns what the shell queued, once', async () => {
    const { fs, global } = shell()
    fs.queueOpened({ name: 'bracket.ndjson', path: null })
    await expect(takeOpenedFiles(global)).resolves.toEqual([{ name: 'bracket.ndjson', path: null }])
    await expect(takeOpenedFiles(global)).resolves.toEqual([])
  })

  it('is empty, not an error, for a shell without the command', async () => {
    const invoke = vi.fn(() => Promise.reject('Command take_opened_files not found'))
    await expect(takeOpenedFiles({ __TAURI_INTERNALS__: { invoke } })).resolves.toEqual([])
  })

  it('ignores anything that is not a plain name with an optional path', async () => {
    const invoke = vi.fn(() =>
      Promise.resolve([{ name: 'ok.ndjson', path: null }, { name: '../x.ndjson', path: null }, { name: '.hidden', path: null }, 'loose', { name: 'p.ndjson', path: 7 }]),
    )
    await expect(takeOpenedFiles({ __TAURI_INTERNALS__: { invoke } })).resolves.toEqual([{ name: 'ok.ndjson', path: null }])
  })

  it('a file already in Documents is opened where it is: nothing is copied', async () => {
    const { fs, global } = shell()
    fs.put('bracket.ndjson', 'x')
    await expect(importOpenedFile({ name: 'bracket.ndjson', path: null }, global)).resolves.toBe('bracket.ndjson')
    expect(fs.documents()).toEqual(['bracket.ndjson'])
    expect(fs.calls.filter((c) => c.cmd.startsWith('plugin:fs|write'))).toEqual([])
  })

  it('a file from elsewhere (a Mail attachment) is copied into Documents first', async () => {
    const { fs, global } = shell()
    fs.queueOpened({ name: 'from-mail.ndjson', path: '/var/mobile/Documents/Inbox/from-mail.ndjson' }, 'mailed\n')
    const [entry] = await takeOpenedFiles(global)
    await expect(importOpenedFile(entry, global)).resolves.toBe('from-mail.ndjson')
    expect(fs.text('from-mail.ndjson')).toBe('mailed\n')
  })

  it('a copy never overwrites a project of the same name: it takes the next free name', async () => {
    const { fs, global } = shell()
    fs.put('bracket.ndjson', 'mine')
    fs.put('bracket 2.ndjson', 'also mine')
    fs.queueOpened({ name: 'bracket.ndjson', path: '/iCloud/bracket.ndjson' }, 'theirs')
    const [entry] = await takeOpenedFiles(global)
    await expect(importOpenedFile(entry, global)).resolves.toBe('bracket 3.ndjson')
    expect(fs.text('bracket.ndjson')).toBe('mine')
    expect(fs.text('bracket 3.ndjson')).toBe('theirs')
  })
})

describe('the app-data copy (TODO/io-015) — $APPDATA, never Documents', () => {
  it('writes through a hidden temp file and a rename in the AppData base directory', async () => {
    const { fs, invoke, global } = shell()
    await writeAppData('autosave.ndjson', '{"a":1}\n', global, 'abc')
    expect(fs.calls.map((c) => [c.cmd, c.path, c.newPath])).toEqual([
      ['plugin:fs|mkdir', '', undefined],
      ['plugin:fs|write_text_file', '.autosave.ndjson.abc.tmp', undefined],
      ['plugin:fs|rename', '.autosave.ndjson.abc.tmp', 'autosave.ndjson'],
    ])
    const write = invoke.mock.calls.find(([cmd]) => cmd === 'plugin:fs|write_text_file')
    expect(JSON.parse(write[2].headers.options)).toEqual({ baseDir: APPDATA_BASE_DIR })
    expect(APPDATA_BASE_DIR).toBe(14)
    expect(fs.appText('autosave.ndjson')).toBe('{"a":1}\n')
    expect(fs.documents()).toEqual([])
  })

  it('makes the folder for a nested path, and replaces an earlier copy whole', async () => {
    const { fs, global } = shell()
    await writeAppData('library/user.bolt.ndjson', 'one', global, 'a')
    await writeAppData('library/user.bolt.ndjson', 'two', global, 'b')
    expect(fs.appData()).toEqual(['library/user.bolt.ndjson'])
    expect(fs.appText('library/user.bolt.ndjson')).toBe('two')
  })

  it('removes the temp file and rejects when the rename fails', async () => {
    const { fs, global } = shell()
    fs.fail('plugin:fs|rename', 'disk full')
    await expect(writeAppData('autosave.ndjson', 'x', global, 'abc')).rejects.toThrow('disk full')
    expect(fs.appData()).toEqual([])
  })

  it('reads a file back, and answers null for one that is not there', async () => {
    const { fs, global } = shell()
    expect(await readAppData('autosave.ndjson', global)).toBeNull()
    fs.putAppData('autosave.ndjson', 'héllo')
    expect(await readAppData('autosave.ndjson', global)).toBe('héllo')
  })

  it('lists a folder, empty when it does not exist yet, and removes a file quietly', async () => {
    const { fs, global } = shell()
    expect(await listAppData('library', global)).toEqual([])
    fs.putAppData('library/b.ndjson', '1')
    fs.putAppData('library/a.ndjson', '2')
    expect(await listAppData('library', global)).toEqual(['a.ndjson', 'b.ndjson'])
    await removeAppData('library/a.ndjson', global)
    await removeAppData('library/a.ndjson', global)
    expect(await listAppData('library', global)).toEqual(['b.ndjson'])
  })

  it('refuses a path that reaches outside the folder or is hidden', async () => {
    const { global } = shell()
    for (const bad of ['', '../escape', 'a/../b', '.hidden', 'library//x']) {
      await expect(writeAppData(bad, 'x', global), bad).rejects.toThrow(/not a path/)
      await expect(readAppData(bad, global), bad).rejects.toThrow(/not a path/)
    }
  })
})

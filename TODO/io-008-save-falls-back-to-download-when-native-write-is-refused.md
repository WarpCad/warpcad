---
title: Fall back to a download when the browser offers the File System Access API but refuses the write
category: io
kind: finding
priority: medium
model: sonnet
depends: []
milestone: M16
status: open
---

## Problem

Reported by the user on 2026-10-04, saving from the editor's **integrated browser**:

> *Couldn't save chamfer error.ndjson: NotAllowedError: Failed to execute
> 'createWritable' on 'FileSystemFileHandle': The request is not allowed by the user agent
> or the platform in the current context.*

Two separate defects sit behind that one message.

**1. Capability detection is "the function exists", not "a write will work".**
`getFileCapabilities` (`src/storage/fileSystem.js:83-85`) picks `mode: 'native'` when
`showSaveFilePicker` and `showOpenFilePicker` are functions. The integrated browser defines
both and then refuses `createWritable()` on the handle the picker returns. So the user is
offered **Save** / **Save As…** (not **Download copy**), the picker succeeds, the write
throws, and no path in the app gets their project out. They have to leave the app for
another browser. The module comment says "feature-detected on the function … a stubbed
non-function property is not support", which is right as far as it goes, but a function that
exists and throws on use is the same failure one step later.

**2. A refused write leaves a 0-byte file behind.** `showSaveFilePicker` creates the file
on disk when the user confirms the dialog, before our code can write to it.
`writeHandle` (`src/storage/fileSystem.js:202-211`) catches the `createWritable` error and
returns `{ ok: false, error, name }`, which is correct. But the empty file stays, named like
a real project, in whatever folder the user chose (here, the repo's `examples/` folder as
`chamfer error.ndjson`, untracked). A user who doesn't read the error could take it for a
saved project and lose work. We cannot delete it: the browser gave us a handle with no
`remove()` in this context, and `FileSystemFileHandle.remove` is not widely available. What we
*can* do is make sure the user is told, and get the data out another way.

## Affected files

- `src/storage/fileSystem.js:83-85`  (`getFileCapabilities`, the detection)
- `src/storage/fileSystem.js:202-211` (`writeHandle`, where `NotAllowedError` is swallowed into an error)
- `src/storage/fileSystem.js:227-250` (`save`, the first-save and Save As path)
- `src/stores/persistence.js:425-450` (`saveFile`, the notice and `errorMessage`)
- `src/storage/fileSystem.spec.js`    (existing fake `env`)

## Proposed fix

**Recover at the failure, not at detection.** A browser can't be probed for "will
`createWritable` work" without the user's gesture and a real file, so don't try. Instead,
when `writeHandle` fails with `error.name === 'NotAllowedError'` (also `SecurityError`; the
set is decided in Step 2), do two things:

1. **Fall back to a download in the same call.** `save()` calls `downloadCopy(text,
   projectFileName('fallback', now))` and returns that result, so the user gets their file
   from the one click they already made. The download path needs the click's user
   activation, and the picker's `await` has not yet spent it in the browsers this matters for.
   Verify that in the integrated browser itself, not only in Chromium. If activation is
   gone by then, skip the automatic fallback and go to (3) instead.
2. **Remember the refusal for the session.** Set a module-level `nativeWriteRefused` flag so
   `capabilities` flips to the `fallback` shape (label **Download copy**, no **Save As…**)
   from then on. The menu then stops promising "Save" it can't keep. `capabilities` is
   currently a constant on the `storage` object, so it must become a getter. Check
   `fileMenu.js` and the File menu component, which read it, still react to the change.
3. **Say what happened.** The notice reads plainly, for example *"This browser won't let
   WarpCad write files in place. A copy was downloaded instead: warpcad-project-….ndjson.
   An empty file named X may have been left where you chose to save; you can delete it."*
   It must name the **empty file** half, because that is the part that causes data loss.
   Keep it out of `errorMessage` when the download succeeded; it is a notice, not an error.

**Do not retain the handle** after a refused write. That already works
(`if (result.ok) handle = picked`, `fileSystem.js:245-247`), and a test must keep it pinned.

**Not in scope**: deleting the stray 0-byte file, since the API gives us no reliable way to,
and probing browsers by user-agent, which the module comment rules out on purpose.

## Effort

S/M. The fallback is a few lines in `writeHandle`/`save`. The getter conversion and keeping
the File menu reactive is the part that needs care.

## Testing

- **Unit** (`fileSystem.spec.js`, fake `env`): a `createWritable` that rejects with
  `NotAllowedError` on the first Save returns the download result, and the handle is **not**
  retained. After it, `capabilities.mode === 'fallback'` and `saveAsLabel === null`. A
  non-permission error (disk full, an `AbortError`) does **not** trigger the fallback and
  still returns `{ ok: false, error, name }`. A `showSaveFilePicker` cancel is unchanged.
  Cover the second Save after a refusal (goes straight to download, never reopens the
  picker).
- **Unit** (`persistence` store): the notice names both the downloaded file and the possible
  empty file, and `errorMessage` stays empty when the fallback download succeeded.
- **E2E**: a real `*.e2e.js` against `/` (extend `save-load-ui.e2e.js`) that stubs
  `showSaveFilePicker` to return a handle whose `createWritable` throws `NotAllowedError`,
  clicks Save, and asserts a download starts, the notice appears, and the File menu then
  reads **Download copy**. Chromium and WebKit at minimum, since persistence is a listed
  engine-sensitive path; Firefox has no `showSaveFilePicker` and already takes the fallback,
  so run all three to confirm it is unchanged there. Layout is unaffected, so one
  viewport is enough, unless the new notice wraps badly at phone width. Check it once at
  390 px.
- **Acceptance scenarios**: any that save and reload a project (scenario 10 per `ui-050`'s
  notes). Re-run by hand in the integrated browser, which is the reproduction: Save, see the
  notice and the downloaded file, then Open it.
- **Closed findings**: `io-001` (local persistence, File System Access) is the subsystem
  this extends. Re-run its original repro against the change.
- **Documentation**: this changes what a user sees when saving. Update `docs/save-load.md`
  with a short *"If your browser can't save in place"* section (what the notice says, that
  an empty file may be left behind, and why), with one concrete example: Save in the
  integrated browser, see "A copy was downloaded instead", open the downloaded file with
  **Open…**. No new screenshot is needed beyond a still of the notice, which belongs in
  `e2e/docs/` and must be registered so `docs-media.spec.js` stays green.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

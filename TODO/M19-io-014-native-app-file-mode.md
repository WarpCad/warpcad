---
title: Save, open and export real files in the iOS app, visible in the Files app
category: io
kind: feature
priority: high
model: opus
milestone: M19
depends: [build-017, build-018]
status: open
---

## Goal

In Safari on an iPhone, WarpCad has no real files: **Download copy** hands a Blob to the browser,
and **Open…** reads a one-time copy (`src/storage/fileSystem.js`, mode `fallback`). Inside the
Tauri app the Blob download may do nothing at all; Capacitor's equivalent is broken
(`native-mobile-shell.md` Q3), and `build-018` item 7 records Tauri's behaviour.

Done means, in the iOS app:

- **Save** writes the project **in place** to a file in the app's Documents folder, and the Files
  app shows that folder as *On My iPhone › WarpCad*. The second Save overwrites the same file;
  there is no new copy each time. **Save As…** names a new file there.
- **Open…** lists the app's own projects first, and **Browse…** opens the system document picker
  for files elsewhere (iCloud Drive, other apps).
- **Every export** (STL, 3MF, the print-prep split, a project copy) writes a real file to
  `Documents/Exports/` and says where, instead of a Blob download.
- Tapping a `.ndjson` WarpCad project in the Files app or Mail offers **Open in WarpCad**.
- `io-010`'s merge-on-focus works for a file in the app's Documents folder, because the app can
  re-read it. An MCP agent or another device editing that file (iCloud is out of scope) is merged
  in on return to the app, as on desktop Chromium.

## Interaction model

- **Precondition**: running in the iOS app (`isNativeShell()`, `build-017`). In Safari and on
  desktop nothing changes; this is a third mode beside `native` and `fallback`.
- **Trigger**: the existing **File ▾** menu items. `getFileCapabilities()` returns
  `mode: 'native-app'` with `canSaveInPlace: true`, `saveLabel: 'Save'`, `saveAsLabel: 'Save As…'`
  and `openLabel: 'Open…'`. No new menu is built: the labels come from the capabilities object, as
  `persistence-export.md` requires (a control is labelled by what its path can do).
  - **Save** with no file yet: asks for a name (default `projectFileName('native-app')`) in the
    existing name sheet, then writes `Documents/<name>.ndjson`.
  - **Open…**: a sheet listing `Documents/*.ndjson` by modified date, plus **Browse…**
    (`data-testid="file-open-browse"`), which calls `tauri-plugin-dialog`'s open.
  - **Export** controls: unchanged triggers; the write goes through the native path.
- **Feedback**: Save shows the existing saved state with the file name in the header. Export shows a
  toast *"Saved to Files › On My iPhone › WarpCad › Exports › part.stl"*. A file opened through
  **Browse…** that `build-018` item 8 shows cannot be re-read says so in the header (*"Opened a copy
  — Save writes to WarpCad's folder"*), so Save never claims to have written somewhere it did not.
- **Placement / Selection count**: n/a.
- **Selection response**: n/a.
- **Small-screen behavior**: the Open sheet is a bottom sheet at phone width, with 44 px rows and no
  horizontal scroll. The name sheet uses the existing phone sheet.

## Documentation

- **Page**: `docs/save-load.md`, new section "In the iOS app". `docs/export.md`, one paragraph on
  where exports go. `docs/ios-app.md` links both.
- **Example**: "Tap **File ▾ → Save**, type `bracket`, tap **Save**. Open the **Files** app, tap
  **Browse → On My iPhone → WarpCad**: `bracket.ndjson` is there. Back in WarpCad, move a part and
  tap **Save** again: the same file updates. To open a project from iCloud Drive, tap
  **File ▾ → Open… → Browse…** and pick it."
- **Media**: `e2e/docs/native-files.docs.js`, with stills of the Open sheet
  (`docs/screenshots/native-open-sheet.png`) and the export toast
  (`docs/screenshots/native-export-toast.png`), rendered at `/` with the `nativeShell` fixture and
  embedded in `docs/save-load.md`.

## Affected files

- `src/storage/fileSystem.js` (`getFileCapabilities`, `createFileStorage`), `src/storage/download.js`
  (route `downloadBytes` through the native write when `isNativeShell()`).
- `src/native/files.js` (new): `writeProjectFile`, `readProjectFile`, `listProjects`, `writeExport`,
  `pickFile`, all via `src/native/shell.js`'s `invoke`.
- The Open sheet component under `src/components/storage/`.
- `warpcad-native/src-tauri`: add `tauri-plugin-fs` and `tauri-plugin-dialog` (pinned).
  Capabilities grant fs read/write **scoped to `$DOCUMENT/**` only** and dialog open. Merged
  Info.plist: `UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace`,
  `CFBundleDocumentTypes` + `UTExportedTypeDeclarations` for `.ndjson` (an exported UTI such as
  `com.warpcad.project`, conforming to `public.json` / `public.text`). `PrivacyInfo.xcprivacy` with
  file-timestamp reason C617.1 (Tauri's fs plugin docs). A deep-link/open-URL handler that emits the
  opened path to the page.
- `src/composables/` (whatever owns `io-010`'s focus merge): give it a `readCurrent` for `native-app`
  files.
- `e2e/native-files.e2e.js`, `e2e/docs/native-files.docs.js`, `e2e/fixtures/nativeShell.js` (an
  in-memory fs for the fake IPC).

## Proposed fix

1. Read `build-018`'s items 7-9 first. If Files-app visibility failed, stop: the whole Save design
   rests on it.
2. Add the `native-app` mode as a third branch in `getFileCapabilities` (checked first, before
   `showSaveFilePicker`), and implement it with plugin commands. Write a temp file, then rename,
   as `mcp/projectFile.js` does, so a crash mid-save never leaves a torn project.
3. Never ship the Blob path in the app: `downloadBytes` throws in `native-app` mode if reached
   by a code path that was missed, so the gap fails loudly in tests rather than silently on the
   phone.
4. Inbound open: the open-URL event delivers a path. Copy it into `Documents/` if it lives outside
   (Mail attachments are in an inbox the app cannot write), then open it. A project that is
   already open goes through `ui-062`'s merge-or-replace dialog, as today.
5. Share sheet: **not** in scope. Files-app visibility covers "get the file out". If the owner
   wants **Share…** later, it needs a community plugin (`native-mobile-shell.md` Q7a) with its own
   health check, so file it as a follow-up.

## Effort

L.

## Testing

- Unit: `fileSystem.spec.js` (mode detection order: `native-app` wins over File System Access),
  `src/native/files.spec.js` against a mocked `invoke`, and the temp-and-rename sequence, including
  a failed rename.
- **`e2e/native-files.e2e.js` navigates to `/`** with the `nativeShell` fixture: place a box, Save,
  name it, and assert one file in the fake `Documents/`; move it and Save again, and assert the same
  file is updated, not a second one; Open lists it; export STL and assert a file in `Exports/` plus
  the toast; and assert that no `<a download>` click happens anywhere in the flow. **Phone, tablet,
  laptop** with snapshots (a new sheet). **Chromium, Firefox and WebKit** (persistence).
- **On device**: the doc example verbatim, then kill the app, relaunch, and **Open…** the file.
  Report PASS/FAIL.
- **Acceptance scenarios to re-drive**: 10 (save and reload), 11 (export a solid and confirm it
  opens elsewhere: on device, open the exported STL from the Files app in another app),
  22 (merge a copy of the project),
  23 (an agent edits the file you have open; on device, via `ai-026` once it exists, otherwise by
  replacing the file through the Files app), 26 (STL import still works from **Browse…**).
- **Closed findings re-run**: `io-008`'s repro (Save falls back to download when a native write
  is refused). In `native-app` mode a refused write must say so, never fall back to a Blob.
  `io-012`'s repro (warn on focus when the file may have changed).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

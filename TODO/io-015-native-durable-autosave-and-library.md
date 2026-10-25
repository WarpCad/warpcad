---
title: Mirror the autosave and My parts to native files so iOS storage eviction cannot lose them
category: io
kind: feature
priority: medium
model: sonnet
milestone: M19
depends: [io-014]
status: open
---

## Goal

Inside a WKWebView app, IndexedDB is **reclaimable by the OS**. WebKit gives non-browser apps a
15 % per-origin quota, eviction deletes an origin whole, and a 2024 WebKit bug lost the IndexedDB
connection after hours in the background (`native-mobile-shell.md` Q2). Today the autosave
(`src/storage/autosave.js`, IndexedDB `warpcad`) and the user library (`src/storage/userLibrary.js`,
`warpcad-parts`) live only there, plus the `localStorage` lifeboat (`localMirror.js`), which lives
in the same reclaimable store.

Done means, in the iOS app only: every autosave is also written to
`Application Support/autosave.ndjson`, and every My-parts change to
`Application Support/library/<id>.ndjson`. On launch, if IndexedDB is empty or unreadable and the
native copy exists, the app restores from the native copy and says so once. Nothing changes in
Safari or on desktop.

## Interaction model

- **Precondition**: running in the iOS app; IndexedDB is empty or fails to open at launch while the
  native mirror holds data.
- **Trigger**: app launch (automatic). No new control.
- **Feedback**: a one-time toast, *"Restored your last session from the app's backup copy."*
  (`data-testid="native-restore-toast"`). The restored project is the open project, with its
  History.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: the toast uses the existing toast position above the phone bottom
  sheet.

## Documentation

- **Page**: `docs/ios-app.md`, section "Where your work is kept": the open project and My parts are
  kept in two places, and what *Restored your last session* means. One line in
  `docs/user-library.md` pointing there.
- **Example**: "Place two parts and wait for the saved indicator. Delete and reinstall nothing.
  If iOS clears the app's web storage to free space, WarpCad finds the backup copy the next time
  you open it and shows *Restored your last session…*; your two parts are there."
- **Media**: `e2e/docs/native-restore.docs.js`, a still of the toast
  (`docs/screenshots/native-restore-toast.png`) in `docs/ios-app.md`.

## Affected files

- `src/storage/autosave.js` (a second sink after the IndexedDB write succeeds or fails; a native
  write failure never blocks or slows the IndexedDB path), `src/storage/userLibrary.js` (mirror on
  put/delete), `src/storage/localMirror.js` (flush also on the shell's pause event).
- `src/native/files.js` (from `io-014`): `writeAppData`, `readAppData`, scoped to
  `$APPDATA/**` (a second fs scope in the capability file, nothing broader).
- `warpcad-native`: the capability scope, and an app-lifecycle event (`RunEvent` / iOS
  `applicationWillResignActive`) emitted to the page for the early flush.
- `e2e/native-restore.e2e.js`, `e2e/docs/native-restore.docs.js`.

## Proposed fix

1. Write the mirror after the autosave's own debounce, with the same temp-and-rename as `io-014`.
   Keep decoded meshes out of it: it is the NDJSON project, which is what the file format already
   is.
2. Restore rule: native wins **only** when IndexedDB has no autosave. If both exist and differ (a
   crash between the two writes), take the one with the later Lamport stamp in the state line
   (`docs/decisions/document-sync.md`). Never merge here; this is recovery, not sync.
3. Pause flush: on the lifecycle event, run `localMirror`'s flush and the native mirror write.
   How much time iOS allows is **unverified**; measure it in the on-device step and record it in
   `native-mobile-shell.md` Question 8.
4. Out of scope: `navigator.storage.persist()` on the hosted PWA (a one-line web change the decision
   record suggests separately). File it as a finding if wanted.

## Effort

M.

## Testing

- Unit: `autosave.spec.js`. Mirror called after debounce; a mirror failure is logged and does not
  surface as *Not saved*. Restore rule with each combination: IDB only, native only, both equal,
  both differing (later stamp wins), native corrupt (ignored, with a message).
- **`e2e/native-restore.e2e.js` navigates to `/`** with the `nativeShell` fixture: place two parts,
  wait for save, then wipe IndexedDB (`indexedDB.deleteDatabase`) and reload. Assert the toast,
  both parts, and History. **Phone and laptop** snapshots (toast placement). **Chromium, Firefox and
  WebKit** (persistence).
- **On device**: place parts, force-quit within 1 s of an edit, and relaunch; record whether the
  pause flush caught it.
- **Acceptance scenarios to re-drive**: 10 (save and reload), 1 (two bodies remain after a restore).
- **Closed findings re-run**: the second attempt's "adding an item overwrote the previous one". A
  restore followed by a new placement must keep both.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

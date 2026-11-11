---
title: Ask the browser for persistent storage, so the autosave, My parts and stored keys are not evicted
category: io
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: []
status: open
---

## Problem

Everything the hosted app keeps for a user lives in IndexedDB: the autosave
(`src/storage/autosave.js`), the My parts library, and the credential database holding the BYOK API
key and GitHub tokens (`src/storage/tokenStorage.js`). The app never calls
`navigator.storage.persist()` and never reads `navigator.storage.estimate()`: a search of `src/`
finds no use of `navigator.storage` at all. So the origin's storage is "best effort", which the
browser may clear under storage pressure, and which Safari clears for a site not used for seven
days unless it is installed to the home screen.

What the user sees: they come back after a holiday and the project they never exported is gone,
with no message, because an evicted database reads as an empty one.

This was noticed and not filed. `docs/decisions/native-mobile-shell.md:100` records that no call
exists (2026-10-20), `:228` and `:674` recommend adding it to the hosted PWA as a cheap step, and
`warpcad-native/TODO/M19-io-015-native-durable-autosave-and-library.md:72` puts it out of scope with
"File it as a finding if wanted". This is that finding. The native app gets real files from
`io-015`; the web app, which is the shipped product today, gets nothing.

## Affected files

- `src/storage/persistentStorage.js` (new), `src/storage/persistentStorage.spec.js` (new)
- `src/composables/useStorageBoot.js` (calls it at the right moment)
- `src/composables/useStatusSurface.js` (one notice, when eviction is detected)
- `docs/save-load.md`

## Proposed fix

1. `src/storage/persistentStorage.js`, framework-free with `navigator.storage` injected:
   `requestPersistence()` returns `'granted' | 'denied' | 'unsupported'`; `storageEstimate()` returns
   `{ usageBytes, quotaBytes }` or `null`. Neither throws.
2. Call `requestPersistence()` **after the first successful autosave of a session that has content**,
   not at boot. Firefox shows a permission prompt for it; asking a first-time visitor before they
   have made anything is how the prompt gets denied. Chromium and Safari decide silently.
3. Remember that this browser has saved a project before, as a flag in `localStorage`, which Safari
   evicts on a different schedule from IndexedDB. If the flag is set and the autosave database opens
   empty, show one notice through the status surface: "Your browser cleared WarpCad's saved data.
   Open a project file to carry on." Today that case is silent.
4. Reword the autosave quota error (`autosave.js:93`) to include the estimate when one is available.
5. Do not call this inside the native shell (`isNativeShell`): `io-015` owns durability there, and
   `build-018` measures what WKWebView answers.

## Effort

S–M.

## Testing

- `persistentStorage.spec.js`: granted, denied, the API absent, the API throwing; estimate present
  and absent.
- `useStorageBoot.spec.js`: persistence is requested once, only after a save with content; the
  cleared-data notice appears only when the flag is set and the database is empty.
- `e2e/storage-persistence.e2e.js` (new, navigates to `/`): place a box, wait for "Saved", and
  assert `navigator.storage.persisted()` was asked for (stub `persist` through `addInitScript` and
  count calls). Then delete the autosave database with the flag still set, reload, and assert the
  notice. **All three engines**: this is persistence, and the three implement `persist()`
  differently. Laptop viewport only; the notice uses the existing status chip.
- Not verifiable in emulation: Safari's real seven-day eviction and whether `persist()` is honoured
  for a non-installed site. Record in `TODO/VERIFY.md` as a one-off: on the owner's iPhone, check
  `await navigator.storage.persisted()` in Safari before and after Add to Home Screen.
- Docs: `docs/save-load.md` gains a short "Where your work is kept, and when a browser may clear it"
  section, with the concrete step "use **File ▾ → Save** to keep a file you control".
- Acceptance scenarios to re-drive: 10 (save, reload, confirm nothing changed).
- Closed findings whose reproductions re-run: `io-001` (autosave), `io-008` (save falls back to
  download when a native write is refused).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

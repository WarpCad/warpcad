---
title: Make a reload pick up a new deploy, and tell the user when an update has landed
category: build
kind: feature
priority: high
model: sonnet
milestone: M10
depends: []
status: done
---

> **Shipped (2026-10-17).** As specified, with these differences. In `autoUpdate` mode the plugin's page code calls `location.reload()` the moment a new worker activates, so `src/pwa.js` passes `onNeedReload` to replace that with the banner; and `updateSW(true)` is a no-op in `autoUpdate` mode, so **Reload** is a plain `location.reload()` after `canReloadNow` (or the "Reload anyway?" question). `src/pwa.js` and a `virtual:pwa-register` type shim in `src/shims.d.ts` are new files not in the list; `stores/persistence.js` now exports `uiBusy`. The banner is the last in-flow row of the app column rather than a fixed overlay, so it cannot cover the nav chrome, gizmo or chat sheet. The unsaved check treats an unfinished autosave, an open pop-up/dialog, a sketch-tracing session, a drag, or a merge waiting on the open file as in progress. The delay observed on the real Pages site is not measured; see `TODO/VERIFY.md`. The decision note is `docs/decisions/hosting.md` "Update path"; no `TROUBLESHOOTING.md` entry was added (the root cause was confirmed in the generated worker and plugin source, not on Pages).

## Goal

After a deploy to GitHub Pages, an installed or already-visited WarpCad must show the new version
within one reload (and without the user clearing site data), and a tab left open for days must
notice that a newer version exists. Today the service worker precaches the whole app shell, so a
reload serves the old build until the new worker has installed, activated and taken control, and the
open page is never told.

Done means all of these hold:

- Deploy build A, open the app, deploy build B, reload once or twice: the page runs build B. No
  "hard reload", no "clear site data", no unregistering in DevTools.
- A tab that stays open across a deploy shows a small "A new version is available" message within a
  few minutes of the deploy (or when the tab regains focus), with a **Reload** control, and applies
  the update without losing the open project.
- The update never reloads the page out from under the user mid-edit: no automatic reload while a
  drag, a field edit, a sketch in progress, or an unsaved project is open (see Proposed fix §3).
- Offline still works: the Help text and still pictures precached by `TODO/ui-061` open with no
  network after install. Nothing in this task may regress that.
- The running build is identifiable (a version/commit string in Help or the About area), so "am I on
  the new build?" has an answer a user can read off the screen.

## What pipiece-ui does, and why it is only half of the answer

`~/src/rpi/pipiece-ui/ui/public/sw.js` is a two-line **no-op service worker**: it exists only so the
browser offers "Install", and it has no `fetch` handler, so nothing is ever cached by it. Every
request goes to the network, so a reload is always the newest build, and the stale-cache problem
cannot occur. It is registered by a bare `navigator.serviceWorker.register('/sw.js')` in
`index.html`, and the build version is stamped into the page (`<meta name="version">` and
`window.__PIPIECE__.VERSION`) so the running build is visible.

WarpCad cannot copy that wholesale. It is a static site on GitHub Pages with a precached shell
*on purpose* (offline Help, install-and-go on a phone). Its `vite.config.js` uses
`registerType: 'autoUpdate'` with a Workbox precache. So the part to port is the *outcome* (a reload
is never stale, the running version is visible), and the mechanism has to be chosen between:

| Option | Reload always fresh | Offline Help | Cost | Verdict |
|---|---|---|---|---|
| **A. pipiece's no-op worker** (drop precache) | yes | **no** | trivial | Rejected: breaks the `ui-061` offline Help requirement and the install-and-go phone case. |
| **B. Keep Workbox precache, fix the update path** (this task) | yes, after one reload | yes | small | **Recommended.** |
| **C. No service worker at all** | yes | no | trivial | Rejected: loses installability on some browsers and offline entirely. |

Option B in short: a precached shell is only stale when the new worker is not *activated and in
control* at reload time, or when the browser never *checks* for a new worker. Both are fixable.

## Interaction model

- **Precondition** — a new build has been deployed and the open tab's service worker has found and
  installed it (`onNeedRefresh`), or finished updating in the background. Nothing selected.
- **Trigger** — automatic detection, then a **Reload** button on a small non-modal toast
  (`data-testid="pwa-update-reload"`) with a **Later** dismiss. A manual **Check for updates** button
  lives in Help's About/version row (`data-testid="pwa-check-update"`) so a user can force the check
  without waiting. No keyboard shortcut.
- **Feedback** — toast text "A new version of WarpCad is available." with the version string. After
  Reload, the version string in Help changes to the new build. **Check for updates** reports "You
  are on the latest version" or "Update found, reload to apply".
- **Placement** — n/a (no geometry).
- **Selection response** — n/a.
- **Selection count** — n/a.
- **Small-screen behavior** — the toast is a bottom-anchored strip that clears the viewport
  navigation chrome and the AI chat overlay at 390px, with tap targets at least 44px. It never
  covers the transform gizmo or the orientation cube.

## Documentation

- **Page** — update `docs/help.md` (new short "Updating WarpCad" section) and `docs/README.md` if it
  lists installable-app behaviour. The app's own Help topic in `src/help/topics.js` gets the same
  text so it works offline.
- **Example** — "WarpCad updates itself. After a new version is released, a banner at the bottom of
  the window says *A new version of WarpCad is available*. Save your work, then click **Reload**. If
  you never see the banner, open **Help**, find the version line, and click **Check for updates**.
  The version number shown there changes when you are on the new build."
- **Media** — one shot, `e2e/docs/pwa-update.docs.js` → `docs/screenshots/pwa-update-toast.png`,
  embedded in `docs/help.md`. No movie.

## Affected files

- `vite.config.js`                                   (VitePWA: `cleanupOutdatedCaches`, `skipWaiting`/`clientsClaim` stated explicitly, `navigateFallback` check, `injectRegister`; define `__APP_VERSION__` / `__APP_COMMIT__`)
- `src/main.js`                                      (register through `virtual:pwa-register`, wire `onNeedRefresh` / `onOfflineReady` into the update store)
- `src/stores/appUpdate.js`                          (new: UI-only state, `needRefresh`, `lastChecked`, `checking`; no document state)
- `src/components/layout/UpdateToast.vue`            (new: the toast, mounted by the root layout)
- `src/components/layout/HelpSheet.vue`              (version line and **Check for updates**)
- `src/help/topics.js`, `docs/help.md`               (the "Updating WarpCad" text)
- `src/core/appUpdate.js`                            (new, framework-free: the "is it safe to reload now" predicate and the check scheduler, with injectable clock and registration)
- `src/core/appUpdate.spec.js`                       (new)
- `src/stores/appUpdate.spec.js`                     (new)
- `e2e/pwa-update.e2e.js`                            (new: production-build spec, see Testing)
- `e2e/docs/pwa-update.docs.js`                      (new)
- `docs/decisions/hosting.md`                        (append a short "Update path" section recording options A/B/C and the verdict)
- `TROUBLESHOOTING.md`                               (append via `/troubleshoot` once the real root cause is confirmed on the deployed site)

## Proposed fix

### 1. Make the worker take control the moment it is ready

- Set `registerType: 'autoUpdate'` explicitly (already the case) and add, under `workbox`,
  `skipWaiting: true`, `clientsClaim: true` and `cleanupOutdatedCaches: true`. `autoUpdate` implies
  the first two in the generated worker, but state them so a later plugin upgrade cannot silently
  change behaviour; verify against the generated `dist/sw.js` rather than trusting the docs.
- Confirm `navigateFallback` is `index.html` and that `index.html` is in the precache manifest with
  a revision. A stale `index.html` pointing at deleted hashed assets is the classic "blank page
  after deploy" failure, and `cleanupOutdatedCaches` is what removes the old entries.
- Confirm the runtime-cached GIFs (`helpRuntimeCaching()`) cannot serve a stale *HTML* or JS file.
  They are only `docs/media/*.gif`; keep the match that narrow.

### 2. Make the page *look* for updates

A precached shell is only replaced when the browser fetches `sw.js` and finds it changed. Browsers
do that on navigation, but a long-lived tab or installed PWA may go days without one.

- Register through `virtual:pwa-register` with `onRegisteredSW(url, registration)` and call
  `registration.update()` on a timer (every 30 to 60 minutes) and on `visibilitychange` to
  `visible`. The scheduler lives in `src/core/appUpdate.js` so it is testable with a fake clock.
- GitHub Pages serves `sw.js` with a ~10 minute `Cache-Control: max-age`, and the headers cannot be
  changed there. `registration.update()` bypasses the HTTP cache for the worker script by default
  (`updateViaCache: 'imports'`), so confirm on the deployed site that an update lands within the
  window and record the observed delay in the decision note. If it does not, say so and size the
  expectation honestly in the docs text instead of promising "immediately".
- `onNeedRefresh` sets `needRefresh` in the store; the toast shows. `onOfflineReady` is a one-time
  "ready to work offline" notice, shown once and remembered per version.

### 3. Apply the update without destroying work

- **Reload** calls the `updateSW(true)` function returned by `registerSW`, which activates the
  waiting worker and reloads.
- Never reload automatically. `src/core/appUpdate.js` exports `canReloadNow(state)`: false while a
  drag/gizmo/field edit is in progress or the project has unsaved changes. When it is false the
  toast's **Reload** button still works but first shows the standard unsaved-work confirmation;
  reuse the existing guard the project uses for closing or replacing a project rather than writing a
  second one. Look for it before adding anything.
- A merge waiting on the open file (`Changes waiting to merge`, `docs-022`) counts as unsaved.
- Document state is in IndexedDB and the project file, so a reload loses only transient UI state.
  Say that plainly in the docs text.

### 4. Make the running build visible

- Define `__APP_VERSION__` (package version) and `__APP_COMMIT__` (short `GITHUB_SHA`, `dev` when
  unset) in `vite.config.js` `define`. Show them in Help's version row and put them in a
  `<meta name="version">` like pipiece-ui does so DevTools and tests can read it without the UI.
- The version string is the oracle for the e2e spec in Testing.

### 5. Not in scope

- Server-side cache headers (not controllable on Pages).
- A kill-switch worker that unregisters itself. Mention it in the decision note as the recovery path
  if a bad worker ever ships (deploy a `sw.js` that calls `registration.unregister()`), but do not
  build it now.

## Effort

M (a few hours): the configuration and store are small; the production-build two-deploy e2e and
confirming real behaviour on Pages are most of the work.

## Testing

- **Unit** (`src/core/appUpdate.spec.js`): the scheduler calls `registration.update()` on the
  interval and on `visibilitychange` with a fake clock, stops when the registration is missing, and
  never throws on a rejected `update()`. `canReloadNow` is false for each in-progress state
  (drag, field edit, unsaved, merge waiting) and true otherwise.
- **Store** (`src/stores/appUpdate.spec.js`): `onNeedRefresh` sets `needRefresh`; **Later** clears
  it until the next detection; `checking` clears on both success and failure.
- **E2E, reachable** (`e2e/pwa-update.e2e.js`, navigates to `/` against the production build,
  `E2E_PREVIEW=1`, since the dev server has no service worker): build version A, load, wait for
  `onOfflineReady`; swap `dist` for version B, trigger **Check for updates** in Help, assert the
  toast appears, click **Reload**, assert the version string is B and the open project is intact.
  Also assert Help still opens with the network blocked (`context.setOffline(true)`).
- **Driven, not scripted**: re-drive the `TODO/ACCEPTANCE.md` scenarios touching persistence
  and Help offline by hand after the change (place two bodies, reload mid-session, confirm both
  remain), and do the two-deploy check once on the real Pages site with a phone, since this class of
  bug only shows on installed PWAs.
- **Closed findings**: this extends the `ui-061` offline-Help precache. Re-run that task's original
  reproduction (Help opens offline right after install) against the new build.
- **Browser engines:** all three. Service worker lifecycle, `registration.update()` and cache
  eviction differ between Chromium, Firefox and WebKit, and iOS Safari installed PWAs are the
  motivating case. Note that Playwright's WebKit does not model iOS standalone mode, so the phone
  check above is manual.
- **Small-screen behavior:** snapshot the toast at 390×844, 820×1180 and 1440×900.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

---
title: Defer the code the app does not use at boot (Sentry, the AI agent and tool registry, a dev-only provider)
category: perf
kind: feature
priority: low
model: sonnet
depends: [perf-002]
status: open
---

## Goal

A first visit on a slow mobile link reaches a usable app about a third of a second sooner, in every
supported engine, with no change on repeat visits or fast connections. Mechanism: four modules that
the production build loads at boot and never uses there are imported on first use instead.
`TODO/perf-002` measured exactly this change as an out-of-tree build, **defer-boot**
(`bench/results/2026-10-17-perf-002.md` section 7):

| `node bench/bundle-load.mjs`, production build, laptop 1440×900, median of 7 | baseline | defer-boot |
|---|---|---|
| `slow4g` cold, Chromium | 3,724 ms | **3,390 ms** |
| `slow4g` cold, Firefox | 3,912 ms | **3,581 ms** |
| `slow4g` cold, WebKit | 3,777 ms | **3,436 ms** |
| `slow4g-cpu4` cold, Chromium | 3,861 ms | **3,530 ms** |
| page JS on the wire before usable | 601.4 kB | **534.8 kB** |
| initial JS (`index.html` + modulepreloads), gzip -6 | 599.2 kB | **532.3 kB** |
| repeat (service worker) and unthrottled cold, every engine | — | within spread of baseline |

Done means the implemented build meets the **targets** in Testing below, all three engines, with
the bench's `--check` passing, and the warning's chunk left alone otherwise. This is **not** a
fix for the >500 kB warning: the boot chunk stays ~1.8 MB, and `chunkSizeWarningLimit` must not be
raised or silenced (perf-002 section 8).

- Note (2026-10-27): the boot chunk grew past Workbox's 2 MiB precache limit and the build failed;
  `vite.config.js` now sets `workbox.maximumFileSizeToCacheInBytes` to 4 MiB. A vendor split
  (three / sentry / vue groups) was tried and reverted: it makes five initial JS files, the pattern
  above that perf-002 measured as a slow-link loss. Source-map breakdown of what is in the chunk:
  `TODO/FIND-perf-004-kernel-registry-metadata-in-the-main-bundle.md`.

## Interaction model

No control is added, removed or moved. What changes is when code arrives, and the user must not be
able to tell:

- **Precondition** — n/a (no new control).
- **Trigger** — unchanged: the Assistant's Send, attaching an image, Undo AI turn; File ▾ → Help.
  The first Send (or attach) of a session now imports the agent and tool registry before it starts.
- **Feedback** — unchanged: Send shows the turn starting exactly as now. The import happens inside
  the existing pending state (`chat.canSend` / `chat.attaching`), so no new spinner is needed. If
  the import fails (offline with a stale or missing precache), the turn reports a failure notice in
  the transcript like any other failed turn, and the draft is not lost.
- **Placement / Selection response / Selection count** — n/a.
- **Small-screen behavior** — same as desktop (nothing moves).

## Documentation

No end-user page changes: nothing a user sees or does is different. One maintainer note:
`docs/decisions/error-reporting.md` gets a short "Loading" paragraph saying the SDK is fetched
after boot only when a DSN is set, and how errors thrown before it lands are kept (below).
No `e2e/docs/` shot or movie is added or changed.

## Affected files

- `src/core/errorReporting.js` — `import * as Sentry from '@sentry/vue'` becomes
  `import('@sentry/vue')` inside `initErrorReporting`, only when `VITE_SENTRY_DSN` is non-empty.
  The scrubbers (`scrubEvent`, `scrubBreadcrumb`, `containsSecret`) stay static and unchanged.
  **New**: until the SDK lands, buffer what would have been reported. Keep a short, bounded list
  (e.g. ≤ 20) of errors from a `window` `error` / `unhandledrejection` listener and from
  `app.config.errorHandler` (calling any previous handler), then `Sentry.captureException` each
  one after `Sentry.init`, through the same scrubber. Without a DSN nothing is installed, exactly as
  today. perf-002 did not have the buffer; it measured a bare dynamic import.
- `src/composables/useAgent.js` — `ai/agent.js`, `ai/image.js`, `ai/reference.js` and
  `ai/tools/image.js` load through one cached `loadAgentModules()` awaited at the start of `send()`
  and `attach()`. `undoTurn()` stays synchronous: if the modules were never loaded, no AI turn of
  this module can exist, so it returns early (the tab-endpoint branch above it is unchanged).
  `agentContext()` is only reached after the load.
- `src/composables/useWebMcp.js` — `createWebMcpLink` (`ai/webmcp/register.js`, which pulls in the
  whole tool registry) is imported after `modelContextOf()` finds `navigator.modelContext`;
  `startWebMcp` is already async and already returns early without it.
- `src/stores/assistant.js` — `createScriptedClient` (`ai/providers/scripted.js`, a **dev-only**
  provider that today ships in production and drags the tool registry with it) is imported inside
  the `import.meta.env.DEV` transcript branch of `start()`, which is already async.
- `vite.config.js` — `build.rolldownOptions.output.codeSplitting.groups:
  [{ name: 'app', tags: ['$initial'] }]`, so everything reachable at boot stays in **one** chunk
  and the deferred modules become a handful of lazy chunks. Without it Rolldown cut perf-002's
  similar build into 21 modulepreloaded files, which made WebKit bimodal on a slow link. Check
  whether this build needs the group at all; keep it only if the build without it has more than
  two initial JS files.

Explicitly **out of scope** (measured and rejected in perf-002): `defineAsyncComponent` for the
AppView sheets (they are mounted at startup, so they load anyway and cost a frame per repeat visit
at 4× CPU); vendor `codeSplitting` groups for load time.

## Effort

M.

## Testing

- **The benchmark and its targets** (`bench/bundle-load.mjs`, production build via `vite preview`,
  7 runs + 1 warm-up, the new build interleaved with a baseline built from `main`):
  - `--profiles slow4g`, cold, median: **≤ 3,450 ms Chromium, ≤ 3,650 ms Firefox, ≤ 3,500 ms
    WebKit** (measured 3,390 / 3,581 / 3,436; the margin covers the error buffer), and at least
    250 ms below the same run's baseline in each engine;
  - `--engines chromium --profiles slow4g-cpu4`, cold: **≤ 3,600 ms** and ≥ 250 ms below baseline;
  - every `repeat-sw` cell and every `none` cold cell: median no more than **15 ms** above that
    run's baseline, per engine;
  - page JS on the wire before usable **≤ 540 kB**, and no more requests before usable than
    baseline (5 / 7 / 6).
  Record the run in `bench/results/<date>-perf-003.md` beside perf-002's.
- **`node bench/bundle-load.mjs --check --build baseline=dist`** after `npm run build`: all 7 steps in
  all three engines, offline included (no console or page error, Assistant and Help open, every
  emitted JS file precached, server-offline reload usable).
- **`e2e/help-deep-link.e2e.js`** (`testing-012`) stays green: a cold `/#/help/<slug>` load must still
  open Help, because the `warpcad.com` home page (M20) links every docs page that way. Deferring
  `HelpSheet` would skip its `onMounted` hash read, and those links would land on an empty viewport.
- **`e2e/share-link.e2e.js`** (`io-016`) stays green: a cold `/#/share/v1/…` load must open the Shared
  view, so `useShareLink`, `SharedView` and `src/core/shareLink.js` must not be deferred behind a click.
- **Unit (Vitest)**: `src/core/errorReporting.spec.js` — `initErrorReporting` with no/blank DSN still
  returns false and installs nothing; with a DSN it resolves the dynamic import (the existing
  `vi.mock('@sentry/vue')` still applies), calls `Sentry.init` with the same options, and an error
  raised before the import resolves is captured once after init, scrubbed. `src/composables/useAgent.spec.js`
  — `send()` and `attach()` work from a cold module (first call loads), `undoTurn()` before any load
  is a no-op. `src/ai/providers/scripted.spec.js` unchanged.
- **E2E (app-level, navigates to `/`)**: `e2e/ai-chat.e2e.js` and `e2e/ai-scripted.e2e.js` (the first
  send now imports the agent; the scripted path imports its provider), `e2e/webmcp.e2e.js` (the
  registry now loads only with `navigator.modelContext`), and `E2E_PREVIEW=1 npx playwright test
  e2e/csp.e2e.js e2e/pwa-update.e2e.js` against the production build (lazy chunks under the CSP and
  in the precache). All three engines: this touches the service worker and persistence-sensitive
  boot path.
- **Acceptance scenarios to re-drive**: 1 (two independent primitives) against the production build,
  to prove the boot path is whole; 24 (edit while the Assistant works) and 25 (an MCP agent edits
  the open project), whose first AI action now imports deferred code.
- **Closed findings to re-run**: none was filed against these modules. Re-run the done tasks' own
  checks instead: `build-004` (no DSN → no Sentry request and no SDK chunk fetched; the CSP's
  `connect-src` unchanged), `ai-006` (the chat panel, Undo AI turn after a landed turn) and
  `ai-021` (WebMCP registers its tools where `navigator.modelContext` exists).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

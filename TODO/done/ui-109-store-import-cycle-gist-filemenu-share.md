---
title: Break the import cycle between the gist, file-menu and share stores
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-10 from the architecture audit
depends: []
status: done
---

> **What shipped (2026-11-13).** Two changes, not the ones the file guessed at. `share` and `gist` asked `fileMenu` to open a shared copy; they now call `useSharedOpenStore().ask()` (`src/stores/sharedOpen.js`, which imports nothing of theirs) and `fileMenu` takes each request through a synchronous watch. `fileMenu` imported `useGistPublish`, so its body moved to `src/stores/gistPublish.js` as `createGistPublisher`; `composables/useGistPublish.js` stays as a thin wrapper for the components. `scripts/import-cycles.spec.js` fails on any import cycle under `src/` and on any store that imports a composable. `useShareLink.spec.js`'s `boot` now creates the File menu store, as the app root does.

## Problem

An import-graph pass over `src/` (static imports, test files excluded) finds exactly one cycle, of
four modules:

- `src/stores/gist.js:45` imports `./fileMenu.js`, and `:47` imports `./share.js`
- `src/stores/share.js:46` imports `./fileMenu.js`
- `src/stores/fileMenu.js:73` imports `./gist.js`, and `:68` imports
  `../composables/useGistPublish.js`
- `src/composables/useGistPublish.js:81` imports `../stores/gist.js`

So `gist` and `fileMenu` import each other directly, and `fileMenu` is also the only store that
imports a composable (every other edge runs composable → store).

It works today because every use is inside a function called after all four modules have finished
loading. The cost is that it is fragile: a top-level use of any of these imports (a default value,
a constant) fails with a `ReferenceError` that depends on which module the bundler happens to
evaluate first, and that order differs between Vite dev, the production build and Vitest. It also
makes each store impossible to test without the other three.

## Affected files

- `src/stores/gist.js:45-47`
- `src/stores/share.js:46`
- `src/stores/fileMenu.js:68-73, 440`
- `src/composables/useGistPublish.js:81`

## Proposed fix

1. Read what each edge is used for. Likely `fileMenu` asks `gist` to publish, and `gist` and `share`
   ask `fileMenu` for the current file name or to close the menu.
2. Make the dependency one-way: `fileMenu` (the UI surface) may import `gist` and `share`; neither
   imports `fileMenu` back. Whatever they read from it moves to the store that owns that fact
   (`persistence` for the file name) or is passed in as an argument.
3. Move the store-facing part of `useGistPublish` so no store imports a composable: either the
   publish orchestration becomes an action on the gist store, or `fileMenu` receives the publish
   function from the component that already uses the composable.
4. Add the cycle check to the unit suite so it stays fixed: a small spec that walks static imports
   under `src/` and fails on any strongly connected component larger than one. No new dependency.

## Effort

S–M.

## Testing

- The new cycle spec (step 4), Chromium-independent, runs in Vitest.
- Existing `gist.spec.js`, `share.spec.js`, `fileMenu.spec.js` and `useGistPublish.spec.js` pass
  with at most import-path changes.
- E2E: existing gist and share specs (`gist-share.e2e.js` and neighbours). They touch `fetch` and
  persistence, so all three engines.
- Acceptance scenarios to re-drive: 29 (send a project) and 30 (publish and open from a short link).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

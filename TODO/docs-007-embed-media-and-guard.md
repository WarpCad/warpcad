---
title: Embed docs media in the markdown, add a guard against dead or orphaned images, update the process
category: docs
kind: feature
priority: high
model: sonnet
milestone: M10
depends: [docs-005, docs-006]
status: open
---

## Goal

Pictures only help if the pages reference them, nothing links to a missing file, and every
future UI task is told to add one. This task wires the three together:

1. A **convention** for embedding: from `docs/*.md` use `![alt](./screenshots/<name>.png)` and
   `![alt](./media/<name>.gif)`; from the repo-root `README.md` use `docs/screenshots/…` and
   `docs/media/…`. Every image has real alt text (it is the only description a screen-reader
   user or a broken-image fallback gets).
2. A **guard** (`e2e/docs-media.spec.js`, in the `guards` project beside `naming.spec.js`):
   - every image reference in `docs/**/*.md` and `README.md` resolves to a file;
   - every file in `docs/screenshots/` and `docs/media/` is referenced by at least one page
     (an orphan means a spec is producing a picture nobody shows);
   - every `docs/screenshots/*.png` is claimed by a `toHaveScreenshot('<name>')` call in some
     `e2e/docs/*.docs.js`, and every GIF by a `docs/media/manifest.json` entry — i.e. no
     hand-pasted image sneaks in that the tests would never refresh;
   - a manifest entry whose spec-content hash no longer matches its spec is reported as a
     stale movie (warning-level locally, failure in CI).
3. A **process change**, so this does not decay after the first backfill:
   - `.claude/commands/docs.md` Step 3 — screenshots/GIFs come from `e2e/docs/*.docs.js`
     (`npm run docs:media`), never from a manual capture; names the embed convention above.
   - `TODO/README.md` Documentation section and `CLAUDE.md` Conventions — a UI-touching
     task's **Documentation** section must also name the `e2e/docs/` shot(s)/movie(s) it adds
     or updates, same per-task gate as the usage example.
   - `.claude/commands/fix-todo.md` — Step that runs `npm run docs:screenshots`; a drift
     failure means "either regenerate (intended change) or fix the regression", never ignore.
4. A **README hero**: one still at the top of `README.md` (the app with a small model) —
   the full animated tour belongs to `docs-019`.

## Interaction model

n/a — documentation and tooling only.

## Documentation

- **Page** — `README.md` (hero still, "Docs media" pointer), `docs/README.md` (how pages are
  illustrated, one sentence).
- **Example** — a contributor adds a button; the task spec lists `e2e/docs/foo.docs.js`
  producing `foo-button.png`; they run `npm run docs:screenshots:update`, add
  `![The Foo button](./screenshots/foo-button.png)` to `docs/foo.md`, and `npm test` passes.

## Affected files

- `e2e/docs-media.spec.js` (new), `playwright.config.js` (add it to the `guards` project's
  `testMatch`), `README.md`, `docs/README.md`, `.claude/commands/docs.md`,
  `.claude/commands/fix-todo.md`, `TODO/README.md`, `CLAUDE.md`, `LICENSING.md`.

## Proposed fix

Parse markdown image syntax with a small regex (no new dependency; `![...](...)` with a
relative path); resolve against the containing file's directory. Keep the guard's output
actionable: name the page and line of each dead link and the spec that should have produced
each orphan. `CLAUDE.md` is the source of truth other skills read — update the Conventions
bullet, not a stray note. Do not re-license anything: new prose stays CC BY-SA 4.0 with its
SPDX marker at the end.

## Effort

S

## Testing

- The guard is itself the test; add fixture-based cases (dead link, orphan, unclaimed GIF,
  stale hash) under `e2e/docs-media.fixtures/` or as Vitest unit cases against the pure
  parsing function — extract it so it is testable without the filesystem.
- Engines/viewports: n/a (file-level guard, `guards` project runs once).
- `TODO/ACCEPTANCE.md` scenarios: none. Closed findings: none.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

---
title: Docs screenshot harness — Playwright stills that double as the documentation images
category: docs
kind: feature
priority: high
model: sonnet
milestone: M10
depends: []
status: open
---

## Goal

`docs/` and `README.md` have no pictures. This task builds the machinery that makes
screenshots a *by-product of a test*, so they can never silently go stale:

- A new Playwright spec kind, `e2e/docs/<topic>.docs.js`, that drives the running app at `/`
  to a known state and calls `expect(...).toHaveScreenshot('<name>.png')`.
- The baseline directory **is** the docs image directory: `docs/screenshots/<name>.png`.
  So `npx playwright test --project=docs-laptop` *fails* when the UI has drifted from the
  documented picture, and `--update-snapshots` *rewrites the docs image*. One command both
  refreshes the test baseline and the documentation. That is the requirement from the user:
  "updating the test screenshots should update the version in the documentation."
- `npm run docs:screenshots` (check) and `npm run docs:screenshots:update` (rewrite).

"Done": a pilot spec captures two real stills (empty scene, one placed cube selected), they
land in `docs/screenshots/`, a deliberate UI colour tweak makes the check fail, and
`docs:screenshots:update` makes it pass again with a changed PNG in `git diff`.

## Interaction model

n/a — test and tooling only; no user-visible control is added or changed.

## Documentation

n/a for end users. Contributors get a short "Docs media" section in `CONTRIBUTING.md` (how to
add a shot, how to refresh), and `docs-007` owns the `docs.md` command / `TODO/README.md`
wording changes.

## Affected files

- `playwright.config.js` — new projects `docs-laptop` (1440×900), `docs-tablet` (820×1180),
  `docs-phone` (390×844), all **Chromium**, `testMatch: /.*\.docs\.js/`,
  `snapshotPathTemplate: '{testDir}/../docs/screenshots/{arg}{ext}'` (drops the default
  `-{projectName}-{platform}` suffix so the file name is exactly what the markdown links to;
  phone/tablet shots carry the viewport in the `<name>` itself, e.g. `…-phone.png`).
  The existing browser matrix's `testMatch: /.*\.e2e\.js/` does not match `*.docs.js`, so
  these specs stay out of the 9-way matrix on purpose (they are not behaviour gates).
- `e2e/docs/support.js` — shared helpers (below).
- `e2e/docs/pilot.docs.js` — the two pilot stills.
- `e2e/support/` (new, only if the existing helpers — `openLibrary`, `dragRowIntoViewport`,
  `sceneBodies`, `openNavChrome`, copied per-spec today — are worth extracting) — extract
  rather than copy a 7th time. Do not rewrite existing specs in this task.
- `package.json` — the two scripts.
- `e2e/naming.spec.js` — extend: a `*.docs.js` must navigate to `/` and must not target
  Storybook.
- `CONTRIBUTING.md`, `LICENSING.md` (PNG/GIF under `docs/` are CC BY-SA 4.0 by path; they
  cannot carry an in-file SPDX marker — `scripts/spdx.mjs` only handles text types).

## Proposed fix

**Determinism is the whole job.** A docs image that differs by a pixel on every run is worse
than none. Helpers in `support.js`:

- `openApp(page)` — goto `/`, wait for the viewport's `data-*` readiness attributes (the
  specs already assert on `data-body-count`, `data-placing`, `data-ghost`), then wait for
  fonts and two animation frames.
- `loadScene(page, fixtureName)` — put the document in a known state *without* replaying
  drags (static shots must not depend on drag timing). Prefer the real File ▸ Open path with
  a fixture project file under `e2e/docs/fixtures/` so the shot also exercises persistence;
  fall back to a test-only hook only if Open cannot be driven headlessly, and say so here.
- `settle(page)` — `await page.evaluate(() => document.fonts.ready)`, freeze CSS
  transitions/animations and the caret (`toHaveScreenshot({ animations: 'disabled',
  caret: 'hide' })`), park the pointer off-canvas, and wait for the kernel worker to go idle
  (the evaluation-worker spec already has an idle signal — reuse it).
- `shot(page, name, { locator?, mask? })` — viewport or element screenshot; `mask` hides
  anything volatile (save-status timestamps, the hosted dot).
- WebGL: Chromium launch args `--use-gl=angle --use-angle=swiftshader` (software
  rasteriser) so the pixels do not depend on the contributor's GPU. Fixed
  `deviceScaleFactor: 2` for crisp docs images (decide, record the choice, keep it
  everywhere).
- Tolerance: `maxDiffPixelRatio` ≈ 0.01 default, overridable per shot; the number lives in
  one constant.

**Open decision to resolve in this task, not defer:** which platform is canonical for the
baselines. Software GL removes most GPU variance but font hinting still differs between
macOS and Linux. Recommend: baselines are generated on one pinned platform (the user's Mac,
since they will run `docs:screenshots:update` locally); the check is a *local/manual gate and
a nightly job*, not a blocking PR check, until a Linux generation path exists. Record the
choice in `CONTRIBUTING.md`.

## Effort

M

## Testing

- The pilot spec *is* the test: `npm run docs:screenshots` passes twice in a row with no diff
  (proves determinism), fails after a deliberate CSS change, passes after `:update`.
- `e2e/naming.spec.js` extension (guards project): fails for a `*.docs.js` that points at a
  Storybook iframe.
- Engines: **Chromium only**, on purpose — these are pictures for humans, not a
  cross-engine behaviour gate (the 9-way matrix already covers that). Viewports: all three
  projects exist; the pilot runs laptop only.
- `TODO/ACCEPTANCE.md` scenarios: none — nothing in `src/` changes.
- Closed findings re-run: none; no subsystem code is touched.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

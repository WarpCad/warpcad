---
title: Vite + Vue 3 + Vitest project scaffold
category: build
kind: feature
priority: high
model: sonnet
milestone: M0
depends: []
status: done
---

> Note: `core-001` (opened after this file was written) turned out to assume this
> scaffold already existed — its `depends:` frontmatter didn't list `build-001`, even
> though its Testing section required a working Vitest setup and its Affected files
> treated `package.json` as pre-existing. Surfaced and confirmed with the user before
> starting this task; `core-001`'s frontmatter should be corrected to declare this
> dependency when it's picked up next.


## Goal

Stand up the actual project — this repo currently has no `package.json` at all.
Concretely: Vite + Vue 3 + Vitest scaffold, `src/` directory structure matching
`CLAUDE.md`'s Project Structure section (`core/`, `render/`, `sketch/`, `storage/`,
`ai/`, `components/<category>/`, `views/`, `composables/`, `stores/`), `npm run
typecheck` (`tsc --noEmit`) wired as a script and CI gate, and
`e2e/naming.spec.js` guarding the `*.e2e.js` vs. `*.story.e2e.js` distinction from the
first commit — `CLAUDE.md` explicitly says to write this guard in the scaffold task,
not add it later.

Also do a **quick health-check re-confirmation** (stars/issues/last-release — not a
full Library-decision writeup) on the carried-forward Stack defaults this task is the
first to actually pull in as real dependencies: Playwright (E2E), Storybook (component
workshop), vite-plugin-pwa (PWA), Pinia (UI state) — per `CLAUDE.md`'s
Library-decisions rule that a health check runs "when it's actually about to be pulled
in," not only at initial mention. `three.js` is deferred to `render-001`, the task that
actually needs it — don't add it here just because it's in the Stack table.

Done when: `npm install && npm run dev` serves an (empty) app, `npm run typecheck` and
`npm test` (Vitest) both run clean, and `e2e/naming.spec.js` exists and fails the build
if a `*.e2e.js` (non-`.story`) spec is pointed at a Storybook iframe URL.

## Interaction model

n/a — build tooling only, no user-visible control yet (the first real control is
`render-001`'s viewport chrome).

## Documentation

n/a for `docs/` — no feature exists yet to document. Do add a top-level
`README.md` with install/dev/test/build instructions.

## Affected files

- `package.json`, `vite.config.js`, `vitest.config.js` (new)
- `tsconfig.json` or `jsconfig.json` with `checkJs`, per `CLAUDE.md`'s JSDoc/typecheck
  convention (new)
- `src/{core,render,sketch,storage,ai,components,views,composables,stores}/` skeleton
  directories (new, mostly empty/`.gitkeep`)
- `e2e/naming.spec.js` (new)
- CI config (e.g. `.github/workflows/ci.yml`) running typecheck + unit + e2e-naming
  gate (new)
- `README.md` (new)
- `docs/decisions/` health-check notes for Playwright/Storybook/vite-plugin-pwa/Pinia
  (append to or create short entries — full write-ups only required if a default is
  actually rejected)

## Proposed fix

Use `npm create vite@latest -- --template vue` as the base, then layer Vitest,
Playwright, Storybook, vite-plugin-pwa, and Pinia per their own current setup docs.
`e2e/naming.spec.js` should scan `e2e/**/*.js`, and for every file matching `*.e2e.js`
that is *not* `*.story.e2e.js`, assert it does not navigate to a Storybook iframe URL
(e.g. fails if it finds `page.goto` targeting a `:6006`/`iframe.html` pattern); the
inverse isn't required (a `.story.e2e.js` targeting `/` is unusual but not the failure
mode this guards against).

## Effort

M (a few hours)

## Testing

`e2e/naming.spec.js` is this task's one real test — run it against at least one
deliberately-wrong fixture spec (pointed at a Storybook iframe) to confirm it actually
fails the build, then remove the fixture. Chromium only — no WebGL/canvas/persistence
surface exists in this task (that starts at `render-001`). No acceptance scenario
touched yet (`TODO/ACCEPTANCE.md` scenarios need a real running app to drive against,
which this task doesn't yet provide). No closed findings to re-check.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

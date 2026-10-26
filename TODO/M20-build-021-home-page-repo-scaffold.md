---
title: Scaffold the warpcad.github.io repository: build script, tests, SPDX, Pages workflow
category: build
kind: feature
priority: medium
model: sonnet
milestone: M20
depends: [docs-026]
status: open
---

> **Two repositories.** This task creates `~/src/@WarpCad/warpcad.github.io` (a new git
> repository beside this one) and changes only `TODO/` and `docs/decisions/` here. Commit each
> repository separately. This file retires in this repository's commit. Creating the GitHub
> repository is an owner step (outward-facing, and the name is fixed): the task stops and asks
> before `gh repo create WarpCad/warpcad.github.io --public`.

## Goal

A home page needs somewhere to live before it has content. Done means:

- `~/src/@WarpCad/warpcad.github.io` exists, is a git repository, and builds a placeholder
  page, "WarpCad: parametric CAD in your browser" with one **Open WarpCad** link to
  `https://app.warpcad.com`, into `dist/` using the generator `docs-026` chose (proposed: plain
  HTML and CSS plus a zero-dependency `scripts/build.mjs`).
- `npm test` runs the guards and a Playwright e2e against the built `dist/` served locally, at
  the three reference viewports and on the three engines.
- `.github/workflows/pages.yml` builds, checks and deploys `dist/` to GitHub Pages on push to
  `main`, on a daily schedule, and on `workflow_dispatch` (the schedule is what refreshes the
  docs list in `docs-027`).
- `dist/CNAME` holds the canonical host from `docs-026` (proposed `warpcad.com`). A guard fails
  the build if it is missing or wrong, mirroring this repository's `scripts/cname.spec.js`.
- Nothing is pushed or deployed. That is `build-022`.

## Interaction model

The placeholder has one control, which `docs-027` replaces:

- **Precondition**: none.
- **Trigger**: the **Open WarpCad** link (`data-testid="open-app"`), the only element on the
  page.
- **Feedback**: the browser navigates to `https://app.warpcad.com/`.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: the link is a full-width button of at least 44 px height at
  390×844. There is no horizontal scroll at any reference viewport.

## Documentation

- **Page**: the new repository's `README.md`: what the site is, `npm install`, `npm run build`,
  `npm test`, `npm run serve`, and how a deploy happens. No `docs/` page in this repository yet.
  End-user docs change in `docs-027`, when there is something to point at.
- **Example**: "`npm install && npm run build && npm run serve`, then open
  `http://localhost:4173/` and press **Open WarpCad**."
- **Media**: none.

## Affected files

**New repository `~/src/@WarpCad/warpcad.github.io`:**

- `package.json`: scripts `build`, `serve`, `test`, `spdx`, `check`. `@playwright/test` pinned
  exactly as the only devDependency (same version as this repository's), and no dependencies.
- `src/index.html`, `src/styles.css`: dark primary, light via `prefers-color-scheme`, colours as
  CSS custom properties, `<meta name="color-scheme" content="dark light">`, and a background on
  `html` in the stylesheet's first rule, so Safari never paints a white frame (the
  `PREVIOUS-ATTEMPT.md` white-flash bug).
- `scripts/build.mjs`: copies `src/` to `dist/`, copies `favicon.svg`, `favicon.ico`,
  `apple-touch-icon.png` and `github-social-preview.png` from `$WARPCAD_WEB/public` (default
  `../warpcad`) when present, and otherwise from committed copies under `src/brand/`. Writes
  `dist/CNAME`. No network access yet (`docs-027` adds the docs index fetch).
- `scripts/serve.mjs`: a zero-dependency static server for `dist/` (Playwright's `webServer`).
- `scripts/spdx.mjs`: same rules as this repository's (`node ../warpcad/scripts/spdx.mjs`
  cannot be assumed on CI, so copy it with its marker).
- `scripts/cname.spec.mjs` (guard), run by `npm test` with `node --test`.
- `playwright.config.js`: projects `{chromium, firefox, webkit} × {phone 390×844, tablet
  820×1180, laptop 1440×900}`, names matching this repository's.
- `e2e/home.e2e.js`.
- `.github/workflows/pages.yml`: `actions/checkout` (no LFS), `npm ci`, `npm run build`,
  `npm run check`, Playwright Chromium only, `actions/upload-pages-artifact`,
  `actions/deploy-pages`. Triggers: `push` to `main`, `schedule` (daily), `workflow_dispatch`.
  Pin every action by version, as this repository's workflows do.
- `README.md`, `LICENSING.md` (code AGPL-3.0-or-later, prose CC BY-SA 4.0, as in WarpCad),
  `LICENSE`, `CLAUDE.md` (short: points at `../warpcad/CLAUDE.md` for the Responsive Layout,
  Browser Support, theming and licensing rules, and lists what is specific here: no client-side
  JS, links into the app use `#/help/<slug>`, nothing hand-captured), `.gitignore`.

**This repository:**

- `TODO/ROADMAP.md`, retirement only.

## Proposed fix

1. Re-read `docs/decisions/home-page.md`. If the generator is not the proposed plain build,
   replace the build and serve scripts above with that tool's equivalents. The other files stay.
2. `git init`, write the files, `node scripts/spdx.mjs --fix` after `git add`, first commit with
   `-s` (DCO).
3. Run `npx playwright install` only if the browsers this repository already has are not found;
   say so first (several hundred MB).
4. **Stop and ask** before creating the GitHub repository. Give the exact command and say that
   the name must be `warpcad.github.io` for the org site.

## Effort

M.

## Testing

- `e2e/home.e2e.js` navigates to `/` of the locally served `dist/`. It asserts the **Open
  WarpCad** link's `href`, that `document.documentElement.scrollWidth <= innerWidth` (no
  horizontal scroll), that the link's box is at least 44 px tall, and that the background is
  dark under `colorScheme: 'dark'` and light under `'light'`. Snapshot at each viewport.
- **All three engines × all three viewports.** The page has no WebGL, but WebKit is iPhone
  Safari, where the theming bug happened. Nine runs of a one-page spec take seconds.
- `npm run spdx` and the CNAME guard pass. The guard fails a `dist/` with no `CNAME` or with
  `app.warpcad.com` in it. That second case is the dangerous typo, because it would steal the
  app's domain on deploy.
- **Acceptance scenarios**: none in the app. This repository does not touch it.
- In this repository: `npm run spdx` passes on the retired file.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

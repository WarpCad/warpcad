---
title: Ship a THIRD-PARTY-NOTICES file with the built app and link it from Help
category: build
kind: feature
priority: high
model: sonnet
milestone: M18 — Launch: publish, app.warpcad.com, Sentry and GA
depends: []
status: open
---

## Goal

The deployed app carries the licence notice of every third-party library it ships, as MIT,
BSD and Apache-2.0 require, and a user can reach that notice from inside the app.

Today there is no `NOTICE` or `THIRD-PARTY` file in the repository. A local `dist/` build
(checked 2026-10-17) has no `@license` comment in any chunk, a "Copyright" string in only two
chunks (the glTF exporter and the evaluation worker), and none naming Vue, three.js's core or
Pinia. The pre-publish review (2026-10-17) flagged this, and the user chose
to fix it before the first deploy. `LICENSING.md` already says the runtime dependencies are
permissive and AGPL-compatible. This task makes the notices travel with the bundle.

Done means: `npm run build` writes `dist/THIRD-PARTY-NOTICES.txt` listing every production
dependency that reaches the bundle, with name, version, licence identifier, copyright line
and full licence text; the Help sheet links to it beside **Source code**; and a unit spec
fails if a bundled dependency's notice is missing.

## Interaction model

- **Precondition**: the Help sheet is open. Nothing needs selecting.
- **Trigger**: a **Third-party notices** link in the Help sheet's footer line, beside the
  existing **Source code** link (`data-testid="help-source-link"`). The new link carries
  `data-testid="help-notices-link"`.
- **Feedback**: the link opens `THIRD-PARTY-NOTICES.txt` in a new tab as plain text.
- **Placement**: n/a (not a geometry control).
- **Selection response**: n/a. **Selection count**: n/a.
- **Small-screen behaviour**: the two links share one line at laptop width and wrap onto two at
  390 px. The footer must not push the Help content off-screen or need horizontal scrolling.
  Tap target 44 px high.

## Affected files

- `scripts/third-party-notices.mjs` (new). Reads the production dependency tree from
  `package.json` and `package-lock.json` (and `mcp/package-lock.json` for any `mcp/`
  dependency the browser bundle includes: confirm which, if any, reach `dist/`), and
  returns the notice text. Pure function over a package list, so it is testable in Node.
- `scripts/third-party-notices.spec.js` (new).
- `scripts/vite-plugin-help.mjs` or a sibling plugin (new `scripts/vite-plugin-notices.mjs`),
  registered in `vite.config.js`, emitting the file as a build asset at the base path.
- `src/components/layout/HelpSheet.vue:272-273` (the footer line with the **Source code** link).
- `e2e/help.e2e.js` (a new test for the link).
- `docs/` page and `.claude/commands/test.md` are untouched.

## Proposed fix

1. Write `scripts/third-party-notices.mjs`. For each production package: its name, version,
   `license` field, the contents of its `LICENSE`, `LICENCE` or `COPYING` file if present, and
   its `NOTICE` file if it has one (Apache-2.0 requires `NOTICE` to be carried). A package with
   no licence file gets its `license` identifier and a line saying the text is the SPDX
   standard text, with the SPDX id; the spec decides which packages that applies to.
2. Emit the result as `THIRD-PARTY-NOTICES.txt` in the build, by a small Vite plugin.
3. Add the link to the Help sheet's footer, with the `help-notices-link` test id, using
   the base-relative URL the other Help assets use (the app is served under both `/` and
   `/warpcad/`; see `docs/decisions/hosting.md`).
4. Leave the PWA precache alone: a text link that needs network is fine for a legal notice.
   (If precaching is wanted, `HELP_PRECACHE_GLOBS` in `scripts/vite-plugin-help.mjs` is the
   place, and that is a separate decision.)
5. Do not touch dev dependencies: they are not distributed.

## Effort

M (a few hours).

## Testing

- Unit: `scripts/third-party-notices.spec.js` with a fixture dependency list. Assert the output
  contains each package's name, version, id and licence text; that an Apache-2.0 package's
  `NOTICE` is included; that a package missing its licence file is reported, not silently
  skipped; and that the output is byte-identical across two runs (sorted, no timestamps).
- Unit: a guard that every package `npm run licenses` counts as production has an entry in the
  generated file.
- E2E: a new case in `e2e/help.e2e.js` that opens Help at `/` and checks the link's
  `href`; against the production build (`E2E_PREVIEW=1`, as `e2e/pwa-update.e2e.js` does) it
  fetches the file and checks it names `three` and `vue`. Runs at all three viewports
  (phone, tablet, laptop) with a snapshot at each, because the footer layout changes.
- Engines: Chromium and WebKit at least; the link is plain DOM, so Firefox adds little, but
  the Help sheet's layout spec already runs on all three, so keep that.
- Acceptance scenarios: scenario 1 (place two solids) as a smoke check on the production
  build at laptop and phone width, since the build pipeline changes. Others: none.
- Closed-finding regression: `ui-061` (Help bundled in the app); re-run its repro that Help
  opens offline.

## Documentation

- **Page**: `docs/getting-started.md`, in the paragraph that describes Help (or the page
  that describes the footer, if one does); one sentence naming the link.
- **Example**: open **Help** (the `?` button), scroll to the foot, tap **Third-party
  notices**; a text page opens listing each library with its licence.
- **Media**: a still of the Help footer from an `e2e/docs/` shot (update the existing
  Help still if its footer shows).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

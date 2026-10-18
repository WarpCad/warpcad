---
title: Show the package version in the app header, next to the title
category: ui
kind: feature
priority: medium
model: sonnet
depends: [build-013]
status: open
---

## Goal

Show the app's version number in the header, beside the `WarpCad` title, so anyone looking at the
running app can tell which release they are using. The version is the `version` field in
`package.json` (`1.0.0` at the first release, `TODO/build-013`). Done means: the header reads
`WarpCad v1.0.0` (with the commit alongside, see Proposed fix) on every build, at every viewport,
without pushing any other header control off-screen.

This changes a decision made earlier. `TODO/ai-024` made Help and the update toast show the commit
alone (`build <sha>`), because the version was the placeholder `0.0.0` and looked unreleased. Once
`1.0.0` is the first release, that reason goes away. Before the first release, the header must not
show `0.0.0` (see Proposed fix).

## Interaction model

- **Precondition** — none. The version is always shown; no selection, mode, or prior action is
  needed.
- **Trigger** — none. It is a read-only label in the header's title group (`AppView.vue`,
  `data-testid="app-header"`). Tapping it does nothing; the version row in Help (`help-version`)
  is still the place that shows the full build string.
- **Feedback** — the label itself is the feedback. A test reads its text from the header.
- **Placement** — n/a. This is not geometry.
- **Selection response** — n/a.
- **Selection count** — n/a.
- **Small-screen behavior** — the label stays visible at phone width (390px). The header's
  existing hint text (`app__hint`, "Drag a shape in from the Library · …") is what truncates
  there, not the title. The label must not wrap onto a second line or push the document bar
  (`data-testid="document-bar"`) off-screen. At phone width it may use a smaller font, but it
  must remain readable and not be hidden.

## Documentation

- **Page** — `docs/help.md` gets a short section on the header and what the version label means.
  Check whether `docs/getting-started.md` names the header; if it does, add one sentence there.
- **Example** — concrete steps a user can follow: "Look at the top bar, to the right of the
  `WarpCad` title. It reads `v1.0.0 · a1b2c3d`. The version is the release you are running; the
  short code after it is the exact commit. To see the full build string, open Help (the `?` button)
  and read the version row." The implementer should confirm the commit string format and the Help
  button's label against the running app before writing this down.
- **Media** — none. A text label does not need a Playwright screenshot in `docs/screenshots/`. If the
  implementer adds one anyway, name it in this section and embed it.

## Problem

The header (`src/views/AppView.vue`, around line 240) shows the `WarpCad` title and the hint text,
but no version. Help has a version row, but it is not visible during normal use, so users cannot tell
which release they are on without opening Help.

The existing build label is also the wrong thing to show alone. `src/stores/appUpdate.js` builds
`buildLabel` as `build <commit>`, and `src/stores/appUpdate.spec.js` asserts that the label does not
match `/0\.0\.0|\+/`. That guard exists so the placeholder version never reaches the UI. Showing the
version directly would fail that guard until the first release exists.

## Affected files

- `src/views/AppView.vue`                    (add the version label to the title group in the header, near line 241)
- `src/stores/appUpdate.js`                  (expose `version` as a value the header can read; `version` is already a store field, `buildLabel` stays for Help and the toast)
- `src/components/layout/` (a small `AppVersion.vue` if the label needs its own styling, per `CLAUDE.md`'s view-size rule; optional)
- `src/stores/appUpdate.spec.js`             (update the `0.0.0` guard, see Proposed fix)
- `e2e/app-header-version.e2e.js`            (new: the reachability spec, see Testing)
- `docs/help.md`                             (the section described in Documentation)

## Proposed fix

**What the label shows.** `v<version>`, then a middle dot and the short commit, for example
`v1.0.0 · a1b2c3d`. The version tells a user which release they have; the commit tells a
maintainer exactly which build. In a local `npm run dev` build, where `GITHUB_SHA` is unset, the
commit reads `dev`, so the label reads `v1.0.0 · dev`. The implementer should confirm this format
with the user before writing the spec, because the label is what they will see.

**Before the first release.** `package.json` is still `0.0.0`. Two options:

1. Show `dev` in place of the version whenever the version is `0.0.0` (the placeholder). Keep the
   `0.0.0` guard in `appUpdate.spec.js` and extend it to the header. This keeps the `ai-024` intent.
   **Recommended.**
2. Let the header show `v0.0.0` until the release lands. Simpler, but it reintroduces the confusion
   `ai-024` removed.

**Where the value comes from.** The version already reaches the app as `__APP_VERSION__`
(`vite.config.js`, `define`), and `appUpdate.js` reads it into `version`. The header reads that store
field. Do not read `package.json` from a component.

**Small screens.** Verify at 390px that the hint still truncates and the label does not wrap. If the
title group runs out of room, the hint shrinks first. The label is never hidden to make space.

## Effort

S (< 1hr) for the label. Plus the time to decide the `0.0.0` behaviour.

## Testing

- **Reachability (required).** `e2e/app-header-version.e2e.js` navigates to `/`, reads the header's
  version label, and asserts it matches `v<package.json version>` with a commit suffix. It also
  asserts the label is not `0.0.0` in a production-style build, and is the `dev` form in `npm run dev`.
- **Three viewports (required).** The spec runs at phone 390x844, tablet 820x1180, and laptop
  1440x900 via Playwright viewport projects, with a snapshot at each. The header layout changes at
  every one of these widths.
- **Engines.** Chromium for the functional assertions. Add WebKit at phone width only, because
  the label's wrapping depends on font metrics, which differ between engines. Firefox is not
  needed for a text label.
- **Unit.** `appUpdate.spec.js`: the `0.0.0` guard now covers the header value too.
- **Acceptance scenarios.** Re-drive the scenario in `TODO/ACCEPTANCE.md` that places a cube and then
  a cylinder, at phone and laptop, because the header's layout changed. Record the result in its
  Last run line.
- **Closed findings this extends.** `TODO/ai-024` (the `0.0.0` placeholder must not reach the UI):
  re-run its original check, that Help and the update toast never show `0.0.0`, against the new label.
  `TODO/build-005` (the version row and the `<meta name="version">` tag): re-check that the meta tag is
  still `version+commit`, since this change reads the same field.
- **Dependency.** This task depends on `build-013`, because the header should show `1.0.0`, not
  `0.0.0`. If it lands first, the `0.0.0` option above applies.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

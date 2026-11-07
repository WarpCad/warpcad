---
title: Link the agent prompting guide from the warpcad.com home page
category: docs
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: open
---

## Problem

`docs-029` added `docs/agent-prompting.md` (served at `app.warpcad.com/help/agent-prompting.html`) and
left one step in `TODO/VERIFY.md` (`docs-029` #3): add the guide to the docs list on the home page, in the
other repository `~/src/@WarpCad/warpcad.github.io`. As of 2026-11-07 no file there mentions
`agent-prompting`. This is a one-line edit an agent can make, not a check for the owner.

## Affected files

- `~/src/@WarpCad/warpcad.github.io` — the VitePress page or config that lists the app's help pages
- `TODO/VERIFY.md` (`docs-029` #3, set `OK` with the commit)

## Proposed fix

1. Find where the home page lists help pages. `build-022` #10 says the home page links every page in
   the app's live `help/index.json`, so the list may be generated. If so, check that `agent-prompting` is
   in the live index and the generator picks it up, rather than hand-adding a line.
2. Otherwise add one line in the list's own style, linking `https://app.warpcad.com/help/agent-prompting.html`.
3. Build the home page (`npm run docs:build` or the repo's own build script) and confirm the link renders.
4. Commit in that repository with its own conventions (DCO sign-off, SPDX). Push only when the owner asks.

## Effort

S.

## Testing

- The home-page repository's build passes. Chromium only (a static link).
- Acceptance scenarios: none.
- Closed-finding regression: none.

## Interaction model

Not UI-touching in this app; one link on the home page.

## Documentation

- **Page**: the home page's docs list in `warpcad.github.io`; no media.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

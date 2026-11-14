---
title: Add a Storybook Playwright project so story snapshots can run
category: testing
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 when the theme umbrella (ui-111) closed
depends: []
status: open
---

## Problem

The theme chain added stories for the base components (`BaseButton.stories.js`, `TextInput.stories.js`,
`SegmentedToggle.stories.js`, and others), and the tasks' specs called for `*.story.e2e.js` snapshots of them. `ui-116` and
`ui-117` recorded those snapshots as **waived**: `playwright.config.js` has no Storybook project, so a `*.story.e2e.js` spec has nothing to run against.
CLAUDE.md says story specs prove a component in isolation and do not count as a user-facing capability, so the app-level specs carry the
weight, but the base components have no pixel-level check of each state (hover, disabled, danger, both themes) outside the app.

## Goal

A `storybook` Playwright project (a `webServer` that serves the built Storybook, or `storybook dev`) that runs `e2e/*.story.e2e.js`
across the three engines, plus story specs for the base components with a light and a dark snapshot each. `e2e/naming.spec.js`
keeps the story/app distinction. If the cost outweighs the value, close this with a decision record instead.

## Testing

- The new project runs in `npm run test:e2e:headless`'s rotation without lengthening it past its current budget; say what it adds.
- `e2e/naming.spec.js` still passes.
- Closed findings re-run: `ui-116` and `ui-117` waived story snapshots (now produced).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

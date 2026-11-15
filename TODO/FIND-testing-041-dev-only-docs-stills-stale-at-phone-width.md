---
title: Two dev-only docs pictures are stale at phone width, because no routine run exercises the dev-only docs specs
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-15 from the testing-025 drive of the build-015 row
depends: []
status: open
---

## Problem

`FIND-testing-025` ran the dev-only specs with `E2E_DEV=1` (build-015 #1). The five e2e specs were green
(chromium-phone + webkit-tablet, then chromium-laptop + webkit-phone: 33 passed, 11 skipped, 0 failed each), and the
known `docs/ai-live-bridge` "mcp-connected still" failure did not reproduce (passes at `docs-laptop`). The docs
specs at the phone and tablet projects (`docs-phone`, `docs-tablet`, light only) found two that fail:

1. `e2e/docs/ai-chat.docs.js:78` "ai-chat-overlay-phone still": waits the 2-minute docs timeout for
   `getByTestId('assistant-button')`. At 390 px the Assistant is inside the grouped AI menu
   (`ai-menu-button`) since `ui-078` (`ccc4184`, 2026-11-05), so the helper `askForWing` can never click it.
2. `e2e/docs/ai-live-mcp-header.docs.js:16` "ai-live-mcp-header still": `toHaveScreenshot(ai-live-mcp-header.png)` on
   `app-header` differs by 1036 px (ratio 0.06). The committed picture (`docs/screenshots/ai-live-mcp-header.png`,
   last regenerated `3a00437`, 2026-11-03) shows a separate Live MCP button between File and Assistant; the live
   header has none (the entry moved into the grouped menu with `ui-078`).

So `docs/screenshots/ai-chat-overlay-phone.png` (and its `.dark` twin) and `ai-live-mcp-header.png` (and its twin)
show a header that no longer exists, in the end-user pages that embed them. Nothing caught it because the three
specs only run under `E2E_DEV=1` (they need the dev host's live bridge or the scripted provider), and
`npm run docs:screenshots` and `e2e/docs-media.spec.js` do not drive them.

## Affected files

- `e2e/docs/ai-chat.docs.js` (`askForWing`: open the grouped menu first at phone width)
- `e2e/docs/ai-live-mcp-header.docs.js` (the header still and its caption/steps)
- `docs/screenshots/ai-chat-overlay-phone{,.dark}.png`, `docs/screenshots/ai-live-mcp-header{,.dark}.png`
- the `docs/*.md` pages that embed them (check the wording still matches the header)

## Proposed fix

1. Make `askForWing` (and any sibling helper) reach the Assistant through `ai-menu-button` at phone width.
2. Re-shoot the pictures with `npm run docs:screenshots:update` scoped to the dev-only specs
   (`E2E_DEV=1`, projects `docs-phone` and `docs-phone-dark`; never `docs:gifs`), and fix the page text that
   describes a separate Live MCP button.
3. Decide how the dev-only docs specs get run on a cadence (for example a line in `/test`'s release checklist or a
   `docs:screenshots:dev` script), so the next header change cannot strand them again.

## Effort

S.

## Testing

- `E2E_DEV=1 npx playwright test --project=docs-phone --project=docs-tablet e2e/docs/ai-chat.docs.js
  e2e/docs/ai-live-bridge.docs.js e2e/docs/ai-live-mcp-header.docs.js` green (progress reporters loaded).
- Re-run `build-015`'s original reproduction (the `E2E_DEV=1` e2e specs, rotating pair) against the new code.
- Engines: the docs projects are Chromium by design. Acceptance scenarios: 24 and 25 (the Live MCP entry) by
  their scripted plumbing only.

## Interaction model

Not UI-touching (specs, pictures and docs text only).

## Documentation

- **Page**: the `docs/` pages that embed the two pictures (`docs/mcp.md` and the assistant page; check by grep).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

---
title: Give the 390 px header a real width budget before the version label lands
category: ui
kind: finding
priority: medium
model: sonnet
depends: [ui-075]
status: open
---

## Problem

The phone header has no spare room. Measured at 390 px after `ui-075` (before its gap change), the
row was: title 65 + hint 0 + History controls 92 + timeline 44 + File 48 + save status 20 + Live MCP
44 + Assistant 44, with the Assistant button ending at x = 409, 19 px off-screen. `ui-075` fixed
that only by cutting the row gap (8 to 4 px), the document-bar gap (6 to 4 px) and the side padding
(10 to 8 px) in `AppView.vue`'s `max-width: 480px` block. That leaves about 7 px spare, and
`TODO/ui-077` (version label beside the title) wants more than that. Each new header control
repeats this squeeze, and the next one will silently overflow.

Also check: the 4 px gap between 44 px targets is below comfortable touch spacing, and the Help
entry did not appear in the measured row (confirm it is intentionally absent at phone width or
find where it went).

## Affected files

- `src/views/AppView.vue` (header, `.app__bar`, `.app__document-bar`, the 480 px block)
- `src/components/ai/LiveMcpButton.vue`, `AssistantButton.vue`, `src/components/layout/HelpEntryButton.vue`

## Proposed fix

Decide the phone header layout on purpose rather than by gap-trimming. Options to compare:
move the two AI entries (Live MCP, Assistant) into one grouped control; fold the lower-use
document-bar items (Help, save status) into File ▾ at phone width; or let the title collapse to
a monogram when the version label shows. Pick one, write the budget as a table (item, width) in
a comment above `.app__bar`, and restore gaps of at least 8 px between tap targets. Coordinate
with `ui-077` so the version label is designed into the budget, not squeezed in.

## Effort

M (a few hours). Needs a layout decision, so confirm the option with the user first.

## Testing

- E2E: extend `e2e/live-mcp-header-entry.e2e.js` (or a new header-budget spec) to assert, at
  390 px on all three engines, that every header control's right edge is within the viewport and
  that no two tap targets overlap, with a snapshot at all three viewports.
- Acceptance scenarios: re-drive 24 and 25 on phone.
- Closed-finding regression: `ui-075`'s phone header entry must still show and open its sheet.
- Engines: all three (WebKit layout differs on flex gaps).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

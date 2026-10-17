---
title: Add a Live MCP access entry to the phone header, so a keyed phone user can reach it without the laptop-only panel
category: ui
kind: feature
priority: medium
model: sonnet
milestone: unscheduled (user request 2026-10-17)
depends: []
status: open
---

## Goal

At 390 px, a user with an API key saved can turn on Live MCP access. Today the entry lives
in the Assistant panel, which is laptop-only, because the phone version pushed **Send** out
of the half sheet. A keyed phone user therefore has only the chip once access is on. The
user chose on 2026-10-17 (question 8 of the decision list) to add a header entry.

## Interaction model

- **Precondition**: an API key is saved. Live MCP access is available at every width, and
  its own state (on, off, timed) controls what the entry shows.
- **Trigger**: a **Live MCP access** entry in the phone header, next to the Assistant button.
  It opens the same access control the laptop panel opens.
- **Feedback**: the entry shows the access state, and the chip reflects the change as it does
  today.
- **Placement**: n/a (not a geometry-creation control).
- **Selection response**: n/a.
- **Selection count**: n/a.
- **Small-screen behaviour**: the entry sits in the 390 px header budget and must not push the
  Assistant button or the File menu off the row. Tap target 44 x 44 px.

## Affected files

- `src/components/layout/AppView.vue` (the header row at phone width)
- `src/components/ai/ConnectClaudeCode.vue` and `src/components/ai/BridgeChip.vue` (the access control
  the header entry opens)
- `src/stores/assistant.js` (the access state the entry reads)

## Proposed fix

Add the entry to the phone header and have it open the existing access control in a sheet
at phone width. Do not duplicate the control's logic. The laptop panel entry stays.

## Effort

M (a few hours). The header budget is tight, so check it before adding the entry.

## Testing

- E2E: a new case in `e2e/mcp-connected-assistant.e2e.js` (or a sibling) that runs on all 9
  projects, because the entry is a phone-width control.
- Layout: the header must fit at 390, 820 and 1440 px with no horizontal scroll. Snapshot at
  each viewport.
- Acceptance scenarios: scenario 25 (connected Assistant) and scenario 24 (connected half),
  re-driven on laptop and phone Chromium.
- Closed-finding regression: `ui-071` (hide Assistant chrome when an MCP agent is connected),
  re-run its repro.
- Engines: all three.

## Documentation

- **Page**: `docs/ai-partner.md`, under connecting an agent.
- **Example**: on a phone with a key saved, tap Live MCP access in the header, turn it on for
  15 minutes, then copy the endpoint into the agent.
- **Media**: a still of the phone header with the entry, from an `e2e/docs/` shot.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

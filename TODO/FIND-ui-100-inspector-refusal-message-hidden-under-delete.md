---
title: A refused Inspector edit's error message is drawn under the sticky Delete bar
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, outside the milestone plan (filed 2026-11-07 from the core-080 acceptance drive)
depends: []
status: open
---

## Problem

When an Inspector edit is refused, the reason is shown as one panel-level message under the whole
parameter list (`src/components/inspector/ParamFields.vue:503`). The sticky **Delete** bar sits over
the bottom of the Inspector, so at the moment of refusal the message is hidden behind it. Measured
during the core-080 drive: the message sat at y 799–859 at 1440×900 and was covered at 390×844
(the hit test landed on `inspector-delete`). The user has to scroll the Inspector to read why their
value was refused, and the edited field itself gets no error styling and just reverts. The core-080
rounded Cube made this likely, because its radius field is refused whenever it is too large for the
body, but the placement is a general Inspector problem.

Evidence: `test-report-for-coding-agents` screenshots from the core-080 drive, `d7c-wheeled.png`
(refusal after scrolling, laptop) and `ph2-chromium-visible.png` (phone). Those are not committed.

## Affected files

- `src/components/inspector/ParamFields.vue:503` — where the refusal message renders.
- `src/components/inspector/` — the sticky Delete bar's stacking and position.

## Proposed fix

Show a refusal next to the field that was edited, with the field's own error state (the same
`data-testid="inspector-param-error"` contract the existing error uses), so it is visible at every
width without scrolling. Keep the panel-level message as the fallback when no field is known.

## Effort

S (< 1hr) for the placement; M if the sticky bar needs restacking at phone width.

## Testing

- E2E, `e2e/rounded-cube.e2e.js` (names the radius-too-large case): type a radius too large for the
  body, assert the message is in the viewport at 1440×900 and 390×844 with the field outlined, and
  that it is not covered by `inspector-delete` (a hit-test at its centre). All three engines, all
  three viewports, with a snapshot at each.
- Acceptance: scenario 33 (calculate a size from two parts) refuses an edit the same way; re-drive
  it after the change.
- Closed-finding regression surface: none named.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

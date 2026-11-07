---
title: The Inspector's enum select is 23 px tall in WebKit at phone width, below tap size
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, outside the milestone plan (filed 2026-11-07 from the core-080 acceptance drive)
depends: []
status: open
---

## Problem

At 390×844 in WebKit, the Inspector's Rounded axis select (`data-testid="inspector-param-roundAxis"`)
renders 23 px tall. In Chromium at the same width it is 44 px. `CLAUDE.md`'s Responsive Layout rule says
tap targets stay at tap size, so 23 px fails it. The cause is probably the shared enum-field styling
rather than the Rounded axis control itself, which is why it is filed separately from core-080.
Measured during the core-080 drive; no screenshot is committed.

## Affected files

- `src/components/inspector/` — the shared enum `<select>` rendering used by every enum param field.
- `src/components/inspector/ParamFields.vue` — where enum fields are rendered.

## Proposed fix

Find why WebKit gives the native select a 23 px box and set a minimum tap height that holds on all
engines (the shared style, not a per-field override). Confirm the other enum fields (a Pi's Model,
a bolt's Size) get the same fix, since they share the code.

## Effort

S (< 1hr), unless WebKit needs a different form-control rule than Chromium.

## Testing

- E2E, `e2e/rounded-cube.e2e.js` at the phone project under the WebKit engine: assert the Rounded
  axis select's bounding box is at least 44 px tall. Also assert one existing enum field (a Pi's
  Model in `e2e/inspector-param-edit.e2e.js`'s setup) meets the same minimum.
- Runs on all three engines (Chromium, Firefox, WebKit) and all three viewports, with a snapshot at each.
- Acceptance: scenario 2 (hardware property edit) edits an enum field; re-drive it on the phone.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

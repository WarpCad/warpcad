---
title: The History panel's Apply button turns its text the same colour as its background on hover
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, outside the milestone plan (filed 2026-11-07 from the core-080 acceptance drive)
depends: []
status: open
---

## Problem

While hovered, the History panel's Apply button's text colour equals its background colour
(both `rgb(31,111,178)`), so the button reads as a blank blue rectangle. Found during the core-080
drive, which was not testing the button's styling. The colours are set in CSS, and `CLAUDE.md`
requires colours to be CSS custom properties, so the fix belongs in the token that the hover state
uses. No screenshot is committed.

## Affected files

- The History panel's stylesheet or component under `src/components/timeline/` (the Apply button's
  hover rule).
- The colour tokens on `:root` that the hover rule reads.

## Proposed fix

Give the hover state a text colour token that contrasts with the hover background in both light and
dark schemes, and check the Apply button's hover against the same contrast the rest of the app's
buttons use.

## Effort

S (< 1hr).

## Testing

- E2E, a new `e2e/history-apply-hover.e2e.js` navigating to `/`: hover the History panel's Apply
  button and assert its computed `color` differs from its computed `background-color`, and that the
  contrast ratio meets 4.5:1. Runs in light and dark (`prefers-color-scheme`) on all three engines,
  across all three viewports, with a snapshot at each.
- Acceptance: none. This is a styling-only change to one button; no scenario depends on its colour.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

---
title: The History edit form shows the rounded Cube's fields inconsistently and under different labels
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, outside the milestone plan (filed 2026-11-07 from the core-080 acceptance drive)
depends: []
status: open
---

## Problem

Editing a rounded Cube from the History panel (scenario 12's flow) differs from the Inspector in two
ways, both found during the core-080 drive:

1. **Round axis appears only when the record carries it.** A Cube whose `roundAxis` was set (for
   example to X) shows the Round axis field in the History edit form. A Cube left at the default Z,
   whose record omits `roundAxis`, does not show it. So the axis cannot be set from History on a
   default cube.
2. **Labels differ.** The History form says "Round radius" and "Round axis". The Inspector says
   "Corner radius" and "Rounded axis". The same parameter has two names on screen.

Measured with the History Edit form on a Cube; no screenshot is committed.

## Affected files

- The History edit form component under `src/components/timeline/` (the form that lists a record's
  params for editing).
- `src/core/inspector.js` — `withNativeSchema`, the source of the Inspector's field list and labels.

## Proposed fix

Read the History form's field list from the same schema the Inspector uses (`paramOptions` for
`primitive.cuboid`), so both forms show the same fields with the same labels and the default is
shown even when the record omits the key. Use "Corner radius" and "Rounded axis" in both.

## Effort

S (< 1hr) if the History form already reads the schema; M if it hard-codes its fields.

## Testing

- Unit: the History form's field list for a Cube with and without `roundAxis` in the record, asserting
  both show Rounded axis with the default Z, and the labels match the Inspector's.
- E2E, `e2e/rounded-cube.e2e.js` (new History case): edit a default-axis Cube's radius and axis from
  the History panel, then confirm the Inspector shows the same values. All three engines, all three
  viewports, with a snapshot at each.
- Acceptance: scenario 12 (edit a step in the middle of history and confirm it replays); re-drive it.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

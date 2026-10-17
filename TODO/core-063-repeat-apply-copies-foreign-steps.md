---
title: Repeat Apply copies a foreign step on the first part, listed as "Not part of the repeat", instead of disabling Apply
category: core
kind: finding
priority: medium
model: sonnet
depends: [core-061]
status: open
---

## Problem

`core-061` copies the source body's whole lineage into a repeat. When an Assistant, Claude
Code or merge step sits on the first part, Apply is disabled with *"… has a step you didn't
make … Cancel and make the part by hand"*. The original `core-061` spec said such a step
should instead be listed under *Not part of the repeat*. The user chose that behaviour on
2026-10-17 (question 5 of the decision list): let Apply copy it.

Affected: `src/core/repeat.js` (the foreign-step check) and the Repeat sheet's Apply
gate in `src/components/viewport/RepeatSheet.vue`.

## Affected files

- `src/core/repeat.js` (foreign-step detection and the copy)
- `src/components/viewport/RepeatSheet.vue` (the Apply gate and the *Not part of the repeat* list)
- `src/core/repeat.fold.spec.js`, `src/core/inspector.repeat.spec.js` (update expectations)

## Proposed fix

Replace the disabled-Apply rule for foreign steps. Apply copies the source's lineage
except for steps the user did not make. Those steps are listed under *Not part of the
repeat* with a one-line reason, and they are left out of every repeat. Keep the refusal for
cases that cannot be copied at all, and say which case is which in the sheet's text.

## Effort

M (a few hours). It changes a rule the user had just accepted, so the sheet wording needs
care.

## Testing

- Unit: a repeat from a part with a foreign step applies, lists the step under *Not part of
  the repeat*, and produces no copy of it at every target.
- Unit: a part whose lineage cannot be copied still refuses with a message.
- E2E: a new case in `e2e/repeat-placement.e2e.js` that runs on all 9 projects (three
  viewports, three engines), since the sheet is user-visible.
- Acceptance scenarios: scenario 10 and scenario 15 (repeat and repair), re-driven on laptop
  and phone Chromium.
- Closed-finding regression: `core-061`'s original repro steps, re-run against the new code.
- Engines: all three (the repeat is a WebGL-rendered path).

## Interaction model

- **Precondition**: a repeat is seeded on a body whose first part has a foreign step.
- **Trigger**: Apply in the Repeat sheet, unchanged.
- **Feedback**: Apply is enabled, and the sheet lists the foreign step under *Not part of
  the repeat*.
- **Placement**: n/a. **Selection response**: n/a. **Selection count**: n/a.
- **Small-screen behaviour**: same as desktop. The list reflows inside the sheet.

## Documentation

- **Page**: `docs/repeat.md` (update the section on foreign steps).
- **Example**: step-by-step, a body with an Assistant step, seed Repeat, tap Apply, read
  the *Not part of the repeat* line.
- **Media**: update the Repeat still in `e2e/docs/` if the sheet's appearance changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

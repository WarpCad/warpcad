---
title: Keep a parameter error clear of the pinned Delete footer in the phone Inspector sheet
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-15 from the testing-031 tap, timing and reach drive
depends: []
status: done
---

> **What shipped:** the refusal line already sat under the edited field (`ui-100`), so the fix is the scroll: `ParamFields.vue` scrolls a new refusal into view with `scrollIntoView({ block: 'nearest' })`, and `.params__error` carries `scroll-margin-bottom: 96px` (the pinned Delete row's height). The data-007 filleted-body spec in `e2e/inspector-param-edit.e2e.js` now asserts the line's bottom is above the Delete row (it was 67 px under it at 390x844 before). Re-run on Chromium and WebKit at all three viewports: 0 failed. The related unit specs and typecheck are green.

## Problem

Found measuring `TODO/VERIFY.md` `data-007` #1 (production build of the dirty tree at 2026-11-15, 390x844 touch emulation, Chromium). A 20 mm cube with a 4 mm top-rim fillet, selected, Size X typed as 5 (below twice the radius): the refusal line `Fillet on Cube 1 (step 2) would no longer build at this size: modify.filletRim: radius 4mm is wider than the cross-section can absorb ...` is a 366x76 px block at y 716-792. The sheet's pinned footer (the Delete row) starts at y 725, so **only the top 9 px (12 %) of the message is visible** at the scroll position the sheet is left at after typing (scrollTop 300), and the element under its centre is the footer. The field itself repaints to the real value (20), the line is readable only after another swipe of about 70 px. The same footer covers `Save to library` and the part's op caption at rest (`ui-051` #2 measure). On the 820 px tablet the column is tall enough that the line is clear.

## Affected files

- `src/components/inspector/ParamFields.vue` (where the error line sits)
- `src/components/inspector/Inspector.vue` (the pinned footer and the sheet's scroll padding)

## Proposed fix

When a refusal appears, scroll it into the visible area above the footer (`scrollIntoView({block: 'nearest'})` against the footer's inset), or move the line directly under the field being edited so the field's own focus scroll shows it. Check with a 390x844 e2e that the message's bottom is above the footer's top.

## Effort

S.

## Testing

- Unit test for any hit-test or layout change; an e2e spec at `/` at the viewports named above that taps the control through its scatter (see `bench/tap-scatter.mjs`).
- Re-run the `TODO/VERIFY.md` row named in Problem, `TODO/ACCEPTANCE.md` scenario 7 (touch-only viewport navigation), and the closed findings it touches.

## Interaction model

Precondition: a filleted body selected, Parameters section open. Trigger: type a size below the fillet's limit and press Enter. Feedback: the refusal line is fully visible above the footer without scrolling.

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

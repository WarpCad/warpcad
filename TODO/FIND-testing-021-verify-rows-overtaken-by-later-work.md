---
title: Re-check the VERIFY.md rows that later work appears to have answered, then close or reword them
category: testing
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: open
---

## Problem

Some `TODO/VERIFY.md` rows describe a gap that a later task appears to have closed. Those rows are still
`Open`, so the owner reads them as live problems. Each needs a short drive of the current build, and then
either a close with cited evidence or a reworded row.

Rows (entry and row number in `TODO/VERIFY.md`), with the change that probably overtook each one:

| Row | Claim in the row | Probably answered by |
|---|---|---|
| `docs-014` #1 | The Library has no Screw row, so a screw cannot be placed | `core-060` (one Bolt / screw row with a Type dropdown) |
| `docs-014` #5 | The smallest metric bolt or screw is M4 | `ui-068` mentions `M2.5 socket`, so smaller sizes exist; re-read `docs/hardware-library.md` |
| `core-016` #1 | Snap/Align cannot address a sub-part from the UI | `ui-040`, `ui-063` (sub-part operands on both Snap/Align operands) |
| `ui-020` #3 | There is no way to delete a sketch line, and no undo | `sketch-005` (select, edit, delete an outline), `data-003` (undo) |
| `ui-014` #1 (2026-09-10, empty PARAMETERS heading) | The Inspector shows an empty PARAMETERS heading for a boolean result | Unknown; drive a Subtract and look |
| `ui-039` #1 (toolbar-fit half) | The toolbar still fits at 390 px without wrapping badly | `ui-082` (Operations groups tier) moved Mirror; whether the glyph reads as "mirror" stays the owner's |
| `docs-012` #1 (fact half) | Grouping drops a body's own colour | `data-005`, `core-054` touched colour since; re-check, then the decision stays the owner's |

## Affected files

- `TODO/VERIFY.md` (each row: `OK` or `N/A` citing the commit or file that answered it, or reworded and left `Open`)
- `docs/hardware-library.md` and `docs/groups.md`, only if the page now states something untrue

## Proposed fix

1. For each row, find the change that answered it (`git log -S`, `TODO/done/`), then drive the current
   production build (`run-warpcad` skill) to confirm the behaviour on screen.
2. Answered: set Status `N/A` (the row is no longer checkable as written) and cite the task id and what
   the drive saw. Partly answered: reword the row to what is still open and leave it `Open`.
3. If a docs page still describes the old gap, fix the sentence in the same change, per `/docs`.

## Effort

S.

## Testing

- `npm run spdx` passes. If a `docs/` page changes, `npm run build` (help build) passes.
- Engines: Chromium. Viewports: phone for `ui-039` #1, laptop otherwise.
- Acceptance scenarios: none re-driven (each row is a single look).
- Closed-finding regression: none.

## Interaction model

Not UI-touching (verification and doc wording only).

## Documentation

- **Page**: `docs/hardware-library.md` and `docs/groups.md` only if their text is now wrong; no new media.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

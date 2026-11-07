---
title: Drive the VERIFY.md flow checks that only need the built app at laptop width
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: open
---

## Problem

These `TODO/VERIFY.md` rows describe a concrete flow with an expected result, and nothing in them needs
a device, a key or the owner. Several were blocked by something that has since landed: `core-028` #1
waited for `ui-039`, and `data-003` #2 waited for a non-local record source (merge and MCP now exist).
They were never driven, so they sit in the owner's queue for no reason.

Rows (entry and row number in `TODO/VERIFY.md`):

| Row | What to drive |
|---|---|
| `ui-090` #1 | Acceptance 6: with a body selected, the Objects header summary never changes which part row is selected |
| `ui-090` #2 | Acceptance 10: the Objects header reads the same after a reload |
| `ai-033` #3 | Open a project file that states an AI step limit of 3000 in a fresh browser context: the bar reads 1,000 and **Use 3,000** appears |
| `perf-003` #1 | `ai-006` on `npm run dev`: a scripted turn that lands a body, **Undo AI turn** takes it back, header Undo still reads correctly. The dev server is allowed here because the scripted provider exists only there |
| `core-054` #1 | Group a Cube and Cylinder, colour *Cylinder 1* alone, **Save to library…**, File ▸ New, drag the part in: the Cylinder keeps its colour and the Cube has the default |
| `core-042` #1 | Sketch 30 × 16 mm, Extrude Linear 30 mm, Twist 90, Done: volume about 14 400 mm³, and the solid is not inside-out (check the normals' orientation and look from several angles) |
| `core-053` #1 | Open a project with a row left broken (missing user part → **Leave broken**), **File ▾ → Export…** at Print and at Fine: the export finishes with the healthy bodies and no `evaluation-failed` |
| `core-028` #1 | Mirror a symmetric body with the default point: the committed copy is visibly separate from the original |
| `core-027` #1 | Place a Bolt / screw of type flat head: does it read as a countersunk screw (head cone wide end where a real one is)? Record the orientation found; whether orientation `down` is wanted stays the owner's call |
| `data-003` #2 | Produce a non-local record (a merge or an MCP write), then try to undo past it: the `history-refusal` message appears and reads sensibly, and say whether it shares the `save-status` chip |
| `ui-035` #1 | Place a Raspberry Pi 5 and try to drill into `hole1`–`hole4` by click, from above, below (orbit under the board) and at an angle. Record which angles reach each hole |
| `core-018` #2 | Place a `Spacer` (command layer if no Library row), render it, run `check_printability` on it, and look at where the mirrored braces cross and at the rounded ends for a sliver or near-tangent overlap |
| `ai-021` #5 (registry half) | Call `measure` and `check_printability` through the tool registry on a 50-body project: results come back whole with an `oversize` note. The real-Chrome WebMCP half stays in VERIFY.md |

## Affected files

- `TODO/VERIFY.md` (each row's Status and Notes)

## Proposed fix

1. Serve the production build with the `run-warpcad` skill. Use `npm run dev` only for `perf-003` #1.
2. Drive each flow as an exploring human (not a pre-written click script), reading the Inspector and
   History as a user would, and measuring the numbers the row names.
3. Record the result in the row's Status and Notes. Any defect becomes its own finding with its id in
   Notes. Rows 6 and 10 duplicate standing acceptance scenarios, so once they pass add an "Also re-drive"
   line to scenarios 6 and 10 in `TODO/ACCEPTANCE.md` for the Objects header summary.

## Effort

M.

## Testing

- No code change expected; `npm run spdx` passes.
- Engines: Chromium; add WebKit for `core-053` #1 (export path) and `ui-035` #1 (picking).
- Acceptance scenarios re-driven: 6, 10, 11 (export, through `core-053`), 16 (Mirror, through `core-028`).
- Closed-finding regression: `ui-035`'s occlusion reproduction is row 11.

## Interaction model

Not UI-touching (verification only).

## Documentation

- **Page**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

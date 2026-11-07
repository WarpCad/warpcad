---
title: Drive the VERIFY.md layout and engine checks that emulated viewports and the three Playwright engines can settle
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-07 from the VERIFY.md drivable-row triage
depends: []
status: open
---

## Problem

`TODO/VERIFY.md` holds about 445 `Open` rows. The 2026-11-07 triage found these rows ask only for
measurements that an AI drive can take: a wrap, a clip, an overlap, a sideways scroll, alignment,
colour separation, or an engine that was blocked when the row was written (Firefox, `TROUBLESHOOTING.md`
2026-09-17). They do not need a real phone, a real GPU or the owner's judgment, so they should not wait
in the owner's queue. Each row is marked `Moved` (or carries a "moved half" note) in `TODO/VERIFY.md`
and points here.

Rows (entry and row number in `TODO/VERIFY.md`):

| Row | What to drive |
|---|---|
| `ui-090` #3 | Re-run the `ui-089` Hide / Show / Show all steps at 390×844, plus the `ui-085` sideways-scroll check on the Inspector sheet |
| `ui-074` #1 | Select a repeat body at 390 px: the Inspector note wraps with no clipping and no horizontal scroll |
| `render-007` #1 | Subtract with a bolt over a cube at phone width, turn **Show hidden parts** off, look for a shadow ghost at the bolt base (screenshot and pixel diff against a scene with no bolt) |
| `render-007` #2 | Firefox in a **headed** window (not the snapshot helper) at tablet width: Show hidden parts on, then off, look for a faint grey bar at the bolt base |
| `ai-017` #2 | At 390 px in Scripted mode the chat header wraps: the header chip dot and the **Watch** toggle are not clipped and stay ≥ 44 px (or `--tap-compact` where that is the documented size) |
| `ui-085` #2 | The Help **?** sits at the content edge: measure its box against the hint's box at all three widths |
| `ui-086` #2 | Firefox and WebKit: the Align popover's header words sit centred over their columns, and the `− … +` rule spans the grid (CSS `subgrid`) |
| `ui-086` #3 | `prefers-color-scheme: light`: sample the amber and teal icon colours against the popover glass and report the colour difference (ΔE) and contrast ratio for each |
| `ui-050` #4 | Firefox desktop: the Align to origin row, its select and all ten buttons render and commit |
| `ui-048` #4 | Firefox desktop: the move arrows show a lit and a dark flank, the Z shaft is blue (not missing), and X/Y/Z stay red/green/blue in both themes |
| `ui-079` #3 (desktop half) | Sweep the viewport from 1440 to 390 px and back in 10 px steps in Chromium, Firefox and WebKit: no jump, text squash or cover of the gizmo or nav chrome. The real-iPad half stays in VERIFY.md |

## Affected files

- `TODO/VERIFY.md` (each row above: `OK`, `Issue` with a new id, or `N/A`, with the evidence in Notes)
- `e2e/` only if a check is worth keeping as a spec (see Proposed fix step 4)

## Proposed fix

1. Build the app and serve it with the `run-warpcad` skill (production preview, not the dev server).
2. Drive each row as an exploring human would, with Playwright at the reference viewports
   (`CLAUDE.md`, Responsive Layout) and the engine the row names. Measure, don't eyeball: use
   `scrollWidth` against `clientWidth`, `getBoundingClientRect` overlaps, and canvas pixel samples.
   Keep a screenshot per row under the scratchpad as evidence.
3. Write each result into the row's Status and Notes in `TODO/VERIFY.md`, naming engine, viewport and
   the measured numbers. A real defect becomes its own `TODO/FIND-<category>-<NNN>-….md`, with the id
   in Notes.
4. If a row is a WebGL, canvas or engine-specific check that has now been checked by hand more than
   once (`render-007`, `ui-048` #4), file one graduate TODO for a three-engine `*.e2e.js` spec rather
   than writing the spec inside this task (`CLAUDE.md`, Browser Support).

## Effort

M (a few hours of driving).

## Testing

- No code change expected; `npm run spdx` passes.
- Engines: Chromium, Firefox and WebKit, as each row names. Viewports: phone 390×844, tablet 820×1180, laptop 1440×900.
- Acceptance scenarios: none re-driven in full. `ui-090` #3 replays part of 6 (Group vs. sub-part selection).
- Closed-finding regression: `ui-089` and `ui-085` reproduction steps are the rows themselves.

## Interaction model

Not UI-touching (verification only).

## Documentation

- **Page**: n/a (no user-visible change).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

---
title: The Assistant's Half height sheet at 390x844 leaves the transcript a 26 px strip, so an activity row is not visible
category: ui
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-17 from VERIFY.md ai-014 #2 (TODO/testing-044)
depends: []
status: done
---

> **What shipped (2026-11-19):** the first option, with heights rather than folding rows. At 480 px and under, Half is 50dvh (was 36dvh) and Tall 68dvh (was 60dvh), the viewport's overlay inset follows (`AppView.vue`), and the static connection line folds away in Half (a failure still shows its text). The transcript is about 145 px in Half, with a body selected too. `e2e/ai-half-sheet.e2e.js` (scripted provider, dev host) asserts it on nine projects. `docs/ai-partner.md` does not describe the sheet height, so no prose changed; one still (`assistant-save-proposal`) was refreshed.

## Problem

VERIFY.md `ai-014` #2 expects, at 390x844, the activity row *Set piModel to 5* and a revisions-only **Undo AI turn** to be
reachable in the half-height chat sheet, with the Variables tab showing Pi 5 behind it.

Driven 2026-11-17 (`testing-044`), dev server with the scripted provider (a transcript that calls `set_variable
piModel 5`, no key, no network), Chromium 390x844. A Pi bound to a `piModel` variable, then the request. Results:

- **Undo AI turn** is reachable: 108 x 44 px at (12, 704), enabled, and no horizontal scroll (`scrollWidth` 390).
- The variable follows: the `piModel` select reads `5` and the reply says *Set piModel to 5. piModel Pi 4 → Pi 5, 1
  parameter on 1 part changed*.
- **The activity row is not visible in Half.** The sheet's header, model line, Undo and Limit buttons, the
  *Ask about…* chip and the composer fill the sheet. `ai-transcript` measures 366 x 26 px at y 698 (with nothing
  selected) or 366 x 0 (with a body selected, because the *Ask about Raspberry Pi 1* row takes the space). The row sits
  above the fold of that strip; the person must press **Tall**, where the transcript is 228 px and the row reads
  properly. Screenshots: `Half` shows only the last reply line.

So the half sheet shows the Assistant's last words at best, and nothing of what it changed.

## Affected files

- `src/components/ai/` the Assistant panel layout (the transcript's flex share in the Half and Tall sheets)
- `e2e/` an Assistant phone spec that asserts the transcript's height in Half

## Proposed fix

Give the transcript a minimum height in Half at phone width (at least two activity rows, about 120 px) by folding
the secondary rows (the *Ask about* chip, the token readout) into one line or moving them below the composer in Half.
If that cannot fit, make Half open to the latest activity row by scrolling the transcript to its end, and say so.

## Effort

S.

## Testing

- App-level `*.e2e.js` at `/` with the scripted provider (dev-only; `E2E_DEV=1`): at 390x844 in Half, after a turn with
  an activity row, the row's bounding box lies inside the visible transcript and is at least 40 px tall.
- All three viewports; Chromium plus one more engine (layout, not WebGL).
- Re-run VERIFY.md `ai-014` #2. Closed findings: `ui-071` (the folded sheet) and `ui-029`/`ai-029` (sheets overlaying the
  viewport).
- Acceptance scenarios: 24, 25 and 17 at phone width (the Assistant sheet).

## Interaction model

- **Precondition:** the Assistant open at phone width, Half, after any turn that produced an activity row.
- **Trigger:** the existing Half / Tall / Fold buttons.
- **Feedback:** the latest activity row and the Undo AI turn button are both visible without pressing Tall.
- **Small-screen behavior:** this is the small-screen behaviour.

## Documentation

`docs/ai-partner.md` only if the sheet's layout is described there (one sentence).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

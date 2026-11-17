---
title: Reword the Repeat panel lines, the Repeat Inspector note, the Bolt summary and the Bill of materials line
category: ui
kind: finding
priority: low
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-029 cold-read panel
depends: []
status: open
---

## Problem

Two independent fresh agents read these strings with no documentation. Both found each one unclear or misleading:

1. **Not part of the repeat** line (`core-063` #2): *From the Assistant, so it is left out of the copies* (and the *Claude Code*, *merge*,
   *another body* variants) never says Bolt 1 keeps the step. Both agents asked for exactly that. Proposed: *Added by the Assistant. Bolt / screw
   1 keeps it; the copies don't get it.* (and *Added by Claude Code…*, *Added by a merge…*, *On a different part, so it is not copied*).
2. **The one refusal** (`core-063` #3): *The only step that points at hole1 is from the Assistant, and it is left out of the copies, so there
   is nothing to repeat. Make that step yourself.* Both agents called it too long for 340 px, "points at hole1" jargon and "Make that step
   yourself" vague. Proposed: *Nothing to repeat: the only step on hole1 was made by the Assistant, and repeats skip those. Redo that
   step yourself to include it.* Source: `src/stores/repeat.js` (about line 300).
3. **The Inspector note on a repeat body** (`ui-069` #2): *Edit an earlier step in History to move the repeats; a new move of Bolt / screw 1 or
   Raspberry Pi 1 moves only that part.* (already corrected by `ui-074`). One agent called it unclear, one misleading: "that part" and "the
   repeats" are undefined, and it does not say the copies stay put. Proposed: *The copies follow the first bolt's steps. To move them all,
   Edit an earlier step in History. A new move of Bolt / screw 1 or Raspberry Pi 1 moves only that one; the copies stay.* Source:
   `src/core/repeat.js` line 641.
4. **The Bolt / screw summary line** (`ui-068` #1): both agents preferred the full form over `× 8 mm` ("does not say what is measured"):
   `M2.5 socket × 8 mm`, or `M2.5 socket, 8 mm long`.
5. **The Bill of materials line** (`ui-038` #2): `Bolt / screw M10 hex × 20 mm  × 2` uses × for both length and count and the total
   `(3)` has no label. Proposed: `Bolt / screw M10 hex, 20 mm long: qty 2`, `Washer M6: qty 1`, `Total parts: 3`.

Caveat: these were judged from the strings in a prompt, not from the live panel.

## Affected files

- `src/stores/repeat.js`, `src/core/repeat.js`, the Library's bolt summary line, the Bill of materials component.
- Their specs (`src/stores/repeat.spec.js`, `src/components/inspector/RepeatSection.spec.js`, `src/core/inspector.repeat.spec.js`,
  `e2e/` Repeat and BOM specs) and `docs/snap-align.md`, `docs/bill-of-materials.md` quotes of these strings.

## Proposed fix

Change the five strings as above; update every quoted copy in the docs and the specs that assert them.

## Effort

S.

**Added 2026-11-17 (owner, /owner, OWNER.md Q6):** the Save to library sheet says *Saves this group as a fixed part* for a single imported mesh too. When the source is one body (not a group), say *Saves this as a fixed part*. VERIFY.md `ui-107` #4.

## Testing

- Unit specs above; the Repeat and BOM e2e specs on the rotating pair. Responsive: the 390 px lines wrap in two lines at most.
- Re-run the `core-063`, `ui-069` and `ui-038` reproductions.

## Interaction model

Precondition: an open Repeat session with a foreign step, or a bolt and washer placed. Trigger: none new. Feedback: the new wording.

## Documentation

- **Pages**: `docs/snap-align.md`, `docs/bill-of-materials.md` (quoted strings).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

---
title: Repeat body Inspector note says the repeats follow every move, but a later move of a Pi moves only the Pi
category: ui
kind: finding
priority: low
model: sonnet
depends: [core-061]
status: open
---

## Problem

The repeat body's Inspector note reads *"Move Bolt / screw 1 or Raspberry Pi 1; the repeats
follow them"*. A new move of either part, by gizmo or typed value, after the Repeat moves
only that part. Only editing an earlier History step carries everything along. The note is
misleading. The user chose on 2026-10-17 (question 7 of the decision list) to reword it.

This wording is `core-061`'s sentence, so the change is a core-owned string, but the
user-visible result is a UI change.

## Affected files

- The Inspector note string for a repeat body (find it by its text, in `src/components/inspector/`
  or `src/core/repeat.js`)
- `src/components/inspector/RepeatSection.spec.js` (the note's expected text)

## Proposed fix

Reword the note to say what happens. For example: *"A move here moves only this part. To
move the repeats too, edit the step in History."* Keep it short, and do not change the
behaviour.

## Effort

S (< 1 hr).

## Testing

- Unit: the note's text in `RepeatSection.spec.js`.
- E2E: the repeat placement spec on the laptop project only, since the note is a single
  string and does not change the layout.
- Acceptance scenarios: none beyond the repeat flow in scenario 15, which is not affected by
  the wording. Say so in the verification notes.
- Closed-finding regression: none.

## Interaction model

- **Precondition**: a repeat body is selected in the Inspector.
- **Trigger**: n/a (the note is shown, not clicked).
- **Feedback**: the reworded note.
- **Placement**: n/a. **Selection response**: n/a. **Selection count**: n/a.
- **Small-screen behaviour**: same as desktop; check the note still wraps at 390 px.

## Documentation

- **Page**: `docs/repeat.md`, the paragraph on moving a repeat body.
- **Example**: after a Repeat, move Raspberry Pi 1 and note that only it moved; then edit the
  step in History to move the repeats.
- **Media**: n/a.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

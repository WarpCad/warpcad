---
title: Sketch editor — select an existing outline, then edit or delete it (finding from hand-use)
category: sketch
kind: finding
priority: high
model: sonnet
milestone: M8
depends: [sketch-001]
status: done
---

> **What shipped (2026-10-03).** Hand repro on the running app (laptop Chromium, real mouse) showed
> **Problem 1** and **Problem 3**: with the Circle tool armed, an 8 px press on a circle's edge drew a
> stray third circle (only a press that never moved selected), and there was no toolbar Delete while
> Delete/Backspace did nothing to the picked outline. **Problem 2** was partial (the picked stroke
> already drew thicker, but nothing named it and the Inspector sheet is closed at phone width).
> **Problem 4 did not reproduce**: `profileAtPoint` already picked open chains by stroke and let a stroke
> beat an interior, so it needed no code change, only regression specs. Shipped as specified: a **Select**
> tool (first in the tool group, an arrow; a press picks, a drag neither draws nor orbits and still picks
> the press point), a toolbar **Delete** (trash, 44 px, `sketch-delete`), Delete/Backspace acting on the
> selected outline while the editor is open (`useDeleteShortcut` yields to the editor), a selection status
> line (`Circle, Hole — 15 mm radius`), desktop hover highlight under Select, a crosshair/arrow cursor, and
> the `docs/sketch-mode.md` section with a new `sketch-select-outline.png` shot. One cost to know about:
> the phone toolbar now wraps to a third row, taking the resting reachable canvas from 76 % to 69 %, the
> ui-020 #3 floor exactly (logged in `TODO/VERIFY.md`).


## Problem

Filed from the user's hand-use of the shipped Sketch editor (2026-10-02): *"I cannot select
an existing item and edit or delete it."*

The code says it should work: `Viewport.vue`'s `pickSketchProfile` calls
`profileAtPoint` on a tap, `sketchEditor.selectProfile` stores the id, and
`SketchProfileFields.vue` has Solid/Hole and a **Delete outline** button
(`inspector-sketch-delete`). sketch-001's e2e even passes. So the defect is in the gap
between what the code does and what a person can *find and do*, and **the first step of
this task is to reproduce it by hand and say which of these it is** before changing
anything (this is exactly the failure class `SECOND-ATTEMPT.md` describes):

1. **No way to pick while a draw tool is armed.** The editor always has one of Line /
   Rectangle / Circle / Polygon armed (`SKETCH_TOOLS`, default `circle`), so a press that
   lands on an existing outline *starts a new drawing* and a plain tap only selects if it
   never crosses the drag slop. There is no **Select** tool.
2. **Selection has no visible feedback.** A freshly drawn outline is deliberately not
   auto-selected (ui-020 finding #3), and the selection is only reflected in the Inspector
   sheet, which is closed while drawing, so a tap that did select looks like nothing.
3. **Delete is not where a person looks.** It exists only as an Inspector button; the
   toolbar has no Delete, and Delete/Backspace is bound to *body* deletion
   (`useDeleteShortcut.js`), not to the selected outline.
4. A hit-test miss (`profileAtPoint` only hits a stroke within tolerance or the interior of
   a *closed* outline, so an open Line chain is selectable only by its stroke).

## Goal

A person in the sketch editor can pick any outline on the active slice, see that it is
picked, change it, and delete it, with mouse or touch, no keyboard needed.

## Interaction model

- **Precondition**: the editor is open. *Select* needs nothing. *Edit* and *Delete* need
  exactly one outline selected (selection count = 1; the editor is single-select).
- **Trigger**:
  - A **Select** tool (arrow icon, `data-testid="sketch-tool-select"`) first in the
    toolbar's tool group. While it is armed a press on an outline selects it and a press on
    empty canvas clears; it never draws. Tapping an outline while any *draw* tool is armed
    also selects it when the press does not move (a tap), and draws when it does (a drag).
    Pointer-down, drag, pointer-up, **no modifier** on any pointer type.
  - **Delete** in the toolbar (trash icon, `data-testid="sketch-delete"`), enabled only
    with one outline selected, plus Delete/Backspace while the editor is open and no text
    field has focus. Inside the editor these act on the selected *outline*, never the
    underlying body (`useDeleteShortcut.js` must yield to the editor).
  - Editing the selected outline: unchanged from sketch-001 (Solid/Hole toggle, shape
    numbers in `SketchProfileFields.vue`). Dragging the outline's points is
    `TODO/sketch-002`; this task makes sure that task has a selection to attach to.
- **Feedback**:
  - The selected outline draws thicker and in the selection colour, with a visible "hole"
    badge if it is a Hole (sketch-001's rule), and the toolbar's Delete lights up. The
    hovered outline highlights on desktop.
  - A one-line status under the toolbar names the selection: "Circle, Hole — 15 mm radius".
  - Delete removes the outline from the draft only; it is part of the editor's one undo
    step (Cancel still discards everything; Done commits once).
  - If a tap hits nothing, the selection clears and nothing else changes.
- **Selection response**: selecting never opens the Inspector sheet by itself at phone
  width (ui-020 #3: reachable canvas must stay ≥ 69%); the toolbar status line is the
  feedback there, and the sheet opens only from an explicit tap on it.
- **Small-screen behavior**: the Select and Delete buttons are ≥ 44 px tap targets and fit
  the existing phone toolbar slot (re-check against `ui-043`'s overlap rule). Touch has no
  Delete key, so the toolbar button is the only delete path on a phone.

## Documentation

Update `docs/sketch-mode.md` (the *Sketch primitives* page): add **Selecting, editing and
deleting an outline**. Example: "Draw two circles. Tap **Select**, tap the larger circle's
edge: it turns thick and the status line reads *Circle, Solid*. Tap **Hole** to make it a
hole, then tap **Delete** to remove it. Tap empty canvas to clear the selection."

## Affected files

- `src/stores/sketchEditor.js` (a `select` value in `SKETCH_TOOLS` / `SketchTool`;
  selection status text), `src/components/viewport/SketchToolbar.vue` (Select, Delete),
  `src/components/viewport/Viewport.vue` (press routing: select tool never draws; tap vs
  drag under a draw tool), `src/components/viewport/SketchStrokes.vue` (selected / hover
  styling), `src/composables/useDeleteShortcut.js` (yield to the editor),
  `src/sketch/profile.js` (`profileAtPoint`: open chains selectable; prefer stroke over
  interior), `docs/sketch-mode.md`.

## Testing

- **Unit**: `profile.spec.js` — `profileAtPoint` on an open chain, on two overlapping
  outlines (stroke beats interior; smallest containing wins), on a miss; the store's tool
  and selection transitions; `useDeleteShortcut` does nothing to the body while the editor
  is open.
- **E2E**: extend `e2e/sketch-primitive.e2e.js` with **real `page.mouse`** (and trusted
  touch on chromium-phone): draw two outlines, pick each with Select and with a draw tool
  armed, assert the highlight and status text, change Solid/Hole, delete with the toolbar
  button and with Delete/Backspace, assert Cancel restores and Done commits one undo step.
  A press on a stroke under Select must **not** draw (ui-020 #1 dead-strip, in reverse).
  Three viewports; all three engines (canvas + touch).
- **Acceptance**: re-drive scenario 9 and scenario 1; closed findings ui-020 #1/#3, ui-043,
  ui-046.
- Repro-first: write the failing spec for whichever of Problem 1-4 the hand repro shows.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

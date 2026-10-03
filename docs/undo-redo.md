# Undoing and redoing a change

Everything you do to a model in WarpCad — dropping a shape in, dragging it with the
gizmo, typing a new dimension, subtracting one solid from another — can be taken back,
and put back again if you change your mind.

## Where the controls are

Look at the **top bar**, the strip along the top of the window with "WarpCad" on the
left. At its right-hand end are two buttons:

| Button | What it does |
|---|---|
| **↶** | Undo — take back the last thing you did |
| **↷** | Redo — put back the last thing you undid |

They sit in the top bar rather than in the toolbar over the 3D view because they are not
about whatever you happen to have selected. They act on the model's history, so they
work with nothing selected at all.

![The Undo and Redo buttons after one change: Undo is live, Redo is greyed out](./screenshots/undo-redo-buttons.png)

The buttons are **greyed out when there is nothing to undo or redo** — on a freshly
opened, empty model, both are grey. Hover over either one (or long-press it on a phone)
and it tells you exactly which change it will affect: `Undo: Move Cube 1`,
`Redo: Chamfer 1`. That way you never have to guess what a press is about to change.

## Try it

1. Open WarpCad. Drag a **Cube** out of the Library panel and drop it in the 3D view.
2. Click the cube to select it, then drag the **red arrow** on the gizmo to move it a
   little way along X.
3. Press **Ctrl+Z** (**Cmd+Z** on a Mac), or tap the **↶** button in the top bar.
   The cube jumps back to where it was before you dragged it, and it stays selected —
   the gizmo and the Inspector are still pointing at it.
4. Press **Ctrl+Shift+Z** (**Cmd+Shift+Z** on a Mac), or tap the **↷** button.
   The move comes back and the cube returns to where you had dragged it.

![Dragging a cube in, moving it with the gizmo, pressing Undo, pressing Ctrl+Z so the cube disappears, then pressing Redo to bring the placed cube back](./media/undo-redo-roundtrip.gif)

Press **↶** once more and the cube itself disappears — that undoes the drop that placed
it. **↷** brings it back.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+Z / Cmd+Z | Undo |
| Ctrl+Shift+Z / Cmd+Shift+Z | Redo |
| Ctrl+Y | Redo (alternative) |

The shortcuts are a convenience, not the only way in: everything they do, the two buttons
do as well. That matters on a phone or tablet, where there is no Ctrl key at all.

**One exception**, on purpose: while you are typing in a numeric field in the Inspector,
Ctrl+Z undoes your *typing* rather than your last modelling change — that is the browser's
own undo, and taking it away would make fixing a typo in a dimension harder than getting
it wrong in the first place. Click away from the field (or use the **↶** button) to undo
the model instead.

## What counts as "one step"

One thing you did is one press of Undo, even when WarpCad recorded it as several internal
changes:

- A whole gizmo drag is **one** step, not one step per pixel of movement.
- Dropping a part that is made of several pieces — a bolt, a Raspberry Pi board — is
  **one** step, not one for the part and another for putting it where you dropped it.
- Committing a value in an Inspector field is one step, when you commit it — however many
  digits you typed to get there. (On a cylinder you have not moved, changing its diameter
  rewrites its own step in [History](timeline.md) instead of adding a row. On one you have
  moved, History shows an extra `Move` row for the same edit, but it is still one press of Undo.)

  ![Typing a new diameter into the Inspector and pressing Enter, then one press of Undo restoring the original diameter](./media/undo-param-edit.gif)
- A Union, Subtract or Intersect is one step. Undoing it brings **both** original shapes
  back, separately selectable again, exactly as they were.

## What Undo puts back on screen

Undo also restores **what was selected** before the change you are taking back, whenever
those shapes still exist. Undo a subtraction and you get both original shapes back *and*
both of them selected, ready to try the operation again differently. Undo the placement of
a shape and nothing is left selected, because nothing was selected before you dropped it.

## Two things worth knowing

**Undo does not survive a reload.** Your *model* is kept (see [Saving and
reopening your work](save-load.md)), but the list of steps to undo is
not: after refreshing the page or opening a different project, both buttons start out
greyed. If you want to be able to get back to an earlier state after a reload, keep a
saved copy rather than relying on Undo.

**Undo only ever takes back your own changes.** If a change was made by something other
than you at the keyboard — an AI assistant driving the model, or a change pulled in from
shared storage — pressing Undo will never silently remove it. Those changes are visible in
the model's history like any other, and if one depends on a change of yours, WarpCad tells
you so by name instead of quietly leaving a hole:
`"Step 7", added via programmatic, depends on "Move Cube 1" — suppress or edit it first`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

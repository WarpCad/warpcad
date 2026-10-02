# Sketch primitives

A **Sketch** is a shape you draw instead of size. You drop it into the 3D view like a
Cube, draw outlines on its flat plane, and choose how those outlines become a solid.
When you tap **Done** it is a solid like any other shape: you can select it, move and
turn it with the gizmo, combine it with Union / Subtract / Intersect, mirror it, export
it, and come back later to change the drawing.

A sketch is always a solid. There are no loose lines left in the scene. An outline
that is not closed is shown in amber and is not part of the solid until you close it.

## Placing a sketch

1. Open the **Library** (the left column on a computer or tablet, the **Library** tab at
   the bottom on a phone).
2. Drag **Sketch** from **Primitives** into the 3D view. While you drag, a thin square
   shows where the sketch's plane will go.
3. Let go. That spot becomes the sketch's **origin**. The view turns to look straight
   down at it, the grid lies flat in front of you, and the **Sketch toolbar** appears
   in the top-left corner where the Operations toolbar normally is.

Nothing is added to your model yet. The sketch only becomes a shape when you tap
**Done**. **Cancel** throws the whole thing away and leaves no shape behind.

While the sketch editor is open:

- a drag on the grid **draws** with the current tool. On a touch screen, one finger
  draws; two fingers still pan and pinch-zoom;
- the camera stays square-on to the sketch: the orientation triad's view buttons are
  off, and the navigation arrows **pan** rather than orbit;
- **Undo**, **Redo** and **Delete** are off until you tap **Done** or **Cancel**, because
  nothing you've drawn is in the model yet. The whole editing session then becomes one
  step you can undo;
- on a phone, the navigation pad folds to a single **✥** button so the drawing area
  stays clear. Tap it to get the arrows and zoom back.

## The four drawing tools

All four are a single press, drag and release. No modifier key is needed, with a mouse
or a finger.

| Tool | Button | Drag | You get |
|---|---|---|---|
| **Line** | ╱ | From one point to the next | A segment. Start the next drag on the end of the last one to continue the outline. Finish a drag on the very first point to close it. |
| **Rectangle** | ▭ | Corner to opposite corner | A closed rectangle |
| **Circle** | ◯ | Centre out to the rim | A closed circle |
| **Polygon** | ⬡ | Centre out to a corner | A regular polygon. Set how many sides in the box that appears next to the tool. 6 gives you a hexagon. |

A drag that hardly moves draws nothing. A tap without dragging **selects** the outline
under your finger or pointer. Inside two outlines, the smaller one wins, which is how
you pick the inner of two circles. Tap empty grid to deselect.

## Solid and Hole

Every closed outline is either **Solid** (material) or **Hole** (a cut-out). New
outlines are Solid. To make one a hole, select it and tap **Hole** in the toolbar. Its
outline turns **dashed** and a small "hole" label appears next to it. Tap **Hole**
again to make it solid again. The Inspector shows the same choice as **Solid** /
**Hole** buttons.

The outlines are combined from largest to smallest: a solid adds material, and a hole
cuts it away. So a hole inside a solid makes a bore, and a solid drawn inside a hole
stays as an island.

## Changing an outline's size

Select an outline, then look in the **Inspector**. On a phone, tap the **Sketch** tab at
the bottom. It shows the outline's kind, Solid or Hole, and its numbers: a circle's centre
and radius, a rectangle's centre, width and height, a polygon's centre, radius, sides
and rotation. Type a value and press Enter. **Delete outline** removes it. Dragging
individual points of an outline is not available yet.

## Slices

A sketch can have more than one **slice**: a set of outlines at its own height above the
sketch's origin. One slice is the usual case. Several slices are what **Loft** skins a
solid through, like the ribs of a wing.

Tap **Slices** in the toolbar. On a phone and tablet it opens as a panel at the bottom
of the view. On a computer it's a small card at the bottom right. Each row is one slice:

- tap a slice's name to make it the **active** slice. New outlines go onto it, and the
  view turns to look straight at it. The other slices stay visible, drawn faint;
- type its **Z** height (in mm) and press Enter;
- **＋ Slice** adds a new slice 50 mm above the highest one and makes it active;
- **Delete slice** removes the active slice and everything drawn on it. The last slice
  can't be deleted.

## Extrusion methods

Tap **Extrude ▾** (it shows the current method's name) to choose how the outlines become
a solid, and to set that method's numbers. A see-through preview of the result appears
behind your outlines and updates as you change things.

| Method | What it makes | Its numbers |
|---|---|---|
| **Linear** | Straight up, like a cookie cutter | Height (mm), Twist (°), Twist steps |
| **Revolve** | Spun around the sketch's Y axis, like a lathe: a ring, a bowl, a knob | Angle (°), Start angle (°), Segments |
| **Helical** | Spun and lifted at the same time: a spring or a coil | Pitch (mm per turn), Turns, End offset (mm), Segments per turn |
| **Outline** | Each closed outline becomes a wall of the given thickness, making a hollow shell. Solid and Hole are ignored. | Wall (mm), Height (mm) |
| **Loft** | One solid skinned through every slice in height order | Points per slice (0 = automatic) |

A method you can't use right now is greyed out, and its reason shows when you point at it:

- **Loft** needs two or more slices. Each slice needs exactly one Solid outline and no
  Holes. Cut holes afterwards with **Subtract**.
- Every other method uses exactly **one** slice. Remove the others, or pick Loft.
- **Revolve** and **Helical** spin around the dashed line (the sketch's Y axis), so every
  outline must stay to the right of it.

## Done, and why it is sometimes greyed out

**Done** builds the solid and closes the editor. The new shape becomes the selection,
with the gizmo and Inspector, like a freshly dropped Cube. **Done** stays greyed out, with
the reason written under the toolbar, whenever the drawing can't become a solid yet. For
example: no closed Solid outline, an outline that crosses itself, holes that cover every
solid, or a method that doesn't suit the slices. The model never holds a sketch that
can't be built.

## Editing a finished sketch

Select the sketch shape. The Inspector's **Sketch** section shows its extrusion method,
how many slices it has, and that method's numbers. Type a new Height (for example) and
press Enter to change it right there. Tap **Edit sketch** to reopen the outlines. The
view turns square-on to the sketch's plane, even if you have moved or turned the shape
since. Make your changes, then:

- **Done** applies them as **one** step. Undo takes the whole edit back at once. Anything
  you did to the shape afterwards, like a move, a turn or a fillet, is kept and re-applied
  to the new outline;
- **Cancel** leaves the shape exactly as it was.

## Worked example: a tube

Open the Library and drag **Sketch** from Primitives into the viewport, then release.
The view turns to look straight down at a flat grid and the Sketch toolbar appears. Pick
**Circle**, press at the grid's centre and drag out to 20 mm. Draw a second circle from
the same centre out to 15 mm. Tap the smaller circle, then tap **Hole**: its outline turns
dashed. Open **Extrude ▾**, choose **Linear** and type 30 in Height (millimetres). A
see-through preview of a tube appears. Tap **Done**. You now have a 30 mm tall tube with
a 30 mm bore, which you can move with the gizmo or subtract from another solid.

To hit 20 mm and 15 mm exactly, select each circle afterwards and type the radius into
the Inspector.

## Worked example: a lofted wing

With a sketch open, tap **＋ Slice** twice and set the new slices' Z offsets to 100 and
200 mm. On each slice, draw one closed outline with **Line**, finishing on the first point
to close it. Open **Extrude ▾** and choose **Loft**. Tap **Done**, and the solid is skinned
through all three outlines in order.

Step by step:

1. Drag **Sketch** into the view. On slice 1, draw the root rib. With **Line**, drag from
   point to point around the shape, starting each drag where the last one ended, and
   finish the last drag on the first point. The outline turns from amber to blue when it
   closes.
2. Tap **Slices**, then **＋ Slice**. Type **100** into the new row's **Z** and press Enter.
   The view moves up to that slice, with the first rib shown faintly below.
3. Draw the middle rib the same way. Tap **＋ Slice**, type **200**, and draw the tip rib.
4. Tap **Extrude ▾** and choose **Loft**. **Linear** is greyed out now, because it uses
   one slice. Tap **Done**.

## Older projects with sketch lines

Before sketch primitives, WarpCad had a **Sketch** button in the navigation pad that drew
loose lines. Those lines are gone. If you open a project, or reload a session, that still
contains them, everything else loads normally. Each old line is skipped, and the status
in the top bar says so, for example **Opened plan.ndjson, but skipped 2 steps (sketch-1,
sketch-2): sketch lines are no longer supported — redraw them in a Sketch primitive**.
They are not converted, because a loose line has no Solid/Hole role and no height, so
there is nothing correct to turn it into.

## Not available yet

Coming in later updates: dragging, adding and removing an outline's individual points;
loading a photo to trace over and setting its scale from a ruler; and automatic tracing of
a photographed part.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# Combining shapes: Union, Subtract and Intersect

Placing shapes gets you a pile of separate solids. **Boolean operations** turn several
of them into one — merging them, cutting one out of another, or keeping only the part
they have in common. They are how a plain box becomes a case with a bolt hole in it.

The three operations live in the **Operations toolbar**, in the top-left corner of the
3D view. They are deliberately *not* in the Library panel next to Cube and Cylinder:
the Library creates new shapes out of nothing, while these three act on shapes you have
already placed. That is a different kind of action with a different requirement, and the
toolbar says so before you press anything.

| Button | What it does |
|---|---|
| **∪ Union** | Merges the selected solids into a single one. |
| **− Subtract** | Removes every solid you selected *after* the first one from that first one. |
| **∩ Intersect** | Keeps only the volume that all the selected solids share, and discards the rest. |

## You need at least two shapes selected

All three buttons stay **dimmed and unclickable until two or more solids are selected**.
This is not a quirk — an operation needs something to operate *on*, and one shape cannot
be merged with itself.

The toolbar tells you where you stand at all times. Just under the buttons it shows a
live count: `0 selected`, `1 selected`, `2 selected`, and so on. Hover the mouse over a
dimmed button (or press and hold it on a touch screen) and it says **"Select 2 or more
solids"**.

To select more than one shape: click the first, then hold **Shift** and click the next.
On a touch screen with no keyboard, switch the navigation controls (bottom-left) to
**Select** and drag a box around the shapes you want — everything the box encloses is
selected together.

## Which shape gets cut: the first one you picked

Union and Intersect do not care what order you pick things in — merging A with B is the
same as merging B with A. **Subtract does care.** The solid you selected **first** is the
one being cut; everything selected after it is removed from it.

The app shows you this on the shapes themselves, before you press anything:

- The **first-selected** solid — the one that will be cut — keeps the ordinary
  amber/orange selection colour.
- **Every later-selected** solid is highlighted in **teal** instead, marking it as
  something that will be taken *away*.

So if you look at the scene and see one amber shape and one teal shape, Subtract is
going to cut the teal one out of the amber one. If that is the wrong way round, click
empty space to clear the selection and pick them again in the other order.

The toolbar's badge says the same thing in words — *"first is the base"* — with two small
colour chips matching the two highlight colours.

## A worked example

1. Open the Library panel and drag a **Cube** into the 3D view. Drag a **second Cube** in
   so that it overlaps the first one.
2. Click the first cube. The Operations toolbar still reads `1 selected` and all three
   buttons stay dimmed — one is not enough.
3. Hold **Shift** and click the second cube. The badge changes to `2 selected` and
   Union, Subtract and Intersect all light up. The second cube's highlight turns teal,
   marking it as the one that will be removed.
4. Click **Subtract**. The overlapping volume is cut out of the first cube, leaving a
   single shape with a bite taken out of it.
5. That result is now selected on its own — the gizmo and the dimension lines attach to
   it, and the Inspector shows it as `Subtract 1`. Because only one thing is selected
   again, the toolbar dims until you select another two.

Try step 4 again with **Union** instead and you get one merged shape spanning both
cubes; with **Intersect** you get only the small block where the two cubes overlapped.

## What happens to the original shapes

The two shapes you combined are **gone as separate objects** — you cannot click either
one on its own any more, and the scene now contains one shape where it had two. That is
the point: a case with a bolt hole in it is one part, not a case and a hole sitting on
top of each other.

The result is a new shape with its own name (`Union 1`, `Subtract 1`, `Intersect 1`) and
it behaves like any other: select it, move it, turn it, or feed it into another boolean
with something else.

## Notes and gotchas

- **Units are millimetres**, as everywhere else in WarpCad.
- **More than two at once is fine.** Select three or more solids and Union merges them
  all; Subtract removes all of them from the first one.
- **Intersect on shapes that do not overlap leaves nothing behind.** There is no shared
  volume, so the result is an empty shape — it will vanish from view even though the
  scene still lists one item. Undo is not built yet, so reload the page to start over.
- **Subtracting something that does not touch the base** leaves the base unchanged. That
  is correct, not a failure — nothing overlapped, so nothing was removed.

## See also

- [Placing a shape](primitive-placement.md) — getting shapes into the view in the first
  place, and lining one up against another.
- [Selecting a shape, and reading its size](selection-and-inspector.md) — what selection
  does, and reading the result's dimensions afterwards.
- [Moving around the 3D view](viewport-navigation.md) — orbiting to check a boolean
  result from another angle.

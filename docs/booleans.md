# Combining shapes: Union, Subtract and Intersect

Placing shapes gets you a pile of separate solids. **Boolean operations** turn several
of them into one — merging them, cutting one out of another, or keeping only the part
they have in common. They are how a plain box becomes a case with a bolt hole in it.

The three operations live in the **Operations toolbar**, in the top-left corner of the
3D view — alongside a fourth button, **Group**, which combines shapes without merging
their geometry (see [Combining shapes into a group](groups.md)), and two more, **Snap**
and **Align**, which move one shape against another without combining or discarding
either one at all (see [Precise placement: Snap and Align](snap-align.md)). They are
deliberately *not* in the Library panel next to Cube and Cylinder: the Library creates
new shapes out of nothing, while these act on shapes you have already placed. That is a
different kind of action with a different requirement, and the toolbar says so before
you press anything.

| Button | What it does |
|---|---|
| **∪ Union** | Merges the selected solids into a single one. |
| **− Subtract** | Removes every solid you selected *after* the first one from that first one. |
| **∩ Intersect** | Keeps only the volume that all the selected solids share, and discards the rest. |
| **⊞ Group** | Combines the selected solids into one selectable body, keeping each one's own geometry intact — see [Combining shapes into a group](groups.md). |
| **⇥ Snap** / **⇔ Align** | Moves one selected solid to a precise position against the other — flush against a side, or centred — without combining or discarding either one. See [Precise placement: Snap and Align](snap-align.md). |

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

## Cutting with just one part of a multi-part shape

Most Library parts are a single solid, but the hardware and Raspberry Pi parts are
**made of named parts** — a Raspberry Pi has a board, an Ethernet jack, two USB stacks
and more; a bolt has a head, a thread and a `tap` clearance envelope (hidden by
default — see the callout below). See
[Selecting a part inside a group](groups.md) for how to select one.

A boolean can use **one named part instead of the whole shape**. That is how you cut a
port opening in a case wall: you want a hole the size of the Ethernet jack, not a hole
the size of the whole board.

**How to select a part:** click the shape once — the whole thing is selected. Click a
second time, landing on the part you want. The Inspector header now reads a breadcrumb
like `Raspberry Pi 1 ▸ ethernet`, and the gizmo shrinks to that part alone.

**The Operations toolbar then says what it is about to use.** Under the `2 selected`
badge it names both shapes in the order you picked them, and a part shows after a `›`:

> **Cube 1** then **Raspberry Pi 1 › ethernet**
>
> *› names one part of that body — the three booleans use just that part. Group still
> uses the whole body.*

This line matters more than it looks. A part-subtract and a whole-shape subtract look
*identical* on screen until the geometry changes, so this is the only thing that tells
you which one you are about to get. Read it before you click.

**On a phone** the toolbar has no room for that line — it would land on top of the
navigation controls — so the same text is on the buttons instead: press and hold Union,
Subtract or Intersect and the tooltip reads
*"Subtract — Remove every later-selected solid from the first (Cube 1 then Raspberry Pi
1 › ethernet — booleans use that part; Group uses the whole body)"*. Same information,
same moment, no covered controls.

### A worked example: an Ethernet port opening

1. Open the Library panel, drag a **Cube** into the 3D view, and drag a **Raspberry
   Pi** in so the board's Ethernet end overlaps the cube. (Units are millimetres
   throughout.)
2. Click the Pi once — the whole board is selected. Click the **Ethernet jack** (the
   metal box at the board's edge) a second time. The Inspector breadcrumb reads
   `Raspberry Pi 1 ▸ ethernet`.
3. You now need the **cube** to be the base, because Subtract cuts the first thing you
   picked. The part you drilled into is currently first, so: hold **Shift** and click
   the Ethernet jack once to take the Pi out of the selection, Shift-click the **cube**,
   then Shift-click the Ethernet jack again to put the Pi back — at the end this time.
   Its part stays selected through all of that.
4. The toolbar now reads **Cube 1** then **Raspberry Pi 1 › ethernet**.
5. Click **Subtract**.

**What you get:** a rectangular opening in the cube the size of the Ethernet jack —
**21.38 × 16.12 × 13.83 mm**, which you can read off the Inspector's Size fields while
the part is selected — and nothing else removed. Had you skipped step 2 and subtracted
the whole Pi, the cube would instead have had the board's entire **85 × 56 mm**
footprint cut out of it, which is not a port opening, it is a missing wall. Driven on a
40 mm cube with the board pushed 7 mm into one face, the difference is easy to see in
the numbers: the Ethernet jack removes **1 208 mm³**, the whole board removes
**5 661 mm³**.

### Three things to know

- **One part at a time.** The selection carries a single part, so you cut with the
  Ethernet jack *or* USB port 1, not both at once. Run a second Subtract for the next
  one; that is the normal way to build a multi-port case wall.
- **Group ignores the part.** The `⊞ Group` button always uses the whole shape, even
  when a part is selected — the toolbar's note says so while a part is selected, so you
  do not have to remember it. Only Union, Subtract and Intersect read the part.
- **The whole shape is still consumed.** Cutting with the Ethernet jack still uses up
  the Pi as a separate object, exactly like any other Subtract. If you want to keep the
  board, place a second one, or undo and use [Snap](snap-align.md) to position a copy.

A word about bolts specifically, because it changes what you get, not just how clear
the intent is. A bolt's rendered outline is its **metal** — head and thread only, so
cutting with the whole bolt (no part selected) cuts a hole that size: snug enough to
jam. The bolt's actual clearance envelope is a hidden part named `tap` — it contains
the head and thread grown by the fastener's fit class — and it is what gives you a hole
the bolt really slides through. `tap` has no surface to click in the 3D view, because a
hidden part is never drawn; reach it from the Objects list's ▸ disclosure arrow on the
bolt's row instead (see
[Picking one piece of a hidden shape](selection-and-inspector.md#picking-one-piece-of-a-hidden-shape)),
the same way you would reach any other hidden piece — or, while the bolt is selected,
from the Inspector's own [**Hidden parts**](selection-and-inspector.md#hidden-parts)
section, which lists `tap` directly and can also show it as a translucent overlay so
you can see the clearance before you cut with it.

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
- [Precise placement: Snap and Align](snap-align.md) — the same toolbar's other two
  buttons, which move a shape against another without combining or discarding either.

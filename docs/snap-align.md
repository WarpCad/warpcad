# Precise placement: Snap and Align

**Snap** and **Align** move one already-placed shape to an exact computed position
against another already-placed shape — flush against a side, or centred, on
whichever axes you pick. They live on the same **Operations toolbar** as
[Union, Subtract and Intersect](booleans.md) and [Group](groups.md), as the fifth
and sixth buttons.

Snap and Align are fundamentally different from every other button on this
toolbar: Union, Subtract, Intersect and Group all take two or more shapes and
produce **one** result, retiring the originals. Snap and Align do neither —
they move one shape, leave the other exactly where it was, and **both remain
two separate, independently selectable shapes afterward.**

| Button | What it does |
|---|---|
| **⇥ Snap** | Moves the first-selected shape flush against a side of the second, with an optional offset. |
| **⇔ Align** | Centres the first-selected shape on the second, along whichever axes you pick. |

This is the precise, computed counterpart to
[drag-time snap guides](primitive-placement.md): those only ever run while you
are dropping a **new** shape in from the Library, guiding it into place as you
drag. Snap and Align work on two shapes that are **already** sitting in the
scene, any time afterward — no drag required.

## You need exactly 2 shapes selected — not "2 or more"

Every other button on this toolbar accepts two or more shapes. Snap and Align
are stricter: they stay **dimmed and unclickable unless exactly two** shapes are
selected. Selecting a third shape disables them again, the same as selecting
only one does.

To select exactly two shapes: click the first, then hold **Shift** and click
the second. On a touch screen, switch the navigation controls (bottom-left) to
**Select** and drag a box around exactly the two shapes you want.

## Which shape moves: the first one you picked

The shape you select **first** is the one that moves — the popover calls it the
**moving** shape. The shape you select **second** never moves — the popover calls
it the **reference** shape. This is the same first-picked/second-picked
distinction [Subtract](booleans.md#which-shape-gets-cut-the-first-one-you-picked)
already uses, painted onto the shapes in the scene the same way (amber for the
first pick, teal for the second) before you open either popover.

## A worked example

1. Drag a **Cube** and a **Cylinder** into the 3D view so they don't overlap.
2. Click the Cube, then hold **Shift** and click the Cylinder. The Cube is now
   the "moving" item, the Cylinder the "reference" item — the toolbar's badge
   reads `2 selected`, and Snap and Align both light up.
3. Click **Align**. A small popover opens with an **Axes** row of X/Y/Z
   checkboxes, an **Offset (mm)** field, and **Cancel**/**Align** buttons.
4. Check the **Z** axis, then click **Align** inside the popover.
5. The Cube moves to sit centred on the Cylinder along Z, while its X and Y
   position stay exactly as they were (only the checked axes move). The
   popover closes, and the Cube stays selected on its own.

Both solids remain separately selectable afterward — click the Cylinder, and
it opens its own Inspector entry exactly as before. Nothing was combined.

## A second example: positioning against one named part

A [group](groups.md) — and every composite item from the Library's Hardware,
Kit and Raspberry Pi sections, such as a **Raspberry Pi 5** board or a **Bolt** —
is made of *named parts*. Snap and Align can work against one of those parts
specifically, instead of against the whole item's overall bounding box. That is
how you position something against a **particular mounting hole** on a board,
rather than against the middle of the board.

To do it, [drill into the part](selection-and-inspector.md) first:

1. From the Library's "Raspberry Pi" section, pick **Pi 5** in the **Raspberry
   Pi** row's Model dropdown and drag the row into the 3D view. Drag a **Cube**
   in as well, as the thing you want to position.
2. **Click the board once.** The whole board is selected — the Inspector shows
   its overall size (about 85 × 56 mm).
3. **Click again, on the part you care about** — say the Ethernet jack at the
   board's end. The selection narrows to that named part, and the Inspector
   grows a breadcrumb reading `Raspberry Pi 1 › ethernet`. (Each part carries
   the name the board's recipe gives it: `mb` for the PCB itself, `ethernet`,
   `usb1`, `usb2`, `gpio`, and so on.)
4. Hold **Shift** and click the Cube. Two things are now selected, and the board
   is still drilled into that one part.
5. Click **Align**. The popover's top line names exactly what it is about to do:
   **Aligning Raspberry Pi 1 › ethernet to Cube 1**. That `›` is the
   confirmation you drilled to the depth you meant.
6. Check the **X** and **Y** axes and click **Align**.

The board moves so that **the Ethernet jack** — not the board's centre — lines
up with the Cube. The rest of the board comes along with it: addressing a part
changes what gets *measured*, never what gets *moved*. A bolt snapped by its
head brings its thread and tap with it.

**You can only drill into a part you can click.** A part that sits *inside*
another one — a Raspberry Pi's mounting holes, for instance, which pass through
the board — is hidden behind the part in front of it, so clicking never reaches
it. Orbit the view (bottom-left navigation controls) until the part you want is
the one facing you.

**You can drill into one side only.** The moving item and the reference item do
not have to be at the same depth — a whole screen positioned against one hole on
a board is the ordinary case, not a special one. Whichever side you drilled
into is the side that gets measured by its part; the other is measured whole.

**To go back to whole-item addressing**, click the breadcrumb's first segment
(the item's own name) in the Inspector, or click empty space and start the
selection again. The popover's top line always tells you which you are on.

## The popover's fields

- **What's being positioned** — the top line, naming the moving item first and
  the reference item second, each with its `›` part name if you drilled into it.
  Read this before committing: a part-addressed move and a whole-item move look
  identical once they have happened, and this line is the only place the
  difference is visible beforehand.
- **Axes** — one or more of X/Y/Z, any combination. Only the checked axes are
  affected; an unchecked axis is left exactly where it was.
- **Orientation** (Snap only) — which side of the reference shape to sit flush
  against: `Outside +`, `Outside −`, `Inside +`, `Inside −`, `Center +`, or
  `Center −`. Align has no orientation control — it always centres, on
  whichever axes you check.
- **Offset (mm)** — an extra millimetre nudge, applied uniformly to every
  checked axis. Defaults to `0`.
- **Cancel** closes the popover without changing anything. **Snap**/**Align**
  (the popover's own commit button, labelled to match whichever one you
  opened) appends the move.

## What happens to the two shapes

Unlike Union, Subtract, Intersect or Group, **neither shape is retired.** The
moving shape's position changes; the reference shape's position is untouched,
to the millimetre. The scene still lists two shapes, and clicking either one
still selects only that one.

## Not yet supported

- **A per-axis offset.** The Offset field is a single millimetre value applied
  to every checked axis alike, not a separate value per axis.
- **Both sides addressed by part at once.** You can drill into one part at a time,
  so one of the two operands is addressed by part and the other is addressed
  whole. Positioning two named parts of two different composites against each
  other in a single step isn't possible yet.

## Notes and gotchas

- **Units are millimetres**, as everywhere else in WarpCad.
- **Order matters.** Selecting the same two shapes in the other order swaps
  which one moves — the same as reversing Subtract's operand order gives a
  different result.
- **Closing the popover without clicking Snap/Align changes nothing** — Cancel,
  or opening the other button's popover instead, discards whatever axes or
  offset you'd picked.

## See also

- [Combining shapes: Union, Subtract and Intersect](booleans.md) — the same
  toolbar's other buttons, which retire their operands into one new shape.
- [Combining shapes into a group](groups.md) — the toolbar's Group button,
  which also keeps every original shape intact but, unlike Snap/Align, merges
  them into one selectable body.
- [Rounding or bevelling an edge: Fillet and Chamfer](fillet-chamfer.md) — the
  toolbar's other exact-count-gated pair (exactly one shape, rather than Snap/
  Align's exactly two), reusing the same popover pattern.
- [Resizing and cutting a shape: Enlarge, Fit and Bisect](resize-bisect.md) —
  another exactly-1-gated trio, for changing one shape's size or cutting it in
  two rather than moving it against a second shape.
- [Placing a shape](primitive-placement.md) — drag-time snap guides, the
  live-alignment mechanism Snap and Align's own precise, computed positioning
  is the after-the-fact counterpart to.
- [Selecting a shape, and reading its size](selection-and-inspector.md) — what
  selection does, and reading a shape's new position after a move.
- To align one shape to the **grid's origin** rather than to another shape, that
  is a different control — the Inspector's own **Align to origin** row, see
  [Selecting a shape, and reading its size § Align to origin](selection-and-inspector.md#align-to-origin).

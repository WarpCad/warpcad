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

## A quick example: a lug against a plate

Select a plate and a lug (the lug first), press **⇥ Snap**, choose *Outside −* on the
**X** axis and press **Snap** in the popover. The lug slides against the plate's +X side
and stops flush with it, without merging: the plate has not moved, and both are still two
separate shapes you can select on their own.

![Clicking the lug, Shift-clicking the plate, pressing Snap, ticking X, choosing Outside minus and pressing Snap: the lug slides across until its face meets the plate's side](./media/snap-operation.gif)

To flush the lug against the plate's *−X* side instead, choose *Outside +*. The sign names
the side of the **moving** shape that touches: *Outside −* puts the moving shape's low
side against the reference's high side, so the moving shape ends up on the reference's +X
side. See [the popover's fields](#the-popovers-fields).

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

![Selecting a lug and a plate, pressing Align, ticking Y and pressing Align in the popover: the lug moves along Y until it is centred on the plate, and does not move on X or Z](./media/align-operation.gif)

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

![Clicking a screw, then ticking the Raspberry Pi's hole1 part in the Objects list, pressing Align and ticking X and Y: the screw moves until it sits on the mounting hole's axis](./media/snap-subpart-operand.gif)

The picture above does the same with a **mounting hole**: the screw is the moving shape,
and the board's `hole1` part is the reference. A hole passes through the board and can't be
clicked in the 3D view, so the second operand is ticked in the Inspector's
[Objects list](selection-and-inspector.md#picking-one-piece-of-a-hidden-shape) instead.
The popover's top line reads `Aligning Screw 1 to Raspberry Pi 1 › hole1`, and afterwards
the screw's axis lies on the hole's axis.

The board moves so that **the Ethernet jack** — not the board's centre — lines
up with the Cube. The rest of the board comes along with it: addressing a part
changes what gets *measured*, never what gets *moved*. A bolt snapped by its
head brings its thread and tap with it.

**You can only drill into a part you can click** — in the 3D view. A part that sits
*inside* another one — a Raspberry Pi's mounting holes, for instance, which pass through
the board — is hidden behind the part in front of it, so clicking never reaches it. Tick it
in the Inspector's [Objects list](selection-and-inspector.md#picking-one-piece-of-a-hidden-shape)
instead, or orbit the view (bottom-left navigation controls) until the part you want is the
one facing you.

**You can address a part on both sides.** The moving item and the reference item each
keep their own part, so *this hole on the board* against *that post on the screen* is one
Snap or Align. Either side can also be whole: a whole screen positioned against one hole
on a board is just as ordinary. Whichever side carries a `›` in the popover's top line is
measured by that part; a side with no `›` is measured whole. The app never quietly drops a
part you addressed: if it can't use one, the popover says so in red and nothing moves.

### Mounting a Raspberry Pi on a screen's posts

This is the both-sides case: a hole on the board against a post on the screen, then the
board itself against the top of the post. Units are millimetres, with Z pointing up.

1. From the Library's "Raspberry Pi" section, set the **Raspberry Pi** row's Model to
   **Pi 5** and drag it into the 3D view. Drag a **Touchscreen 2** in as well.
2. Click the Pi, then open the Inspector's **Objects** list, open the Pi's parts (the
   chevron on its row) and tap **hole1**. The breadcrumb reads `Raspberry Pi 1 › hole1`.
3. Open the screen's parts and tap the check next to **piMountingPost1**. That adds the
   screen to the selection *at that post*, and the Pi keeps `hole1`: both part rows stay
   ticked, numbered `1` and `2`. (With a keyboard, Shift-clicking the **piMountingPost1**
   row does the same. Shift-clicking the screen's own row would add the *whole* screen.)
4. Press **Align**. The top line reads
   **Aligning Raspberry Pi 1 › hole1 to Touchscreen 2 1 › piMountingPost1**. Tick **X** and
   **Y** and press **Align**. The axis of `hole1` is now on the axis of post 1. The whole
   board moved with it, so the other three holes are on the other three posts too: the
   board's holes are 58 × 49 mm apart, and so are the posts.
5. Now the height. After the Align only the Pi is still selected. Reopen the Objects list,
   tap the Pi's **mb** part (the circuit board itself), then tick
   **piMountingPost1** on the screen again. Press **Snap**, tick **Z**, set Orientation to
   **Outside −** and press **Snap**. The underside of `mb` now sits on the top of the post,
   with no gap and no overlap.

Use **mb** for the height, not the hole and not the whole Pi. The hole runs from 3.34 mm
below the board to 3.34 mm above it, so snapping the hole would leave the board floating.
The whole Pi's lowest point is the underside of the microSD card, 1.5 mm below the board, so
snapping the whole Pi would leave a 1.5 mm gap above the posts. **Outside −** puts the
moving part's bottom on the reference's top; **Outside +** would hang the board under the
post instead.

![Ticking the Pi's hole1 and the screen's piMountingPost1 in the Objects list, aligning on X and Y, then re-addressing the Pi at mb and snapping on Z: the board drops onto the posts with its holes on the post axes](./media/snap-subpart-both-sides.gif)

**To go back to whole-item addressing**, click the breadcrumb's first segment
(the item's own name) in the Inspector, or click empty space and start the
selection again. The popover's top line always tells you which you are on.

## When the part you snapped to goes away

A Snap or Align against a named part is **live**: it is worked out again whenever the
thing it points at changes. So if you
[change the board's model](selection-and-inspector.md#changing-a-parts-model-or-size), a
cube snapped to a Pi 4's Ethernet jack moves to where the Pi 5's Ethernet jack is, with
no questions asked.

If the new model **doesn't have that part at all** — a Pi 5 has no AV jack — nothing is
changed yet. A dialog opens instead: *"This change affects 1 item"*. Each row names the
item (point at it to find it in the 3D view), what it is attached to (`Snap → avjack`),
and why that no longer works (*"Pi 5 has no part named `avjack`"*). Pick a **Fix** for
each row:

| Fix | What happens |
|---|---|
| **Only when Raspberry Pi 1's Model is Pi 4** | Keep the item, but only on a Pi 4. On a Pi 5 it simply isn't there (not broken, not drawn); switch back to a Pi 4 and it returns, still snapped. One design can then hold parts for several board revisions. |
| **Remap to another part…** | Point the snap at a part the new board *does* have. Pre-filled only when the part really was renamed (a Pi 4's `camera` is a Pi 5's `camera0`); otherwise you choose. |
| **Detach — keep it where it is** | The item stays exactly where it is now and forgets the link. Offered for Snap and Align only. |
| **Leave broken** | Make the change anyway and fix it later. |

**Apply** makes the model change and every fix as **one** step — a single **Undo** puts
the old model *and* the original snap back. **Cancel** (or **Escape**) changes nothing and
puts the dropdown back. Apply stays greyed until every row has a fix; the default is
Remap when there is a real rename to suggest, and Leave broken otherwise. **Only when…**
is never picked for you, because it changes what the design means.

On a phone the dialog is a full-height sheet: each Fix dropdown sits full width under its
row, and Apply/Cancel stay pinned to the bottom.

**Leave broken, then Resolve….** An item left broken still shows where it last was, so you
can find it. The Pi's Inspector says *"1 item refers to parts this Pi 5 doesn't have."*,
the item's own Inspector says *"Snapped to Raspberry Pi 1 ▸ avjack, which no longer
exists."*, and its History row carries the `broken` label. Both banners have a
**Resolve…** button that reopens the same dialog, where you can Remap, Detach or make it
conditional now.

### Worked example: detach a cube from a jack that went away

1. Drag a Raspberry Pi into the viewport and choose **Pi 4** in the Library before
   dropping it. Drop a Cube next to it.
2. Select the Cube, then Shift-click the Pi's AV jack (or, in the Inspector's object list,
   tick the Cube and then tick `avjack` under the Pi's ▸) so both are selected, and use
   **Snap** to sit the cube against the jack.
3. Now select the whole Pi and change **Model** to **Pi 5**. A dialog explains that the
   Pi 5 has no AV jack.
4. For the Cube's row choose **Detach** and press **Apply**. The Pi becomes a Pi 5 and the
   cube stays exactly where it was.
5. Press **Undo** once and you're back to a Pi 4 with the cube snapped to its jack.

### Worked example: keep a part for one board revision only

Do the same again, but in step 4 choose **Only when Raspberry Pi 1's Model is Pi 4** for
the Cube and press **Apply**. The Cube disappears, and its History rows show
`if Raspberry Pi 1 = Pi 4`. Change the Model back to **Pi 4** and the Cube reappears,
still snapped to the AV jack. Use this to keep parts for several board revisions in one
design.

## The popover's fields

![The Snap popover for a lug and a plate: Axes with X ticked, Orientation set to Outside minus, Offset 0 and Cancel and Snap buttons, with "Snapping Lug 1 to Plate 1" beneath](./screenshots/snap-popover.png)

- **What's being positioned** — the top line, naming the moving item first and
  the reference item second, each with its `›` part name if you drilled into it.
  Read this before committing: a part-addressed move and a whole-item move look
  identical once they have happened, and this line is the only place the
  difference is visible beforehand.
- **Axes** — one or more of X/Y/Z, any combination. Only the checked axes are
  affected; an unchecked axis is left exactly where it was.
- **Orientation** (Snap only) — how the moving shape meets the reference shape:
  `Outside +`, `Outside −`, `Inside +`, `Inside −`, `Center +`, or `Center −`. The
  sign names the side of the **moving** shape that does the touching, so
  `Outside −` puts the moving shape's low face against the reference's high face (the
  moving shape ends up on the reference's + side), and `Outside +` does the opposite.
  `Inside` lines up like faces (high with high, or low with low), and `Center` puts the
  moving shape's high or low face on the reference's middle. Align has no orientation
  control — it always centres, on whichever axes you check.
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

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

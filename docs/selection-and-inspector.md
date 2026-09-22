# Selecting a shape, and reading its size

Once you have placed something (see [Placing a shape](primitive-placement.md)), the next
thing you will want to know is **how big it is** and **what it is made of**. Both answers
come from the same gesture: click it.

## Selecting

Click — or tap — directly on a shape in the 3D view. Three things happen at once:

1. **A gizmo appears at the middle of the shape.** Three coloured arrows point along the
   part's X, Y and Z directions, and three faint rings circle it. The arms, their
   arrowheads and the rings are shaded with a subtle highlight and a soft drop shadow,
   so the handles read as small 3D objects sitting on top of the scene rather than as
   flat 2D lines — the colour-coding itself is unchanged. The arrows are the
   move handles and the rings are the rotate handles — both draggable, see
   [Moving and turning a shape](#moving-and-turning-a-shape). **The rotate rings carry
   small arrow markers along their circumference**, so they read as "drag along me to
   spin the object" rather than as a plain decorative circle or a selection halo — two
   small triangles per ring, pointing the way a drag there turns the shape.
   **The gizmo's size follows the shape it is attached to**, rather than staying a
   fixed size: its arms and rings
   always extend a short distance past the shape's own outline, growing for a larger
   shape (or as you zoom in) and shrinking for a smaller one (or as you zoom out) — down
   to a comfortably grabbable minimum, so a tiny part's handles never shrink to nothing.
   Select a small bolt and a large case shell in turn — the gizmo's arms and rotate rings
   resize each time, always extending a short distance past whichever object's outline,
   rather than staying a fixed size that disappears inside a large object or dwarfs a
   small one.
2. **Three dimension lines are drawn**, one per direction, each with a dashed leader
   line, an arrow at each end, and a number in millimetres. You always get all three at
   once — the width, the depth and the height — so you can read a part's real size
   straight off the screen without opening anything.
3. **The Inspector fills in** with the shape's own parameters and its position.

You do not have to be precise about where you click: anywhere on the shape works.

## What the colours mean

The gizmo's arrows and the dimension lines use the same colour for the same direction
everywhere in the app, matching the axis triad in the top-right corner of the 3D view:

| Colour | Direction | What it measures |
|---|---|---|
| Red | **X** | left-to-right |
| Green | **Y** | front-to-back |
| Blue/accent | **Z** | up |

If you orbit the view, the gizmo and the dimension lines swing round with the shape and
re-draw themselves from the new angle. The numbers do not change — a 40 mm cube is 40 mm
from every angle — but which edge each dimension line is drawn against does, so the
numbers stay clear of the solid instead of disappearing behind it.

### Once a shape is turned

The dimension lines measure the **shape's own** width, depth and height, along the
shape's own edges — not along the grid. Turn a shape and the three lines tilt over with
it and keep reading the same three numbers, because turning something does not change
how big it is.

That is the useful behaviour, and it is worth being clear about it, because the obvious
alternative is not useful at all: the smallest *grid-aligned* box a tilted shape fits
inside is bigger than the shape on nearly every axis, and none of its three numbers is a
measurement of the shape. A cylinder tipped over on its side would stop showing you its
diameter and its length, and start showing you the size of an invisible crate around it.

So the red line is the part's own width wherever the part is pointing, the green line is
its depth, and the blue line is its height. The gizmo's arrows are a separate thing and
deliberately keep pointing along the **grid's** directions, which is what you want when
you are moving something in the room rather than measuring it.

## The Inspector

**On a laptop or a tablet**, the Inspector is the column down the right-hand side of the
window. It is always there. With nothing selected it says *"(nothing selected)"* — that
is the panel waiting for you, not a fault.

**On a phone**, there is no room for a permanent column, so the Inspector is a sheet that
slides up from the bottom of the screen. **It opens by itself the moment you select
something** — you do not have to tap anything extra. To put it away, either swipe the
sheet down by its grab handle, or tap an empty patch of the 3D view. Both also clear the
selection, which is the point: putting the panel away and letting go of the shape are the
same idea.

### What it shows

**Parameters** — the shape's own settings, which differ per shape because they are read
from the shape's own definition rather than from a fixed form. **These are editable**:
type a new number and press **Enter** and the shape is rebuilt at that size, staying
exactly where it is. See [Resizing a shape](#resizing-a-shape) below.

| Shape | Parameters |
|---|---|
| Cube | Size (X, Y, Z) |
| Cylinder | Diameter, Height |
| Cone | Diameter, Height |
| Hexagon | Diameter, Height |
| Triangle | Side lengths (A, B, C), Height |
| Tube | Diameter, Inner diameter, Height |
| Sphere | Diameter |

**Transform** — where the shape is and how it is turned:

- **Position X/Y/Z** — the middle of the shape, in millimetres from the grid's origin.
  **Editable** — see [Moving and turning a shape](#moving-and-turning-a-shape) below.
- **Rotation X/Y/Z** — in degrees. **Editable**, the same way.
- **Size X/Y/Z** — the same three numbers the dimension lines are showing, in case you
  would rather read them in the panel. Read-only: this is a *measurement* of the shape,
  not a setting. To change how big a shape is you change its parameters above.

## Resizing a shape

The **Parameters** boxes at the top of the Inspector are how you change how big a shape
is. Click into one, type a number, and press **Enter** (or click away). The shape is
rebuilt at the new size straight away, and **it stays centred where it already was** —
resizing is not a move, so nothing jumps back to the origin or to where you first
dropped it. The gizmo and the dimension lines resize to match, because they measure the
shape rather than remembering it.

Parameters are in millimetres, the same as Position, and you can leave the `mm` in place
when you retype a value. Each box sets **that one parameter** and leaves the others
alone, so changing a cylinder's Diameter does not touch its Height. For a shape with a
multi-part parameter — a cube's **Size X/Y/Z**, a triangle's **Side lengths A/B/C** —
each box is one part of it, so you can make a cube into a slab by changing X alone.

If you type something that is not a number, the box puts the old value back and nothing
changes. If you type a number the shape cannot be built from — a diameter of `0`, or a
negative height — nothing changes either, and a short message appears under the boxes
saying what was wrong. Correct the number and it commits normally; the message is not a
state you have to clear.

### Worked example: narrow a cylinder

1. Drag a **Cylinder** onto the grid and click it. The Inspector's **Parameters**
   section shows **Diameter 40.000 mm** and **Height 50.000 mm**.
2. Click into the **Diameter** box, type `10`, and press **Enter**.
3. The cylinder narrows to 10 mm across, **staying centred on the same spot** — it does
   not slide anywhere. The box now reads `10.000 mm`, and the Inspector's **Size** row
   below reads `10 / 10 / 50`: two of the three numbers changed, the height did not.
4. Move the cylinder somewhere else with the gizmo, then come back and change its
   **Height** to `20`. It stays exactly where you moved it. Editing a parameter never
   undoes a move.

### When Parameters are greyed out

Two cases, and the panel tells you which:

- **You are looking inside a group.** The breadcrumb at the top of the panel shows
  `Group ▸ Part`. A part inside a group is shown for measurement only — step back up to
  the group with the breadcrumb link to change anything.
- **The shape has a Fillet or a Chamfer on it.** Changing a parameter rebuilds the shape
  from its numbers, and a rebuilt shape cannot carry a rounded or bevelled rim with it —
  so rather than quietly throwing your fillet away, the app freezes those boxes and says
  so underneath them. You can still move and turn the shape; it is only its own
  dimensions that are fixed. If you need a different size, make the shape the size you
  want first, then round it.

## Moving and turning a shape

There are two ways to move a selected shape, and they always agree with each other —
they are the same change made from two places, not two separate features.

**In the 3D view**, drag any of the gizmo's three arrows to move the shape along that
direction. The shape follows your pointer as you drag, and the Inspector's **Position**
numbers count up or down in step with it — you do not have to let go to see where you
are. Drag one of the three rings to turn the shape about that axis; it turns on the
spot, about its own middle, and the **Rotation** numbers track the drag the same way.
Let go and the change is made. The small arrow markers on each ring are there for
exactly this: they show you which way a drag along that ring will spin the shape,
before you have grabbed anything.

**In the Inspector**, click into any Position or Rotation box, type a value, and press
**Enter** (or click away). The shape moves to match straight away. A Position is in
millimetres from the grid's origin and a Rotation is in degrees; you can leave the `mm`
or `°` in place when you retype a value, and a negative number is fine.

If you type something that is not a number, the box puts the old value back and nothing
moves.

The handles have a generous invisible catchment around them, wider than they look, so
they are reachable with a fingertip on a phone as well as with a mouse pointer — you do
not have to hit the thin line exactly. If you press a handle and change your mind
without moving, nothing happens except that you select whatever is underneath.

### Worked example: move and turn a cube

1. Drag a **Cube** onto the grid and click it. The Inspector shows **Position** with a Z
   of `20`, because a 40 mm cube resting on the grid has its middle 20 mm up.
2. Drag the **red arrow** (X) to the right. Watch the **Position X** box: it changes as
   you drag, not just when you let go. Release at about 60 mm.
3. Now click into the **Position X** box, type `0`, and press **Enter**. The cube slides
   straight back to where it started.
4. Drag the **blue ring** (the one circling the Z arrow) about a quarter turn. The
   **Rotation Z** box counts up as you go.
5. Click into **Rotation Z**, type `45`, press **Enter**. The cube snaps to exactly 45°.
   Watch the dimension lines: they swing round to sit along the cube's new edges, and
   all three still read **40 mm**. A turned 40 mm cube is still a 40 mm cube, so the
   numbers should not — and do not — move.
6. Note that there is still exactly **one** cube. Moving a shape moves it; it never
   leaves a copy behind.

### Worked example: read a tipped-over cylinder

1. Drag a **Cylinder** onto the grid and click it. Standing upright, the red and green
   lines read **40 mm** (its diameter, measured twice) and the blue one reads **50 mm**
   (its height).
2. Drag the **red ring** — the one circling the red arrow — about a quarter turn, so the
   cylinder tips over onto its side.
3. Read the lines again. They have tilted over with the cylinder, and they still say
   **40**, **40** and **50**. The blue one is now lying almost flat across the screen,
   because "the height of the cylinder" is now pointing sideways — but it is still the
   cylinder's length, and it is still 50 mm.
4. Check the Inspector's **Size** row while you are there: **40 / 40 / 50**, the same
   three numbers. The panel and the lines always agree, because they are the same
   measurement shown twice.

### Worked example: turn a shape about two different axes

Turning about one axis and then a *different* one is worth its own walkthrough, because
the numbers behave in a way that surprises people the first time.

1. Drag a **Cylinder** onto the grid and click it. Upright, the lines read **40**, **40**
   and **50**.
2. Drag the **blue ring** (the one circling the blue Z arrow) about a quarter turn. The
   **Rotation Z** box counts up as you go.
3. Now drag the **red ring** about a quarter turn as well. The cylinder tips over on top
   of the turn it already had.
4. Read the dimension lines: still **40**, **40** and **50**. Two turns about two axes is
   still the same cylinder, and the lines are still quoting its diameter and its length,
   not the size of the box it now happens to occupy.
5. Look at the **Rotation** boxes. They describe where the shape has actually ended up —
   which is often **not** the two numbers you dragged. Turning 90° about Z and then 90°
   about X does not leave you at "90 about Z and 90 about X": turns applied one after
   another combine into a single new direction, and the boxes show you that combined
   result. This is the same reason that turning a book face-down then sideways lands
   somewhere different from doing those two moves the other way round.
6. Type `0` into all three **Rotation** boxes, one at a time. The cylinder stands back up
   exactly as it started, and the lines return to reading straight along the grid.

> Each Rotation box sets **that one axis** and leaves the other two alone. So typing `90`
> into Rotation X puts the shape at 90° about X while keeping whatever Y and Z currently
> say — it does not reset them.

> Turns are always reported between **-180°** and **180°**. If you keep dragging a ring
> the same way past half a turn, the number wraps round to the negative side rather than
> counting on to 200° or 350°. It is the same orientation either way.

## Worked example

1. Drag a **Cylinder** out of the Library and drop it on the grid.
2. Click it.
3. The Inspector shows **Diameter 40 mm** and **Height 50 mm** — the cylinder's own two
   settings — plus a Position with a Z of `25`, because the cylinder sits *on* the grid
   and 25 mm is halfway up a 50 mm-tall part.
4. In the 3D view, the red and green dimension lines both read **40 mm** (the diameter
   across, twice) and the blue one reads **50 mm** (the height).
5. Drag a **Cube** in next to it and click *that*. Everything re-points at the cube:
   the gizmo jumps across, the dimension lines all read **40 mm**, and the Inspector
   swaps Diameter/Height for a single **Size** row. You never see two shapes annotated
   at once.
6. Click an empty patch of grid. The gizmo, the dimension lines and the Inspector's
   fields all go away together.

## Selecting more than one shape

Hold **Shift** (or **Cmd**/**Ctrl**) and click a second shape to add it to the selection.
Shift-clicking a shape that is already selected takes it back out again.

With two or more selected, the Inspector says how many — for example *"2 selected"* — and
shows no parameter fields, because there is no longer a single shape to describe. The
gizmo and dimension lines go away for the same reason. This state is the starting point
for operations that need two shapes, such as cutting one out of another; those tools
arrive with the boolean operations.

### Dragging a selection box (marquee)

To select several objects at once, press and drag from empty space in the viewport — a
selection box follows your pointer; release it, and every object inside the box is
selected, showing *"<n> selected"* in the Inspector. It's the fastest way to grab
several shapes without clicking each one individually, and it's the only way to
multi-select on a touch device, where there is no Shift key to hold at all.

An object only needs to be **partly** inside the box to be picked up — you don't have to
enclose a shape completely, just clip it.

**On a laptop or desktop with a mouse**, hold **Ctrl** (or **Cmd** on a Mac) and drag
from empty space to draw the box. An ordinary drag with no modifier still orbits the
camera, exactly as it always has — the marquee only starts once Ctrl/Cmd is held down,
so navigating the viewport by dragging never changes. Add **Shift** at the same time
(**Ctrl+Shift**, or **Cmd+Shift**) to add the enclosed shapes to whatever is already
selected, instead of replacing it — the same thing Shift already means for a click.

**On a touch device** — or if you'd rather not hold a modifier key on a mouse — tap the
**Select** button in the navigation controls at the bottom of the viewport (next to
Orbit and Pan). While it's active, a one-finger drag from empty space draws the
selection box instead of orbiting the camera. Tap **Orbit** or **Pan** again to go back
to navigating. Additive marquees (adding to an existing selection with a second drag)
need Shift, which isn't available on touch, so a touch marquee always replaces the
current selection rather than adding to it.

Dragging a box over nothing clears the selection, the same as clicking empty space.

## Selecting a shape you cannot click: the Objects list

A shape that sits **completely inside** another one cannot be clicked, from any angle —
your click always lands on the outer shape first. A bolt standing inside a case shell is
the usual example, and it is exactly the shape you most want to select, to cut it out of
the shell. The **Objects** list is the way in: it names every shape in your model, and
tapping a name selects that shape, with no clicking in the 3D view at all.

Open it with the **Objects** button in the top bar (the cube icon, between Undo/Redo and
History). On a laptop or tablet it opens as a strip along the bottom of the 3D view; on a
phone it opens as a sheet from the bottom. Close it with the button again, or its **✕**.
It starts closed each time you open the app.

- **Tap a row** to select that shape and *only* that shape. Everything you get from
  clicking a shape happens: the Inspector fills in, the gizmo and dimension lines appear,
  and the shape is highlighted.
- **Tap the small box on the left of a row** to add that shape to the selection (or take it
  out again). This is the way to select two shapes on a phone, where there is no Shift key
  — and it works on a laptop too. On a laptop you can also Shift-, Ctrl- or Cmd-click the
  row. The box shows a number: **1** is the shape that comes first (the one Subtract cuts
  *from*), **2** and up are the rest — the same two colours the Operations toolbar uses.
- You can mix the two routes freely: click one shape in the 3D view, then add a hidden one
  from the list, or the other way round.
- Each row shows the shape's name and its size (width × depth × height, in millimetres),
  so you can tell a 40 mm shell from the small bolt inside it.

**You can see a hidden shape is selected.** Because the shell would otherwise hide it, a
selected shape that is out of sight shows through as a translucent tint in its selection
colour. A shape that is not hidden looks exactly as it always did.

The list only shows shapes that are in your model *right now*. If you have suppressed a
step, or rolled History back past it, that shape is not in the scene, so it is not in the
list — a note at the bottom says how many steps are missing for that reason. The Objects
list and the [History panel](timeline.md) share the same spot, so opening one closes the
other. They are different lists: History is numbered *steps* you have taken; Objects is
the *shapes* that result. Picking a History step never selects a shape, and picking a
shape never selects a step.

### Worked example: cut a hidden bolt out of a shell

You need a Cube (the shell) and a Bolt (the hardware) with the bolt entirely inside it. A
drag always places a new shape flush against its neighbour, so build the overlap by hand:
place a Cube and a Bolt, then use **Align** and **Snap** from the Operations toolbar (see
[Precise placement: Snap and Align](snap-align.md)) to move the bolt inside the cube — or open a
project that already has one inside the other.

1. Click the top bar's **Objects** button. Two rows appear: *Cube 1* and *Bolt 1*.
2. Try clicking the bolt in the 3D view. You get the cube every time — the bolt is inside
   it. That is the problem the list solves.
3. **Tap the *Cube 1* row.** The cube is selected. The Operations toolbar says *1 selected*.
4. **Tap the little box on the *Bolt 1* row.** The box turns teal and shows **2**; the
   *Cube 1* box shows **1**. The Operations toolbar now says *2 selected — first is the
   base*, and **Subtract** lights up. In the 3D view the hidden bolt shows through the cube
   as a teal tint.
5. Press **Subtract**. The cube now has a bolt-shaped cavity, the *Bolt 1* row disappears
   from the list (that shape has been used up), and the cube's volume has dropped by exactly
   the bolt's volume. Press **Undo** to bring the bolt back.

If you only tap the *Bolt 1* row (step 3 on the bolt instead), the bolt alone is selected:
its Inspector and gizmo appear, and you can move or rotate it — even though the cube is
in front of it — by dragging the gizmo's arrows or typing into the Position boxes.

### Picking one piece of a hidden shape

A shape built from named pieces — a bolt's head/thread/`tap`, a Raspberry Pi's jacks and
ports — normally opens those pieces by clicking it a *second* time in the 3D view (see
[Combining shapes](booleans.md)). A shape that is completely hidden inside another one
cannot be clicked even once, let alone twice, so the Objects list gives every row that
has pieces a small **▸** disclosure arrow at its right edge. Tap it to show the shape's
pieces as indented rows underneath — including pieces that are themselves invisible
(like a bolt's `tap` clearance), because those are exactly what you would want to
subtract with.

**Worked example: an Ethernet port opening in a fully enclosed case.** You have a
Raspberry Pi B+ built entirely inside a case shell — the whole board, not just resting
against a wall of it.

1. Open **Objects**. Two rows appear: *Shell 1* and *Raspberry Pi B+*. Trying to click
   the Pi in the 3D view gets you the shell every time.
2. **Tap the *Shell 1* row first.** The shell is selected — *1 selected*. This step has
   to come first: Subtract always cuts from whatever you selected *first*, and you want
   the case to be what gets cut, not the board.
3. **Tap the ▸ next to *Raspberry Pi B+*.** Its pieces list opens underneath — `mb`,
   `ethernet`, `usb1`, `hdmi`, and so on, with a handful of invisible mounting pieces
   at the bottom (each labelled *hidden*).
4. **Tap the little box on the *ethernet* row.** It turns teal and shows **2**; the
   *Shell 1* box still shows **1**. The Operations toolbar reads **Shell 1 then
   Raspberry Pi B+ › ethernet**, and **Subtract** lights up.
5. Press **Subtract**. The case gets a jack-sized opening — **4 545.0 mm³** worth of
   material removed, not the board's whole **23 168.2 mm³** footprint — and the Pi
   disappears from the list, used up like any Subtract operand.

**Tap a piece row itself** (not its box) to select *only* that piece of that shape,
replacing whatever was selected before — the same as tapping a plain row does for a
whole shape. Tapping the parent's own row afterward steps back up to the whole shape.
A piece you have addressed stays named on its parent row (`› ethernet`) even while the
pieces list is collapsed, so you can always see what a Subtract is about to cut with
before you press it.

**Order matters, and the list shows you before you commit.** If you tap *ethernet*
before *Shell 1*, the Pi becomes the base and the shell becomes the thing subtracted
*from* it — the badge reads **Raspberry Pi B+ › ethernet then Shell 1**, the wrong way
round. Read the badge before pressing Subtract; it always names which shape is the base.

A hardware bolt's `tap` piece is the one case where addressing a piece changes nothing:
`tap` is the bolt's full clearance envelope, so cutting with it or with the whole bolt
gives the identical hole.

## Troubleshooting

- **I clicked a shape and nothing happened.** Check that you clicked the shape itself and
  not the grid beside it. The shape's base sits at the point you dropped it, so the solid
  is drawn *upward* from there on screen — aim slightly above the spot where you dropped.
- **The dimension numbers look wrong.** They measure the smallest box that fits the
  shape, lined up with the *shape's own* edges. For a sphere or a cylinder, that means
  the first two numbers are both the *diameter*, not the radius. For a shape you have
  turned, it means the numbers stay the same as before you turned it — that is the point,
  not a fault.
- **I turned a shape and the dimension lines went diagonal.** They are following the
  shape's own edges, which are diagonal now. The numbers are still the shape's real
  width, depth and height. If you want the lines back on the grid's directions, set the
  **Rotation** boxes back to `0`.
- **I tried to drag a gizmo arrow and the view spun instead.** You caught the grid rather
  than the handle. The handles start a little way out from the middle of the shape, so
  aim at the outer half of the arrow, nearer its head.
- **I typed a position and the shape did not move.** Press **Enter**, or click somewhere
  else, to commit it — the shape moves when you finish editing, not on every keystroke.
- **I can't click the shape I want — something else is in front of it.** Open the
  [Objects list](#selecting-a-shape-you-cannot-click-the-objects-list) and tap its name.
- **The Objects list is greyed out and says it is read-only.** It does that while you are
  previewing a past step in History (or in sketch mode). Come back to the latest step, or
  leave sketch mode, and it works again.
- **A shape I know is in the model is missing from the Objects list.** Its step is probably
  suppressed or rolled back — see the note at the bottom of the list, and the
  [History panel](timeline.md).
- **The Inspector sheet keeps covering the 3D view on my phone.** Swipe it down by its
  grab handle. The view's own navigation controls move up out of the way while the sheet
  is open, so they are never trapped underneath it.

# Selecting a shape, and reading its size

Once you have placed something (see [Placing a shape](primitive-placement.md)), the next
thing you will want to know is **how big it is** and **what it is made of**. Both answers
come from the same gesture: click it.

## Selecting

Click — or tap — directly on a shape in the 3D view. Three things happen at once:

1. **A gizmo appears at the middle of the shape.** Three coloured arrows point along the
   part's X, Y and Z directions, and three faint rings circle it. The arrows are the
   move handles and the rings are the rotate handles — both draggable, see
   [Moving and turning a shape](#moving-and-turning-a-shape). **The gizmo's size follows
   the shape it is attached to**, rather than staying a fixed size: its arms and rings
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
from the shape's own definition rather than from a fixed form:

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

> The **Parameters** section is still read-only. It shows you real, current values, but
> typing in them does nothing yet.

## Moving and turning a shape

There are two ways to move a selected shape, and they always agree with each other —
they are the same change made from two places, not two separate features.

**In the 3D view**, drag any of the gizmo's three arrows to move the shape along that
direction. The shape follows your pointer as you drag, and the Inspector's **Position**
numbers count up or down in step with it — you do not have to let go to see where you
are. Drag one of the three rings to turn the shape about that axis; it turns on the
spot, about its own middle, and the **Rotation** numbers track the drag the same way.
Let go and the change is made.

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
   The red and green dimension lines now read about **57 mm** rather than 40 mm — that is
   correct: a 40 mm square turned 45° is 40 × √2 ≈ 56.6 mm across its corners.
6. Note that there is still exactly **one** cube. Moving a shape moves it; it never
   leaves a copy behind.

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

## Troubleshooting

- **I clicked a shape and nothing happened.** Check that you clicked the shape itself and
  not the grid beside it. The shape's base sits at the point you dropped it, so the solid
  is drawn *upward* from there on screen — aim slightly above the spot where you dropped.
- **The dimension numbers look wrong.** They measure the shape's bounding box — the
  smallest box the shape fits inside. For a sphere or a cylinder, that means the
  left-to-right and front-to-back numbers are both the *diameter*, not the radius.
- **I tried to drag a gizmo arrow and the view spun instead.** You caught the grid rather
  than the handle. The handles start a little way out from the middle of the shape, so
  aim at the outer half of the arrow, nearer its head.
- **I typed a position and the shape did not move.** Press **Enter**, or click somewhere
  else, to commit it — the shape moves when you finish editing, not on every keystroke.
- **The Inspector sheet keeps covering the 3D view on my phone.** Swipe it down by its
  grab handle. The view's own navigation controls move up out of the way while the sheet
  is open, so they are never trapped underneath it.

# Placing a shape

WarpCad builds parts out of solids. The quickest way to get your first solid into a
project is to drag one out of the **Library** panel and drop it into the 3D view.

The Library has four sections, and the gesture is identical in all of them:

- **Primitives** — the basic solids you shape a part out of: Cube, Cylinder, Cone,
  Hexagon, Triangle, Tube, Sphere.
- **Hardware** — ready-made, real-world fasteners at their real sizes: Bolt, Nut,
  Washer, Bearing.
- **Kit Parts** — the general-purpose building blocks: Board, Board Frame, Anchor.
- **Raspberry Pi** — real Raspberry Pi boards and accessories at their real
  dimensions: the board itself, cameras, HATs, the cooling fan and five screens.

## Where the Library panel is

- **On a laptop or tablet**, the Library is the column down the left-hand side of the
  window. It is always there — nothing to open.
- **On a phone**, there is not enough width for a permanent column, so the Library
  lives in a sheet along the bottom of the screen. Tap the **Library** tab (the bar
  with the grab handle) to slide the sheet open. You have to open the sheet *before*
  you start dragging — you cannot drag a row that is not on screen. Once a drag has
  started the sheet stays put; it will not close underneath your finger.

## Placing your first shape

1. Find the **Primitives** section at the top of the Library panel. It lists seven
   basic solids: Cube, Cylinder, Cone, Hexagon, Triangle, Tube and Sphere.
2. Press and hold on the **Cube** row — a mouse press, or a finger, both work.
3. Keep holding and drag toward the 3D view. A small label follows your pointer while
   you are still over the panel.
4. As soon as you cross into the 3D view, the label is replaced by a **translucent
   preview of the actual cube**, sitting on the grid, following your pointer.
5. Let go. The cube is placed at exactly the spot you released, sitting on top of the
   grid, and it is highlighted to show it is now the selected object.

That is the whole gesture. It is the same one for every row in the panel — in both
sections — so once you have placed a cube you already know how to place a sphere, or a
bolt.

## Placing a second shape

Repeat the drag with a different row — say **Sphere** — and drop it somewhere else on
the grid.

You will now have two separate objects. Dropping the sphere does not move, replace or
hide the cube: **each drop adds a new, independent object, and everything you placed
earlier stays exactly where you put it.** If you ever see an earlier object vanish
when you drop a new one, that is a bug worth reporting.

## Placing a hardware part

Underneath the Primitives rows is a second section, **Hardware**: Bolt, Nut, Washer and
Bearing. These are not shapes you size yourself — they are real fasteners at their real
dimensions, the sizes you would actually buy.

1. Scroll down in the Library panel (or in the phone sheet) past Primitives to the
   **Hardware** section.
2. Drag **Bolt** into the 3D view exactly the way you dragged a Cube. The preview that
   follows your pointer is the bolt itself — its hex head and its thread — not a
   placeholder box, so you can see how it is sitting before you let go.
3. Release. Like a primitive, it lands at the spot you released, resting on the grid,
   and it is selected.

From there it behaves like anything else you have placed: click it to select it, drag
the gizmo to move or turn it, line the next thing up against it with the guide lines
above, and use it as an operand for Union or Subtract.

What you get by default:

| Row | What you get | Default |
| --- | --- | --- |
| Bolt | A hex-head bolt (metal only — its clearance envelope is a hidden part) | M10 hex, 20 mm thread |
| Nut | A hex nut | M4 |
| Washer | A flat washer | M6 |
| Bearing | A deep-groove ball bearing | 608 (⌀22 × ⌀8 × 7 mm) |

Select a placed bolt and the Inspector shows what it is made from — `spec`, `length`,
`fit` — but these are **read-only for now**, and the panel says so. They are catalogue
choices (a size out of a table, a clearance class), not numbers to type over, so
changing them needs a size picker that does not exist yet. Position and rotation are
editable as usual. See [Selecting a shape](selection-and-inspector.md).

> **Note:** a bolt's outline is its **metal** — head and thread, gray and silver. Its
> clearance envelope is a hidden part named `tap`: still there, still the size that lets
> a bolt actually fit through a hole rather than jam in one, but not part of what you
> see or what a plain Subtract uses by default. See
> [Cutting with just one part of a multi-part shape](booleans.md#cutting-with-just-one-part-of-a-multi-part-shape)
> for how to address it.

## Placing a kit part

Below Hardware is **Kit Parts** — three general-purpose blocks you build enclosures and
brackets out of:

| Row | What you get | Default |
| --- | --- | --- |
| Board | A flat slab with rounded corners | 40 × 30 mm, 1.62 mm thick, 3 mm corners |
| Board Frame | The same slab with a rectangular window cut out of it | 40 × 30 outer, 30 × 20 window |
| Anchor | A post with a matching hole, as one two-part item | ⌀10 × 10 mm |

1. Scroll down past Hardware to the **Kit Parts** section.
2. Drag **Board** into the 3D view exactly the way you dragged a Cube.
3. Release. It lands at the spot you released, resting on the grid, selected.

## Placing a Raspberry Pi part

The last section, **Raspberry Pi**, holds twelve real parts at their real dimensions —
useful as the thing you design a case *around*, and as an operand for Subtract when you
want a cut-out that something actually fits through.

1. Scroll down to the **Raspberry Pi** section.
2. Drag **Raspberry Pi** into the 3D view. Before you start the drag, use the row's
   **Model** dropdown to choose Pi 4 or Pi 5 — the preview and the placed board both
   reflect whichever is selected, so you can see which board you are getting before you
   let go.
3. Release to place it, exactly like a primitive.

Two rows have that dropdown, because the same part comes in several revisions:

| Row | Models | Default |
| --- | --- | --- |
| Raspberry Pi | Pi 2 / B+, Pi 3, Pi 4, Pi 5 | Pi 4 |
| Camera Module | Camera v1, v2, v3, HQ Camera, Arducam HQ | Camera v3 |

Your choice sticks until you change it, so placing three Pi 5s means picking the model
once, not three times. Every other row is a single fixed part with nothing to choose.

The rest of the section is accessories: **HAT**, **HAT Standoff**, **Spacer**, **Active
Cooling Fan**, and the screens — **7-inch Touch Display**, **Touchscreen 2**,
**HyperPixel 4**, **Mini PiTFT**, **PiTFT 2.2** and **PiTFT 2.4**.

> **Each part is placed on its own, not attached to a board.** Dragging in a HAT or a
> screen gives you that part by itself, resting on the grid wherever you dropped it —
> it does not arrive already mounted on a Pi, and placing a Pi afterwards does not pull
> it into position. That is deliberate: mounting one part onto another is its own
> step, so you can see and undo it. Place both parts, select them, and use **Snap** or
> **Align** to bring them together — see [Snapping and aligning](snap-align.md).

Like a hardware part, a placed Raspberry Pi part's Inspector parameters (including
`model`) are **read-only** — they are catalogue choices, not numbers to type over. To
place a different model, pick it on the row and drag in a new one.

## Lining a shape up with one you already placed

Once there is something on the grid, dropping the *next* thing beside it gets help. As
your preview comes near an existing object, **dashed guide lines appear on that object**
and the preview jumps a little to line up with them. Let go while the lines are showing
and the shape lands exactly on that alignment, not at the raw spot your pointer was
over.

Try it:

1. Drag a **Cube** into the 3D view and drop it. Nothing special happens — with an empty
   grid there is nothing to line up against.
2. Now drag a **Cylinder** in, and move it slowly toward the cube rather than dropping it
   straight away.
3. As you get close, one or two dashed lines appear **on the cube** — running through its
   middle, or along one of its faces — and the cylinder's preview snaps onto them.
4. Let go. The cylinder is placed lined up with the cube: sharing its centre line,
   sitting flush with one of its faces, or resting right up against it, depending on
   which line you were nearest.

Reading the lines:

- A **long-dashed** line runs through the middle of the object. Snapping to it puts the
  two objects' centres on the same line — this is the one you want for dropping a washer
  onto a bolt, or centring a part on a plate.
- A **short-dashed** line runs along one of the object's faces. Snapping to it either
  lines the two faces up with each other, or butts the new shape right up against that
  face with no gap.

The lines only appear when your preview is genuinely **near** the object — within about
half an inch on screen. They only assist with placement across the grid (left/right and
front/back), never with height, because a drag always drops onto the grid. And they only
ever measure against the object your preview is nearest to, so a crowded scene does not
fill up with lines.

If you would rather place a shape somewhere close to another one *without* it lining
itself up, either drop it further away and move it in afterwards, or zoom in first —
"near enough to snap" is a distance on your screen, so zooming in makes it a smaller
distance on the model and gives you finer control.

## Selecting what you placed

- Click (or tap) an object in the 3D view to select it. Only the object you clicked is
  selected; the highlight moves rather than accumulating.
- Click empty space — anywhere on the grid with no object on it — to clear the
  selection.

A short drag inside the 3D view orbits the camera instead of selecting, so you can
turn the scene around without losing your selection by accident. See
[Moving around the 3D view](viewport-navigation.md) for the rest of the camera
controls.

> **Coming next:** selecting an object will also open an Inspector showing its
> dimensions, and attach a move/rotate gizmo you can drag. Today, selecting
> highlights the object.

## Where shapes land

- The drop point is projected onto the **grid plane**, so a shape always lands on the
  ground rather than floating at an arbitrary height.
- Shapes rest **on** the grid — the bottom face sits at zero, not the middle of the
  solid — which is what you want when you are about to stack something on top.
- Zoom affects how far a given amount of pointer movement travels in millimetres.
  Zoom in before dropping if you want to place something precisely; the scale bar in
  the corner of the 3D view tells you what you are working at.

## What each Primitives row gives you

Every shape arrives at a sensible default size in millimetres, which you can change
later. (The Hardware rows' defaults are in the table further up.)

| Row | What you get | Default |
| --- | --- | --- |
| Cube | A box | 40 × 40 × 40 mm |
| Cylinder | A round rod or disc | ⌀40 × 50 mm |
| Cone | A cone, tapering to a point | ⌀40 base × 50 mm |
| Hexagon | A six-sided prism (nut-shaped) | ⌀40 across corners × 20 mm |
| Triangle | A triangular prism | 45 mm sides × 30 mm |
| Tube | A hollow cylinder — a pipe | ⌀40 outer, ⌀26 bore × 50 mm |
| Sphere | A ball | ⌀40 mm |

## If a drop does not land

Releasing outside the 3D view — back over the Library panel, over the header, or off
the edge of the window — cancels the placement and nothing is added. The preview
disappears and you can start again.

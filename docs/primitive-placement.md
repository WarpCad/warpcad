# Placing a shape

WarpCad builds parts out of solids. The quickest way to get your first solid into a
project is to drag one out of the **Library** panel and drop it into the 3D view.

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

That is the whole gesture. It is the same one for every row in the section, so once
you have placed a cube you already know how to place a sphere.

## Placing a second shape

Repeat the drag with a different row — say **Sphere** — and drop it somewhere else on
the grid.

You will now have two separate objects. Dropping the sphere does not move, replace or
hide the cube: **each drop adds a new, independent object, and everything you placed
earlier stays exactly where you put it.** If you ever see an earlier object vanish
when you drop a new one, that is a bug worth reporting.

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

## What each row gives you

Every shape arrives at a sensible default size in millimetres, which you can change
later.

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

# Mirroring a shape: Mirror

**Mirror** adds a reflected **copy** of one placed shape on the other side of a plane.
The original stays exactly where it is. It is on the Operations toolbar beside Fillet,
Enlarge and Bisect, and like them it stays dimmed until **exactly one** shape is selected.

Unlike those buttons, Mirror doesn't change the shape you picked — it makes a second one.
Afterwards there are two shapes in the scene, and the **new copy** is the one that's selected.

## A worked example

1. Drag a **Cube** out of the Library into the 3D view, off to one side of the origin.
2. With the cube selected, click **⇋ Mirror** on the Operations toolbar. A popover opens.
3. Leave **Mirror across** on **X plane**. **Plane position** starts at `0`, the world plane
   through the origin — so the copy lands at the same height and depth, on the opposite
   side of the origin along X.
4. Click **Mirror**. A second cube appears on the far side and is selected (its dimension
   lines and gizmo moved to it). The first cube hasn't moved.
5. Changed your mind? **Undo** removes only the copy.

## The two fields

- **Mirror across** — which plane to reflect across: X, Y or Z. A cube moved +30 mm along X
  lands at -30 mm along X when you mirror across the X plane at position `0`.
- **Plane position (mm)** — where that plane sits along its axis. `0` is the world plane.
  **Clear the field** to mirror about the shape's own centre instead. A symmetric shape (a
  cube, a cylinder) mirrored about its own centre lands exactly on itself, so you won't see
  a second shape appear; type a position to put the copy somewhere else.

## Good to know

- The copy is a snapshot. Moving the original afterwards doesn't drag the copy with it.
- Mirroring a composite (a Bolt, a Raspberry Pi) copies all of its parts and nothing else.
- A turned shape keeps its turn mirrored, so its dimension lines still measure the part.
- On a phone the popover opens the same way as the other toolbar popovers; press Escape or
  **Cancel** to close it without adding anything.

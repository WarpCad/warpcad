# Sketch mode: drawing a line on the working plane

Everything else in WarpCad so far is 3D: you drag a solid out of the Library,
move it, combine it with another one. **Sketch mode** is different. It flattens
the camera onto the grid and lets you draw flat, 2D geometry directly on it —
the construction lines that, in a parametric CAD tool, eventually get extruded
or revolved into solids.

> **What exists today: one tool, Line.** That is deliberately the whole of it.
> Rectangle, circle and arc tools, snapping to existing geometry, dimensions and
> constraints are all planned and none of them are built yet — so if you open
> sketch mode looking for a circle tool and can't find it, you aren't missing
> anything, it genuinely isn't there. Turning a sketch into a solid (extrude,
> revolve) isn't built yet either. This page will grow as those land.

---

## A first walkthrough

Try this with the app open, on an empty scene:

1. **Click `Sketch`** in the navigation controls at the bottom-left of the 3D
   view. Three things happen at once:
   - the camera swings to look **straight down** at the grid, so you're looking
     at the working plane face-on rather than at an angle;
   - a small **Sketch** toolbar appears at the top of the 3D view, with a `Line`
     button (already active — it's the only tool) and an `Exit Sketch` button;
   - the `Orbit` / `Pan` / `Select` buttons and the orientation triad go dim.
     They're unavailable on purpose — see [While you're
     sketching](#while-youre-sketching) below.
2. **Drag once across the grid.** Press anywhere in the 3D view, drag to a
   second point, and release. While you're dragging, a dashed preview line
   follows your pointer so you can see exactly what you're about to draw. When
   you let go, the line commits: a thin, bright, solid stroke, drawn right where
   you dragged.
   - It looks deliberately unlike a 3D shape — no shading, no surface, just a
     line. That's how you tell at a glance that something is sketch geometry and
     not a solid.
   - A drag works the same way with a mouse, a finger or a stylus. You don't
     need to hold any key.
3. **Click somewhere empty**, then **click the line you just drew.** The line
   highlights, and the Inspector panel fills in with the line's own numbers:
   **Start** (X and Y), **End** (X and Y), and **Length**, all in millimetres.
   You'll also see two small round **handles**, one at each end of the line.
   - There's no move/rotate gizmo here, unlike a selected 3D shape. A flat line
     on the working plane is edited by dragging its ends, so that's what you
     get: two endpoint handles instead of arrows and rings.
4. **Drag one of the handles.** The line follows, and the Inspector's Start (or
   End) and Length update *as you drag*, not just when you let go.
   - Typing does the same thing: click into `Start X`, type a number, press
     Enter, and the endpoint jumps there. Dragging a handle and typing a
     coordinate are the same edit — use whichever suits the moment.
   - **Length is read-only.** It's a measurement of the line, not a setting: if
     you could type a length, WarpCad would have to guess which end you wanted
     to move.
5. **Click `Exit Sketch`** (either in the Sketch toolbar or the `Exit Sketch`
   button the `Sketch` toggle turns into). The camera is free to orbit again,
   the Sketch toolbar disappears, and the drag gesture goes back to moving the
   camera.
   - **Your line stays.** Exiting sketch mode doesn't delete anything. Orbit
     around and you'll see the line sitting flat on the grid where you drew it,
     from any angle.

---

## While you're sketching

Sketch mode reclaims the plain drag gesture — in the 3D view, dragging draws a
line instead of orbiting the camera. A few controls change to match:

| Control | While sketching |
|---|---|
| Drag in the 3D view | Draws a line (one finger, or left mouse button) |
| `Orbit` / `Pan` / `Select` toggle | Dimmed — drag already has a job |
| Direction pad (▲ ◀ ▶ ▼) | **Pans** the camera, whatever the toggle says |
| `+` / `−` zoom buttons | Zoom, unchanged |
| Two-finger pinch and drag | Zoom and pan, unchanged |
| Orientation triad (`X`, `Y`, `Z`, `Home`) | Dimmed |

The triad is dimmed for a specific reason rather than to keep things tidy: it
snaps the camera to side-on views like Front and Right, and from a side-on view
the working plane is edge-on — a line you tried to draw would have nowhere to
land. The triad keeps *showing* you which way the camera is pointing, it just
won't move it while you're drawing. Pan and zoom stay available throughout,
because you still need to get around the plane you're working on.

Leave sketch mode and everything comes straight back, exactly as it was.

---

## Things worth knowing

- **A tap draws nothing.** Press and release without moving and no line is
  created — you get a clean grid rather than a zero-length line you can't see
  and can't click. Same for a drag of a pixel or two.
- **Exiting doesn't restore your previous camera angle.** You're returned to
  free orbit from wherever the camera is, looking down at the plane. Drag to
  orbit back to where you were, or press the `⌂` home button in the direction
  pad for the standard isometric view.
- **Sketch lines draw on top of solids**, not hidden behind them. A sketch is a
  construction layer, so it stays visible even when a shape sits between it and
  the camera.
- **Sketch lines aren't shapes.** They don't appear in the Inspector's
  multi-select count, and Union, Subtract, Intersect and Group ignore them
  completely — those tools work on solids. Selecting a line clears any shape
  selection you had, and vice versa.
- **On a phone**, the Sketch toolbar is a compact bar across the top of the 3D
  view, and the Inspector's line fields open in the usual bottom sheet. Drawing
  needs no modifier key on any device.

---

## Coming later

These are planned but not built. Listed so you know they're missing rather than
hidden somewhere:

- more sketch tools: rectangle, circle, arc, polyline;
- snapping a sketch point to the grid, to an existing line's end, or to a
  solid's edge;
- dimensions and constraints (fixing a line's length or angle, making two lines
  parallel or perpendicular);
- turning a closed sketch profile into a solid with extrude or revolve;
- deleting a sketch entity (today, a drawn line stays for the session).

See [`TODO/ROADMAP.md`](../TODO/ROADMAP.md) for where these sit in the build
order.

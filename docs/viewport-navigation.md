# Moving around the 3D view

WarpCad opens on a single screen: a dark 3D view with a millimetre grid, the
**orientation triad** in the top-right corner, the **navigation pad** in the
bottom-left, and the **scale readout** in the bottom-right. Everything on this
page works with a mouse, with a finger, or with on-screen buttons alone — you
never need a keyboard to move the camera.

---

## A first walkthrough

Try these in order, with the app open:

1. **Click and drag anywhere in the 3D view** to orbit the camera around the
   scene. Drag right and the view swings around to the left of where you were;
   drag down and you tip up to look at the scene from above. On a phone or
   tablet, drag with one finger — same result.
2. **Tap `Pan`** in the bottom-left pad. The pad's arrows relabel themselves
   ("Pan camera up" instead of "Orbit camera up"), and dragging in the 3D view
   now slides the view sideways instead of rotating it. Tap `Orbit` to switch
   back.
   - **With a mouse, you don't have to switch modes at all just to pan for a
     moment.** Hold Shift and drag with the left mouse button, or just drag with
     the right mouse button, to pan the camera without touching the `Orbit`/`Pan`
     toggle. Release Shift or the right button and a plain left-drag orbits
     again, following whatever the toggle is currently set to. This is purely a
     desktop shortcut — it doesn't change what the toggle does for touch or for
     the direction pad.
3. **Use the `+` and `−` buttons** to the right of the direction pad to zoom in
   and out. With a mouse you can also scroll the wheel over the view; on a touch
   screen, pinch with two fingers.
4. **Tap `Z` on the orientation triad** in the top-right corner to snap the
   camera to the top view — looking straight down the Z axis, with Y running up
   the screen. Try `−Y` for the front view and `X` for the right view.
5. **Tap `Home`** under the triad to return to the standard three-quarter
   (isometric) view.
6. **Read the scale off the bottom-right readout.** Each minor grid line is
   **10 mm** apart and each brighter major line is **50 mm** apart. The bar above
   the legend shows how long a round real-world distance — 100 mm, 200 mm, and
   so on — is at your current zoom, and it relabels itself as you zoom.

---

## The navigation pad (bottom-left)

| Control | What it does |
|---|---|
| `Orbit` / `Pan` | Chooses what a drag in the 3D view does. The direction pad follows this choice too. |
| ▲ ▼ ◀ ▶ | Moves the camera one step in that direction — 15° of orbit, or a short pan, depending on the mode above. |
| `⌂` (centre of the pad) | Resets the camera completely: orientation, zoom, and the point it is looking at. |
| `+` / `−` | Zooms in and out one step. |

The buttons and the drag gesture are the same controls underneath, so the view
never ends up in a state you can only reach one way.

**Mouse-only shortcuts**, on top of the `Orbit`/`Pan` toggle above:

| Gesture | Result |
|---|---|
| Shift + left-button drag | Pans, regardless of the toggle's current setting |
| Right-button drag | Pans, regardless of the toggle's current setting, no modifier needed |

Both are an *additional* way to reach the same pan the toggle already gives
you — a plain left-drag with no Shift held still follows whatever the toggle
currently says. Note that Shift plus a left-button **click** (no drag) still
adds the clicked object to the current selection instead — see
`docs/selection-and-inspector.md` — because a Shift+left press that never
turns into a real drag is a click, not a pan.

## The orientation triad (top-right)

The triad shows which way the camera is currently pointing: the red spoke is the
X axis, green is Y, and blue is Z. Solid spokes point toward you; dashed ones
point away.

Each labelled cap is a button, and clicking one moves the camera **onto** that
axis:

| Cap | View you get |
|---|---|
| `Z` | Top — looking straight down the Z axis |
| `−Z` | Bottom |
| `X` | Right |
| `−X` | Left |
| `Y` | Back |
| `−Y` | Front |
| `Home` | Isometric three-quarter view |

Zoom and the point you are looking at are left alone by a snap — only the
direction changes — so you can line up a view without losing your place.

## Touch gestures

| Gesture | Result |
|---|---|
| One-finger drag | Orbit, or pan if `Pan` is selected |
| Two-finger pinch | Zoom in and out |
| Two-finger drag | Pan, whichever mode is selected |
| Tap a triad cap or a pad button | Same as clicking it |

The 3D view claims your drags, so the page itself never scrolls or bounces while
you are moving the camera.

## Units

Everything on screen is in **millimetres**. The grid's minor lines are 10 mm
apart and its major lines 50 mm; the scale bar's label always names a real
distance, so you can judge size without opening any panel.

## If the view doesn't appear

If your browser can't start WebGL, the 3D area shows a short message explaining
that instead of a blank rectangle. The navigation pad and triad keep working —
they drive the camera, not the renderer — so the app stays usable while you fix
the browser setting or move to another device.

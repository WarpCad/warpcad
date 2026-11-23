# Moving around the 3D view

On a phone, the navigation pad folds behind a **✥** button while a sheet is open; see [Using WarpCad on a phone or tablet](mobile.md#the-navigation-pad-folds-behind-a-button).

WarpCad opens on a single screen: a dark 3D view with a millimetre grid, the
**view cube** in the top-right corner, the **navigation pad** in the
bottom-left, and the **scale readout** in the bottom-right. Everything on this
page works with a mouse, with a finger, or with on-screen buttons alone — you
never need a keyboard to move the camera.

![The whole WarpCad window with two shapes placed and one selected: Library on the left, navigation pad bottom-left, view cube top-right, scale readout bottom-right, Inspector on the right.](./screenshots/app-overview-with-model.png)

---

## A first walkthrough

Try these in order, with the app open:

1. **Click and drag anywhere in the 3D view** to orbit the camera around the
   scene. Drag right and the view swings around to the left of where you were;
   drag down and you tip up to look at the scene from above. On a phone or
   tablet, drag with one finger — same result.

   ![A left-button drag swinging the camera around a cube and a cylinder.](./media/nav-orbit.gif)
2. **Tap `Pan`** in the bottom-left pad. The pad's arrows relabel themselves
   ("Pan camera up" instead of "Orbit camera up"), and dragging in the 3D view
   now slides the view sideways instead of rotating it. Tap `Orbit` to switch
   back.
   - **In `Pan`, the move and rotate handles step aside.** With a body selected,
     a drag that starts on one of its rings or arrows pans the view like any other
     drag, so you can't turn the body by accident. Tap `Orbit` (or `Select`) and
     the handles grab again. For example: select a cube, tap `Pan`, put a finger
     on the blue ring and drag. The scene slides and the Rotation fields don't change.
   - **With a mouse, you don't have to switch modes at all just to pan for a
     moment.** Hold Shift and drag with the left mouse button, or just drag with
     the right mouse button, to pan the camera without touching the `Orbit`/`Pan`
     toggle. Release Shift or the right button and a plain left-drag orbits
     again, following whatever the toggle is currently set to. This is purely a
     desktop shortcut — it doesn't change what the toggle does for touch or for
     the direction pad.

   ![A Shift-drag, then a right-button drag, sliding the scene sideways without rotating it.](./media/nav-pan.gif)
3. **Use the `+` and `−` buttons** to the right of the direction pad to zoom in
   and out. With a mouse you can also scroll the wheel over the view; on a touch
   screen, pinch with two fingers.

   ![Scrolling the mouse wheel to zoom in, then back out.](./media/nav-zoom.gif)
4. **Tap the white top face of the view cube** in the top-right corner to snap the
   camera to the top view — looking straight down the Z axis, with Y running up
   the screen. The cube turns to show only its top. Now tap the cube's front face
   for the front view, or its right face for the right view.

   ![Clicking the view cube's top face, then (after Views) the front and right faces, the camera snapping to top, front and right views, then Home.](./media/orientation-gizmo-snap.gif)
5. **Tap `Home`** under the cube to return to the standard three-quarter
   (isometric) view. To look from underneath, tap **Views** and choose **Bottom**:
   the bottom face is hidden whenever the camera is above the grid.
6. **Read the scale off the bottom-right readout.** Each minor grid line is
   **10 mm** apart and each brighter major line is **50 mm** apart. The bar above
   the legend shows how long a round real-world distance — 100 mm, 200 mm, and
   so on — is at your current zoom, and it relabels itself as you zoom.

   ![The grid with fine 10 mm lines and brighter 50 mm lines, and the scale readout at the bottom right.](./screenshots/grid-major-minor.png)

---

## The navigation pad (bottom-left)

![The navigation pad: Orbit, Pan and Select, the gear, four arrows, Home, and the plus and minus zoom buttons.](./screenshots/nav-chrome.png)

Pressing the pad's buttons does the same as the gestures above — no mouse drag needed:

![Tapping Pan, then the left and up arrows, then the plus button three times.](./media/nav-chrome-buttons.gif)

| Control | What it does |
|---|---|
| `Orbit` / `Pan` | Chooses what a drag in the 3D view does. The direction pad follows this choice too. |
| ▲ ▼ ◀ ▶ | Moves the camera one step in that direction — 15° of orbit, or a short pan, depending on the mode above. |
| `⌂` (centre of the pad) | Resets the camera completely: orientation, zoom, and the point it is looking at. |
| `+` / `−` | Zooms in and out one step. |

The buttons and the drag gesture are the same controls underneath, so the view
never ends up in a state you can only reach one way.

In a narrow window (a tablet, or a desktop window under about 860 px) the pad and the view cube
below keep their size or shrink to a compact form to leave room for the toolbar. Every button is still there:

![The 3D view at tablet width, with the navigation pad and the view cube in their compact form.](./screenshots/viewport-chrome-compact.png)

### On a phone: the pad folds away while a panel is open

On a phone, opening a bottom panel (the Inspector, including its object list, or
History) pushes the navigation pad up so it sits above the panel. Up there it would
cover the middle of the 3D view, where your objects usually are. So instead the
whole pad folds down to a single **✥** button in the corner. That way a tap on an
object in that area selects the object, and can't nudge the camera by accident.

Example: place a cube near the lower-left of the view, then drop a cylinder
somewhere else.

1. The cylinder is selected and the Inspector panel slides up. The navigation
   pad is now just the **✥ View** button, sitting above the panel.
2. Tap the cube. It becomes the selected object and the camera stays where it
   was.
3. Tap **✥** to open the full pad (`Orbit`/`Pan`/`Select`, the arrows,
   `⌂` and zoom). The **✥** button turns highlighted and stays in the same
   corner.
4. Use the arrows as usual, then tap **✥** again to fold the pad back down.

Closing or switching the panel folds the pad again, so the next panel always
opens with the view clear. You can still move the camera with your fingers while
the pad is folded (see Touch gestures below). The fold only happens on a phone
with a panel open. On a tablet or a computer, the pad is always shown in full.

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

### Changing which mouse button pans (the gear icon)

The Shift/right-button shortcuts above are one convention, but not the only
one people are used to — some other tools put pan on the plain left button
instead. Click the **gear icon** next to `Orbit`/`Pan` in the navigation pad
to choose which one WarpCad uses:

1. **Click the gear icon** in the navigation chrome. A short list opens with
   the current choice already marked.
2. **Choose "Left-drag pans, right-drag orbits"** to switch — or choose
   "Shift+Left or Right-drag pans" to go back to the default.
3. Your very next drag in the 3D view already follows the new choice; nothing
   else needs a reload or a re-selection.
4. The choice is remembered: it's saved in your browser and is still active
   the next time you open WarpCad, even after closing the tab.

| Preset | Left-drag | Right-drag |
|---|---|---|
| Shift+Left or Right-drag pans (default) | Orbit, or pans if Shift is held | Pans |
| Left-drag pans, right-drag orbits | Pans | Orbits |

This only changes the *mouse* shortcuts above — the `Orbit`/`Pan` toggle, the
direction pad, and every touch gesture on this page work exactly the same
regardless of which preset is chosen, since there is no Shift key or right
mouse button on a touchscreen to remap.

![The gear's list open above the navigation pad, with "Shift+Left or Right-drag pans" marked as the current choice.](./screenshots/nav-mouse-mapping.png)

## The view cube (top-right)

![The view cube: a solid grey cube seen corner-on, white on top and darker underneath, with Home and Views buttons below it.](./screenshots/orientation-gizmo.png)

The view cube shows which way the camera is currently pointing. It is a solid,
unlabelled cube drawn the way the 3D view sees the world: it turns as you orbit
and stays put when you pan or zoom. At the standard three-quarter view you see
three faces, lit from above, so the top is white, the front is light grey and the
right face is a darker grey. Dark edges outline each face, and the small
`az · el` caption underneath gives the exact azimuth and elevation in degrees.

The shades come from the same theme as the rest of the app, so the cube follows
Dark or Light. Choose System, Dark or Light in the Help sheet's footer
([Help](help.md)) and watch the cube: its shades re-colour at once, with nothing
to reload.

**Each face you can see is a button.** Click or tap one and the camera moves
**onto** that face's view, and the cube turns so that face looks straight at you.
Pointing at a face (or reaching it with the keyboard's Tab key) tints it with the
accent colour:

| Face | View you get |
|---|---|
| Top | Looking straight down the Z axis |
| Bottom | Looking up from underneath |
| Right | The right side |
| Left | The left side |
| Back | The back |
| Front | The front |
| `Home` button | Isometric three-quarter view |

**Views reaches the faces you cannot see.** A cube only shows three faces at a
time, and when you look straight at one face the others are edge-on and cannot be
tapped. The **Views** button beside Home opens a grid of all six faces (Top,
Front, Right, Bottom, Back, Left) plus `Home` and `Close`. Its title line shows
the current azimuth and elevation. Tapping a view closes the grid and snaps the
camera; **Close**, or a tap outside the grid, puts it away without changing the
view.

For example, to look at a part from underneath:

1. Tap the cube's **top** face. The camera looks straight down and the cube shows
   only its top face.
2. Tap **Views**. The six-view grid opens.
3. Tap **Bottom**. The grid closes, the camera looks up from underneath, and the
   caption reads `−45 az · −90 el` style values for the new direction.
4. Tap **Home** to return to the three-quarter view.

![The Views grid open over the top-right corner: Top, Front and Right on one row, Bottom, Back and Left on the next, with Home and Close below.](./screenshots/orientation-picker.png)

**On a touch tablet the cube is bigger, so a fingertip lands on the face you
aimed at.** With a touchscreen at tablet width and up, the cube grows to about
170 px wide, so every face a three-quarter view shows is at least 44 px across,
and the toolbar leaves room for it. For example, on a tablet tap the white top
face: the camera snaps to the top view and the caption names it.

**On a phone the cube is small, so use Views when you need to be exact.** Beside
the Operations toolbar the cube is about 96 px wide. Tapping a face works, but a
fingertip can land on its neighbour about one time in eight, so for a precise
choice tap **Views** and pick from the large buttons.

Zoom and the point you are looking at are left alone by a snap — only the
direction changes — so you can line up a view without losing your place.

## Touch gestures

| Gesture | Result |
|---|---|
| One-finger drag | Orbit, or pan if `Pan` is selected |
| Two-finger pinch | Zoom in and out |
| Two-finger drag | Pan, whichever mode is selected |
| Tap a cube face or a pad button | Same as clicking it |
| Tap **✥** (phone, with a panel open) | Opens or folds away the navigation pad |

The 3D view claims your drags, so the page itself never scrolls or bounces while
you are moving the camera.

## Units

Everything on screen is in **millimetres**. The grid's minor lines are 10 mm
apart and its major lines 50 mm; the scale bar's label always names a real
distance, so you can judge size without opening any panel.

## If the view doesn't appear

If your browser can't start WebGL, the 3D area shows a short message explaining
that instead of a blank rectangle. The navigation pad and view cube keep working —
they drive the camera, not the renderer — so the app stays usable while you fix
the browser setting or move to another device.

## If the 3D view goes blank

Sometimes the system takes the graphics chip back from WarpCad: on an iPhone or iPad after
the app has been in the background, in a browser tab you left for a while, or when a graphics
driver resets. The 3D view then pauses and a banner appears over it. Nothing else is lost.
Your parts, the selection, the camera and the undo history all stay as they were, and the
page never reloads.

**Try it:**

1. Switch to another app for a few minutes, then come back to WarpCad.
2. If the 3D view shows *The 3D view was paused by the system. Restoring…*, wait a moment.
   The view usually comes back by itself within a second or two, and the banner goes away.
3. If the banner instead offers **Restore view**, tap it. WarpCad redraws the scene with the
   same camera, and whatever was selected is still selected, with its handles and the
   Inspector as you left them.
4. Tap **Undo** if you like. It still undoes your last change, because the undo history was
   never touched.

![The 3D view on a phone with the banner "The 3D view was paused by the system and has not come back on its own." and a Restore view button under it.](./screenshots/viewport-restore.png)

If **Restore view** fails twice, the banner says the view could not be restored and offers
**Save a copy**. That saves your project the same way **File ▾ → Save As…** (or
**Download copy**) does, so you can restart the app or browser and open the copy.

## While you are drawing a sketch

There used to be a **Sketch** button on the navigation pad. It is gone: a sketch is now a
shape you drag in from the Library, and the pad never starts one. See
[Sketch primitives](sketch-mode.md).

While the sketch editor is open, the camera stays square-on to the sketch, so the
navigation pad changes:

- the `Orbit` / `Pan` / `Select` row and the ⚙ settings are hidden, because a drag
  **draws** instead;
- the arrows **pan** across the sketch, and zoom works as usual;
- the view cube still turns to show where you are looking, but its faces, Home and Views are off.
  Snapping to Front mid-sketch would turn the sketch edge-on;
- on a phone, and on a tablet whose view is just as narrow, the pad folds to the **✥**
  button so the drawing area stays clear. When the Slices or Extrude panel is open, the
  **✥** button sits just above it. Two fingers still pan and pinch-zoom.

Everything comes back when you tap **Done** or **Cancel**.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

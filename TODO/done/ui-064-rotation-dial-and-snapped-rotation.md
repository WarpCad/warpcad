---
title: Rotate rings show a watchface dial with hands and a digital readout while dragging, with Shift 5° steps on mouse and speed-sensitive steps on touch
category: ui
kind: feature
priority: medium
model: opus
milestone: M16
depends: []
status: done
---

> **What shipped (2026-10-14):** as specified, with these differences. The dial's hand sweeps the
> ring parameter by `turnedDeg x sense(axis)` (sense is -1 for the Y ring), not `x facing`: `facing`
> is already applied inside `rotateDeltaDeg`. Speed decays by a 30 ms hold, then linearly to 0 at
> 80 ms. A stall timer re-quantises so the readout drops to `fine 0.1°` while a finger rests. The
> dial appears on the first move, not on press. Open questions took the recommended answers (a:
> relative to start; b: no mouse fine mode; c: pen like touch, Shift wins; d: no sticky toggle).
> `docs/touch.md` does not exist, so the touch rule lives in `docs/selection-and-inspector.md`.
> **Still open:** the speed-band constants (40/250/900 px/s) are untuned and need a real finger on
> an iPad or phone; see `TODO/VERIFY.md`.

## Goal

Requested by the user on 2026-10-14:

> *"When you click and start dragging [a rotate ring], the only feedback is the model
> rotating. I'd like to have a watchface style gizmo with degrees on it and 'hands' showing
> how far you have rotated from the starting position. A digital readout of the rotation
> angle would be nice. The watchface should be in the same color and plane as the rotation
> gizmo. [...] if you are using a mouse and keyboard, shift dragging should rotate in rougher
> increments (5 degrees?). If you're touch, then a velocity sensitive drag would be nice: if
> you drag fast, you are in 5-15 degree increments, if you drag very slow, it's 0.1 degrees."*

Today a ring drag (`Gizmo.vue` → `Viewport.vue`'s `onGizmoHandleMove` → `rotateDeltaDeg`)
turns the preview mesh and the Inspector's Rotation field, and nothing else says *how far*,
*from where*, or *in which direction*. The only way to turn a part by exactly 45° is to give
up on the ring and type into the field. Three things are wrong with that, in order of how
much they matter:

1. **No sense of amount.** You cannot see the start orientation or the sweep, so you cannot
   judge "about a quarter turn" without reading the field in the side panel.
2. **No way to land on a round number** with the gizmo. The pointer's angle is continuous, so
   you get 44.7° or 45.3°, never 45°.
3. **No way to be precise** on a touch screen, where a finger covers the very thing it is
   steering and 1 px of travel is several degrees at ring radius.

"Done" is:

1. While a rotate ring is being dragged, a **dial** is drawn in that ring's own plane and
   colour: tick marks, a **start hand** fixed at where the drag began, a **live hand** that
   follows the rotation, a filled **sweep sector** between them, and a **digital readout**
   of the signed angle turned.
2. **Shift** held during the drag snaps the turned angle to **5°** steps (mouse and keyboard).
3. On **touch**, the step size follows **drag speed**: fast is a coarse step (5°–15°), slow is
   0.1°, with a readout that says which step you are in.
4. Release commits exactly the displayed angle, as **one** `transform.rotate` record, the
   same record a ring drag makes today. Nothing about the document changes.

## Interaction model

- **Precondition**: unchanged. Exactly one body selected, so the gizmo is drawn
  (`docs/decisions/interaction-model-qa.md` control 4). The dial exists only for the duration
  of a rotate-ring drag; it is not a persistent control and has no disabled state.
- **Trigger**: unchanged: press and drag on a rotate ring (`.tgizmo__grab--ring`). The new
  inputs are modifiers of that same gesture:
  - **Shift held** (any pointer, but only reachable with a keyboard) toggles 5° steps.
    Pressing or releasing Shift *mid-drag* takes effect immediately, without moving the
    pointer, the same way `Viewport.vue`'s sketch drag already tracks Shift on `keydown`/
    `keyup` (`snapPointer`, ~line 1350).
  - **Touch / pen with no Shift** uses the speed-sensitive step (below). A `mouse` pointer
    without Shift keeps today's continuous behaviour: no new surprise for existing users.
- **Feedback**, all drawn in the existing gizmo SVG overlay, `pointer-events: none`:
  - **Dial**: a ring of tick marks in the *ring's plane*, same axis colour as the ring
    (`AXIS_STROKE`). A tick every 15°, a longer one every 45°, labelled `0`, `90`, `180`,
    `270` (relative to the start, so `0` is where you grabbed). The dial is the ring's own
    ellipse (the ring is already the projection of a circle in that plane), so it
    foreshortens exactly as the ring does when the camera orbits and turns edge-on with it.
  - **Start hand**: a thin line from the hub to the dial at the grab angle, dim, never moves.
  - **Live hand**: a bright line from the hub, with the same 3-point arrowhead convention as
    `writeArrowhead()`, at start + turned angle.
  - **Sweep sector**: the wedge between the two hands, same colour at low opacity, so
    "how far" is an area and not only two lines to compare. It goes past 180° (see below).
  - **Digital readout**: a pill with the signed turned angle to 0.1°, e.g. `+37.5°`, and a
    second small line giving the active step when snapping, `5° steps`, `fine 0.1°`, or
    nothing when continuous. It is **screen-aligned text**, not in the plane (text skewed
    onto an ellipse is unreadable), anchored near the hub. On touch it is offset **up and
    away** from the pointer so a fingertip never covers it, and clamped inside the viewport
    at phone width.
  - The Inspector's Rotation field keeps following live, exactly as `ui-012` made it, and
    shows the *snapped* value, since gizmo drag and field edits must remain one transform.
  - **Everything vanishes on release or `pointercancel`**; on a cancelled drag the body goes
    back, as today.
- **Placement**: n/a. Nothing is created.
- **Selection response**: unchanged. Selecting still attaches the gizmo and shows the
  Inspector.
- **Selection count**: unchanged, exactly 1.
- **Small-screen behavior**: **not** "same as desktop". There is no Shift on a phone, which
  is the entire reason for the speed-sensitive mode, and the readout placement has to dodge
  the finger. The dial is sized from the ring (`ringPx`, `ui-017`), so it is as large as the
  ring is at 390 px width. The readout needs a minimum text size that is legible at that
  width (≥ 14 px).

### The speed-sensitive step (touch / pen)

Settle the exact constants in Step 2 against a real device; the *shape* is fixed here.

- **Speed** is the pointer's tangential speed around the hub, in px/s, smoothed over
  roughly the last 100 ms of `pointermove` events (an exponential average, not the raw
  last-event delta, which is far too jittery to drive a step size).
- **Step** is a function of speed, in bands: slow `0.1°`, then `1°`, then `5°`, then `15°`
  at the fastest. Treat the band edges as tunables in one exported constant table.
- **The turned angle is still the pointer's absolute angle from the start, quantised to the
  current step**, *not* an accumulated sum of per-event deltas. That is deliberate: an
  accumulator drifts from the finger and cannot be reasoned about, whereas the quantised
  absolute angle always converges on the finger the moment you slow down. Slowing down at
  the end of a drag is exactly the gesture "now let me land on it", and it works for free.
- **Stalling counts as slow.** `pointermove` stops firing when a finger stops, so the last
  speed sample is stale. Speed must decay with time since the last event (a stall of ~80 ms
  is `0`), including at `pointerup`, otherwise a drag that ends with a pause commits at the
  coarse step it was in half a second earlier.
- **Hysteresis** between bands (a band must be exceeded by ~15% to be left), so a speed that
  hovers on a boundary does not flicker between two step sizes and make the value jitter.

### Past 180°

`rotateDeltaDeg` wraps the sweep to (-180°, 180°] so a nudge across the seam does not read as
a 350° spin. A sweep sector and a readout cannot live with that: dragging round past a
half-turn would flip the readout from `+179°` to `-179°` and the sector would jump to the
other side. The viewport therefore **accumulates the per-event wrapped increments** into an
unwrapped turned angle for display and for the commit, so a three-quarter turn reads
`+270°`. The committed rotation is the same *rotation* either way, so no document semantics
change; verify `rotateRecord`/`composeDeg` (`core-004`) treat `270` and `-90` identically
(see Testing).

## Documentation

- **Page**: `docs/selection-and-inspector.md`, the *Moving and turning a shape* section
  (~line 440), which ends with "Drag a ring and the Rotation field follows the same way."
  Add: the dial and what each part means, Shift for 5° steps, and the touch speed rule.
  Also add one line to `docs/touch.md` if that page exists (check in Step 2), since "how do I
  turn something precisely on an iPad" is a touch question first.
- **Example**:
  1. Click a cube in the viewport. Three coloured rings appear around it.
  2. Press on the **blue** ring and drag a quarter of the way round. A blue dial appears on
     the ring; the cube turns, a bright hand follows your pointer and the readout counts up.
  3. Hold **Shift** and keep dragging: the readout now moves in jumps and settles on
     `+45.0°`, `+50.0°`, `+55.0°`. Release with it on `+90.0°`.
  4. The Inspector's Rotation Z says `90`. Ctrl+Z puts the cube back in one step.
  5. *On a tablet:* drag the blue ring quickly and the readout jumps in big steps; slow right
     down near the end and it falls to `0.1°` steps, so you can settle on `89.9°` or `90.0°`.
  Angles are degrees about the ring's world axis; positive is counter-clockwise looking
  down the axis toward the origin (right-hand rule).
- **Media**: add to `e2e/docs/selection-inspector.docs.js`: a still `gizmo-rotate-dial.png`
  (mid-drag, dial and readout visible, laptop) and a movie `gizmo-rotate-dial.gif` (drag,
  then Shift-snap), both embedded on `docs/selection-and-inspector.md` next to the existing
  `gizmo-translate.gif`. The existing `gizmo-handles.png` is regenerated only if the resting
  gizmo changed, which it should not. `npm run docs:media` generates them; never by hand.

## Affected files

- `src/render/rotateSnap.js` (new, framework-free): `snapDeg(deg, stepDeg)`,
  `stepForSpeed(speedPxPerS, previousStep)` with the band table and hysteresis, and a small
  `createSpeedTracker()` that takes an injectable clock (so a unit test never waits).
- `src/render/annotate.js`: a `createDialAnnotation()` / `updateDialAnnotation(ring, startParamDeg, turnedDeg, facing, originX, originY, out)`
  next to `ringPoints`/`ringArrowheads`, writing tick endpoints, both hands and the sector
  arc into preallocated buffers from the ring's own `ux/uy/vx/vy`. Plus a helper to
  recover a ring parameter angle from the screen point where the drag began.
- `src/components/viewport/Gizmo.vue`: draw the dial and readout from a new `dial` prop;
  emit `Shift` state with `handle-move` (the `PointerEvent` already carries `shiftKey` and
  `pointerType`; pass both). The component stays presentation-only.
- `src/components/viewport/RotateDial.vue` (new, if `Gizmo.vue`'s template would otherwise
  grow past the ~30-line rule in `CLAUDE.md`).
- `src/components/viewport/Viewport.vue`: `gizmoDrag` gains `turnedDeg` (unwrapped),
  `lastDeltaDeg`, `pointerType`, `shift`, and a speed tracker. `onGizmoHandleMove` quantises
  before `preview.setRotate`, and `onGizmoHandleUp` commits `preview.rxDeg/ryDeg/rzDeg`
  as it does today, so the snapped value is what is committed, by construction.
- `src/render/rotateSnap.spec.js`, `src/render/annotate.spec.js` (additions).
- `e2e/rotate-dial.e2e.js` (new).
- `docs/selection-and-inspector.md`, `e2e/docs/selection-inspector.docs.js`.

## Proposed fix

1. **Math first, in plain Node.** Write `rotateSnap.js` and the dial geometry in
   `annotate.js` test-first, with no DOM and no timers. The ring is already the affine image
   of a circle: `origin + u·cos t + v·sin t`. A dial tick at ring angle `t` is the same
   expression at a slightly smaller radius, so the dial is correct under *any* camera angle
   without a second projection, which is the whole "same plane" requirement.
2. **Sign and facing are the trap.** `rotateDeltaDeg` negates the screen sweep and multiplies
   by `facing` because screen-clockwise and right-hand-positive disagree, and a ring whose
   axis points away from the viewer is grabbed on its far side. The *hand* must obey the
   same two rules, and it is easy to get one of them backwards while the readout, which is
   just a number, looks perfect. The `ui-012` lesson in `rotateDeltaDeg`'s doc comment:
   "no assertion about magnitude would catch" it. The hand-direction test below asserts the
   hand's tip moves toward the side the preview mesh turns.
3. **Hand start position.** The pointer's screen angle and the ring's parameter angle are not
   the same thing on a foreshortened ring (an ellipse's polar angle is not its parameter).
   Derive the start hand by inverting the ring's 2×2 `[u v]` map at the grab point, then
   sweep the *parameter* by `turnedDeg × facing`, so the hand and the body turn together at
   any camera angle, rather than computing a screen angle that agrees only face-on.
4. **Quantise in the viewport, once.** Compute the raw unwrapped angle, pick the step (Shift →
   5°, touch → `stepForSpeed`, else none), `snapDeg`, and feed *that* to `preview.setRotate`.
   The dial, the readout, the preview mesh, the Inspector field and the commit then all read
   one number.
5. **Per-frame allocation.** Reuse buffers exactly as `ringBuffers` and `ringArrowBuffers`
   do. The `points` strings are the one thing rebuilt per frame (stated in `Gizmo.vue`).
6. **Edge-on rings.** When the ring's projected minor axis collapses (the axis lies across the
   screen), ticks overlap and the sector degenerates to a sliver. Below a threshold, draw only
   the live hand and the readout and say so in a code comment; do not draw 24 ticks on a line.
7. **Test ids.** Do **not** use `gizmo-ring-`, `gizmo-core-ring-`, `gizmo-rotate-arrow-` or
   `gizmo-grab-` prefixes. `ui-022` shipped a rename after exactly this collision with
   `selection-inspector.e2e.js`'s `[data-testid^="gizmo-ring-"]` (asserts exactly 3 ring
   polygons). Use `gizmo-dial-*` and `gizmo-dial-readout`, and grep `e2e/` for `^="gizmo-`
   selectors before choosing.

## Open questions

Settle these before Step 3; none changes the shape of the work.

- **(a) Snap relative to the start, or to absolute multiples?** This spec says *relative*:
  5° steps *of the turn*. A body already at 17° then lands on 22°, 27°. The alternative
  (snap the resulting orientation to multiples of 5) is what a user might expect for "land on
  90°", but a body's orientation is a composed rotation (`core-004`), so "its Z angle" is not
  one number to snap. Recommended: relative, and the Inspector's typed field remains the way
  to a specific absolute angle.
- **(b) Mouse fine mode.** Shift gives coarse steps, but desktop has no 0.1° gesture
  (the continuous drag is limited by pixels). Is `Alt`/`Ctrl` for fine mouse mode wanted,
  or is typing in the field enough? Not required for done.
- **(c) Pen.** Treated like touch above (no Shift, so speed-sensitive). Confirm, or treat as
  mouse. A pen on a laptop with a keyboard can reach Shift; if Shift is held on a pen or
  touch drag it should win over speed.
- **(d) Persist the snap preference?** Not proposed: Shift is a momentary modifier and the
  touch rule is automatic. Flag if a sticky "snap 5°" toggle is wanted in the toolbar.

## Effort

M. The math is small and fully unit-testable. The cost is in the touch tuning, which can only
be judged on a device, and in the three-viewport, three-engine e2e.

## Testing

- **Unit** (`.spec.js`, next to source, explicit tolerances per `CLAUDE.md`):
  - `rotateSnap.spec.js`: `snapDeg` at 5° with `toBeCloseTo`, including negatives, `0`,
    exactly on a boundary (`2.5` rounds one way and `-2.5` the matching way, consistently),
    `±180`, and a `stepDeg` of `0.1` not accumulating float drift over a long sweep.
    `stepForSpeed`: each band, hysteresis (speed oscillating ±10% around an edge must not
    change the step), and stall decay with an injected clock (`0` after 80 ms of silence).
  - `annotate.spec.js`: dial ticks lie on the ring's ellipse (`toBeCloseTo`); **hand
    direction for `facing = +1` and `facing = -1`**, asserting the hand's tip moves the same
    way the body turns, not just that its length is right; start-hand recovery on a
    foreshortened ring (30°, 60° elevation); an edge-on ring takes the degenerate path; a
    sweep of 270° gives a sector of 270°, not -90°.
  - Degenerate cases: zero sweep (no sector, readout `+0.0°` and not `-0.0°`, the
    negative-zero lesson in `rotateDeltaDeg`), pointer exactly on the hub (no angle to
    measure; hold the last value), a single `pointermove` that jumps more than 180°.
  - `core`: `rotateRecord` with `[0, 0, 270]` and `[0, 0, -90]` produce the same
    orientation (`core-004` regression), and a snapped drag composes after a previous drag.
- **E2E**: a real `e2e/rotate-dial.e2e.js` that navigates to `/`: place a cube, select it,
  drag the Z ring with real pointer events, assert `gizmo-dial-readout` shows the turned angle
  and the Rotation Z field agrees; with Shift held, assert the readout is a multiple of 5 at
  every sampled move and the committed Rotation Z is too; release and assert **one** body,
  not two (`ui-012`'s load-bearing check), and that Undo is one step. A touch-pointer variant
  drives a fast then a slow drag and asserts the readout's step label changes from a coarse
  step to `0.1°`.
  - Speed depends on event timestamps. Dispatch with controlled delays (CDP touch or paced
    `page.waitForTimeout`) and assert on the *band*, not an exact angle, or this becomes the
    flakiest spec in the suite. If it still is, split the timing logic into the unit tests
    with an injected clock and keep the e2e to "Shift snaps" plus "touch drag does not orbit".
- **Viewports**: **all three** (phone 390×844, tablet 820×1180, laptop 1440×900) with a
  snapshot at each, because Small-screen behaviour is not "same as desktop". Assert the
  readout's bounding box is inside the viewport at phone width mid-drag.
- **Engines**: **all three** (Chromium, Firefox, WebKit). Pointer capture on an SVG element,
  touch events and the gizmo drag are exactly the engine-sensitive surface `CLAUDE.md`'s
  Browser Support section names, and the touch-orbit bug of the first attempt was
  Safari-only.
- **Acceptance scenarios to re-drive by hand** (not scripted), PASS/FAIL each:
  - **1** (two independent primitives): rotate one with the dial; both remain visible.
  - **7** (touch-only navigation): a ring drag on touch must not orbit the camera, and an
    orbit must not draw a dial.
  - **10** (save, reload): a body rotated by a snapped `+45.0°` and a fine `+12.3°` reloads
    with exactly those angles.
  - **12** (edit a step in the middle of history): a snapped rotate step in the middle still
    replays.
  - 6 if rotating a group is reachable by then.
- **Closed findings whose repro gets re-run**: `ui-012` (gizmo drag and fields in sync, one
  body after a move), `core-004` (rotation composed, not summed: drag, then drag another
  axis, with and without Shift), `ui-017`/`ui-048` (ring and handle sizing; the dial must not
  change the hit target), `ui-021`/`ui-022` (ring shading and direction arrows must still
  read with the dial on top), and `ui-025` (orientation gizmo legibility, which shares the
  overlay).
- **Docs media**: `npm run docs:media`, then `e2e/docs-media.spec.js` (the `guards`
  project) must pass: no dead link, no orphan, no unclaimed picture.
- **Hand drive on a real iPad or phone** before it is called done: speed bands are only
  meaningful with a real finger, and the `CLAUDE.md` Verification section's whole point is
  that a scripted touch drag proves the script works, not that the gesture does.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

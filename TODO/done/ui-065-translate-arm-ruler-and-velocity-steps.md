---
title: Translate arrows show a ruler from where the drag began, with a distance readout; Shift snaps to 1 mm and drag speed sets the step, the same on mouse and touch
category: ui
kind: feature
priority: medium
model: opus
milestone: M16
depends: [ui-064]
status: done
---

> **What shipped (2026-10-15):** as specified, with these differences. The step code lives in a new
> `src/render/translateSnap.js` (mirroring `rotateSnap.js`), and the shared tracker/hysteresis in
> `src/render/dragSteps.js`; `rotateSnap.js`'s `createSpeedTracker`/`stepForSpeed` are thin wrappers
> (a golden run captured before the extraction proves identical results), not literal re-exports.
> `updateRulerAnnotation` takes the whole gizmo and an axis index so the ruler shares `armDirection`
> with `translateDeltaMm`. The ruler follows the arm's screen direction at `1/mmPerPixel` px per mm,
> so tick spacing on screen does not shrink as the arm tilts. Open questions took the recommended
> answers (a: rings stay Shift-only, follow-up row; b: fixed 1 mm; c: ruler runs past the tip, the
> readout is the authority). **Still open:** the speed bands (40/300/1000 px/s -> 0.1/1/5/10 mm) are
> untuned on a real device, and a plain mouse arm drag is now speed-stepped, which is the judgment
> call for the hand-drive; see `TODO/VERIFY.md`.

## Goal

Requested by the user on 2026-10-14, the same day as `ui-064`:

> *"Similar gadget for the drag handles, showing how far and a ruler from where the drag
> started. Mouse and touch should have similar shift/velocity behavior."*

Dragging a translate arrow (`.tgizmo__grab--arm`, `Viewport.vue`'s `onGizmoHandleMove` →
`translateDeltaMm`) moves the body and the Inspector's Position field and nothing else. It
says neither *how far* nor *from where*, and it has no way to land on a round number: the
pointer's travel is continuous, so you get 12.7 mm, never 12.5 mm or 13 mm, and on a phone a
finger covers the very arm it is steering. `ui-064` fixed the same three problems for rings.
This task gives the arms the matching treatment, and makes the two pointer families behave
the same way.

"Done" is:

1. While a translate arm is being dragged, a **ruler** is drawn along that arm's own line,
   starting at the point where the drag began. Ticks mark millimetres, a **start mark** sits
   at the drag's start and never moves, a **live marker** follows the pointer's projection on
   the arm, and a filled **span** joins the two so "how far" is an area and not only two marks
   to compare.
2. A **digital readout** shows the signed distance moved to 0.1 mm, e.g. `+12.5 mm`, and,
   when a step is in force, the step's name (`1 mm steps`, `fine 0.1 mm`) — the same readout
   shape `ui-064` gave the rotate dial.
3. **Shift** held during the drag snaps the distance to **1 mm** steps, on every pointer type.
4. **Drag speed** sets the step on **every pointer type**, mouse, pen and touch alike: fast is
   coarse (up to 10 mm), slow is `0.1 mm`. A plain mouse drag that is moved slowly therefore
   lands on sub-millimetre values without a modifier.
5. Release commits exactly the displayed distance, as **one** `transform.translate` record, the
   record a translate drag makes today. The Inspector's Position field and the body agree with
   the readout at every sample, because all three read the same quantised number.

## Interaction model

- **Precondition**: unchanged. Exactly one body selected, so the gizmo is drawn
  (`docs/decisions/interaction-model-qa.md` control 4). The ruler exists only for the duration
  of a translate-arm drag; it has no persistent or disabled state.
- **Trigger**: unchanged: press and drag on a translate arm (`.tgizmo__grab--arm`). The new
  inputs are modifiers of that same gesture, and they apply to all pointer types:
  - **Shift held** snaps to 1 mm. Pressing or releasing Shift *mid-drag* takes effect at once,
    without moving the pointer, as `ui-064` does for rotation.
  - **Speed** picks the step when Shift is not held, on mouse, pen and touch alike. Shift
    always wins over speed, so a fast Shift drag is 1 mm, not 10 mm.
- **Feedback**, drawn in the existing gizmo SVG overlay, `pointer-events: none`:
  - **Ruler**: a straight bar along the arm's screen line, in the arm's own axis colour
    (`AXIS_STROKE`), with ticks at the step in force. At the fine step, ticks would be
    a tenth of a millimetre apart, so the spacing is widened until no more than about 40 ticks
    are drawn, and every fifth tick is labelled. The ruler is drawn in the arm's plane of
    projection, so it foreshortens with the arm as the camera orbits (the same property the
    rings and the dial have).
  - **Start mark**: a short cross-bar at the point where the drag began. Dim, never moves.
  - **Live marker**: the arm's own arrowhead convention (`writeArrowhead()`), at the pointer's
    projection on the arm line.
  - **Span**: the filled band between the start mark and the live marker, the arm's colour at
    low opacity.
  - **Readout**: a pill with the signed distance, screen-aligned text anchored near the start
    mark. On touch it sits **up and away** from the fingertip, as the rotate readout does, and
    is clamped inside the viewport at phone width.
  - The Inspector's Position field keeps following live and shows the snapped value.
  - While the ruler shows, the other two arms and all three rings are hidden, the same way
    the rotate dial hides the other rings and the translate arms (`dialAxis` in `Gizmo.vue`).
    One thing is drawn at a time.
  - **Everything vanishes on release or `pointercancel`**; on a cancelled drag the body goes
    back, as today.
- **Placement**: n/a. Nothing is created.
- **Selection response**: unchanged.
- **Selection count**: unchanged, exactly 1.
- **Small-screen behavior**: not "same as desktop". The ruler is as long as the arm needs at
  390 px width, which is short, so the tick spacing has to widen rather than shrink the text.
  The readout is ≥ 14 px and dodges the finger, as in `ui-064`.

### The speed-sensitive step, shared with `ui-064`

Settle the exact constants in Step 2 against a real device; the *shape* is fixed here.

- **Speed** is the rate at which the pointer's projection on the arm changes, in px/s,
  smoothed over about 100 ms (an exponential average, not the raw last-event delta). Only the
  projection counts: a pointer that moves across the arm fast but does not slide along it has
  a speed of zero, and the ruler does not move either. The ruler's speed and the step therefore
  always agree.
- **Step** is a function of speed, in bands: slow `0.1 mm`, then `1 mm`, `5 mm`, `10 mm` at the
  fastest. The band edges are tunables in one exported constant table, separate from
  `ui-064`'s angular table, because the units are different.
- **The distance is the pointer's absolute projection from the start, quantised to the current
  step**, never a running sum of per-event steps, for the reason `ui-064` gives: slowing down
  at the end of a drag ("now let me land on it") converges on the finger with no extra code.
- **Stalling counts as slow**, and speed decays to `0` 80 ms after the last `pointermove`, also
  at `pointerup`.
- **Hysteresis** between bands (15%), so a speed that hovers on an edge does not flicker.

The speed tracker and the hysteresis rule are **extracted from `src/render/rotateSnap.js`**
into a shared module rather than copied. The tracker already takes an injected clock. Its input
changes from the pointer's tangential speed around a hub to the rate of change of a scalar the
caller supplies, so the same tracker serves the ring (angle) and the arm (distance). `ui-064`'s
exports keep their names and behaviour; this task must not change a rotate result.

## Documentation

- **Page**: `docs/selection-and-inspector.md`, the *Moving and turning a shape* section, next to
  the existing `gizmo-translate.gif` (~line 446–450). Add: the ruler and what each mark means,
  Shift for 1 mm steps, and the speed rule, which works the same on a mouse and a touch screen.
- **Example**:
  1. Click a cube in the viewport. Three coloured arrows and three rings appear on it.
  2. Press on the **red** arrow and drag a little way along it. A red ruler appears, starting
     where you pressed; the cube slides along it and the readout counts up in `mm`.
  3. Hold **Shift** and keep dragging: the readout jumps in whole millimetres, `+10 mm`,
     `+11 mm`, `+12 mm`. Release with it on `+12 mm`.
  4. The Inspector's Position X says `12`. Ctrl+Z puts the cube back in one step.
  5. *Without a keyboard* (a mouse, or a finger on a tablet): drag the red arrow quickly and
     the readout moves in big steps; slow right down near the end and it falls to `0.1 mm`, so
     you can settle on `12.4 mm` or `12.5 mm`.
  Distances are in millimetres along the arrow's own axis; positive is the arrow's direction.
- **Media**: add to `e2e/docs/selection-inspector.docs.js`: a still `gizmo-translate-ruler.png`
  (mid-drag, ruler and readout visible, laptop) and a movie `gizmo-translate-ruler.gif` (drag,
  then Shift-snap), both embedded on `docs/selection-and-inspector.md` next to `gizmo-translate.gif`.
  `npm run docs:media` generates them; never by hand.

## Affected files

- `src/render/rotateSnap.js` → split: the speed tracker, `stepForSpeed` and the hysteresis move
  to a new `src/render/dragSteps.js` (framework-free). `rotateSnap.js` keeps the angular
  parts and re-exports the moved names so `ui-064`'s callers and specs do not change.
- `src/render/annotate.js`: `createRulerAnnotation()` / `updateRulerAnnotation(arm, startXPx,
  startYPx, distanceMm, mmPerPixel, ticksStepMm, out)`, next to the dial helpers, writing tick
  endpoints, the start mark, the live marker and the span into preallocated buffers, using the
  arm's own `tipX/tipY` and the same px→mm conversion `translateDeltaMm` uses.
- `src/components/viewport/Gizmo.vue`: draws the ruler and readout from a new `ruler` prop; hides
  the other arms and rings while it shows; emits `shiftKey` and `pointerType` with
  `handle-move` for translate arms too (the rotate path already does).
- `src/components/viewport/TranslateRuler.vue` (new), if `Gizmo.vue`'s template would otherwise
  grow past the ~30-line rule in `CLAUDE.md`, as `RotateDial.vue` was split out for `ui-064`.
- `src/components/viewport/Viewport.vue`: the translate branch of `onGizmoHandleMove` gains the
  speed tracker and the same `applyStep` path the rotate branch uses. `onGizmoHandleUp` commits
  `preview.txMm/tyMm/tzMm` as it does today, so the snapped value is what is committed.
- `src/render/dragSteps.spec.js` (new), `src/render/annotate.spec.js` and
  `src/render/rotateSnap.spec.js` (additions; `rotateSnap.spec.js` must pass unchanged).
- `e2e/translate-ruler.e2e.js` (new).
- `docs/selection-and-inspector.md`, `e2e/docs/selection-inspector.docs.js`.

## Proposed fix

1. **Extract, don't fork.** Move the tracker and the hysteresis into `dragSteps.js` with the
   existing `ui-064` tests still green, before any translate code exists. A test that passes
   against the old `rotateSnap.js` and the new module proves the extraction changed nothing.
2. **Math first, in plain Node.** The ruler is a line through the drag's start point along the
   arm's screen direction. The live distance is `(pointer − start)·armDir × mmPerPixel`, which is
   `translateDeltaMm` as it already exists. Write `updateRulerAnnotation` against that same
   function so the ruler and the moved body cannot disagree.
3. **Sign is the trap.** `translateDeltaMm` is already signed by the arm's direction, so a
   pointer dragged *against* the arm reads negative. The ruler's tick labels and the span must
   use the same sign, and the test below asserts it, because a ruler that runs the opposite way
   to the body still reads plausibly.
4. **Quantise once.** Compute the raw distance, pick the step (Shift → 1 mm, otherwise
   `stepForSpeed`), `snapMm` it, and feed *that* to `preview.setTranslate`. The ruler, readout,
   preview, Position field and commit read one number.
5. **Edge-on arms.** When the arm points along the view direction its projected length collapses,
   the ruler direction is unstable, and ticks overlap. Below a threshold, draw only the live
   marker and the readout, and say so in a code comment, as `ui-064` does for edge-on rings.
6. **Per-frame allocation.** Reuse buffers as `ringBuffers` and the dial buffers do.
7. **Test ids.** Use `gizmo-ruler-*` and `gizmo-ruler-readout`. Grep `e2e/` for `^="gizmo-`
   first: `gizmo-transform.e2e.js` already asserts the `gizmo-grab-arm-` and `gizmo-grab-ring-`
   counts, and the ruler must not match either prefix.

## Open questions

Settle these before Step 3; none changes the shape of the work.

- **(a) Mouse velocity steps.** This spec reads "similar shift/velocity behaviour" as *both* pointer
  families getting *both* modifiers on the arms. That gives a mouse sub-millimetre precision by
  moving slowly, which fills `ui-064`'s open question (b). **`ui-064`'s rotate rings still give a
  plain mouse no velocity step** (only Shift). Should the rings be brought into line in a follow-up,
  so both gizmo kinds behave identically? Recommended: yes, as its own row, once this has been
  driven by hand.
- **(b) Shift step size.** 1 mm is proposed. The grid's own major spacing is another candidate, and
  it would make Shift land on the grid's lines. Recommended: a fixed 1 mm, since the grid spacing can
  change with zoom and a moving step is harder to predict.
- **(c) Ruler past the arm's end.** A long drag can run the live marker past the arm's tip. Proposed:
  the ruler keeps going, clamped to the viewport, and the readout is the authority. Confirm.

## Effort

M. The math reuses `translateDeltaMm`, and the tracker extraction is mechanical with `ui-064`'s
tests as the guard. The cost is the same as `ui-064`: the speed bands can only be judged with a
real finger, and the e2e has to be robust to timing.

## Testing

- **Unit** (`.spec.js`, next to source, explicit tolerances per `CLAUDE.md`):
  - `dragSteps.spec.js`: the tracker and `stepForSpeed` pass the same cases `rotateSnap.spec.js`
    already covers, now with a scalar input: each band, hysteresis (±10% around an edge keeps the
    step), and stall decay to `0` after 80 ms with an injected clock. A test that the rotate
    exports still return identical values to before the extraction.
  - `annotate.spec.js`: the ruler's ticks lie on the arm's screen line (`toBeCloseTo`); **the sign
    test** — a pointer dragged toward the arm's tip gives a positive distance and a span that runs
    toward the tip, and dragged away gives the mirror, for an arm whose screen direction is
    diagonal and one that is horizontal; the start mark stays put across updates; a span of
    `0` draws no span and reads `+0.0 mm`, not `-0.0 mm`; an edge-on arm takes the degenerate path.
  - Degenerate cases: a zero-length arm (`translateDeltaMm` already returns `0`, so the ruler must
    too), a pointer exactly on the start point, a single `pointermove` that jumps more than 50 mm
    in one event, and a step larger than the distance (`0` snaps to `0`).
  - Numerical: `snapMm` at 1 mm with `±0.5` boundaries and `0.1 mm` without float drift over a
    long drag.
- **E2E**: a real `e2e/translate-ruler.e2e.js` that navigates to `/`: place a cube, select it,
  drag the X arm with real pointer events, assert `gizmo-ruler-readout` shows the moved distance
  and the Position X field agrees; with Shift held, assert the readout is a whole number of
  millimetres at every sampled move and the committed Position X is too; release and assert
  **one** body and one undo step. A touch-pointer variant drives a fast then a slow drag and
  asserts the readout's step label changes from a coarse step to `0.1 mm`. A mouse variant does
  the same slow-down, so the "both pointer families" claim is tested and not assumed.
  - Speed depends on event timestamps. Assert on the *band*, not an exact value, and split the
    timing into the unit tests with an injected clock if the e2e turns flaky.
- **Viewports**: **all three** (phone 390×844, tablet 820×1180, laptop 1440×900) with a snapshot
  at each. Assert the readout's bounding box is inside the viewport at phone width mid-drag.
- **Engines**: **all three** (Chromium, Firefox, WebKit). Pointer capture on an SVG element and
  touch drags are the engine-sensitive surface `CLAUDE.md`'s Browser Support section names.
- **Acceptance scenarios to re-drive by hand** (not scripted), PASS/FAIL each:
  - **1** (two independent primitives): slide one with the ruler; both remain visible.
  - **7** (touch-only navigation): an arm drag on touch must not orbit the camera, and an orbit
    must not draw a ruler.
  - **10** (save, reload): a body moved by a snapped `12 mm` and a fine `12.3 mm` reloads with
    exactly those positions.
  - **12** (edit a step in the middle of history): a snapped translate step in the middle still
    replays.
- **Closed findings whose repro gets re-run**: `ui-012` (gizmo drag and fields in sync, one body
  after a move), `ui-048` (arm hit targets: the arm's grab must still start where it did, and the
  ruler must not change the hit target), `ui-021`/`ui-022` (arm shading and direction must still
  read with the ruler on top), `ui-025` (orientation gizmo legibility, which shares the overlay),
  and `ui-064`'s own repro: a rotate drag must produce the same numbers before and after the
  tracker extraction.
- **Docs media**: `npm run docs:media`, then `e2e/docs-media.spec.js` (the `guards` project) must
  pass: no dead link, no orphan, no unclaimed picture.
- **Hand drive on a real iPad or phone and a mouse**, before it is called done: the speed bands
  only mean something with a real finger on a real arm, and the mouse half of Open question (a)
  is a judgment call a script cannot make.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

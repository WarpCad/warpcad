# TODO/VERIFY.md — Manual Verification Queue (kept small, on purpose)

Appended by `/fix-todo` Step 8, but narrower in scope than the previous attempt's file
of the same name: that one grew to roughly 2,000 lines of "should work now" checklists
across dozens of tasks — a queue nobody could keep up with is the same as no queue.
Read `CLAUDE.md`'s Verification section before adding to this file.

**This file's job now**: log only what's genuinely one-off and not already covered by
a standing `TODO/ACCEPTANCE.md` scenario — a visual/feel judgment call, a
device-specific quirk, something a task's own Testing section explicitly deferred. If
an entry would duplicate what an acceptance scenario already checks on a standing
basis, it belongs there instead, not here.

Newest entry at the top. Check items off (`[ ]` → `[x]`) as you verify them; leave the
entry in place afterward as a record rather than deleting it. If this file's queue ever
starts growing the way the previous attempt's did — several entries per day, unread
between sessions — that's itself a signal to move more of it into
`TODO/ACCEPTANCE.md` rather than let the queue outpace anyone's attention again.

## Queue

### ui-021 — gradient/shadow subtlety at the gizmo's floor size, and on real touch hardware (2026-09-07 17:09)

A visual/feel judgment call, not a correctness question — the e2e spec asserts the
gradients and shadow filter are actually wired up (real `<defs>` entries, real stop
colours, three genuinely distinct axis hues), and a hand-drive at laptop width in
Chromium/Firefox/WebKit confirmed the effect renders and doesn't break hit-testing. What
that drive could not judge: whether the effect still *reads* as 3D shading, rather than
disappearing into noise, at the extremes this task's own Testing section flagged as
worth a second look —

- [ ] At the gizmo's floor size (58px arm / 40px ring, `ui-017`'s minimum — the size
  most selections actually render at on an average-sized part) the gradient's highlight
  band is only a few pixels wide. Screenshots taken during this task's own drive looked
  fine at 1440×900 desktop resolution, but that is not the same claim as legible on a
  real phone/tablet screen's pixel density and viewing distance — CLAUDE.md's
  Responsive Layout section asks for real on-device hand-testing, not just a Chromium
  viewport emulation, and this task's own drive was desktop-emulation only.
- [ ] The double-stroke ring "tube" cue (a dim gradient band plus a thin bright core,
  both drawn from the same points) is the subtlest of the three techniques used here —
  worth a specific glance on a real device to confirm it doesn't just look like a
  slightly-thicker single ring, which would mean that particular technique earned its
  added draw call for nothing.

### ui-022 — ring arrowhead legibility at phone width and at the gizmo's floor size (2026-09-07 16:17)

A visual/feel judgment call, not a correctness question — the maths is asserted exactly
in `annotate.spec.js` and the e2e spec confirms the markers render, but neither can judge
whether the chevrons *read* as an arrow to a person rather than as a stray dot once the
gizmo shrinks. Not a standing acceptance scenario: scenario 2's gizmo-drag half checks
that dragging still works, not how the ring's own decoration looks at a given size.

`ringArrowheads`' size (`RING_ARROW_SIZE_RATIO = 0.16` of the ring's own screen radius)
was only eyeballed at laptop width against a body sized comfortably above the gizmo's
58px/40px floor (`ui-017`). Two cases that ratio was never looked at:

- [ ] At phone width (390×844), with the ring at or near `GIZMO_RING_FLOOR_PX` (40px) —
  confirm the two chevrons per ring are still individually distinguishable as arrows,
  not a single blob, at a real fingertip's viewing distance.
- [ ] On a heavily edge-on ring (camera looking nearly along that axis, e.g. after a
  standard-view snap) — confirm the chevron near the ring's collapsed end doesn't
  visually merge into the ring's own line.

### core-004 — how a rotation number wrapping past ±180° feels mid-drag (2026-09-06 19:18)

A feel judgment about a number on screen, not a correctness question, which is why it is
here rather than an acceptance scenario: the geometry is right either way, and scenario 2
already checks the *sizes* on a standing basis.

The carried rotation is now canonical — yaw and roll in `(-180, 180]`, pitch in
`[-90, 90]` — instead of a running total. That is what makes a typed absolute rotation
and a dragged one comparable at all, and it is inherent to any faithful representation
(a quaternion decomposes the same way). But it means a ring dragged steadily past half a
turn makes the Inspector's number flip sign — `179°` to `-179°` — rather than counting
on to `200°`. The same is true of the two angles that are not being dragged: they can
move on their own during a single-ring drag, because the composed orientation genuinely
has components on all three axes.

- [ ] Drag one rotate ring slowly through more than half a turn on a laptop and watch
  the Rotation fields. Does the sign flip read as the app losing track, or as an
  obviously-equivalent way of saying the same angle? If the former, the fix is a display
  concern (an unwrapped "turns" readout, or holding the pre-drag branch for the duration
  of a gesture), not a change to what is stored — file it as its own `ui-*` finding.
- [ ] Same drag on the phone (390×844), where the fields are in a bottom sheet and a
  thumb is over part of the viewport, so there is less peripheral context for what the
  number is doing.

### ui-023 — legibility of diagonal dimension lines on a tilted part (2026-09-06 19:02)

Purely a visual/feel judgment, which is why it is here and not an acceptance scenario:
the numbers themselves are now correct and are checked on a standing basis by scenario 1's
rotated-body half.

- [ ] Tip a cylinder over about 60° and look at it on a **phone** (390×844). At laptop
  width the three lines are clearly readable, but they now run diagonally *through* the
  gizmo's rotate rings rather than sitting square around the silhouette, and the
  laptop screenshot is already a little busy where a `40 mm` label crosses a ring. Judge
  whether the labels stay readable at phone width, or whether the lines want a larger
  offset (`DIMENSION_OFFSET_PX` in `Viewport.vue`) once they are no longer axis-aligned.
- [ ] While there: two of the three labels can end up close together when a rotation
  lines two local axes up on nearly the same screen direction (the degenerate case
  covered numerically in `annotate.spec.js`). The maths is right and the lines are
  separated by the perspective divide, but whether that separation is *enough* to read
  at phone size is an eye judgment no assertion makes.

### build-002 — Fix bright white flash before first paint (FOUC) on app load (2026-09-06 18:22)

One entry. The TODO's own Testing section asked for the throttled-load re-check to be
done "by eye" specifically because the defect is a paint-timing race that a numeric
assertion can approximate but not fully stand in for. What was actually run was a
Playwright script (Chromium/Firefox/WebKit) that delays JS/CSS responses by 2s and
samples the `<html>`/`<body>` computed background color and the `color-scheme` meta's
presence 150ms after navigation commit — confirming the dark background (`#10131a`)
and the meta tag are both already in place well before the delayed resources resolve,
on all three engines. That is a solid proxy for "the race is closed," but it is not the
same as a human actually watching a real Slow-3G-throttled load in DevTools and judging
whether any white frame is perceptible to the eye — a synthetic 150ms sample can miss a
one-compositor-frame flash that a live visual watch would catch, and Playwright's route
delay doesn't reproduce a real mobile network's connection-setup latency.

- [ ] **Watch a real Slow-3G + 4x-CPU-throttled load in Chrome/Firefox/Safari DevTools
  by eye**, on a real machine, and confirm no white frame is visible between navigation
  and the dark UI appearing — per the TODO's own Testing section, this matters most for
  WebKit/Safari specifically, since this defect is very plausibly the same white-flash
  bug both previous attempts shipped on iPad/Safari.

### ui-018 — Shift+left-drag or right-drag pans the viewport (2026-09-06 16:08)

One entry, a real trackpad/mouse-hardware feel judgment the automated suite and the
hand-drive (both driven through synthetic `PointerEvent`s at fixed pixel deltas) cannot
make. Everything *functional* — Shift+left and right-button both pan regardless of the
chrome toggle, a Shift+left click with no real drag still additively selects, the
native context menu is suppressed, and a plain left-drag still follows the toggle
unchanged — is now covered on a standing basis by `TODO/ACCEPTANCE.md` scenarios 1 and
7, so none of it is restated here.

- [ ] **Right-button drag on a laptop trackpad with no physical right button.** Most
  trackpads synthesize a right-click via a two-finger tap/click-and-hold rather than a
  true held "button 2" during a drag, and some trackpad drivers only fire `button: 2`
  on the initial press, not on subsequent `pointermove` events during the drag. Try an
  actual two-finger-click-and-drag on a real Mac trackpad and a real two-button mouse
  and confirm both actually pan smoothly for the drag's whole duration, not just
  flicker into pan mode for the first frame (the constant to check is
  `pressButton` in `src/components/viewport/Viewport.vue`, captured once at
  `pointerdown`).

### ui-012 — Gizmo move/rotate ↔ numeric-field sync (2026-09-06 13:09)

Two entries, both feel judgments the acceptance drive genuinely cannot make. Everything
*functional* about this task — the fields tracking a drag live, a typed value moving the
mesh, and above all "exactly one body after a move" — is now covered on a standing basis
by `TODO/ACCEPTANCE.md` scenarios 1 and 2, so none of it is restated here.

- [ ] **The dimension lines do not turn during a rotate-ring drag.** They track a
  *translate* drag exactly, but during a rotation the preview keeps the body's
  axis-aligned bounding box and only settles onto the real turned bounds on release
  (`src/composables/useSelectedBody.js` says why: the true bounds of a partly-turned
  solid need the kernel to rotate it, which is precisely the per-frame work the preview
  exists to avoid). Functionally correct, and the numbers are right the instant you let
  go. The open question is whether it *reads* as broken mid-drag — three dimension lines
  visibly not following the solid they annotate — or whether nobody notices because they
  are watching the solid. Judge it by eye on a Cube at laptop width; if it reads badly,
  the cheap fix is hiding the lines while a rotate preview is active, not measuring the
  turned solid every frame.
- [ ] **Rotate-ring drag feel under a real finger.** A ring drag maps the pointer's sweep
  *around the gizmo hub* to degrees, so how much rotation a given finger movement
  produces depends on how far out from the hub you grabbed — near the hub a small
  movement spins it fast. That is the correct dial behaviour and it felt fine with a
  synthesised pointer, but a fingertip has contact area and lands less precisely than a
  mouse: the driven sweeps produced about −52° at laptop width and about −105° at phone
  width for the same 70px gesture, purely because the fatter phone hit target moves the
  effective grab point. Try it on a real iPhone and iPad and say whether the phone case
  is too fast to control; if it is, the fix is clamping the effective grab radius in
  `rotateDeltaDeg`'s caller, not shrinking the touch target back down.

### ui-011 — Selection → inspector + dimension lines + gizmo (2026-09-06 01:22)

One entry. The two *structural* defects this task's acceptance drive found — the two
bottom sheets stacking, and the nav chrome sitting behind the sheet's edge — were fixed
in the task and re-driven, so they belong in `TODO/ACCEPTANCE.md`'s scenario 2 note, not
here. What is left is a genuine visual judgment call that no assertion can settle.

- [ ] **Dimension-label collisions at phone width.** The three labels are placed at each
  dimension line's midpoint, pushed outward from the solid's screen centre
  (`updateDimensionAnnotation` in `src/render/annotate.js`). That keeps them off the
  solid, which is the hard part — but nothing stops one from landing under the
  orientation-gizmo card in the top-right corner, and at 390px that card is large
  relative to the screen. It happened once in the drive: the X label drifted behind the
  card while the camera was near the home view on a body placed high in the viewport.
  Nothing was *wrong* — the number is also in the Inspector's Size row — but it looks
  untidy. Worth a few minutes of orbiting on a real phone to judge whether this is rare
  enough to leave, or whether the labels want a simple clamp inside a safe area. Do not
  reach for a general label-collision solver before deciding it is actually a problem.

### ui-010 — Drag-place a primitive (2026-09-06 00:58)

One entry only. The scenario-1 drive covers whether placement *works*; what it cannot
cover is whether the gesture feels right under a real finger, because every drag in
that drive was a synthesised `PointerEvent` sequence with no contact area, no
momentum, and no chance of the sheet being in the way of the hand holding it.

- [ ] **Sheet-to-viewport drag on real phone hardware.** At 390px the Library is a
  bottom sheet, so the drag starts near the bottom of the screen, crosses the sheet's
  own edge, and has to end up somewhere in the visible strip of grid above it — a
  path that only exists at phone width and that no other gesture in the app takes.
  Try it on an actual iPhone: is there enough uncovered viewport above the open sheet
  to drop into comfortably, or does the sheet want to be shorter (its `max-height` is
  `46vh` in `src/components/layout/LibraryPanel.vue`)? Does the translucent ghost read
  clearly against the grid at that size, or does a thumb cover it entirely?

### render-001 — App shell + viewport scaffold (2026-09-05 21:10)

Both items are physical-hardware feel judgments that the scenario-7 drive cannot make
for itself: an emulated 820×1180 WebKit context registers a tap or a drag perfectly,
where a real finger has contact area and a real wrist has momentum.

- [ ] **Orbit sensitivity on a real touchscreen.** Drag speed is a fixed 0.4° of orbit
  per pixel, slightly faster than three.js's own OrbitControls default at this viewport
  height. In the driven pass a single 260px diagonal swipe rotated ~104° and parked the
  camera flat against the top-down pole — correct clamping, but possibly too twitchy in
  the hand. Try a few casual swipes on an iPhone and an iPad and say whether it wants
  lowering (the constant is `ORBIT_DEG_PER_PX` in `src/components/viewport/Viewport.vue`).
- [ ] **Orientation-triad cap tap targets.** The six axis caps are 32px (30px at phone
  width) rather than the 44px used for the navigation chrome — six 44px targets will not
  fit a 116px dial without overlapping. The e2e matrix proves they are hittable at their
  centres; what it can't tell us is whether a thumb reliably picks the intended cap when
  two are visually adjacent. If it doesn't, the fix is a bigger dial at touch widths, not
  bigger caps in the same space.

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

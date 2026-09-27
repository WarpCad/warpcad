---
title: Shrink the gizmo's move handles so they stop dominating the scene, and give them a real 3D look
category: ui
kind: finding
priority: medium
model: sonnet
milestone: M7
depends: []
status: done
---

> **What shipped (2026-09-27):** As proposed, with these specifics.
> - **Head size:** `gizmoHeadPx = clamp(arm × 0.08, 13, 16)` long, base half-width 0.35 × that. It measures 13.5 px at the 58 px floor and 16.5 px at the 198 px cap, down from ~57 px.
> - **Arm:** now `ringPx + 18`, which keeps the 58 px floor. The old separate 220 px arm cap is gone, so the cap is effectively 198 px.
> - **Shaft:** 3 px, and it stops at the cone's base so no nub pokes past the tip.
> - **Shading:** shaft and cone use per-arm `userSpaceOnUse` gradients across the arm, lit from the upper left.
> - **Cone base:** a disc foreshortened by `|axis · view|` (new `axisToward`). It is drawn under the cone when the arm points toward the camera and over it when the arm points away.
> - **Optional item 6** (dim away-facing arms) was not done. The base-disc draw order already carries the toward/away cue.
>
> The "check what actually draws" question has an answer. With ui-021's `objectBoundingBox` gradient, the vertical Z shaft painted **nothing** in Chromium and WebKit: the new pixel-probe e2e scored 5, i.e. background, against the old code. It now paints in every engine tested. Firefox is environment-blocked (`TROUBLESHOOTING.md`, 2026-09-17).
>
> Two parts of the spec turned out stale:
> - Scenario 6's "the gizmo shrinks to that part alone" is wrong. Since `ui-016` a drilled-in sub-part shows no gizmo at all, so the floor size was verified on a zoomed-out cube instead.
> - `docs/selection-and-inspector.md` had no gizmo screenshots to refresh. No docs page uses screenshots yet, so the text and a worked example were updated and no images were added.
>
> Observed and logged in `TODO/VERIFY.md` rather than changed:
> - At the cap, the ring chevrons (0.16 × ring ≈ 29 px) now out-measure the 16 px cones. The spec said to leave the chevrons alone.
> - At tablet width the viewport column is only ~390 px wide, so a capped gizmo's cones can run under the Inspector column. This was true before this change too.


## Problem

When a mid-sized body is selected (reported with a `raspberrypi` Pi 4 — 90.5 × 58 ×
18.55 mm — at the default zoom on a laptop), the transform gizmo's **translate
arrows** take over the view. The Z arrowhead alone is about as wide as the board's USB
block. The X head covers the Pi's whole USB/Ethernet end. The shafts run the full height
of the scene. The rotate rings in the same screenshot look fine; **this finding is about
the move handles only.** Leave the rings, their `ui-022` direction chevrons and their
`ui-021` band+core shading as they are.

There are two separate causes. Fix both.

### 1. Size: the arrowhead scales with the arm, and the arm grows independently of the ring

- `src/render/annotate.js:379` computes `const headPx = armPx * 0.26`. The head is a fixed
  fraction of the arm, so when `ui-017` let the arm grow from 58 px to its 220 px cap
  (`GIZMO_ARM_MAX_PX`, `annotate.js:274`), the head grew with it: from ~15 px to **~57 px
  long and ~51 px wide** (base half-width `headPx * 0.45` either side). A 57 px
  triangle is not a handle. It is a sign. `ui-017`'s goal was a longer *reach*, so the
  arm clears the silhouette. It never asked for a bigger *head*. The coupling was
  inherited from `ui-011`, when the arm was a fixed 58 px and the ratio made no
  difference.
- `gizmoSizeForBounds` (`annotate.js:300-322`) sizes the arm and the ring independently:
  each is `halfDiagonalPx + clearance`, and each has its own cap (220 vs. 180). On a body
  big enough to hit either cap, the arm reaches ~40 px past the ring, plus the full
  head length beyond that. That's why the arrows poke well outside the rings in the
  screenshot. The ring already clears the silhouette. That is `ui-017`'s actual
  requirement, and the arm only needs to reach a short, fixed distance beyond the ring.

### 2. Appearance: the heads read as flat, folded paper, not as cones

`ui-021` added shading as a per-axis `<linearGradient>` from the top-left to the
bottom-right corner (`x1=0% y1=0% x2=100% y2=100%`, `Gizmo.vue:279-289`), in the default
`objectBoundingBox` units. For the rings, that works. For the arrows it has two problems:

- **The gradient ignores which way the arrow points.** A cone lit from the side has its
  highlight running *along* the axis, bright on one flank and dark on the other. A fixed
  top-left-to-bottom-right diagonal across the head's own bounding box instead cuts
  the triangle into a light half and a dark half at an arbitrary angle. At 57 px that
  looks like a folded paper dart, not a cone. At the old 15 px nobody could tell.
- **A shaft that is exactly vertical or horizontal on screen has a zero-width (or
  zero-height) bounding box.** The SVG spec says an `objectBoundingBox` paint server is
  *not applied* to such an element. Depending on the engine, the stroke falls back to
  nothing, or to a flat colour. The Z shaft is vertical in the default camera, and in
  most views where the model is upright. So the arm shading `ui-021` shipped may not
  render on the one arm that is always on screen. Before designing around this, check
  in all three engines what actually draws.

There are also no 3D cues: no cone base, no shaft thickness, no difference between an
arm pointing toward the camera and one pointing away. A Fusion/Blender-style gizmo reads
as 3D mainly because the cone has a visible **base disc**, an ellipse foreshortened by
the view angle, and because the shading follows the arm's direction.

## Affected files

- `src/render/annotate.js:251-275` — the floor/clearance/cap constants.
- `src/render/annotate.js:300-322` — `gizmoSizeForBounds`: derive the arm from the ring.
- `src/render/annotate.js:350-410` — `updateGizmoAnnotation`: decouple `headPx` from
  `armPx`, and add whatever per-arrow values the new shading needs (a unit screen
  direction and perpendicular, and the axis's toward/away-from-camera component for the
  base ellipse).
- `src/render/annotate.js:489-495` — `RING_ARROW_SIZE_RATIO`'s comment reasons from "the
  arms' own heads are `armPx * 0.26`". Update the comment. Don't change the ring chevrons.
- `src/render/annotate.spec.js` — numeric tests for the changes above.
- `src/components/viewport/Gizmo.vue:268-306, 355-381, 464-476` — arm/head gradients,
  markup and styles.
- `e2e/gizmo-transform.e2e.js` — size assertions and snapshots.
- `docs/selection-and-inspector.md:11-27` — the gizmo description and screenshots.

## Proposed fix

This is a plan, not a patch. Stay inside the existing screen-space SVG overlay. Don't
switch to three.js meshes. `Gizmo.vue`'s header comment and `CLAUDE.md` both give the
reasons: one overlay technology, and the gizmo stays assertable on all three engines
without pixel-picking a WebGL canvas. All arithmetic goes in `annotate.js`. The
component only lays out pixels.

**Size**

1. **Give the head a fixed screen size.** Replace `armPx * 0.26` with a constant around
   13-16 px long and 9-11 px wide. It may grow slightly with the arm if that looks better
   (e.g. `clamp(armPx * 0.08, 12, 18)`). Pick by driving the app. Either way, the head
   at the 220 px cap must end up **no bigger than it is today at the 58 px floor
   (~15 px)**, or only a few px bigger.
2. **Tie the arm's reach to the ring.** Make the arm `ringPx + ARM_PAST_RING_PX` (roughly
   18-24 px, so the arrowhead sits just outside its ring) instead of computing it
   separately from the half-diagonal with its own cap. This keeps `ui-017`'s guarantee,
   because the ring already clears the silhouette, so an arm longer than the ring does
   too. It also makes the `armPx > ringPx` ordering hold by construction instead of
   depending on two constants that happen to agree. Keep `GIZMO_ARM_FLOOR_PX = 58`. It
   is `ui-012`'s tuned touch value and must not shrink at phone width.
3. **Consider a slightly thicker shaft** (2.5 → ~3 px) once the head is smaller, so the
   arm still reads as the grab target. The rings are 3 px wide, and the arms shouldn't
   look thinner than the rings next to them.

**3D appearance**

4. **Shade across the axis, not at a fixed diagonal.** Give each arm's gradient
   `gradientUnits="userSpaceOnUse"`, with `x1/y1/x2/y2` running across the shaft (origin
   ± perpendicular × half-width), recomputed per frame from values `annotate.js` already
   derives. This fixes the zero-width-bbox problem too, because `userSpaceOnUse` doesn't
   depend on the element's bounding box. Update the gradient's coordinates in place, the
   same way `ringBuffers` avoids per-frame allocation. Don't rebuild the `<defs>`.
5. **Draw the cone with a base.** Render each head as two shapes: the triangle, shaded
   across its axis as above, bright on one flank and darker on the other; and a small
   filled ellipse at its base, in a darker shade of the axis colour. The ellipse's minor
   axis is `baseWidth × |axis · viewDir|`, a full disc when the arm points at the camera
   and a line when the arm lies flat across the screen. That foreshortening is the
   strongest single 3D cue and costs one `<ellipse>` per arm. It needs the axis's depth
   component, which is numeric work, so it goes in `annotate.js` with a test.
6. **Optional, evaluate by eye:** draw arms that point *away* from the camera, under the
   hub and slightly dimmer, like the orientation triad's negative caps (`ui-025`).

Keep the `AXIS_STROKE` colour coding readable. X/Y/Z must stay obviously red/green/blue
after any shading change. Keep the existing `drop-shadow` depth cue, but check that it
doesn't turn into a smudge now that the head is smaller.

**Test-id collision warning:** `e2e/selection-inspector.e2e.js` counts matches on
`data-testid` *prefixes* (`gizmo-ring-` must match exactly 3). `ui-021` and `ui-022`
both hit this. If you add a base ellipse, don't name it `gizmo-head-base-*`. Use
something like `gizmo-cone-base-*`, and grep `e2e/` for `^="gizmo-` prefix selectors
before choosing names.

## Interaction model

This changes how an existing control looks and how big it is
(`docs/decisions/interaction-model-qa.md` control 4). It doesn't change the precondition,
trigger, or feedback. That is stated here explicitly, as `CLAUDE.md` requires.

- **Precondition**: unchanged. Exactly one body or group, or one sub-part, is selected.
- **Trigger**: unchanged. Pointer-drag on an arrow, or a numeric edit in the Inspector's
  Position fields.
- **Feedback**: unchanged in meaning. The arrows are smaller, stay just outside the
  rotate rings, and look like rods with cones.
- **Placement / Selection response / Selection count**: n/a, unchanged.
- **Small-screen behavior**: same as desktop for the visible handle. The **invisible hit
  targets must not shrink with the visible head.** `.tgizmo__grab` (22 px, or 34 px at
  phone width) is set in CSS and is independent of `headPx`, so it should be unaffected.
  Confirm that. Also confirm that the arm hit target's start (`ARM_GRAB_FROM = 0.45` of
  the arm length) still leaves the hub clear when the arm is now derived from the ring.
  The 58 px arm floor is kept so a phone-sized gizmo stays as grabbable as `ui-012`
  tuned it.

## Documentation

- **Page**: `docs/selection-and-inspector.md`. Update the gizmo description in lines
  11-27, which says the arrowheads "are shaded with a subtle highlight". Say the arrows
  are small rods with cone tips that end just outside the matching rotate ring, and
  refresh that page's gizmo screenshots from the e2e snapshots
  (`.claude/commands/docs.md` Step 3).
- **Example**: "Drag a **Raspberry Pi** from the Library into the 3D view and let go.
  It is selected straight away. The three arrows end just past the three coloured
  rings, each with a small cone at its tip. Drag the **red cone** to the right: the Pi
  slides along X and **Position X** in the Inspector counts up in millimetres. The
  cones stay the same small size whether you select a 6 mm nut or the whole Pi."

## Effort

M (a few hours). The sizing change is small and mechanical. The shading needs per-arrow
`userSpaceOnUse` gradients, the new base-ellipse geometry with a unit test, and a couple
of rounds of driving the app in both themes and all three engines to get a look that
works at both the floor size and the cap size.

## Testing

- **`src/render/annotate.spec.js`** (`toBeCloseTo`, 1e-6 px):
  - `headPx` at the 220 px arm cap is ≤ the new head constant (plus its small growth
    allowance, if you add one). It is no longer 0.26 × arm.
  - `gizmoSizeForBounds` returns `armPx > ringPx` at every size: the floor, mid-range,
    and the cap. Degenerate cases: a zero-extent bounding box and a non-positive
    `mmPerPixel` both still return the floor, never `NaN`.
  - Base-ellipse minor axis: equals the full base width for an axis pointing straight at
    the camera, is ~0 for an axis perpendicular to the view direction, and is 45°-correct
    in between. An axis that projects to zero length still hides the arm, as today,
    with no `NaN` from normalising a zero vector.
- **`e2e/gizmo-transform.e2e.js`**, navigating to `/`: select a Raspberry Pi (large enough
  to hit the cap at default zoom) and a default cube. For each, assert that the
  `gizmo-head-*` polygon's bounding box is ≤ ~20 px on its longest side, and that each
  arrow tip lies outside that axis's ring but within ~30 px of it. This replaces "the
  gizmo is visible" with a check that would have failed on the screenshot in this
  finding. Keep the existing drag assertions: dragging the smaller head still moves the
  right body the right number of millimetres. Take a snapshot at each viewport.
- **Viewports**: all three (phone/tablet/laptop). This is the same touch-target sizing
  `ui-012` and `ui-017` needed all-viewport coverage for.
- **Engines**: all three (Chromium/Firefox/WebKit). The gizmo's geometry and drag maths
  are WebGL-projection-sensitive. Separately, `userSpaceOnUse` gradients and the
  zero-bbox fallback are exactly the kind of SVG paint-server behaviour that differs
  between engines. `ui-021` needed a manual WebKit/Firefox check for `color-mix`. This
  task makes that check part of the spec.
- **`TODO/ACCEPTANCE.md` scenarios to re-drive**: **1** (Two independent primitives): its
  "gizmo attaches" half, and its X-arrow drag that must leave exactly two bodies, since
  that drag grabs the resized arrow. **6** (Group vs. sub-part selection): the gizmo
  "shrinks to that part alone" on a drilled-in sub-part, which is where a fixed-size
  head and an arm tied to the ring have to hold up at the floor size.
- **Closed findings on this subsystem to re-run** (per `CLAUDE.md` Verification, a closed
  finding is a standing regression surface):
  - `ui-017`: the arm and ring still sit clear of the selected body's projected
    bounding box when zoomed in and out, now that the arm comes from the ring.
  - `ui-021`: X/Y/Z colours stay distinguishable in dark and light themes, and
    `color-mix` still resolves (not black) in Chromium, Firefox and WebKit.
  - `ui-012`: "a press on a handle that never moves still selects what is underneath".
    Its `grabFraction` was already moved once when `ui-017` lengthened the arm, so it
    may need to move again when the arm shortens.
  - `ui-022`: the ring chevrons are unchanged, but their size comment refers to the arm
    head's ratio. Confirm they still look secondary to the (now smaller) arrow heads,
    not larger than them.

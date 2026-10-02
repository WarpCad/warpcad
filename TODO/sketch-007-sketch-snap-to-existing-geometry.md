---
title: Sketch editor snapping — new 2D outlines snap to existing ones (Shift or a Snap toggle turns it off)
category: sketch
kind: feature
priority: high
model: opus
milestone: M8
depends: [sketch-001]
status: open
---

## Goal

The user's request (2026-10-02): *"When drawing new 2d objects they should be able to snap
to existing 2d objects (or no snap if shift or snap is disabled)."*

The editor has only a close-the-chain tolerance for Line. Nothing else snaps, so lining a
new circle up with a rectangle's corner, or ending a line exactly on another outline's
edge, is by eye. Every point a draw gesture fixes snaps to the nearest feature of the
outlines already on the active slice, unless the person turns snapping off.

## Interaction model

- **Precondition**: the editor is open and a draw tool (or, once `TODO/sketch-002` lands, a
  vertex drag) is in progress or armed. Snapping needs at least one other outline on the
  slice; with none it has nothing to snap to and is invisible.
- **Trigger**:
  - **Automatic** while snapping is on: as the pointer comes within `SNAP_RADIUS_PX`
    (≈ 12 px, a screen distance, converted to mm through `orbit.getMmPerPixel`) of a snap
    target, the point being placed moves onto it.
  - **Off, momentarily**: hold **Shift** while drawing.
  - **Off, persistently**: a **Snap** toggle button in the Sketch toolbar
    (`data-testid="sketch-snap-toggle"`, on by default, state remembered per session).
    **Touch has no Shift key**, so the toggle is the only way to disable snapping on a
    phone — that is why it is a real control, not a nicety.
- **Snap targets, in priority order** (nearest within radius wins inside a tier; a higher
  tier beats a lower one when both are in range): (1) vertices and corners: a polyline's
  points, a rectangle's four corners, a polygon's vertices; (2) centres: a circle's and a
  polygon's centre, a rectangle's centre; plus circle quadrant points; (3) midpoints of
  segments and rectangle edges; (4) the **nearest point on an edge** (a polyline segment, a
  rectangle edge, a circle's circumference); (5) the sketch origin. Extension / alignment
  guides are out of scope (a follow-up if wanted). Targets come from the **active slice**
  only; inactive slices are drawn ghosted and not snapped to.
- **Applies to**: the first point and every later point of Line; a Rectangle's start and
  corner; a Circle's centre and its radius point (so a circle can be sized to touch another
  outline); a Polygon's centre and radius point; and, in `TODO/sketch-002`, a dragged
  vertex or midpoint handle. It never snaps a point to the outline being drawn itself, and a
  Line chain's close-on-first-vertex is just the vertex tier hitting its own first point.
- **Feedback**: a small marker at the snapped point whose shape names the tier (square =
  vertex, ring = centre, triangle = midpoint, cross = on-edge), plus a text label
  ("Corner", "Centre", "Midpoint", "On edge") beside it; the live draft preview uses the
  snapped point, so what you see is what is committed. With snapping off the markers and
  labels are absent and the toggle shows its off state. Markers must never intercept
  pointer events (SVG `pointer-events: none`; ui-020 finding #1).
- **Placement / selection count**: unchanged; snapping adjusts the point, not what is
  created. A press-and-release without movement still adds nothing (`isDegenerate`).
- **Small-screen behavior**: the Snap toggle is a ≥ 44 px target in the toolbar slot
  (re-check `ui-043` overlap); on touch the snap marker is drawn offset above the finger so
  it is not hidden under it; the radius is in screen pixels, so it is the same on every
  viewport.

## Documentation

Update `docs/sketch-mode.md`: new **Snapping** section. Example: "Draw a rectangle. Pick
**Circle**, press near the rectangle's top-right corner: a square marker and the label
*Corner* appear and the circle's centre lands exactly on it. Hold **Shift** while you press
(or tap **Snap** off) to place the centre wherever you point instead."

## Affected files

- `src/sketch/snap.js` (new, framework-free): `snapTargets(profiles, activeProfileId)`
  and `snapPoint(pointMm, targets, radiusMm) → { pointMm, kind } | null`, pure, no DOM.
- `src/sketch/snap.spec.js` (new).
- `src/stores/sketchEditor.js` (`snapEnabled`), `src/components/viewport/SketchToolbar.vue`
  (Snap toggle), `src/components/viewport/Viewport.vue` (apply `snapPoint` inside
  `projectToSketch`'s callers in `beginSketchDrag` / `updateSketchDrag` and the Line vertex
  step from `TODO/sketch-006`; read `event.shiftKey`), `src/components/viewport/SketchStrokes.vue`
  (marker + label), `docs/sketch-mode.md`.

## Proposed fix

Compute snap targets once per profile-set change (not per pointer move), keep them in a
plain non-reactive array (CLAUDE.md Performance: no per-frame allocation, no reactive
walking), and have the pointer-move path do one nearest-search per event with reused
scratch vectors. Keep the units explicit: targets and results in sketch millimetres
(`Vec2Mm`), the radius converted at the one boundary. `SKETCH_PICK_TOLERANCE_PX` stays the
selection tolerance; snap radius is its own constant.

## Testing

- **Unit** (`snap.spec.js`, explicit `toBeCloseTo` tolerances, degenerate cases): each
  target tier yields the right point; tier priority (a vertex beats a nearby edge point);
  nearest wins within a tier; outside the radius returns `null`; the profile being drawn is
  excluded; zero-length segment, zero-radius circle, coincident vertices, an empty slice
  and a single profile do not throw; snapping onto a circle's circumference lands at
  distance `r` from the centre within 1e-9.
- **E2E**: extend `e2e/sketch-primitive.e2e.js` with real `page.mouse`: draw a rectangle,
  then a circle pressed 6 px from a corner, assert the circle's centre equals the corner
  exactly (read it from the Inspector fields); repeat with Shift held and assert it does
  **not** snap; repeat with the Snap toggle off. Trusted touch on chromium-phone for the
  toggle path. Three viewports; all three engines.
- **Acceptance**: re-drive scenario 9 and 1; closed findings ui-020 #1 (markers must not
  swallow the draw gesture), #2/#3, ui-043, ui-046.
- Perf: confirm snap search adds no per-event allocation on a 400-point outline
  (`.claude/prompts/perf-benchmark.md`) — relevant once `sketch-004` produces such outlines.

---
title: Sketch Line tool is continuous by default — the next segment is already started from the last point
category: sketch
kind: feature
priority: high
model: sonnet
milestone: M8
depends: [sketch-001]
status: open
---

## Goal

The user's request (2026-10-02): *"the line tool should be a continuous line tool by
default: you draw a line, then another line is already started from the end of the last
line."*

Today (`Viewport.vue` `beginSketchDrag` / `endSketchDrag`) each Line drag draws exactly one
segment and leaves an open chain behind. The **next** drag extends that chain only if the
press starts within pick tolerance of the chain's last point; otherwise it starts a
disconnected new chain. That makes a polygon outline a precision game on a phone. The Line
tool becomes a polyline tool: after the first segment, the next one is *already started*
at the end of the last, following the pointer, until the person finishes it.

## Interaction model

- **Precondition**: the editor is open and Line is armed. Nothing else needs to be
  selected.
- **Trigger** (no modifier key on any pointer type, no hover required on touch):
  - **Start**: press at a point and drag, or tap that point, to fix the first vertex.
  - **Continue**: from then on a segment is always live from the last vertex to the
    pointer. On mouse the rubber band follows the cursor (hover). On touch there is no
    hover, so the next **tap** or **drag-release** fixes the next vertex, and the rubber
    band shows from the last vertex to where the finger is while it is down.
    Each fixed vertex immediately starts the next segment from it.
  - **Close**: fix a vertex on (within snap tolerance of) the chain's **first** point; the
    outline closes into a polygon and the chain ends. Needs ≥ 3 vertices.
  - **Finish open**: **Esc**, **Enter**, double-click / double-tap on the last vertex, a
    **Finish** button that appears in the toolbar while a chain is live
    (`data-testid="sketch-line-finish"`; the only way on a phone), or switching tool. An
    open chain stays in the draft, rendered in the warning colour ("Open outline — not part
    of the solid", sketch-001's rule).
  - **Undo last point**: Backspace, or an **Undo point** button next to Finish. Removes
    the last vertex and keeps the chain live; removing the only segment discards the chain.
  - **Cancel the chain**: Esc twice, or the tool's Cancel, removes the whole unfinished
    chain.
- **Feedback**: the committed segments draw solid; the live segment draws dashed from the
  last vertex to the pointer with its length in mm beside it; the last vertex is a visible
  dot; the first vertex pulses when the pointer is within the close tolerance. A hint line
  reads "Click to add a point · Esc to finish · click the first point to close".
- **Placement / selection count**: Line produces one `polyline` outline per chain. A
  finished chain is **not** auto-selected (ui-020 finding #3); selecting it is
  `TODO/sketch-005`.
- **Small-screen behavior**: Finish and Undo point are ≥ 44 px, sit in the toolbar slot
  without breaking `ui-043`'s overlap rule, and the live segment never needs a second
  finger. Pinch/two-finger pan still navigate (sketch-001's rule: one finger draws, two
  pan).

## Documentation

Update `docs/sketch-mode.md`: rewrite the Line tool paragraph. Example: "Tap **Line**. Click
at (0, 0), then (40, 0), then (40, 20); each click starts the next segment from the last
point. Click the first point again to close the triangle, or press **Esc** (or tap
**Finish**) to leave it open. Backspace removes the last point."

## Affected files

- `src/components/viewport/Viewport.vue` (the Line branch of `beginSketchDrag` /
  `endSketchDrag`, a live-segment pointer-move path, key handling),
  `src/stores/sketchEditor.js` (`chainId` semantics: a chain is live until finished;
  `finishChain`, `undoPoint`, `cancelChain`),
  `src/components/viewport/SketchToolbar.vue` (Finish, Undo point),
  `src/components/viewport/SketchStrokes.vue` (live dashed segment, length label, close
  hint), `src/sketch/profile.js` (append / pop vertex helpers, pure),
  `src/sketch/entity.js` (`lengthOf`, `isDegenerate` reused), `docs/sketch-mode.md`.
- Keep Rectangle / Circle / Polygon exactly as they are (drag-to-size).

## Proposed fix

Make the live chain the Line tool's state, not something recovered by hit-testing the last
point. When Line is armed and `chainId` is set, pointer-move updates a live end point and
pointer-up / tap appends a vertex; the old "press must start on the last point" rule goes
away. Closing and the minimum-length (`SKETCH_MIN_LENGTH_PX`) checks reuse the existing
helpers. Snapping the vertex is `TODO/sketch-007`'s job; build the vertex-fix step as a
single function that task can wrap.

## Testing

- **Unit**: `profile.spec.js` — append vertex, pop vertex, close at ≥ 3 vertices, refuse
  closing at 2, degenerate zero-length segment ignored, chain of one segment survives
  Finish as an open outline; store transitions for finish / undo / cancel / tool switch.
- **E2E**: extend `e2e/sketch-primitive.e2e.js`, real `page.mouse` (hover-driven rubber
  band) and trusted touch on chromium-phone (tap-tap-tap, Finish button): draw a triangle
  with three clicks and close it; draw an open chain and Finish; Backspace removes a point;
  Esc finishes; the closed triangle extrudes via Done. Three viewports; all three engines.
- **Acceptance**: re-drive scenario 9 and 1; closed findings ui-020 #1 (a press on a
  drawn stroke must still draw — the live chain must not swallow it), #3, ui-043, ui-046.

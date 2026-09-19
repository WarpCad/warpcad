---
title: Export the current scene or selection to STL, OBJ, or glTF
category: io
kind: feature
priority: medium
model: sonnet
milestone: M6
depends: [data-002]
status: open
---

## Goal

M6's stated v1 export scope (`TODO/ROADMAP.md`'s own kickoff-level decision): STL, OBJ,
and glTF, with STEP explicitly deferred since it would need the same `OpenCascade.js`
fork question `edge-fillet`/`core-003` already declined. "Done" looks like: with
nothing selected, export the whole scene; with something selected, export just that
selection (per `data-002`'s confirmed precondition answer) — in the chosen format, as a
real downloaded file that opens correctly in an external tool (a slicer, a mesh viewer),
per `TODO/ACCEPTANCE.md` scenario 11's own concrete bar.

## Interaction model

- **Precondition** — n/a in the disabled/enabled sense used by an Operation control (a
  0-selection export means "whole scene," which is always valid) — but the resulting
  export's *scope* depends on selection count: 0 selected → whole scene, 1+ selected →
  just the selection, per `data-002`'s confirmed answer.
- **Trigger** — per `data-002`: likely a toolbar or menu control, format picker (STL/
  OBJ/glTF), triggering the browser's download mechanism — `ui-034` builds this control;
  this task builds the underlying serialization it calls.
- **Feedback** — a browser file download with a sensible default filename (e.g. the
  project name or a timestamp, per scenario 11's "sensible default name" bar).
- **Placement** — n/a; operates on existing geometry.
- **Selection response** — n/a beyond the scope rule above.
- **Selection count** — n/a in the exactly-N sense (0 and 1+ are both valid, with
  different scope, not a disabled state).
- **Small-screen behavior** — same as desktop: a file download works identically at any
  viewport; no phone-specific concern beyond the control's own reachability, which
  `ui-034` owns.

## Documentation

- **Page** — new `docs/export.md`.
- **Example**: "Select a body (or select nothing to export the whole scene), open
  Export, choose STL, and the file downloads immediately — open it in any slicer or
  mesh viewer to confirm it matches what's in the viewport."

## Affected files

> **Superseded by `data-001` and `data-002`.** This list assumed a single export module
> would win outright. Per `docs/decisions/persistence-export.md`, export is **split**:
> STL and OBJ in `src/core/export.js` (kernel `Geom3`/`Group`, via `@jscad/stl-serializer`
> and `@jscad/obj-serializer`), and glTF in **`src/render/export.js`** (three.js
> `GLTFExporter` over the `THREE.Mesh` from `src/render/mesh.js` — `@jscad/io` has no
> glTF serializer). Neither module triggers the download; the UI does. `data-002`
> (`docs/decisions/interaction-model-qa.md` section 12) fixes the trigger as header
> **File ▾ → Export…**.

- `src/core/export.js` (new, framework-free per `CLAUDE.md`'s Project Structure — pure
  serialization logic, no DOM/download side effect) — takes one or more evaluated
  `Geom3`/`Group` values and a format, returns file bytes.
- `src/render/` (a small download-trigger helper, if the chosen library needs a
  rendered mesh rather than kernel geometry — see the Proposed fix's dependency on
  `data-001`).
- `docs/export.md`.

## Proposed fix

Directly depends on `data-001`'s serialization-library decision:

- **If `@jscad/io` is chosen**: serialize straight from the kernel's own evaluated
  `Geom3`/`Group` — the most direct, kernel-geometry-accurate path, likely landing
  entirely in `src/core/export.js` with no `src/render/` involvement at all.
- **If three.js's own exporters are chosen**: serialize from the already-rendered
  `THREE.Mesh`/`THREE.Group` per body (`ui-016`'s per-part meshing already produces
  named sub-meshes) — this needs a `src/render/` entry point instead, and this task's
  own module-placement plan in Affected files above would need revising accordingly
  once `data-001` lands.

State explicitly, once `data-001` resolves, which path this task actually took and why
— don't silently assume the recommendation in `data-001`'s own comparison survives
unchanged, the same "confirm rather than assume" discipline `ui-030` used for its own
prerequisite decision.

## Effort

M — mostly wiring against an already-chosen serialization library, no new geometry
algorithm (the library does the tessellation/format work). `model: sonnet` — this is
integration against a chosen dependency, not new architectural ground.

## Testing

- New `src/core/export.spec.js` — a known solid (e.g. a 10mm cube) exports to each
  format and the resulting bytes parse back into a mesh with the expected vertex count/
  bounding box (round-trip-parseable, not just non-empty); degenerate cases — an empty
  scene (0 bodies, nothing selected) should refuse or produce a named empty-export
  message rather than a silently corrupt file, a `Group`-valued body (multi-part)
  exports as one combined mesh or one file per part (decide and state which).
- New `e2e/export.e2e.js` (required, new user-visible control once `ui-034` lands) —
  place a cube and a cylinder, union them, export to STL, and assert the downloaded
  file (Playwright's own download-interception API) is non-empty and parses to a
  plausible vertex/face count for a 2-solid union — not just that a download fired.
  This touches the kernel/rendered-mesh path per `CLAUDE.md`'s Browser Support rule, so
  run against **all three engines**; layout is unaffected, so the 3-viewport matrix
  isn't required (state this explicitly).
- **`TODO/ACCEPTANCE.md` scenario 11** by name — its own bar is "opens cleanly outside
  WarpCad," which an automated spec's byte-level assertions can't fully replace; drive
  it by hand once `ui-034` exists, opening the real downloaded file in an external tool.
- **Closed-finding regression surface**: none new — first task in this subsystem.

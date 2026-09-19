---
title: Export the current scene or selection to STL, OBJ, or glTF
category: io
kind: feature
priority: medium
model: sonnet
milestone: M6
depends: [data-002]
status: done
---

> **What actually shipped, 2026-09-19.** The serialization mechanism only — **no UI, no
> download, and no `e2e/export.e2e.js`**, all of which are `ui-034`'s (File ▾ → Export… does
> not exist yet, so there is nothing for a Playwright download-interception spec to drive;
> the same goes for `TODO/ACCEPTANCE.md` scenario 11, recorded there as not driveable rather
> than faked). The CLAUDE.md reachability and docs-page gates for UI-touching work therefore
> apply to `ui-034`; `docs/export.md` is written anyway, and says plainly that the button is
> still to come.
>
> **Path taken (confirmed, not assumed):** the split `data-001` chose, unchanged. STL and OBJ
> in `src/core/export.js` via `@jscad/stl-serializer` / `@jscad/obj-serializer` (kernel
> `Geom3`, framework-free); glTF in `src/render/export.js` via three.js's `GLTFExporter`,
> lazy-loaded with a dynamic import. Neither module downloads anything. Nothing in
> `data-001` proved wrong: the kernel-side STL measured **0 unmatched edges** on the same
> cube-minus-Ø6-bore shape where three.js's exporter left 100 of 362, at the same 292
> triangles / 438 edges that document reported.
>
> **The two open points, decided:**
> - **(a) Several bodies are ONE combined file**, not one file per body — what a slicer plate
>   or mesh viewer expects, and the filename says so (`warpcad-scene.<ext>`). A **Group-valued
>   body exports as its `combine()`d solid** (visible parts unioned, holes subtracted, hidden
>   parts out), for all three formats, so they never disagree about what a body is.
>   `ui-034`'s popover can state "one file" as fact.
> - **(b) glTF is binary `.glb`**, as the Q&A proposed: one file, no sidecar `.bin`.
>
> **One decision the file did not anticipate: glTF is written in glTF's own space.** The
> document is mm / Z-up; glTF is metres / Y-up, and feeding it straight through would open a
> thousand times too large and lying on its back in every viewer. A single root node carries
> a -90 degree X rotation and a 0.001 scale; the vertex data stays in millimetres. STL and OBJ
> are unitless and written as-is (mm, Z-up), which is what slicers assume.
>
> **Surface `ui-034` calls** (all pure, all in `src/core/export.js` unless noted):
> `resolveExportScope(bodies, selectedIds)` (0 selected → whole scene, else the selection in
> scene order; a drilled-in sub-part already arrives as its parent's id; a non-empty selection
> matching nothing is refused, not widened), `exportFilename(bodies, format)`,
> `exportBodies(bodies, 'stl' | 'obj')`, `exportGltf(bodies)` in `src/render/export.js`
> (async), and `EXPORT_FORMATS` for the picker's labels. Each result is
> `{ bytes, filename, mimeType, triangleCount }`. Refusals throw `ExportError` with a `code`
> (`nothing-to-export`, `empty-geometry`, `evaluation-failed`, `stale-selection`) and, where a
> body is to blame, its `bodyName`. `document.bodies()` entries satisfy `ExportBody`
> structurally, so the UI passes them straight in.
>
> **Verified beyond the unit specs:** the STL and OBJ of a real evaluated union re-read by
> numpy and three.js's `STLLoader`/`OBJLoader` (independent of the serializer) — signed volume
> within 1.3e-5 relative of the kernel's, the same bounding box, 0 unmatched edges — and a
> production Rollup bundle of both modules run in Node (the CJS serializers survive
> bundling, and `GLTFExporter` lands in its own lazy chunk). `npm run build`'s main chunk is
> byte-identical (`index-CdEecrN5.js`, 963.66 kB / 272.30 kB gzip) with and without the new
> modules, because nothing in the app graph imports them yet — the serializers' 2.4 KB and
> the exporter's 11 KB gzip enter the bundle when `ui-034` does. Firefox projects were not run
> (launch failure, `TROUBLESHOOTING.md`), but there is no Playwright spec of this task's own
> to run there.
>
> **What the unit tests cannot say:** they never open a file in a real slicer or glTF viewer.
> That is scenario 11's job and is owed when `ui-034` lands.

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

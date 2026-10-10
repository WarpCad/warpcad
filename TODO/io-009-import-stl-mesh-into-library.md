---
title: Import an STL (and later OBJ / 3MF) file into the Library as a placeable part
category: io
kind: feature
priority: medium
model: opus
milestone: M9
depends: [core-037, ui-055, sketch-003, io-003]
status: open
---

## Goal

A person with an existing model — an STL from Thingiverse, a bracket someone else
designed, a scan — picks the file in the Library, and it appears under **My parts** as a
part they can drag into the 3D view like any other. "Done": open the Library, tap
**Import model file…**, choose a binary or ASCII `.stl`, and a row appears with a
thumbnail, a size readout in millimetres and a "mesh" tag; drag it into the viewport and
it renders complete, can be moved/rotated with the gizmo, booleaned against a primitive
(Subtract a cube from it), and exported again as a watertight STL.

This is the same shape as the reference-photo import (`sketch-003`): an untrusted binary
file the user picked, re-validated in a worker, reduced to a small plain-JSON record the
document can carry, and shown with an honest "not to scale / check the size" state until
the person confirms it. The photo's record is `asset.image`; this one's is `asset.mesh`.

Other CAD formats are wanted ("would be nice"), so the importer is a registry of parsers
keyed by extension, and STL is the only one that must ship in this task. The rest are
sized below so a follow-up can pick one up without re-deriving the decision.

## Why this is not just "parse the file and show it"

Two rules in `CLAUDE.md` decide the design, and an implementation that ignores them is
the exact failure the retrospectives describe:

1. **"Never persist a mesh as document state."** Geometry is derived from the timeline and
   always disposable. An STL *is* a mesh, so it cannot be stored as a body. It is stored
   the way the photo is: as an **asset** the timeline can reference. A feature op
   `import.mesh` consumes the asset id and produces a `Geom3` in the kernel, so the body
   it makes is derived like any other and the asset is the *source data*, not the cache.
2. **A library part is data, not code** (`core-037`). The imported part is a `user.<slug>`
   composite whose records are `[asset.mesh, import.mesh]`, so it rides the existing
   save / rename / delete / export-part-file / load-warning machinery unchanged. No new
   kind of library entry.

The honest cost: an STL carries triangles, so a 200k-triangle scan is a multi-megabyte
asset inside a project file. That is why caps are first-class here (below), and why the
project's own `hostedBackend` large-blob path (`io-002`) must be re-run with one.

## Interaction model

- **Precondition**: nothing. Import creates a library entry; it does not need a
  selection, and it is available with an empty document, exactly as **Import part file…**
  is.
- **Trigger**: **Import model file…** (`data-testid="library-import-model"`) in the
  **My parts** section header, beside **Import part file…**. It opens a file picker
  accepting `.stl` (and, as parsers land, `.obj`, `.3mf`) with **no `capture`
  attribute**, so a phone offers Files and cloud storage. Drag-and-drop of a file onto
  the Library panel is *also* accepted at laptop width as a convenience, never the only
  path (touch has no file drag).
- **Feedback**: a *Reading `bracket.stl`…* row with a spinner while the worker parses
  (cancelled and replaced if a second file is chosen — supersede, don't queue). Then a
  new row at the top of **My parts** with a thumbnail rendered once from the mesh
  (`render/partThumbnail.js`'s path), the file's base name, a **Mesh** tag, and its
  bounding box in mm. A toast: "Imported *bracket.stl* — 12,408 triangles, 42 × 18 × 6 mm".
  On refusal: an inline error under the header naming the reason ("Not a valid STL",
  "Too many triangles: 1.2 M, limit 250 k"), never a silent no-op and never a throw.
- **Units**: STL has no units. The row shows a **Units** control — *mm (default) / cm /
  inch* — applied as a scale on the `import.mesh` record before first placement, with the
  resulting bounding box re-read live so a person can see "6 × 2 × 1 mm" is wrong for a
  bracket and flip to cm. This is the photo's "Not to scale" badge with the same job:
  the file cannot tell us its size, so we say we don't know. The badge reads **Units
  assumed: mm** until the person touches the control or confirms.
- **Placement**: **drag from the row into the viewport**, preview follows the pointer,
  commits on release — the existing composite-drop path, unchanged. The mesh is recentred
  on its bounding-box centre in XY with its lowest point on Z = 0, so it lands *on* the
  ground plane under the pointer rather than half-buried or off at the file's own origin
  (a scan's origin is wherever the scanner left it).
- **Selection response**: a placed imported part selects like any group; the Inspector
  shows its name, its bounding-box dimensions (read-only — a mesh has no parametric
  sizes to edit, and the Inspector says so rather than showing empty fields), and the
  transform gizmo attaches, same as any body.
- **Selection count**: n/a for import. The placed part is an ordinary body, so every
  operation's existing count gate applies to it unchanged.
- **Small-screen behavior**: the Library is already a sheet at phone width; the new
  button joins the My parts header, wrapping under the title when it won't fit, 44 px
  target. The Units control is a native `<select>`, which gives a phone its own picker.

## Documentation

Update `docs/user-library.md` with a new **Importing a model file** section. Example:
"Open the Library, expand **My parts**, tap **Import model file…**, choose
`bracket.stl`. When the row appears, check the size under its name — STL files carry no
units, so if it says 0.04 × 0.02 × 0.01 mm switch **Units** to *inch*. Drag the row into
the view. Select it and tap **Subtract** with a cube to cut a pocket in it." State the
supported formats and the triangle cap, and say plainly that an imported mesh is
*not parametric*: you can move, rotate, scale, combine and cut it, but not edit its
dimensions as sizes.

Media: `e2e/docs/import-model.docs.js` produces `docs/screenshots/import-model-row.png`
(the row with its Units control) and `docs/media/import-model-place.webm` (import →
drag in); embedded in `docs/user-library.md`. Use a small generated STL fixture, not a
third-party model.

## Affected files

- new `src/io/meshFormats/stl.js` — parse binary and ASCII STL to `{ positions, indices }`;
  pure, framework-free, never throws (returns `{ ok: false, reason }`).
- new `src/io/meshFormats/index.js` — the extension → parser registry.
- new `src/io/meshAsset.js` — the `asset.mesh` validator (the `imageAsset.js` analogue):
  caps, finite coordinates, in-range indices, no degenerate-only meshes; and the
  canonical, deduplicated-vertex encoding stored in the record.
- new `src/io/meshJob.js`, `mesh.worker.js`, `meshClient.js` — parse + validate + hash off
  the main thread, supersede-not-queue, main-thread fallback and `setMeshWorkerFactory`
  test seam, copied from `src/sketch/imageJob.js` / `imageClient.js`.
- `src/core/kernel/registry.js` + new `src/core/kernel/recipes/importMesh.js` — the
  `import.mesh` op: asset id in, `Geom3` out, with the recentring and unit scale. Reuse
  `transport.js`'s `geom3.create(polygons)` path and `watertight.js`; run the result
  through the same repair so a sloppy STL still exports watertight.
- `src/core/document.js` — fold and list `asset.mesh` as `asset.image` is
  (`assets()`); a local append of a bad one is refused loudly.
- `src/core/project.js` — load-time degrade beside `unsafeImageReason`: a bad
  `asset.mesh` is dropped with a `LoadWarning` naming its id and reason, and the file
  still opens.
- `src/core/userPart.js` — add `asset.mesh` and `import.mesh` to the allowed-ops list and
  size the caps (`USER_PART_LIMITS`, `MAX_PART_FILE_CHARS`) so a mesh part can round-trip
  through **Export part file** without hitting the 8 M-character limit, or refuse with a
  clear reason when it cannot.
- `src/components/layout/LibraryPanel.vue` + `src/stores/library.js` — the button, the
  progress row, the Units control, the refusal message.
- `src/core/timelineLabel.js`, `src/core/paramEdit.js` — History reads **Imported mesh
  `name` (12,408 triangles)**; the row is *not* editable as raw numbers (same
  `stepParamEditability` refusal the photo asset has).
- `docs/user-library.md`, `docs/decisions/mesh-import.md`.

## Proposed fix

1. **Decide the parser dependency first, in `docs/decisions/mesh-import.md`**, per
   `CLAUDE.md`'s Library decisions. STL is ~60 lines either way, so the comparison is
   honest, not foregone: hand-roll vs `@jscad/stl-deserializer` (same org as the
   committed kernel and the existing `@jscad/stl-serializer`) vs three.js `STLLoader`
   (render-side only — rejected on the "core is framework-free" rule unless it can be
   called without three's scene types). Include size, release recency, maintainer count,
   licence against `npm run licenses`, and the rejection table. Parsing hostile binary
   input is the reason to prefer code we read end to end: a binary STL's header
   triangle-count field is attacker-controlled and must be checked against the actual
   byte length *before* allocating.
2. **Sanitize like the photo.** The validator is the only thing that ever sees raw
   bytes; the document stores *its output*, not the upload. Caps, all constants in one
   exported object (the `USER_PART_LIMITS` pattern), enforced in code: file size
   (default 25 MB read, 10 MB stored), triangle count (default 250 k), vertex coordinate
   magnitude, rejection of NaN/Infinity, indices in range, at least one non-degenerate
   triangle. Binary STL: reject when `80 + 4 + 50·n ≠ byteLength`. ASCII STL: bounded
   token count, no unbounded line reads. Never trust the extension; sniff — a binary STL
   whose header begins with `solid` is common and must not be misread as ASCII (check
   the length equation first).
3. **Weld on import.** STL repeats every vertex per triangle, so quantise to a small
   tolerance (say 1e-5 of the bounding-box diagonal) and share vertices before storing.
   This both shrinks the asset roughly 6× and is what lets `watertight.js` see shared
   edges at all. The tolerance is a named constant with a test either side of it.
4. **Store as an `asset.mesh` record**, shaped like `asset.image`:
   `{ id: "mesh-<24 hex of SHA-256>", op: "asset.mesh", params: { vertexCount,
   triangleCount, dataBase64 } }` — positions as little-endian float32, indices as
   uint32 (or uint16 when it fits), base64. The id is a content hash, so importing the
   same file twice dedupes. Any other field is a refusal.
5. **`import.mesh` feature**: `{ assetId, unitScale, recenter: true }`, evaluated in the
   kernel worker like every other op (`CLAUDE.md`: no kernel work on the main thread).
   A superseded rebuild is cancelled, not awaited. Hold decoded `Float32Array`s in plain
   non-reactive variables.
6. **Wrap as a library part**: the importer builds a `user.<slug>` definition from
   `[asset.mesh, import.mesh]` and saves it through the existing `core-037` path; it does
   not invent a second kind of library entry.
7. **Formats beyond STL** (separate follow-ups, sized here so they are not re-derived):
   - **OBJ** — `@jscad/obj-deserializer` or hand-rolled; text, no units, faces may be
     quads/n-gons (triangulate, and say so). Small. Materials and textures are dropped
     with a note.
   - **3MF** — a zip of XML; `src/core/zip.js` already exists. Carries **units** and
     multiple objects, so it's the one format where the Units control can default
     correctly. Medium.
   - **glTF / `.glb`** — already *exported* (`io-003`); import is a render-side loader
     question (three's `GLTFLoader` vs hand-parse). Medium; meshes only, no scene graph.
   - **STEP / IGES / BREP** — **explicitly out of scope and not a "nice to have" here.**
     They are exact B-rep, not meshes; reading them needs a full CAD kernel
     (OpenCascade compiled to WASM, tens of MB) that `@jscad/modeling` cannot stand in
     for, and the committed kernel is a mesh-CSG one. If this is ever wanted it is a
     kernel decision (`docs/decisions/geometry-kernel.md`), not an import task. Say so in
     the docs so nobody files "STEP doesn't work" as a bug.

## Effort

L. The STL path alone is M — parser, validator, one asset op, one recipe, one button.
It is L because it touches the document model (a new asset kind), the kernel registry,
the project loader's hostile-input degrade, and the user-part caps, and because the
parser choice needs its own decision record. Reasonable to split during `/fix-todo`:
(a) decision record + parser + validator, (b) `import.mesh` op and document wiring,
(c) Library UI, docs and e2e — each independently landable behind no visible control
until (c).

## Testing

- **Unit** (Vitest, next to source):
  - STL parser: binary happy path, ASCII happy path, a binary file whose header starts
    with `solid`, header triangle count that disagrees with the byte length (must refuse
    *without* allocating `n` triangles — assert on a count of `0xFFFFFFFF`), truncated
    file, empty file, NaN / Infinity coordinates, `-0`, a single degenerate (zero-area)
    triangle, indices out of range, a 250 k + 1 triangle file hitting the cap.
  - Weld: tolerance asserted with `toBeCloseTo`; two vertices 0.9× and 1.1× the
    tolerance apart; a cube's 36 STL vertices weld to 8.
  - `import.mesh`: bounding box recentred in XY, minimum Z = 0, unit scale ×25.4 for
    inch; a flat (zero-height) mesh and a mesh not at the origin.
  - Watertight: an STL cube round-trips import → export with zero open edges
    (`io-004`'s criterion).
  - Project load: a hostile `asset.mesh` drops with a `LoadWarning` and the file opens.
- **E2E** (`e2e/import-model.e2e.js` → navigates to `/`): the Documentation example with
  a generated STL fixture — click **Import model file…**, set the file via the real
  input, assert the row, its size and its Units control; drag it into the viewport with
  real mouse and (phone) trusted touch; assert the body renders complete and is selected
  with its dimensions in the Inspector; Subtract a cube from it and assert the result;
  reload and assert the part and its placed instance are still there; File ▸ New and
  assert the part is still in My parts. Refusal flows: a text file named `x.stl` and an
  oversized triangle count each show their message and leave the Library unchanged.
  Not a scripted-only check — **drive it by hand** with a real STL from the wild before
  closing, per `CLAUDE.md`'s Verification section.
- **Viewports**: all three (phone/tablet/laptop) with a snapshot at each — the control
  lives in a sheet at phone width and wraps.
- **Engines**: **all three** (Chromium/Firefox/WebKit). This touches the worker, canvas
  thumbnailing, IndexedDB persistence and a file input whose behaviour differs per
  engine. Note `core-037`/`ui-055`'s finding: a visually-hidden file input in the sheet
  grew the page in WebKit and Firefox — reuse the fix, don't re-create the input.
- **Acceptance scenarios to re-drive**: 3 (library part renders complete, not partial —
  the loudest regression for this task), 1 (a dropped part does not replace an existing
  body), 6, 8 (a hostile file in a project) and 20 (reference image — shares the
  asset/degrade code path). Consider adding a new scenario: "import an STL, place it,
  subtract a primitive from it".
- **Closed findings whose repros must be re-run**: `io-004` and `io-006` (STL export
  open edges — an imported mesh is exactly the sloppy input that bug class lives in),
  `ui-055`'s three hand-found bugs (popover below the window, collapsed Inspector tab
  covering the last My parts row, hidden file input growing the page), and `core-053`
  (export refold drops the left-broken flag) since an imported part is exported through
  the same refold.
- **Perf**: a 100 k-triangle import must keep the main thread under the 16 ms frame
  budget while parsing (measure with `.claude/prompts/perf-benchmark.md`; record the
  before/after in the decision doc) and the hosted-backend round-trip of a ~5 MB project
  must still work (`io-002`'s large-blob path).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

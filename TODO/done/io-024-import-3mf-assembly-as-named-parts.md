---
title: Import a 3MF file as one placeable part whose objects are selectable sub-parts
category: io
kind: feature
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-11-02 at the owner's request)
depends: []
status: done
---

> **Shipped (2026-11-04).** The 3MF reader, the zip central-directory reader, multi-mesh part assemblies, the Library
> row (**N parts** tag, `unitsStated`, duplicate count in the toast), the e2e spec, the docs and acceptance scenario 31 all
> landed. Whole-model Subtract is 624 ms on the main thread (part-by-part 1,082 ms, the STL 179 ms); that is recorded as a
> known limitation and filed as `core-079`. Left open on purpose, not a gap: a hole in a part is not a part, and names
> are only what the file has.

## Goal

**In user terms:** Adafruit publishes the
[Feather HUZZAH ESP8266](https://github.com/adafruit/Adafruit_CAD_Parts/tree/main/2821%20Feather%20HUZZAH%20ESP8266)
as `.f3d`, `.step` and `.stl`. The STL imports today, but it is one fused shell, so there is nothing to
design an enclosure against except the whole outline. The owner wants the individual parts to reference.

Done means: convert the STEP to 3MF in another program, choose the `.3mf` in **Import model file…**, drag
the row into the view, click twice to narrow to one component, read that component's own size in the
Inspector, and use it as a reference: **Align** a cube against it, or **Subtract** it from a plate. Both
already work on any group's sub-part (`docs/snap-align.md`, `docs/booleans.md` "Cutting with just one
part"). This task's job is to produce real sub-parts for them. It adds no new reference tool.

## Why 3MF first, not STEP

The owner chose this on 2026-11-02, after a real conversion showed it works (below). Reading STEP directly
needs a reader, every ready-made one is LGPL, and that raises questions for the licence allow-list and the
App Store build. That work is parked with its research in
[`io-025`](DEFER-io-025-read-step-directly.md). **A 3MF reader needs no dependency, no wasm, no CSP change
and no extra download**, and the multi-mesh part it builds is what a STEP reader would need later.

The cost: the person converts each model by hand, and a converter may drop the names.

## The real file this must read

The owner converted the Feather's STEP with FreeCAD: `~/Downloads/esp8266 feather.3mf`, 1.2 MB, 90 zip
entries, all **deflated** (method 8). `3D/3dmodel.model` is 6,257,604 bytes of XML (756,219 compressed,
8.3:1). Read from the file on 2026-11-02:

- **87 objects, 87 build items: the 29 components, three times over.** The sets coincide exactly: largest
  vertex difference 0.0 mm, identical triangle lists, 29 distinct (mesh, transform) pairs. A naive import
  stacks three boards in one place. Why FreeCAD wrote three is not established; the likeliest guess is one
  set per tree level selected on export.
- **One object per placed component**, with `CP2104`'s 13 solids and `JSTPH`'s 5 already merged into one
  object each. That is the right unit for a part.
- **13 distinct meshes** among the 29. The ten `10K`s are one mesh in ten places. Estimated stored size
  about 326 KB (about 435 K base64 characters), far inside `MESH_LIMITS`.
- **No names.** `object` carries only `id` and `type`. So parts are `Part 1` … `Part 29` here, and
  `Feather › ESP-12` is not available from this file.
- **Placement is in the build items.** All 87 have a 12-number `transform`, 84 of them non-identity,
  including quarter turns such as `2.22045e-16 -1 0 1 2.22045e-16 0 0 0 1 4.445 11.43 1.57`. Note the
  scientific notation. No negative determinants here, but the reader must handle them.
- `unit="millimeter"`, default namespace, no `requiredextensions`, no DOCTYPE. The start part is named by
  `_rels/.rels` as `/3D/3dmodel.model`, with a leading slash. 87 thumbnail relationships to ignore.
- **29,718 triangles per set.** One set is 51.255 × 22.86 × 6.37 mm with its minimum at (-0.455, 0, 0),
  matching Adafruit's STL exactly.
- **27 of 29 meshes are closed and manifold.** Object 19 (`JSTPH`) has 12 edges shared by more than two
  triangles, and object 23 (`KMR2`) has 6 open edges. Expect both to matter at export, not at placement.

Which object is which, from the order of the STEP tree and matched to its products by size. **This mapping
is not in the file**; it is here so a hand-drive can check real parts:

| Object | Component | Size (mm) | | Object | Component | Size (mm) |
|---|---|---|---|---|---|---|
| 1 | `Board` | 50.8 × 22.86 × 1.57 | | 20-21 | `RED` | 1.25 × 2.02 × 1.1 |
| 2-5 | `10uF` | 2 × 1.25 × 1 | | 22 | `ESP-12` | 16 × 24 × 2.95 |
| 6-15 | `10K` | 1.625 × 0.81 × 0.38 | | 23 | `KMR2` | 4.6 × 2.8 × 1.94 |
| 16-17 | `MCP73831T-2ACI/OT` | 3 × 3 × 1.4 | | 24 | `CP2104` | 4 × 4 × 1 |
| 18 | `MBR120` | 3.6 × 1.4 × 1.35 | | 25 | `20329` | 8.8 × 5.6 × 3 |
| 19 | `JSTPH` | 7.9 × 8.6 × 4.8 | | 26-27, 28-29 | `1K`, `mmbt2222` | 1.6 × 0.9 × 0.8, 3.04 × 2.64 × 1.12 |

Sizes are in each object's own frame, before its transform. Object 25 starts at X = -0.46, overhanging the
board edge, so by position it is probably the USB connector. That is an inference.

## Interaction model

- **Precondition**: nothing, as for STL. Available with an empty document.
- **Trigger**: the existing **Import model file…** (`data-testid="library-import-model"`, in the My parts
  header or the rail's ⋯ menu depending on width, since `ui-084`). Its `accept` gains `.3mf` from one new
  `MESH_FORMATS` entry. No new button. Dropping a file on the Library panel at laptop width works too.
- **Feedback**: the existing *Reading `feather.3mf`…*. Then a My parts row with a thumbnail, the name, a
  **Mesh** tag, a new **29 parts** tag and the overall size. A toast: *Imported feather.3mf, 29 parts,
  29,718 triangles, 51.3 × 22.9 × 6.4 mm. 58 exact duplicates skipped.* The last sentence appears only when
  there are duplicates. A refusal appears under the header in words and adds nothing. Choosing a `.step` or
  `.stp` by dropping it is refused with *STEP files are not read yet. Export 3MF or STL from your CAD
  program*. A 3MF of one object is an ordinary mesh row with no parts tag.
- **Units**: 3MF states its units, and the spec makes millimetres the default when the attribute is absent.
  **No Units control and no "Units assumed" badge** on this row. A new `unitsStated: true` param on
  `import.mesh` is what the row reads, because `unitsConfirmed` means the person chose.
- **Axes**: the file's axes are kept. 3MF is Z-up by convention, matching the document.
- **Placement**: drag from the row into the view, the existing composite drop. The **whole assembly** is
  centred in XY with its lowest point on Z = 0, and **the parts keep their positions relative to each other**.
- **Selection response**: the existing group behaviour (scenario 6), unchanged. The first click selects the
  whole model: gizmo and size over the 51.3 × 22.9 × 6.4 mm box. The second click narrows to the part under
  the pointer, with a breadcrumb such as `feather › Part 22`, that part's own read-only size, and no gizmo.
  The Objects list expands to all 29 rows, which is how a part too small to hit is reached.
- **Selection count**: unchanged. Align stays 1 or 2, booleans 2+, and a `›` on either side names the part
  measured or cut with.
- **Small-screen behavior**: same as desktop for the import. At phone width the 1.6 mm components are not
  tappable in the view, so the Objects list is the real path there. It must scroll inside its sheet, with 29
  rows, 44 px targets and no sideways page scroll.

## What a part is

- **One sub-part per placed mesh after flattening.** A build item that points at a `components` object is
  expanded down its tree, multiplying transforms.
- **Exact duplicates collapse.** Same mesh bytes and same final transform: keep one, count the rest, and say
  so in the toast. Nothing else is deduplicated. Two copies in different places are two parts.
- **Names**: the mesh object's `name`, else its nearest named ancestor, else `Part n` by order. Repeats are
  numbered: `10K 1`, `10K 2`.
- **Flat, not nested**, in one `group.assemble`. `core-076` (filed the same day) changes how grouping a
  *group* merges. This task's operands are plain solids, so it neither needs nor blocks that task, but if
  `core-076` lands first, re-read the op before building on it.

## Not in this task

- **A hole in the board is not a part.** `Board` is one mesh with holes in it, so you can reference `Board`,
  `ESP-12` or `JSTPH`, but **not one mounting hole by itself**, unlike the Raspberry Pi's hand-built `hole1`.
  Say so in the docs. A later task could look for circular loops in a mesh, but no B-rep survives to say
  what is really a cylinder.
- **Renaming a part.** With no names in the file, `Part 22` is what people will see. This is the first
  follow-up to file once the owner has used it. Clicking a part in the view and reading its size is the way
  to tell them apart until then.
- **`p:path` production-extension files**, where objects live in `3D/Objects/*.model`. Bambu Studio and
  OrcaSlicer are expected to write these (from memory; check one). Refuse in words, never import part of a
  file. It is a small follow-up once this ships.
- Colours and materials (`basematerials`, `pid`), beam lattices, slices, thumbnails: ignored, with no
  partial geometry. An extension listed in `requiredextensions` that is not understood is a refusal, as the
  spec requires.
- Reading STEP (`io-025`). OBJ and glTF.

## Documentation

- **Page**: `docs/user-library.md`, a new **Importing a model with its parts: 3MF** section. Update the
  Formats bullet (3MF is no longer "planned") and extend the STEP bullet with "or 3MF, to keep the parts".
  State plainly: not parametric, names only if the file has them, and a hole in a part is not a part. Add a
  cross-link from `docs/snap-align.md`'s part-addressing section. Update `docs/decisions/mesh-import.md`.
- **Example** (the page contains this; millimetres, Z up):
  1. Download `2821 Adafruit ESP8266 Feather.step` from Adafruit's CAD parts repository, open it in FreeCAD,
     and export it as 3MF.
  2. In WarpCad, open the Library, tap **Import model file…**, and choose the `.3mf`. The row reads **29
     parts**, 51.3 × 22.9 × 6.4 mm.
  3. Drag the row into the view and release. Drag a **Cube** in beside it.
  4. Click the board once: all of it is selected. Click again on the large 24 × 16 mm module: the breadcrumb
     names that part, and the Inspector shows its own size.
  5. Hold **Shift** and click the Cube, press **⇔ Align**, and read the top line, which names the part. Tap
     the button you want. The part you addressed is what is measured.
  6. To cut a pocket for a connector, follow "Cutting with just one part" in `docs/booleans.md`.

  **Check FreeCAD's exact selection and menu steps against the real program**, and write the ones that give
  29 objects if there is such a selection. The app handles three sets either way. Fix the moving-versus-
  reference order against the running app. Name which converters were actually tried.
- **Media**: `e2e/docs/import-3mf.docs.js` produces `docs/screenshots/import-3mf-parts.png` (the Objects list
  expanded under an imported model) and `docs/media/import-3mf-align.gif` (import, drop, drill, align), both
  embedded in `docs/user-library.md`. Use the generated fixture, as `io-009` did. `e2e/docs-media.spec.js`
  guards them.

## Affected files

- `src/io/meshFormats/threeMf.js` (new, + `.spec.js`), `src/io/meshFormats/index.js`: the reader, one entry
- `src/core/zip.js` (+ `.spec.js`): read a deflated zip through its central directory
- `src/core/shareLink.js`: only to share its bounded inflate, no behaviour change
- `src/io/meshJob.js`, `src/io/meshClient.js`: an async parser, and several meshes from one file
- `src/io/meshAsset.js`: `VERDICT_MEMO_SIZE`
- `src/io/meshPart.js` (+ `.spec.js`): the assembly definition, `meshPartInfo`, `meshPartSizeMm`, `withUnits`
- `src/core/kernel/recipes/importMesh.js` (+ `.spec.js`): `matrix`, the memo key, `BUILD_MEMO_SIZE`
- `src/core/userPart.js` (+ `.spec.js`): `maxMeshAssetsPerPart`, an instanced-triangle cap, checks on `matrix`
- `src/core/kernel/group.js`: only if the hostile-name test below fails
- `src/stores/library.js`, `src/components/layout/LibraryPanel.vue`: the **N parts** tag, no Units control for
  `unitsStated`, the toast
- `src/io/__fixtures__/`: a generated 3MF
- `e2e/import-3mf.e2e.js` (new), `e2e/docs/import-3mf.docs.js` (new), `TODO/ACCEPTANCE.md` (new scenario 31)
- `docs/user-library.md`, `docs/snap-align.md`, `docs/decisions/mesh-import.md`

## Proposed fix

1. **A part may hold several meshes.** This half needs no reader and is tested with hand-built records:

   ```json
   { "op": "user.feather", "name": "feather", "version": 1, "result": "model", "params": [],
     "records": [
       { "id": "mesh-…", "op": "asset.mesh", "params": { "…": "one per distinct mesh" } },
       { "id": "p1", "op": "import.mesh", "target": "mesh-…",
         "params": { "name": "Part 6", "triangleCount": 44, "unitScale": 1, "unitsConfirmed": true,
                     "unitsStated": true, "recenter": false, "matrix": ["…16 numbers…"] } },
       { "id": "model", "op": "group.assemble", "operands": ["p1", "…"],
         "params": { "names": ["Part 1", "Part 6", "…"] } } ] }
   ```

   Five existing assumptions break here, and each one fails quietly if missed:
   - **`recenter: true` works per mesh** (`importMesh.js:143-162`), so every part would be centred on the
     origin, a pile of 29 parts. Compute one offset for the whole assembly at import and bake it into each
     `matrix`, with `recenter: false`.
   - **The build memo is keyed by mesh and placement** (`importMesh.js:133`). It must include the matrix, or
     all ten `10K`s become one resistor in one place.
   - **The memos hold too few.** `BUILD_MEMO_SIZE` is 4 and `VERDICT_MEMO_SIZE` is 8. With 13 assets every
     lookup misses, and appends fold on the main thread, so every Undo would decode and validate all of them
     again. Size them, or key them per part, and measure.
   - **`maxMeshAssetsPerPart` is 1** (`userPart.js:124`). Raise it and let `maxMeshDefinitionBytes` remain the
     real cap, so a part that passes can always be exported. One asset used by ten `import.mesh` records must
     validate.
   - **`meshRecordsOf` finds the first `import.mesh`** (`meshPart.js:88`), so `meshPartInfo` and
     `meshPartSizeMm` would report one component as the whole model. `withUnits` must refuse a stated-units part.

   `matrix` is applied after `unitScale` and holds millimetres. Use JSCAD `mat4` order, which 3MF's row-vector
   12 numbers map onto directly: `[m00,m01,m02,0, m10,m11,m12,0, m20,m21,m22,0, m30,m31,m32,1]`. A negative
   determinant must reverse triangle winding. `validateUserPart` must check it (16 finite numbers, affine,
   non-singular, bounded) because it arrives in shared part files, and it must **cap the total triangles
   across all instances**: one 250,000-triangle asset placed 499 times passes every existing check and is 125
   million triangles.
2. **Unzip with no dependency.** `readZip` handles method 0 only and walks local headers, so it cannot read this
   file. Add an async entry reader to `src/core/zip.js` that uses the **central directory**, because a writer
   may leave local-header sizes zero and use data descriptors. Support methods 0 and 8; refuse encryption and
   zip64. Bounds-check every offset, and verify the CRC. Inflate with `shareLink.js`'s `deflate-raw` routine,
   which already aborts as soon as output passes a limit. Inflate **only the start part**, never the thumbnails.
   Leave `readZip` and its callers alone.
3. **Read the model with a small scanner.** `DOMParser` is not available in a worker or in plain Node, and this
   reader runs in `mesh.worker.js`. Find the start part from `_rels/.rels` by relationship type, normalise the
   leading slash, and look it up as a key in the zip's entry list, never as a path. The scanner is linear, uses
   no backtracking regex, and handles attributes in any order, either quote, `<a/>` and `<a></a>`, a namespace
   prefix, comments and scientific notation. **It refuses `<!DOCTYPE` and `<!ENTITY`** outright, and decodes only
   the five predefined entities and numeric references, in names. Refuse a BOM-marked UTF-16 file in words.
4. **Hostile-input rules, all constants in one object** (the `MESH_LIMITS` pattern). The document stores the
   validator's output, never the upload.
   - The 25 MiB read cap stays, checked before reading. Add a limit on inflated XML; 64 MiB gives ample room (the
     Feather runs about 70 bytes per triangle, so the 250,000-triangle cap needs about 18 MB). Cap entry count.
   - **Nested `components` are a bomb.** Ten levels of ten references is 10^10 instances from a few hundred bytes.
     Detect cycles, cap depth at 8, and count instances **while expanding**, stopping at the `maxRecords` limit with
     a refusal, not after. Refuse a reference to an id that does not exist.
   - Every mesh goes through `weldMesh` and `validateMeshAsset`. Vertex indices in range, coordinates finite and
     within the existing magnitude cap. `MESH_LIMITS.maxTriangles` applies to the expanded total.
   - Import `type="model"` objects, the default, and skip `support` and the rest, saying so in the toast. A build
     with nothing left is a refusal.
   - **Names are hostile strings.** Strip control characters, cap at `maxNameLength`, number duplicates. `add()` in
     `group.js` does `parts[partName] = object` on a plain object (`group.js:641,657`), so a part named `__proto__`
     would vanish silently. Test it, and fix it there if so. Names reach the assistant through `describe_scene`,
     where they are data, never instructions (`docs/decisions/ai-partner.md`).
5. **The parser contract grows.** `parseMeshFile` is synchronous and returns one `{ positions, indices }`. Let a
   parser return a promise, and a result of `{ parts: [{ name, positions, indices, matrix }], unit, skipped }`.
   `mesh-import.md` says of new formats that "nothing downstream changes". That stays true for single meshes, and
   this is the stated exception. Weld each mesh separately. Keep supersede-not-queue and the main-thread fallback.
6. **Library decision in `docs/decisions/mesh-import.md`**, per `CLAUDE.md`. Recommendation: hand-rolled, no
   dependency, for the same reason as STL, and because inflate is already in the app. Figures gathered 2026-11-02;
   re-gather them, and get open and closed issue counts (the † figures are GitHub's combined count including PRs):

   | Option | Version (last publish) | Licence | Unpacked | Stars | Issues † | Why it would lose |
   |---|---|---|---|---|---|---|
   | Hand-rolled scanner + existing inflate | n/a | ours | small | n/a | n/a | Recommended |
   | `fflate` | 0.8.3 (2026-07) | MIT | 797 KB | 3,078 | 56 | Good library, but `DecompressionStream` is already in use in all three engines |
   | `@zip.js/zip.js` | 2.24.0 (2026-10) | BSD-3-Clause | 8.7 MB | 3,905 | 1 | Far more than one read needs |
   | `saxes` | 6.0.0 (2022-05) | ISC | 164 KB | 86 | 26 | Last publish 2022 |
   | `fast-xml-parser` | 5.11.2 (2026-09) | MIT | 1.3 MB | 3,140 | 36 | Builds a tree; a 250 k-triangle file is millions of objects |
   | `@jscad/3mf-deserializer` | 3.0.0-alpha.0 (2026-08) | MIT | 372 KB | not gathered | not gathered | Alpha only, per `mesh-import.md`; read its handling of hostile input |
   | three.js `3MFLoader` | in `three` 0.186.1 | MIT | 0 | n/a | n/a | Needs `DOMParser` and three's scene types, so it cannot run in this worker |

## Effort

L. Splits cleanly for `/fix-todo`: (a) multi-mesh parts, with no visible control and no reader; (b) zip reader,
scanner and format entry; (c) Library UI, docs, e2e and scenario 31.

## Testing

- **Unit, part model** (`meshPart.spec.js`, `importMesh.spec.js`, `userPart.spec.js`): an assembly definition validates
  and round-trips through the part file; ten `import.mesh` records on one asset give ten solids at ten transforms
  (`toBeCloseTo`, 1e-6 mm) with one decode; a quarter turn with `2.22045e-16` terms; a mirrored instance keeps outward
  winding; the assembly's bounds are centred with minimum Z = 0 and relative offsets unchanged; `meshPartInfo` and
  `meshPartSizeMm` report the whole. Refusals: a non-finite, wrong-length, singular or non-affine `matrix`; an
  over-cap definition; instanced triangles over the cap.
- **Unit, zip** (`zip.spec.js`): deflated and stored entries; a data-descriptor entry with zero local sizes; a truncated
  file; a central-directory offset past the end; encrypted and zip64 refused; a CRC mismatch; a deflate bomb stops at the
  limit without allocating the rest; a thumbnail entry is never inflated.
- **Unit, reader** (`threeMf.spec.js`): the FreeCAD shape (three coincident sets of three unnamed objects, 12-number
  transforms, leading-slash start part) gives three parts and six duplicates skipped; units from micron to foot, and
  absent; named objects; `components` flattened with multiplied transforms; one object gives one mesh, no group.
  Degenerate and hostile cases: an empty file; a zip with no 3MF relationship; a relationship target naming a missing
  entry or `../x`; `<!DOCTYPE` and `<!ENTITY`; a component cycle; ten-by-ten nested components (must stop fast, assert on
  time and on instances counted); an out-of-range index; NaN and huge coordinates; an empty `build`; a `p:path`
  reference; an unknown `requiredextensions`; a text file named `x.3mf`; names `__proto__`, `constructor`, empty, 10 KB,
  control characters, and `MCP73831T-2ACI/OT` with its slash.
- **Fixture**: generated in `src/io/__fixtures__/` and shaped like the FreeCAD file: a box and a plate, the box placed
  twice with a quarter turn, the whole set written three times, deflated. **Do not commit the owner's file.**
- **E2e** (`e2e/import-3mf.e2e.js`, navigates to `/`): import the fixture through the real input; assert the row, the
  **parts** tag, the toast's duplicate count, and no Units control; drag it in with a real mouse and, at phone and tablet,
  trusted touch; first click selects the whole, second narrows with a breadcrumb and the part's own size; Align a cube
  against a part and assert the position to 0.01 mm; Subtract using one part and assert one body with a pocket; reload,
  and assert parts and cut remain; **File ▸ New**, and assert the part remains in My parts. Refusals: `x.3mf` as text, a
  `.step` dropped on the panel, a file over a cap.
- **Viewports**: all three, with a snapshot at each (the Objects list and tags wrap differently in a sheet).
- **Engines**: all three. Worker, `DecompressionStream` inside a worker, canvas thumbnail, IndexedDB, and a file input whose
  behaviour differs per engine. Reuse `ui-055`'s fix for the hidden input.
- **Perf** (`.claude/prompts/perf-benchmark.md`; record in `mesh-import.md`): reading the owner's 6.26 MB model holds the
  main thread to the 16 ms frame budget; first drop; **Undo** re-fold with the memos sized; first selection of the whole
  group. `measureGeometry` runs a real union for a composite's volume (`kernel/measure.js`), and 29 touching meshes are a
  new worst case for it. Measure it, and if selecting the Feather stalls, that blocks this task. Same for exporting and for
  subtracting the whole assembly.
- **New acceptance scenario 31 in `TODO/ACCEPTANCE.md`**, "Import a 3MF and use one part as a reference", written from the
  Documentation example and **driven by hand with the owner's real file**, `~/Downloads/esp8266 feather.3mf`. Expect 29
  parts, not 87; a toast naming 58 duplicates; 51.3 × 22.9 × 6.4 mm; `Part 1` reading 50.8 × 22.86 × 1.57; `Part 22` reading
  24 × 16 × 2.95 and sitting on the board at Z = 1.57; every `10K` in its own place and none at the origin. *Drive it
  differently*: drop the row, Undo, drop it twice, and check the second copy is whole; choose a second file during the
  first read; pick a 1.6 mm part from the Objects list at phone width. Export the assembly and report open edges, naming
  `JSTPH` and `KMR2`.
- **Acceptance scenarios to re-drive**: 26 (STL import unchanged: the loudest regression), 3 (renders complete, not partial),
  6 (group versus sub-part selection), 5 (a boolean with one part), 1, 8 (a hostile file in a project), 10 (save and reload),
  11 (export), and share links if `shareLink.js`'s inflate moves.
- **Closed findings whose repros must be re-run**: `io-004` and `io-006` (STL export open edges: export this part, whole and
  part by part), `core-053` (export refold), `ui-016` (breadcrumb step-up), `ui-055`'s three (popover below the window,
  Inspector tab covering the last My parts row, hidden input growing the page), `ui-042` (per-part group meshes, which this
  leans on harder than anything has).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

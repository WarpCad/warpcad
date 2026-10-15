# Importing a model file: a hand-rolled STL parser, an `asset.mesh` record, and a mesh part

`TODO/io-009`. Status: **accepted** (2026-10-15).

## The decision in one paragraph

**Import model file…** reads STL with a **hand-rolled parser** (`src/io/meshFormats/stl.js`,
about 300 lines with its doc comments and ASCII tokenizer), in a worker (`src/io/mesh.worker.js`). The
parser's output is welded into shared vertices and stored as an **`asset.mesh` record**:
plain JSON holding a canonical little-endian buffer in base64, validated by
`src/io/meshAsset.js` at import, at load, on a local append and in the kernel. The import
becomes an ordinary **`user.<slug>` library part** whose records are
`[asset.mesh, import.mesh]` (`src/io/meshPart.js`). The `import.mesh` op
(`src/core/kernel/recipes/importMesh.js`) builds the `Geom3`. No dependency is added.

## Why a parser of our own

STL is small enough that the parser costs about the same either way. What matters is that a
binary STL's header carries a **uint32 triangle count anyone can set**, and the parser is the
only code that ever sees the raw bytes. The rule this project needs is *check
`80 + 4 + 50·n = byteLength` before allocating anything for `n`*. That rule also settles the
classic sniffing trap: many exporters write `solid` at the start of a *binary* header, and a
file that satisfies the equation is binary whatever its header says. Read the two candidates
below with that rule in mind.

## Options compared

Data gathered 2026-10-15 from npm and the GitHub API. "Issues" counts issues only, not PRs.

| Option | Version (released) | Unpacked size | Licence | Maintainers | Stars | Issues open / closed | Runtime deps | Core-safe? |
|---|---|---|---|---|---|---|---|---|
| **Hand-rolled** (`src/io/meshFormats/stl.js`) | n/a | ≈ 300 lines (≈ 11 KB) of source | AGPL-3.0-or-later (ours) | this project | n/a | n/a | none | yes |
| `@jscad/stl-deserializer` | 2.1.30 (2026-02-22); 3.0.7-alpha.0 (2026-08-02) | 41 KB | MIT | 4 | 3,256 (OpenJSCAD.org monorepo) | 143 / 498 | `@jscad/io-utils`, `@jscad/modeling` | yes (no DOM) |
| three.js `STLLoader` (`three/examples/jsm`) | 0.186.1 (already a dependency) | 0 KB added | MIT | 2 | 116,447 | 252 / 13,630 | `three` | **no** (imports three's scene types) |
| `stl-parser` | 0.12.0 (2026-04-30; the previous release was 2016) | 32 KB | MIT on npm, no licence on the repo | 3 | 9 | 3 / 18 | `chai`, `chalk`, `yargs`, `typescript`, … at **runtime** | yes |
| `parse-stl` | 1.0.2 (repo last pushed 2015) | small | MIT | 1 | 10 | 0 / 0 | `parse-stl-ascii`, `parse-stl-binary` | yes |
| `@loaders.gl/*` | 4.5.4 (2026-10-13) | 762 KB for core | MIT | 8 | 854 | 8 / 514 | several | yes, but there is **no STL loader** (`@loaders.gl/stl` is a 404). It ships OBJ. |

What reading the two serious candidates' source found:

- **`@jscad/stl-deserializer` 2.1.30.** The binary path reads `totalTriangles` from the header
  and loops `for (tr = 0; tr < totalTriangles; tr++)` with no length check, so a lying count
  reads past the end. It decides binary vs ASCII by converting the **whole file** to a string
  one `String.fromCharCode` at a time and running a vertex regex over it. On a 25 MB file
  that is a 25 M-step string build before parsing starts. Its default `output` is `'script'`:
  it **generates JavaScript source**, which is the opposite of "a part is data, not code"
  (`docs/decisions/user-library.md`). `output: 'geometry'` avoids that. Its ASCII path runs
  `stl.match(/facet…endloop/g)` over the whole file once per `endsolid`-separated chunk, so a
  multi-solid file is read once per solid. It is a reasonable library for scripts, but it is
  not built for hostile input.
- **three.js `STLLoader` 0.186.1.** It checks the length equation first, which is the right
  shape. When the equation fails and no `solid` appears near the start, it still treats the
  file as binary and allocates `new Float32Array(faces * 9)` **from the untrusted header**:
  a 1.8 GB attempt for a count of 50 M, or a `RangeError` throw for a larger one. It also imports `BufferGeometry`,
  `Float32BufferAttribute`, `Loader`, `Vector3` and `FileLoader` from `three`, and `src/core/`
  and the worker job must not import three (`CLAUDE.md` Project Structure).

### Rejection table

| Runner-up | Why it lost |
|---|---|
| `@jscad/stl-deserializer` | It trusts the header's triangle count. It sniffs with a whole-file string build and regex, and its ASCII path rereads the file per solid. Its default output is generated JS source. Wrapping it safely means doing the length check ourselves, which is most of a parser, and then pulling in two packages for the rest. |
| three.js `STLLoader` | It sizes an allocation from the untrusted header when the equation fails. It also couples the parser to three's scene types, so it can't run in `src/core`'s kernel path or a plain-Node test. Its render-side home is the wrong side of the worker boundary for a validator. |
| `stl-parser` | Its runtime dependencies are dev tools (`chai`, `chalk`, `yargs`, `typescript`), so it would multiply the licence surface for one parser. The repository has no licence, and it went ten years between releases. |
| `parse-stl` | One maintainer, untouched since 2015, and split across two more packages with the same review burden. |
| `@loaders.gl` | No STL loader exists. Its OBJ loader is the one to look at again for the OBJ follow-up below. |

None of these is needed to pass `npm run licenses`: the chosen option adds **no dependency**.

## The record

```json
{ "id": "mesh-<24 hex of SHA-256>", "op": "asset.mesh",
  "params": { "vertexCount": 8, "triangleCount": 12, "dataBase64": "…" } }
```

- `dataBase64` is one little-endian buffer: `vertexCount × 3` float32 positions, then
  `triangleCount × 3` indices. Indices are uint16 while `vertexCount ≤ 65 536` and uint32
  above that. The width follows from the count, so it is not a field that could disagree.
- The id is a content hash of that buffer, so importing the same file twice gives the same record.
- Any other field is a refusal. That includes `target`, `operands` and a URL.

The part an import becomes:

```json
{ "op": "user.bracket", "name": "bracket", "version": 1, "result": "model", "params": [],
  "records": [
    { "id": "mesh-…", "op": "asset.mesh", "params": { … } },
    { "id": "model", "op": "import.mesh", "target": "mesh-…",
      "params": { "name": "bracket", "triangleCount": 12, "unitScale": 1,
                  "unitsConfirmed": false, "recenter": true } } ] }
```

**Deviation from the TODO's sketch.** The TODO wrote `import.mesh` as
`{ assetId, unitScale, recenter }`. The asset is referenced through **`target`** instead,
because that is how the fold resolves one record's value for another (`kernel/index.js`).
`userPart.js`'s "refers only to an earlier record of this part" check then covers it for free.
`name` and `triangleCount` are display-only, for the History row
("Imported mesh bracket (12,408 triangles)"). `unitsConfirmed` turns the Library's
"Units assumed: mm" badge off.

**Where the record folds.** Inside a part, `asset.mesh` is a kernel registry entry whose
build validates and decodes into a mesh value: not a solid, never named, and only
`import.mesh` may consume it (`userPart.js` refuses any other consumer). At the **top level**
of a document, `asset.mesh` is a data record, exactly like `asset.image`. A local append
validates it loudly, it is never folded and never a body, and it is listed by
`document.meshAssets()`. It is kept out of `assets()` because that list's readers (the
assistant's photo tools, the sketch editor) treat every entry as a photo. A top-level
`import.mesh` aimed at a top-level asset is not wired, because every import goes through a
part.

## Hostile-input caps (`MESH_LIMITS`, enforced in code)

| Cap | Value | Where |
|---|---|---|
| File read | 25 MiB, checked against `file.size` before reading | `meshJob.js`, `stl.js` |
| Triangles | 250,000 (binary: checked right after the length equation, before allocating) | `stl.js`, `meshAsset.js` |
| Vertices in a record | 750,000 | `meshAsset.js` |
| Coordinate magnitude | ±1,000,000 file units; NaN and ±Infinity refused | `stl.js`, `meshAsset.js` |
| Stored mesh | **5 MiB** before base64 (≈ 6.99 M characters) | `meshJob.js`, `meshAsset.js` |
| ASCII token length / count | 64 characters / 21 per facet at the cap, plus 4,096 | `stl.js` |
| Indices | every one `< vertexCount` | `meshAsset.js` |
| Degenerate-only mesh | refused; zero-area triangles are dropped by the weld | `meshAsset.js` |
| Meshes per part | 1 (`USER_PART_LIMITS.maxMeshAssetsPerPart`) | `userPart.js` |
| Part definition | 1,000,000 characters **not counting mesh data**, and 7,500,000 with it (`maxMeshDefinitionBytes`) | `userPart.js` |

The TODO suggested 10 MB stored. That is lowered to 5 MiB so a mesh at the cap still fits in a
part file. 6.99 M characters of base64 plus the definition's records plus a 64 K thumbnail
stays under `MAX_PART_FILE_CHARS` (8 M), so **Export part file** never writes a file that
**Import part file…** refuses. A 250 k-triangle closed mesh welds to about 125 k vertices,
which is 5.99 M characters, inside the cap.

## The weld

The weld radius is `1e-5 ×` the bounding-box diagonal (`WELD_TOLERANCE_RATIO`). A vertex joins
the first earlier vertex within that **Euclidean** distance, found through a grid of
radius-sized cells and their 26 neighbours. So two corners 0.9× the radius apart always weld
and two 1.1× apart never do, wherever the cell boundaries fall (both are tested). Coordinates
are kept, not rounded, and `-0` is stored as `0` so equal meshes hash equally. Triangles left
with no area are dropped and counted (`droppedTriangles`). A cube's 36 STL corners weld to 8.

`import.mesh` gives every polygon **the same vertex arrays** wherever the weld shared them.
That way the export repair (`kernel/watertight.js`, run by `export.js`) sees closed edges. It
does not run that repair itself, because the repair is for serialization only and must not
feed a boolean. An imported cube, and a sloppy one whose duplicate corners sit up to 0.69× the
radius apart, both export with **zero open edges** (`io-004`'s criterion).

## Measured

Node 24.14.1 on the development laptop (Apple silicon), best of several runs, with a
generated wavy grid.

| Step | 100,352 triangles (5.0 MB file) | 249,218 triangles (12.5 MB file) | Thread |
|---|---|---|---|
| Parse (binary) | 1.9 ms | — | worker |
| Weld | 114 ms | — | worker |
| Whole import (parse, weld, encode, hash, validate) | 134 ms | 355 ms | worker |
| Stored size | 1.61 M base64 chars | 5.99 M base64 chars | — |
| Validate, cold, on load | 4.3–6.4 ms | 14.5 ms | main (once per mesh; memoised by its data string) |
| `import.mesh` build, cold | 0.8–8.6 ms | 3.6 ms | wherever the fold runs |

The main thread does no parsing, so the 16 ms frame budget holds while a file is read.

### In the browser, 100,352 triangles (5.0 MB file), Chromium, dev server

Measured with `PerformanceObserver('longtask')` and a `requestAnimationFrame` gap recorder
(`.claude/prompts/perf-benchmark.md`), the file chosen by path (Playwright's in-page
`setInputFiles` of a 5 MB buffer is itself a 140 ms task and is excluded). "Before" is the
same code with the worker blocked, so the importer's main-thread fallback runs the parse.

| | Longest frame gap | Long tasks (> 50 ms) | Choose file → row visible |
|---|---|---|---|
| Idle (control) | 17 ms | none | n/a |
| Before: parse on the main thread (fallback) | 133 ms | 150 ms | 219 ms |
| After: parse in the worker, thumbnail at 12,000 faces after a yield | **17 ms** | **none** | 231 ms |

The first version of the worker path measured a 50 ms gap: the one-off thumbnail (a painter's
algorithm over up to 40,000 faces, 42 ms) ran in the same task as the library re-read. The
fix is two lines in the store: yield one task before drawing it, and give a mesh part's
thumbnail a 12,000-face budget (`renderPartThumbnail`'s new `maxFaces`; the default is still
40,000, so no other part's picture changes). A 96 px picture cannot show more.

### The hosted backend, ~4 MB project (`io-002`'s large-blob path)

`hostedBackend.spec.js` now writes and reads a project holding a real imported 180,000-triangle
mesh part (4.3 million characters, over the Contents API's 1 MB read line). The write is one
PUT carrying all of it; the read goes through the blob endpoint, returns the text byte for
byte, and parses with no warnings and the part's mesh intact.

What remains on the main thread is the cold **validate** on project load and the placement
fold (`docs/decisions/kernel-evaluation-worker.md`: appends fold on the main thread with a
fold cache). Both are one-off per mesh: the decode is memoised by data string and the build by
decoded value and placement, so a re-fold (undo, a drag commit) reuses the same `Geom3`. The
render-side tessellation of a 250 k-triangle body is the next cost to measure. That is out of
scope for this record.

## Formats beyond STL (sized, not built)

Each one is a new parser to the same `{ positions, indices }` contract, plus one entry in
`src/io/meshFormats/index.js`. Nothing downstream changes.

| Format | Size | Notes |
|---|---|---|
| **OBJ** | S | Text with no units. Faces can be quads or n-gons: fan-triangulate and say so. Drop materials and textures with a note. Options are `@jscad/obj-deserializer` 2.0.33 (MIT, same 4 maintainers, same review questions as the STL one), `@loaders.gl/obj` 4.5.4 (MIT), or hand-rolled with the same tokenizer. Re-run this health check when it is picked up. |
| **3MF** | M | A zip of XML (`src/core/zip.js` exists). It **carries units** and several objects, so it is the one format where the Units control can default correctly. `@jscad/3mf-deserializer` is 3.0.0-alpha only (it pulls `saxes` and `fflate`). |
| **glTF / .glb** | M | Already exported (`io-003`). Importing it is a render-side loader question (three's `GLTFLoader` or a hand parse), meshes only, with no scene graph. |
| **STEP / IGES / BREP** | **out of scope** | These are exact B-rep, not meshes. Reading them needs a full B-rep kernel (OpenCascade in WASM, tens of MB), which the committed mesh-CSG kernel can't stand in for. If that is ever wanted, it is a kernel decision (`geometry-kernel.md`), not an import task. "STEP doesn't work" is not a bug. |

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

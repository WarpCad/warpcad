# Persistence and export: `idb`, no-library File System Access, hand-rolled `fetch`, split export path

Status: **Committed**. Resolves the four dependency questions M6 is blocked on
(`TODO/data-001`), so `io-001`, `io-002`, `io-003`, `ui-033` and `ui-034` can name real
modules instead of "whichever `data-001` picks."

This is a **genuinely new decision, not a re-check**. Unlike
`docs/decisions/geometry-kernel.md` (which had to weigh direct `manifold-3d` experience)
or `docs/decisions/rendering.md` (which re-ran a carried-forward default), nothing in
either previous attempt reached persistence or export, so there is no prior-attempt
experience to factor in and none is invented here.

All figures below were measured or pulled on **2026-09-18**, the day this decision was
made. Bundle numbers are **measured locally with esbuild**, not quoted from a size
service — see [Sources](#sources) for the exact method. Anything not verified is marked
**unverified** rather than estimated.

---

## Sub-decision 1 — IndexedDB wrapper: **`idb` 8.0.3**

`io-001` needs to read one action log on startup and write it back, debounced, on every
mutation; `io-002` needs to store a token; the `storage/` component category
(`CLAUDE.md`) anticipates a **project browser**, which means listing projects with
metadata, not just fetching one blob.

### Options compared

| | **`idb`** | `idb-keyval` | `Dexie.js` | Raw `indexedDB` |
|---|---|---|---|---|
| npm version / published | **8.0.3** · 2025-05-07 | 6.3.0 · 2026-07-08 | 4.4.6 · 2026-09-10 | — (platform API) |
| Last repo push | 2025-05-07 | 2026-07-08 | 2026-09-10 | — |
| GitHub stars | 7,412 | 3,244 | **14,590** | — |
| Forks | 383 | 150 | 711 | — |
| Open / closed issues | 46 / 215 | 18 / 104 | 576 / 981 | — |
| Open-issue ratio | 17.6% | **14.8%** | 37.0% | — |
| Contributors (first page) | 31 | unverified | 100+ | — |
| npm maintainers | 1 (`jaffathecake`) | 1 (`jaffathecake`) | **2** | — |
| Weekly downloads | **22,437,802** | 8,091,994 | 2,076,988 | — |
| Unpacked size | 82.8 KB | 55.8 KB | 3.24 MB | — |
| **Measured min+gzip** | **1,367 B** | not measured¹ | 32,714 B | **0 B** |
| License | ISC | Apache-2.0 (npm) / `NOASSERTION` (GitHub) — **unverified** | Apache-2.0 | — |
| Schema versioning / upgrade hook | Yes (`upgrade()`) | Fixed, single store | Yes (declarative) | Manual |
| Secondary indexes | Yes (passthrough) | No | Yes | Yes |

¹ Not separately bundled: `idb` already measured at 1.4 KB, and the delta to `idb-keyval`
is under a kilobyte either way — small enough that it could not decide this, so measuring
it precisely would be false rigor.

### Why `idb`

The honest framing is that **this is a small decision wearing a large decision's
clothes**, and the deciding factor is not size — every candidate except Dexie is within
about a kilobyte of every other.

What `idb` actually buys, for 1.4 KB gzip, is the promise conversion around
IndexedDB's event-based API. That matters more than ergonomics here because of one
specific footgun: an IndexedDB transaction **auto-closes when the event loop yields**,
so `await`-ing any non-IDB promise inside a transaction silently aborts it. Hand-rolled
IDB code gets this wrong routinely, and the failure mode is exactly the one
`CLAUDE.md`'s Verification section is most hostile to — a write that appears to succeed
and silently didn't. `idb` wraps transactions in a `done` promise that makes the
lifetime explicit instead of implicit.

The raw-API option was taken seriously, because `src/stores/settings.js` establishes a
real precedent for a hand-rolled try/catch boundary and "no new dependency" genuinely is
this project's default instinct. It loses on an asymmetry worth stating plainly:
`localStorage` is a **synchronous three-method** API, so its boundary is 20 lines and
the precedent transfers cheaply. IndexedDB is an **asynchronous, event-driven,
versioned** API whose equivalent boundary is a few hundred lines with the transaction
trap above sitting inside it. The `settings.js` pattern is still followed — `io-001`
still owns a try/catch boundary that degrades to "nothing persisted, app still
functions" — it just sits on top of `idb` rather than on top of raw request events.

### The one real concern, recorded rather than smoothed over

**`idb` has not shipped or been pushed since 2025-05-07 — about 16 months.** It also has
a **single npm maintainer**. Under `CLAUDE.md`'s Library-decisions rule this is exactly
the kind of metric that must be re-checked when a dependency becomes load-bearing rather
than waved through at selection.

The mitigating facts, which are why this is a caveat and not a rejection: 22.4M weekly
downloads (more than `three` itself), 82.8 KB unpacked across 13 files, ISC-licensed,
and a **finished** problem domain — IndexedDB is a frozen platform API, so "no commits"
here reads far closer to *complete* than to *abandoned*. The surface this project uses
(`openDB`, a transaction, `get`/`put`) is a few hundred lines that could be vendored
outright if the package were ever pulled.

**Re-check trigger**: if `io-001` needs anything beyond `openDB`/`get`/`put`/`delete`, or
if a browser ships an IndexedDB change `idb` hasn't tracked, re-run this health check
before building on it further.

### Rejection table

| Rejected | Specific reason |
|---|---|
| **`idb-keyval`** | The right *shape* for today's access pattern (one key, one blob) and the smallest option, by the same author. It loses on the next six months rather than on today: it deliberately exposes no `upgrade()` hook and no secondary indexes, and `CLAUDE.md`'s `storage/` component category already names a **project browser** — listing projects by name and modified date is an object store with an index, which is precisely what this package declines to offer. Choosing it means migrating to `idb` later anyway, at the moment a document-format migration is also due. Its licence metadata is also inconsistent (Apache-2.0 on npm, `NOASSERTION` on GitHub) — minor, but unresolved. |
| **`Dexie.js`** | **24× the bundle** (32,714 B vs 1,367 B measured) for an ORM layer this app does not want: queryable tables, live queries, and a sync/cloud product. WarpCad's document is an **append-only NDJSON action log** (`docs/decisions/document-sync.md`) replayed by a pure fold — there is nothing to query. It also has the weakest issue hygiene of the four (576 open / 981 closed = 37.0%, versus `idb`'s 17.6%), and its liveliest features point toward Dexie Cloud sync, which would re-open the multi-writer question `document-sync.md` deliberately deferred. Best-maintained option on paper (2 maintainers, pushed within the week); rejected on fit and weight, and that tradeoff is recorded rather than argued away. |
| **Raw `indexedDB`, no wrapper** | Genuinely the closest to this project's existing style, and cheapest in dependencies — but the `settings.js` precedent it appeals to is a *synchronous* 3-method API, and IndexedDB is not that. The transaction-auto-close-on-yield trap above is a silent-data-loss bug class that 1.4 KB removes outright. Rejected on risk, not on effort. |

---

## Sub-decision 2 — File System Access: **no library; feature-detect, with a first-class download/upload fallback**

This is a browser API, not a package, so the real question is the fallback — and the
support data makes that question much more load-bearing than "Chromium-only" suggests.

### Measured support (caniuse + MDN, 2026-09-18)

| Engine / platform | `showSaveFilePicker` / `showOpenFilePicker` | Origin Private File System |
|---|---|---|
| Chrome / Edge desktop | ✅ 105+ | ✅ |
| Firefox desktop | ❌ never — Mozilla's published position is **"harmful"** | ✅ |
| Safari desktop (through 27.1+) | ❌ | ✅ 15.2+ |
| Safari iOS (through 27.2) | ❌ | ✅ |
| **Chrome for Android** | ❌ | ✅ |
| Firefox / Samsung Internet Android | ❌ | ✅ |
| **Global support** | **30.85%** | broad |

### The finding that actually shapes the design

**File System Access is not "Chromium-only" — it is *desktop*-Chromium-only.** Chrome
for Android does not expose the pickers either.

Set that against `CLAUDE.md`'s Responsive Layout mandate — phone (390×844) and tablet
(820×1180) are first-class targets, designed for *first* — and the conclusion inverts the
usual framing:

> **The fallback path is the primary path.** On every phone and tablet this project
> commits to supporting, and on two of the three engines it commits to supporting, the
> fallback is the *only* path. FSA is the progressive enhancement, available to roughly
> 31% of users, all of them on desktop.

That is the opposite of how this is normally scoped ("build FSA, add a fallback later"),
and building it in the normal order would have shipped a Save button that does nothing
on an iPad — a close cousin of the second attempt's stop note (*"I tried to keep up on my
iphone and ipad... nothing really worked"*). `io-001` should therefore build and test the
fallback **first**, and treat FSA as an enhancement layered on after.

### The chosen mechanism

- **Feature-detect** `typeof window.showSaveFilePicker === 'function'`, never a UA sniff.
- **Enhanced path (desktop Chromium)**: `showSaveFilePicker` / `showOpenFilePicker`,
  retaining the `FileSystemFileHandle` so a subsequent Save rewrites the same file with
  no second prompt.
- **Fallback path (everything else)**: Save is an `<a download>` on a `Blob` object URL;
  Open is a hidden `<input type="file">`. Both are universally supported, need no
  dependency, and require a secure context no more than FSA already does.

### The UI constraint this places on `ui-033`, stated here so it isn't discovered late

The two paths are **not semantically equal**, and the UI must not pretend otherwise:

| | FSA path | Fallback path |
|---|---|---|
| "Save" over the same file | Yes — handle retained | **No** — every save is a new download |
| Overwrite in place | Yes | No (browser dedupes to `project (1).ndjson`) |
| "Open recent" by handle | Possible | No |

So a **"Save"** control that silently becomes "download another copy" on Safari is a
mislabel. `ui-033` should either label the control by what the active path can actually
do, or expose only **"Save As…" / "Open…"** — which are honest on both paths — and gate
any true in-place Save on the capability check. Recorded as a constraint on `ui-033`, not
a suggestion.

### Rejection table

| Rejected | Specific reason |
|---|---|
| **A ponyfill (e.g. `use-strict/file-system-access`)** | Its non-Chromium adapters ultimately fall back to the *same* `<a download>` / `<input type="file">` mechanism written by hand above, or else to sandboxed IndexedDB/OPFS storage the user cannot see in their own file manager. So it adds a dependency, and an API-shape illusion that a real `FileSystemFileHandle` is present when it isn't, to deliver a path this project can write in ~30 lines. Worse, the illusion actively obscures the semantic gap the table above says the UI must surface. |
| **Origin Private File System as the Save-As target** | Tempting because support is near-universal (Safari 15.2+, Firefox, Chrome Android) — but OPFS is **origin-sandboxed and invisible to the user's own file manager**, so it cannot satisfy "hand this file to someone else or back it up outside the browser," which is `io-001`'s stated goal. It is also redundant with the IndexedDB autosave chosen above, which already covers local durability. Not rejected on quality — rejected because it solves durability, and this sub-decision is about *portability*. |
| **FSA only, no fallback ("Chromium-only")** | Ships a dead control on 69% of users, every phone, every tablet, and two of three committed engines. Directly contradicts `CLAUDE.md`'s Browser Support and Responsive Layout sections. |

---

## Sub-decision 3 — Hosted git-backend client: **hand-rolled `fetch`**

### Options compared, with measured browser cost

| | **Hand-rolled `fetch`** | `@octokit/core` | `@octokit/rest` | `octokit` (full) |
|---|---|---|---|---|
| npm version | — | 7.0.8 | 22.0.1 | 5.0.5 |
| **Measured min+gzip** | **0 B** | 7,953 B | 21,410 B | **43,769 B** |
| As % of current app bundle (262.67 KB gzip) | 0% | 3.0% | 8.2% | **16.7%** |
| GitHub stars (`octokit/octokit.js`) | — | 7,847 | 7,847 | 7,847 |
| Open / closed issues | — | 47 / 987 (**4.5%** open) | same | same |
| Contributors (first page) | — | 43 | 43 | 43 |
| npm maintainers | — | 3 | 1 (`octokitbot`) | 2 |
| Weekly downloads | — | unverified | 18,312,906 | 3,950,659 |
| Last repo push | — | 2026-09-18 (same day) | same | same |
| License | — | MIT | MIT | MIT |

**Octokit is a healthy, well-maintained project** — a 4.5% open-issue ratio is the best
of any library in this document, and the repo was pushed the same day this check ran.
It is rejected on fit and weight, not on health.

### Why hand-rolled

The entire hosted-backend surface `io-002` describes is **three REST endpoints**:

| Need | Endpoint |
|---|---|
| Read the project file + its blob SHA | `GET /repos/{owner}/{repo}/contents/{path}` |
| Write it back, refusing a stale overwrite | `PUT /repos/{owner}/{repo}/contents/{path}` with `sha` |
| Validate the token / list repos (optional) | `GET /user/repos` |

Three things follow:

1. **The conflict behaviour `io-002` needs is a property of the API, not of the client.**
   GitHub's Contents API takes the last-known blob `sha` on `PUT` and rejects a stale one
   with **409 Conflict**. That *is* the "refuse to silently overwrite" semantic
   `io-002` specifies and that `docs/decisions/document-sync.md` names as its revival
   condition — available identically to `fetch` and to Octokit. Octokit adds nothing here.
2. **The ergonomics Octokit is bought for do not apply.** Pagination is its headline
   feature; a single file at a known path has no pages. Throttling and abuse-retry plugins
   target high-volume automation, not a human pressing Save. Its auth strategies are built
   for GitHub Apps and OAuth flows; this is one PAT in an `Authorization` header.
3. **43,769 B gzip is 16.7% of the entire current app bundle** for those three calls —
   the real number `data-001` asked for rather than a hand-wave. Even the minimal
   `@octokit/core` is 7,953 B, and still brings a plugin/hook architecture this use has no
   need for.

### What hand-rolling actually costs, stated honestly

Not zero. This code must handle explicitly what Octokit normalizes: **401** (bad token),
**403** (rate limit / insufficient scope — and these are *different* failures wearing the
same status), **404** (repo or path missing, which for a private repo is also what a
token without access returns), **409** (the conflict path above), plus base64
encode/decode of file contents, since the Contents API is base64-only.

That is perhaps 150 lines with tests. `io-002`'s own Testing section **already requires
every one of those cases** (invalid token, network failure mid-write, stale-revision
refusal), so the work is specified regardless of which client sits underneath — Octokit
would not have removed it, only renamed the errors. One genuine nuance to carry into
`io-002`: base64 of a multi-megabyte action log needs `TextEncoder` + chunked
`btoa` rather than naive `btoa(unescape(encodeURIComponent(s)))`, which breaks on large
inputs and non-Latin-1 text.

### Rejection table

| Rejected | Specific reason |
|---|---|
| **`octokit` (full)** | 43,769 B gzip measured — **16.7% of the current app bundle** — to call three endpoints. Bundles the REST client, GraphQL client, webhooks, OAuth app support, and pagination/retry/throttle plugins; this app uses none of them. Health is excellent and is not the reason it loses. |
| **`@octokit/rest`** | 21,410 B gzip, still 8.2% of the bundle, and still a fully typed surface over ~1,000 endpoints for the three in use. Its npm package lists a **single bot maintainer account** (`octokitbot`), which is a marginally sharper bus-factor signal than the umbrella package's two — noted for completeness, not decisive. |
| **`@octokit/core`** | The strongest runner-up at 7,953 B (3.0%), and the only one that was close. Still rejected: what it provides over `fetch` is a plugin/hook architecture and auth-strategy indirection, and this client needs neither. Three `fetch` calls with explicit status handling are **easier to test at the boundary** (`CLAUDE.md`: "always mock at the boundary... never a real network") than a plugin chain is to mock faithfully. |

**Re-check trigger**: if the hosted backend ever grows beyond single-file read/write —
listing many repos with pagination, git-tree or blob APIs for multi-file projects, or
OAuth device flow instead of a pasted PAT — re-run this comparison. At that point
Octokit's pagination and auth strategies start earning their weight, and this decision
should be revisited rather than defended.

---

## Sub-decision 4 — Export serialization: **split by format, and it is not a preference**

M6's v1 export scope is **STL, OBJ, and glTF**. The comparison `data-001` framed as
`@jscad/io` *versus* three.js's exporters turns out to have a factual answer that
precedes the tradeoff:

### Finding 1 — `@jscad/io` has no glTF serializer at all

Verified two ways on 2026-09-18: `npm view @jscad/gltf-serializer` returns **404 Not
Found**, and `@jscad/io`'s own dependency list contains serializers for **3mf, amf, dxf,
obj, stl, svg, x3d and json — and no glTF**.

So "`@jscad/io` for all three formats" is not an available option. glTF can only come
from three.js's `GLTFExporter`, which is already present in the installed `three@0.185.1`
and costs **no new dependency**.

### Finding 2 — for STL the two paths are measurably different, and the render path is not watertight

This is the asymmetry `data-001` asked to have stated explicitly. It was **measured
against this app's real mesh bridge** (`src/render/mesh.js`), not reasoned about.

Test solid: a 10 mm cube minus a Ø6 mm cylinder (32 segments) — the same
boolean-with-a-curved-face shape `docs/decisions/geometry-kernel.md`'s addendum used.

| | **`@jscad/stl-serializer`** | **three.js `STLExporter`** (fed by `src/render/mesh.js`) |
|---|---|---|
| Source geometry | Kernel `Geom3` (104 quads) | `BufferGeometry` from `geom3ToBufferGeometry` |
| Triangles emitted | 292 | 208 |
| Undirected edges | 438 | 362 |
| **Edges with no second face** | **0** | **100** |
| **Result** | **Closed manifold** | **NOT watertight** |
| Numeric type | double | `Float32Array` |

**Why**: `src/render/mesh.js` fan-triangulates the raw boolean output
(`sum(n-2) = 208`) and computes normals for display. That output is *correct to render* but
carries the **T-junctions BSP splitting leaves behind** — the same defect
`geometry-kernel.md`'s addendum already measured on this exact shape ("112 of 264
undirected edges (42%) have no second face"). `@jscad/stl-serializer` calls
`modifiers.generalize({ snap: true, triangulate: true })` before writing
(`@jscad/stl-serializer/index.js:63`), which repairs those T-junctions — which is exactly
why it emits *more* triangles (292) and zero unmatched edges.

A non-watertight STL is the single most common cause of a slicer refusing a model or
silently "repairing" it into the wrong solid. **This is a correctness difference, not a
size or taste difference**, and it decides STL on its own.

**A claim that does *not* hold, recorded so it is not repeated**: the float32 concern is
real in principle and negligible in practice here — measured maximum deviation across
every vertex of the test solid is **9.591e-8 mm**, about 1/10,000 of a micron, far below
any printer's resolution. Precision is **not** an argument for the JSCAD path; only
manifoldness is. (Worst coordinate: `2.1213203435596455` → `2.1213202476501465`.)

### Measured bundle cost

Marginal cost only — `@jscad/modeling` and `three` are already in the bundle, so the
honest number is the delta:

| Path | Measured min+gzip (shared dep external) |
|---|---|
| `@jscad/stl-serializer` + `@jscad/obj-serializer` | **2,363 B** |
| `@jscad/io` umbrella (all serializers **and** deserializers) | 68,211 B |
| three.js `STLExporter` | 800 B |
| three.js `OBJExporter` | 838 B |
| three.js `GLTFExporter` | 11,092 B |

Note the 29× gap in the first two rows: importing the **`@jscad/io` umbrella** drags in
every deserializer plus dxf/svg/3mf/amf/x3d for a project that needs two formats.
Importing the two serializer packages **individually** costs 2.4 KB. Install the leaves,
not the umbrella.

### The decision

| Format | Library | Source geometry | Module |
|---|---|---|---|
| **STL** | `@jscad/stl-serializer` 2.1.23 | Kernel `Geom3`/`Group` | `src/core/export.js` |
| **OBJ** | `@jscad/obj-serializer` 2.1.23 | Kernel `Geom3`/`Group` | `src/core/export.js` |
| **glTF** | three.js `GLTFExporter` (already installed) | `THREE.Mesh` from `src/render/mesh.js` | `src/render/export.js` |

STL and OBJ go through the kernel because STL's consumer is a **slicer**, where
watertightness is correctness, and OBJ comes along for free from the same kernel-side
call. glTF goes through three.js because there is no alternative — and that is
acceptable precisely because glTF's consumer is a **viewer**, where the render path's
tessellation is not merely adequate but is literally the thing being previewed.

### Amendment, 2026-09-21 (`io-005`) — **should a `.glb` be watertight at all? Yes, and it now is**

The paragraph above makes a claim that has to be separated into two: *"a glTF consumer
is a viewer, so the render mesh is the right source"*. The **source** half is still
forced — `@jscad/io` ships no glTF serializer, so there is no other path. The
**watertightness** half was an inference, and `io-005` was filed to settle it with
numbers rather than leave it inferred. **This section is the answer; it is decided, and
the next person should not re-open it.**

**What the render mesh actually measured.** Counting undirected edges not used by
exactly two triangles walking them in opposite directions (`uses === 2 && net === 0`,
the strict criterion `src/core/export.spec.js`'s `io-004` block already holds STL and
OBJ to), straight off `geom3ToBufferGeometry`'s position attribute:

| body | render mesh, before | `.glb` after `io-005` | STL/OBJ after `io-004` |
|---|---|---|---|
| Ø40×50 cylinder ∪ 40 mm cube at (-100.89, 66.93, 25) | **44 of 262** | **0 of 276** | 0 of 309 |
| a placed `hardware.bolt` (m10 hex, 30 long) | **46 of 290** | **0 of 318** | 0 of 342 |
| `raspberrypi.bplus` | **271 of 920** | **0 of 1023** | 0 of 1203 |
| `io-003`'s union (20 mm cube ∪ Ø12 cylinder) | **42 of 372** | **0 of 405** | 0 of 429 |
| `io-003`'s bored cube (10 mm cube − Ø6) | **88 of 356** | **0 of 426** | 0 of 438 |
| a plain 10 mm cuboid | 0 of 18 | 0 of 18 (12 triangles, unchanged) | 0 of 18 |

Note rows 4 and 5: the render mesh was open even on the two shapes `io-003` measured and
the kernel path was always right about, because the bridge fan-triangulates raw boolean
output with **no** T-junction pass — not a partial one like the serializer's, none.

**Why yes, and the honest weight of each reason.** The original reasoning is not wrong
about renderers: a renderer draws triangles and never asks whether they share edges, and
nothing on screen changes either way. The cases where it does matter are genuinely
narrower — importing into Blender or a DCC tool and then editing or printing, physics and
collision baking, and any consumer that welds vertices. Weighed against that, three
things decided it:

1. **The mechanism already exists and the change is one call.** `makeWatertight`
   (`src/core/kernel/watertight.js`) was built for `io-004` and is already proven on
   eight shapes; using it here is a line in `src/render/export.js`, not a new algorithm.
2. **An unclosed `.glb` beside a closed STL of the same body is a surprising
   inconsistency** — and one this project had already written down as a thing to warn a
   human about (`TODO/VERIFY.md`'s glTF row). "The three formats never disagree about
   what a body is" is `io-003`'s own rule for scope and naming; this extends it to the
   surface itself.
3. **It is paid once per click, not per frame.** Measured: +12.1 ms median on a 24-body
   scene (1.6 ms → 13.7 ms over five runs), 0.7-3.4 ms for a single body. The file grows
   ~15% (416,200 → 478,408 B for those 24 bodies) from the inserted vertices.

**What it explicitly does NOT do: touch the viewport.** The repair is in
`src/render/export.js`, not in `geom3ToBufferGeometry`, because that function runs on
every rebuild of every body against a 16 ms frame budget and the repair costs 0.7-3.4 ms
*per body*. Verified rather than asserted: `geom3ToBufferGeometry`'s default output is
**bit-identical** to its pre-`io-005` output on all four measured shapes (every float
compared with `Object.is`), at an unchanged 0.007-0.018 ms per rebuild.

**The one trap, and why the triangulation changed with it.** The repair inserts vertices
that are *collinear* with the edge they split. Fanning such a polygon from corner 0 — what
the bridge does — puts three collinear points in a triangle whenever the apex sits on a
subdivided edge, producing a **zero-area triangle** whose face normal is a normalized
`(0, 0, 0)`. Measured on a repaired `raspberrypi.bplus`: **101 of 672 triangles**. So the
export path asks for `triangulation: 'non-degenerate'`, which picks a corner the fan is
clean from and falls back to a centroid fan for the few polygons where no corner is
(5 of 217 polygons on that board, 0 of 59 on the union). Rejected alternative, with the
number that rejected it: **always centroid-fanning** (what `@jscad`'s own serializer
does) also reaches 0 open edges and 0 slivers, but emits `n` triangles per polygon
instead of `n - 2` — **40% more triangles** across the table above, and it would double a
plain cuboid from 12 to 24 for no gain at all. Every shape now measures 0 open edges,
0 zero-area triangles, per-face-consistent outward normals, positive (outward-wound)
volume within 4e-8 relative of the kernel's, and a **bit-identical bounding box**.

**Still not known, and not claimed:** no real glTF viewer has ever opened a file this app
produced — not before `io-005` and not after. Everything above is measured by parsers in
this repo that share no code with the exporter. `TODO/VERIFY.md`'s glTF row is where that
gap lives.

### Module ownership — the Project Structure answer `data-001` asked for

**Export is split across both layers, and the split is principled rather than a
compromise:**

- **`src/core/export.js`** — STL and OBJ. Framework-free, per `CLAUDE.md`'s Project
  Structure rule: takes evaluated `Geom3`/`Group` values, returns bytes, imports no
  three.js and touches no DOM. Unit-testable in plain Node.
- **`src/render/export.js`** — glTF only. Necessarily lives here because `GLTFExporter`
  consumes a `THREE.Mesh`, and `src/core/` may not import three.js.
- **Neither owns the download.** Triggering a download is a DOM side effect and belongs
  with the UI (`ui-034`), keeping both modules pure.

This **supersedes `io-003`'s current Affected-files plan**, which assumed an either/or
outcome ("likely landing entirely in `src/core/export.js` with no `src/render/`
involvement at all"). `io-003` should be updated to build both modules. `io-003` already
instructs its implementer to "state explicitly, once `data-001` resolves, which path this
task actually took and why" — this section is that answer, and it is *both*.

#### Amendment, 2026-09-21 (`perf-001`) — a third module, and the split survives it

Export now runs in a worker (`src/core/export.worker.js`), which does not change the
ownership above so much as put a thread boundary through it:

- **`src/core/exportJob.js`** is the whole job as one pure function, and it is what runs
  inside the worker. It calls the *same* `solidsForExport` and `makeWatertight` the main
  thread would, so there is no second implementation to drift — the failure mode both
  `io-004` and `io-005` were about.
- **`src/core/kernel/transport.js`** packs `Geom3`/`Group` for `postMessage`. Measured at
  0.18 ms to pack and 6.5 ms to clone a 24-body scene, against ~57 ms of work relocated,
  so the clone does not eat the win (`bench/results/2026-09-21-perf-001.md`).
- **glTF still finishes on the main thread**, because the split above still holds:
  `GLTFExporter` is three.js and `src/core/` may not import it. The worker does glTF's
  kernel-shaped half (combine and repair, ~48 of a 24-body `.glb`'s ~54 ms) and hands back
  prepared solids; `exportGltf(bodies, { prepared })` meshes and serializes them. A unit
  test asserts that file is **byte-identical** to the direct one.
- **The synchronous path remains**, as the fallback when a `Worker` cannot be constructed.
  It is the pre-`perf-001` behaviour exactly: slower, still freezing, never failing.

### One ecosystem caveat, recorded rather than buried

`@jscad/io` and its serializers see **678 weekly downloads**, against 33,792 for
`@jscad/modeling` and 14.8M for `three`. That is a genuinely small user base, and the
smallest number anywhere in this document.

Weighed against it: same four npm maintainers as the committed kernel
(`z3dev`, `mister-jscad`, `simon_clark`, `platypii`), same MIT license, same monorepo
(`jscad/OpenJSCAD.org`, 3,242 stars, pushed 2026-09-13, 143 open / 498 closed = 22.3%),
released 2026-08-02, and — usefully — `@jscad/io` depends on **`@jscad/modeling` 2.13.0**,
the exact version already pinned here, so no duplicate kernel copy enters the bundle.
The serializers are also small, single-purpose, and stable; `@jscad/stl-serializer` is
~30 KB unpacked across 10 files and could be vendored if it were ever abandoned.

### Rejection table

| Rejected | Specific reason |
|---|---|
| **three.js exporters for STL** | Measured **non-watertight** output on a basic cube-minus-cylinder: 100 of 362 undirected edges have no second face, because `src/render/mesh.js` fan-triangulates raw BSP output with its T-junctions intact. A slicer either refuses this or silently auto-repairs it into a solid the user did not model. Cheaper (800 B vs 2,363 B) and already installed — and rejected anyway, because this is a correctness difference. |
| **three.js exporter for OBJ** | Not wrong the way STL is — OBJ's consumers (mesh viewers, DCC tools) tolerate non-manifold input — but it would mean sourcing two sibling formats from two different geometry representations, so a user exporting the same body as STL and OBJ could get different triangle counts. Getting OBJ from the same kernel-side call costs nothing extra (both serializers together are 2,363 B) and keeps the two consistent. |
| **`@jscad/io` for glTF** | Does not exist. `npm view @jscad/gltf-serializer` → **404**; the umbrella package ships no glTF serializer. Not a tradeoff — an unavailable option. |
| **The `@jscad/io` umbrella package** | 68,211 B gzip versus 2,363 B for the two serializer leaves actually needed — **29×** — because it bundles every deserializer plus dxf, svg, 3mf, amf and x3d. Import the leaves. |
| **STEP export** | Out of scope for v1, consistent with `docs/decisions/geometry-kernel.md`: STEP is a BREP format, `@jscad/modeling` is a polygon-soup kernel, and producing real STEP would require the `OpenCascade.js` dual-kernel fork the user explicitly declined on 2026-09-17 (Option 1 — ship rim-only). Recorded so this is a closed question, not an oversight. |

---

## What gets installed

Exact pinned versions, no carets — matching the convention `@jscad/modeling` (`2.13.0`)
and `three` (`0.185.1`) already set in `package.json`:

```json
"idb": "8.0.3",
"@jscad/stl-serializer": "2.1.23",
"@jscad/obj-serializer": "2.1.23"
```

Nothing is installed for sub-decisions 2 or 3 — both deliberately resolve to platform
APIs. `GLTFExporter` ships inside the already-installed `three`.

### Measured bundle impact

`npm run build`, before and after installing all three packages. Nothing yet **imports**
them (`io-001`/`io-003` are the tasks that will), so this measures that a tree-shaking
build correctly excludes unreferenced dependencies:

| | JS raw | JS gzip | CSS gzip |
|---|---|---|---|
| Before | 934.35 kB | 262.67 kB | 5.45 kB |
| After | 934.35 kB | 262.67 kB | 5.45 kB |
| **Delta** | **0** | **0** | **0** |

The projected cost once `io-001` and `io-003` actually import them is
**1,367 B (`idb`) + 2,363 B (both serializers) + 11,092 B (`GLTFExporter`) ≈ 14.8 KB
gzip**, or about 5.6% on top of the current 262.67 KB — with the glTF exporter, at 75% of
that total, being the obvious candidate for a dynamic `import()` at the Export control if
it ever needs trimming.

---

## Sources

- **npm registry** (`npm view`) — versions, publish dates, unpacked sizes, maintainer
  lists, licenses. Queried 2026-09-18.
- **npm downloads API** (`api.npmjs.org/downloads/point/last-week`) — weekly download
  counts. Queried 2026-09-18.
- **GitHub REST API** (`gh api repos/…`, `search/issues`, `contributors`) — stars, forks,
  open/closed issue counts, contributor counts, last-push timestamps. Queried 2026-09-18.
- **Bundle sizes** — measured locally, not quoted from a size service:
  `esbuild --bundle --minify --format=esm --platform=browser`, then `gzip -9`. Marginal
  figures use `--external:@jscad/modeling` or `--external:three` to exclude dependencies
  already in the app bundle. An early measurement error is worth recording: esbuild's
  `--external:three` also externalizes `three/examples/...` subpaths, which silently
  reported the exporters at 143 B; the figures above re-measure via absolute paths so the
  exporter sources are genuinely bundled.
- **Manifoldness and triangulation figures** — measured by running
  `@jscad/stl-serializer` and three.js's `STLExporter` against the same kernel solid,
  with `STLExporter` fed through this repo's own `src/render/mesh.js`
  `geom3ToBufferGeometry`. Edge audit counts undirected edges (vertices rounded to 1e-4
  mm) and reports any not shared by exactly two faces.
- **File System Access support** — [caniuse.com/native-filesystem-api](https://caniuse.com/native-filesystem-api)
  (30.85% global, Firefox "harmful" position, no Safari or Android support) and
  [MDN `showSaveFilePicker`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker)
  (limited availability, secure context, transient user activation required), both
  checked 2026-09-18.
- **`generalize` call site** — read directly from
  `@jscad/stl-serializer@2.1.23/index.js:63`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

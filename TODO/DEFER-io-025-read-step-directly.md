---
title: Read STEP files directly, so a person does not have to convert to 3MF first
category: io
kind: feature
priority: low
model: opus
milestone: deferred — parked at the owner's choice on 2026-11-02, not on the current roadmap
depends: [io-024]
status: deferred
---

## Goal

**In user terms:** `io-024` imports a 3MF as a part with selectable sub-parts, but the person has to convert
first, and a converter may lose the names. FreeCAD's did. Reading STEP directly removes the step and, more
importantly, should give real names: `Feather › ESP-12` instead of `Part 22`.

**Why it is parked:** on 2026-11-02 the owner chose 3MF first. Every ready-made STEP reader is LGPL, and that
raises questions the 3MF route avoids. Pick this up if conversion or lost names prove to be a real nuisance.
Everything here was gathered while filing `io-024`, so it need not be re-derived. Re-gather the figures.

## Tessellate once; the kernel does not change

`docs/decisions/mesh-import.md`, `docs/user-library.md` and `src/io/meshFormats/index.js` say STEP is out of
scope because it "needs a B-rep kernel" and would be "a kernel decision". That is true of *keeping* a B-rep. It
is not true of **tessellating once at import, in a worker, then throwing the B-rep away**. What is stored is the
existing `asset.mesh`, in `io-024`'s multi-mesh part, so `@jscad/modeling` stays the only kernel. This task would
reverse those three statements, narrowly. The cost: holes are polygons, and sizes are good to the deflection.

## What the Feather's STEP holds

Read from the file on 2026-11-02 (3,143,296 bytes, AP214, millimetres):

- 29 placed components of 13 products, under `Adafruit ESP8266 Feather ▸ PCB Component`. 45 solid instances from
  29 solid definitions. Almost every solid is `Body2`, so the **product** is the useful name and the unit of a part.
  `CP2104` is 13 solids, `JSTPH` is 5.
- 1,856 faces: 1,314 planes, 325 cylinders, 201 B-spline surfaces (4 rational), 6 tori, 6 cones, 4 spheres. **No
  `PCURVE`s**, so a face's boundary exists only as 3D edge curves.

The `.f3d` in the same folder is no alternative: a proprietary Autodesk zip whose geometry is `.smb` / `.smbh` blobs.

## The first step stops for the owner: which reader

Figures from 2026-11-02. Those marked † are GitHub's combined open count including PRs.

| Option | Licence | Size | Last release / push | Stars | Issues open / closed | Contributors | Delivery |
|---|---|---|---|---|---|---|---|
| `occt-import-js` 0.0.23 | LGPL-2.1 | **7.6 MB wasm, 3.09 MB gzipped** | 2024-12-03 | 295 | 26 / 38 | 4 | npm, no dependencies, worker build included |
| `replicad-opencascadejs` 1.1.0 | LGPL-2.1-only | 48.9 MB unpacked | 2026-09-04 | not gathered | not gathered | not gathered | npm |
| `opencascade.js` 1.1.1 | LGPL-2.1-only | 66.7 MB unpacked | npm 2023-03 | 943 | 77 † | not gathered | npm |
| `truck` (`truck-stepio`) | Apache-2.0 | unknown; build our own | pushed 2026-11-02 | 1,678 | 44 † | 16 | Rust crates, **no npm package**; needs a Rust-to-wasm build |
| `foxtrot` (Formlabs) | Apache-2.0 | unknown; build our own | pushed 2022-09-06 | 347 | 18 † | 3 | Rust, no npm package, "experimental", stale |
| Hand-rolled reader and tessellator | AGPL-3.0-or-later (ours) | small | n/a | n/a | n/a | this project | No dependency |

1. **Licence is the owner's call.** LGPL-2.1 is not on the `npm run licenses` allow-list, and `CLAUDE.md` says a new
   entry "is a decision for the user". `docs/decisions/app-store-licensing.md` already says to reject LGPL *native pods*.
   A wasm file is not a pod, but M19's Tauri shell bundles this repo's Vite build, so an LGPL binary would ship inside the
   App Store app, where a user cannot swap it. That may need legal advice. Ways out: web and PWA only with STEP absent from
   native builds; an Apache-licensed reader; or our own.
2. **Whether it reads real files.** `truck`'s handling of assembly trees, names and real-world AP214 is unverified. Run it
   on the Feather rather than trust its README.
3. **Hand-rolled is a tessellator, not a parser.** 89% of the Feather's faces are analytic. The other 11% are trimmed
   B-splines with no `PCURVE`s, so each boundary must be projected onto the surface numerically, and the 16 × 24 mm solid
   (by its size, the ESP-12) has 183 of them. It is its own L task.

**Recommendation when filed:** `occt-import-js`, lazily loaded, on web and PWA if the owner accepts LGPL there, with native
builds refusing in words. Its source walks the XCAF tree and reads colours. **It has never been run on this file**: filing
tried, and that session's permission rules blocked running a downloaded package. It is 0.0.x with no release in 23 months,
and because the kernel is untouched, replacing it later costs one adapter module.

**The spike** (a scratch script, not committed), on the Feather, with each candidate that survives the licence question:

- Does the tree come back with names? 29 components and 13 products?
- Do the ten `10K`s arrive as one mesh plus transforms, or as duplicated triangles in world position?
- Can solids within a product be told apart? Each should be welded alone, then concatenated, because welding `CP2104`'s
  touching pins and body would create non-manifold edges.
- Triangles and stored bytes at a default and a fine deflection; time and peak memory; size against 51.255 × 22.86 × 6.37 mm.
- Whether it instantiates under the production CSP.

## What this adds on top of `io-024`

- **Interaction model**: the same control, row, placement and selection as `io-024`; `accept` gains `.step,.stp`. On the
  first STEP import of a session, *Loading the STEP reader (3 MB)…* first, because that is a real wait on a phone. STEP states
  its units, so no Units control. It has no up convention, so a Y-up file lands on its side: keep the file's axes, do not guess.
- **A part per placed leaf product**, named from the product, `10K 1` … `10K 10`. One product with several solids and no tree
  is one part per solid.
- **Loading**: dynamic import inside the worker on the first STEP file only, with a spec asserting it stays out of the main
  bundle (`perf-003`, `perf-004`).
- **CSP**: `index.html` has `script-src 'self'`, and wasm normally needs `'wasm-unsafe-eval'`. `vite.config.js` relaxes
  `script-src` on the dev server, **so dev will hide this failure**. Test on a production build in all three engines, and
  record any policy change in `docs/decisions/ai-partner.md` (decision 8), which owns it.
- **PWA**: precache globs omit `.wasm` and the file cap is 4 MiB (`vite.config.js`). Keep it out of the precache,
  runtime-cache it after first use, and refuse in words when offline and not yet cached.
- **Hostile input**: wasm memory and time are bounded, and **a timeout terminates the worker**. The reader's output is not
  trusted: every mesh goes through `weldMesh` and `validateMeshAsset`. Many vendor STEP files exceed the 25 MiB read cap;
  decide in the record whether this format gets its own.

## Interaction model, Documentation, Affected files, Proposed fix, Effort, Testing

Not written yet, on purpose: they depend on the reader the owner picks and on what `io-024` actually shipped. **Write them
when this comes off the shelf, before any code**, starting from `io-024`'s sections. Effort: L if a reader is accepted, more
if hand-rolled. Acceptance: extend scenario 31 with a real STEP file, re-drive 26, and re-run `io-004`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

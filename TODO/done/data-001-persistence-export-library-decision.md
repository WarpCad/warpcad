---
title: "Persistence/export Library decision: IndexedDB wrapper, File System Access, hosted git client, mesh export"
category: data
kind: feature
priority: high
model: opus
milestone: M6
depends: [docs-002]
status: done
---

> **Retirement note (2026-09-18).** Shipped as specified — all four sub-decisions made
> in `docs/decisions/persistence-export.md` with real measured numbers and a rejection
> table each. Three things came out **differently from what this file anticipated**, and
> all three change downstream tasks rather than just recording a preference:
>
> 1. **Sub-decision 4 is not either/or — it's a split, because `@jscad/io` has no glTF
>    serializer at all.** `npm view @jscad/gltf-serializer` returns 404 and the umbrella
>    package's dependency list covers 3mf/amf/dxf/obj/stl/svg/x3d/json only. So STL and
>    OBJ come from `@jscad/stl-serializer`/`@jscad/obj-serializer` (kernel geometry,
>    `src/core/export.js`) and glTF can only come from three.js's `GLTFExporter`
>    (render mesh, `src/render/export.js`). **`io-003`'s Affected files must be updated**
>    — it assumed one module would win outright.
> 2. **The kernel-vs-render asymmetry this file asked to have "stated explicitly" turned
>    out to be a measured correctness defect, not a preference.** Fed through this repo's
>    own `src/render/mesh.js`, three.js's `STLExporter` emits a **non-watertight** solid
>    (100 of 362 undirected edges unmatched on a cube-minus-cylinder) because the mesh
>    bridge fan-triangulates raw BSP output with its T-junctions intact;
>    `@jscad/stl-serializer` runs `generalize({snap,triangulate})` first and emits a
>    closed manifold (0 unmatched). The float32 worry, by contrast, is **not** real —
>    measured max deviation 9.591e-8 mm — and is recorded as rejected rather than left
>    implying support for the same conclusion.
> 3. **File System Access is desktop-Chromium-only (~31% global), not merely
>    "Chromium-only"** — Chrome for Android has no pickers either. Given `CLAUDE.md`'s
>    phone-first mandate, the download/upload fallback is therefore the **primary** path
>    and must be built first, with FSA as the enhancement. This also puts a naming
>    constraint on `ui-033`: a "Save" that silently means "download another copy" on
>    Safari is a mislabel.
>
> Also narrower than this file implied: the `@jscad/io` **umbrella** costs 68,211 B gzip
> versus 2,363 B for the two serializer leaves actually needed — install the leaves.
> Dependencies added at exact pinned versions (`idb` 8.0.3,
> `@jscad/stl-serializer`/`@jscad/obj-serializer` 2.1.23); nothing imports them yet, and
> the build is byte-identical before and after (same chunk hash, 262.67 kB gzip).

## Goal

M6 needs four real dependency decisions before any of its other rows can start:
an IndexedDB wrapper (raw API vs. a library), how File System Access is used for local
Save-As/Open, a client for the hosted git backend (a GitHub API client vs. hand-rolled
`fetch`), and STL/OBJ/glTF serialization (`@jscad/io`, which pairs with the committed
`@jscad/modeling` kernel but isn't installed, vs. three.js's own exporters, which run
off the *rendered mesh* rather than the kernel geometry). "Done" looks like
`docs/decisions/persistence-export.md`, written to the same rigor `docs/decisions/
geometry-kernel.md` and `rendering.md` already established — real options compared on
features/size/stars/issue ratio/release recency/maintainer count, an explicit rejection
table, and (since this is a genuinely new decision, not a re-check) no obligation to
factor in prior-attempt experience the way the kernel decision did for `manifold-3d`.

## Interaction model

n/a — architecture/Library decision, no UI surface. State explicitly per
`TODO/README.md` rather than omit.

## Documentation

n/a in the `docs/<page>.md` end-user sense — the deliverable itself **is**
`docs/decisions/persistence-export.md`, an internal decision record, the same category
as `docs-001`/`docs-002`, not end-user documentation. No sidebar entry needed (decision
docs aren't in `docs/README.md`'s nav, per the existing `docs/decisions/` precedent).

## Affected files

- `docs/decisions/persistence-export.md` (new).
- `package.json` — whichever dependencies are chosen get added here at the *end* of
  this task (a decision doc that names a library the project doesn't yet depend on is
  consistent with `docs-001`/`docs-002`'s own precedent of deciding before installing).

## Proposed fix

Four sub-decisions, each needing its own comparison table and rejection table per
`CLAUDE.md`'s Library-decisions process:

1. **IndexedDB wrapper**: candidates at minimum `idb` (tiny promise wrapper, the most
   widely used), `Dexie.js` (fuller-featured, heavier), and the raw `indexedDB` API
   with no wrapper (matches this project's already-established pattern in
   `src/stores/settings.js` of a hand-rolled try/catch boundary around `localStorage` —
   worth weighing "no new dependency, consistent with the existing boundary style"
   against a wrapper's safety/ergonomics).
2. **File System Access**: this is a browser API, not a library choice — the real
   decision is the fallback story for browsers without it (Firefox and Safari have
   historically lagged Chromium here, which is directly relevant given `CLAUDE.md`'s
   three-engine Browser Support commitment) — a download-based Save/reload-based Open
   fallback needs to be named explicitly, not left as "Chromium-only" by default.
3. **Hosted git-backend client**: a real GitHub API client (e.g. `octokit`) vs.
   hand-rolled `fetch` against the REST API directly. Weigh bundle size (this is a
   browser app, not a Node backend) against `octokit`'s pagination/retry/auth
   ergonomics — a browser bundle pulling in a full Octokit client is a real cost this
   comparison must state a number for, not wave at.
4. **Export serialization**: `@jscad/io` (works off the kernel's own `Geom3`/`Group`
   values, before the mesh bridge) vs. three.js's built-in `STLExporter`/`OBJExporter`/
   `GLTFExporter` (work off the *rendered* `THREE.Mesh`, which `ui-016`'s per-part
   meshing already produces per named sub-part). **Note the asymmetry explicitly**: a
   `@jscad/io` export reflects the exact kernel-evaluated solid; a three.js export
   reflects whatever tessellation/normals the render path already chose for display —
   these can differ in ways that matter for a slicer (STL) even if they look identical
   on screen. State which is chosen and why, not just which is smaller.

## Effort

L — four independent dependency decisions, one of which (export path) has a real
correctness dimension (kernel-geometry-accurate vs. render-mesh-accurate) that isn't
just a size/maintenance tradeoff. `model: opus` per `TODO/README.md`'s guidance on
large multi-module orchestration and real architectural ambiguity with cross-layer
consequences (the export choice affects whether `src/core/` or `src/render/` owns
export, which in turn affects Project Structure).

## Testing

No code changes beyond dependency installation — this is a decision document. Once
dependencies are added to `package.json`, run `npm run test` to confirm nothing existing
breaks from the added packages (bundle/tree-shaking regressions are possible with a
heavier client library, per `CLAUDE.md`'s perf budget — spot-check bundle size before
and after via `npm run build`'s own output, not just that tests pass).

**`TODO/ACCEPTANCE.md` scenarios**: none directly — this is a decision with no code
behavior. **Closed-finding regression surface**: none — no existing subsystem is
touched, only `package.json`.

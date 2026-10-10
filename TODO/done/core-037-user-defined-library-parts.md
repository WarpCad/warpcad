---
title: User-defined library parts — a group saved as a data-defined composite the registry can rebuild
category: core
kind: feature
priority: high
model: opus
milestone: M9
depends: [core-013]
status: done
---

> **What actually shipped (2026-10-10).** A user part is a plain-JSON definition (`src/core/userPart.js`)
> that registers at runtime as a `user.<slug>` composite, so the fold, the Library row, the ghost and the
> drop all use the existing composite path. Full reasoning and the cap table are in
> `docs/decisions/user-library.md`. **Deviations from this file, all deliberate:**
>
> 1. **No `library.define` record.** Definitions live on the project state line as `parts: [definition]`
>    (only those the records use, nested ones included). A record would have shown up as a History row, an
>    Undo step and a geometry-less body. Record lines stay byte-identical and the state line stays
>    version 1. An older build ignores the field, meets `user.*` as an unknown op and refuses the file by
>    name, which is the narrow "fails like an unknown op" the Testing section asked for.
> 2. **Registration is global but layered**: project layer beats library layer, and only
>    `createDocument({ publishesUserParts: true })` (the store's live document) may replace the project
>    layer. Placing copies the definition into the project inside `ingest`, so a later library edit never
>    changes a placed instance; the Library row reports `newerVersionAvailable` instead.
> 3. **"Error placeholder" is a left-broken row with a named LoadWarning** (`ui-052`'s machinery), not a
>    stand-in shape. The file is not refused.
> 4. **Capture** follows `target`/`operands` only, rewrites ids `r1..rn`, refuses conditional or
>    left-broken lineage by name, and verifies itself with `sameGeometry` (exact polygons, part names,
>    hidden parts, colours). The registry's new `resultId` entry field keeps sub-part names.
> 5. The local library is its own IndexedDB database, `warpcad-parts`, so the autosave schema did not
>    migrate. Allowed ops also include `modify.*` and `style.*`. Caps: 500 records/part, depth 4, 20,000 after
>    expansion, 16 params/bindings, +-1e6 ranges, 64 parts/file, 1 MB per definition.
>
> **Known gaps, owned elsewhere:** nothing loads the local library at app start and no control saves a
> part (`ui-055`); `style.recolor`'s `colorOverride` is not carried into a captured part; worker `build`
> jobs (sketch preview) do not know `user.*` ops, and nothing sends them one today. Found and filed:
> `core-053` (`refoldRequestOf` drops `leftBroken`, so a project with a left-broken row cannot export at
> another resolution).
>
> **Step 6 (2026-10-10, hand-driven, real mouse, Chromium and WebKit at laptop):** scenarios 3, 5, 6, 10 PASS;
> `core-020`, `core-024`, `ui-030` repros PASS (a Bolt dropped after a Cube lists only its own six parts, a
> numeric move keeps all six, all four hardware rows land at the drop point); the new capability driven
> end to end (capture from a group, place, autosave reload, file save, open in a fresh browser context with
> no library) gave identical bounds and part names, and files with a missing, disallowed-op,
> self-containing or oversize part each opened with a named warning and a broken row.

## Goal

"Create a group object to be added to the library." The Library today is a fixed catalogue:
every entry is a recipe function in `src/core/kernel/recipes/`. A person (or the AI) cannot
add one. "Done": a group of bodies can be saved as a **user part**: a named, versioned,
plain-JSON definition of the ops that rebuild it. It appears wherever a registry composite
does, and a project that uses it carries the definition with it, so a gist opens on another
machine without that machine having the part.

## Design

- **A user part is data, not code.** This is `Initial design.md` §4's "recipes over ports"
  taken to its end: the definition is a list of op records (the same shape the log already
  uses), with local ids, relative placement, and a small set of **exposed parameters**
  (`{ name, unit, default, min, max, binds: [{ record, path }] }`). Expanding a part
  substitutes parameters into the records and emits them. No `eval`, no function bodies —
  so a part from an untrusted file is as safe as a project from one (scenario 8).
- **Registry integration**: a user part is registered at runtime as `kind: 'composite'`
  under the namespace `user.<slug>` with `ui` metadata (label, defaults, `operandCount: 0`),
  so `src/core/library.js` lists, ghost-previews and drops it through the one existing
  mechanism — no per-part code in any component (that is what the rule exists to protect).
  Placement uses the composite path (`recordsForDrop`: recipe record + trailing translate).
- **Where the definition lives**:
  1. the **project** (a new `library.define` record, or a state-line section decided by
     reading `project.js`) — so a placed part is always rebuildable from the file alone;
  2. the user's **local library** (IndexedDB) — so it shows up in new projects.
  Placing a user part copies its definition into the project if it is not there. If the
  project and local library disagree on a part's version, the **project's wins** and the
  Library shows "newer version available" — never a silent change under a placed instance.
- **Hostile input**: caps on records per part, expansion depth (a part may not contain
  itself or form a cycle), parameter ranges, name length, and a `{ ops allowed }` list —
  a part may use creation, transform, boolean and group ops, **not** ops that need document
  context (`library.define` itself, anything referencing outside ids). Bad part → named
  `LoadWarning` and the instance renders as an error placeholder, not a refused file.
- **Sub-part names survive**: the group's part names (`board`, `usb-a`, `mount-hole-1`) are
  kept, because the existing snap/align/boolean-on-subpart tools address parts by name.
- **Capturing from a selection** — `core/library.js`'s `definePartFromSelection(doc, id,
  { name, exposeParams })` walks the selected body's lineage (what created it, in order) and
  rewrites it as a self-contained list with its own ids. This is the hard part: a body's
  lineage may include operands that are *other* bodies; those are pulled in, and the result
  must replay to byte-identical geometry (the spec asserts it).

## Interaction model

n/a here — core only. The save control and the *My parts* section are `ui-055`.

## Documentation

n/a — no user-visible control in this task; `ui-055` documents the flow.

## Affected files

- `src/core/userPart.js` (definition schema, validate, expand, capture; + spec),
  `src/core/kernel/registry.js` (runtime registration), `src/core/library.js`,
  `src/core/project.js` (+ spec; round-trip and the load-warning path),
  `src/storage/userLibrary.js` (IndexedDB via `idb`), `docs/decisions/user-library.md`
  (short: why data not code, the version rule, what `ai-001`'s trust model implies).

## Effort

L.

## Testing

- **Unit**: capture → expand → fold gives the same bounds, volume and part names as the
  original (tolerance stated); parameter substitution at min/max/default; a cycle, a
  too-deep nest, an oversize part, a disallowed op, a missing parameter binding, an unknown
  op (older/newer build) each yield a named warning, never a crash or a hang; two instances
  of one part with different parameters; the project's version beats the library's.
- **Boundary**: IndexedDB mocked; kernel worker mocked.
- **Persistence round-trip** across NDJSON save/load, autosave blob, and a hosted-gist load;
  a file saved by this build opens in a build with no user-part support and fails the way an
  unknown op fails (`RETIRED_OPS`-style narrow exception, not a silent skip).
- **Acceptance**: re-drive 3 (snap-placement of a kit), 5/6 (hidden part, group vs sub-part),
  10 (save/reload), and re-run `core-020`/`core-024`/`ui-030` repros — they sit on the same
  composite-placement path.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

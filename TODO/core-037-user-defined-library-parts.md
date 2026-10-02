---
title: User-defined library parts — a group saved as a data-defined composite the registry can rebuild
category: core
kind: feature
priority: high
model: opus
milestone: M9
depends: [core-013]
status: open
---

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

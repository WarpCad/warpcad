---
title: "Local persistence: IndexedDB autosave plus File System Access Save-As/Open"
category: io
kind: feature
priority: medium
model: sonnet
milestone: M6
depends: [data-002]
status: done
---


> **What actually shipped (2026-09-19).** The task file predates the M6 decisions; where it
> conflicts, `docs/decisions/persistence-export.md` and `docs/decisions/interaction-model-qa.md`
> §8-10 won. Built: **autosave + silent restore + the `save-status` chip** (mounted in the header
> document bar, a dot at phone width, right edge still 380 of 390px) and the **file Save/Open
> mechanism with a first-class fallback** (no File ▾ menu, no shortcuts, no hosted, no Export —
> those are `ui-033`/`ui-034`/`io-002`). Files: `src/core/project.js` (the one on-storage/on-disk
> format: the NDJSON action log plus, only when needed, **one trailing `project-state` line**
> carrying suppressed row ids, the rollback marker and non-local origins — so a rolled-back or
> suppressed document restores **faithfully**, not refused), `WarpDocument.loadEntries` (atomic,
> clears both undo stacks exactly like the seed loop), `src/storage/{autosave,indexeddb,localMirror,
> fileSystem}.js`, `src/stores/persistence.js`, `src/components/display/SaveStatus.vue`,
> `Viewport.vue` framing on `loadRevision`, `camera.frameBounds`, `docs/save-load.md`.
>
> **One thing the file did not anticipate, found by driving real Chromium, not by reading code:**
> the spec'd flush on `visibilitychange`/`pagehide` is **not sufficient** — an IndexedDB
> transaction *started* in those handlers is not committed before a reload tears the page down
> (the `put` is issued; the transaction neither completes nor aborts), so "place a solid, reload
> within 500 ms" lost the solid. Fixed with a **synchronous `localStorage` safety copy**
> (`localMirror.js`) written only from the dying-page flush, cleared as soon as IndexedDB has the
> same text, and compared by timestamp at startup. A regression test (`reloading immediately after
> an edit…`) fails without it in Chromium and passes in Chromium + WebKit with it.
>
> **Deliberate non-decisions.** Multi-tab autosave is **last-writer-wins** (the Q&A's drafted
> revision counter / `BroadcastChannel` is not built; no locking invented). Undo history does not
> survive reload (restore goes through `loadEntries`, which clears the stacks). No `fake-indexeddb`
> dependency: the adapter is unit-tested against an injected `idb` `openDB` fake and exercised for
> real in Chromium and WebKit by the e2e spec. `boolean-operations.e2e.js`'s "fresh scene via
> `page.reload()`" became an Undo, because a reload now (correctly) restores the session.
>
> **What `ui-033` should call** (all on `usePersistenceStore()`): `fileCapabilities`
> (`{ mode, canSaveInPlace, saveLabel: 'Save' | 'Download copy', saveAsLabel: 'Save As…' | null,
> openLabel }` — label the menu from it; both save items carry `data-testid="file-save"`),
> `saveFile({ saveAs })` (Ctrl/Cmd+S → `saveFile()`), `openFile()` (call it synchronously from the
> click; it does **not** confirm — show `file-open-confirm` first when `documentStore.count > 0`),
> `openText(text, name)`, and `chipText`/`chipTone`/`errorMessage`/`dismissError()`. Not driveable
> until then: scenario 10's file and hosted halves, and the native File System Access dialog
> (one row in `TODO/VERIFY.md`).

## Goal

`src/storage/` has existed as an empty scaffold directory (`.gitkeep` only) since
`build-001`. This task is its first real content, and the local half of M6's two
persistence targets: **IndexedDB autosave** of the action log (so a reload reopens
exactly where the user left off, per scenario 10) and **File System Access** Save-As/
Open for a portable project file (so a document can be handed to someone else or backed
up outside the browser's own storage). "Done" looks like: place and union some geometry,
reload the page, and the same document reopens automatically — plus a working Save-As
that writes a `.ndjson`-or-similar file to disk and an Open that reads one back.

## Interaction model

- **Precondition** — nothing selected; these are document-level (not selection-gated)
  actions.
- **Trigger** — per `data-002`'s confirmed answer, likely: autosave has **no trigger**
  (it runs on every document mutation, debounced), while Save-As/Open are explicit
  controls (`ui-033` builds their actual UI surface — this task builds the underlying
  mechanism both `ui-033` and the autosave path call into).
- **Feedback** — autosave: a subtle, non-intrusive indicator (a small "saved" state,
  not a modal) so silent failure (a full IndexedDB quota, a blocked store) is still
  visible somewhere, per `CLAUDE.md`'s "always mock at the boundary... must never crash"
  rule applied to a real failure the user could actually hit. Save-As/Open: the
  browser's own native file-picker feedback (File System Access provides this for
  free) plus a same success/failure indicator as autosave.
- **Placement** — n/a.
- **Selection response** — n/a.
- **Selection count** — n/a.
- **Small-screen behavior** — File System Access has **materially different support**
  across the three engines (Chromium: full support; Firefox/WebKit: historically
  partial-to-absent) — this is a Browser Support concern, not just a layout one. This
  task must name the fallback for engines without it (a plain `<a download>` blob for
  Save, a plain `<input type=file>` for Open) explicitly, not silently degrade to a
  broken button.

## Documentation

- **Page** — new `docs/save-load.md` (or extend if `ui-033` creates the umbrella
  save/load page first — coordinate with that task rather than duplicate).
- **Example**: "Your work autosaves automatically as you go — reload the page and your
  scene reopens exactly as you left it. To save a portable copy, use Save As (see
  [Save/Load](save-load.md)) to write a project file to disk."

## Affected files

- `src/storage/indexeddb.js` (new) — the autosave boundary: read the whole action log
  on startup, write it back (debounced) on every mutation, wrapped in try/catch per
  `CLAUDE.md`'s boundary-mocking convention (mirrors `src/stores/settings.js`'s existing
  `localStorage` try/catch pattern, scaled up to IndexedDB's async API).
- `src/storage/fileSystem.js` (new) — Save-As/Open against File System Access, with the
  fallback path named above for unsupported engines.
- `src/core/document.js` — likely no change; this reads/writes the existing NDJSON
  action log (`src/core/ndjson.js` already exists) rather than a new format.
- `src/stores/document.js` — wiring to call the autosave boundary on mutation and to
  load from IndexedDB on startup.
- `docs/save-load.md`.

## Proposed fix

Depends directly on `data-001`'s IndexedDB-wrapper decision — if that task picks a
wrapper (e.g. `idb`), this task's `indexeddb.js` is built against it; if it picks the raw
API, this task builds the try/catch boundary directly, mirroring `settings.js`'s
existing pattern at a larger scale (a whole action log rather than one string value).
Reuse `src/core/ndjson.js`'s existing serialize/parse for the on-disk/on-storage format
rather than inventing a second one — the File System Access file and the IndexedDB
autosave blob should be the *same* format, so a manual Save-As is just "the same bytes
autosave already writes, offered as a download."

## Effort

M — mostly wiring against an already-decided format (`ndjson.js`) and an
already-decided dependency (`data-001`), with one real cross-engine risk (File System
Access support) that needs a genuine fallback rather than a TODO comment. `model:
sonnet` — this closely mirrors the `settings.js` boundary pattern already established
in this codebase, not new architectural ground.

## Testing

- New `src/storage/indexeddb.spec.js`, `fileSystem.spec.js` — mock the boundary per
  `CLAUDE.md`'s convention (`indexedDB`/File System Access are both mockable browser
  APIs, never exercised for real in a unit test): a write-then-read round-trip
  preserves the action log exactly; a throwing/blocked store degrades to "nothing
  persisted, app still functions" rather than crashing startup.
- New `e2e/local-persistence.e2e.js` (required — new user-visible behavior, autosave
  is observable): place and union geometry, reload the page (`page.reload()`), confirm
  the same bodies reappear. Separately, exercise Save-As → Open round-trip if the
  engine under test supports File System Access; assert the documented fallback path
  otherwise. Runs against **all three engines** per `CLAUDE.md`'s Browser Support rule
  (this is exactly the "persistence-sensitive path" that rule names explicitly), at
  laptop viewport (persistence isn't a layout concern, so the full 3-viewport matrix
  isn't required — state this explicitly rather than omit it).
- **`TODO/ACCEPTANCE.md` scenario 10** (local path) by name — drive by hand per that
  scenario's own Steps once `ui-033` also provides a real Save trigger to click, or
  drive the autosave half alone (reload-without-explicit-save) if `ui-033` hasn't
  landed yet, naming which half was driven.
- **Closed-finding regression surface**: none directly — this is the first task to
  write to a persistence layer at all, so there's no prior persistence-subsystem
  finding to re-check yet.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

---
title: Project file version 2 — merge metadata in the state line, validated as untrusted data
category: data
kind: feature
priority: high
model: sonnet
milestone: M15
depends: [data-010]
status: open
---

## Goal

The merge metadata `data-010` keeps in memory has to survive Save, autosave, a gist and an MCP
write, or two copies cannot be merged after either was closed. It goes in the existing
`project-state` line, so the format is still NDJSON and every record line is still
byte-identical to what the command layer appended.

"Done": a document round-trips its full `MergeState` through `serializeProject` /
`parseProject`; a legacy file opened and saved unchanged is byte-identical; a file this build
edited says version 2 and an older build refuses it with a clear sentence; and no value in the
new section can make the loader hang, overflow or let one writer win every future merge.

## Interaction model

Does not apply to a new control. One user-visible sentence changes and is specified here: an
older build opening a version-2 file already shows `ProjectFormatError`'s message. This build
must make the mirror case read well: a file from a **newer** state-line version is refused with
"This project was saved by a newer WarpCad. Update the app to open it. The file was not
changed."

## Documentation

- **Page** — `docs/save-load.md`, a short "Older versions of WarpCad" note.
- **Example** — "If you open a project in a copy of WarpCad that has not updated yet, it says
  *saved by a newer WarpCad* and leaves the file alone. Reload the page to update, then open it
  again."
- **Media** — none; no control changes.

## Affected files

- `src/core/project.js` — `STATE_VERSION`, `serializeProject`, `parseProject`, the module note
- `src/core/merge/validate.js` (new) — shape and cap checks for an untrusted merge section
- `src/core/project.spec.js`, `src/core/merge/validate.spec.js`
- `mcp/projectFile.js` — carries the metadata through its read-modify-write (the wiring that
  uses it is `io-010`)
- `docs/save-load.md`, `docs/mcp.md` (the format note)

## Proposed fix

**Layout.** One new field on the state line, written only when it says something a legacy
reader could not derive:

```
{"warpcad":"project-state","version":2,"merge":{
  "project":"p-7hq2md","clock":41,
  "pos":{"op-k3f9xa-7":"a2"},
  "stamps":{"op-k3f9xa-7":{"born":[12,"k3f9xa"],"rec":[30,"m81c0z"]}},
  "dead":{"op-k3f9xa-9":[41,"k3f9xa"]},
  "registers":{"rollbackAfter":[40,"k3f9xa"]}}}
```

Keep it compact: omit a stamp equal to the entry's `born`, omit `born` when it is zero, omit a
position key equal to the one a legacy reader would derive from row order. Record lines are
written in merged order. Measure the overhead on the saved files of acceptance scenarios 3, 12
and 17 and record it; if metadata exceeds a third of the file, say so and propose a tighter
encoding before closing the task.

**Version rule** (`docs-022`'s correction): version stays **1** when the section would be empty
(a legacy file opened and saved unchanged); it becomes **2** as soon as there is any stamp,
non-default position or tombstone. Version 1 files with no section load by deterministic
derivation (`data-010` point 1).

**Reading.** `parseProject` stays strict (refusal, not repair). The merge section is untrusted
data from whoever wrote the file:

- shape: wrong types refuse the file by naming the field, like any malformed state line;
- every id in `pos`/`stamps` names a record in the file, and no record lacks a position after
  derivation; `dead` ids must **not** be live rows with an older stamp than their own tombstone
  (resolve by the merge rule, do not refuse);
- **caps**, enforced in code: counter at most 2^40 (a hostile `[9e15, …]` would otherwise win
  every merge and stall the clock near `Number.MAX_SAFE_INTEGER`); replica id matches the
  six-character alphabet; position key length at most 256; tombstones at most 100 000; the
  section's serialised size at most a stated bound. Exceeding a cap refuses the file by name;
- the loaded clock observes the largest counter seen, so local writes are always later.

**Refusing a newer version.** A state line whose `version` is above this build's is refused with
the sentence in the Interaction model, before any record is folded.

**MCP.** `mcp/projectFile.js` already goes through `parseProject`/`serializeProject`; confirm a
tool call preserves every tombstone and stamp it did not touch, and that a refused call still
writes nothing.

## Effort

M

## Testing

- Unit (`project.spec.js`): full `MergeState` round trip; a legacy file is byte-identical after
  load and save; one edit makes it version 2; `version: 3` is refused with the exact sentence and
  the document is untouched; the pinned "unknown state-line fields are ignored at version 1"
  behaviour still holds.
- Unit (`validate.spec.js`), one case per hostile shape: a counter of `9e15`, a negative or
  fractional counter, a replica id of `__proto__`, a 10 MB position key, a `pos` entry naming no
  record, a tombstone for a row with a newer stamp, 1 000 000 tombstones, a stamp that is an
  object, a section that is an array. Each is refused by name or resolved by rule; none throws
  an unnamed error or takes more than a stated time.
- Property: for random documents from `data-010`'s generator,
  `parse(serialize(doc))` merged with `doc` equals `doc`.
- Unit (`mcp/server.spec.js`): a write call on a version-2 file keeps unrelated tombstones and
  stamps; a refused call leaves the bytes and mtime unchanged (`ai-009`'s case, re-run).
- App-level: `e2e/save-load-ui.e2e.js` gains "edit, save, reload, the History is identical" on a
  version-2 file, and "open a newer-version file: the sentence shows and the project is
  untouched".
- Acceptance scenarios this could break: **8** (remote-load safety: add a hostile merge section
  as a standing step), **10**, **14**, **21**. Re-drive 8 and 10.
- Closed findings to re-run: `io-001` (the `pagehide` safety copy must carry the section),
  `ai-003` (state-line fields an older build ignores), `core-037` (bad part definitions are
  skipped with a warning, not refused), `ai-009`.
- Engines: **all three** for the two e2e cases (IndexedDB autosave and file reading); unit work
  Chromium only.
- Viewports: laptop only; no layout changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

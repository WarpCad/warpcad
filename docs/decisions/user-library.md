# User library parts: data, not code

Status: **Accepted** (`TODO/core-037`, 2026-10-09). Core only; the save control and the
*My parts* section are `TODO/ui-055`. No new dependency: the local library uses `idb`
8.0.3, already chosen for autosave (`persistence-export.md`).

## The decision in one paragraph

A user part is a **plain-JSON list of op records**: the same `{ id, op, params, target,
operands }` shape the action log uses, with ids local to the part, plus up to 16 numeric
**exposed parameters**. Each parameter is bound to number-valued paths inside those records'
params. Expanding a part copies its records and writes the parameter values into the bound
paths. That is the whole mechanism (`src/core/userPart.js`). A valid part is registered at
runtime as a `user.<slug>` **composite** (`kernel/registry.js`'s runtime table), so the
fold, the Library row, the ghost and the drop all go through the code that already handles
`hardware.bolt`. No component has per-part code.

## Why data, not code

| Option | Rejected because |
|---|---|
| A recipe **function** (JS source) stored with the part, as the built-in recipes are | Running it means `eval`/`new Function` on text that arrives in someone else's project file or gist. `ACCEPTANCE.md` scenario 8 treats those files as untrusted, and this would make "open a file" mean "run its code". |
| A small **expression language** for parameters (`width * 2 + 3`) | It is a parser and an evaluator, so it is attack surface. It is also a second language the AI partner would have to learn. Direct numeric bindings cover the use case we have (resize a board, lengthen a standoff). An expression feature can be added later if a real part needs one. |
| **Baked meshes** | CLAUDE.md: geometry is always derived and never persisted as document state. A mesh also can't take a parameter or change resolution, and it drops sub-part names. |
| **Op records + numeric bindings** (chosen) | It is the vocabulary the fold already validates and the AI already reads. A part from an untrusted file is exactly as safe as a project from one. A reviewer can diff it. |

## Where a definition lives, and the version rule

1. **In the project**, as a `parts: [definition]` section on the `project.js` state line.
   We chose this over a `library.define` record after reading `project.js`. A definition
   builds nothing. As a record it would show up as a History row, an Undo step and a
   geometry-less "body", and `document.js`'s lineage indexes, `ui-032` and `mcp/` would
   all have to learn to skip it. With the state-line section, record lines stay
   byte-identical and the state line stays at version 1. Only definitions the records
   actually use are written, including ones nested inside another part.
2. **In the user's local library**: IndexedDB database `warpcad-parts`
   (`src/storage/userLibrary.js`). It is a separate database from the autosave one, so the
   autosave schema never has to migrate for this feature.

**The project's copy always wins.** When a part is placed, the definition it was built from
is copied into the project. In the live document it is also pinned into the registry's
project layer. A newer library version saved later therefore never changes a placed
instance. The Library row reports `newerVersionAvailable` instead, and upgrading is the
user's explicit action (`ui-055`).

A project part that is **bad or missing** blocks the library copy rather than letting it
stand in silently. Its instances, and every record that builds on them, load **left broken**
(the `ui-052` machinery): badged, out of the fold, fixable. A named `LoadWarning` says which
part and why, and the file is **not** refused.

An older build that predates parts ignores the unknown state-line field, then meets
`user.…` as an unknown op. It refuses the file and names that step, the same way it refuses
any unknown op.

## Hostile-input caps (`USER_PART_LIMITS`, enforced in code)

| Cap | Value |
|---|---|
| Records in one part | 500 |
| Nesting depth (outer part = 1) | 4 |
| Records after full nested expansion | 20,000 |
| Parameters per part / bindings per parameter | 16 / 16 |
| Parameter range | finite, within ±1,000,000 (mm or degrees), min ≤ default ≤ max |
| Name / slug / id / parameter-name length | 80 / 48 / 64 / 32 |
| Binding path | at most 8 steps; `__proto__`, `prototype` and `constructor` refused |
| Parts per project file | 64 (the rest are skipped with a warning) |
| One definition's JSON | 1,000,000 characters |

Allowed op namespaces: `primitive.`, `profile.`, `text.`, `hardware.`, `kit.`,
`raspberrypi.`, `transform.`, `boolean.`, `group.`, `modify.`, `style.`, `user.`. An op must
also be one this build knows, or a part the same set carries. These are refused:
`body.delete`, `asset.image`, `library.*`, any reference to an id outside the part,
document-lineage fields (`supersedes`, `consumes`), conditions (`when`, which read document
context), and sketch reference images.

Self-containment, cycles, depth and fan-out are checked as a set with an iterative,
memoised walk. A hostile graph costs time linear in its size and never hangs the fold.

## What `ai-001`'s trust model implies (`ai-partner.md` decision 7)

- A part's **name** is untrusted text from whoever wrote the file, like a body name. Any AI
  context must carry it inside the escaped `document_data` block, never as instructions.
  Part definitions carry no free-text intent field in v1, so there is nothing more to quote.
- Saving to the local library is a **human-confirmed** action. No AI tool writes the library
  (decision 7's "no library-write tool"). An AI turn may *place* a part the registry already
  has: that is an ordinary `append` on the fork, and the definition rides along by adoption.
- Every cap above holds whatever the source: file, gist, library or AI fork.

## Capture

`definePartFromSelection(doc, id, { name, exposeParams })` (`src/core/library.js`, which
delegates to `userPart.js`'s `capturePart`) walks back from the body's terminal record.
It follows `target` and `operands` (what the value was built from), not `supersedes` or
`consumes` (document bookkeeping). That pulls in operand bodies such as a boolean's tool or
a group's members. Each record is rewritten with local ids and stripped to the allowed
fields.

The result is **verified** before it is returned. It is expanded and folded at the
document's resolution, and must equal the body's geometry exactly: same part names, hidden
parts, colours, and every polygon coordinate. If not, capture throws rather than return a
part that builds something else.

The part's value is its result record's value with its parts intact (registry `resultId`).
That is what keeps sub-part names like `board`, `usb-a` and `mount-hole-1`.

Known limits in v1:

- Document-level user colour overrides (`style.recolor`'s `colorOverride`) are not carried
  into a part.
- A lineage with a conditional or left-broken step can't be captured; capture refuses it by
  name.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

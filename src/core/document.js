// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The command layer: the one place a running app mutates the document.
 *
 * ## Why this exists and what it deliberately is not
 *
 * `replay.js` folds an ordered array of records into a scene, and `ndjson.js`
 * serialises that array — both read-only, both handed a complete document. Neither
 * holds a **growing** log that a running app appends to, which is what placing a
 * primitive from the UI actually needs (`TODO/ui-010`). This module is that log,
 * and CLAUDE.md's Architecture rule is the shape it has to take:
 *
 * > Every document mutation goes through the command layer inside a transaction
 * > with an origin. Never mutate document state directly from a component — that
 * > breaks undo.
 *
 * So `append` **requires** an origin and refuses without one. This task does not
 * build undo/redo; the point of demanding the origin now is that undo/redo scoping
 * ("remote or programmatic edits never land in the local user's own undo stack")
 * cannot be retrofitted onto a log whose entries never recorded who wrote them.
 *
 * Also deliberately absent, and separate later tasks: undo/redo itself,
 * multi-record transaction batching, and persistence.
 *
 * ## Supersession: one logical body, many records (`TODO/ui-012`)
 *
 * The log is append-only and its entries are immutable, so *editing* a body —
 * moving it, turning it — cannot mean rewriting the record that created it. It
 * means appending a new record whose input is the old one's result. That leaves
 * two live values in `scene.byId` describing the same physical object, and a
 * `bodies()` that reported one Body per record with an id would render both: the
 * body would visibly **double** on the first drag. That is the same class of
 * defect as `TODO/ACCEPTANCE.md` scenario 1's "placing a second body silently hid
 * the first", just inverted, and equally obvious to a user on their first try.
 *
 * The mechanism: a record may carry **`supersedes`**, naming the record whose
 * logical body it replaces. This module keeps two indexes over that field —
 * every id's *lineage root* and every root's current *terminal* record — and
 * `bodies()` walks roots rather than records, reporting one Body per lineage:
 *
 * - `Body.id` is the **lineage root's** id, so a body's identity survives being
 *   moved. A selection, a three.js mesh and a `data-testid` all keep pointing at
 *   the same thing across a drag instead of being torn down and rebuilt.
 * - `Body.recordId` is the **terminal** record's id, and its geometry is what
 *   renders — always the newest state.
 * - `Body.op`/`name` come from the **root**, because that is what the body *is*:
 *   a Cube stays a Cube after you move it. `Body.params` follow the same
 *   principle rather than the same record — a transform's params are never read
 *   as dimensions of the part (that is the point), but a later record that
 *   rebuilt the body from *edited* params is exactly what the Inspector must
 *   show, so they come from the newest record carrying the root's own op. See
 *   `src/core/paramEdit.js` (`TODO/ui-029`), which is also where the next edit
 *   reads its base from, so the panel and the next mutation cannot disagree.
 *
 * Chosen over the alternative shape — a mutable "latest id" pointer, or deleting
 * the superseded entry — precisely because it deletes nothing. Every intermediate
 * record stays in `entries` and in `scene.byId`, which is what a future undo/redo
 * needs; supersession only changes what gets *double-rendered*, never what is
 * kept. Superseding a record that is not its lineage's current terminal is
 * rejected outright: that would fork a lineage into two live representations of
 * one body, which is the very bug this exists to prevent.
 *
 * One deliberately generic detail: a transform record may carry a `rotation`
 * param, and `bodies()` reads `Body.rotationDeg` off the terminal record's params
 * (falling back to the root's). This module does **not** know what a rotation
 * means or how to compose one — `src/core/transform.js` computes the absolute
 * value and carries it forward on every transform record. This is "state carried
 * on the record", not rotation-specific logic in the command layer.
 *
 * ## Consumption: several bodies retired into one (`TODO/ui-014`)
 *
 * A boolean is the other shape a record can have: two or more existing bodies go
 * in, one new body comes out, and the operands stop being separately selectable.
 * That is *not* supersession, and overloading `supersedes` into an array to say
 * it would conflate two different claims under one field name. A moved Cube is
 * still that Cube — which is exactly why `Body.op`/`params`/`name` are read from
 * the lineage root. A Subtract result is not "the base, but consumed": it is a
 * new thing built from two others, and asking whose `op` and `params` it
 * inherits has no honest answer.
 *
 * So a record may instead carry **`consumes`**, an array of ids it retires into
 * itself. The mechanism is deliberately generic rather than boolean-specific —
 * `ui-015`'s "combine into group" is the same 2-in/1-out shape and should need
 * no change here:
 *
 * - The consuming record is its **own new lineage root**, which is already what
 *   happens for any record without `supersedes`. Its identity, name and op are
 *   its own.
 * - Each consumed id is validated exactly as a `supersedes` reference is — it
 *   must exist, be its lineage's current terminal, and not already have been
 *   consumed. Both fields go through `resolveLiveRoot` for that reason.
 * - `mergedInto` records root → consuming record. `bodies()` skips a retired
 *   root, and `currentIdOf` walks *through* one, so a stale reference to a body
 *   that has since been unioned into something else still resolves forward — the
 *   same guarantee supersession already gives a moved body.
 * - Nothing is deleted here either. Every operand's record stays in `entries`
 *   and in `scene.byId`, which is what a future undo/redo needs.
 *
 * The two fields are mutually exclusive; a record setting both is rejected.
 *
 * ## A sketch is an ordinary primitive (`TODO/sketch-001`)
 *
 * `TODO/ui-020` once routed loose `sketch.line` records past the kernel into a parallel
 * entity map. `sketch-001` replaced that with `primitive.sketch`, a body like any other
 * that folds through the kernel, so this module no longer treats any op prefix
 * specially. A file still holding the retired records is cleaned up at parse time
 * (`src/core/project.js`), with a warning per record.
 *
 * ## Undo/redo: remove-and-rebuild, not inverse-append (`TODO/data-003`)
 *
 * CLAUDE.md has required origin-scoped undo since before M0, and `append` has
 * demanded an origin since `ui-010` precisely so it could be built later. The
 * design question the TODO left open was what "undo" *means* for an append-only
 * log: append a compensating inverse record, or take the step back out and
 * re-derive. **Decided: take it out and re-derive**, for three reasons that are
 * not matters of taste:
 *
 * 1. `docs/decisions/interaction-model-qa.md` section 18 settles it from the
 *    user's side — "nothing in the timeline removes history; **only Undo removes
 *    a recent step**", and section 19's own worked example is Undo *removing* an
 *    inserted row. An inverse-append would put two rows in `ui-032`'s History
 *    panel for one press of Undo and one press of Redo, which is the opposite of
 *    what was confirmed.
 * 2. There is no honest inverse for a `consumes` record. Undoing a boolean has
 *    to un-retire two lineages, and nothing that can be *appended* does that —
 *    `mergedInto` is set by the consuming record's existence. An "anti-record"
 *    would be a second, parallel history mechanism invented to avoid touching
 *    the first.
 * 3. It composes with `data-004` instead of fighting it. Removing a step is
 *    `splice` + re-fold; `data-004`'s insert-at-the-marker is `splice` + re-fold;
 *    its mid-history param edit is `splice` + re-fold. Redo is literally an
 *    **insert-at-index** — the primitive section 18 requires of `data-004` —
 *    already built and exercised here.
 *
 * What keeps that safe is that the rebuild re-runs {@link ingest}, the *same*
 * function `append` uses, over the remaining entries in order. There is no
 * second implementation of lineage bookkeeping to drift: `supersedes`,
 * `consumes`, `mergedInto`, root ordering and the trial fold are all re-derived
 * by the code that derived them the first time. A rebuild that throws restores
 * the captured indexes and rethrows, so a refused undo changes nothing — the
 * same atomic contract `data-004` needs for a broken replay.
 *
 * Origin scoping is the other half. Only a `'local'` step is ever pushed onto
 * the undo stack, so a programmatic or remote record is in `entries`, in
 * `bodies()` and (later) in the History panel, but is never something Undo can
 * reach. And because removing a record that a *later* record still references
 * would leave a hole, `undo` refuses by name when a step someone else added
 * depends on the one being taken back — section 19's point 4, rather than
 * deleting their work.
 *
 * The stacks are deliberately **in-memory only**: section 19 decided undo does
 * not survive a reload or an Open, so nothing here is serialised and the seed
 * loop at the bottom of `createDocument` clears them.
 *
 * ### Restore, don't re-fold, when nothing has changed since (`TODO/core-030`)
 *
 * Remove-and-rebuild re-runs the whole log through the kernel: 70-78 ms on
 * `data-004`'s 200-record scene and 124-163 ms on the 24-body composite scene, on
 * the main thread, per press. But the fold is deterministic, so when *nothing* has
 * been written since a step — the ordinary Undo — the state the document had just
 * before that step is exactly what the rebuild would produce, and it is simply put
 * back: O(1), synchronous, with every refusal contract above untouched.
 *
 * "Nothing has been written since" is one integer: every change to entries,
 * marker or derived state assigns a fresh `stateToken`, and each step records the
 * token of the state it produced. Undo restores only on a match; otherwise — a
 * remote or MCP record interleaved, a batch that failed part-way, a step aged out
 * of the bounded `restorableSteps` window — it re-folds exactly as it always did,
 * refusing by name where it always did. Redo is the mirror, and a fold-path Undo
 * still leaves its Redo restorable. The rebuild stays the single source of truth;
 * the restore only ever hands back a state that rebuild itself produced.
 * `historyRestore.spec.js` runs every script against an always-fold twin
 * (`restorableSteps: 0`) and a fresh fold, comparing after each action.
 *
 * What still re-folds: the row actions themselves, Open/restore, and the fallback
 * cases above. `TODO/core-031` made that re-fold cheap rather than asynchronous —
 * see the next note.
 *
 * ### A re-fold reuses every record whose inputs did not change (`TODO/core-031`)
 *
 * The re-fold still runs the one `ingest` loop over the whole entry list — the
 * single-implementation argument below is untouched — but each record's build is
 * looked up in a per-document {@link import('./kernel/index.js').FoldCache}: keyed by
 * the record object, checked against its JSON (so a record mutated in place is never
 * served stale), the **identical** operand values it resolves to, and the registry.
 * Geometry is immutable and a build is pure, so a hit *is* the value a fresh build
 * returns; a record downstream of a change sees a new operand object and rebuilds.
 * A named composite's `combine()`d scene part is kept beside its value, because on a
 * composite-heavy scene that union, not the build, was most of a cached re-fold.
 *
 * Measured (Node, medians, `bench/results/2026-09-24-core-031.md`): every row action
 * on `data-004`'s 200-record scene 72-74 ms → 0.7-2.1 ms, on the 24-body scene
 * 118-158 ms → 0.1-6.5 ms, and the Undo fallback behind an MCP write 73 / 131 ms →
 * 0.9 / 0.1 ms. **Every refusal stays synchronous, named and atomic** — nothing about
 * the contract `ui-032`, the stores and Open read changed, which is why this was
 * chosen over moving the fold into the evaluation worker
 * (`docs/decisions/kernel-evaluation-worker.md`, slice 3). What it cannot make cheap
 * is work that really is new: Open of records never built here (a cold fold), and an
 * edit at the root of one long dependent lineage, where every later row does depend
 * on it. `foldCache: null` is the uncached fold the equivalence specs compare against.
 *
 * ## Revising the log, not just growing it (`TODO/data-004`)
 *
 * Everything above grows the log at one end. Sections 15-18 of
 * `docs/decisions/interaction-model-qa.md` ask for four more things, and the
 * whole of `data-004` is the observation that they are **one** operation:
 *
 * | Section | What the user does | What the log does |
 * |---|---|---|
 * | 15 | Edit a past step's params | swap one entry's record, re-fold |
 * | 16 | Suppress / unsuppress a step | flag one entry, re-fold without it |
 * | 17 | Move a step up / down | swap two entries, re-fold |
 * | 18 | Roll back, insert at the marker, roll forward | move a boundary / splice, re-fold |
 *
 * So `data-004` **widens {@link rebuildFrom}** rather than building a second
 * replay mechanism beside it — exactly what `data-003`'s retirement note asked
 * for. The widening is two parameters' worth: entries may carry `suppressed`,
 * and the fold stops at a **rollback marker** (`rollbackAt` — the *count* of
 * active entries, `null` when the whole log is active). Everything else is the
 * same `ingest` loop `append` has always used, which is still the entire
 * correctness argument: there is one implementation of `supersedes`/`consumes`/
 * `mergedInto`/root ordering and no chance of a partial-refold disagreeing with
 * a full one.
 *
 * Full re-fold, not incremental, per this task's own Proposed fix and CLAUDE.md's
 * "measure before optimising". (`core-031` later made it incremental *by
 * construction* — the same full loop, with unchanged builds served from the fold
 * cache — once it was measured as a real cost; see the note above.) Measured when
 * this landed, worst case (editing the **first** row, so everything re-folds),
 * against the real kernel:
 *
 * | Log | Median full re-fold |
 * |---|---|
 * | 40 records, 10 bodies | 17 ms |
 * | 100 records, 25 bodies | 34 ms |
 * | 200 records, 50 bodies | 67 ms |
 *
 * Linear in record count and dominated by the kernel — each body there carries a
 * `modify.filletRim`, the most expensive op in the registry — not by this
 * module's bookkeeping. A re-fold happens on a deliberate row action, never per
 * frame, so CLAUDE.md's 16 ms budget (which is about pan/zoom/drag) is not the
 * bar this has to clear. No incremental re-fold until a document is big enough
 * for that to be measured as a real problem.
 *
 * ### The broken-step contract (what `ui-032` consumes)
 *
 * A row action either succeeds or is **rejected atomically**: section 15's
 * "the edit is atomic — if any record in the replay throws, nothing changes",
 * which section 16 (suppress), 17 (reorder) and 18 (roll forward) all reuse by
 * name. The refusal is a {@link ReplayRejection} carrying a {@link BrokenStep} —
 * the row's id, its **1-based step number**, its label and a reason — so the
 * panel can say `Step 4 (Fillet Cube 1) can't be built: radius 4 mm doesn't fit`
 * and chip that exact row, rather than parsing a string. Two reason shapes for a
 * refusal, deliberately only two (a merge adds a third, for a row it flags rather than
 * refuses — see the replica note below):
 *
 * - **`needs <name>`** — the row references a record this fold no longer has
 *   (suppressed out, reordered after it, superseded by an insert). Checked
 *   *before* the trial fold, because `ingest`'s own message names an **id** and
 *   a user needs a **body name**: section 16's `Step 3 (Union) needs Cube 1`.
 * - **`can't be built: <why>`** — the record's own build threw, which is the
 *   failure mode `modify.filletRim`'s `assertRadiusFits` already produces. This
 *   task's Proposed fix asked for exactly that reuse rather than a new
 *   "invalid downstream" concept.
 *
 * The **inactive tail is different**, and section 18 says why: an insert while
 * rolled back succeeds even if it breaks a tail row, because inserting was the
 * user's intent and the tail is not part of the evaluated document. So after
 * every successful re-fold the tail is **shadow-checked** — folded into a
 * throwaway document — and the rows that would not build come back from
 * {@link WarpDocument.brokenSteps} and as `TimelineRow.broken`, informationally.
 * It costs nothing when nothing is rolled back, which is the common case.
 *
 * **Not built, deliberately:** section 18's "Unsure" re-parenting of a tail row
 * onto an inserted record. The flag-and-resolve contract above is what that
 * section *requires*; re-parenting is what it asks `data-004` to measure. It is
 * measured and filed as `TODO/data-005`, not built here — rewriting what a
 * record points at is a different claim from replaying it, and guessing it wrong
 * is how a replay silently produces the wrong solid.
 *
 * ## Rows left broken, and conditional rows (`TODO/ui-052`)
 *
 * The broken-step contract above says a failure in the **active** document is always
 * an atomic rejection. `ui-052` keeps that as the default and adds exactly two
 * exceptions, both of which the user has to choose:
 *
 * - **Left broken.** Changing a Pi 4 to a Pi 5 under a cube snapped to its AV jack
 *   breaks the snap; the repair dialog can commit the change anyway and *flag* the row.
 *   That is a per-entry flag, `leftBroken`, recorded next to `suppressed` and persisted
 *   the same way (`project.js`). A flagged row that fails is **tolerated**: reported in
 *   {@link WarpDocument.brokenSteps} and on `TimelineRow.broken`, and folded as
 *   **identity** — its id is bound to the geometry it would have changed, with its
 *   lineage bookkeeping done exactly as `ingest` does it. So a broken snap leaves its
 *   body where it was before the snap (visible, selectable, fixable) rather than making
 *   it vanish, and a later move of that body still builds on it. Every *un*flagged row is
 *   judged exactly as before, so a new breakage anywhere is still refused.
 * - **Conditional.** A record may carry `when: { ref, param, in }` (`./condition.js`).
 *   While false, a **creation** record takes its whole lineage out of the fold, silently
 *   — "this body only exists on a Pi 4" is the intended state, not an error, so nothing
 *   is reported broken and the rows carry `TimelineRow.inactiveBy` instead. Any other
 *   record (a snap, a sub-part Subtract) is folded as identity, the same way a left-broken
 *   row is: "this operation only happens on a Pi 4". A record elsewhere that *uses* an
 *   inactive body is broken, with the condition in its reason — conditions never spread
 *   without the user choosing them. A condition that cannot be evaluated is broken, and
 *   tolerated: it is a flag, never a guess.
 *
 * Both are revised in place through {@link WarpDocument.reviseRecords}, the multi-row
 * sibling of {@link WarpDocument.replaceRecord} that `ui-052`'s dialog commits as one
 * Undo step.
 *
 * ## Deleting a body: an appended tombstone (`TODO/ui-051`)
 *
 * "Nothing is deleted" above is about the **log**, and deleting an object keeps it
 * true. Removing a body from the scene appends one more record, `op: 'body.delete'`,
 * that `supersedes` the body's current terminal — so the tombstone *is* the lineage's
 * terminal, and `bodies()` skips any lineage whose terminal is one. Everything else
 * falls out of machinery that already exists:
 *
 * - **Identity.** A later record that supersedes, consumes, or names the deleted body
 *   as an operand is refused by name (`resolveLiveRoot` and the operand check in
 *   `ingest`), rather than resurrecting something the user can no longer see.
 * - **Undo** is remove-and-rebuild like every other step: take the tombstone out and
 *   the previous terminal — position, rotation, colour overrides, params — is live
 *   again, exactly. Deleting N bodies is N tombstones in **one** `appendAll`, so one
 *   press of Undo.
 * - **Save/reload** is just another NDJSON line. **Suppressing** a Delete row un-deletes
 *   the body (section 16's fold simply skips it) — a legitimate consequence, documented.
 *
 * A tombstone is routed **past the kernel**: it builds no
 * geometry, needs no registry entry, and is never in `scene.byId`.
 *
 * Removing one **part** of a group is different: the body survives, so it is an
 * ordinary supersession by a `group.removePart` record the kernel really evaluates
 * (`kernel/group.js`'s `removePart`), not a tombstone.
 *
 * Rejected: a `consumes` record that produces nothing. `consumes` means "retired *into*
 * this new body"; `mergedInto` would point at a body that never renders, and
 * `currentIdOf` walking forward through it would resolve a stale reference to nothing.
 *
 * ## The document is a replica (`TODO/data-010`)
 *
 * Every mutation also records what `data-009`'s merge core needs, and {@link
 * WarpDocument.mergeFrom} merges another replica's {@link WarpDocument.mergeState} in.
 * `docs/decisions/document-sync.md` is the design; this is how it sits on this module.
 *
 * **Where the metadata lives.** Per row: a born-or-revival stamp, a position key with its
 * stamp, a record stamp and stamps for the `suppressed`/`leftBroken` flags — beside the record,
 * never inside it, in a side table by record id (`metaById`), not on the entry objects, so
 * `entries` is exactly what it was for every reader that never merges. Per document:
 * tombstones (`dead`, id → stamp), four last-writer-wins registers and a stamp per user-part
 * definition. A log no edit here has stamped — a seed, a loaded file — **derives** it:
 * position keys from row order, every stamp counter 0 under the fixed replica `legacy`, a
 * register only where the value differs from what its absence means. Deterministic, so two
 * builds upgrading one file agree and their copies merge.
 *
 * **Every mutator stamps, once per transaction.** Rather than each mutator writing its own
 * stamps, each is wrapped (`STAMPED_MUTATORS`) so the before/after diff of the whole
 * transaction is stamped with **one** clock tick ({@link stampSince}): a new row is born and
 * keyed between its neighbours, a removed row is tombstoned, a changed record or flag is
 * stamped, a moved row is re-keyed, a changed register is written. A nested call (a `batch`
 * build, `append` → `appendAll` → `insertAt`) joins its caller's transaction, so a batch
 * shares one stamp. Computing it from the diff is what makes "a mutator forgot to stamp"
 * impossible rather than silent; the table is what each one ends up writing:
 *
 * | Mutator | Writes |
 * |---|---|
 * | `append`, `appendAll`, `insertAt` | new rows: `born`, `pos`, `rec`; the marker if it inserts at it; a user part it places |
 * | `replaceRecord` | `rec` |
 * | `reviseRecords` | `rec` and `leftBroken` of each row; `born`/`pos`/`rec` of rows it adds; a tombstone for one it removes |
 * | `setSuppressed` | `suppressed` |
 * | `moveStep` | the moved row's `pos` |
 * | `removeRecords` (Undo AI turn) | tombstones; the marker if it moves |
 * | `restoreEntries` (Undo merge, `TODO/ui-062`) | whatever its diff is: tombstones for rows that go, a fresh `born` for rows that come back, `rec`/flags for rows put back, `pos` for rows re-ordered, the marker |
 * | `deleteBodies`, `removePart`, `setColorOverride`, `clearColorOverride`, `renameBody` | a new row (through `appendAll`) |
 * | `rollBackTo`, `rollForward` | the `rollbackAfter` register |
 * | `setResolution` | the `resolution` register |
 * | `setStandingInstructions` | the `standingInstructions` register |
 * | `setBuildVolume` | the `buildVolume` register |
 * | user-part adoption (inside the fold of a placement) | the part's definition stamp |
 * | `undo`, `redo`, `batch` | whatever the change they make is: Undo of a placement tombstones its rows, Redo brings them back with a fresh `born` that beats the tombstone, Undo of an edit stamps the old record as a new write |
 * | `loadEntries`, the seed | derive (above), never stamp |
 * | `mergeFrom` | takes the merged state's stamps as they are; writes nothing of its own |
 *
 * **Removal is a tombstone.** Undo, Undo AI turn and `removeRecords` still splice the entry out
 * of `entries` — the fold and every reader are unchanged — and the diff records the id with
 * the transaction's stamp. The record is not kept in it; the undo stack already holds it.
 *
 * **The marker is an anchor.** The register stores "after row X" (`{ row, key, born }`), and
 * `rollbackAt()` is still the count every consumer reads: kept as a count locally, derived
 * from the anchor after a merge. A step's `index` and marker counts mean nothing once a merge
 * has inserted rows before them, so a step pushed before the most recent merge is reversed by
 * its rows' **position keys** and a re-derived marker (`key`, `anchorBefore`/`anchorAfter`).
 *
 * **`mergeFrom`.** Refuses a copy of another project by name ({@link UnrelatedProjectError}),
 * merges with `mergeStates`, and re-folds through the one {@link rebuildFrom} with
 * `tolerateAll`, so there is still exactly one implementation of lineage bookkeeping. A row
 * that no longer builds is **flagged, never re-parented** (`docs-022`): it folds as identity,
 * exactly as a row left broken does (`ui-052`). Its reason is the third `BrokenStep` shape,
 * `conflicts with step N (<label>[, via <origin>])`, naming the row that advanced the lineage
 * it wanted — derived from the log at fold time, so it survives a reload — or the existing
 * `needs <name>` when a reference is missing. It never touches either undo stack, bumps the
 * state token (so `core-030`'s restore path falls back to a re-fold for anything older), and
 * a throw anywhere puts everything back.
 *
 * **Deliberate deviation: the conflict flag is derived, not a stamped write.** `data-010`'s
 * Proposed fix asks for the `leftBroken` a merge sets to be an ordinary stamped write. It is
 * set on the entry (so the fold tolerates it, a save writes it, and a reload keeps it) but not
 * stamped into the merge state, because a written flag makes the merge depend on its order:
 * merging A ← B can break a row that merging in C then repairs, and the stale flag would then
 * exist on that path only (`documentMerge.spec.js`, "path independence of flags"). Derived
 * from the merged log, the same set of rows is flagged on every replica in every order. A
 * flag a person writes (Leave broken) is stamped as usual.
 *
 * **Local Undo after a merge.** `undo` still refuses by name when a later row from another
 * origin depends on the step. A step whose rows a merge has since removed or edited is
 * **dropped** from the stack instead of resurrecting or half-applying it: Undo returns the
 * step with `dropped` and a `note` ({@link undoAfterMergeNote}) for the store to show.
 *
 * ## Loud locally, lenient remotely
 *
 * `replay.js` skips and reports a bad record because a document can arrive from an
 * untrusted URL. A local mutation is the opposite case: it is this project's own
 * code, so a record that fails to evaluate is a bug and must be loud. `append`
 * therefore trial-folds the record first and **rejects it without appending** if it
 * fails, rather than committing a line that would poison every later replay of the
 * same document.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js.
 * `src/stores/document.js` is the thin reactive wrapper components talk to.
 *
 * @module core/document
 */

import { registry as defaultRegistry } from './kernel/registry.js'
import { isResolution, policyFor, resolutionLabel } from './kernel/tessellation.js'
import { conditionContextOf, conditionShapeError, describeCondition, evaluateCondition } from './condition.js'
import { INSTRUCTIONS_MAX_LENGTH, INTENT_MAX_LENGTH, cleanText } from './intent.js'
import { DEFAULT_BUILD_VOLUME, normalizeBuildVolume } from './buildVolume.js'
import { currentParamsRecordOf } from './paramEdit.js'
import { RENAME_OP, nameOverrideOf, normalizeBodyName } from './naming.js'
import { applyAction, emptyScene } from './replay.js'
import {
  bakedRecolorsOf,
  effectiveUserPart,
  ensureProjectParts,
  isUserPartOp,
  projectPartsSnapshot,
  requiredUserParts,
  restoreProjectParts,
  setProjectParts,
} from './userPart.js'
import { foldColorOverrides } from './colorOverride.js'
import {
  VARIABLE_LIMITS,
  VARIABLE_OP,
  bindingCountOf,
  readVariables,
  resolveRecord,
  usesVariables,
  variableRecordError,
} from './variables.js'
import { ASSET_OP, validateImageAsset } from '../sketch/imageAsset.js'
import { MESH_ASSET_OP, validateMeshAsset } from '../io/meshAsset.js'
import { counterOfId, createClock, createProjectId, createReplicaId } from './replica.js'
import { compareKeys, keysBetween } from './merge/positionKey.js'
import { LEGACY_STAMP, highestCounter } from './merge/state.js'
import { diffStates, liveOrder, mergeStates, relatedness, resolveRollback } from './merge/merge.js'
import { conflictAttribution } from './origin.js'

/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('./kernel/registry.js').RegistryEntry} RegistryEntry */
/** @typedef {import('./replay.js').Scene} Scene */
/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./kernel/group.js').Group} Group */

/**
 * @typedef {object} DocumentEntry
 * @property {OpRecord} record The line as it was appended.
 * @property {string} origin Who wrote it — `'local'` for this user's own edits.
 * @property {boolean} [suppressed] Section 16: the row is still in the log and
 *   still in `ui-032`'s list, but the fold skips it and the document evaluates
 *   as if it never happened. Absent means active; nothing is ever deleted.
 * @property {boolean} [leftBroken] `TODO/ui-052`: the user chose **Leave broken** for
 *   this row. If it fails to build it is tolerated — reported, and folded as identity —
 *   rather than refusing the whole document. Absent means an ordinary row, whose failure
 *   is an atomic rejection. See the module note.
 * @property {string} [intent] `TODO/ai-003`: the design intent behind the row — for an AI
 *   write, the user's request plus the model's one-line rationale. Beside the record, like
 *   `origin`, never inside it, so every record line stays byte-identical. Untrusted text,
 *   cleaned and capped by `src/core/intent.js`. Absent when there is none (never `''`).
 */

/**
 * One row that cannot be built, named the way a user can act on it.
 *
 * **This is the contract `ui-032` consumes** — the thing `data-004`'s
 * Interaction model says the panel "cannot build correct feedback without". It
 * arrives two ways, and both carry this same shape rather than a string the
 * panel would have to parse:
 *
 * - thrown inside a {@link ReplayRejection}, when an action on the **active**
 *   document is refused atomically (sections 15-18);
 * - returned from {@link WarpDocument.brokenSteps} and set on
 *   `TimelineRow.broken`, when an **inactive** tail row is flagged
 *   informationally by the shadow check (section 18).
 *
 * @typedef {object} BrokenStep
 * @property {string} id The failing record's id; `''` for a record with none.
 * @property {number} step Its **1-based** row number, as the timeline numbers
 *   rows — section 15's `Step 4 (…)`, not an array index.
 * @property {string} label The row label, from the same shallow table Undo's
 *   tooltip uses. `ui-032` renders its own richer label and may ignore this.
 * @property {string} reason One of three shapes:
 *   - `needs <body name>` — the row references a record this fold no longer has;
 *   - `can't be built: <why>` — the record's own build threw;
 *   - `conflicts with step N (<label>)` or `conflicts with step N (<label>, via <origin>)`
 *     (`TODO/data-010`) — a tolerated (left-broken or merged) row whose `supersedes`/`consumes`
 *     target is no longer its lineage's terminal, naming the row that advanced that lineage.
 *     Derived from the log at fold time, so it survives a reload and reads the same on every
 *     copy; a `local` row is never called "by you" (`TODO/data-013`, `conflictAttribution`).
 *     A refused local edit never carries it.
 *   See the module note.
 */

/**
 * One row of `ui-032`'s History list, derived — never stored.
 *
 * @typedef {object} TimelineRow
 * @property {number} step 1-based row number.
 * @property {string} id The record's id, `''` if it has none.
 * @property {OpRecord} record The record itself, for the panel's own labelling
 *   and for the op's param editor.
 * @property {string} origin Section 19's origin chip (`local`, `mcp`, …).
 * @property {string | null} intent `TODO/ai-003`: the row's design intent, or `null`.
 * @property {string} label Shallow label — `Place Cube 1`, `Chamfer Cube 1`.
 * @property {boolean} suppressed Section 16: greyed, struck through, chipped.
 * @property {boolean} active `false` for a row past the rollback marker —
 *   dimmed, chipped `inactive`, and simply not evaluated (section 18).
 * @property {string | null} broken Why the row does not build — the tail shadow check's
 *   reason, a left-broken row's, or a condition that cannot be evaluated — or `null`.
 * @property {string | null} relinkTo `TODO/data-006`: for a broken **inactive** row that
 *   broke because an active step moved the body it builds on, the record
 *   {@link WarpDocument.relinkStep} would point it at; otherwise `null`. Never set on an
 *   active row, nor on a row whose own build throws.
 * @property {InactiveBy | null} inactiveBy `TODO/ui-052`: the condition that is currently
 *   keeping this row out of the fold, or `null`. Not the same as `suppressed` (the user
 *   switched it off) or `active: false` (past the rollback marker).
 * @property {RowCondition | null} condition The condition this row carries or inherits
 *   from its body's creation record, whether or not it is currently true — so the chip
 *   stays visible on a Pi 4 as well as a Pi 5.
 */

/**
 * @typedef {object} InactiveBy
 * @property {string} refId The body the condition reads; `''` for a variable condition.
 * @property {string} param `''` for a variable condition.
 * @property {any[]} values
 * @property {string} [var] `TODO/core-050`: the project variable a `{ var, in }` condition reads.
 */

/**
 * @typedef {object} RowCondition
 * @property {string} refId `''` for a variable condition (`TODO/core-050`).
 * @property {string} param `''` for a variable condition.
 * @property {string} [var] The project variable a `{ var, in }` condition reads.
 * @property {any[]} values
 * @property {'self' | 'lineage'} scope `self` when the row carries `when` itself;
 *   `lineage` when it belongs to a body whose creation record does.
 * @property {string} sentence `Only when Raspberry Pi 1's Model is Pi 4`.
 * @property {string} chip `if Raspberry Pi 1 = Pi 4`.
 */

/**
 * A body the fold is leaving out because of a condition on its creation record — what
 * the object list shows greyed, so it can still be selected and its condition edited
 * even though it cannot be picked in the viewport.
 *
 * @typedef {object} InactiveBody
 * @property {string} id
 * @property {string} name
 * @property {string} op
 * @property {'inactive' | 'invalid'} state `invalid` when the condition cannot be
 *   evaluated (and the row is reported broken).
 * @property {RowCondition} condition
 */

/**
 * One row of a {@link WarpDocument.reviseRecords} call.
 *
 * @typedef {object} RecordRevision
 * @property {string} id The row to revise.
 * @property {OpRecord} [record] Its replacement; omitted to change only the flag.
 * @property {boolean} [leftBroken] Set or clear the row's Leave-broken flag.
 */

/**
 * Whether a `Move up` / `Move down` button is honestly pressable.
 *
 * Section 17 requires this be **cheap and static** — read off operand/
 * `consumes`/`supersedes` references and the marker, with no fold — so the
 * disabled state is right *before* the press. The full replay stays the final
 * arbiter; this only rules out what is provably illegal.
 *
 * @typedef {object} MoveLegality
 * @property {boolean} allowed
 * @property {string | null} reason The tooltip when it is not, e.g.
 *   `Step 3 uses step 2's result`. `null` when it is.
 */

/**
 * How one undoable row action changed the log, so undo can invert it.
 *
 * Deliberately *not* a before/after snapshot of `entries`: a snapshot restored
 * on undo would silently delete any record another writer appended in between,
 * which is the exact thing section 19's origin scoping exists to prevent. An
 * inverse is position-independent and survives that.
 *
 * @typedef {object} LogRevision
 * @property {'replace' | 'suppress' | 'reorder' | 'rollback' | 'resolution' | 'revise'} kind
 *   `resolution` (`TODO/core-035`) revises no entry at all — only the design
 *   resolution the whole log is folded at. `revise` (`TODO/ui-052`) swaps several
 *   entries' records and Leave-broken flags at once — see `items`.
 * @property {string} [id] The row acted on.
 * @property {OpRecord} [from] `replace`: the record as it was.
 * @property {OpRecord} [to] `replace`: the record it became.
 * @property {boolean} [fromSuppressed]
 * @property {boolean} [toSuppressed]
 * @property {number} [delta] `reorder`: `-1` up, `+1` down.
 * @property {string} [fromResolution] `resolution`: the setting before.
 * @property {string} [toResolution] `resolution`: the setting after.
 * @property {Array<{ id: string, from: OpRecord, to: OpRecord, fromLeftBroken: boolean, toLeftBroken: boolean }>} [items]
 *   `revise`: every row changed, before and after.
 * @property {{ at: number, records: OpRecord[] }} [add] `revise` (`TODO/sketch-003`): records
 *   this step put into the log at `at` — the photo an Edit sketch session added. Its
 *   inverse is `remove`, so Undo takes them back out in the same step.
 * @property {{ at: number, records: OpRecord[] }} [remove] The inverse of `add`.
 */

/**
 * A replay refused, naming the row that stopped it.
 *
 * Thrown — not returned — because section 15's decided answer is "reject
 * atomically": there is no partial success to hand back, and a caller that
 * ignored a returned error list would leave the user with the silently-wrong
 * geometry this whole milestone exists to prevent. The {@link BrokenStep} rides
 * on the error so `ui-032` never parses {@link Error.message}.
 */
export class ReplayRejection extends Error {
  /** @param {BrokenStep} step */
  constructor(step) {
    super(`Step ${step.step} (${step.label}) ${step.reason}`)
    this.name = 'ReplayRejection'
    /** @type {BrokenStep} */
    this.step = step
  }
}

/**
 * @typedef {object} Body
 * @property {string} id The **lineage root's** id — the body's stable logical
 *   identity, unchanged by any number of transforms. See the supersession note.
 * @property {string} recordId The **terminal** record's id, whose geometry this
 *   is. Equal to `id` for a body that has never been transformed.
 * @property {string} name Display name, e.g. `"Cube 1"`. From the root record.
 * @property {string} op Registry key the body was created by. From the root.
 * @property {Record<string, any>} params What the body *is*, plain JSON — not
 *   how it has since been moved. The root record's params, unless a later
 *   record in the lineage rebuilt the body from edited ones (`TODO/ui-029`), in
 *   which case the newest of those; a `transform.*` record's params are never
 *   read here. See `src/core/paramEdit.js`'s `currentParamsRecordOf`.
 * @property {[number, number, number]} rotationDeg Absolute rotation carried on
 *   the terminal record, degrees per axis. `[0, 0, 0]` for an unturned body.
 * @property {ColorOverride[]} [colorOverrides] User colour overrides in force for
 *   this body (TODO/data-005), one entry per distinct `subPart` plus at most one
 *   whole-body entry (no `subPart`) — undefined when none of this lineage's
 *   records ever set one, the default that leaves every existing body's rendered
 *   appearance unchanged. See `colorOverridesOf`.
 * @property {Geom3 | Group} geometry Derived, disposable — never persisted.
 */

/**
 * One user colour override, as `Body.colorOverrides` reports it — read-only,
 * derived from the newest `style.recolor` record targeting this part (or the
 * whole body). `TODO/ui-037` writes these; `src/render/mesh.js` will eventually
 * be what interprets `color`/`colorAlpha`, exactly as it will for `hidden`.
 *
 * @typedef {object} ColorOverride
 * @property {number} color `0xRRGGBB`.
 * @property {number} [colorAlpha] `(0, 1]`. Omitted when 1.
 * @property {string} [subPart] The named part this override targets. Absent
 *   means the whole body.
 */

/**
 * One thing the user did, which may have taken more than one record.
 *
 * Section 19's granularity rule is "one user-meaningful action = one step": a
 * whole gizmo drag, one param commit, one drag-placement — and a composite
 * placement is two records (`ui-030`: the recipe, then the translate that puts
 * it where the pointer let go), which must still be one press of Undo.
 *
 * @typedef {object} HistoryStep
 * @property {string} origin Always `'local'` for anything on the stacks.
 * @property {string} label What the button says it will undo, e.g. `Move Cube 1`.
 * @property {OpRecord[]} records In log order.
 * @property {any} meta Opaque to this module — `src/stores/document.js` parks the
 *   selection that existed before the step here, so undo can restore it without
 *   this framework-free module knowing what a selection is.
 * @property {number} [index] Where the step's first record sat when it was
 *   removed; redo re-inserts there. See the undo/redo note above.
 * @property {string} [key] `TODO/data-010`: the position key the step's first record had
 *   when it was removed. Once a merge has happened since, Redo re-inserts by this key, since
 *   a merge may have put rows before `index`.
 * @property {string | null} [anchorBefore] `TODO/data-010`, a `rollback` row action only: the
 *   marker before it as a row id (`null` none, `''` before the first row), so an Undo after a
 *   merge can put it back where it was rather than at a stale count.
 * @property {string | null} [anchorAfter] The same, after the action.
 * @property {'removed' | 'revised'} [dropped] Set on the value {@link WarpDocument.undo}
 *   returns when it dropped the step instead of undoing it, because a merge since removed or
 *   edited it (`TODO/data-010`). Nothing was changed but the stack.
 * @property {string} [note] With `dropped`: what to tell the user ({@link undoAfterMergeNote}).
 * @property {LogRevision} [revision] Set instead of `records` for a `data-004`
 *   row action, which revises an entry rather than adding one. Undo applies the
 *   inverse; redo applies it again.
 * @property {number | null} [rollbackBefore] The marker before the step, so undo
 *   puts it back — section 18: "Undo removes the inserted row and moves the
 *   marker back".
 * @property {number | null} [rollbackAfter] The marker after it, for redo.
 * @property {HistoryStep[]} [parts] Set on a step {@link WarpDocument.batch} made out of a
 *   **mix** of record steps and row actions (`TODO/core-056`): the steps the build pushed,
 *   oldest first, each keeping its own `records` / `revision` / markers and, for a record
 *   part, the `index` it sat at. Undo applies the parts newest-first, Redo oldest-first, all
 *   or nothing. A step with `parts` has no `revision` of its own; its `records` are the
 *   record parts' records, concatenated.
 */

/**
 * @typedef {object} TransactionOptions
 * @property {string} origin Who is writing — `'local'` for this user's own edits.
 * @property {string} [label] Overrides the derived step label.
 * @property {any} [meta] Carried on the step, opaque here.
 * @property {string | Readonly<Record<string, string>>} [intent] `TODO/ai-003`: the design
 *   intent each new entry carries. A string applies to every record of the write; a map by
 *   record id lets one insert land a whole forked AI turn with each call's own intent
 *   (`ai-005`). Honoured by `append`, `appendAll` and `insertAt`.
 * @property {Readonly<Record<string, string>>} [entryOrigins] `TODO/ai-014`: `insertAt` only —
 *   the origin each inserted **entry** keeps, by record id, where it differs from `origin`.
 *   `origin` still decides which undo stack the write touches; this only lets **Undo AI turn**
 *   put back a row the turn took out (a deleted variable) with the origin it had, without the
 *   re-insert landing on the user's own undo stack.
 */

/**
 * @typedef {object} LoadOptions
 * @property {boolean} [tolerateAll]
 * @property {string} [standingInstructions]
 * @property {import('./buildVolume.js').BuildVolume} [buildVolume]
 * @property {readonly import('./userPart.js').UserPartDefinition[]} [userParts] `TODO/core-037`.
 * @property {Readonly<Record<string, string>>} [unavailableParts] `TODO/core-037`: op → why.
 * @property {import('./merge/validate.js').MergeOverlay} [merge] `TODO/data-011`: the
 *   validated merge section of a version-2 project file; omitted, the metadata is derived.
 */

/**
 * @typedef {object} WarpDocument
 * @property {readonly DocumentEntry[]} entries
 * @property {readonly OpRecord[]} records
 * @property {Scene} scene Current derived scene.
 * @property {import('./kernel/index.js').FoldCache | null} foldCache This document's
 *   per-record build cache (`TODO/core-031`), for a throwaway document folding a
 *   prefix of this one (the History preview) to share; `null` when opened without one.
 * @property {number} version Bumps on every successful append, undo and redo.
 * @property {(record: OpRecord, transaction: TransactionOptions) => { record: OpRecord, scene: Scene }} append
 * @property {(records: readonly OpRecord[], transaction: TransactionOptions) => { records: OpRecord[], scene: Scene }} appendAll
 * @property {<T>(build: (document: WarpDocument) => T, options?: { label?: string }) => T} batch
 * @property {(id: string) => string | undefined} originOf
 * @property {(id: string) => string | undefined} intentOf `TODO/ai-003`: a record's design
 *   intent, `undefined` when it has none.
 * @property {() => string} standingInstructions `TODO/ai-003`: the project's standing
 *   instructions, `''` when there are none.
 * @property {(text: string, transaction: TransactionOptions) => void} setStandingInstructions
 * @property {() => import('./buildVolume.js').BuildVolume} buildVolume `TODO/io-007`: the
 *   printer's build volume, a fresh copy — the default 220 × 220 × 250 mm until set.
 * @property {(volume: import('./buildVolume.js').BuildVolume, transaction: TransactionOptions) => void} setBuildVolume
 * @property {() => import('./userPart.js').UserPartDefinition[]} userParts `TODO/core-037`:
 *   the user-part definitions the project carries, in op order.
 * @property {(id: string) => string | undefined} currentIdOf
 * @property {(id: string) => string | undefined} rootOf
 * @property {(id: string) => OpRecord[]} lineageOf
 * @property {(id: string) => OpRecord | undefined} recordOf
 * @property {() => TimelineRow[]} timeline
 * @property {() => BrokenStep[]} brokenSteps
 * @property {() => number | null} rollbackAt
 * @property {(id: string, record: OpRecord, transaction: TransactionOptions) => { scene: Scene }} replaceRecord
 * @property {(id: string, transaction: TransactionOptions) => { scene: Scene }} relinkStep
 *   `TODO/data-006`: point a broken tail row at the body an active step moved.
 * @property {(id: string, suppressed: boolean, transaction: TransactionOptions) => { scene: Scene }} setSuppressed
 * @property {(changes: readonly RecordRevision[], transaction: TransactionOptions, options?: { append?: readonly OpRecord[], remove?: readonly string[] }) => { scene: Scene }} reviseRecords
 * @property {() => import('./variables.js').Variable[]} variables `TODO/core-050`: the project
 *   variables the current fold resolved bindings against, in log order.
 * @property {() => Map<string, OpRecord>} assets Every folded `asset.image` record, by id
 *   (`TODO/sketch-003`) — the reference photos sketch slices name. Never bodies.
 * @property {() => Map<string, OpRecord>} meshAssets Every folded top-level `asset.mesh`
 *   record, by id (`TODO/io-009`). Kept apart from `assets()`, whose readers
 *   (the assistant's photo tools, the sketch editor) treat every entry as a photo. Never bodies.
 * @property {() => InactiveBody[]} inactiveBodies
 * @property {(id: string) => RowCondition | null} conditionOf
 * @property {(id: string, override: { color: number, colorAlpha?: number, subPart?: string }, transaction: TransactionOptions) => { record: OpRecord, scene: Scene }} setColorOverride
 * @property {(id: string, target: { subPart?: string }, transaction: TransactionOptions) => { record: OpRecord, scene: Scene }} clearColorOverride
 * @property {(id: string, name: string | null, transaction: TransactionOptions) => { record: OpRecord, scene: Scene }} renameBody
 *   `TODO/core-038`: one undoable `style.rename` record; `null`/blank clears the override.
 * @property {(ids: readonly string[], transaction: TransactionOptions) => { records: OpRecord[], scene: Scene }} deleteBodies
 * @property {(id: string, partName: string, transaction: TransactionOptions) => { record: OpRecord, scene: Scene }} removePart
 * @property {(id: string, delta: number) => MoveLegality} canMove
 * @property {(id: string, delta: number, transaction: TransactionOptions) => { scene: Scene }} moveStep
 * @property {(index: number, records: readonly OpRecord[], transaction: TransactionOptions) => { records: OpRecord[], scene: Scene }} insertAt
 * @property {(ids: readonly string[], transaction: TransactionOptions) => { scene: Scene }} removeRecords `TODO/ai-006`: take a set of records back out atomically (Undo AI turn).
 * @property {(target: readonly DocumentEntry[], rollbackAt: number | null, transaction: TransactionOptions) => { scene: Scene }} restoreEntries
 *   `TODO/ui-062`: put the whole log back to `target` in one stamped fold (Undo merge). Never a local step.
 * @property {(id: string, transaction: TransactionOptions) => { scene: Scene }} rollBackTo
 * @property {(transaction: TransactionOptions) => { scene: Scene }} rollForward
 * @property {() => Body[]} bodies
 * @property {() => boolean} canUndo
 * @property {() => boolean} canRedo
 * @property {() => HistoryStep | undefined} pendingUndo
 * @property {() => HistoryStep | undefined} pendingRedo
 * @property {() => HistoryStep | undefined} undo
 * @property {() => HistoryStep | undefined} redo
 * @property {() => void} clearHistory
 * @property {(entries: readonly DocumentEntry[], rollbackAt?: number | null, resolution?: string, options?: LoadOptions) => void} loadEntries
 * @property {() => string} resolution The design resolution (`TODO/core-035`) every
 *   curve without an explicit `segments` is faceted at — `legacy` for a document from
 *   before the setting existed.
 * @property {(resolution: string, transaction: TransactionOptions) => { scene: Scene }} setResolution
 * @property {() => string | null} ensureProjectId `TODO/data-013`: this document's project id,
 *   minting it now if the document may have one and has none yet; `null` for a legacy
 *   document, which never mints.
 * @property {() => string} replicaId `TODO/data-008`: the replica id this document's new
 *   record ids carry — random per instance, so a reload and a second tab get their own.
 * @property {(prefix?: string) => string} nextId A fresh `prefix-replica-counter` id, never
 *   one already in the log (active, suppressed or rolled back).
 * @property {() => import('./merge/state.js').MergeState} mergeState `TODO/data-010`: this
 *   replica's merge state — the live rows with their stamps, the tombstones, the registers
 *   and the user-part definitions. A fresh value; the records are shared, not copied.
 * @property {() => number} mergeClock `TODO/data-011`: the merge clock's counter — at least
 *   every stamp this replica holds. What a project file's `merge.clock` records.
 * @property {(counter: number) => void} observeMergeClock `TODO/ai-017`: a Lamport *receive*
 *   with no data — move the merge clock past `counter`, so this replica's next write is stamped
 *   later than another replica's writes up to it. Changes nothing else (no row, no version).
 * @property {(state: import('./merge/state.js').MergeState, transaction: TransactionOptions) => { scene: Scene, change: ReturnType<typeof diffStates>, conflicts: MergeConflict[] }} mergeFrom
 *   `TODO/data-010`: merge another replica's state in and re-fold. See the module note.
 * @property {(label: string) => string} nextName
 */

/**
 * The merge metadata one live row carries (`TODO/data-010`): {@link MergeEntry} without the
 * record, origin and intent, which the {@link DocumentEntry} already holds. Kept in a side
 * table keyed by record id rather than on the entry, so `entries` stays exactly what it was
 * before this task for every reader that never merges. Immutable once stored.
 *
 * @typedef {object} EntryMeta
 * @property {import('./replica.js').Stamp} born Born-or-revival stamp.
 * @property {[string, import('./replica.js').Stamp]} pos Position key and the stamp that wrote it.
 * @property {import('./replica.js').Stamp} rec The record's stamp.
 * @property {[boolean, import('./replica.js').Stamp]} [suppressed] Absent: never written.
 * @property {[boolean, import('./replica.js').Stamp]} [leftBroken] Absent: never written.
 */

/**
 * One row a merge left broken, and the row it lost to (`TODO/data-010`).
 *
 * @typedef {object} MergeConflict
 * @property {string} id
 * @property {number} step 1-based.
 * @property {string} label
 * @property {string} reason The row's {@link BrokenStep} reason.
 * @property {string | null} lostTo The row that advanced the lineage this one wanted, or
 *   `null` when it failed for another reason (a missing reference).
 */

/**
 * Every mutator wrapped so its whole effect is stamped as one transaction — the module
 * note's table, as code. A mutator missing here would write nothing a merge can see.
 * (`append`, `setColorOverride`, `clearColorOverride`, `renameBody`, `deleteBodies` and `removePart` all
 * write through `appendAll`, and user-part adoption happens inside the fold of whichever of
 * these placed the part.)
 */
const STAMPED_MUTATORS = Object.freeze([
  'appendAll',
  'insertAt',
  'removeRecords',
  'restoreEntries',
  'batch',
  'undo',
  'redo',
  'replaceRecord',
  'relinkStep',
  'reviseRecords',
  'setSuppressed',
  'moveStep',
  'rollBackTo',
  'rollForward',
  'setResolution',
  'setStandingInstructions',
  'setBuildVolume',
])

/**
 * A merge was refused because the state is a copy of a different project
 * (`relatedness` says `unrelated`). Callers decide whether to offer anything else (`io-012`).
 */
export class UnrelatedProjectError extends Error {
  constructor() {
    super('document.mergeFrom: that is a copy of a different project, so it cannot be merged into this one')
    this.name = 'UnrelatedProjectError'
  }
}

/**
 * What Undo says when it drops a step a merge has since removed or edited, instead of
 * resurrecting or half-applying it (`TODO/data-010`). The store shows it as-is.
 *
 * @param {string} label The step's label, e.g. `Move Cube 1`.
 * @param {'removed' | 'revised'} cause
 * @returns {string}
 */
export function undoAfterMergeNote(label, cause) {
  const what = cause === 'removed' ? 'removed it' : 'edited it since'
  return `"${label}" can't be undone — a merged change ${what}. It has been taken off the Undo list.`
}

/**
 * Two records are the same record: the same object, or the same JSON.
 *
 * @param {OpRecord} a
 * @param {OpRecord} b
 * @returns {boolean}
 */
function sameRecord(a, b) {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/**
 * @param {{ widthMm: number, depthMm: number, heightMm: number }} a
 * @param {{ widthMm: number, depthMm: number, heightMm: number }} b
 * @returns {boolean}
 */
function sameVolume(a, b) {
  return a.widthMm === b.widthMm && a.depthMm === b.depthMm && a.heightMm === b.heightMm
}

/**
 * @param {ReadonlyArray<{ key: string }>} sequence
 * @returns {boolean}
 */
function increasingKeys(sequence) {
  for (let i = 1; i < sequence.length; i += 1) {
    if (compareKeys(sequence[i - 1].key, sequence[i].key) >= 0) return false
  }
  return true
}

/**
 * Which surviving rows a transaction **moved**: those whose old position keys are out of
 * order in the new log. Prefer the hinted ids (a `moveStep` names the row it moves; a swap of
 * two adjacent rows is otherwise ambiguous), else the complement of a longest increasing run.
 *
 * @param {ReadonlyArray<{ id: string, key: string }>} sequence Survivors in their new order.
 * @param {ReadonlySet<string>} hint
 * @returns {Set<string>}
 */
function movedRows(sequence, hint) {
  if (increasingKeys(sequence)) return new Set()
  if (hint.size > 0) {
    const rest = sequence.filter((slot) => !hint.has(slot.id))
    if (increasingKeys(rest)) return new Set(sequence.filter((slot) => hint.has(slot.id)).map((slot) => slot.id))
  }
  /** @type {number[]} */
  const tails = []
  /** @type {number[]} */
  const previous = []
  sequence.forEach((slot, index) => {
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (compareKeys(sequence[tails[middle]].key, slot.key) < 0) low = middle + 1
      else high = middle
    }
    previous[index] = low > 0 ? tails[low - 1] : -1
    tails[low] = index
  })
  const kept = new Set()
  for (let at = tails.length > 0 ? tails[tails.length - 1] : -1; at >= 0; at = previous[at]) kept.add(sequence[at].id)
  return new Set(sequence.filter((slot) => !kept.has(slot.id)).map((slot) => slot.id))
}

/**
 * The ids a step's reorders moved — the hint {@link movedRows} prefers.
 *
 * @param {HistoryStep | undefined} step
 * @returns {Set<string>}
 */
function reorderHintOf(step) {
  /** @type {Set<string>} */
  const ids = new Set()
  if (step === undefined) return ids
  for (const part of step.parts ?? [step]) {
    if (part.revision?.kind === 'reorder' && typeof part.revision.id === 'string') ids.add(part.revision.id)
  }
  return ids
}

/**
 * The rollback marker as a row id: `null` for none, `''` for "before the first row",
 * otherwise the id of the row it sits after.
 *
 * @param {readonly DocumentEntry[]} list
 * @param {number | null} count
 * @returns {string | null}
 */
function anchorIdOf(list, count) {
  if (count === null) return null
  for (let at = Math.min(count, list.length) - 1; at >= 0; at -= 1) {
    const id = list[at].record.id
    if (id !== undefined) return id
  }
  return ''
}

/**
 * Three finite numbers, or not.
 *
 * @param {unknown} value
 * @returns {value is [number, number, number]}
 */
function isVec3(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
}

/**
 * The op `setColorOverride` appends (TODO/data-005) — see its own doc comment in
 * `src/core/kernel/registry.js` for why the kernel fold does not interpret it.
 */
const RECOLOR_OP = 'style.recolor'


/**
 * The tombstone `deleteBodies` appends (`TODO/ui-051`) — see the module note. Routed
 * past the kernel.
 */
const DELETE_OP = 'body.delete'

/** The op `removePart` appends; a real kernel op (`kernel/registry.js`). */
const REMOVE_PART_OP = 'group.removePart'

/**
 * The colour override currently in force for a body, read back off its lineage
 * (TODO/data-005) — `bodies()`'s analogue of `currentParamsRecordOf` for
 * `Body.params`, but keyed by *which part* rather than always the whole body,
 * since an override may target one named sub-part (`ui-016`'s single-part
 * addressing) without touching its siblings.
 *
 * Walked **root to terminal**, keeping the newest `style.recolor` record per
 * `subPart` (or per "the whole body", the `undefined` key) — so overriding
 * `usbc` and, later, `ethernet` tracks both independently, and re-overriding
 * `usbc` again only replaces its own entry. A record whose `colorOverride` is
 * `null` is a reset (`TODO/ui-037`) and drops its own key. A lineage with no such
 * record — or whose every override has since been reset — returns `undefined`,
 * the default-unchanged case every existing body keeps.
 *
 * A user part in the lineage contributes the colours it was saved with
 * (`TODO/core-054`, `bakedRecolorsOf`) ahead of the lineage's own records.
 *
 * @param {readonly OpRecord[]} lineage Root-first, as `lineageOf` returns.
 * @param {(op: string) => import('./userPart.js').UserPartDefinition | undefined} [partOf]
 *   Where a part's definition comes from; the registry's effective one by default.
 * @returns {ColorOverride[] | undefined}
 */
function colorOverridesOf(lineage, partOf = effectiveUserPart) {
  /** @type {OpRecord[]} */
  const stream = []
  for (const record of lineage) {
    // A placed user part carries the colours it was saved with (`TODO/core-054`) as
    // `style.recolor` steps inside its definition; they come first, so anything the user
    // does to the placed copy afterwards wins (a Reset clears the key, as on any body).
    if (isUserPartOp(record.op)) {
      const definition = partOf(record.op)
      if (definition !== undefined) stream.push(...bakedRecolorsOf(definition, partOf))
    }
    stream.push(record)
  }
  return foldColorOverrides(stream)
}

/**
 * Verb per op, for the Undo/Redo tooltip's `Undo: Move Cube 1` (section 19).
 *
 * Deliberately shallow: naming the *action* is all a button needs. `ui-032`'s
 * timeline rows want the richer `Chamfer Top (+Z) 5 mm on Cube 1`, which reads
 * params and belongs with the panel that shows them, not here. An op missing
 * from this table is a creation op and is labelled `Place <name>`, which is why
 * the hardware/kit/raspberrypi families need no entries.
 */
const STEP_VERBS = Object.freeze({
  'transform.translate': 'Move',
  'transform.rotate': 'Rotate',
  'boolean.union': 'Union',
  'boolean.subtract': 'Subtract',
  'boolean.intersect': 'Intersect',
  'group.assemble': 'Group',
  'group.snap': 'Snap',
  'group.align': 'Align',
  'modify.filletRim': 'Fillet',
  'modify.chamferRim': 'Chamfer',
  'modify.enlarge': 'Resize',
  'modify.fit': 'Fit',
  'modify.bisect': 'Bisect',
  'transform.mirror': 'Mirror',
  'style.recolor': 'Recolor',
  'style.rename': 'Rename',
  'body.delete': 'Delete',
})

/**
 * Every record id this record depends on — the four ways one line of the log can
 * name another.
 *
 * Used by `undo` to refuse taking a step back out from under something that
 * still points at it. It reads `target`/`operands` the same way
 * `src/core/kernel/index.js` builds `inputRefs` (a ref may be a bare id or a
 * `{ id, pieces }` sub-part address, `core-024`), plus the two lineage fields
 * this module owns. Missing one of these would be the *silent* failure mode:
 * the undo would succeed and the rebuild would then fail, or worse, succeed
 * against the wrong operand.
 *
 * @param {OpRecord} record
 * @returns {string[]}
 */
function referencedIdsOf(record) {
  /** @type {string[]} */
  const ids = []
  /** @param {unknown} ref */
  const push = (ref) => {
    if (typeof ref === 'string') ids.push(ref)
    else if (ref && typeof ref === 'object' && typeof (/** @type {any} */ (ref).id) === 'string') {
      ids.push(/** @type {any} */ (ref).id)
    }
  }
  push(record.supersedes)
  push(record.target)
  for (const consumed of record.consumes ?? []) push(consumed)
  for (const operand of record.operands ?? []) push(operand)
  return ids
}

/**
 * The lineage-shaping fields a `data-004` edit may **not** touch.
 *
 * Section 15 edits a step's *parameters*. What the step operates on is the
 * shape of the log itself: every later record's `supersedes`/`target`/
 * `operands` was resolved against it, and {@link WarpDocument.canMove}'s static
 * legality check reads it. Changing one of these under the name "edit" would be
 * a reorder or a re-parent wearing an edit's clothes.
 */
const SHAPE_FIELDS = Object.freeze(['op', 'supersedes', 'consumes', 'target', 'operands', 'when'])

/**
 * The one op change a revision may make: a Snap or Align **detached** into the plain
 * translate it amounted to (`TODO/ui-052`'s Detach). Anything else would be a different
 * operation wearing the old one's id.
 */
const DETACHABLE_OPS = Object.freeze(new Set(['group.snap', 'group.align']))

/**
 * The id a `target`/`operands` entry names, bare or sub-part addressed.
 *
 * @param {unknown} ref
 * @returns {string | undefined}
 */
function refIdOf(ref) {
  if (typeof ref === 'string') return ref
  const id = ref && typeof ref === 'object' ? /** @type {any} */ (ref).id : undefined
  return typeof id === 'string' ? id : undefined
}

/**
 * An entry with its Leave-broken flag set or cleared — cleared by *omitting* the key,
 * so an ordinary entry stays byte-identical to what it was before this task.
 *
 * @param {DocumentEntry} entry
 * @param {boolean} leftBroken
 * @returns {DocumentEntry}
 */
function withLeftBroken(entry, leftBroken) {
  const { leftBroken: _previous, ...rest } = entry
  return leftBroken ? { ...rest, leftBroken: true } : rest
}

/**
 * The copy of an entry a fold of *another* document takes: record, origin, the two
 * flags that change how it folds, and (`TODO/ai-003`) its design intent, which does not
 * change the fold but must survive the load path. Used by the load path and by every
 * throwaway document (the History preview, the tail shadow check, the impact check).
 *
 * @param {DocumentEntry} entry
 * @returns {DocumentEntry}
 */
export function foldableEntry(entry) {
  return {
    record: entry.record,
    origin: entry.origin,
    ...(entry.suppressed === true ? { suppressed: true } : {}),
    ...(entry.leftBroken === true ? { leftBroken: true } : {}),
    ...withIntent(entry.intent),
  }
}

/**
 * `{ intent }` when there is one (cleaned and capped), `{}` otherwise — so an entry never
 * carries an empty intent and a plain document's entries are exactly what they were.
 *
 * @param {unknown} intent
 * @returns {{ intent?: string }}
 */
function withIntent(intent) {
  const text = cleanText(intent, INTENT_MAX_LENGTH)
  return text === '' ? {} : { intent: text }
}

/**
 * The entry origin a transaction gives one inserted record, when it names one
 * (`TODO/ai-014`'s `entryOrigins`); `undefined` to use the transaction's own origin.
 *
 * @param {TransactionOptions | undefined} transaction
 * @param {OpRecord} record
 * @returns {string | undefined}
 */
function entryOriginFor(transaction, record) {
  const origins = transaction?.entryOrigins
  if (origins === undefined || record.id === undefined || !Object.hasOwn(origins, record.id)) return undefined
  const origin = origins[record.id]
  return typeof origin === 'string' && origin.length > 0 ? origin : undefined
}

/**
 * The intent a transaction gives one record (`TODO/ai-003`).
 *
 * @param {TransactionOptions | undefined} transaction
 * @param {OpRecord} record
 * @returns {{ intent?: string }}
 */
function intentFor(transaction, record) {
  const intent = transaction?.intent
  if (intent === undefined) return {}
  if (typeof intent === 'string') return withIntent(intent)
  return record.id === undefined ? {} : withIntent(intent[record.id])
}

/**
 * How many recent steps can be undone/redone by restoring rather than re-folding,
 * by default (`TODO/core-030`).
 *
 * Each such step holds shallow copies of the derived indexes and `entries` — maps of
 * short strings, O(records) — plus a reference to a scene whose geometry is shared
 * with its neighbours, not copied. Bounded so a long session on a large document
 * cannot grow that without limit; 50 presses of Undo in a row is well past what a
 * user does before re-folding one step would be the least of their waits.
 */
const DEFAULT_RESTORABLE_STEPS = 50

/**
 * Index every record in an entry list by id — including the ones a fold is
 * *skipping*, which is the point: the record a suppressed step's dependant is
 * missing is precisely one the derived indexes no longer hold.
 *
 * @param {readonly DocumentEntry[]} list
 * @returns {Map<string, OpRecord>}
 */
function recordMapOf(list) {
  /** @type {Map<string, OpRecord>} */
  const byId = new Map()
  for (const entry of list) {
    if (entry.record.id !== undefined) byId.set(entry.record.id, entry.record)
  }
  return byId
}

/**
 * What a user would call `id` — the record's own name, or its lineage root's,
 * walked back along `supersedes`.
 *
 * Section 16's refusal is `Step 3 (Union) needs Cube 1`, not "needs op-7". A
 * transform or param-edit record carries no name of its own (`transform.js`
 * explains why), so the walk is what turns a reference to a body's *current*
 * record into the body's name. Cycle-guarded: a malformed document gets a short
 * answer, not a hang.
 *
 * @param {string} id
 * @param {Map<string, OpRecord>} byId
 * @returns {string} The name, or `id` itself when nothing names it.
 */
function displayNameOf(id, byId) {
  // `TODO/core-038`: a `style.rename` anywhere in the lineage — including *after* `id`, which
  // may be an older record of it — wins over every generated name.
  const override = renameOverridesIn(byId).get(rootIdIn(id, byId))
  if (override !== undefined) return override
  const visited = new Set()
  let cursor = id
  for (;;) {
    if (visited.has(cursor)) return id
    visited.add(cursor)
    const record = byId.get(cursor)
    if (record === undefined) return id
    if (typeof record.name === 'string' && record.name.length > 0) return record.name
    if (typeof record.supersedes !== 'string') return id
    cursor = record.supersedes
  }
}

/**
 * The lineage root of `id`, walked back along `supersedes` (cycle-guarded).
 *
 * @param {string} id
 * @param {Map<string, OpRecord>} byId
 * @returns {string}
 */
function rootIdIn(id, byId) {
  const visited = new Set()
  let cursor = id
  for (;;) {
    visited.add(cursor)
    const next = byId.get(cursor)?.supersedes
    if (typeof next !== 'string' || visited.has(next) || !byId.has(next)) return cursor
    cursor = next
  }
}

/** @type {WeakMap<Map<string, OpRecord>, { size: number, overrides: Map<string, string> }>} */
const renameOverrideCache = new WeakMap()

/**
 * The newest `style.rename` name per lineage root in `byId` (`TODO/core-038`), for
 * {@link displayNameOf}. Memoised per map and invalidated by its size, because the fold's
 * map grows as rows are folded and a message may be built mid-fold.
 *
 * @param {Map<string, OpRecord>} byId
 * @returns {Map<string, string>}
 */
function renameOverridesIn(byId) {
  const cached = renameOverrideCache.get(byId)
  if (cached !== undefined && cached.size === byId.size) return cached.overrides
  /** @type {Map<string, string>} */
  const overrides = new Map()
  for (const record of byId.values()) {
    if (record.op !== RENAME_OP || record.id === undefined) continue
    const checked = normalizeBodyName(record.params?.name === undefined ? null : record.params.name)
    if (!checked.ok) continue
    const root = rootIdIn(record.id, byId)
    if (checked.name === null) overrides.delete(root)
    else overrides.set(root, checked.name)
  }
  renameOverrideCache.set(byId, { size: byId.size, overrides })
  return overrides
}

/**
 * A failed ingest's message, with this module's own framing stripped off.
 *
 * `ingest` says `document.append: modify.filletRim could not be applied — …`,
 * which is right for a thrown developer error and wrong inside `Step 4 (Fillet
 * Cube 1) can't be built: …`, where the row and the op are already named.
 *
 * @param {unknown} error
 * @returns {string}
 */
function reasonOf(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^document\.append: /, '').replace(/^\S+ could not be applied — /, '')
}

/**
 * Create a document.
 *
 * @param {object} [options]
 * @param {Readonly<Record<string, RegistryEntry>>} [options.registry] Op catalogue;
 *   defaults to the real kernel registry. A test passes a fake one (CLAUDE.md:
 *   "always mock at the boundary").
 * @param {readonly OpRecord[]} [options.actions] Records to seed the log with, e.g.
 *   a loaded NDJSON document.
 * @param {string} [options.origin] Origin recorded against the seed records.
 * @param {number} [options.restorableSteps] How many of the most recent undo (and
 *   redo) steps keep the derived state needed to reverse them **without a re-fold**
 *   (`TODO/core-030`). Older steps still undo, by re-folding. `0` turns restoring off
 *   entirely — the always-fold path, which the equivalence spec runs as the twin.
 * @param {import('./kernel/index.js').FoldCache | null} [options.foldCache] Where a
 *   re-fold looks up each record's previous build (`TODO/core-031`). Omitted: a fresh
 *   cache of this document's own. Another document's `foldCache`: share it — the tail
 *   shadow check and the History preview do, so neither rebuilds what the live
 *   document already built; only share between documents on the **same registry**
 *   (the cache also checks). `null`: no reuse, every fold builds every record — the
 *   uncached reference the equivalence specs compare against.
 * @param {string} [options.resolution] The design resolution to start at
 *   (`TODO/core-035`). Omitted: `legacy`, the old fixed 32 — so every caller that
 *   predates the setting folds exactly as before. The app's own new document passes
 *   `DEFAULT_RESOLUTION` (Normal) explicitly (`src/stores/document.js`).
 * @param {string} [options.replica] `TODO/data-008`: this document's replica id, the middle
 *   segment of every id it mints. Omitted: a fresh random one, so two documents — a tab and
 *   an AI fork, a live document and a scratch one — never mint the same id. A spec passes a
 *   fixed one. Never share one between writers.
 * @param {import('./replica.js').Clock} [options.clock] The Lamport clock ids count from;
 *   omitted, a new one for `replica`.
 * @param {() => string} [options.mintProjectId] `TODO/data-013`: where this document's project
 *   id comes from when it mints one. Omitted: {@link createProjectId}. A spec that pins file
 *   bytes passes a fixed one.
 * @param {boolean} [options.publishesUserParts] `TODO/core-037`: this is **the** open
 *   project — the app's live document (`src/stores/document.js`) — so the user-part
 *   definitions it carries are the registry's project layer (`src/core/userPart.js`):
 *   loading it replaces that layer, and placing a part pins the placed version there. Every
 *   other document (a History preview, a tail shadow check, an export re-fold, an AI fork)
 *   only *reads* the registry, so it can never change which version the live project builds.
 * @returns {WarpDocument}
 */
export function createDocument(options = {}) {
  const ops = options.registry ?? defaultRegistry
  /**
   * The design resolution (`TODO/core-035`), on the document's state rather than in the
   * log: it is a property of the whole design, not a step in its history. Every fold —
   * the append fast path, {@link rebuildFrom}, the tail shadow check — reads it.
   * @type {string}
   */
  let resolution = options.resolution ?? 'legacy'
  policyFor(resolution) // refuse an unknown preset by name, before anything else
  /** @type {import('./kernel/index.js').FoldCache | null} */
  const foldCache = options.foldCache === undefined ? new WeakMap() : options.foldCache
  const restorableSteps = Math.max(0, Math.floor(options.restorableSteps ?? DEFAULT_RESTORABLE_STEPS))

  /** @type {DocumentEntry[]} */
  const entries = []
  /** @type {Map<string, string>} */
  const originById = new Map()
  /** Every record id → the id of the lineage it belongs to. Roots map to themselves. */
  /** @type {Map<string, string>} */
  const rootById = new Map()
  /** Lineage root id → the id of the record currently representing it. */
  /** @type {Map<string, string>} */
  const terminalByRoot = new Map()
  /** Record ids that begin a lineage, in the order they were created. */
  /** @type {string[]} */
  const rootOrder = []
  /**
   * Lineage root id → the id of the record that **absorbed** it (`consumes`).
   * A root with an entry here has stopped being an independently selectable
   * body; see the consumption note above.
   */
  /** @type {Map<string, string>} */
  const mergedInto = new Map()
  /** @type {Map<string, OpRecord>} */
  const recordById = new Map()
  /**
   * `TODO/core-050`: the project variables the current fold resolved every binding against,
   * by name — read from the whole active log, not from the fold position. Derived, like the
   * indexes above, and put back with them when a re-fold is refused.
   * @type {Map<string, import('./variables.js').Variable>}
   */
  let variableTable = new Map()
  let scene = emptyScene()
  /**
   * `TODO/data-008`: replica-scoped ids. The clock is what `nextId` counts with and what
   * {@link loadEntries} advances past every id it reads, so it is always ahead of anything
   * this document has seen.
   * @type {import('./replica.js').Clock}
   */
  const clock = options.clock ?? createClock(options.replica ?? createReplicaId())
  /**
   * `TODO/data-010`: the Lamport clock merge **stamps** count with — the same replica id, a
   * separate counter from the one {@link nextId} mints ids from, so stamping a transaction
   * never changes which ids a document hands out. Observes every merged state's highest
   * counter, so a write after a merge beats everything that merge brought in.
   * @type {import('./replica.js').Clock}
   */
  const stampClock = createClock(clock.replica)
  /**
   * Section 18's rollback marker, stored as the **count of active entries** —
   * `entries[0 .. rollbackAt - 1]` are folded, the rest are the inactive tail.
   * A count rather than a row id because that is what every consumer actually
   * asks (`Rolled back to step 2 of 5`, "insert here", "is this row active"),
   * and because it stays meaningful when the row it sat after is later moved.
   * `null` means the whole log is active, which is the ordinary state.
   * @type {number | null}
   */
  let rollbackAt = null
  /**
   * `TODO/ai-003`: the project's standing instructions — free text a person types in File ▾
   * → Project settings…, injected into every agent turn (`ai-005`). Document **metadata**,
   * like the resolution, but unlike it outside the fold and outside both undo stacks: it
   * builds nothing, so changing it re-folds nothing, and Undo — which takes back geometry
   * steps — neither reaches it nor is disturbed by it. Not part of a captured
   * {@link DocumentState}, so an undo restore or a failed batch cannot roll it back either.
   * @type {string}
   */
  let standingInstructions = ''
  /**
   * `TODO/io-007`: the printer's build volume. Project metadata exactly like
   * {@link standingInstructions} — outside the fold and both undo stacks, a version bump when
   * it changes — because it builds nothing; it only changes what the fit verdict says.
   * @type {import('./buildVolume.js').BuildVolume}
   */
  let buildVolume = { ...DEFAULT_BUILD_VOLUME }
  /**
   * `TODO/core-037`: the user-part definitions this project carries, by op. Project data
   * that travels on the state line (`project.js`), outside the fold's own state and both
   * undo stacks: a definition builds nothing by itself, and keeping one after its last
   * instance is undone costs nothing — serialising writes only the ones still used.
   * Filled by {@link loadEntries} and by placing a part ({@link adoptUserPart}).
   * @type {Map<string, import('./userPart.js').UserPartDefinition>}
   */
  let userParts = new Map()
  const publishesUserParts = options.publishesUserParts === true
  /**
   * Rows that do not build, id → reason: inactive-tail rows the shadow check could not
   * build, plus (`TODO/ui-052`) active rows the user left broken and rows whose condition
   * cannot be evaluated. Recomputed on every successful re-fold.
   * @type {Map<string, string>}
   */
  let brokenById = new Map()
  /**
   * `TODO/ui-052`: rows a condition is currently keeping out of the fold, id → the
   * condition. Recomputed on every re-fold, with {@link brokenById}.
   * @type {Map<string, InactiveBy>}
   */
  let inactiveById = new Map()

  // ---- `TODO/data-010`: this document is a replica. See the module note. ----
  /**
   * Merge metadata per live row, by record id. Replaced, never mutated in place, so a
   * captured {@link DocumentState} and a transaction's mark can hold it by reference.
   * @type {Map<string, EntryMeta>}
   */
  let metaById = new Map()
  /**
   * Tombstones: id → the stamp that removed it. Kept for a row a later Redo or merge brought
   * back, as the merge core keeps them. Replaced, never mutated in place.
   * @type {Map<string, import('./replica.js').Stamp>}
   */
  let dead = new Map()
  /** @type {import('./merge/state.js').MergeRegisters} */
  let registers = { rollbackAfter: null, resolution: null, standingInstructions: null, buildVolume: null }
  /**
   * The stamp that wrote each user-part definition this project carries, by op.
   * @type {Map<string, import('./replica.js').Stamp>}
   */
  let partStamps = new Map()
  /** @type {string | null} */
  let projectId = null
  /**
   * `TODO/data-013`: whether this document may **mint** a project id — true while everything
   * in it was made here (a fresh document, New, a load of an empty file with no tombstones).
   * False once it holds content that came from outside without an id: a legacy file (version
   * 1, or version 2 from before ids were minted), a seed, or a merge that brought such rows in.
   * Two devices editing copies of one such file would otherwise mint two different ids, and
   * then refuse each other as different projects; left without one, they are compared by the
   * legacy rule (`relatedness`). Never put back by an Undo or a failed batch, like the id.
   */
  let mintable = (options.actions ?? []).length === 0
  const mintProjectId = options.mintProjectId ?? (() => createProjectId())
  /** The seed loop runs unstamped; its result is derived afterwards, like a load. */
  let seeding = true
  /** How deep in a stamped transaction we are; only the outermost one stamps. */
  let stampDepth = 0
  /**
   * How many merges this document has taken in. A history step remembers the epoch it was
   * pushed in; one older than the current epoch is reversed with the after-merge rules.
   */
  let mergeEpoch = 0
  /** @type {WeakMap<HistoryStep, number>} */
  const epochOf = new WeakMap()
  /**
   * Rows the last successful re-fold tolerated (left broken, or under `tolerateAll`), by key →
   * the row each lost to, or `null`. Read by {@link WarpDocument.mergeFrom}.
   * @type {Map<string, string | null>}
   */
  let lastTolerated = new Map()

  /**
   * Identity of the document's **whole** current state — entries, marker and
   * everything derived from them (`TODO/core-030`). Every change assigns a fresh
   * value from `tokenCounter`, never a reused one; restoring a captured state puts
   * back the token it was captured with. So "this is exactly the state step S
   * produced" is one integer comparison, and it is what makes restoring instead of
   * re-folding safe: a step is only ever reversed by restore when nothing — a remote
   * record, a half-failed batch, a load — has touched the document since.
   */
  let tokenCounter = 0
  let stateToken = 0
  // (`resolution` is part of that whole state, and so of every restorable snapshot:
  // `TODO/core-035`. A snapshot restored across a resolution change would otherwise put
  // back geometry faceted at the old setting under the new one's label.)
  /**
   * How many recent steps keep a restorable state. `0` while the seed loop at the
   * bottom runs (its history is cleared anyway, and capturing per seed record would
   * make a large seed quadratic), then {@link restorableSteps}.
   */
  let keepRestorable = 0

  /**
   * @typedef {object} DocumentState
   * @property {ReturnType<typeof captureDerived>} derived
   * @property {DocumentEntry[]} entries
   * @property {number | null} rollbackAt
   * @property {string} resolution `TODO/core-035`.
   * @property {Map<string, string>} brokenById
   * @property {Map<string, InactiveBy>} inactiveById
   * @property {number} token
   * @property {{ meta: Map<string, EntryMeta>, dead: Map<string, import('./replica.js').Stamp>,
   *   registers: import('./merge/state.js').MergeRegisters, partStamps: Map<string, import('./replica.js').Stamp>,
   *   projectId: string | null }} merge `TODO/data-010`: the merge metadata, by reference (it is
   *   replaced, never mutated). Put back by a failed batch or merge; an Undo or Redo that
   *   restores a state re-stamps on top of it instead (see {@link stampSince}).
   */

  /**
   * What reversing a history step without a fold needs, keyed by the step object.
   *
   * On an **undo**-stack step: `state` is the document before the step, restorable
   * while the document is still at `token` — the state the step produced. On a
   * **redo**-stack step it is the mirror: `state` is the document the step had
   * produced, restorable while the document is still at `token` — the state its undo
   * left. A `WeakMap`, not a field on {@link HistoryStep}, because steps are handed
   * to the store (`pendingUndo`), and a snapshot of the whole document is not
   * something a label reader should be carrying.
   *
   * @type {WeakMap<HistoryStep, { state: DocumentState, token: number }>}
   */
  const restoreOf = new WeakMap()

  function bumpState() {
    tokenCounter += 1
    stateToken = tokenCounter
  }

  /** @returns {DocumentState} */
  function captureState() {
    return {
      derived: captureDerived(),
      entries: entries.slice(),
      rollbackAt,
      resolution,
      brokenById,
      inactiveById,
      token: stateToken,
      merge: { meta: metaById, dead, registers, partStamps, projectId },
    }
  }

  /**
   * Put a captured state back, token included. Exact by construction: `scene` and
   * every geometry in it are immutable values (`applyAction` returns a new scene and
   * `evaluate` copies `byId`), `brokenById` is replaced rather than mutated, and the
   * index maps are the captured copies.
   *
   * @param {DocumentState} state
   */
  function restoreState(state) {
    resetDerived(state.derived)
    entries.length = 0
    entries.push(...state.entries)
    rollbackAt = state.rollbackAt
    resolution = state.resolution
    brokenById = state.brokenById
    inactiveById = state.inactiveById
    stateToken = state.token
    metaById = state.merge.meta
    dead = state.merge.dead
    registers = state.merge.registers
    partStamps = state.merge.partStamps
    // `TODO/data-013`: the project id is deliberately **not** put back. It is minted once, on
    // the first change, and an Undo of that change restores a snapshot from before it: putting
    // `null` back would mint a second id on the next change, splitting the project from every
    // copy saved in between. `mergeFrom` puts its own adoption back by hand when it fails.
  }

  /**
   * Attach restore data to a step just pushed onto `stack`, and drop it from the
   * step that has just aged past {@link keepRestorable}.
   *
   * @param {HistoryStep[]} stack
   * @param {HistoryStep} step
   * @param {DocumentState | null} state
   */
  function keepRestore(stack, step, state) {
    epochOf.set(step, mergeEpoch)
    if (keepRestorable === 0 || state === null) {
      restoreOf.delete(step)
    } else {
      restoreOf.set(step, { state, token: stateToken })
    }
    const aged = stack[stack.length - 1 - keepRestorable]
    if (aged !== undefined) restoreOf.delete(aged)
  }

  /**
   * The restore data for `step`, if it is valid **now** — the document is still at
   * exactly the state it was recorded against.
   *
   * @param {HistoryStep} step
   */
  function restorable(step) {
    const entry = restoreOf.get(step)
    return entry !== undefined && entry.token === stateToken ? entry.state : null
  }

  /**
   * What a transaction is stamped against: the document as it was before it.
   */
  function mergeMark() {
    return {
      entries: entries.slice(),
      rollbackAt,
      resolution,
      standingInstructions,
      buildVolume,
      partOps: new Set(userParts.keys()),
      meta: metaById,
      dead,
      registers,
      partStamps,
    }
  }

  /**
   * Run one mutator as **one stamped transaction** (`TODO/data-010`): whatever it changed is
   * recorded with a single clock tick once it returns — or throws, since `appendAll`'s fast
   * path can commit part of a batch before it throws. A nested call (a `batch` build, an
   * `append` that inserts at the marker) is part of the outer transaction. Nothing changed:
   * nothing written, no tick.
   *
   * @template T
   * @param {() => T} run
   * @param {ReadonlySet<string>} [hint] Rows this transaction moves, for {@link movedRows}.
   * @returns {T}
   */
  function stamped(run, hint = new Set()) {
    if (stampDepth > 0 || seeding) return run()
    const mark = mergeMark()
    stampDepth += 1
    try {
      return run()
    } finally {
      stampDepth -= 1
      stampSince(mark, hint)
    }
  }

  /**
   * The rollback register's value for a log and marker, read against `meta`.
   *
   * @param {readonly DocumentEntry[]} list
   * @param {number | null} count
   * @param {Map<string, EntryMeta>} meta
   * @returns {import('./merge/state.js').RollbackMarker}
   */
  function anchorOf(list, count, meta) {
    const row = anchorIdOf(list, count)
    if (row === null) return null
    const entryMeta = row === '' ? undefined : meta.get(row)
    if (entryMeta === undefined) return { row: null }
    return { row, key: entryMeta.pos[0], born: entryMeta.born }
  }

  /**
   * Record, with one stamp, everything that changed since `mark`: the diff of the entry list
   * (new rows born and keyed, removed rows tombstoned, revised records and flags stamped,
   * moved rows re-keyed between their new neighbours) and of every register. **The one
   * implementation of "every mutator stamps"**: computing it from the before/after states,
   * rather than in each mutator, is what makes a forgotten mutator impossible rather than
   * silent. Starts from the mark's metadata, so an Undo that restored an older snapshot is
   * re-stamped as the new write it is, never rolled back to older stamps.
   *
   * @param {ReturnType<typeof mergeMark>} mark
   * @param {ReadonlySet<string>} hint
   */
  function stampSince(mark, hint) {
    /** @type {Map<string, DocumentEntry>} */
    const before = new Map()
    for (const entry of mark.entries) if (entry.record.id !== undefined) before.set(entry.record.id, entry)
    const kept = (/** @type {string} */ id) => before.has(id) && mark.meta.has(id)
    /** @type {Set<string>} */
    const present = new Set()
    /** @type {Array<{ id: string, key: string }>} */
    const survivors = []
    let changed = false
    for (const entry of entries) {
      const id = entry.record.id
      if (id === undefined) continue
      present.add(id)
      const prior = before.get(id)
      if (prior === undefined || !kept(id)) {
        changed = true
        continue
      }
      survivors.push({ id, key: /** @type {EntryMeta} */ (mark.meta.get(id)).pos[0] })
      if (prior !== entry && (!sameRecord(prior.record, entry.record) ||
        (prior.suppressed === true) !== (entry.suppressed === true) ||
        (prior.leftBroken === true) !== (entry.leftBroken === true))) {
        changed = true
      }
    }
    const removed = [...before.keys()].filter((id) => !present.has(id))
    const moved = movedRows(survivors, hint)
    /** @type {Array<keyof import('./merge/state.js').MergeRegisters>} */
    const written = []
    if (anchorIdOf(mark.entries, mark.rollbackAt) !== anchorIdOf(entries, rollbackAt)) written.push('rollbackAfter')
    if (mark.resolution !== resolution) written.push('resolution')
    if (mark.standingInstructions !== standingInstructions) written.push('standingInstructions')
    if (!sameVolume(mark.buildVolume, buildVolume)) written.push('buildVolume')
    const newParts = [...userParts.keys()].filter((op) => !mark.partOps.has(op))
    if (!changed && removed.length === 0 && moved.size === 0 && written.length === 0 && newParts.length === 0) {
      metaById = mark.meta
      dead = mark.dead
      registers = mark.registers
      partStamps = mark.partStamps
      return
    }

    // `TODO/data-013`: the first change a document makes mints its project id.
    if (projectId === null && mintable) projectId = mintProjectId()

    /** @type {import('./replica.js').Stamp} */
    const stamp = { counter: stampClock.tick(), replica: stampClock.replica }

    // Keys for new and moved rows: each run of them goes between its nearest kept neighbours,
    // whose keys are in order (that is what `movedRows` guarantees).
    /** @type {Map<string, string>} */
    const keyOf = new Map()
    const keyed = entries.filter((entry) => entry.record.id !== undefined)
    const stays = (/** @type {string} */ id) => kept(id) && !moved.has(id)
    /** @type {string | null} */
    let lastKept = null
    for (let at = 0; at < keyed.length; ) {
      const id = /** @type {string} */ (keyed[at].record.id)
      if (stays(id)) {
        lastKept = /** @type {EntryMeta} */ (mark.meta.get(id)).pos[0]
        at += 1
        continue
      }
      /** @type {string[]} */
      const run = []
      while (at < keyed.length && !stays(/** @type {string} */ (keyed[at].record.id))) {
        run.push(/** @type {string} */ (keyed[at].record.id))
        at += 1
      }
      const high = at < keyed.length ? /** @type {EntryMeta} */ (mark.meta.get(/** @type {string} */ (keyed[at].record.id))).pos[0] : null
      keysBetween(lastKept, high, run.length, stamp).forEach((key, index) => keyOf.set(run[index], key))
    }

    /** @type {Map<string, EntryMeta>} */
    const nextMeta = new Map()
    for (const entry of keyed) {
      const id = /** @type {string} */ (entry.record.id)
      const meta = mark.meta.get(id)
      const prior = before.get(id)
      if (prior === undefined || meta === undefined) {
        nextMeta.set(id, {
          born: stamp,
          pos: [/** @type {string} */ (keyOf.get(id)), stamp],
          rec: stamp,
          ...(entry.suppressed === true ? { suppressed: [true, stamp] } : {}),
          ...(entry.leftBroken === true ? { leftBroken: [true, stamp] } : {}),
        })
        continue
      }
      let next = meta
      if (prior !== entry) {
        const record = !sameRecord(prior.record, entry.record)
        const suppressed = (prior.suppressed === true) !== (entry.suppressed === true)
        const leftBroken = (prior.leftBroken === true) !== (entry.leftBroken === true)
        if (record || suppressed || leftBroken) {
          next = {
            ...meta,
            ...(record ? { rec: stamp } : {}),
            ...(suppressed ? { suppressed: [entry.suppressed === true, stamp] } : {}),
            ...(leftBroken ? { leftBroken: [entry.leftBroken === true, stamp] } : {}),
          }
        }
      }
      if (moved.has(id)) next = { ...next, pos: [/** @type {string} */ (keyOf.get(id)), stamp] }
      nextMeta.set(id, next)
    }
    metaById = nextMeta

    dead = mark.dead
    if (removed.length > 0) {
      dead = new Map(mark.dead)
      for (const id of removed) dead.set(id, stamp)
    }
    registers = mark.registers
    if (written.length > 0) {
      registers = { ...mark.registers }
      for (const name of written) {
        if (name === 'rollbackAfter') registers.rollbackAfter = [anchorOf(entries, rollbackAt, nextMeta), stamp]
        else if (name === 'resolution') registers.resolution = [resolution, stamp]
        else if (name === 'standingInstructions') registers.standingInstructions = [standingInstructions, stamp]
        else registers.buildVolume = [{ ...buildVolume }, stamp]
      }
    }
    partStamps = mark.partStamps
    if (newParts.length > 0) {
      partStamps = new Map(mark.partStamps)
      for (const op of newParts) partStamps.set(op, stamp)
    }
  }

  /**
   * Derive the merge metadata of a log no merge-capable edit has touched — a seed or a loaded
   * file (`TODO/data-010` item 1): position keys from row order, every stamp
   * {@link LEGACY_STAMP}, a register only where the value differs from what an absent one
   * means. Deterministic, so two builds upgrading one file agree and their copies merge.
   */
  function deriveLegacy() {
    const keyed = entries.filter((entry) => entry.record.id !== undefined)
    const keys = keysBetween(null, null, keyed.length, LEGACY_STAMP)
    /** @type {Map<string, EntryMeta>} */
    const next = new Map()
    keyed.forEach((entry, index) => {
      next.set(/** @type {string} */ (entry.record.id), {
        born: LEGACY_STAMP,
        pos: [keys[index], LEGACY_STAMP],
        rec: LEGACY_STAMP,
        ...(entry.suppressed === true ? { suppressed: [true, LEGACY_STAMP] } : {}),
        ...(entry.leftBroken === true ? { leftBroken: [true, LEGACY_STAMP] } : {}),
      })
    })
    metaById = next
    dead = new Map()
    const anchor = anchorOf(entries, rollbackAt, next)
    registers = {
      rollbackAfter: anchor === null ? null : [anchor, LEGACY_STAMP],
      resolution: resolution === 'legacy' ? null : [resolution, LEGACY_STAMP],
      standingInstructions: standingInstructions === '' ? null : [standingInstructions, LEGACY_STAMP],
      buildVolume: sameVolume(buildVolume, DEFAULT_BUILD_VOLUME) ? null : [{ ...buildVolume }, LEGACY_STAMP],
    }
    partStamps = new Map([...userParts.keys()].map((op) => [op, LEGACY_STAMP]))
  }

  /**
   * Lay a file's validated merge section (`TODO/data-011`) over the metadata
   * {@link deriveLegacy} just derived: positions the file overrides, the stamps it carries
   * (an omitted one is the row's `born`, an omitted `born` is legacy), its tombstones,
   * register and part stamps and project id — and move the merge clock past the largest
   * counter it names, so every later local write is later than anything in the file.
   *
   * @param {import('./merge/validate.js').MergeOverlay} overlay Already validated.
   */
  function applyMergeOverlay(overlay) {
    /** @type {Map<string, EntryMeta>} */
    const next = new Map()
    for (const [id, meta] of metaById) {
      const key = overlay.pos.get(id)
      const stamps = overlay.stamps.get(id)
      if (key === undefined && stamps === undefined) {
        next.set(id, meta)
        continue
      }
      const born = stamps?.born ?? LEGACY_STAMP
      const entry = entries.find((candidate) => candidate.record.id === id)
      next.set(id, {
        born,
        pos: [key ?? meta.pos[0], stamps?.pos ?? born],
        rec: stamps?.rec ?? born,
        ...(stamps?.sup !== undefined
          ? { suppressed: [entry?.suppressed === true, stamps.sup] }
          : meta.suppressed !== undefined
            ? { suppressed: meta.suppressed }
            : {}),
        ...(stamps?.lb !== undefined
          ? { leftBroken: [entry?.leftBroken === true, stamps.lb] }
          : meta.leftBroken !== undefined
            ? { leftBroken: meta.leftBroken }
            : {}),
      })
    }
    metaById = next
    dead = new Map(overlay.dead)

    const anchor = anchorOf(entries, rollbackAt, next)
    const written = overlay.registers
    registers = {
      rollbackAfter:
        written.rollbackAfter !== undefined
          ? [anchor, written.rollbackAfter]
          : anchor === null
            ? null
            : [anchor, LEGACY_STAMP],
      resolution:
        written.resolution !== undefined
          ? [resolution, written.resolution]
          : registers.resolution,
      standingInstructions:
        written.standingInstructions !== undefined
          ? [standingInstructions, written.standingInstructions]
          : registers.standingInstructions,
      buildVolume:
        written.buildVolume !== undefined ? [{ ...buildVolume }, written.buildVolume] : registers.buildVolume,
    }
    partStamps = new Map(
      [...partStamps].map(([op, stamp]) => [op, overlay.partStamps.get(op) ?? stamp])
    )
    projectId = overlay.projectId
    stampClock.observe(overlay.highest)
  }

  /**
   * A row's position key, if it has one.
   *
   * @param {OpRecord | undefined} record
   * @returns {string | undefined}
   */
  function keyOfRecord(record) {
    return record?.id === undefined ? undefined : metaById.get(record.id)?.pos[0]
  }

  /**
   * Where a row with position key `key` belongs in the current log, or `undefined` when that
   * cannot be told (no key, or a row without merge metadata).
   *
   * @param {string | undefined} key
   * @returns {number | undefined}
   */
  function indexForKey(key) {
    if (key === undefined) return undefined
    let at = 0
    for (const entry of entries) {
      const meta = entry.record.id === undefined ? undefined : metaById.get(entry.record.id)
      if (meta === undefined) return undefined
      if (compareKeys(meta.pos[0], key) < 0) at += 1
    }
    return at
  }

  /**
   * Whether `step` was pushed before the most recent merge.
   *
   * @param {HistoryStep} step
   * @returns {boolean}
   */
  function predatesMerge(step) {
    return (epochOf.get(step) ?? mergeEpoch) !== mergeEpoch
  }

  /**
   * The marker once the `gone` records are taken out — the same count rule `removeRecords`
   * uses, normalised to `null` when no inactive row would be left.
   *
   * @param {ReadonlySet<OpRecord>} gone
   * @returns {number | null}
   */
  function markerWithout(gone) {
    if (rollbackAt === null) return null
    const kept = entries.slice(0, rollbackAt).filter((entry) => !gone.has(entry.record)).length
    const remaining = entries.filter((entry) => !gone.has(entry.record)).length
    return kept >= remaining ? null : kept
  }

  /**
   * The marker once `count` rows are inserted at `at` — `insertAt`'s rule.
   *
   * @param {number} at
   * @param {number} count
   * @returns {number | null}
   */
  function markerWithInsert(at, count) {
    if (rollbackAt === null) return null
    return at > rollbackAt ? rollbackAt : rollbackAt + count
  }

  /**
   * The marker count for an anchor row id ({@link anchorIdOf}'s shape).
   *
   * @param {string | null | undefined} anchor
   * @returns {number | null}
   */
  function markerAt(anchor) {
    if (anchor === undefined) return rollbackAt
    if (anchor === null) return null
    if (anchor === '') return 0
    const at = indexOfRecord(anchor)
    return at < 0 || at + 1 >= entries.length ? null : at + 1
  }

  /**
   * The marker an Undo of `part` leaves, for a step that predates a merge: counts recorded
   * before the merge mean nothing now, so it is re-derived from the log as it is.
   *
   * @param {HistoryStep} part
   * @returns {number | null}
   */
  function undoMarkerAfterMerge(part) {
    const revision = part.revision
    if (revision === undefined) return markerWithout(new Set(part.records))
    if (revision.kind === 'rollback') return markerAt(part.anchorBefore)
    if (revision.kind === 'revise' && revision.add) return markerWithout(new Set(revision.add.records))
    if (revision.kind === 'revise' && revision.remove) return markerWithInsert(revision.remove.at, revision.remove.records.length)
    return rollbackAt
  }

  /**
   * The Redo mirror of {@link undoMarkerAfterMerge}.
   *
   * @param {HistoryStep} part
   * @param {number} [at] Where a record part is being re-inserted.
   * @returns {number | null}
   */
  function redoMarkerAfterMerge(part, at = entries.length) {
    const revision = part.revision
    if (revision === undefined) return markerWithInsert(at, part.records.length)
    if (revision.kind === 'rollback') return markerAt(part.anchorAfter)
    if (revision.kind === 'revise' && revision.add) return markerWithInsert(revision.add.at, revision.add.records.length)
    if (revision.kind === 'revise' && revision.remove) return markerWithout(new Set(revision.remove.records))
    return rollbackAt
  }

  /**
   * Whether a merge since `step` removed or edited what it changed, so undoing it would
   * resurrect a row the other side removed or overwrite their edit (`TODO/data-010` item 7).
   *
   * @param {HistoryStep} step
   * @returns {'removed' | 'revised' | null}
   */
  function undoConflictOf(step) {
    /** @param {string | undefined} id @param {(entry: DocumentEntry) => boolean} [same] */
    const check = (id, same) => {
      if (id === undefined) return null
      const at = indexOfRecord(id)
      if (at < 0) return 'removed'
      return same === undefined || same(entries[at]) ? null : 'revised'
    }
    for (const part of step.parts ?? [step]) {
      const revision = part.revision
      /** @type {Array<'removed' | 'revised' | null>} */
      const verdicts = []
      if (revision === undefined) {
        for (const record of part.records) verdicts.push(check(record.id, (entry) => sameRecord(entry.record, record)))
      } else if (revision.kind === 'replace') {
        verdicts.push(check(revision.id, (entry) => sameRecord(entry.record, /** @type {OpRecord} */ (revision.to))))
      } else if (revision.kind === 'suppress') {
        verdicts.push(check(revision.id, (entry) => (entry.suppressed === true) === (revision.toSuppressed === true)))
      } else if (revision.kind === 'reorder') {
        verdicts.push(check(revision.id))
      } else if (revision.kind === 'revise') {
        for (const item of revision.items ?? []) verdicts.push(check(item.id, (entry) => sameRecord(entry.record, item.to)))
        for (const record of revision.add?.records ?? []) verdicts.push(check(record.id, (entry) => sameRecord(entry.record, record)))
      } else if (revision.kind === 'rollback') {
        if (anchorIdOf(entries, rollbackAt) !== part.anchorAfter) verdicts.push('revised')
        else if (typeof part.anchorBefore === 'string' && part.anchorBefore !== '') verdicts.push(check(part.anchorBefore))
      } else if (revision.kind === 'resolution') {
        if (resolution !== revision.toResolution) verdicts.push('revised')
      }
      const verdict = verdicts.find((value) => value !== null)
      if (verdict !== undefined && verdict !== null) return verdict
    }
    return null
  }

  /**
   * The step, with each record part's first record's position key, for a Redo after a merge.
   *
   * @param {HistoryStep} step
   * @returns {HistoryStep}
   */
  function withRedoKeys(step) {
    if (step.parts !== undefined) {
      return { ...step, parts: step.parts.map((part) => (part.revision === undefined ? { ...part, key: keyOfRecord(part.records[0]) } : part)) }
    }
    return step.revision === undefined ? { ...step, key: keyOfRecord(step.records[0]) } : step
  }

  /**
   * Whether a lineage has been deleted — its terminal is a tombstone (`TODO/ui-051`).
   *
   * @param {string} root
   * @returns {boolean}
   */
  function isDeletedRoot(root) {
    return recordById.get(terminalByRoot.get(root) ?? root)?.op === DELETE_OP
  }

  /**
   * What the user currently calls the body rooted at `rootId` (`TODO/core-038`): its newest
   * `style.rename`, else the root record's own name. `undefined` when it has neither.
   *
   * @param {string} rootId
   * @returns {string | undefined}
   */
  function currentNameOfRoot(rootId) {
    return nameOverrideOf(document.lineageOf(rootId)) ?? recordById.get(rootId)?.name
  }

  /**
   * Refuse, by the body's name, a reference into a deleted lineage.
   *
   * @param {string} root
   * @param {string} id The id the record named.
   * @param {string} field Named in the error.
   */
  function assertNotDeleted(root, id, field) {
    if (!isDeletedRoot(root)) return
    const name = currentNameOfRoot(root) ?? root
    throw new Error(
      `document.append: ${field} "${id}" names ${name}, which has been deleted — ` +
        'undo the delete (or suppress its step) to bring it back first'
    )
  }

  /**
   * Resolve `id` to the lineage root it currently, *live*, represents — or throw
   * saying why it cannot.
   *
   * Shared by `supersedes` and `consumes` deliberately: the two fields make
   * different claims about the record naming them, but the three things that
   * make a reference valid are identical, and letting them drift apart is how
   * one of them ends up quietly accepting a body the other rejects.
   *
   * @param {string} id
   * @param {'supersedes' | 'consumes'} field Named in the error, so a failure
   *   says which claim was refused rather than just "bad id".
   * @returns {string} The lineage root id.
   */
  function resolveLiveRoot(id, field) {
    const root = rootById.get(id)
    if (root === undefined) {
      throw new Error(`document.append: ${field} "${id}" — no such record in this document`)
    }
    assertNotDeleted(root, id, field)
    if (terminalByRoot.get(root) !== id) {
      throw new Error(
        `document.append: ${field} "${id}", which has itself already been superseded by ` +
          `"${terminalByRoot.get(root)}" — forking a lineage would put two live ` +
          'representations of one body on screen'
      )
    }
    const absorbed = mergedInto.get(root)
    if (absorbed !== undefined) {
      throw new Error(
        `document.append: ${field} "${id}", which has already been consumed by "${absorbed}" — ` +
          'it is no longer a body on screen, so operating on it would resurrect something ' +
          'the user can neither see nor select'
      )
    }
    return root
  }

  /**
   * Validate one record against the current derived state, trial-fold it, and
   * commit its lineage bookkeeping — everything `append` does except pushing the
   * entry itself.
   *
   * Split out so that `rebuildFrom` can re-run **this exact function** over the
   * remaining entries after an undo, rather than a second, parallel
   * implementation of the same rules. See the undo/redo note at the top of the
   * module: that single-implementation property is the whole correctness
   * argument for remove-and-rebuild.
   *
   * @param {OpRecord} record
   * @param {string} origin
   * @param {boolean} [passThrough] `TODO/ui-052`: fold the record as **identity** — every
   *   lineage check and all the bookkeeping below exactly as usual, but its id bound to
   *   the geometry it would have changed instead of running its op. How a row the user
   *   left broken, or one a condition switches off, keeps its body on screen.
   * @param {OpRecord} [foldRecord] `TODO/core-050`: what the kernel actually builds — the
   *   record with its project-variable bindings resolved by {@link foldActive}. This is the
   *   **one** place a record's params reach the kernel, so it is the one place resolution
   *   is handed over; every index below still keeps `record`, the binding the user wrote.
   */
  function ingest(record, origin, passThrough = false, foldRecord = record) {
    if (typeof origin !== 'string' || origin.length === 0) {
      throw new Error(
        'document.append: a transaction origin is required — ' +
          "every mutation is origin-tagged so undo/redo can be scoped to the local user's own edits"
      )
    }
    if (!record || typeof record.op !== 'string' || record.op.length === 0) {
      throw new Error('document.append: a record needs an `op`')
    }
    if (record.id !== undefined && originById.has(record.id)) {
      throw new Error(`document.append: duplicate record id "${record.id}"`)
    }

    // Resolve lineage references *before* the trial fold, so a bad one is
    // rejected as loudly as a bad parameter and nothing half-applies.
    if (record.supersedes !== undefined && record.consumes !== undefined) {
      throw new Error(
        'document.append: a record may set `supersedes` or `consumes`, never both — ' +
          "continuing one body's identity and retiring several into a new one are " +
          'different claims, and a record making both has no coherent meaning'
      )
    }

    // A reference photo (`TODO/sketch-003`) is a data record: validated here — loudly,
    // since a local append is this project's own code — and then never folded, never a
    // lineage, never a body. `validateImageAsset` refuses every field it does not know,
    // so it cannot carry `supersedes`, `consumes`, `target` or `operands` either.
    if (record.op === ASSET_OP) {
      const verdict = validateImageAsset(record)
      if (!verdict.ok) throw new Error(`document.append: ${ASSET_OP} ${String(record.id)} refused — ${verdict.reason}`)
      originById.set(/** @type {string} */ (record.id), origin)
      recordById.set(/** @type {string} */ (record.id), record)
      return
    }

    // An imported model's triangles (`TODO/io-009`) at the top level of a log are data in the
    // same way: validated loudly, never folded, never a body. Inside a library part the same
    // record does fold — through the part's own expansion, where `import.mesh` consumes it
    // (`kernel/recipes/importMesh.js`); a document fold never builds one directly.
    if (record.op === MESH_ASSET_OP) {
      const verdict = validateMeshAsset(record)
      if (!verdict.ok) throw new Error(`document.append: ${MESH_ASSET_OP} ${String(record.id)} refused — ${verdict.reason}`)
      originById.set(/** @type {string} */ (record.id), origin)
      recordById.set(/** @type {string} */ (record.id), record)
      return
    }

    // A project variable (`TODO/core-050`) is a data record too: it builds nothing, is never a
    // lineage or a body, and is read by the fold from the log (`variables.js`), not from
    // here. Its shape is checked loudly, like a photo's; a duplicate name is the fold's to
    // report, because it depends on the rest of the log.
    if (record.op === VARIABLE_OP) {
      const problem = variableRecordError(record)
      if (problem !== null) throw new Error(`document.append: ${VARIABLE_OP} ${String(record.id)} refused — ${problem}`)
      originById.set(/** @type {string} */ (record.id), origin)
      recordById.set(/** @type {string} */ (record.id), record)
      return
    }

    // A tombstone (`TODO/ui-051`) builds nothing either, and must retire exactly
    // one existing body — so it has to name what it supersedes.
    const isTombstone = record.op === DELETE_OP
    if (isTombstone && (record.supersedes === undefined || record.consumes !== undefined)) {
      throw new Error(
        `document.append: ${DELETE_OP} must supersede the body it deletes, and may not consume anything`
      )
    }
    // A plain operand reference (`target`/`operands`) into a deleted body is refused
    // the same way a `supersedes`/`consumes` one is below. Without this a record
    // could still *read* a deleted body's last geometry out of `scene.byId`.
    for (const ref of [record.target, ...(record.operands ?? [])]) {
      const refId = typeof ref === 'string' ? ref : /** @type {any} */ (ref)?.id
      const refRoot = typeof refId === 'string' ? rootById.get(refId) : undefined
      if (refRoot !== undefined) assertNotDeleted(refRoot, refId, 'target')
    }
    let supersededRoot
    if (record.supersedes !== undefined) {
      if (record.id === undefined) {
        throw new Error('document.append: a record that supersedes another needs its own `id`')
      }
      supersededRoot = resolveLiveRoot(record.supersedes, 'supersedes')
    }

    /** @type {string[]} */
    const consumedRoots = []
    if (record.consumes !== undefined) {
      if (!Array.isArray(record.consumes) || record.consumes.length === 0) {
        throw new Error(
          'document.append: `consumes` must be a non-empty array of record ids — ' +
            `got ${JSON.stringify(record.consumes)}`
        )
      }
      if (record.id === undefined) {
        throw new Error('document.append: a record that consumes others needs its own `id`')
      }
      const seen = new Set()
      for (const consumed of record.consumes) {
        const root = resolveLiveRoot(consumed, 'consumes')
        if (seen.has(root)) {
          throw new Error(
            `document.append: consumes "${consumed}" twice over — it and another named id ` +
              `belong to the same body ("${root}"), which would retire one lineage while ` +
              'counting it as two operands'
          )
        }
        seen.add(root)
        consumedRoots.push(root)
      }
    }

    // Trial fold. `applyAction` never throws — it reports — so a failure shows up
    // as a *new* entry in the candidate scene's error list, and the record is
    // rejected rather than committed. Skipped outright for a tombstone: there is
    // no geometry to evaluate and no registry entry to look up.
    const errorsBefore = scene.errors.length
    let candidate
    if (isTombstone) {
      candidate = scene
    } else if (passThrough) {
      // The body it would have changed: what it supersedes, else its first operand (a
      // boolean with its operation switched off leaves its base un-cut).
      const sourceId = record.supersedes ?? refIdOf(record.target) ?? record.consumes?.[0]
      const value = sourceId === undefined ? undefined : scene.byId.get(sourceId)
      if (record.id === undefined || value === undefined) {
        throw new Error(`document.append: ${record.op} has no body to pass through`)
      }
      const byIdNext = new Map(scene.byId)
      byIdNext.set(record.id, value)
      candidate = { ...scene, byId: byIdNext }
    } else {
      candidate = applyAction(scene, foldRecord, ops, foldCache, policyFor(resolution))
    }
    if (candidate.errors.length > errorsBefore) {
      const failure = candidate.errors[candidate.errors.length - 1]
      throw new Error(`document.append: ${failure.op} could not be applied — ${failure.message}`)
    }

    if (record.id !== undefined) {
      originById.set(record.id, origin)
      recordById.set(record.id, record)
      const root = supersededRoot ?? record.id
      rootById.set(record.id, root)
      terminalByRoot.set(root, record.id)
      if (root === record.id) rootOrder.push(record.id)
      // A consuming record is its own new lineage root (the line above already
      // made it one, since it carries no `supersedes`); what is left is to
      // retire the lineages it absorbed, so `bodies()` stops reporting them and
      // `currentIdOf` starts resolving through them.
      for (const consumedRoot of consumedRoots) mergedInto.set(consumedRoot, record.id)
    }
    scene = candidate
    if (!isTombstone && !passThrough && isUserPartOp(record.op)) adoptUserPart(record.op)
  }

  /**
   * `TODO/core-037`: a record naming a user part has just folded, so the definition it was
   * built from — and every part that one nests — becomes this project's own copy, if it
   * was not already. That is "placing a part copies its definition into the project": done
   * here, in the one path every record takes, so a drop, an AI tool call and an MCP write
   * all carry it without each remembering to.
   *
   * The copy is what the registry built it from at that moment (the project's copy if it
   * has one, else the library's), and for the live project it is pinned into the project
   * layer — so a newer library version saved later never changes this instance underneath
   * the user.
   *
   * @param {string} op
   */
  function adoptUserPart(op) {
    if (userParts.has(op)) return
    const { definitions } = requiredUserParts([{ op }], (candidate) => userParts.get(candidate) ?? effectiveUserPart(candidate))
    /** @type {import('./userPart.js').UserPartDefinition[]} */
    const adopted = []
    for (const definition of definitions) {
      if (userParts.has(definition.op)) continue
      userParts.set(definition.op, definition)
      adopted.push(definition)
    }
    if (publishesUserParts && adopted.length > 0) ensureProjectParts(adopted)
  }

  /**
   * Everything derived from `entries`, copied shallowly so a failed rebuild can
   * put it all back. Cheap — these are maps of short strings and one scene
   * reference; the fold they index is what costs, and that is not copied.
   */
  function captureDerived() {
    return {
      originById: new Map(originById),
      rootById: new Map(rootById),
      terminalByRoot: new Map(terminalByRoot),
      rootOrder: rootOrder.slice(),
      mergedInto: new Map(mergedInto),
      recordById: new Map(recordById),
      variableTable,
      scene,
    }
  }

  /** @param {ReturnType<typeof captureDerived> | null} snapshot */
  function resetDerived(snapshot) {
    originById.clear()
    rootById.clear()
    terminalByRoot.clear()
    rootOrder.length = 0
    mergedInto.clear()
    recordById.clear()
    variableTable = new Map()
    scene = emptyScene()
    if (!snapshot) return
    for (const [key, value] of snapshot.originById) originById.set(key, value)
    for (const [key, value] of snapshot.rootById) rootById.set(key, value)
    for (const [key, value] of snapshot.terminalByRoot) terminalByRoot.set(key, value)
    rootOrder.push(...snapshot.rootOrder)
    for (const [key, value] of snapshot.mergedInto) mergedInto.set(key, value)
    for (const [key, value] of snapshot.recordById) recordById.set(key, value)
    variableTable = snapshot.variableTable
    scene = snapshot.scene
  }

  /**
   * Ingest one entry as part of a re-fold, turning any failure into the
   * row-named {@link ReplayRejection} sections 15-18 all specify.
   *
   * The missing-reference check runs **before** the trial fold on purpose: a
   * row whose operand was suppressed out, reordered after it or superseded by
   * an insert is the *common* failure here, and `ingest` reports it by record
   * id ("no such record `op-7`") where the user needs a body name.
   *
   * @param {DocumentEntry} entry
   * @param {number} index Zero-based position; the message says `index + 1`.
   * @param {Map<string, OpRecord>} byId Every record in the list being folded.
   * @param {OpRecord} [foldRecord] The record with its bindings resolved (`TODO/core-050`).
   */
  function ingestRow(entry, index, byId, foldRecord = entry.record) {
    const { record } = entry
    for (const referenced of referencedIdsOf(record)) {
      if (recordById.has(referenced)) continue
      throw new ReplayRejection({
        id: record.id ?? '',
        step: index + 1,
        label: labelFor([record], byId),
        reason: `needs ${displayNameOf(referenced, byId)}`,
      })
    }
    try {
      ingest(record, entry.origin, false, foldRecord)
    } catch (error) {
      throw new ReplayRejection({
        id: record.id ?? '',
        step: index + 1,
        label: labelFor([record], byId),
        reason: `can't be built: ${reasonOf(error)}`,
      })
    }
  }

  /**
   * Fold the **inactive tail** into a throwaway document and report which of its
   * rows would not build — section 18's shadow check.
   *
   * Informational, never a rejection: "the insert itself still succeeds, because
   * inserting was the user's intent and the tail is not part of the evaluated
   * document". A row that fails is *skipped* rather than aborting the check, so
   * a later independent row is still judged on its own merits — the same
   * skip-and-report leniency `replay.js` applies to an untrusted document, and
   * for the same reason: this is a report, not an evaluation.
   *
   * A whole second `createDocument` rather than a cleverer partial fold, for the
   * reason the module note gives: one implementation of the lineage rules. It
   * costs nothing in the ordinary case because there is no tail to check.
   *
   * @param {readonly DocumentEntry[]} nextEntries
   * @param {number} activeCount
   * @param {Map<string, OpRecord>} byId
   * @param {ReadonlyMap<string, unknown>} [flagged] `TODO/data-010`: rows of the active prefix
   *   to load as left broken — what a merge's fold tolerated, which it flags only once the fold
   *   is done. Without it the prefix load refuses and every tail row reads `needs …`.
   * @returns {Map<string, string>} Row id → reason.
   */
  function shadowCheckTail(nextEntries, activeCount, byId, flagged = new Map()) {
    /** @type {Map<string, string>} */
    const broken = new Map()
    if (activeCount >= nextEntries.length) return broken

    // Same resolution as the fold it shadows (`TODO/core-035`): the cache is keyed on it,
    // so a mismatch here would rebuild every row and could flag a row "broken" at a
    // tessellation the document is not actually using.
    const scratch = createDocument({ registry: ops, foldCache, resolution })
    /** @type {Set<string>} */
    const built = new Set()
    /** @param {DocumentEntry} entry */
    const feed = (entry) => {
      scratch.append(entry.record, { origin: entry.origin })
      if (entry.record.id !== undefined) built.add(entry.record.id)
    }

    // The active prefix in one load, flags and conditions included (`TODO/ui-052`), so a
    // row left broken there is tolerated the same way the live fold tolerates it. Cannot
    // throw: this prefix is the fold that just succeeded. Guarded anyway so a shadow
    // check can never be the thing that breaks a document.
    try {
      scratch.loadEntries(
        nextEntries
          .slice(0, activeCount)
          .map((entry, index) => {
            const copy = foldableEntry(entry)
            return flagged.has(entry.record.id ?? `#${index + 1}`) ? withLeftBroken(copy, true) : copy
          }),
        null,
        resolution
      )
      for (const entry of nextEntries.slice(0, activeCount)) {
        const id = entry.record.id
        if (id !== undefined && scratch.currentIdOf(id) !== undefined) built.add(id)
      }
    } catch {
      /* ignored — see above */
    }

    for (let index = activeCount; index < nextEntries.length; index += 1) {
      const entry = nextEntries[index]
      if (entry.suppressed === true) continue
      const key = entry.record.id ?? `#${index + 1}`
      const missing = referencedIdsOf(entry.record).find((id) => !built.has(id))
      if (missing !== undefined) {
        broken.set(key, `needs ${displayNameOf(missing, byId)}`)
        continue
      }
      try {
        feed(entry)
      } catch (error) {
        broken.set(key, `can't be built: ${reasonOf(error)}`)
      }
    }
    return broken
  }

  /**
   * Re-derive the whole document from a new entry list and a new marker — the
   * one mutation primitive underneath undo (remove a step), redo (insert it back
   * at its index) and every `data-004` row action (replace one entry, flag one,
   * swap two, move the marker).
   *
   * **Atomic**: if any active record no longer folds, the captured indexes go
   * back and the error propagates, so the caller's refusal leaves the document
   * exactly as it was — sections 15-18's shared contract, and the reason
   * `rollbackAt`/`brokenById` are assigned only after the loop survives.
   *
   * A full re-fold rather than a partial one, deliberately — `data-004`'s own
   * Proposed fix makes the argument: correctness-by-construction from reusing
   * the proven fold beats a speed win with no measured need. The clock is
   * **not** reset, so an id can never be handed out twice across an undo.
   *
   * @param {DocumentEntry[]} nextEntries
   * @param {number | null} [nextRollbackAt] Active-entry count; defaults to the
   *   current marker, so an operation that does not move it need not say so.
   * @param {string} [nextResolution] The design resolution to fold at
   *   (`TODO/core-035`); defaults to the current one. Put back with everything else if
   *   the fold is refused.
   * @param {{ tolerateAll?: boolean, flagTolerated?: boolean }} [options] `tolerateAll`: see
   *   {@link foldActive}. `flagTolerated` (`TODO/data-010`, a merge only): the tail shadow check
   *   loads the rows the fold tolerated as left broken, as the merge is about to flag them.
   * @returns {DocumentState} The state **before** the rebuild, so the caller can
   *   record it on the step it pushes and a later Undo can put it back without
   *   this fold running again (`TODO/core-030`).
   */
  function rebuildFrom(nextEntries, nextRollbackAt = rollbackAt, nextResolution = resolution, options = {}) {
    const prior = captureState()
    const snapshot = prior.derived
    const activeCount = nextRollbackAt ?? nextEntries.length
    const byId = recordMapOf(nextEntries)
    resetDerived(null)
    resolution = nextResolution
    /** @type {ReturnType<typeof foldActive>} */
    let outcome
    try {
      outcome = foldActive(nextEntries, activeCount, byId, options.tolerateAll === true)
    } catch (error) {
      resetDerived(snapshot)
      resolution = prior.resolution
      throw error
    }
    entries.length = 0
    entries.push(...nextEntries)
    rollbackAt = nextRollbackAt
    brokenById = new Map([
      ...outcome.broken,
      ...shadowCheckTail(nextEntries, activeCount, byId, options.flagTolerated === true ? outcome.tolerated : undefined),
    ])
    inactiveById = outcome.inactive
    lastTolerated = outcome.tolerated
    bumpState()
    return prior
  }

  /**
   * `TODO/data-010` item 6: when a tolerated row failed because a `supersedes`/`consumes`
   * target is no longer its lineage's terminal, the row that advanced that lineage — the
   * earliest folded row before it that superseded or consumed the target. Read off the log
   * and the indexes as the fold has built them so far, so it is the same on a reload.
   *
   * @param {OpRecord} record
   * @param {readonly DocumentEntry[]} nextEntries
   * @param {number} index The failing row's position.
   * @param {Map<string, OpRecord>} byId
   * @returns {{ reason: string, lostTo: string } | null}
   */
  function lineageConflictOf(record, nextEntries, index, byId) {
    const targets = [record.supersedes, ...(record.consumes ?? [])].filter((id) => typeof id === 'string')
    for (const target of targets) {
      const root = rootById.get(target)
      if (root === undefined || !recordById.has(target)) continue
      if (terminalByRoot.get(root) === target && !mergedInto.has(root)) continue
      for (let at = 0; at < index; at += 1) {
        const entry = nextEntries[at]
        const winner = entry.record
        if (entry.suppressed === true || winner.id === undefined || recordById.get(winner.id) !== winner) continue
        if (winner.supersedes !== target && !(winner.consumes ?? []).includes(target)) continue
        return {
          reason: `conflicts with step ${at + 1} (${labelFor([winner], byId)}${conflictAttribution(entry.origin)})`,
          lostTo: winner.id,
        }
      }
    }
    return null
  }

  /**
   * `TODO/data-006` (option c): the re-link a **broken inactive tail row** may be offered —
   * its record with every reference to a body an active step has since *moved* pointed at
   * that body's current record instead — or `null` when there is none to offer.
   *
   * The exact case only, never the general one. A row qualifies when one of its lineage
   * claims (`supersedes`, or a `consumes` entry) names a record the active fold built and
   * whose lineage active rows have since **superseded** — a move, a resize, any edit that
   * continues the same body. Re-pointing there is always onto a record that superseded the
   * one the row named, so it is the same body, moved; never another body. A lineage that was
   * **consumed** (the body is now part of a union) or **deleted** refuses the whole row: the
   * body it built on is gone, not moved, and pointing it at a different body would be the
   * silent guess about intent this task exists not to make. A row broken only because its
   * own build throws names live records already, so it has nothing to re-point and keeps
   * its `can't be built:` reason.
   *
   * `target`/`operands` entries that name a moved record are mirrored (a sub-part address
   * keeps its `pieces`); a plain read of a record that is not one of the row's lineage
   * claims is left alone.
   *
   * Read off `entries`, the marker, `brokenById` and the active fold's indexes, so it is
   * derived on call and never stored — Undo, a merge, a reload all get it right for free.
   *
   * @param {number} index The row's position in `entries`.
   * @returns {{ record: OpRecord, to: string } | null} `to`: the record it would point at
   *   (the first, when several of its references moved).
   */
  function relinkPlanOf(index) {
    const entry = entries[index]
    const activeCount = rollbackAt ?? entries.length
    if (entry === undefined || index < activeCount || entry.suppressed === true) return null
    const { record } = entry
    if (!brokenById.has(record.id ?? `#${index + 1}`)) return null
    /** @type {Map<string, string>} */
    const moved = new Map()
    for (const claim of [record.supersedes, ...(record.consumes ?? [])]) {
      if (typeof claim !== 'string') continue
      const root = rootById.get(claim)
      // Not built by the active fold (an earlier tail row, a typo): the shadow check's to judge.
      if (root === undefined || !recordById.has(claim)) continue
      if (mergedInto.has(root) || isDeletedRoot(root)) return null
      const terminal = terminalByRoot.get(root)
      if (terminal === undefined || terminal === claim) continue
      moved.set(claim, terminal)
    }
    if (moved.size === 0) return null
    /** @param {any} ref */
    const swap = (ref) => {
      const id = refIdOf(ref)
      const to = id === undefined ? undefined : moved.get(id)
      if (to === undefined) return ref
      return typeof ref === 'string' ? to : { ...ref, id: to }
    }
    /** @type {OpRecord} */
    const next = { ...record }
    if (record.supersedes !== undefined) next.supersedes = swap(record.supersedes)
    if (record.consumes !== undefined) next.consumes = record.consumes.map(swap)
    if (record.target !== undefined) next.target = swap(record.target)
    if (record.operands !== undefined) next.operands = record.operands.map(swap)
    return { record: next, to: /** @type {string} */ (moved.values().next().value) }
  }

  /**
   * The active part of a re-fold: every row before the marker, in order, with
   * `TODO/ui-052`'s two exceptions to "any failure is an atomic rejection" — see the
   * module note. Throws a {@link ReplayRejection} for any failure that is not one of them.
   *
   * @param {readonly DocumentEntry[]} nextEntries
   * @param {number} activeCount
   * @param {Map<string, OpRecord>} byId Every record in the list being folded.
   * @param {boolean} tolerateAll Tolerate *every* failing row as if the user had left it
   *   broken — only for a throwaway document asking "what would break?" (`dependents.js`).
   * @returns {{ broken: Map<string, string>, inactive: Map<string, InactiveBy>, tolerated: Map<string, string | null> }}
   *   `tolerated` (`TODO/data-010`): the rows that failed and were folded anyway because they
   *   are left broken or `tolerateAll` is set, by key → the row each lost to, or `null`.
   */
  function foldActive(nextEntries, activeCount, byId, tolerateAll) {
    /** @type {Map<string, string | null>} */
    const tolerated = new Map()
    /** @type {Map<string, string>} */
    const broken = new Map()
    /** @type {Map<string, InactiveBy>} */
    const inactive = new Map()
    /**
     * Record id → the key of the row that took its whole lineage out of the fold: a
     * creation record switched off by its condition (or one whose condition cannot be
     * evaluated), or a row that could not even be passed through.
     * @type {Map<string, string>}
     */
    const skipped = new Map()
    // `TODO/core-050`: the project variables, read once from the whole active log — so a
    // binding resolves whether its variable is defined before or after it.
    const usesVars = nextEntries.some((entry) => usesVariables(entry.record))
    const { variables, problems: variableProblems } = usesVars
      ? readVariables(nextEntries, activeCount)
      : { variables: new Map(), problems: new Map() }
    variableTable = variables
    let bindingsSeen = 0
    const context = nextEntries.some((entry) => entry.record.when !== undefined)
      ? conditionContextOf(nextEntries, activeCount, variables)
      : null

    /**
     * @param {DocumentEntry} entry
     * @param {string} key
     */
    const passThroughOrSkip = (entry, key) => {
      try {
        ingest(entry.record, entry.origin, true)
      } catch {
        // Nothing to stand in for (its own input is missing too): out of the fold,
        // and whatever builds on it is judged as building on a skipped body.
        if (entry.record.id !== undefined) skipped.set(entry.record.id, key)
      }
    }

    for (let index = 0; index < activeCount && index < nextEntries.length; index += 1) {
      const entry = nextEntries[index]
      // Suppressed: in the log, in the list, out of the fold (section 16).
      if (entry.suppressed === true) continue
      const { record } = entry
      const key = record.id ?? `#${index + 1}`

      // 0. A project variable (`TODO/core-050`) builds nothing. One that cannot be used — a
      //    bad name, a second definition of a name — is a broken row, never a refused log,
      //    and every binding to it is then reported by name below.
      if (record.op === VARIABLE_OP) {
        const problem = variableProblems.get(key)
        if (problem !== undefined) {
          broken.set(key, `variable can't be used: ${problem}`)
          continue
        }
        ingestRow(entry, index, byId)
        continue
      }

      // 1. A later record of a lineage the fold has already left out goes with it,
      //    silently: "this body does not exist on a Pi 5" covers its moves too.
      if (typeof record.supersedes === 'string' && skipped.has(record.supersedes)) {
        const owner = /** @type {string} */ (skipped.get(record.supersedes))
        if (record.id !== undefined) skipped.set(record.id, owner)
        const info = inactive.get(owner)
        if (info !== undefined) inactive.set(key, info)
        else broken.set(key, broken.get(owner) ?? `needs ${displayNameOf(owner, byId)}`)
        continue
      }

      // 2. Its own condition.
      if (record.when !== undefined && context !== null) {
        const verdict = evaluateCondition(record.when, context)
        if (verdict.state !== 'active') {
          if (verdict.state === 'invalid') {
            broken.set(key, `condition can't be evaluated: ${verdict.reason}`)
          } else {
            const when = /** @type {import('./condition.js').Condition} */ (record.when)
            inactive.set(
              key,
              when.var !== undefined
                ? { refId: '', param: '', var: when.var, values: [...when.in] }
                : { refId: /** @type {string} */ (when.ref), param: /** @type {string} */ (when.param), values: [...when.in] }
            )
          }
          const creates = record.supersedes === undefined && record.consumes === undefined
          if (creates) {
            if (record.id !== undefined) skipped.set(record.id, key)
          } else {
            passThroughOrSkip(entry, key)
          }
          continue
        }
      }

      // 3. A record that uses a body the fold left out: broken, with the reason named —
      //    conditions never spread to other bodies without the user choosing it.
      const skippedRef = referencedIdsOf(record).find((id) => skipped.has(id))
      if (skippedRef !== undefined) {
        const owner = /** @type {string} */ (skipped.get(skippedRef))
        const ownerRecord = byId.get(owner)
        const name = displayNameOf(owner, byId)
        const reason =
          inactive.has(owner) && ownerRecord?.when !== undefined && context !== null
            ? `needs ${name}, which only exists when ${describeCondition(
                /** @type {import('./condition.js').Condition} */ (ownerRecord.when),
                context
              ).sentence.replace(/^Only when /, '')}`
            : `needs ${name}, which is not being built`
        if (!(tolerateAll || entry.leftBroken === true)) {
          throw new ReplayRejection({ id: record.id ?? '', step: index + 1, label: labelFor([record], byId), reason })
        }
        broken.set(key, reason)
        tolerated.set(key, null)
        passThroughOrSkip(entry, key)
        continue
      }

      // 4. Its project-variable bindings (`TODO/core-050`), resolved here — the one point a
      //    record's params are handed to the kernel — and before composite expansion, so a
      //    recipe or a user part never sees a binding. One that cannot be resolved (a missing
      //    variable, a wrong kind, a value outside the param's own limits, a dependent choice
      //    it stranded) is a broken row with the reason named, exactly like a condition that
      //    cannot be evaluated: substituting a literal would change geometry silently.
      let foldRecord = record
      const bindingCount = usesVars ? bindingCountOf(record) : 0
      if (bindingCount > 0) {
        bindingsSeen += bindingCount
        const recordName = record.id === undefined ? record.op : displayNameOf(record.id, byId)
        const outcome =
          bindingsSeen > VARIABLE_LIMITS.maxBindingsPerDocument
            ? {
                record,
                errors: [
                  `${recordName} is past this project's limit of ${VARIABLE_LIMITS.maxBindingsPerDocument} variable bindings`,
                ],
              }
            : resolveRecord(record, variables, { recordName })
        if (outcome.errors.length > 0) {
          broken.set(key, `binding can't be resolved: ${outcome.errors[0]}`)
          const creates = record.supersedes === undefined && record.consumes === undefined
          if (creates) {
            if (record.id !== undefined) skipped.set(record.id, key)
          } else {
            passThroughOrSkip(entry, key)
          }
          continue
        }
        foldRecord = outcome.record
      }

      // 5. An ordinary row — refused atomically unless the user left it broken.
      try {
        ingestRow(entry, index, byId, foldRecord)
      } catch (error) {
        if (!(error instanceof ReplayRejection) || !(tolerateAll || entry.leftBroken === true)) throw error
        // Only a *tolerated* row gets the conflict reason (`TODO/data-010`): a refused local
        // edit keeps exactly the rejection it always had.
        const conflict = lineageConflictOf(record, nextEntries, index, byId)
        broken.set(key, conflict?.reason ?? error.step.reason)
        tolerated.set(key, conflict?.lostTo ?? null)
        passThroughOrSkip(entry, key)
      }
    }
    return { broken, inactive, tolerated }
  }

  /**
   * Where `id` sits in the log, or `-1`. Reads `entries`, not the derived
   * indexes, so it answers for a suppressed or inactive row too.
   *
   * @param {string | undefined} id
   * @returns {number}
   */
  function indexOfRecord(id) {
    return id === undefined ? -1 : entries.findIndex((entry) => entry.record.id === id)
  }

  /**
   * Apply a {@link LogRevision} in the given direction and re-fold.
   *
   * @param {LogRevision} revision
   * @param {number | null} targetRollbackAt
   * @returns {DocumentState} The state before it, from {@link rebuildFrom}.
   */
  function applyRevision(revision, targetRollbackAt) {
    const next = entries.slice()
    if (revision.kind === 'resolution') {
      // Revises no entry — only what the whole log is folded at (`TODO/core-035`).
      return rebuildFrom(next, targetRollbackAt, /** @type {string} */ (revision.toResolution))
    }
    if (revision.kind === 'revise') {
      // Records the step put into the log (`TODO/sketch-003`): out first on Undo, in last on Redo.
      if (revision.remove) {
        const gone = new Set(revision.remove.records)
        const kept = next.filter((entry) => !gone.has(entry.record))
        next.length = 0
        next.push(...kept)
      }
      for (const item of revision.items ?? []) {
        const at = indexOfRecord(item.id)
        if (at < 0) {
          throw new Error(
            `document.undo: step "${item.id}" is no longer in this document, so the ` +
              'action that changed it cannot be reversed'
          )
        }
        next[at] = withLeftBroken({ ...next[at], record: item.to }, item.toLeftBroken)
      }
      if (revision.add) {
        const at = Math.min(revision.add.at, next.length)
        next.splice(at, 0, ...revision.add.records.map((record) => ({ record, origin: 'local' })))
      }
      return rebuildFrom(next, targetRollbackAt)
    }
    const index = indexOfRecord(revision.id)
    if (revision.kind !== 'rollback' && index < 0) {
      throw new Error(
        `document.undo: step "${revision.id}" is no longer in this document, so the ` +
          'action that changed it cannot be reversed'
      )
    }
    if (revision.kind === 'replace') {
      next[index] = { ...next[index], record: /** @type {OpRecord} */ (revision.to) }
    } else if (revision.kind === 'suppress') {
      next[index] = { ...next[index], suppressed: revision.toSuppressed === true }
    } else if (revision.kind === 'reorder') {
      const target = index + (revision.delta ?? 0)
      if (target < 0 || target >= next.length) {
        throw new Error(`document.undo: step "${revision.id}" can no longer move back`)
      }
      ;[next[index], next[target]] = [next[target], next[index]]
    }
    // 'rollback' revises nothing but the marker, which `targetRollbackAt` is.
    return rebuildFrom(next, targetRollbackAt)
  }

  /**
   * The revision that puts a revision back.
   *
   * @param {LogRevision} revision
   * @returns {LogRevision}
   */
  function invertRevision(revision) {
    if (revision.kind === 'replace') return { ...revision, from: revision.to, to: revision.from }
    if (revision.kind === 'suppress') {
      return {
        ...revision,
        fromSuppressed: revision.toSuppressed,
        toSuppressed: revision.fromSuppressed,
      }
    }
    if (revision.kind === 'reorder') return { ...revision, delta: -(revision.delta ?? 0) }
    if (revision.kind === 'revise') {
      const { add, remove, ...rest } = revision
      return {
        ...rest,
        ...(add ? { remove: add } : {}),
        ...(remove ? { add: remove } : {}),
        items: (revision.items ?? []).map((item) => ({
          id: item.id,
          from: item.to,
          to: item.from,
          fromLeftBroken: item.toLeftBroken,
          toLeftBroken: item.fromLeftBroken,
        })),
      }
    }
    if (revision.kind === 'resolution') {
      return { ...revision, fromResolution: revision.toResolution, toResolution: revision.fromResolution }
    }
    return revision
  }

  /**
   * The parts of a composite batch step, each record part stamped with the index it
   * was inserted at, found by replaying the parts forward over the log the batch
   * started from (`TODO/core-056`). A tail append carries no `index` of its own; a
   * row action's `remove`/`add` shift later parts, so they are replayed too.
   *
   * @param {HistoryStep[]} pushed
   * @param {readonly DocumentEntry[]} startEntries
   * @returns {HistoryStep[]}
   */
  function partsWithIndexes(pushed, startEntries) {
    const list = startEntries.map((entry) => entry.record)
    return pushed.map((part) => {
      const revision = part.revision
      if (revision === undefined) {
        const at = Math.min(part.index ?? list.length, list.length)
        list.splice(at, 0, ...part.records)
        return { ...part, index: at }
      }
      if (revision.kind === 'revise') {
        if (revision.remove) {
          const gone = new Set(revision.remove.records)
          for (let i = list.length - 1; i >= 0; i -= 1) if (gone.has(list[i])) list.splice(i, 1)
        }
        for (const item of revision.items ?? []) {
          const at = list.findIndex((record) => record.id === item.id)
          if (at >= 0) list[at] = item.to
        }
        if (revision.add) list.splice(Math.min(revision.add.at, list.length), 0, ...revision.add.records)
      }
      return { ...part }
    })
  }

  /**
   * The records a step put in the log, as the log holds them now (`TODO/ai-017`).
   *
   * A merge, or Undo AI turn's restore, can rebuild the entries with new record objects that
   * are equal to the ones the step captured but are not the same objects. Taking a step back
   * out by object identity then matches nothing: the step is popped and the rows stay. Rows
   * are matched by id, falling back to the captured object for a record with no live twin.
   *
   * @param {readonly OpRecord[]} records
   * @returns {Set<OpRecord>}
   */
  function liveRecordsOf(records) {
    const live = new Set(records)
    const ids = new Set(records.map((record) => record.id).filter((id) => typeof id === 'string'))
    if (ids.size > 0) {
      for (const entry of entries) {
        const id = entry.record.id
        if (typeof id === 'string' && ids.has(id)) live.add(entry.record)
      }
    }
    return live
  }

  /**
   * Refuse, by name and before anything moves, an Undo of `step` while a record
   * outside it still references one inside it (section 19, point 4).
   *
   * @param {HistoryStep} step A record step.
   */
  function assertNoDependents(step) {
    const stepRecords = liveRecordsOf(step.records)
    const undoneIds = new Set(
      step.records.map((record) => record.id).filter((id) => typeof id === 'string')
    )
    for (const entry of entries) {
      if (stepRecords.has(entry.record)) continue
      for (const referenced of referencedIdsOf(entry.record)) {
        if (!undoneIds.has(referenced)) continue
        const blocker = entry.record.name ?? entry.record.id ?? entry.record.op
        throw new Error(
          `document.undo: "${blocker}", added via ${entry.origin}, depends on ` +
            `"${step.label}" — suppress or edit it first`
        )
      }
    }
  }

  /**
   * Undo a composite step (`TODO/core-056`): its parts newest-first, each by the
   * same rule a step of that shape has on its own. All or nothing — a refusal
   * part-way puts the whole state back and rethrows.
   *
   * @param {HistoryStep} step
   * @param {boolean} [afterMerge] The step predates a merge: markers are re-derived
   *   (`TODO/data-010`).
   * @returns {{ parts: HistoryStep[], before: DocumentState }} The parts with the
   *   index each record part sat at (for Redo), and the state before the Undo.
   */
  function undoComposite(step, afterMerge = false) {
    const snapshot = captureState()
    const parts = /** @type {HistoryStep[]} */ (step.parts)
    const undone = parts.slice()
    try {
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const part = parts[i]
        if (part.revision !== undefined) {
          applyRevision(invertRevision(part.revision), afterMerge ? undoMarkerAfterMerge(part) : part.rollbackBefore ?? null)
          continue
        }
        assertNoDependents({ ...part, label: step.label })
        const partRecords = liveRecordsOf(part.records)
        const index = entries.findIndex((entry) => partRecords.has(entry.record))
        const key = keyOfRecord(part.records[0])
        rebuildFrom(
          entries.filter((entry) => !partRecords.has(entry.record)),
          afterMerge ? markerWithout(partRecords) : part.rollbackBefore ?? null
        )
        undone[i] = { ...part, index, key }
      }
    } catch (error) {
      restoreState(snapshot)
      document.version += 1
      throw error
    }
    return { parts: undone, before: snapshot }
  }

  /**
   * Redo a composite step: its parts oldest-first, all or nothing.
   *
   * @param {HistoryStep} step
   * @param {boolean} [afterMerge] The step predates a merge: re-insert by position key and
   *   re-derive markers (`TODO/data-010`).
   * @returns {DocumentState} The state before the Redo.
   */
  function redoComposite(step, afterMerge = false) {
    const snapshot = captureState()
    try {
      for (const part of /** @type {HistoryStep[]} */ (step.parts)) {
        if (part.revision !== undefined) {
          applyRevision(part.revision, afterMerge ? redoMarkerAfterMerge(part) : part.rollbackAfter ?? null)
          continue
        }
        const at = (afterMerge ? indexForKey(part.key) : undefined) ?? part.index ?? entries.length
        const next = entries.slice()
        next.splice(at, 0, ...part.records.map((record) => ({ record, origin: part.origin })))
        rebuildFrom(next, afterMerge ? redoMarkerAfterMerge(part, at) : part.rollbackAfter ?? null)
      }
    } catch (error) {
      restoreState(snapshot)
      document.version += 1
      throw error
    }
    return snapshot
  }

  /**
   * Record a completed row action as one undoable step, with the same origin
   * scoping `appendAll` applies: only the local user's own row actions are
   * something Undo can reach.
   *
   * @param {TransactionOptions} transaction
   * @param {string} label
   * @param {LogRevision} revision
   * @param {number | null} rollbackBefore
   * @param {DocumentState} prior The state before the action, from
   *   {@link rebuildFrom}, kept so its Undo need not re-fold.
   */
  function pushRevision(transaction, label, revision, rollbackBefore, prior) {
    document.version += 1
    if (transaction?.origin !== 'local') return
    /** @type {HistoryStep} */
    const step = {
      origin: 'local',
      label: transaction.label ?? label,
      records: [],
      meta: transaction.meta,
      revision,
      rollbackBefore,
      rollbackAfter: rollbackAt,
      ...(revision.kind === 'rollback'
        ? { anchorBefore: anchorIdOf(prior.entries, rollbackBefore), anchorAfter: anchorIdOf(entries, rollbackAt) }
        : {}),
    }
    undoStack.push(step)
    keepRestore(undoStack, step, prior)
    redoStack.length = 0
  }

  /** @type {HistoryStep[]} */
  const undoStack = []
  /** @type {HistoryStep[]} */
  const redoStack = []

  /**
   * What the Undo/Redo button says it will do (section 19: "the tooltip and
   * `aria-label` name the action").
   *
   * A `consumes` record gets the bare verb — `Subtract`, not `Subtract Cube 1` —
   * for the reason the consumption note above already gives: a boolean's result
   * is a new thing built from several bodies, not an edit of its base, so naming
   * one operand would claim something untrue.
   *
   * @param {readonly OpRecord[]} records
   * @param {Map<string, OpRecord>} [byId] Fallback name source, for a row the
   *   derived indexes do not hold: one being folded right now, one past the
   *   rollback marker, or a suppressed one. Without it those rows would lose
   *   their subject's name at exactly the moment a message needs it.
   * @returns {string}
   */
  function labelFor(records, byId) {
    const record = records[0]
    const subject = record.supersedes ?? record.target
    const rootId = typeof subject === 'string' ? rootById.get(subject) : undefined
    // The *root's* name, not the acting record's: a transform and a param edit
    // both carry generated ids and no name of their own, and what the user calls
    // the thing is "Cube 1" — the same reason `Body.name` reads from the root.
    let subjectName = rootId === undefined ? undefined : currentNameOfRoot(rootId)
    if (subjectName === undefined && typeof subject === 'string' && byId !== undefined) {
      const resolved = displayNameOf(subject, byId)
      subjectName = resolved === subject ? undefined : resolved
    }

    // A colour pick and a colour reset are the same op, told apart by the value
    // (`TODO/ui-037`) — "Recolor Cube 1" on a reset would claim a colour change
    // the step did not make.
    if (record.op === RECOLOR_OP && record.colorOverride === null) {
      return subjectName === undefined ? 'Reset color' : `Reset color of ${subjectName}`
    }
    // `TODO/core-050`: a variable definition is named by the variable, not placed.
    if (record.op === VARIABLE_OP) {
      const name = typeof record.params?.name === 'string' ? record.params.name : record.id ?? 'variable'
      return `Define ${name}`
    }
    if (record.op === REMOVE_PART_OP) {
      const part = typeof record.params?.part === 'string' ? record.params.part : 'part'
      return subjectName === undefined ? `Remove ${part}` : `Remove ${part} from ${subjectName}`
    }
    const verb = /** @type {Record<string, string>} */ (STEP_VERBS)[record.op]
    if (verb !== undefined) {
      if (record.consumes !== undefined) return verb
      return subjectName === undefined ? verb : `${verb} ${subjectName}`
    }
    // No verb, but it supersedes something: this is an in-place edit rebuilding
    // a body from changed params (`ui-029`), which reuses the *creation* op and so
    // would otherwise be labelled as placing a brand-new body with a generated id.
    if (record.supersedes !== undefined) {
      return subjectName === undefined ? 'Edit' : `Edit ${subjectName}`
    }
    const noun = record.name ?? record.id ?? record.op
    return `Place ${noun}`
  }

  /**
   * Refuse a revision that is not an edit of `current` — see
   * {@link WarpDocument.reviseRecords} for the three widenings over `replaceRecord`.
   *
   * @param {OpRecord} current
   * @param {OpRecord} record
   */
  function assertRevisable(current, record) {
    const id = current.id
    if (!record || typeof record !== 'object' || record.id !== id) {
      throw new Error(
        `document.reviseRecords: the replacement for "${id}" must keep its id — every later ` +
          'record refers to it by that id'
      )
    }
    for (const field of /** @type {const} */ (['supersedes', 'consumes'])) {
      if (JSON.stringify(record[field] ?? null) === JSON.stringify(current[field] ?? null)) continue
      throw new Error(
        `document.reviseRecords: the replacement for "${id}" changes \`${field}\` — that is the ` +
          'lineage itself, and a revision edits a step, never what it continues or retires'
      )
    }
    if (record.op !== current.op && !(DETACHABLE_OPS.has(current.op) && record.op === 'transform.translate')) {
      throw new Error(
        `document.reviseRecords: "${id}" may not change from ${current.op} to ${record.op} — ` +
          'only a Snap or Align may be detached into a plain move'
      )
    }
    const allowed = new Set([current.target, ...(current.operands ?? [])].map(refIdOf))
    for (const ref of [record.target, ...(record.operands ?? [])]) {
      if (ref === undefined) continue
      const refId = refIdOf(ref)
      if (refId === undefined || !allowed.has(refId)) {
        throw new Error(
          `document.reviseRecords: "${id}" may not start using "${String(refId ?? JSON.stringify(ref))}" — ` +
            'a revision may rename a piece or drop an operand, never reach a new record'
        )
      }
    }
    if (record.when !== undefined) {
      const problem = conditionShapeError(record.when)
      if (problem !== null) throw new Error(`document.reviseRecords: "${id}": ${problem}`)
    }
  }

  /**
   * A reader for the condition each row carries or inherits (`TODO/ui-052`), with its
   * words already built — for {@link WarpDocument.timeline} and
   * {@link WarpDocument.inactiveBodies}.
   *
   * @param {Map<string, OpRecord>} byId Every record in the log.
   * @param {number} activeCount
   * @returns {(record: OpRecord) => RowCondition | null}
   */
  function conditionReader(byId, activeCount) {
    if (!entries.some((entry) => entry.record.when !== undefined)) return () => null
    const context = conditionContextOf(entries, activeCount, variableTable)
    return (record) => {
      /** @type {'self' | 'lineage'} */
      let scope = 'self'
      let carrier = record
      if (carrier.when === undefined) {
        scope = 'lineage'
        const seen = new Set()
        while (carrier.when === undefined && typeof carrier.supersedes === 'string' && !seen.has(carrier.supersedes)) {
          seen.add(carrier.supersedes)
          const previous = byId.get(carrier.supersedes)
          if (previous === undefined) break
          carrier = previous
        }
        // Only a *creation* record's condition covers its whole lineage; one on a snap
        // covers that snap alone.
        if (carrier.supersedes !== undefined || carrier.consumes !== undefined) return null
      }
      if (carrier.when === undefined || conditionShapeError(carrier.when) !== null) return null
      const when = /** @type {import('./condition.js').Condition} */ (carrier.when)
      const words = describeCondition(when, context)
      return {
        refId: when.ref ?? '',
        param: when.param ?? '',
        ...(when.var !== undefined ? { var: when.var } : {}),
        values: [...when.in],
        scope,
        sentence: words.sentence,
        chip: words.chip,
      }
    }
  }

  /** @type {WarpDocument} */
  const document = {
    get entries() {
      return entries
    },

    get records() {
      return entries.map((entry) => entry.record)
    },

    get scene() {
      return scene
    },

    get foldCache() {
      return foldCache
    },

    version: 0,

    append(record, transaction) {
      const { records, scene: next } = document.appendAll([record], transaction)
      return { record: records[0], scene: next }
    },

    /**
     * Append several records as **one undoable step**.
     *
     * The plural form is the primitive and `append` is the singular case of it,
     * rather than the other way round, because section 19's granularity rule is
     * about user actions and one action is not always one record: placing a
     * composite is its recipe record plus the translate that drops it where the
     * pointer let go (`ui-030`). Appending those in a loop would cost the user
     * two presses of Undo for one drag — and would leave the intermediate,
     * un-positioned state on screen in between.
     *
     * Not atomic across the batch by design: each record is trial-folded and
     * committed in turn, exactly as a loop of `append` calls was, so a failure
     * partway leaves the earlier records in. That is unchanged behaviour from
     * `ui-030`'s own loop; `data-004`'s atomicity contract is about a rejected
     * *replay*, which is {@link rebuildFrom}'s, not this fast path's.
     *
     * **While rolled back, this inserts at the marker** (`data-004`, section
     * 18: "any new local mutation … is inserted immediately after the marker").
     * Putting it here rather than in `ui-032` is what makes drag-place, the
     * Operations toolbar, the gizmo, the Inspector and Sketch all obey section
     * 18's "nothing is blocked" without one of them knowing the marker exists.
     * Non-local records take the same path, deliberately: appending one past the
     * marker would land it in the inactive tail, where the user would never see
     * the arrival section 19 point 3 says must announce itself.
     */
    appendAll(records, transaction) {
      const origin = transaction?.origin
      if (rollbackAt !== null) return document.insertAt(rollbackAt, records, transaction)
      // `TODO/ui-052`: a condition reads its ref from the whole log, so once the document
      // has one, an append (a delete of the Pi a condition reads, a new conditioned
      // record) has to re-fold to re-judge it. Rare, and the fold cache makes it cheap.
      // `TODO/core-050`: likewise variables — a binding reads its variable from the whole log,
      // so a new definition can repair an earlier binding, and a new binding is judged against
      // every definition, wherever it sits.
      const refolds = (/** @type {OpRecord} */ record) => record.when !== undefined || usesVariables(record)
      if (records.some(refolds) || entries.some((entry) => refolds(entry.record))) {
        return document.insertAt(entries.length, records, transaction)
      }

      // Only a local step is ever undone, so only a local step needs the state
      // before it kept (`TODO/core-030`) — a remote or seed append pays nothing.
      const prior = origin === 'local' && keepRestorable > 0 ? captureState() : null

      /** @type {OpRecord[]} */
      const appended = []
      for (const record of records) {
        ingest(record, origin)
        entries.push({ record, origin, ...intentFor(transaction, record) })
        appended.push(record)
        // Per committed record, not once at the end: a batch that throws part-way
        // has still changed the document, and no step's restore data may match it.
        bumpState()
      }

      // Origin scoping, the whole of it on the write side: only this user's own
      // edits become something Undo can reach. A programmatic or remote record
      // is a first-class part of the document — it is in `entries`, in
      // `bodies()`, and will carry an origin chip in `ui-032`'s History — but it
      // is not theirs to take back (section 19, point 1).
      if (origin === 'local' && appended.length > 0) {
        /** @type {HistoryStep} */
        const step = {
          origin,
          label: transaction.label ?? labelFor(appended),
          records: appended,
          meta: transaction.meta,
          rollbackBefore: null,
          rollbackAfter: null,
        }
        undoStack.push(step)
        keepRestore(undoStack, step, prior)
        // Point 3: only a *new local mutation* clears redo. A remote arrival
        // must not, or someone else's edit silently eats the user's redo.
        redoStack.length = 0
      }

      document.version += 1
      return { records: appended, scene }
    },

    /**
     * Run `build`, which appends through this document as often as it needs,
     * and make everything it did **one undoable step** — atomically
     * (`TODO/ui-044`).
     *
     * {@link WarpDocument.appendAll} covers several records that can all be
     * written down before any is committed. A param edit cannot be: its
     * rotate-back and move-back are measured against the body the rebuilt record
     * produces, so each record has to be built after the one before has folded.
     * `batch` lets `build` do exactly that through the ordinary `append`
     * (rolled back or not; the marker path is `insertAt`'s, unchanged), then
     * merges the local steps it pushed into one, labelled by the first unless
     * `options.label` says otherwise.
     *
     * `build` may also call a row action such as {@link WarpDocument.reviseRecords}
     * (`TODO/core-056`). A batch of record steps merges into one step whose records
     * are concatenated; one that mixes in a revision becomes a composite step
     * carrying each as a `part`, which Undo reverses newest-first and Redo replays
     * oldest-first, all or nothing. A batch of a single revision is just that step.
     *
     * Atomic, unlike `appendAll`'s fast path: if `build` throws, the state
     * captured before it (`TODO/core-030`'s {@link restoreState}, exact by
     * construction) and both stacks are put back, and the error is rethrown.
     * `version` still moves forward, never back to a number a reader may have
     * cached against a state from the middle of the batch.
     *
     * @template T
     * @param {(document: WarpDocument) => T} build
     * @param {{ label?: string }} [options]
     * @returns {T}
     */
    batch(build, options = {}) {
      const before = captureState()
      const undoBefore = undoStack.slice()
      const redoBefore = redoStack.slice()
      /** @type {T} */
      let result
      try {
        result = build(document)
      } catch (error) {
        restoreState(before)
        undoStack.splice(0, undoStack.length, ...undoBefore)
        redoStack.splice(0, redoStack.length, ...redoBefore)
        document.version += 1
        throw error
      }

      // The steps `build` pushed, oldest first. Local record steps merge by
      // concatenating their records; a batch that also pushed a row action
      // (`revision`) becomes a composite step carrying every one as a part
      // (`TODO/core-056`), so one Undo reverses the append and the revision together.
      const pushed = undoStack.slice(undoBefore.length)
      if (options.label !== undefined && pushed.length === 1) pushed[0].label = options.label
      if (pushed.length <= 1) return result

      const [first] = pushed
      const last = /** @type {HistoryStep} */ (pushed.at(-1))
      const composite = pushed.some((step) => step.revision !== undefined)
      /** @type {HistoryStep} */
      const merged = {
        ...first,
        label: options.label ?? first.label,
        // Contiguous in the log: appended at the tail, or inserted one after
        // another at a marker that advances with each insert.
        records: pushed.flatMap((step) => step.records),
        rollbackAfter: last.rollbackAfter,
        ...(composite ? { parts: partsWithIndexes(pushed, before.entries) } : {}),
      }
      if (composite) {
        // A composite is not a record step and not a revision: neither shape's
        // fields on the first part may leak onto it.
        delete merged.revision
        delete merged.index
      }
      undoStack.splice(undoBefore.length, pushed.length, merged)
      keepRestore(undoStack, merged, before)
      return result
    },

    /**
     * Splice records in at a position and re-fold — section 18's fixed
     * requirement on this task, and already half-built: `redo` has been
     * insert-at-index since `data-003`.
     *
     * Atomic, unlike `appendAll`'s fast path, because it goes through
     * {@link rebuildFrom}: a record that will not fold leaves the log untouched
     * rather than half-inserted. The marker moves with the insert when the
     * insert lands at or before it, which is what makes the strip's counts
     * (`step 3 of 6 — 3 later steps inactive`) come out right, and what `undo`
     * puts back via `rollbackBefore`.
     */
    insertAt(index, records, transaction) {
      const origin = transaction?.origin
      if (typeof origin !== 'string' || origin.length === 0) {
        throw new Error(
          'document.insertAt: a transaction origin is required — ' +
            "every mutation is origin-tagged so undo/redo can be scoped to the local user's own edits"
        )
      }
      const at = Math.max(0, Math.min(index, entries.length))
      const rollbackBefore = rollbackAt
      const next = entries.slice()
      next.splice(at, 0, ...records.map((record) => ({ record, origin: entryOriginFor(transaction, record) ?? origin, ...intentFor(transaction, record) })))
      const prior = rebuildFrom(
        next,
        rollbackAt === null || at > rollbackAt ? rollbackAt : rollbackAt + records.length
      )

      const appended = records.slice()
      if (origin === 'local' && appended.length > 0) {
        /** @type {HistoryStep} */
        const step = {
          origin,
          label: transaction.label ?? labelFor(appended, recordMapOf(next)),
          records: appended,
          meta: transaction.meta,
          index: at,
          rollbackBefore,
          rollbackAfter: rollbackAt,
        }
        undoStack.push(step)
        keepRestore(undoStack, step, prior)
        redoStack.length = 0
      }
      document.version += 1
      return { records: appended, scene }
    },

    /**
     * Take a set of records back out in one atomic re-fold — the inverse of {@link insertAt}
     * for writes that never reached the local undo stack (`ai`-origin; `TODO/ai-006`'s
     * **Undo AI turn**). Both undo stacks are left alone.
     *
     * Refuses, by name and without changing anything, when a record outside the set still
     * references one inside it (the same guard `undo` applies), and for an unknown id.
     */
    removeRecords(ids, transaction) {
      const origin = transaction?.origin
      if (typeof origin !== 'string' || origin.length === 0) {
        throw new Error(
          'document.removeRecords: a transaction origin is required — ' +
            'every mutation is origin-tagged so undo/redo can be scoped to the local user\'s own edits'
        )
      }
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('document.removeRecords: at least one record id is required')
      }
      const doomed = new Set(ids)
      for (const id of doomed) {
        if (!entries.some((entry) => entry.record.id === id)) {
          throw new Error(`document.removeRecords: no such record "${id}" in this document`)
        }
      }
      for (const entry of entries) {
        if (entry.record.id !== undefined && doomed.has(entry.record.id)) continue
        for (const referenced of referencedIdsOf(entry.record)) {
          if (!doomed.has(referenced)) continue
          const blocker = entry.record.name ?? entry.record.id ?? entry.record.op
          throw new Error(
            `document.removeRecords: "${blocker}", added via ${entry.origin}, depends on "${referenced}" — edit or delete it first`
          )
        }
      }
      const next = entries.filter((entry) => entry.record.id === undefined || !doomed.has(entry.record.id))
      // The marker is a count of active rows, so it falls by the removed rows that sat before it.
      const nextRollback =
        rollbackAt === null ? null : entries.slice(0, rollbackAt).filter((entry) => next.includes(entry)).length
      rebuildFrom(next, nextRollback)
      for (const id of doomed) {
        originById.delete(id)
        recordById.delete(id)
      }
      document.version += 1
      return { scene }
    },

    /**
     * `TODO/ui-062`: put the log back to `target` — rows, their order, their records, origins,
     * intent and both fold flags — and the marker to `nextRollbackAt`, in **one** atomic re-fold.
     * What **Undo merge** writes: computing the inverse as a list and folding it once means the
     * intermediate states a chain of `insertAt`/`reviseRecords`/`moveStep` calls would pass
     * through (each of which has to fold on its own) never exist. It is stamped like every other
     * mutator — from the diff — so a row that goes becomes a tombstone newer than the row, and a
     * row that comes back gets a fresh `born` that beats the merge's tombstone: the two copies
     * still converge when they are merged again.
     *
     * Never a local step: both undo stacks are left alone, and a `local` origin is refused.
     * Refuses by name, without changing anything, when a row that stays references one that goes
     * — the guard {@link WarpDocument.removeRecords} applies, in the same words — and with a
     * {@link ReplayRejection} naming the row when the target does not fold.
     */
    restoreEntries(target, nextRollbackAt, transaction) {
      const origin = transaction?.origin
      if (typeof origin !== 'string' || origin.length === 0) {
        throw new Error(
          'document.restoreEntries: a transaction origin is required — ' +
            "every mutation is origin-tagged so undo/redo can be scoped to the local user's own edits"
        )
      }
      if (origin === 'local') {
        throw new Error('document.restoreEntries: never a local step — it writes what stays off the local undo stack')
      }
      /** @type {Set<string>} */
      const kept = new Set()
      for (const entry of target) {
        const id = entry?.record?.id
        if (typeof id !== 'string') throw new Error('document.restoreEntries: every row needs an id')
        if (kept.has(id)) throw new Error(`document.restoreEntries: step "${id}" appears twice`)
        kept.add(id)
      }
      /** @type {Set<string>} */
      const leaving = new Set()
      for (const entry of entries) {
        const id = entry.record.id
        if (id !== undefined && !kept.has(id)) leaving.add(id)
      }
      for (const entry of target) {
        for (const referenced of referencedIdsOf(entry.record)) {
          if (!leaving.has(referenced)) continue
          const blocker = entry.record.name ?? entry.record.id ?? entry.record.op
          throw new Error(
            `document.restoreEntries: "${blocker}", added via ${entry.origin}, depends on "${referenced}" — edit or delete it first`
          )
        }
      }
      if (nextRollbackAt !== null && (!Number.isInteger(nextRollbackAt) || nextRollbackAt < 1 || nextRollbackAt >= target.length)) {
        throw new Error(`document.restoreEntries: rollback position ${String(nextRollbackAt)} is not inside the log`)
      }
      /** @type {DocumentEntry[]} */
      const next = target.map((entry) => ({
        record: entry.record,
        origin: entry.origin,
        ...(entry.suppressed === true ? { suppressed: true } : {}),
        ...(entry.leftBroken === true ? { leftBroken: true } : {}),
        ...(typeof entry.intent === 'string' ? withIntent(entry.intent) : {}),
      }))
      rebuildFrom(next, nextRollbackAt)
      for (const id of leaving) {
        originById.delete(id)
        recordById.delete(id)
      }
      document.version += 1
      return { scene }
    },

    canUndo() {
      return undoStack.length > 0
    },

    canRedo() {
      return redoStack.length > 0
    },

    pendingUndo() {
      return undoStack.at(-1)
    },

    pendingRedo() {
      return redoStack.at(-1)
    },

    /**
     * Take the most recent local step back out of the log and re-derive.
     *
     * Refuses — by name, without changing anything — when a record outside the
     * step still references one inside it (section 19, point 4). In practice
     * that can only be a record someone else added, since the step being undone
     * is by construction the newest *local* one; the check is written against
     * "any other entry" rather than "any remote entry" so it stays honest if
     * that ever stops being true.
     *
     * @returns {HistoryStep | undefined} The step undone, or `undefined` when
     *   there was nothing to undo.
     */
    undo() {
      const step = undoStack.at(-1)
      if (step === undefined) return undefined

      // `TODO/core-030`: nothing has touched the document since this step, so
      // the state before it is exactly what re-folding the log without it would
      // produce — the fold is deterministic — and it is put back instead, O(1).
      // No refusal is possible here: nothing was written after the step, so
      // nothing can depend on it, and the state being restored already folded.
      const before = restorable(step)
      if (before !== null) {
        const keyed = withRedoKeys(step)
        const after = captureState()
        restoreState(before)
        undoStack.pop()
        /** @type {HistoryStep} */
        const redoStep =
          step.revision !== undefined || step.parts !== undefined
            ? keyed
            : { ...keyed, index: after.entries.findIndex((entry) => entry.record === step.records[0]) }
        redoStack.push(redoStep)
        keepRestore(redoStack, redoStep, after)
        document.version += 1
        return step
      }

      // `TODO/data-010` item 7: a merge since this step removed or edited what it changed.
      // Undoing it would resurrect their removal or overwrite their edit, so it is dropped
      // from the stack, with a note, and nothing else changes.
      const afterMerge = predatesMerge(step)
      if (afterMerge) {
        const cause = undoConflictOf(step)
        if (cause !== null) {
          undoStack.pop()
          document.version += 1
          return { ...step, dropped: cause, note: undoAfterMergeNote(step.label, cause) }
        }
      }

      // `TODO/core-056`: a batch that mixed record steps with row actions.
      if (step.parts !== undefined) {
        const { parts, before: after } = undoComposite(step, afterMerge)
        undoStack.pop()
        const redoStep = { ...step, parts }
        redoStack.push(redoStep)
        keepRestore(redoStack, redoStep, after)
        document.version += 1
        return step
      }

      // A `data-004` row action added no record, so there is nothing to take
      // out and nothing to orphan — it is reversed by applying its inverse.
      if (step.revision !== undefined) {
        const after = applyRevision(
          invertRevision(step.revision),
          afterMerge ? undoMarkerAfterMerge(step) : step.rollbackBefore ?? null
        )
        undoStack.pop()
        redoStack.push(step)
        keepRestore(redoStack, step, after)
        document.version += 1
        return step
      }

      assertNoDependents(step)
      const stepRecords = liveRecordsOf(step.records)
      const index = entries.findIndex((entry) => stepRecords.has(entry.record))
      const key = keyOfRecord(step.records[0])
      const after = rebuildFrom(
        entries.filter((entry) => !stepRecords.has(entry.record)),
        afterMerge ? markerWithout(stepRecords) : step.rollbackBefore ?? null
      )
      undoStack.pop()
      const redoStep = { ...step, index, key }
      redoStack.push(redoStep)
      // Even after a fold, Redo from here can restore: the state this Undo left
      // is what Redo would re-fold back to, so the state before it is the answer.
      keepRestore(redoStack, redoStep, after)
      document.version += 1
      return step
    },

    /**
     * Put the most recently undone step back where it was.
     *
     * Insert-at-index, not append: a remote record may have arrived while the
     * step was undone, and the redone step belongs at its original position so
     * the log keeps the order everything else was built against. This is the
     * same primitive `data-004` needs for inserting at the rollback marker —
     * built here first because redo needed it anyway.
     *
     * @returns {HistoryStep | undefined}
     */
    redo() {
      const step = redoStack.at(-1)
      if (step === undefined) return undefined

      // The mirror of undo's restore (`TODO/core-030`): still at the state this
      // step's Undo left, so the state before that Undo is exactly the answer.
      const done = restorable(step)
      if (done !== null) {
        const before = captureState()
        restoreState(done)
        redoStack.pop()
        undoStack.push(step)
        keepRestore(undoStack, step, before)
        document.version += 1
        return step
      }

      const afterMerge = predatesMerge(step)
      if (step.parts !== undefined) {
        const before = redoComposite(step, afterMerge)
        redoStack.pop()
        undoStack.push(step)
        keepRestore(undoStack, step, before)
        document.version += 1
        return step
      }

      if (step.revision !== undefined) {
        const before = applyRevision(step.revision, afterMerge ? redoMarkerAfterMerge(step) : step.rollbackAfter ?? null)
        redoStack.pop()
        undoStack.push(step)
        keepRestore(undoStack, step, before)
        document.version += 1
        return step
      }
      // After a merge, by position key (`TODO/data-010`): a merge may have put rows before
      // the index this step was taken out at.
      const at = (afterMerge ? indexForKey(step.key) : undefined) ?? step.index ?? entries.length
      const next = entries.slice()
      next.splice(at, 0, ...step.records.map((record) => ({ record, origin: step.origin })))
      const before = rebuildFrom(next, afterMerge ? redoMarkerAfterMerge(step, at) : step.rollbackAfter ?? null)
      redoStack.pop()
      undoStack.push(step)
      keepRestore(undoStack, step, before)
      document.version += 1
      return step
    },

    /**
     * Forget both stacks, leaving the document itself alone.
     *
     * Section 19 decided the stacks start empty after a reload and after Open /
     * Load-from-repo: "a user who reloads cannot undo their last edit — the
     * accepted cost of the simplest honest rule". Seeding a document from a
     * loaded file is the same case, so `createDocument` calls this below.
     */
    clearHistory() {
      undoStack.length = 0
      redoStack.length = 0
    },

    /**
     * Replace the whole log — the load path shared by autosave restore and Open
     * (`TODO/io-001`), the one place a document arrives from outside rather
     * than being built up by edits.
     *
     * **Atomic**, because it is {@link rebuildFrom}: an entry that does not
     * fold (an op this build does not know, a step whose operand is missing, a
     * record from a newer file) throws a {@link ReplayRejection} naming the row,
     * and the document is exactly as it was — Open's "a bad file leaves the
     * current project untouched". Nothing about the *file's* shape is checked
     * here; that is `src/core/project.js`'s `parseProject`, which runs first.
     *
     * **Clears both undo stacks on success**, exactly as the seed loop at the
     * bottom of {@link createDocument} does, and for the same reason — section
     * 19: "the undo/redo stacks start empty after a reload and after Open". A
     * *refused* load deliberately leaves them alone: nothing was replaced, so
     * nothing about the user's history became untrue.
     *
     * The replica id is kept and the clock is moved past the highest counter in the loaded
     * ids (`TODO/data-008`; a legacy `op-7` id carries none), and `nextId` also skips ids
     * present in `entries`, so ids in the loaded log are never handed out.
     *
     * @param {readonly DocumentEntry[]} nextEntries
     * @param {number | null} [nextRollbackAt] Count of active entries, as
     *   {@link WarpDocument.rollbackAt} reports it; `null` for a whole-log-active
     *   document. Must leave at least one active row and one inactive one.
     * @param {string} [nextResolution] The loaded design's resolution
     *   (`TODO/core-035`) — `parseProject` reads `legacy` for a file with no setting.
     *   Omitted: the current one, which is what a History preview's prefix wants.
     * @param {LoadOptions} [options] `tolerateAll`
     *   folds every failing row as if the user had left it broken, instead of refusing the
     *   load — only for a throwaway document asking "what would break?" (`TODO/ui-052`'s
     *   impact check). `standingInstructions` (`TODO/ai-003`) is the loaded project's; omitted,
     *   it has none. Set only once the fold has succeeded. `userParts` / `unavailableParts`
     *   (`TODO/core-037`) are what `parseProject` returned: the definitions the file carries
     *   and the parts it names that could not be loaded. For the live project they replace the
     *   registry's project layer *before* the fold (which needs them) and are put back if the
     *   fold refuses; omitted, the loaded project carries none. Any other document only makes
     *   missing ones available (an export re-fold in a worker) and changes nothing else.
     */
    loadEntries(nextEntries, nextRollbackAt = null, nextResolution = resolution, options = {}) {
      if (!isResolution(nextResolution)) {
        throw new Error(`document.loadEntries: unknown resolution "${String(nextResolution)}"`)
      }
      if (
        nextRollbackAt !== null &&
        !(Number.isInteger(nextRollbackAt) && nextRollbackAt >= 1 && nextRollbackAt < nextEntries.length)
      ) {
        throw new Error(
          `document.loadEntries: rollback marker ${JSON.stringify(nextRollbackAt)} is not a count ` +
            `between 1 and ${nextEntries.length - 1} for a log of ${nextEntries.length} steps`
        )
      }
      const previousParts = userParts
      const previousLayer = publishesUserParts ? projectPartsSnapshot() : null
      const loadedParts = options.userParts ?? []
      userParts = new Map(loadedParts.map((definition) => [definition.op, definition]))
      if (publishesUserParts) setProjectParts(loadedParts, options.unavailableParts ?? {})
      else if (loadedParts.length > 0) ensureProjectParts(loadedParts)
      try {
        rebuildFrom(nextEntries.map(foldableEntry), nextRollbackAt, nextResolution, {
          tolerateAll: options.tolerateAll === true,
        })
      } catch (error) {
        // Atomic, like the rest of a refused load: the current project's parts stay its own.
        userParts = previousParts
        if (previousLayer !== null) restoreProjectParts(previousLayer)
        throw error
      }
      // After the fold, so a refused load leaves the current project's instructions alone.
      standingInstructions = cleanText(options.standingInstructions, INSTRUCTIONS_MAX_LENGTH)
      // `TODO/io-007`: likewise the build volume; omitted, the loaded project has the default.
      buildVolume = options.buildVolume === undefined ? { ...DEFAULT_BUILD_VOLUME } : normalizeBuildVolume(options.buildVolume)
      // `TODO/data-010`: a loaded log is a log no edit here has stamped, so its metadata is
      // derived; `TODO/data-011`: a version-2 file's merge section is laid over that.
      deriveLegacy()
      // `TODO/data-013`: the loaded file's id, or none. A file without one is legacy unless
      // there is nothing in it, and a legacy document never mints (see `mintable`).
      projectId = null
      if (options.merge !== undefined) applyMergeOverlay(options.merge)
      mintable = projectId === null && nextEntries.length === 0 && (options.merge?.dead.size ?? 0) === 0
      for (const entry of nextEntries) clock.observe(counterOfId(entry.record.id))
      undoStack.length = 0
      redoStack.length = 0
      document.version += 1
    },

    /**
     * `TODO/ai-003`: a record's design intent — the entry's, since intent lives beside the
     * record and never in it.
     */
    intentOf(id) {
      return entries.find((entry) => entry.record.id === id)?.intent
    },

    standingInstructions() {
      return standingInstructions
    },

    /**
     * `TODO/ai-003`: replace the project's standing instructions. Origin-tagged like every
     * mutation (it is a change a reader of the file can see), cleaned and capped, and a
     * version bump so autosave and the save-status chip follow it. Deliberately **not** an
     * undo step — see {@link standingInstructions}'s note. Setting the same text is a no-op.
     */
    setStandingInstructions(text, transaction) {
      const origin = transaction?.origin
      if (typeof origin !== 'string' || origin.length === 0) {
        throw new Error(
          'document.setStandingInstructions: a transaction origin is required — ' +
            "every mutation is origin-tagged so undo/redo can be scoped to the local user's own edits"
        )
      }
      const next = cleanText(text, INSTRUCTIONS_MAX_LENGTH)
      if (next === standingInstructions) return
      standingInstructions = next
      document.version += 1
    },

    buildVolume() {
      return { ...buildVolume }
    },

    /**
     * `TODO/core-037`: the user-part definitions this project carries, in op order — what
     * `serializeProject` writes, trimmed there to the ones still in use.
     */
    userParts() {
      return [...userParts.values()].sort((a, b) => (a.op < b.op ? -1 : a.op > b.op ? 1 : 0))
    },

    /**
     * `TODO/io-007`: replace the build volume. Origin-tagged and a version bump (autosave and
     * the save-status chip follow it), validated, and — like the standing instructions — not
     * an undo step. Setting the same volume is a no-op.
     */
    setBuildVolume(volume, transaction) {
      const origin = transaction?.origin
      if (typeof origin !== 'string' || origin.length === 0) {
        throw new Error(
          'document.setBuildVolume: a transaction origin is required — ' +
            "every mutation is origin-tagged so undo/redo can be scoped to the local user's own edits"
        )
      }
      const next = normalizeBuildVolume(volume)
      if (next.widthMm === buildVolume.widthMm && next.depthMm === buildVolume.depthMm && next.heightMm === buildVolume.heightMm) {
        return
      }
      buildVolume = next
      document.version += 1
    },

    originOf(id) {
      return originById.get(id)
    },

    /**
     * The id of the record currently representing `id`'s logical body — `id`
     * itself until something supersedes it. This is what a transform record's
     * `target`/`supersedes` must name, so a second drag builds on the first
     * rather than on the original.
     */
    currentIdOf(id) {
      let root = rootById.get(id)
      if (root === undefined) return undefined
      // Walk forward through both kinds of continuation: a supersession moves
      // the answer along one lineage, and a consumption hops to the lineage that
      // absorbed it. Without the second hop, a selection or an MCP reference to
      // a body that has since been unioned into something else would dangle on
      // a record that is no longer on screen.
      const visited = new Set()
      for (;;) {
        const terminal = terminalByRoot.get(root) ?? root
        const absorbedBy = mergedInto.get(root)
        if (absorbedBy === undefined || visited.has(root)) return terminal
        visited.add(root)
        const nextRoot = rootById.get(absorbedBy)
        if (nextRoot === undefined) return terminal
        root = nextRoot
      }
    },

    /**
     * The lineage root `id` belongs to — a body's stable identity, which is what
     * `bodies()` reports and what a selection holds.
     *
     * The inverse question to `currentIdOf`, and added for the same caller
     * `data-003` added that one for: after a redo, the store has the step's
     * *record* ids and needs the *body* ids to put the selection back.
     *
     * @param {string} id
     * @returns {string | undefined}
     */
    rootOf(id) {
      return rootById.get(id)
    },

    /**
     * One record by id, read off `entries` rather than the derived indexes — so
     * it answers for a suppressed or inactive row too, which is exactly what
     * `ui-032`'s list and its Edit form need.
     */
    recordOf(id) {
      return entries.find((entry) => entry.record.id === id)?.record
    },

    /** Section 18's marker, as an active-entry count. `null` when not rolled back. */
    rollbackAt() {
      return rollbackAt
    },

    resolution() {
      return resolution
    },

    /**
     * `TODO/core-035`: change the design resolution — how finely every curve without an
     * explicit `segments` is faceted — and re-fold the whole log at it.
     *
     * Modelled directly on {@link WarpDocument.setSuppressed}: a {@link LogRevision}
     * (`kind: 'resolution'`) rather than a record, because the setting is a property of
     * the whole design and not a step in its history, and one {@link rebuildFrom} — so
     * it is atomic, origin-scoped (only a `local` change is one Undo) and restorable
     * like every other row action. The fold cache and the undo snapshots both carry the
     * resolution, so neither can hand back a body faceted at the old setting.
     *
     * Choosing the value already set is a no-op with no undo step; an unknown preset is
     * refused by name with the document untouched.
     */
    setResolution(next, transaction) {
      if (!isResolution(next)) {
        throw new Error(`document.setResolution: unknown resolution "${String(next)}"`)
      }
      if (next === resolution) return { scene }
      const from = resolution
      const rollbackBefore = rollbackAt
      const prior = rebuildFrom(entries.slice(), rollbackAt, next)
      pushRevision(
        transaction,
        `Resolution → ${resolutionLabel(next)}`,
        { kind: 'resolution', fromResolution: from, toResolution: next },
        rollbackBefore,
        prior
      )
      return { scene }
    },

    /**
     * Every row, in log order — `ui-032`'s whole data source.
     *
     * Derived on call, never stored: the panel re-reads it after every version
     * bump, and a stored copy is one more thing that can disagree with the log.
     */
    timeline() {
      const activeCount = rollbackAt ?? entries.length
      const byId = recordMapOf(entries)
      const conditionOf = conditionReader(byId, activeCount)
      return entries.map((entry, index) => {
        const key = entry.record.id ?? `#${index + 1}`
        return {
          step: index + 1,
          id: entry.record.id ?? '',
          record: entry.record,
          origin: entry.origin,
          intent: entry.intent ?? null,
          label: labelFor([entry.record], byId),
          suppressed: entry.suppressed === true,
          active: index < activeCount,
          broken: brokenById.get(key) ?? null,
          relinkTo: index < activeCount ? null : relinkPlanOf(index)?.to ?? null,
          inactiveBy: inactiveById.get(key) ?? null,
          condition: conditionOf(entry.record),
        }
      })
    },

    /**
     * `TODO/ui-052`: the condition a row carries or inherits from its body's creation
     * record — the Inspector's Condition row for a selected body. `null` for none.
     *
     * @param {string} id Any record id; a body's lineage root id for the whole body.
     * @returns {RowCondition | null}
     */
    conditionOf(id) {
      const record = document.recordOf(id)
      if (record === undefined) return null
      return conditionReader(recordMapOf(entries), rollbackAt ?? entries.length)(record)
    },

    /**
     * `TODO/ui-052`: the bodies a condition on their creation record is leaving out of
     * the fold — or whose condition cannot be evaluated — in log order. Not in
     * {@link WarpDocument.bodies} (they are not drawn and cannot be picked), but the
     * object list shows them greyed so a user can still select one and edit or remove
     * its condition.
     */
    inactiveBodies() {
      const activeCount = rollbackAt ?? entries.length
      const byId = recordMapOf(entries)
      const conditionOf = conditionReader(byId, activeCount)
      /** @type {InactiveBody[]} */
      const list = []
      entries.forEach((entry, index) => {
        const { record } = entry
        if (index >= activeCount || entry.suppressed === true) return
        if (record.when === undefined || record.id === undefined) return
        if (record.supersedes !== undefined || record.consumes !== undefined) return
        if (rootById.has(record.id)) return
        const condition = conditionOf(record)
        if (condition === null) return
        list.push({
          id: record.id,
          name: record.name ?? record.id,
          op: record.op,
          state: inactiveById.has(record.id) ? 'inactive' : 'invalid',
          condition,
        })
      })
      return list
    },

    /**
     * Every row that does not build, as {@link BrokenStep}s rather than a flag, so
     * the panel can show the reason on hover without asking again: section 18's
     * inactive-tail rows the shadow check could not build, and (`TODO/ui-052`) active
     * rows the user chose to leave broken or whose condition cannot be evaluated.
     *
     * An ordinary failure in the **active** document is still an atomic rejection,
     * never a flag — only a row the user flagged `leftBroken` gets here from the
     * active fold.
     */
    brokenSteps() {
      if (brokenById.size === 0) return []
      const byId = recordMapOf(entries)
      /** @type {BrokenStep[]} */
      const steps = []
      entries.forEach((entry, index) => {
        const reason = brokenById.get(entry.record.id ?? `#${index + 1}`)
        if (reason === undefined) return
        steps.push({
          id: entry.record.id ?? '',
          step: index + 1,
          label: labelFor([entry.record], byId),
          reason,
        })
      })
      return steps
    },

    /**
     * Section 15: edit one past step **in place** and replay everything after it.
     *
     * The replacement keeps the step's id and everything the log's shape is
     * built on (see {@link SHAPE_FIELDS}) — only its params change. That is what
     * makes this safe without re-parenting anything: every later record's
     * reference still names a record that is still there, so the re-fold is
     * literally "the same fold, one input changed", which is the correctness
     * argument this task's Proposed fix asked for.
     *
     * Atomic. A later record that will not build throws a {@link ReplayRejection}
     * naming that row, and the document is left exactly as it was — including
     * the derived indexes, which `rebuildFrom` restores from its snapshot.
     *
     * Build the replacement with `src/core/paramEdit.js`'s `stepParamEditRecord`
     * rather than by hand; it owns which params are editable on a past step and
     * why, the same way `paramEditability` owns `ui-029`'s append-path rule.
     */
    replaceRecord(id, record, transaction) {
      const index = indexOfRecord(id)
      if (index < 0) {
        throw new Error(`document.replaceRecord: no step "${id}" in this document`)
      }
      if (record === null || record === undefined) {
        throw new Error(
          'document.replaceRecord: a replacement record is required — `stepParamEditRecord` ' +
            'returns `null` for an edit that changes nothing, and that means there is nothing to do'
        )
      }
      const current = entries[index].record
      if (record.id !== id) {
        throw new Error(
          `document.replaceRecord: the replacement for "${id}" carries \`id\` ` +
            `"${record.id}" — a step is replaced in place precisely so every later record's ` +
            'reference to it stays valid, so its id may never change'
        )
      }
      /** @param {OpRecord} a @param {OpRecord} b @param {string} field */
      const sameShape = (a, b, field) => {
        const key = /** @type {keyof OpRecord} */ (field)
        return JSON.stringify(a[key] ?? null) === JSON.stringify(b[key] ?? null)
      }
      const reshaped = SHAPE_FIELDS.find((field) => !sameShape(record, current, field))
      // `TODO/data-006`: the one widening of this guard, knowingly narrow. What the step
      // operates on may change only when the result is **exactly** the re-link
      // `relinkPlanOf` offers this row — a broken tail row pointed at the body an active
      // step moved — field for field across every shape field. Anything else (another
      // body, half a re-link, an active row, a row with no offer) is refused as before.
      const relink = reshaped === undefined ? null : relinkPlanOf(index)
      if (reshaped !== undefined && (relink === null || !SHAPE_FIELDS.every((field) => sameShape(record, relink.record, field)))) {
        throw new Error(
          `document.replaceRecord: the replacement for "${id}" changes \`${reshaped}\` — ` +
            'editing a past step rewrites its parameters, never what it operates on; ' +
            'changing that is a reorder or a new step, not an edit'
        )
      }

      const rollbackBefore = rollbackAt
      const next = entries.slice()
      next[index] = { ...next[index], record }
      const prior = rebuildFrom(next)
      pushRevision(
        transaction,
        `${relink === null ? 'Edit' : 'Re-link'} step ${index + 1}`,
        { kind: 'replace', id, from: current, to: record },
        rollbackBefore,
        prior
      )
      return { scene }
    },

    /**
     * `TODO/data-006` (option c): point a broken tail row at the body an active step has
     * since moved — the row's `Re-link to the moved step` action. Nothing re-points until
     * this is called; a row it could fix stays `broken` until then, with
     * {@link TimelineRow.relinkTo} naming where it would point.
     *
     * Not a second primitive: it builds the one record {@link relinkPlanOf} offers and
     * hands it to {@link WarpDocument.replaceRecord}, whose guard accepts exactly that
     * record and nothing else. So it is one undoable `Re-link step N`, and Undo is
     * `replaceRecord`'s own inverse — the original `supersedes`/`target` back.
     *
     * Refused, changing nothing, for a row with no offer: an active row, a row that is not
     * broken, one broken because its own build throws, or one whose body was consumed or
     * deleted rather than moved.
     */
    relinkStep(id, transaction) {
      const index = indexOfRecord(id)
      if (index < 0) {
        throw new Error(`document.relinkStep: no step "${id}" in this document`)
      }
      const plan = relinkPlanOf(index)
      if (plan === null) {
        throw new Error(
          `document.relinkStep: step ${index + 1} has nothing to re-link — only a step after the ` +
            'rollback point that broke because a step before it moved the body it builds on can be ' +
            'pointed at the moved step'
        )
      }
      return document.replaceRecord(id, plan.record, transaction)
    },

    /**
     * Section 16: take a step out of the evaluation without taking it out of the
     * log, or put it back.
     *
     * Non-destructive by construction — the entry keeps its place and its
     * record, and the fold skips it. Unsuppress therefore restores *exactly* the
     * previous result, because it is the same fold again.
     *
     * Allowed on an inactive row (section 18's "cheap — nothing needs
     * evaluating"), and refused by name when a later **active** step needs the
     * one being suppressed: `Step 3 (Union) needs Cube 1`.
     */
    setSuppressed(id, suppressed, transaction) {
      const index = indexOfRecord(id)
      if (index < 0) {
        throw new Error(`document.setSuppressed: no step "${id}" in this document`)
      }
      const was = entries[index].suppressed === true
      const wanted = suppressed === true
      if (was === wanted) return { scene }

      const rollbackBefore = rollbackAt
      const next = entries.slice()
      next[index] = { ...next[index], suppressed: wanted }
      const prior = rebuildFrom(next)
      pushRevision(
        transaction,
        `${wanted ? 'Suppress' : 'Unsuppress'} step ${index + 1}`,
        { kind: 'suppress', id, fromSuppressed: was, toSuppressed: wanted },
        rollbackBefore,
        prior
      )
      return { scene }
    },

    /**
     * `TODO/ui-052`: revise several rows **in place**, as one undoable step — the
     * composite param edit and every fix the repair dialog chose (Remap, Detach, Only
     * when…, Leave broken), or a condition edited or removed from the Inspector.
     *
     * The multi-row sibling of {@link WarpDocument.replaceRecord}, with the same
     * correctness argument — every row keeps its id, so every later reference still
     * names a record that is still there — and a rule that is wider in exactly the
     * three ways the repair dialog needs and no others:
     *
     * - `target`/`operands` may **rename a piece** or **drop an operand**, but may not
     *   reach any record the row did not already reference (a Remap; a Detach);
     * - `op` may change from `group.snap`/`group.align` to `transform.translate` only
     *   (a Detach);
     * - `when` may be set, changed or removed (Only when…, Edit, Remove).
     *
     * `supersedes` and `consumes` never change: they are the lineage itself.
     *
     * Atomic, through {@link rebuildFrom}: a row that no longer builds and is not
     * flagged `leftBroken` refuses the whole revision by name, and nothing changes.
     *
     * `options.remove` (`TODO/core-050`) takes **one** record out of the log in the same
     * step — a project variable deleted while its bindings are rewritten to literals, so the
     * delete and the rewrite are one press of Undo, which puts the record back where it was.
     * Refused, by name, while any record left behind still references it by id.
     */
    reviseRecords(changes, transaction, options = {}) {
      const removeIds = [...(options.remove ?? [])]
      if (!Array.isArray(changes) || (changes.length === 0 && (options.append ?? []).length === 0 && removeIds.length === 0)) {
        throw new Error('document.reviseRecords: at least one revision is required')
      }
      if (removeIds.length > 1) {
        throw new Error('document.reviseRecords: a revision removes at most one record')
      }
      const next = entries.slice()
      /** @type {NonNullable<LogRevision['items']>} */
      const items = []
      /** @type {Set<string>} */
      const seen = new Set()
      for (const change of changes) {
        const index = indexOfRecord(change?.id)
        if (index < 0) throw new Error(`document.reviseRecords: no step "${change?.id}" in this document`)
        if (seen.has(change.id)) throw new Error(`document.reviseRecords: step "${change.id}" is revised twice`)
        seen.add(change.id)
        const current = next[index]
        const record = change.record ?? current.record
        assertRevisable(current.record, record)
        const fromLeftBroken = current.leftBroken === true
        const toLeftBroken = change.leftBroken ?? fromLeftBroken
        next[index] = withLeftBroken({ ...current, record }, toLeftBroken)
        items.push({ id: change.id, from: current.record, to: record, fromLeftBroken, toLeftBroken })
      }
      // `TODO/core-050`: the one record this step takes out, checked before anything moves.
      /** @type {{ at: number, records: OpRecord[] } | undefined} */
      let removal
      if (removeIds.length === 1) {
        const [removeId] = removeIds
        const at = indexOfRecord(removeId)
        if (at < 0) throw new Error(`document.reviseRecords: no step "${removeId}" to remove`)
        if (seen.has(removeId)) throw new Error(`document.reviseRecords: step "${removeId}" is both revised and removed`)
        for (const entry of next) {
          if (entry.record.id === removeId) continue
          if (!referencedIdsOf(entry.record).includes(removeId)) continue
          throw new Error(
            `document.reviseRecords: "${entry.record.name ?? entry.record.id ?? entry.record.op}" depends on "${removeId}" — it cannot be removed`
          )
        }
        removal = { at, records: [next[at].record] }
      }
      // `TODO/sketch-003`: records that arrive *with* the revision — the photo an Edit
      // sketch session added — go into the log in the same step, at the rollback marker
      // (the end of the active part), so a rolled-back document still folds them.
      const appended = [...(options.append ?? [])]
      const changed = items.some(
        (item) =>
          JSON.stringify(item.from) !== JSON.stringify(item.to) || item.fromLeftBroken !== item.toLeftBroken
      )
      if (!changed && appended.length === 0 && removal === undefined) return { scene }

      const rollbackBefore = rollbackAt
      let nextRollback = rollbackAt
      if (removal !== undefined) {
        next.splice(removal.at, 1)
        if (nextRollback !== null && removal.at < nextRollback) nextRollback -= 1
        if (nextRollback !== null && (nextRollback < 1 || nextRollback >= next.length)) nextRollback = null
      }
      const addAt = nextRollback ?? next.length
      if (appended.length > 0) {
        next.splice(addAt, 0, ...appended.map((record) => ({ record, origin: transaction?.origin ?? 'local' })))
      }
      const prior = rebuildFrom(next, nextRollback === null ? null : nextRollback + appended.length)
      pushRevision(
        transaction,
        items.length === 1 ? `Edit step ${indexOfRecord(items[0].id) + 1}` : `Edit ${items.length} steps`,
        {
          kind: 'revise',
          items,
          ...(appended.length > 0 ? { add: { at: addAt, records: appended } } : {}),
          ...(removal !== undefined ? { remove: removal } : {}),
        },
        rollbackBefore,
        prior
      )
      return { scene }
    },

    /**
     * `TODO/core-050`: the project variables the current fold resolved every binding
     * against, in log order — fresh copies, never the fold's own table.
     */
    variables() {
      return [...variableTable.values()].map((variable) => ({ ...variable }))
    },

    /**
     * TODO/data-005: recolour a placed body, or one of its named sub-parts,
     * after the fact — the user-facing half of `TODO/core-026`'s recipe-baked
     * `color`. Appends a **new, unnamed `style.recolor` record** over `id`'s
     * current terminal, the same supersedes-based edit shape `TODO/ui-029`'s
     * param edit and `src/core/transform.js`'s move/rotate already use, so the
     * override stays visible in the timeline (`ui-032`) the way a param edit
     * does, rather than silently rewriting history. See `style.recolor`'s own
     * doc comment in `src/core/kernel/registry.js` for why the kernel fold does
     * not interpret the colour it carries.
     *
     * `override.subPart`, if given, narrows the override to one named part of
     * the body's `Group` — `ui-016`'s single-part selection address
     * (`{ bodyId, partName }`), not `core-024`'s comma-list `pieces` operand
     * addressing: a colour override always targets exactly one part, never a
     * set, so reusing `pieces`'s plural shape here would claim a capability
     * this does not have. Composes with `core-024` by staying out of its way
     * rather than by reusing its field. Absent, the override applies to the
     * whole body. Overriding a second part later does not disturb the first —
     * see `colorOverridesOf`.
     *
     * `id` may be any record in the body's lineage, not just its root — the
     * same generosity `document.currentIdOf` already gives every other lookup
     * here.
     *
     * Clearing one is {@link WarpDocument.clearColorOverride} (`TODO/ui-037`).
     *
     * @param {string} id
     * @param {{ color: number, colorAlpha?: number, subPart?: string }} override
     * @param {TransactionOptions} transaction
     */
    setColorOverride(id, override, transaction) {
      if (override === null || typeof override !== 'object') {
        throw new Error('document.setColorOverride: an override object is required')
      }
      if (!Number.isInteger(override.color) || override.color < 0 || override.color > 0xffffff) {
        throw new Error(
          'document.setColorOverride: `color` must be a 0xRRGGBB integer, got ' +
            JSON.stringify(override.color)
        )
      }
      if (
        override.colorAlpha !== undefined &&
        (!Number.isFinite(override.colorAlpha) || override.colorAlpha <= 0 || override.colorAlpha > 1)
      ) {
        throw new Error(
          'document.setColorOverride: `colorAlpha` must be a number in (0, 1], got ' +
            JSON.stringify(override.colorAlpha)
        )
      }
      if (
        override.subPart !== undefined &&
        (typeof override.subPart !== 'string' || override.subPart.length === 0)
      ) {
        throw new Error(
          'document.setColorOverride: `subPart` must be a non-empty string, got ' +
            JSON.stringify(override.subPart)
        )
      }

      const currentId = document.currentIdOf(id)
      if (currentId === undefined) {
        throw new Error(`document.setColorOverride: no such body "${id}" in this document`)
      }
      const record = {
        id: document.nextId(`${id}-color`),
        op: RECOLOR_OP,
        target: currentId,
        supersedes: currentId,
        colorOverride: override.color,
        ...(override.colorAlpha !== undefined && override.colorAlpha !== 1
          ? { colorAlpha: override.colorAlpha }
          : {}),
        ...(override.subPart !== undefined ? { subPart: override.subPart } : {}),
      }
      return document.append(record, transaction)
    },

    /**
     * TODO/ui-037: put a body (or one named sub-part) back to its default
     * colour. Appends a `style.recolor` record whose `colorOverride` is `null` —
     * the same unnamed, supersedes-based shape as {@link setColorOverride}, so a
     * reset is one visible, undoable History step rather than a record quietly
     * deleted out of the log (which would make Undo of the reset impossible and
     * rewrite history the user already saw). `colorOverridesOf` reads the `null`
     * as "drop this key", and only this key.
     *
     * Not validated against whether an override is actually in force: whether a
     * reset is *worth* appending is the caller's judgement (the Inspector's
     * Reset button is disabled when there is nothing of this key's own to
     * reset), and refusing here would make a harmless no-op a thrown error.
     *
     * @param {string} id
     * @param {{ subPart?: string }} target
     * @param {TransactionOptions} transaction
     */
    clearColorOverride(id, target, transaction) {
      const subPart = target?.subPart
      if (subPart !== undefined && (typeof subPart !== 'string' || subPart.length === 0)) {
        throw new Error(
          'document.clearColorOverride: `subPart` must be a non-empty string, got ' + JSON.stringify(subPart)
        )
      }
      const currentId = document.currentIdOf(id)
      if (currentId === undefined) {
        throw new Error(`document.clearColorOverride: no such body "${id}" in this document`)
      }
      const record = {
        id: document.nextId(`${id}-color`),
        op: RECOLOR_OP,
        target: currentId,
        supersedes: currentId,
        colorOverride: null,
        ...(subPart !== undefined ? { subPart } : {}),
      }
      return document.append(/** @type {OpRecord} */ (record), transaction)
    },

    /**
     * TODO/core-038: rename a body (or group) — appends one unnamed `style.rename` record over
     * the lineage's current terminal, the same shape as {@link setColorOverride}, so a rename
     * is one visible, undoable step and nothing in history is rewritten. `name` is trimmed;
     * `null`, empty or whitespace clears the override and the generated name returns.
     * Duplicates are allowed (see `naming.js`'s `isDuplicateName` for a UI warning).
     *
     * `id` may be any record in the lineage. A body that has been deleted is refused, by its
     * displayed name. A group's sub-part names are fixed (they are addressed by name in
     * booleans and colour overrides), so there is no `subPart` here.
     *
     * `nextName` is deliberately unchanged: it numbers the *root* records' generated names,
     * so renaming `Bolt 1` does not free the number and the next drop is `Bolt 2`.
     *
     * @param {string} id
     * @param {string | null} name
     * @param {TransactionOptions} transaction
     */
    renameBody(id, name, transaction) {
      const checked = normalizeBodyName(name)
      if (!checked.ok) throw new Error(`document.renameBody: ${checked.reason}`)
      const root = typeof id === 'string' ? rootById.get(id) : undefined
      if (root === undefined) throw new Error(`document.renameBody: no such body "${id}" in this document`)
      if (isDeletedRoot(root)) {
        throw new Error(`document.renameBody: ${currentNameOfRoot(root) ?? root} has been deleted`)
      }
      if (mergedInto.has(root)) {
        throw new Error(
          `document.renameBody: ${currentNameOfRoot(root) ?? root} has been consumed into another body — rename that one instead`
        )
      }
      const currentId = /** @type {string} */ (document.currentIdOf(id))
      return document.append(
        {
          id: document.nextId(`${root}-rename`),
          op: RENAME_OP,
          target: currentId,
          supersedes: currentId,
          params: { name: checked.name },
        },
        transaction
      )
    },

    /**
     * TODO/ui-051: delete one or more bodies as **one undoable step** — one
     * `body.delete` tombstone per body, superseding its current terminal, appended
     * together through {@link WarpDocument.appendAll} (so while rolled back they
     * insert at the marker, like every other mutation). See the module note.
     *
     * `ids` may be any record in each body's lineage. Validated up front and
     * all-or-nothing: an unknown id, a body already deleted or
     * already consumed into another, or one body named twice throws before anything
     * is appended. An empty list is a no-op that appends nothing.
     *
     * @param {readonly string[]} ids
     * @param {TransactionOptions} transaction
     */
    deleteBodies(ids, transaction) {
      if (!Array.isArray(ids)) throw new Error('document.deleteBodies: an array of body ids is required')
      if (ids.length === 0) return { records: [], scene }
      /** @type {Set<string>} */
      const roots = new Set()
      /** @type {string[]} */
      const terminals = []
      for (const id of ids) {
        const root = typeof id === 'string' ? rootById.get(id) : undefined
        if (root === undefined) throw new Error(`document.deleteBodies: no such body "${id}" in this document`)
        const name = currentNameOfRoot(root) ?? root
        if (isDeletedRoot(root)) throw new Error(`document.deleteBodies: ${name} has already been deleted`)
        if (mergedInto.has(root)) {
          throw new Error(
            `document.deleteBodies: ${name} has been consumed into another body — delete that one instead`
          )
        }
        if (roots.has(root)) throw new Error(`document.deleteBodies: ${name} is named twice`)
        roots.add(root)
        terminals.push(terminalByRoot.get(root) ?? root)
      }
      const records = terminals.map((terminal) => ({
        id: document.nextId(`${rootById.get(terminal)}-delete`),
        op: DELETE_OP,
        target: terminal,
        supersedes: terminal,
      }))
      const label =
        transaction?.label ?? (records.length === 1 ? labelFor(records) : `Delete ${records.length} objects`)
      return document.appendAll(records, { ...transaction, label })
    },

    /**
     * TODO/ui-051: remove one named part from a group-valued body. The body
     * survives, so this is a supersession — a `group.removePart` record over its
     * current terminal, evaluated by the kernel (`kernel/group.js`'s `removePart`,
     * which refuses an unknown part and the last visible one).
     *
     * @param {string} id Any record in the body's lineage.
     * @param {string} partName
     * @param {TransactionOptions} transaction
     */
    removePart(id, partName, transaction) {
      if (typeof partName !== 'string' || partName.length === 0) {
        throw new Error(`document.removePart: a part name is required, got ${JSON.stringify(partName)}`)
      }
      const root = rootById.get(id)
      if (root === undefined) throw new Error(`document.removePart: no such body "${id}" in this document`)
      if (isDeletedRoot(root)) {
        throw new Error(`document.removePart: ${currentNameOfRoot(root) ?? root} has been deleted`)
      }
      const currentId = /** @type {string} */ (document.currentIdOf(id))
      return document.append(
        {
          id: document.nextId(`${root}-remove`),
          op: REMOVE_PART_OP,
          target: currentId,
          supersedes: currentId,
          params: { part: partName },
        },
        transaction
      )
    },

    /**
     * Section 17's static legality check, so `Move up` / `Move down` are honestly
     * disabled *before* the press rather than throwing after it.
     *
     * Cheap and reference-based, never a fold. Because a move swaps **adjacent**
     * rows, only the pair matters: the illegal case is the later row referencing
     * the earlier one, which after the swap would put a step above the step
     * whose result it uses. Anything subtler is left to the replay, which
     * section 17 keeps as the final arbiter.
     */
    canMove(id, delta) {
      const index = indexOfRecord(id)
      if (index < 0) return { allowed: false, reason: `no step "${id}" in this document` }
      if (delta !== 1 && delta !== -1) {
        return { allowed: false, reason: 'a step moves one position at a time' }
      }
      const target = index + delta
      if (target < 0) return { allowed: false, reason: 'this is already the first step' }
      if (target >= entries.length) {
        return { allowed: false, reason: 'this is already the last step' }
      }
      if (rollbackAt !== null && index < rollbackAt !== target < rollbackAt) {
        return { allowed: false, reason: 'Roll forward to move a step past the rollback point' }
      }
      const earlier = delta === 1 ? index : target
      const later = delta === 1 ? target : index
      const earlierId = entries[earlier].record.id
      if (earlierId !== undefined && referencedIdsOf(entries[later].record).includes(earlierId)) {
        return {
          allowed: false,
          reason: `Step ${later + 1} uses step ${earlier + 1}'s result`,
        }
      }
      return { allowed: true, reason: null }
    },

    /**
     * Section 17: move one step one position, and replay.
     *
     * Refuses an illegal move through {@link WarpDocument.canMove} before
     * touching anything, and any move the replay then rejects is refused
     * atomically by {@link rebuildFrom} — "order unchanged".
     */
    moveStep(id, delta, transaction) {
      const verdict = document.canMove(id, delta)
      if (!verdict.allowed) throw new Error(`document.moveStep: ${verdict.reason}`)

      const index = indexOfRecord(id)
      const target = index + delta
      const rollbackBefore = rollbackAt
      const next = entries.slice()
      ;[next[index], next[target]] = [next[target], next[index]]
      const prior = rebuildFrom(next)
      pushRevision(
        transaction,
        `Move step ${index + 1} ${delta < 0 ? 'up' : 'down'}`,
        { kind: 'reorder', id, delta },
        rollbackBefore,
        prior
      )
      return { scene }
    },

    /**
     * Section 18: set the rollback marker just after a step, so the rows past it
     * stop being evaluated.
     *
     * Nothing is deleted and nothing is blocked — `appendAll` keeps working and
     * inserts at the marker. Refused on the last row (there would be no tail) and
     * on an already-inactive row ("an inactive row cannot be a rollback target").
     */
    rollBackTo(id, transaction) {
      const index = indexOfRecord(id)
      if (index < 0) throw new Error(`document.rollBackTo: no step "${id}" in this document`)
      if (index >= entries.length - 1) {
        throw new Error(
          `document.rollBackTo: "${id}" is the last step, so there is nothing after it to ` +
            'roll back past'
        )
      }
      if (rollbackAt !== null && index >= rollbackAt) {
        throw new Error(
          `document.rollBackTo: "${id}" is already inactive — roll forward first, since an ` +
            'inactive row cannot be a rollback target'
        )
      }
      const rollbackBefore = rollbackAt
      const prior = rebuildFrom(entries.slice(), index + 1)
      pushRevision(
        transaction,
        `Roll back to step ${index + 1}`,
        { kind: 'rollback' },
        rollbackBefore,
        prior
      )
      return { scene }
    },

    /**
     * Section 18: clear the marker and replay the whole log in its new order —
     * active rows, inserted rows, then the formerly-inactive ones.
     *
     * Atomic, "with the same contract as an edit": a tail row that can no longer
     * be built throws a {@link ReplayRejection} naming it, the marker stays, and
     * nothing changes. `ui-032` prefixes that message with `Can't roll forward:`;
     * the row and the reason are already on the error's `step`.
     */
    rollForward(transaction) {
      if (rollbackAt === null) return { scene }
      const rollbackBefore = rollbackAt
      const prior = rebuildFrom(entries.slice(), null)
      pushRevision(transaction, 'Roll forward', { kind: 'rollback' }, rollbackBefore, prior)
      return { scene }
    },

    /**
     * Every record in `id`'s lineage, **root first, current terminal last**.
     *
     * Read-only, and deliberately op-agnostic: it reports what a lineage is made
     * of and passes no judgement on it. `TODO/ui-029` is the first caller — it
     * has to know whether anything other than a `transform.*` sits between a
     * body's creation record and its terminal before it offers to rebuild that
     * creation record from edited params, because rebuilding would silently
     * discard whatever else is in there (a fillet's rounded rim, say). That
     * policy lives in `src/core/paramEdit.js`, not here; this module only knows
     * about lineages, never about what any particular op means.
     *
     * Walked *backwards* along `supersedes` from the terminal and then reversed,
     * since the indexes this module keeps point that way. Answers the same for
     * any id in the lineage, not just its root, and is cycle-guarded: a
     * malformed document must give a short answer, not hang the caller.
     *
     * @param {string} id Any record id in the lineage — root, terminal, or
     *   anything in between.
     * @returns {OpRecord[]} Empty when this document has no such record.
     */
    lineageOf(id) {
      const root = rootById.get(id)
      if (root === undefined) return []
      /** @type {OpRecord[]} */
      const chain = []
      const visited = new Set()
      let cursor = terminalByRoot.get(root) ?? root
      for (;;) {
        if (visited.has(cursor)) break
        visited.add(cursor)
        const record = recordById.get(cursor)
        if (record === undefined) break
        chain.push(record)
        if (record.supersedes === undefined) break
        cursor = record.supersedes
      }
      return chain.reverse()
    },

    assets() {
      // Folded ones only, in log order: a suppressed or rolled-back photo is out of play
      // the same way a suppressed body is. A handful of entries; no index is needed.
      /** @type {Map<string, OpRecord>} */
      const found = new Map()
      for (const { record } of entries) {
        if (record.op !== ASSET_OP || record.id === undefined) continue
        if (recordById.get(record.id) === record) found.set(record.id, record)
      }
      return found
    },

    meshAssets() {
      // `TODO/io-009`: the same rule as `assets()`, for top-level imported meshes.
      /** @type {Map<string, OpRecord>} */
      const found = new Map()
      for (const { record } of entries) {
        if (record.op !== MESH_ASSET_OP || record.id === undefined) continue
        if (recordById.get(record.id) === record) found.set(record.id, record)
      }
      return found
    },

    bodies() {
      /** @type {Body[]} */
      const bodies = []
      // Walk lineage roots, not records: one entry per logical body, in the
      // order the bodies were *created*, so moving one does not shuffle it to
      // the end of the Inspector's or the scene list's ordering.
      for (const rootId of rootOrder) {
        // Absorbed into a later record (`consumes`): the two solids a boolean
        // ate stop being independently selectable bodies. This one line is the
        // whole of that behaviour on the read side.
        if (mergedInto.has(rootId)) continue
        // Deleted (`TODO/ui-051`): the lineage ends in a tombstone. Same one-line
        // shape as the consumption skip above.
        if (isDeletedRoot(rootId)) continue
        const terminalId = terminalByRoot.get(rootId) ?? rootId
        const geometry = scene.byId.get(terminalId)
        if (geometry === undefined) continue
        const rootRecord = recordById.get(rootId)
        if (rootRecord === undefined) continue
        const terminalRecord = recordById.get(terminalId) ?? rootRecord
        const carried = terminalRecord.params?.rotation ?? rootRecord.params?.rotation
        // Not always the root's params, since `TODO/ui-029`: editing a body's own
        // diameter appends a *fresh creation record* over the lineage's terminal,
        // and that record's params are what the body now is. A `transform.*` in
        // between is still skipped — a translate's `vector` is not a dimension of
        // the part, which is the reason this field was pinned to the root in the
        // first place. `paramEdit.js` owns that rule and builds the next edit from
        // the same record, so the panel and the next mutation cannot disagree.
        const lineage = document.lineageOf(rootId)
        const paramsRecord = currentParamsRecordOf(lineage) ?? rootRecord
        const colorOverrides = colorOverridesOf(lineage, (op) => userParts.get(op) ?? effectiveUserPart(op))
        bodies.push({
          id: rootId,
          recordId: terminalId,
          // `TODO/core-038`: a `style.rename` in the lineage overrides the root's own name.
          name: nameOverrideOf(lineage) ?? rootRecord.name ?? rootId,
          op: rootRecord.op,
          params: paramsRecord.params ?? {},
          rotationDeg: isVec3(carried) ? [carried[0], carried[1], carried[2]] : [0, 0, 0],
          ...(colorOverrides !== undefined ? { colorOverrides } : {}),
          geometry,
        })
      }
      return bodies
    },

    /**
     * `TODO/data-010`: this replica's merge state, for another replica's
     * {@link WarpDocument.mergeFrom} (and, in `data-011`, the file's state line).
     *
     * A row's `leftBroken` here is only the flag someone **wrote**. The flag a merge sets on a
     * conflicted row is derived by every fold of the merged log (see the module note), so it
     * never travels as a stamped write.
     *
     * @returns {import('./merge/state.js').MergeState}
     */
    mergeState() {
      /** @type {Map<string, import('./merge/state.js').MergeEntry>} */
      const rows = new Map()
      for (const entry of entries) {
        const id = entry.record.id
        const meta = id === undefined ? undefined : metaById.get(id)
        if (id === undefined || meta === undefined) continue
        rows.set(id, {
          record: entry.record,
          origin: entry.origin,
          ...(entry.intent !== undefined ? { intent: entry.intent } : {}),
          born: meta.born,
          pos: meta.pos,
          rec: meta.rec,
          ...(meta.suppressed !== undefined ? { suppressed: meta.suppressed } : {}),
          ...(meta.leftBroken !== undefined ? { leftBroken: meta.leftBroken } : {}),
        })
      }
      return {
        projectId,
        entries: rows,
        dead: new Map(dead),
        registers: { ...registers },
        parts: new Map([...userParts].map(([op, definition]) => [op, [definition, partStamps.get(op) ?? LEGACY_STAMP]])),
      }
    },

    /**
     * `TODO/data-010`: merge another replica's state into this one and re-fold.
     *
     * Refuses a copy of a different project ({@link UnrelatedProjectError}), and a log with a
     * row that has no id (a merge addresses rows by id). Otherwise it computes
     * `mergeStates(own, theirs)` and re-folds through the one {@link rebuildFrom} with
     * `tolerateAll`, so a row that no longer builds is **flagged, never re-parented**
     * (`docs-022`): it folds as identity exactly as a left-broken row does (`ui-052`), its
     * reason is `conflicts with step N (…)` or `needs <name>`, and it comes back in
     * `conflicts`. Never touches either undo stack; bumps the state token, so a restore
     * recorded before the merge is never used after it.
     *
     * Atomic: a throw anywhere puts back every field it had changed and rethrows.
     */
    mergeFrom(theirs, transaction) {
      const origin = transaction?.origin
      if (typeof origin !== 'string' || origin.length === 0) {
        throw new Error(
          'document.mergeFrom: a transaction origin is required — ' +
            "every mutation is origin-tagged so undo/redo can be scoped to the local user's own edits"
        )
      }
      if (stampDepth > 0) throw new Error('document.mergeFrom: a merge cannot run inside another transaction')
      if (entries.some((entry) => entry.record.id === undefined)) {
        throw new Error('document.mergeFrom: this document has a row without an id, which a merge cannot address')
      }
      const own = document.mergeState()
      if (relatedness(own, theirs) === 'unrelated') throw new UnrelatedProjectError()
      const merged = mergeStates(own, theirs)
      const nextResolution = /** @type {string} */ (merged.registers.resolution?.[0] ?? 'legacy')
      if (!isResolution(nextResolution)) {
        throw new Error(`document.mergeFrom: unknown resolution "${String(nextResolution)}"`)
      }

      const snapshot = captureState()
      const previous = {
        userParts,
        standingInstructions,
        buildVolume,
        layer: publishesUserParts ? projectPartsSnapshot() : null,
        projectId,
        mintable,
      }
      try {
        /** @type {Map<string, import('./userPart.js').UserPartDefinition>} */
        const nextParts = new Map()
        /** @type {Map<string, import('./replica.js').Stamp>} */
        const nextPartStamps = new Map()
        /** @type {import('./userPart.js').UserPartDefinition[]} */
        const arriving = []
        for (const [op, [definition, stamp]] of merged.parts) {
          const part = /** @type {import('./userPart.js').UserPartDefinition} */ (definition)
          nextParts.set(op, part)
          nextPartStamps.set(op, stamp)
          if (userParts.get(op) !== part) arriving.push(part)
        }
        userParts = nextParts
        if (arriving.length > 0) ensureProjectParts(arriving)

        const order = liveOrder(merged)
        /** @type {Map<string, EntryMeta>} */
        const nextMeta = new Map()
        /** @type {DocumentEntry[]} */
        const nextEntries = order.map((id) => {
          const row = /** @type {import('./merge/state.js').MergeEntry} */ (merged.entries.get(id))
          nextMeta.set(id, {
            born: row.born,
            pos: row.pos,
            rec: row.rec,
            ...(row.suppressed !== undefined ? { suppressed: row.suppressed } : {}),
            ...(row.leftBroken !== undefined ? { leftBroken: row.leftBroken } : {}),
          })
          return {
            record: /** @type {OpRecord} */ (row.record),
            origin: row.origin,
            ...(row.suppressed?.[0] === true ? { suppressed: true } : {}),
            ...(row.leftBroken?.[0] === true ? { leftBroken: true } : {}),
            ...withIntent(row.intent),
          }
        })
        const marker = resolveRollback(merged)
        /** @type {number | null} */
        let nextRollback = null
        if (marker !== null) {
          const at = marker.after === null ? 0 : order.indexOf(marker.after) + 1
          nextRollback = at >= order.length ? null : at
        }

        metaById = nextMeta
        dead = merged.dead
        registers = merged.registers
        partStamps = nextPartStamps
        projectId = merged.projectId
        rebuildFrom(nextEntries, nextRollback, nextResolution, { tolerateAll: true, flagTolerated: true })

        // Flag what the fold had to tolerate. Derived, not written: the same merged log folds
        // to the same set on every replica in every merge order, and a written flag would
        // not (a later merge can repair a row an earlier one broke) — see the module note.
        const byId = recordMapOf(entries)
        /** @type {MergeConflict[]} */
        const conflicts = []
        entries.forEach((entry, index) => {
          const id = /** @type {string} */ (entry.record.id)
          if (!lastTolerated.has(id)) return
          if (entry.leftBroken !== true) entries[index] = withLeftBroken(entry, true)
          conflicts.push({
            id,
            step: index + 1,
            label: labelFor([entry.record], byId),
            reason: brokenById.get(id) ?? '',
            lostTo: lastTolerated.get(id) ?? null,
          })
        })

        standingInstructions = cleanText(merged.registers.standingInstructions?.[0] ?? '', INSTRUCTIONS_MAX_LENGTH)
        const volume = merged.registers.buildVolume?.[0]
        buildVolume = volume === undefined || volume === null ? { ...DEFAULT_BUILD_VOLUME } : normalizeBuildVolume(/** @type {any} */ (volume))
        stampClock.observe(highestCounter(merged))
        // `TODO/data-013`: rows that came in without an id are legacy content, so this document
        // stays without one too (see `mintable`); with nothing in it, it still may mint.
        if (projectId === null && (merged.entries.size > 0 || merged.dead.size > 0)) mintable = false
        mergeEpoch += 1
        document.version += 1
        return { scene, change: diffStates(own, document.mergeState()), conflicts }
      } catch (error) {
        restoreState(snapshot)
        projectId = previous.projectId
        mintable = previous.mintable
        userParts = previous.userParts
        standingInstructions = previous.standingInstructions
        buildVolume = previous.buildVolume
        if (previous.layer !== null) restoreProjectParts(previous.layer)
        throw error
      }
    },

    mergeClock() {
      return Math.max(stampClock.now(), highestCounter(document.mergeState()))
    },

    observeMergeClock(counter) {
      // `TODO/ai-017`: the AI's fork reads the live document's clock before each tool call, so a
      // write the user made earlier in the turn always sorts first in the merge (and wins a
      // same-gap order or a register by being earlier, not by replica id).
      if (!Number.isSafeInteger(counter) || counter < 0) {
        throw new Error(`document.observeMergeClock: ${String(counter)} is not a clock counter`)
      }
      stampClock.observe(counter)
    },

    ensureProjectId() {
      // `TODO/data-013`: an AI turn forks the live document before either has written. Minting
      // here first means the fork copies this id instead of minting its own, so a turn and the
      // user's edits during it land as one project. Metadata only: no row, no version bump.
      if (projectId === null && mintable) projectId = mintProjectId()
      return projectId
    },

    replicaId() {
      return clock.replica
    },

    nextId(prefix = 'op') {
      // `prefix-replica-counter` (`TODO/data-008`): a Lamport counter scoped by this
      // document's replica id, not a random uuid, so two writers never mint the same id
      // and a readable id still makes an NDJSON document diffable by a human and by the AI
      // partner (docs/decisions/document-sync.md — no CRDT library).
      // Checked against `entries`, not only `originById`: a suppressed or
      // rolled-back row is in the log and not in the derived indexes, and
      // handing its id out again would make it collide the moment the row is
      // unsuppressed or rolled forward (`data-004`).
      let candidate
      do {
        candidate = `${prefix}-${clock.replica}-${clock.tick()}`
      } while (originById.has(candidate) || indexOfRecord(candidate) >= 0)
      return candidate
    },

    nextName(label) {
      // `TODO/core-038`: deliberately blind to `style.rename`. It numbers the *root* records'
      // generated names, so a rename neither frees a number nor claims one (a rename's name
      // lives in `params`, never `record.name`).
      const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`)
      let highest = 0
      for (const { record } of entries) {
        const match = record.name === undefined ? null : pattern.exec(record.name)
        if (match) highest = Math.max(highest, Number(match[1]))
      }
      return `${label} ${highest + 1}`
    },
  }

  // `TODO/data-010`: every mutator is one stamped transaction. Wrapped here, once, so the
  // list is `STAMPED_MUTATORS` and nowhere else; an inner call (`append` → `appendAll` →
  // `insertAt`) joins its caller's transaction.
  const wrapped = /** @type {Record<string, (...args: any[]) => any>} */ (/** @type {unknown} */ (document))
  for (const name of STAMPED_MUTATORS) {
    const inner = wrapped[name]
    wrapped[name] = (...args) => {
      /** @type {Set<string>} */
      let hint = new Set()
      if (name === 'moveStep') hint = new Set([args[0]])
      else if (name === 'undo') hint = reorderHintOf(undoStack.at(-1))
      else if (name === 'redo') hint = reorderHintOf(redoStack.at(-1))
      return stamped(() => inner(...args), hint)
    }
  }

  for (const action of options.actions ?? []) {
    document.append(action, { origin: options.origin ?? 'local' })
  }
  seeding = false
  deriveLegacy()
  document.version = 0
  keepRestorable = restorableSteps
  // Loading a document is not a stack of things to undo back out of, even though
  // the seed loop goes through the same origin-tagged command layer everything
  // else does — section 19: "the undo/redo stacks start empty after a reload and
  // after Open / Load-from-repo".
  document.clearHistory()

  return document
}

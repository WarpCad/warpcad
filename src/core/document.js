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
 * and chip that exact row, rather than parsing a string. Two reason shapes,
 * deliberately only two:
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
import { applyAction, emptyScene } from './replay.js'
import {
  effectiveUserPart,
  ensureProjectParts,
  isUserPartOp,
  projectPartsSnapshot,
  requiredUserParts,
  restoreProjectParts,
  setProjectParts,
} from './userPart.js'
import { ASSET_OP, validateImageAsset } from '../sketch/imageAsset.js'

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
 * @property {string} reason Either `needs <body name>` or
 *   `can't be built: <why>`. See the module note for why only those two.
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
 * @property {InactiveBy | null} inactiveBy `TODO/ui-052`: the condition that is currently
 *   keeping this row out of the fold, or `null`. Not the same as `suppressed` (the user
 *   switched it off) or `active: false` (past the rollback marker).
 * @property {RowCondition | null} condition The condition this row carries or inherits
 *   from its body's creation record, whether or not it is currently true — so the chip
 *   stays visible on a Pi 4 as well as a Pi 5.
 */

/**
 * @typedef {object} InactiveBy
 * @property {string} refId The body the condition reads.
 * @property {string} param
 * @property {any[]} values
 */

/**
 * @typedef {object} RowCondition
 * @property {string} refId
 * @property {string} param
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
 * @property {LogRevision} [revision] Set instead of `records` for a `data-004`
 *   row action, which revises an entry rather than adding one. Undo applies the
 *   inverse; redo applies it again.
 * @property {number | null} [rollbackBefore] The marker before the step, so undo
 *   puts it back — section 18: "Undo removes the inserted row and moves the
 *   marker back".
 * @property {number | null} [rollbackAfter] The marker after it, for redo.
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
 */

/**
 * @typedef {object} LoadOptions
 * @property {boolean} [tolerateAll]
 * @property {string} [standingInstructions]
 * @property {import('./buildVolume.js').BuildVolume} [buildVolume]
 * @property {readonly import('./userPart.js').UserPartDefinition[]} [userParts] `TODO/core-037`.
 * @property {Readonly<Record<string, string>>} [unavailableParts] `TODO/core-037`: op → why.
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
 * @property {(id: string, suppressed: boolean, transaction: TransactionOptions) => { scene: Scene }} setSuppressed
 * @property {(changes: readonly RecordRevision[], transaction: TransactionOptions, options?: { append?: readonly OpRecord[] }) => { scene: Scene }} reviseRecords
 * @property {() => Map<string, OpRecord>} assets Every folded `asset.image` record, by id
 *   (`TODO/sketch-003`) — the reference photos sketch slices name. Never bodies.
 * @property {() => InactiveBody[]} inactiveBodies
 * @property {(id: string) => RowCondition | null} conditionOf
 * @property {(id: string, override: { color: number, colorAlpha?: number, subPart?: string }, transaction: TransactionOptions) => { record: OpRecord, scene: Scene }} setColorOverride
 * @property {(id: string, target: { subPart?: string }, transaction: TransactionOptions) => { record: OpRecord, scene: Scene }} clearColorOverride
 * @property {(ids: readonly string[], transaction: TransactionOptions) => { records: OpRecord[], scene: Scene }} deleteBodies
 * @property {(id: string, partName: string, transaction: TransactionOptions) => { record: OpRecord, scene: Scene }} removePart
 * @property {(id: string, delta: number) => MoveLegality} canMove
 * @property {(id: string, delta: number, transaction: TransactionOptions) => { scene: Scene }} moveStep
 * @property {(index: number, records: readonly OpRecord[], transaction: TransactionOptions) => { records: OpRecord[], scene: Scene }} insertAt
 * @property {(ids: readonly string[], transaction: TransactionOptions) => { scene: Scene }} removeRecords `TODO/ai-006`: take a set of records back out atomically (Undo AI turn).
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
 * @property {(prefix?: string) => string} nextId
 * @property {(label: string) => string} nextName
 */

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
 * @param {readonly OpRecord[]} lineage Root-first, as `lineageOf` returns.
 * @returns {ColorOverride[] | undefined}
 */
function colorOverridesOf(lineage) {
  /** @type {Map<string | undefined, ColorOverride>} */
  const bySubPart = new Map()
  for (const record of lineage) {
    if (record.op !== RECOLOR_OP || record.colorOverride === undefined) continue
    // `null` is a **reset** (`TODO/ui-037`'s `clearColorOverride`): it removes only
    // its own key, so clearing one part's colour leaves the whole-body one — and
    // every other part's — exactly as they were.
    if (record.colorOverride === null) {
      bySubPart.delete(record.subPart)
      continue
    }
    bySubPart.set(record.subPart, {
      color: record.colorOverride,
      ...(record.colorAlpha !== undefined ? { colorAlpha: record.colorAlpha } : {}),
      ...(record.subPart !== undefined ? { subPart: record.subPart } : {}),
    })
  }
  return bySubPart.size === 0 ? undefined : [...bySubPart.values()]
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
  let scene = emptyScene()
  let idCounter = 0
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
   * Whether a lineage has been deleted — its terminal is a tombstone (`TODO/ui-051`).
   *
   * @param {string} root
   * @returns {boolean}
   */
  function isDeletedRoot(root) {
    return recordById.get(terminalByRoot.get(root) ?? root)?.op === DELETE_OP
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
    const name = recordById.get(root)?.name ?? root
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
   */
  function ingest(record, origin, passThrough = false) {
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
      candidate = applyAction(scene, record, ops, foldCache, policyFor(resolution))
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
    scene = emptyScene()
    if (!snapshot) return
    for (const [key, value] of snapshot.originById) originById.set(key, value)
    for (const [key, value] of snapshot.rootById) rootById.set(key, value)
    for (const [key, value] of snapshot.terminalByRoot) terminalByRoot.set(key, value)
    rootOrder.push(...snapshot.rootOrder)
    for (const [key, value] of snapshot.mergedInto) mergedInto.set(key, value)
    for (const [key, value] of snapshot.recordById) recordById.set(key, value)
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
   */
  function ingestRow(entry, index, byId) {
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
      ingest(record, entry.origin)
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
   * @returns {Map<string, string>} Row id → reason.
   */
  function shadowCheckTail(nextEntries, activeCount, byId) {
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
      scratch.loadEntries(nextEntries.slice(0, activeCount).map(foldableEntry), null, resolution)
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
   * the proven fold beats a speed win with no measured need. `idCounter` is
   * **not** reset, so an id can never be handed out twice across an undo.
   *
   * @param {DocumentEntry[]} nextEntries
   * @param {number | null} [nextRollbackAt] Active-entry count; defaults to the
   *   current marker, so an operation that does not move it need not say so.
   * @param {string} [nextResolution] The design resolution to fold at
   *   (`TODO/core-035`); defaults to the current one. Put back with everything else if
   *   the fold is refused.
   * @param {{ tolerateAll?: boolean }} [options] `tolerateAll`: see {@link foldActive}.
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
    /** @type {{ broken: Map<string, string>, inactive: Map<string, InactiveBy> }} */
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
    brokenById = new Map([...outcome.broken, ...shadowCheckTail(nextEntries, activeCount, byId)])
    inactiveById = outcome.inactive
    bumpState()
    return prior
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
   * @returns {{ broken: Map<string, string>, inactive: Map<string, InactiveBy> }}
   */
  function foldActive(nextEntries, activeCount, byId, tolerateAll) {
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
    const context = nextEntries.some((entry) => entry.record.when !== undefined)
      ? conditionContextOf(nextEntries, activeCount)
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
            inactive.set(key, { refId: when.ref, param: when.param, values: [...when.in] })
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
        passThroughOrSkip(entry, key)
        continue
      }

      // 4. An ordinary row — refused atomically unless the user left it broken.
      try {
        ingestRow(entry, index, byId)
      } catch (error) {
        if (!(error instanceof ReplayRejection) || !(tolerateAll || entry.leftBroken === true)) throw error
        broken.set(key, error.step.reason)
        passThroughOrSkip(entry, key)
      }
    }
    return { broken, inactive }
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
    let subjectName = rootId === undefined ? undefined : recordById.get(rootId)?.name
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
    const context = conditionContextOf(entries, activeCount)
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
        refId: when.ref,
        param: when.param,
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
      if (records.some((record) => record.when !== undefined) || entries.some((entry) => entry.record.when !== undefined)) {
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

      // The steps `build` pushed, oldest first. Only local record steps are
      // merged: a row action (`revision`) inside a batch has no records to
      // concatenate, and is left as its own step rather than guessed at.
      const pushed = undoStack.slice(undoBefore.length)
      const mergeable = pushed.length > 1 && pushed.every((step) => step.revision === undefined)
      if (options.label !== undefined && pushed.length === 1) pushed[0].label = options.label
      if (!mergeable) return result

      const [first] = pushed
      /** @type {HistoryStep} */
      const merged = {
        ...first,
        label: options.label ?? first.label,
        // Contiguous in the log: appended at the tail, or inserted one after
        // another at a marker that advances with each insert.
        records: pushed.flatMap((step) => step.records),
        rollbackAfter: /** @type {HistoryStep} */ (pushed.at(-1)).rollbackAfter,
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
      next.splice(at, 0, ...records.map((record) => ({ record, origin, ...intentFor(transaction, record) })))
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
        const after = captureState()
        restoreState(before)
        undoStack.pop()
        /** @type {HistoryStep} */
        const redoStep =
          step.revision !== undefined
            ? step
            : { ...step, index: after.entries.findIndex((entry) => entry.record === step.records[0]) }
        redoStack.push(redoStep)
        keepRestore(redoStack, redoStep, after)
        document.version += 1
        return step
      }

      // A `data-004` row action added no record, so there is nothing to take
      // out and nothing to orphan — it is reversed by applying its inverse.
      if (step.revision !== undefined) {
        const after = applyRevision(invertRevision(step.revision), step.rollbackBefore ?? null)
        undoStack.pop()
        redoStack.push(step)
        keepRestore(redoStack, step, after)
        document.version += 1
        return step
      }

      const stepRecords = new Set(step.records)
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

      const index = entries.findIndex((entry) => entry.record === step.records[0])
      const after = rebuildFrom(
        entries.filter((entry) => !stepRecords.has(entry.record)),
        step.rollbackBefore ?? null
      )
      undoStack.pop()
      const redoStep = { ...step, index }
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

      if (step.revision !== undefined) {
        const before = applyRevision(step.revision, step.rollbackAfter ?? null)
        redoStack.pop()
        undoStack.push(step)
        keepRestore(undoStack, step, before)
        document.version += 1
        return step
      }
      const next = entries.slice()
      next.splice(
        step.index ?? next.length,
        0,
        ...step.records.map((record) => ({ record, origin: step.origin }))
      )
      const before = rebuildFrom(next, step.rollbackAfter ?? null)
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
     * `idCounter` is not reset (see {@link rebuildFrom}); `nextId` already skips
     * ids present in `entries`, so ids in the loaded log are never handed out.
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
      for (const field of SHAPE_FIELDS) {
        const key = /** @type {keyof OpRecord} */ (field)
        if (JSON.stringify(record[key] ?? null) === JSON.stringify(current[key] ?? null)) continue
        throw new Error(
          `document.replaceRecord: the replacement for "${id}" changes \`${field}\` — ` +
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
        `Edit step ${index + 1}`,
        { kind: 'replace', id, from: current, to: record },
        rollbackBefore,
        prior
      )
      return { scene }
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
     */
    reviseRecords(changes, transaction, options = {}) {
      if (!Array.isArray(changes) || changes.length === 0) {
        throw new Error('document.reviseRecords: at least one revision is required')
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
      // `TODO/sketch-003`: records that arrive *with* the revision — the photo an Edit
      // sketch session added — go into the log in the same step, at the rollback marker
      // (the end of the active part), so a rolled-back document still folds them.
      const appended = [...(options.append ?? [])]
      const changed = items.some(
        (item) =>
          JSON.stringify(item.from) !== JSON.stringify(item.to) || item.fromLeftBroken !== item.toLeftBroken
      )
      if (!changed && appended.length === 0) return { scene }

      const rollbackBefore = rollbackAt
      const addAt = rollbackAt ?? next.length
      if (appended.length > 0) {
        next.splice(addAt, 0, ...appended.map((record) => ({ record, origin: transaction?.origin ?? 'local' })))
      }
      const prior = rebuildFrom(next, rollbackAt === null ? null : rollbackAt + appended.length)
      pushRevision(
        transaction,
        items.length === 1 ? `Edit step ${indexOfRecord(items[0].id) + 1}` : `Edit ${items.length} steps`,
        { kind: 'revise', items, ...(appended.length > 0 ? { add: { at: addAt, records: appended } } : {}) },
        rollbackBefore,
        prior
      )
      return { scene }
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
        const name = recordById.get(root)?.name ?? root
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
        throw new Error(`document.removePart: ${recordById.get(root)?.name ?? root} has been deleted`)
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
        const colorOverrides = colorOverridesOf(lineage)
        bodies.push({
          id: rootId,
          recordId: terminalId,
          name: rootRecord.name ?? rootId,
          op: rootRecord.op,
          params: paramsRecord.params ?? {},
          rotationDeg: isVec3(carried) ? [carried[0], carried[1], carried[2]] : [0, 0, 0],
          ...(colorOverrides !== undefined ? { colorOverrides } : {}),
          geometry,
        })
      }
      return bodies
    },

    nextId(prefix = 'op') {
      // A monotonic per-document counter, not a random uuid: this is a
      // single-writer append log (docs/decisions/document-sync.md — no CRDT for
      // v1), so a counter is unique, and a readable id makes an NDJSON document
      // diffable by a human and by the AI partner.
      // Checked against `entries`, not only `originById`: a suppressed or
      // rolled-back row is in the log and not in the derived indexes, and
      // handing its id out again would make it collide the moment the row is
      // unsuppressed or rolled forward (`data-004`).
      let candidate
      do {
        idCounter += 1
        candidate = `${prefix}-${idCounter}`
      } while (originById.has(candidate) || indexOfRecord(candidate) >= 0)
      return candidate
    },

    nextName(label) {
      const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`)
      let highest = 0
      for (const { record } of entries) {
        const match = record.name === undefined ? null : pattern.exec(record.name)
        if (match) highest = Math.max(highest, Number(match[1]))
      }
      return `${label} ${highest + 1}`
    },
  }

  for (const action of options.actions ?? []) {
    document.append(action, { origin: options.origin ?? 'local' })
  }
  document.version = 0
  keepRestorable = restorableSteps
  // Loading a document is not a stack of things to undo back out of, even though
  // the seed loop goes through the same origin-tagged command layer everything
  // else does — section 19: "the undo/redo stacks start empty after a reload and
  // after Open / Load-from-repo".
  document.clearHistory()

  return document
}

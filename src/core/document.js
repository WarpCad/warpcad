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
 * ## Sketch records: in the log, past the kernel (`TODO/ui-020`)
 *
 * A sketch entity — today a straight line on the working plane — is 2D vector
 * data, not a `Geom3` or a `Group`. It still belongs in *this* log: it is a
 * document mutation, it needs an origin, and a future undo/redo has to be able
 * to scope it exactly like any other record. What it does **not** belong in is
 * the geometry kernel. So `append` recognises a `sketch.`-prefixed op and routes
 * it to a parallel {@link WarpDocument.sketchEntities} map, skipping the trial
 * fold entirely.
 *
 * The alternative — registering `sketch.line` in the kernel registry — would
 * mean either inventing a third `RegistryEntry.kind` that `evaluate()` has to
 * branch on, or teaching the kernel adapter about records that produce no
 * geometry. Both cross the `src/core/kernel/` boundary CLAUDE.md's Project
 * Structure draws on purpose ("everything else in `core/` talks to the kernel
 * through this interface"). Skipping the round-trip keeps the boundary intact,
 * and `document.spec.js` asserts it as a **call count** on a registry entry that
 * deliberately exists — "never built" is only evidence if building would have
 * worked.
 *
 * Everything else about a sketch record is ordinary: same id rules, same origin
 * requirement, same `supersedes` lineage bookkeeping (so an endpoint edit
 * replaces an entity in place rather than doubling it — the same defect
 * supersession already prevents for a moved body). `consumes` is refused: it
 * retires bodies into a new one, and a sketch line is not a body and eats
 * nothing.
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
 * What still re-folds, and is `TODO/core-031` (moving that fold into the
 * evaluation worker): the row actions themselves, Open/restore, and the fallback
 * cases above.
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
 * "measure before optimising". Measured, worst case (editing the **first** row,
 * so everything re-folds), against the real kernel:
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
import { currentParamsRecordOf } from './paramEdit.js'
import { applyAction, emptyScene } from './replay.js'

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
 * @property {string} label Shallow label — `Place Cube 1`, `Chamfer Cube 1`.
 * @property {boolean} suppressed Section 16: greyed, struck through, chipped.
 * @property {boolean} active `false` for a row past the rollback marker —
 *   dimmed, chipped `inactive`, and simply not evaluated (section 18).
 * @property {string | null} broken The shadow check's reason, or `null`.
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
 * @property {'replace' | 'suppress' | 'reorder' | 'rollback'} kind
 * @property {string} [id] The row acted on.
 * @property {OpRecord} [from] `replace`: the record as it was.
 * @property {OpRecord} [to] `replace`: the record it became.
 * @property {boolean} [fromSuppressed]
 * @property {boolean} [toSuppressed]
 * @property {number} [delta] `reorder`: `-1` up, `+1` down.
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
 * @property {Geom3 | Group} geometry Derived, disposable — never persisted.
 */

/**
 * @typedef {object} SketchEntityRecord
 * @property {string} id The **lineage root's** id — stable across endpoint edits,
 *   so a selection and an overlay element keep pointing at the same entity.
 * @property {string} recordId The **terminal** record's id.
 * @property {string} name Display name, e.g. `"Line 1"`. From the root record.
 * @property {string} op The `sketch.*` op, from the root record.
 * @property {Record<string, any>} params The **terminal** record's params, plain
 *   JSON. Note this differs from `Body.params`, which come from the *root*: a
 *   body's params say what it *is* and a transform record carries the movement
 *   separately, whereas a sketch endpoint edit rewrites the entity's own
 *   coordinates, so the newest record is the entity's current geometry.
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
 */

/**
 * @typedef {object} WarpDocument
 * @property {readonly DocumentEntry[]} entries
 * @property {readonly OpRecord[]} records
 * @property {Scene} scene Current derived scene.
 * @property {number} version Bumps on every successful append, undo and redo.
 * @property {(record: OpRecord, transaction: TransactionOptions) => { record: OpRecord, scene: Scene }} append
 * @property {(records: readonly OpRecord[], transaction: TransactionOptions) => { records: OpRecord[], scene: Scene }} appendAll
 * @property {<T>(build: (document: WarpDocument) => T, options?: { label?: string }) => T} batch
 * @property {(id: string) => string | undefined} originOf
 * @property {(id: string) => string | undefined} currentIdOf
 * @property {(id: string) => string | undefined} rootOf
 * @property {(id: string) => OpRecord[]} lineageOf
 * @property {(id: string) => OpRecord | undefined} recordOf
 * @property {() => TimelineRow[]} timeline
 * @property {() => BrokenStep[]} brokenSteps
 * @property {() => number | null} rollbackAt
 * @property {(id: string, record: OpRecord, transaction: TransactionOptions) => { scene: Scene }} replaceRecord
 * @property {(id: string, suppressed: boolean, transaction: TransactionOptions) => { scene: Scene }} setSuppressed
 * @property {(id: string, delta: number) => MoveLegality} canMove
 * @property {(id: string, delta: number, transaction: TransactionOptions) => { scene: Scene }} moveStep
 * @property {(index: number, records: readonly OpRecord[], transaction: TransactionOptions) => { records: OpRecord[], scene: Scene }} insertAt
 * @property {(id: string, transaction: TransactionOptions) => { scene: Scene }} rollBackTo
 * @property {(transaction: TransactionOptions) => { scene: Scene }} rollForward
 * @property {() => Body[]} bodies
 * @property {() => SketchEntityRecord[]} sketchEntities
 * @property {() => boolean} canUndo
 * @property {() => boolean} canRedo
 * @property {() => HistoryStep | undefined} pendingUndo
 * @property {() => HistoryStep | undefined} pendingRedo
 * @property {() => HistoryStep | undefined} undo
 * @property {() => HistoryStep | undefined} redo
 * @property {() => void} clearHistory
 * @property {(entries: readonly DocumentEntry[], rollbackAt?: number | null) => void} loadEntries
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
 * Ops routed past the kernel into {@link WarpDocument.sketchEntities} — see the
 * sketch-records note above. A **prefix**, not a fixed list, so the later
 * rectangle/circle/arc tools need no change here.
 */
const SKETCH_OP_PREFIX = 'sketch.'

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
const SHAPE_FIELDS = Object.freeze(['op', 'supersedes', 'consumes', 'target', 'operands'])

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
 * @returns {WarpDocument}
 */
export function createDocument(options = {}) {
  const ops = options.registry ?? defaultRegistry
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
   * The same, for sketch lineages (`sketch.*` ops) — a **parallel** list rather
   * than a flag on `rootOrder`, so `bodies()` cannot accidentally report an
   * entity that has no geometry and `sketchEntities()` cannot report a solid.
   * @type {string[]}
   */
  const sketchRootOrder = []
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
   * Inactive-tail rows the shadow check could not build, id → reason. Recomputed
   * on every successful re-fold, and empty whenever nothing is rolled back.
   * @type {Map<string, string>}
   */
  let brokenById = new Map()

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
   * @property {Map<string, string>} brokenById
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
      brokenById,
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
    brokenById = state.brokenById
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
   */
  function ingest(record, origin) {
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

    // A sketch record is a document mutation like any other — origin-tagged,
    // id-checked, lineage-tracked — but it produces no geometry, so it is
    // routed past the kernel entirely. Checked **before** the trial fold
    // below, which is the whole of the boundary-preserving claim in this
    // module's sketch-records note.
    const isSketch = record.op.startsWith(SKETCH_OP_PREFIX)
    if (isSketch && record.consumes !== undefined) {
      throw new Error(
        `document.append: ${record.op} may not set \`consumes\` — retiring bodies into a ` +
          'new one is a solid-geometry claim, and a sketch entity is not a body'
      )
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

    if (isSketch && record.id === undefined) {
      throw new Error(
        'document.append: a sketch record needs its own `id` — an entity has to be ' +
          'selectable, and a later endpoint edit has to name what it supersedes'
      )
    }

    // Trial fold. `applyAction` never throws — it reports — so a failure shows up
    // as a *new* entry in the candidate scene's error list, and the record is
    // rejected rather than committed. Skipped outright for a sketch record:
    // there is no geometry to evaluate and no registry entry to look up.
    const errorsBefore = scene.errors.length
    const candidate = isSketch ? scene : applyAction(scene, record, ops)
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
      if (root === record.id) (isSketch ? sketchRootOrder : rootOrder).push(record.id)
      // A consuming record is its own new lineage root (the line above already
      // made it one, since it carries no `supersedes`); what is left is to
      // retire the lineages it absorbed, so `bodies()` stops reporting them and
      // `currentIdOf` starts resolving through them.
      for (const consumedRoot of consumedRoots) mergedInto.set(consumedRoot, record.id)
    }
    scene = candidate
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
      sketchRootOrder: sketchRootOrder.slice(),
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
    sketchRootOrder.length = 0
    mergedInto.clear()
    recordById.clear()
    scene = emptyScene()
    if (!snapshot) return
    for (const [key, value] of snapshot.originById) originById.set(key, value)
    for (const [key, value] of snapshot.rootById) rootById.set(key, value)
    for (const [key, value] of snapshot.terminalByRoot) terminalByRoot.set(key, value)
    rootOrder.push(...snapshot.rootOrder)
    sketchRootOrder.push(...snapshot.sketchRootOrder)
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

    const scratch = createDocument({ registry: ops })
    /** @type {Set<string>} */
    const built = new Set()
    /** @param {DocumentEntry} entry */
    const feed = (entry) => {
      scratch.append(entry.record, { origin: entry.origin })
      if (entry.record.id !== undefined) built.add(entry.record.id)
    }

    for (let index = 0; index < activeCount; index += 1) {
      const entry = nextEntries[index]
      if (entry.suppressed === true) continue
      // Cannot throw: this prefix is the fold that just succeeded. Guarded
      // anyway so a shadow check can never be the thing that breaks a document.
      try {
        feed(entry)
      } catch {
        /* ignored — see above */
      }
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
   * @returns {DocumentState} The state **before** the rebuild, so the caller can
   *   record it on the step it pushes and a later Undo can put it back without
   *   this fold running again (`TODO/core-030`).
   */
  function rebuildFrom(nextEntries, nextRollbackAt = rollbackAt) {
    const prior = captureState()
    const snapshot = prior.derived
    const activeCount = nextRollbackAt ?? nextEntries.length
    const byId = recordMapOf(nextEntries)
    resetDerived(null)
    try {
      for (let index = 0; index < activeCount && index < nextEntries.length; index += 1) {
        const entry = nextEntries[index]
        // Suppressed: in the log, in the list, out of the fold (section 16).
        if (entry.suppressed === true) continue
        ingestRow(entry, index, byId)
      }
    } catch (error) {
      resetDerived(snapshot)
      throw error
    }
    entries.length = 0
    entries.push(...nextEntries)
    rollbackAt = nextRollbackAt
    brokenById = shadowCheckTail(nextEntries, activeCount, byId)
    bumpState()
    return prior
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

    const verb = /** @type {Record<string, string>} */ (STEP_VERBS)[record.op]
    if (verb !== undefined) {
      if (record.consumes !== undefined) return verb
      return subjectName === undefined ? verb : `${verb} ${subjectName}`
    }
    // No verb, but it supersedes something: this is an in-place edit rebuilding
    // a body from changed params (`ui-029`) or a sketch endpoint move
    // (`ui-020`), both of which reuse the *creation* op and so would otherwise
    // be labelled as placing a brand-new body with a generated id.
    if (record.supersedes !== undefined) {
      return subjectName === undefined ? 'Edit' : `Edit ${subjectName}`
    }
    const noun = record.name ?? record.id ?? record.op
    return record.op.startsWith(SKETCH_OP_PREFIX) ? `Draw ${noun}` : `Place ${noun}`
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

      // Only a local step is ever undone, so only a local step needs the state
      // before it kept (`TODO/core-030`) — a remote or seed append pays nothing.
      const prior = origin === 'local' && keepRestorable > 0 ? captureState() : null

      /** @type {OpRecord[]} */
      const appended = []
      for (const record of records) {
        ingest(record, origin)
        entries.push({ record, origin })
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
      next.splice(at, 0, ...records.map((record) => ({ record, origin })))
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
     */
    loadEntries(nextEntries, nextRollbackAt = null) {
      if (
        nextRollbackAt !== null &&
        !(Number.isInteger(nextRollbackAt) && nextRollbackAt >= 1 && nextRollbackAt < nextEntries.length)
      ) {
        throw new Error(
          `document.loadEntries: rollback marker ${JSON.stringify(nextRollbackAt)} is not a count ` +
            `between 1 and ${nextEntries.length - 1} for a log of ${nextEntries.length} steps`
        )
      }
      rebuildFrom(
        nextEntries.map((entry) => ({
          record: entry.record,
          origin: entry.origin,
          ...(entry.suppressed === true ? { suppressed: true } : {}),
        })),
        nextRollbackAt
      )
      undoStack.length = 0
      redoStack.length = 0
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

    /**
     * Every row, in log order — `ui-032`'s whole data source.
     *
     * Derived on call, never stored: the panel re-reads it after every version
     * bump, and a stored copy is one more thing that can disagree with the log.
     */
    timeline() {
      const activeCount = rollbackAt ?? entries.length
      const byId = recordMapOf(entries)
      return entries.map((entry, index) => ({
        step: index + 1,
        id: entry.record.id ?? '',
        record: entry.record,
        origin: entry.origin,
        label: labelFor([entry.record], byId),
        suppressed: entry.suppressed === true,
        active: index < activeCount,
        broken: brokenById.get(entry.record.id ?? `#${index + 1}`) ?? null,
      }))
    },

    /**
     * The inactive tail rows the shadow check could not build — section 18's
     * `broken` chips, as {@link BrokenStep}s rather than a flag, so the panel
     * can show the reason on hover without asking again.
     *
     * Always empty when nothing is rolled back: a failure in the **active**
     * document is an atomic rejection, never a flag.
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
        const paramsRecord = currentParamsRecordOf(document.lineageOf(rootId)) ?? rootRecord
        bodies.push({
          id: rootId,
          recordId: terminalId,
          name: rootRecord.name ?? rootId,
          op: rootRecord.op,
          params: paramsRecord.params ?? {},
          rotationDeg: isVec3(carried) ? [carried[0], carried[1], carried[2]] : [0, 0, 0],
          geometry,
        })
      }
      return bodies
    },

    /**
     * The document's sketch entities, one per lineage — `bodies()`'s shape, for
     * the half of the document the kernel never sees.
     *
     * Op-agnostic on purpose: it hands back `params` verbatim and never
     * interprets them, so a later `sketch.circle` needs no change here.
     * `src/sketch/entity.js` is what reads a line's params back out, and it
     * validates rather than trusting them.
     */
    sketchEntities() {
      /** @type {SketchEntityRecord[]} */
      const entities = []
      for (const rootId of sketchRootOrder) {
        const terminalId = terminalByRoot.get(rootId) ?? rootId
        const rootRecord = recordById.get(rootId)
        if (rootRecord === undefined) continue
        const terminalRecord = recordById.get(terminalId) ?? rootRecord
        entities.push({
          id: rootId,
          recordId: terminalId,
          name: rootRecord.name ?? rootId,
          op: rootRecord.op,
          // The terminal record's, not the root's — see `SketchEntityRecord`.
          params: terminalRecord.params ?? {},
        })
      }
      return entities
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

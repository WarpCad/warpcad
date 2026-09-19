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
 */

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
 * @property {(id: string) => string | undefined} originOf
 * @property {(id: string) => string | undefined} currentIdOf
 * @property {(id: string) => string | undefined} rootOf
 * @property {(id: string) => OpRecord[]} lineageOf
 * @property {() => Body[]} bodies
 * @property {() => SketchEntityRecord[]} sketchEntities
 * @property {() => boolean} canUndo
 * @property {() => boolean} canRedo
 * @property {() => HistoryStep | undefined} pendingUndo
 * @property {() => HistoryStep | undefined} pendingRedo
 * @property {() => HistoryStep | undefined} undo
 * @property {() => HistoryStep | undefined} redo
 * @property {() => void} clearHistory
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
 * Create a document.
 *
 * @param {object} [options]
 * @param {Readonly<Record<string, RegistryEntry>>} [options.registry] Op catalogue;
 *   defaults to the real kernel registry. A test passes a fake one (CLAUDE.md:
 *   "always mock at the boundary").
 * @param {readonly OpRecord[]} [options.actions] Records to seed the log with, e.g.
 *   a loaded NDJSON document.
 * @param {string} [options.origin] Origin recorded against the seed records.
 * @returns {WarpDocument}
 */
export function createDocument(options = {}) {
  const ops = options.registry ?? defaultRegistry

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
   * Re-derive the whole document from a new entry list — the one mutation
   * primitive underneath undo (remove a step), redo (insert it back at its
   * index) and, when `data-004` arrives, insert-at-the-marker and edit-in-place.
   *
   * **Atomic**: if any record no longer folds, the captured indexes go back and
   * the error propagates, so the caller's refusal leaves the document exactly as
   * it was. That is the same contract section 18 requires of a broken roll-forward.
   *
   * A full re-fold rather than a partial one, deliberately — `data-004`'s own
   * Proposed fix makes the argument and this task's mechanism has to agree with
   * it: correctness-by-construction from reusing the proven fold beats a speed
   * win with no measured need. `idCounter` is **not** reset, so an id can never
   * be handed out twice across an undo.
   *
   * @param {DocumentEntry[]} nextEntries
   */
  function rebuildFrom(nextEntries) {
    const snapshot = captureDerived()
    resetDerived(null)
    try {
      for (const entry of nextEntries) ingest(entry.record, entry.origin)
    } catch (error) {
      resetDerived(snapshot)
      throw error
    }
    entries.length = 0
    entries.push(...nextEntries)
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
   * @returns {string}
   */
  function labelFor(records) {
    const record = records[0]
    const subject = record.supersedes ?? record.target
    const rootId = typeof subject === 'string' ? rootById.get(subject) : undefined
    // The *root's* name, not the acting record's: a transform and a param edit
    // both carry generated ids and no name of their own, and what the user calls
    // the thing is "Cube 1" — the same reason `Body.name` reads from the root.
    const subjectName = rootId === undefined ? undefined : recordById.get(rootId)?.name

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
     * `ui-030`'s own loop; making the batch atomic is `data-004`'s contract to
     * define, since it is the task that needs a rejected *replay* to change
     * nothing.
     */
    appendAll(records, transaction) {
      const origin = transaction?.origin
      /** @type {OpRecord[]} */
      const appended = []
      for (const record of records) {
        ingest(record, origin)
        entries.push({ record, origin })
        appended.push(record)
      }

      // Origin scoping, the whole of it on the write side: only this user's own
      // edits become something Undo can reach. A programmatic or remote record
      // is a first-class part of the document — it is in `entries`, in
      // `bodies()`, and will carry an origin chip in `ui-032`'s History — but it
      // is not theirs to take back (section 19, point 1).
      if (origin === 'local' && appended.length > 0) {
        undoStack.push({
          origin,
          label: transaction.label ?? labelFor(appended),
          records: appended,
          meta: transaction.meta,
        })
        // Point 3: only a *new local mutation* clears redo. A remote arrival
        // must not, or someone else's edit silently eats the user's redo.
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
      rebuildFrom(entries.filter((entry) => !stepRecords.has(entry.record)))
      undoStack.pop()
      redoStack.push({ ...step, index })
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
      const next = entries.slice()
      next.splice(
        step.index ?? next.length,
        0,
        ...step.records.map((record) => ({ record, origin: step.origin }))
      )
      rebuildFrom(next)
      redoStack.pop()
      undoStack.push(step)
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
      let candidate
      do {
        idCounter += 1
        candidate = `${prefix}-${idCounter}`
      } while (originById.has(candidate))
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
  // Loading a document is not a stack of things to undo back out of, even though
  // the seed loop goes through the same origin-tagged command layer everything
  // else does — section 19: "the undo/redo stacks start empty after a reload and
  // after Open / Load-from-repo".
  document.clearHistory()

  return document
}

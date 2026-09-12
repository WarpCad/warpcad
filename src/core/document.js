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
 * - `Body.op`/`params`/`name` come from the **root**, because that is what the
 *   body *is*: a Cube stays a Cube with a 40 mm size after you move it, and the
 *   Inspector must keep showing that rather than the translate's `vector`.
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
 * @property {Record<string, any>} params The root record's params, plain JSON —
 *   what the body *is*, not how it has since been moved.
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
 * @typedef {object} WarpDocument
 * @property {readonly DocumentEntry[]} entries
 * @property {readonly OpRecord[]} records
 * @property {Scene} scene Current derived scene.
 * @property {number} version Bumps on every successful append.
 * @property {(record: OpRecord, transaction: { origin: string }) => { record: OpRecord, scene: Scene }} append
 * @property {(id: string) => string | undefined} originOf
 * @property {(id: string) => string | undefined} currentIdOf
 * @property {() => Body[]} bodies
 * @property {() => SketchEntityRecord[]} sketchEntities
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
      const origin = transaction?.origin
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
            'continuing one body\'s identity and retiring several into a new one are ' +
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

      entries.push({ record, origin })
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
      document.version += 1
      return { record, scene }
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
        bodies.push({
          id: rootId,
          recordId: terminalId,
          name: rootRecord.name ?? rootId,
          op: rootRecord.op,
          params: rootRecord.params ?? {},
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

  return document
}

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Library panel's catalogue, derived from the kernel registry.
 *
 * CLAUDE.md is explicit that "read the registry, don't hardcode a list" is the
 * right instinct *and* that it produces a broken UI unless the registry itself
 * encodes what the UI needs to act on. So the rows come from registry entries that
 * carry `ui` metadata (label + default params), grouped into sections by op
 * namespace, and this module adds only the two things that are genuinely about
 * placement rather than about the op: the drop position, and the per-type instance
 * name.
 *
 * That is what makes drag-place **one** mechanism parameterised by an op string
 * rather than seven near-identical hand-copies — adding an eighth primitive to the
 * registry adds its Library row, its ghost preview and its drop behaviour with no
 * change here or in any component.
 *
 * ## Two kinds of row, one gesture (`TODO/ui-030`)
 *
 * Since the Hardware section landed there are two kinds of creation row, and the
 * difference is **not** cosmetic: a `primitive.*` op takes its position as a
 * `center` param, while a `hardware.*` composite recipe takes no position at all —
 * it places its own parts at fixed millimetre offsets of its own, which is what
 * makes a recipe a reviewable definition rather than a function with a pose.
 *
 * Handing a recipe a `center` is not an error; it is *silence*. The key rides
 * along, nothing destructures it, and the part is built at the recipe's origin
 * however far it was dragged. So a composite drop commits **two** records — the
 * recipe's own, plus a `transform.translate` that `supersedes` it — and this
 * module is where that branch lives, once, rather than in every recipe
 * ({@link recordsForDrop}, {@link restingOffsetMm}). The gesture, the ghost and
 * the selection contract are identical either way; only the arithmetic differs.
 *
 * ## User parts (`TODO/core-037`)
 *
 * A part the user saved (`src/core/userPart.js`) is registered at runtime as a `user.*`
 * composite with `ui` metadata, so it gets a row, a ghost and a drop from exactly the code
 * above — the rows are just read **live** ({@link userLibrarySection}), because unlike the
 * built-in catalogue they come and go while the app runs. {@link definePartFromSelection}
 * is the other direction: a body in the document captured as a part.
 *
 * Framework-free (CLAUDE.md's Project Structure): the geometry maths that decides
 * where a dropped body sits lives here, not in a component.
 *
 * @module core/library
 */

import { evaluateOp } from './kernel/index.js'
import { boundsOf } from './kernel/group.js'
import { lookupEntry, registry } from './kernel/registry.js'
import { capturePart, effectiveUserPart, effectiveUserParts, isUserPartOp, userPartStatus } from './userPart.js'

/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {{ x: number, y: number }} PointMm A point on the working plane, in mm. */

/**
 * @typedef {object} LibraryRow
 * @property {string} op Registry key — the drag payload, and the whole parameter.
 * @property {string} label Human name, e.g. `"Cube"`.
 * @property {Record<string, any>} defaults Params a fresh instance is created with.
 * @property {0 | 1 | '2+'} operandCount Always `0` here: these create from nothing.
 * @property {'native' | 'composite'} kind Which half of {@link recordsForDrop}
 *   places it. A native op takes its position as a `center` param; a composite
 *   recipe has no position param at all and is moved by a trailing translate.
 * @property {import('./kernel/registry.js').OpUiChoice | null} choice A variant the
 *   user picks before dragging (`TODO/ui-031`), or `null` for a row that is one
 *   fixed shape. Copied straight off the registry entry: which rows have one, what
 *   it sets and what it offers are all the registry's business, so the panel
 *   renders a control without naming a recipe and this module does not branch on it
 *   at all — a chosen value simply arrives as the `overrides` argument every
 *   function here already took.
 * @property {readonly import('./kernel/registry.js').OpUiChoice[]} extraChoices More
 *   pre-drag variants beside `choice` (`TODO/core-057`'s Case beside its Model); empty for
 *   every other row.
 * @property {((params: Record<string, any>) => string) | null} nameFor Label a dropped
 *   instance is numbered from, when it depends on the chosen params; `null` uses `label`.
 * @property {'sketch' | null} editor Whether dropping the row opens an editor instead
 *   of committing a record (`TODO/sketch-001`'s Sketch row), copied off the registry
 *   like `choice`, so the viewport reads a flag rather than naming an op.
 * @property {UserPartRowStatus} [userPart] Present on a user part's row only
 *   (`TODO/core-037`): which version places, and whether the library is ahead of it.
 */

/**
 * @typedef {object} UserPartRowStatus
 * @property {number} version The version a drop builds — the open project's copy when it
 *   carries one, else the library's.
 * @property {number | null} projectVersion
 * @property {number | null} libraryVersion
 * @property {boolean} newerVersionAvailable The library has a newer version than the one
 *   the project's instances are built from. Placing still builds the project's version.
 */

/**
 * @typedef {object} LibrarySection
 * @property {string} id Namespace the rows come from — `'primitive'`, `'hardware'`.
 * @property {string} title Heading the panel renders.
 * @property {readonly LibraryRow[]} rows
 */

/**
 * Row order within each section, so the panel reads the way `Initial design.md`
 * §6's Base creation rows do — the items a user reaches for most, first — rather
 * than in whatever order `Object.keys` happens to return.
 *
 * One flat list rather than one per section: an op appears in exactly one
 * namespace, so its rank is unambiguous, and adding a section does not mean
 * adding a lookup table to go with it.
 */
const ROW_ORDER = Object.freeze([
  'primitive.cuboid',
  'primitive.cylinder',
  'primitive.cone',
  'primitive.hexagon',
  'primitive.triangle',
  'primitive.tube',
  // A sketch is a primitive you draw rather than size (`TODO/sketch-001`), so it sits
  // with the other primitives, after Tube — the last of the extruded-profile shapes.
  'primitive.sketch',
  'primitive.sphere',
  'hardware.bolt',
  'hardware.nut',
  'hardware.washer',
  'hardware.bearing',
  'kit.board',
  'kit.boardFrame',
  'kit.anchor',
  'kit.phone',
  // The Raspberry Pi section reads outward from the board (`TODO/ui-031`): the
  // board itself, what plugs straight into it, then the accessories, then the
  // screens — which is the order someone building a Pi enclosure reaches for them
  // in, and not the alphabetical order `Object.keys` would give.
  'raspberrypi.bplus',
  'raspberrypi.cameraModule',
  'raspberrypi.hat',
  'raspberrypi.hatStandoff',
  'raspberrypi.spacer',
  'raspberrypi.activeCoolingFan',
  'raspberrypi.touchDisplay7inch',
  'raspberrypi.touchScreen2',
  'raspberrypi.hyperPixel4Rectangular',
  'raspberrypi.miniPiTFT',
  'raspberrypi.piTFT22',
  'raspberrypi.piTFT24',
  'text.label',
])

/**
 * The sections the panel renders, in order, and the op namespace each is built
 * from.
 *
 * Still deliberately *not* "show every registry entry", now that all four
 * creation namespaces are here (`TODO/ui-031`): CLAUDE.md forbids a menu built by
 * blindly iterating a registry, and the registry holds plenty that must never
 * appear as a creation row — `boolean.*`, `modify.*`, `group.*`, `transform.*`,
 * `profile.*`. A section is a namespace the project has decided to offer; within
 * it, `ui` metadata still decides row by row, and {@link buildRows} throws rather
 * than silently listing anything that turns out to need operands.
 *
 * @type {readonly { id: string, title: string }[]}
 */
const SECTION_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'primitive', title: 'Primitives' }),
  Object.freeze({ id: 'hardware', title: 'Hardware' }),
  Object.freeze({ id: 'kit', title: 'Kit Parts' }),
  Object.freeze({ id: 'raspberrypi', title: 'Raspberry Pi' }),
  Object.freeze({ id: 'text', title: 'Text' }),
])

/**
 * @param {Readonly<Record<string, import('./kernel/registry.js').RegistryEntry>>} ops
 * @param {string} namespace Op prefix, without the dot.
 * @returns {LibraryRow[]}
 */
function buildRows(ops, namespace) {
  const prefix = `${namespace}.`
  // `ui` metadata, not merely the namespace: a registry entry earns a row by
  // saying what to call it and what to build it with. `ui-031` added fifteen rows
  // through exactly that door and changed nothing here — which is the claim this
  // filter was making, now actually collected on.
  const keys = Object.keys(ops).filter((op) => op.startsWith(prefix) && ops[op].ui)
  keys.sort((a, b) => {
    const rankA = ROW_ORDER.indexOf(a)
    const rankB = ROW_ORDER.indexOf(b)
    // An op the order list has never heard of sorts after the known ones rather
    // than silently vanishing — a new registry entry should show up in the panel.
    return (rankA === -1 ? ROW_ORDER.length : rankA) - (rankB === -1 ? ROW_ORDER.length : rankB)
  })
  return keys.map((op) => {
    const entry = ops[op]
    const ui = /** @type {import('./kernel/registry.js').OpUi} */ (entry.ui)
    if (entry.operandCount !== 0) {
      // A creation row is by definition 0-operand. An op needing operands
      // belongs in the Operations toolbar, gated on selection count — mixing the
      // two into one list is the exact failure CLAUDE.md's creation-vs-operation
      // rule names.
      throw new Error(
        `${op}: a Library row creates from nothing, but this entry consumes ` +
          `${entry.operandCount} operand(s) — it belongs in the Operations toolbar`
      )
    }
    return Object.freeze({
      op,
      label: ui.label,
      defaults: ui.defaults,
      operandCount: entry.operandCount,
      kind: entry.kind,
      choice: ui.choice ?? null,
      extraChoices: ui.extraChoices ?? Object.freeze([]),
      nameFor: ui.nameFor ?? null,
      editor: ui.editor ?? null,
    })
  })
}

/**
 * The "Primitives" section of the Library panel.
 *
 * @type {readonly LibraryRow[]}
 */
export const PRIMITIVE_LIBRARY = Object.freeze(buildRows(registry, 'primitive'))

/**
 * The "Hardware" section (`TODO/ui-030`): the four fastener recipes M2 and M4
 * built, dimensionally verified against V1, and left unreachable from the app.
 *
 * @type {readonly LibraryRow[]}
 */
export const HARDWARE_LIBRARY = Object.freeze(buildRows(registry, 'hardware'))

/**
 * The "Kit Parts" section (`TODO/ui-031`): `Initial design.md` §6's three Kit-part
 * rows, built and kernel-verified by `core-012` and unreachable from the app until
 * they gained `ui` metadata.
 *
 * @type {readonly LibraryRow[]}
 */
export const KIT_LIBRARY = Object.freeze(buildRows(registry, 'kit'))

/**
 * The "Raspberry Pi" section (`TODO/ui-031`): the whole `core-014`-`core-018`
 * catalogue — the board, the cameras, the HAT trio, the fan and the five screens.
 *
 * Twelve rows for twelve recipes, **not** twelve plus one per board revision and
 * camera variant: `raspberrypi.bplus` and `raspberrypi.cameraModule` are each one
 * factory with a `model` param (`core-014a`), so each is one row carrying a
 * {@link LibraryRow}`.choice`.
 *
 * @type {readonly LibraryRow[]}
 */
export const RASPBERRYPI_LIBRARY = Object.freeze(buildRows(registry, 'raspberrypi'))

/**
 * The sections that are exported in their own right, by id — so
 * {@link LIBRARY_SECTIONS} hands out the *same* frozen arrays rather than a
 * second copy of each, and a caller comparing them by identity is right to.
 *
 * @type {Readonly<Record<string, readonly LibraryRow[]>>}
 */
const SECTION_ROWS = Object.freeze({
  primitive: PRIMITIVE_LIBRARY,
  hardware: HARDWARE_LIBRARY,
  kit: KIT_LIBRARY,
  raspberrypi: RASPBERRYPI_LIBRARY,
})

/**
 * Every section the panel renders, in order.
 *
 * The panel iterates this rather than naming its sections itself, so a third
 * section is a change here and nothing in any component.
 *
 * @type {readonly LibrarySection[]}
 */
export const LIBRARY_SECTIONS = Object.freeze(
  SECTION_DEFINITIONS.map((section) =>
    Object.freeze({
      ...section,
      rows: SECTION_ROWS[section.id] ?? Object.freeze(buildRows(registry, section.id)),
    })
  )
)

/** Every row in every section, flattened — the lookup {@link libraryRow} walks. */
const ALL_ROWS = Object.freeze(LIBRARY_SECTIONS.flatMap((section) => [...section.rows]))

/**
 * A user part's row, built from its live registry entry, or `null` when `op` is not a
 * usable user part right now (`TODO/core-037`).
 *
 * @param {string} op
 * @returns {LibraryRow | null}
 */
function userPartRow(op) {
  const entry = isUserPartOp(op) ? lookupEntry(op) : undefined
  const definition = effectiveUserPart(op)
  if (entry === undefined || entry.ui === undefined || definition === undefined) return null
  const status = userPartStatus(op)
  return Object.freeze({
    op,
    label: entry.ui.label,
    defaults: entry.ui.defaults,
    operandCount: entry.operandCount,
    kind: entry.kind,
    choice: null,
    extraChoices: Object.freeze([]),
    nameFor: null,
    editor: null,
    userPart: Object.freeze({ version: definition.version, ...status }),
  })
}

/**
 * The *My parts* section (`TODO/core-037`): one row per usable user part, by label. Read
 * live — call it again after the library or the open project changes. `ui-055` renders it.
 *
 * @returns {LibrarySection}
 */
export function userLibrarySection() {
  const rows = effectiveUserParts()
    .map((definition) => userPartRow(definition.op))
    .filter((row) => row !== null)
    .sort((a, b) => a.label.localeCompare(b.label))
  return Object.freeze({ id: 'user', title: 'My parts', rows: Object.freeze(rows) })
}

/**
 * Every section the panel renders right now: the fixed catalogue, then *My parts* when
 * there is at least one.
 *
 * @returns {readonly LibrarySection[]}
 */
export function librarySections() {
  const mine = userLibrarySection()
  return mine.rows.length > 0 ? [...LIBRARY_SECTIONS, mine] : LIBRARY_SECTIONS
}

/**
 * Look a row up by op.
 *
 * @param {string} op
 * @returns {LibraryRow}
 */
export function libraryRow(op) {
  const row = ALL_ROWS.find((candidate) => candidate.op === op) ?? userPartRow(op)
  if (!row) throw new Error(`${op} is not a Library row — nothing can be dragged from it`)
  return row
}

/**
 * Capture the selected body as a user part (`TODO/core-037`): its lineage rewritten as a
 * self-contained, plain-JSON definition, verified to rebuild byte-identical geometry. The
 * caller decides where it goes (`storage/userLibrary.js`'s `save`); nothing is registered
 * or written here.
 *
 * @param {WarpDocument} document
 * @param {string} id The selected body's id.
 * @param {import('./userPart.js').CaptureOptions} options `{ name, exposeParams, version }`.
 * @returns {import('./userPart.js').UserPartDefinition}
 * @throws {import('./userPart.js').UserPartError} Naming what stopped it.
 */
export function definePartFromSelection(document, id, options) {
  return capturePart(document, id, options)
}

/**
 * Millimetre centre that leaves a primitive resting **on** the working plane
 * rather than half-buried in it.
 *
 * Every primitive's `center` param is its bounding-box centre, so dropping at the
 * grid's Z=0 with `center.z = 0` would sink half the solid below the grid — which
 * reads as a rendering bug the first time anyone drops a cube. The offset is
 * measured from the built solid rather than derived per primitive, so it is
 * correct for all seven without a per-type branch (and for the eighth).
 *
 * @param {string} op
 * @param {Record<string, any>} params
 * @param {PointMm} pointMm Where on the plane the pointer released.
 * @returns {[number, number, number]}
 */
export function restingCenter(op, params, pointMm) {
  const probe = evaluateOp(op, { ...params, center: [0, 0, 0] })
  const [min] = boundsOf(probe)
  return [pointMm.x, pointMm.y, -min[2]]
}

/**
 * The same placement, for an op that has **no position param at all**
 * (`TODO/ui-030`).
 *
 * No `hardware.*` recipe — and no composite recipe in general — takes a `center`:
 * each one places its own parts at fixed millimetre positions of its own, which
 * is exactly what makes a recipe a reviewable definition rather than a function
 * with a pose. Handing one a `center` is not an error, it is *silence*: the key
 * rides along in `params`, the recipe never destructures it, and the part is
 * built at the recipe's origin however far the user dragged. That silent
 * mis-placement is what this function and {@link recordsForDrop} exist to
 * prevent.
 *
 * So the drop is expressed the only way it can be — as a translation applied to
 * the built result — and this measures it: where the *unmoved* composite's
 * bounding box sits, against where the drop wants it. The claim it makes is
 * deliberately identical to {@link restingCenter}'s, so the two kinds of row
 * behave the same on screen: the box's X/Y centre lands on the drop point, and
 * its underside lands on the working plane.
 *
 * @param {string} op
 * @param {Record<string, any>} params The recipe's own params, unmoved.
 * @param {PointMm} pointMm Where on the plane the pointer released.
 * @returns {[number, number, number]} A `transform.translate` vector.
 */
export function restingOffsetMm(op, params, pointMm) {
  // `evaluateOp` folds a composite through the real pipeline and hands back its
  // `Group`; `boundsOf` measures a `Group` exactly as it measures a `Geom3`, so
  // there is no composite-shaped special case in the measurement itself.
  const [min, max] = boundsOf(evaluateOp(op, params))
  return [
    pointMm.x - (min[0] + max[0]) / 2,
    pointMm.y - (min[1] + max[1]) / 2,
    // `0 - z`, not `-z`: negating a `0` gives `-0`, which would ride into the record's
    // vector. Which sign of zero the box reports is an accident of how it was measured
    // (a part's own box and a union's disagree — `TODO/core-029`), so don't depend on it.
    0 - min[2],
  ]
}

/**
 * Params for an instance of a row dropped at a point.
 *
 * The drop position goes straight into the primitive's own `center` param: every
 * `primitive.*` entry already takes one, so a placed body is **one** record, not a
 * primitive plus a trailing `transform.translate`. (TODO/ui-010 asked for that
 * check before assuming a second record was needed — this is the answer.)
 *
 * The drag ghost and the committed record both come through here, so the preview
 * a user drags around is built from exactly the params the drop will commit.
 *
 * @param {string} op
 * @param {PointMm} pointMm
 * @param {Record<string, any>} [overrides]
 * @returns {Record<string, any>}
 */
export function paramsForDrop(op, pointMm, overrides = {}) {
  const row = libraryRow(op)
  const params = { ...row.defaults, ...overrides }
  // A composite's position is not a param and never will be — see
  // {@link restingOffsetMm}. Writing a `center` here would look like placement
  // and do nothing, which is worse than not writing one.
  if (row.kind === 'composite') return params
  return { ...params, center: restingCenter(op, params, pointMm) }
}

/**
 * A cache key that tells one *variant* of a row apart from another (`TODO/ui-031`).
 *
 * The viewport caches a ghost's built geometry, its measured box and its resting
 * offset per op, because all three are measured off real geometry and have no
 * business in the pointer path. A row with a {@link LibraryRow}`.choice` breaks
 * that assumption: `raspberrypi.bplus` is one op and five different solids, so an
 * op-keyed cache would draw whichever model was dragged *first* for every model
 * dragged afterwards — a preview quietly lying about what the drop commits, which
 * is the exact class of drift `ui-010` made `paramsForDrop` shared to rule out.
 *
 * Sorted, so `{ model: 5, fit: 'loose' }` and `{ fit: 'loose', model: 5 }` are one
 * cache entry rather than two. `JSON.stringify` per value rather than per object
 * for the same reason: object key order is insertion order, and a cache that
 * missed on it would rebuild a 50-part board on every pointer event.
 *
 * Called once per gesture (on `begin`), never per `pointermove`.
 *
 * @param {string} op
 * @param {Record<string, any>} [overrides] The variant's chosen params, if any.
 * @returns {string} `op` itself when there is nothing to distinguish, so an
 *   unvaried row keys exactly as it did before this existed.
 */
export function variantKey(op, overrides = {}) {
  // TODO/core-037: a user part re-saved under the same op is a different solid, so its
  // version is part of the key — a ghost cached for version 1 must not draw for version 2.
  const version = isUserPartOp(op) ? effectiveUserPart(op)?.version : undefined
  const base = version === undefined ? op : `${op}@${version}`
  const keys = Object.keys(overrides)
  if (keys.length === 0) return base
  keys.sort()
  return `${base}?${keys.map((key) => `${key}=${JSON.stringify(overrides[key])}`).join('&')}`
}

/**
 * The instance-id prefix for an op: its name without its namespace, so a
 * `hardware.bolt` numbers as `bolt-1` the way `primitive.cuboid` numbers as
 * `cuboid-1`. One rule rather than a per-namespace `replace`.
 *
 * @param {string} op
 * @returns {string}
 */
function idPrefixFor(op) {
  const dot = op.indexOf('.')
  return dot === -1 ? op : op.slice(dot + 1)
}

/**
 * Every op record one drop commits, in the order they must be appended.
 *
 * **One for a primitive, two for a composite**, and the difference is forced by
 * the ops themselves rather than chosen: a `primitive.*` op takes the drop point
 * as its own `center` param, so a placed body is one record; a composite recipe
 * has no position param at all, so its drop point can only be expressed as a
 * `transform.translate` applied to the result.
 *
 * That trailing record `supersedes` the recipe's own, which is what makes the two
 * records **one body** — the same mechanism `src/core/transform.js` uses to move
 * an existing body, reused rather than re-invented. The alternative considered and
 * rejected (`TODO/ui-030`'s option 1) was to give all four recipes a `center`
 * param of their own: it would have to be repeated in every future recipe, it
 * would change what those recipes' V1-diffed fixtures assert, and a recipe that
 * forgot it would fail the same silent way this function exists to rule out.
 *
 * The caller appends these **in order, through the command layer**, exactly as it
 * would a single record. Nothing here mutates the document.
 *
 * @param {string} op Registry key from the dragged row.
 * @param {PointMm} pointMm Drop position on the working plane.
 * @param {WarpDocument} document Supplies the id and the per-type instance number.
 * @param {Record<string, any>} [overrides] Extra params, e.g. a non-default size.
 * @returns {OpRecord[]} One or two records; the **first** is the body's lineage
 *   root, and therefore the id a caller selects and the document reports.
 */
export function recordsForDrop(op, pointMm, document, overrides = {}) {
  const row = libraryRow(op)
  const params = paramsForDrop(op, pointMm, overrides)
  /** @type {OpRecord} */
  const created = {
    id: document.nextId(idPrefixFor(op)),
    op,
    name: document.nextName(row.nameFor ? row.nameFor(params) : row.label),
    params,
  }
  if (row.kind !== 'composite') return [created]

  const baseId = String(created.id)
  return [
    created,
    {
      id: document.nextId(`${baseId}-drop`),
      op: 'transform.translate',
      target: baseId,
      // One body, not two: `document.js` reports one entry per lineage, so the
      // bolt a user sees keeps the creation record's id and name.
      supersedes: baseId,
      // Deliberately unnamed, per `src/core/transform.js`'s own note: a record
      // reusing its predecessor's name would make `combine()` union a body with
      // itself. `rotation` rides along for the same reason every transform record
      // carries it — the Inspector reads the *terminal* record's copy.
      params: { vector: restingOffsetMm(op, params, pointMm), rotation: [0, 0, 0] },
    },
  ]
}

/**
 * Build the single op record a **native** drop commits.
 *
 * Kept as its own function because a one-record drop is what most callers want to
 * reason about, and because refusing loudly is the point: a composite handed
 * through here would be committed at the recipe's own origin rather than at the
 * drop point, and nothing downstream would notice.
 *
 * @param {string} op Registry key from the dragged row.
 * @param {PointMm} pointMm Drop position on the working plane.
 * @param {WarpDocument} document Supplies the id and the per-type instance number.
 * @param {Record<string, any>} [overrides] Extra params, e.g. a non-default size.
 * @returns {OpRecord}
 */
export function recordForDrop(op, pointMm, document, overrides = {}) {
  // Checked *before* building anything: `nextId`/`nextName` advance the
  // document's own counters, so a throw after the fact would silently skip an
  // instance number.
  if (libraryRow(op).kind === 'composite') {
    throw new Error(
      `${op} is a composite recipe — it has no position param, so placing it takes ` +
        'the recipe record plus a trailing transform.translate. Use recordsForDrop ' +
        'and append every record it returns.'
    )
  }
  return recordsForDrop(op, pointMm, document, overrides)[0]
}

// --- snap-assisted placement (TODO/ui-013) ---------------------------------

/**
 * The snap tolerance radius, in **screen pixels**.
 *
 * A pixel radius rather than a millimetre one, converted at the boundary by
 * {@link snapToleranceMm}, because "close enough to snap" is a judgement a user
 * makes with their eyes: a fixed millimetre tolerance would cover half the
 * viewport when zoomed out and be unreachably tight when zoomed in, so the
 * assistance would change character with the zoom level rather than staying the
 * same gesture. `TODO/ui-013` calls for the tolerance to be "scaled by the
 * current `mmPerPixel` the way `ui-017`'s gizmo sizing already scales by zoom" —
 * this is that, with the unit named in the constant rather than implied.
 *
 * Tuned against the same reasoning as `GIZMO_ARM_FLOOR_PX`: comfortably larger
 * than a fingertip's own imprecision, small enough that two solids dropped
 * visibly apart stay apart.
 */
export const SNAP_TOLERANCE_PX = 48

/**
 * The tolerance radius in millimetres, at the viewport's current scale.
 *
 * @param {number} mmPerPixel The viewport's own scale — the number the grid
 *   readout quotes (`orbit.getMmPerPixel(heightPx)`).
 * @returns {number} Millimetres, or `0` when there is no usable scale — which
 *   disables snapping outright rather than inventing a tolerance. A drop the
 *   user did not ask to have moved is worse than no assistance.
 */
export function snapToleranceMm(mmPerPixel) {
  return mmPerPixel > 0 ? SNAP_TOLERANCE_PX * mmPerPixel : 0
}

/**
 * @typedef {object} BoxMm
 * @property {number[]} minMm `[x, y, z]` minimum corner, millimetres.
 * @property {number[]} maxMm Maximum corner.
 */

/**
 * @typedef {object} SnapAlignment
 * @property {string} id Stable name, used in tests and in the guide's markup.
 * @property {'center' | 'edge'} kind What the guide is drawn along — the
 *   reference's centre line, or one of its faces.
 * @property {string | null} orientation The `SNAP_SIDES` key in
 *   `src/core/kernel/group.js` this alignment is the arithmetic of, or `null`
 *   for the centre alignment (which is `calcCenterWith`, not `calcSnap`).
 */

/**
 * The five alignments a dragged ghost can snap to on one axis, in **preference
 * order** — earlier wins an exact tie.
 *
 * Centre first, deliberately: for two same-size solids the centre, min-flush and
 * max-flush alignments are numerically identical, and "their centre lines line
 * up" is the one a user means (it is also the alignment the bolt/nut case in
 * `TODO/ui-013`'s own example needs — a nut snapping onto a bolt's axis). The
 * touching-face pair comes last so a ghost is only pushed *against* a solid when
 * no flush alignment is nearer.
 *
 * Each entry names the `group.js` orientation whose arithmetic it is, and
 * `src/core/library.spec.js` asserts every one of them agrees with that
 * function's own output exactly — see {@link alignmentOffsetMm} for why the call
 * is not made directly.
 *
 * @type {readonly SnapAlignment[]}
 */
export const SNAP_ALIGNMENTS = Object.freeze([
  Object.freeze({ id: 'center', kind: /** @type {'center'} */ ('center'), orientation: null }),
  Object.freeze({ id: 'flush-min', kind: /** @type {'edge'} */ ('edge'), orientation: 'below-inside' }),
  Object.freeze({ id: 'flush-max', kind: /** @type {'edge'} */ ('edge'), orientation: 'above-inside' }),
  Object.freeze({ id: 'touch-max', kind: /** @type {'edge'} */ ('edge'), orientation: 'above-outside' }),
  Object.freeze({ id: 'touch-min', kind: /** @type {'edge'} */ ('edge'), orientation: 'below-outside' }),
])

/**
 * How far one alignment would move the ghost along one axis, in millimetres.
 *
 * This is `calcSnap`'s own `reference-side − moving-side` arithmetic
 * (`src/core/kernel/group.js`), reduced to scalars. `TODO/ui-013`'s Proposed fix
 * asks for `calcSnap` to be reused, and its *maths* is — but not by calling it:
 * `calcSnap` takes solids, measures a bounding box per call and allocates a
 * vector per call, while this runs on every `pointermove` of a drag against five
 * candidates per axis, which CLAUDE.md's Performance rule rules out. The two are
 * asserted equal in the spec instead, so the equivalence is checked rather than
 * asserted in prose.
 *
 * @param {number} alignmentIndex Index into {@link SNAP_ALIGNMENTS}.
 * @param {number} movingMinMm The ghost's extent on this axis.
 * @param {number} movingMaxMm
 * @param {number} referenceMinMm The existing body's extent on this axis.
 * @param {number} referenceMaxMm
 * @returns {number} Signed millimetres along the axis.
 */
export function alignmentOffsetMm(
  alignmentIndex,
  movingMinMm,
  movingMaxMm,
  referenceMinMm,
  referenceMaxMm
) {
  switch (alignmentIndex) {
    case 0:
      // calcCenterWith: centroid onto centroid. A bounding box's centroid is its
      // mid-point, which is what `centroidOf` measures too.
      return (referenceMinMm + referenceMaxMm) / 2 - (movingMinMm + movingMaxMm) / 2
    case 1:
      return referenceMinMm - movingMinMm
    case 2:
      return referenceMaxMm - movingMaxMm
    case 3:
      return referenceMaxMm - movingMinMm
    case 4:
      return referenceMinMm - movingMaxMm
    default:
      throw new Error(`alignmentOffsetMm: no alignment at index ${alignmentIndex}`)
  }
}

/**
 * Where on the axis an alignment's guide line is drawn — the coordinate of the
 * reference feature the ghost has just been aligned to, which is also where the
 * ghost's own corresponding feature now sits.
 *
 * @param {number} alignmentIndex Index into {@link SNAP_ALIGNMENTS}.
 * @param {number} referenceMinMm
 * @param {number} referenceMaxMm
 * @returns {number}
 */
export function alignmentCoordMm(alignmentIndex, referenceMinMm, referenceMaxMm) {
  if (alignmentIndex === 0) return (referenceMinMm + referenceMaxMm) / 2
  // The min face for the alignments measured off it, the max face for the rest.
  return alignmentIndex === 1 || alignmentIndex === 4 ? referenceMinMm : referenceMaxMm
}

/**
 * @typedef {object} SnapGuide
 * @property {0 | 1} axis The working-plane axis this guide aligns — `0` is a
 *   line of constant X running along Y, `1` a line of constant Y running along X.
 * @property {boolean} visible False when this axis did not snap.
 * @property {'center' | 'edge'} kind Which feature of the reference it lies on.
 * @property {number} x1Mm One end of the line, in document millimetres.
 * @property {number} y1Mm
 * @property {number} x2Mm The other end.
 * @property {number} y2Mm
 * @property {number} zMm Height the line is drawn at — the reference solid's own
 *   base, which is the working plane both it and the ghost rest on.
 */

/**
 * @typedef {object} SnapState
 * @property {boolean} snapped True when at least one axis was pulled into line.
 * @property {number} dxMm How far the drop point moves, in millimetres.
 * @property {number} dyMm
 * @property {SnapGuide[]} guides One per working-plane axis, always both
 *   present; `visible` says which are drawn.
 */

/**
 * Allocate a {@link BoxMm} once, so a per-`pointermove` caller mutates rather
 * than rebuilds — the same contract as `src/render/annotate.js`'s `create*`.
 *
 * @returns {BoxMm}
 */
export function createBoxMm() {
  return { minMm: [0, 0, 0], maxMm: [0, 0, 0] }
}

/**
 * Allocate the snap state once. See {@link updateSnap}.
 *
 * @returns {SnapState}
 */
export function createSnapState() {
  return {
    snapped: false,
    dxMm: 0,
    dyMm: 0,
    guides: [0, 1].map((axis) => ({
      axis: /** @type {0 | 1} */ (axis),
      visible: false,
      kind: /** @type {'center' | 'edge'} */ ('edge'),
      x1Mm: 0,
      y1Mm: 0,
      x2Mm: 0,
      y2Mm: 0,
      zMm: 0,
    })),
  }
}

/**
 * The box a ghost of `op` occupies when dropped at the working plane's origin.
 *
 * Measured off the built solid through the *same* {@link paramsForDrop} the drop
 * itself commits, so the box describes the shape that will actually land —
 * including resting on the plane rather than sunk half into it. Evaluating a
 * solid is far too expensive for the pointer path, which is why this is shaped
 * as "measure once per op, then translate": {@link boxAtPoint} moves it to
 * wherever the pointer is, with no evaluation at all.
 *
 * @param {string} op
 * @param {Record<string, any>} [overrides]
 * @returns {BoxMm}
 */
export function ghostBoxAtOrigin(op, overrides = {}) {
  const solid = evaluateOp(op, paramsForDrop(op, { x: 0, y: 0 }, overrides))
  const [minMm, maxMm] = boundsOf(solid)
  const [dx, dy, dz] = ghostOffsetMm(op, overrides)
  return {
    minMm: [minMm[0] + dx, minMm[1] + dy, minMm[2] + dz],
    maxMm: [maxMm[0] + dx, maxMm[1] + dy, maxMm[2] + dz],
  }
}

/**
 * How far the *built* geometry has to move to sit where a drop at the working
 * plane's origin would put it (`TODO/ui-030`).
 *
 * Zero on every three axes for a native op, because {@link paramsForDrop} has
 * already folded the placement into its `center` param — so the ghost mesh is
 * drawn exactly where its geometry was built. A composite carries no such param,
 * so its ghost geometry comes out at the recipe's own origin and the renderer has
 * to apply this offset to the mesh instead.
 *
 * Exported because the *preview* and the *commit* must agree: `TODO/ui-010`
 * established that both come from one `paramsForDrop`, and this is the same
 * promise extended to the one case params cannot express. A ghost drawn without
 * it would hover half-buried in the grid while the drop rested the part on top of
 * it — the preview lying about where the part lands.
 *
 * @param {string} op
 * @param {Record<string, any>} [overrides]
 * @returns {[number, number, number]} Millimetres, to be applied to the mesh.
 */
export function ghostOffsetMm(op, overrides = {}) {
  const row = libraryRow(op)
  if (row.kind !== 'composite') return [0, 0, 0]
  return restingOffsetMm(op, { ...row.defaults, ...overrides }, { x: 0, y: 0 })
}

/**
 * The same box, translated to a point on the working plane.
 *
 * X and Y only: a drop is a working-plane gesture, so the resting height the
 * origin box was measured with is exactly the height the ghost keeps.
 *
 * @param {BoxMm} originBox From {@link ghostBoxAtOrigin}.
 * @param {PointMm} pointMm
 * @param {BoxMm} out Mutated in place.
 * @returns {BoxMm} `out`
 */
export function boxAtPoint(originBox, pointMm, out) {
  out.minMm[0] = originBox.minMm[0] + pointMm.x
  out.maxMm[0] = originBox.maxMm[0] + pointMm.x
  out.minMm[1] = originBox.minMm[1] + pointMm.y
  out.maxMm[1] = originBox.maxMm[1] + pointMm.y
  out.minMm[2] = originBox.minMm[2]
  out.maxMm[2] = originBox.maxMm[2]
  return out
}

/**
 * How far past the two solids a guide line is drawn at each end, as a multiple
 * of the snap tolerance.
 *
 * Not cosmetic, and found by driving the app rather than by reasoning about it:
 * when the ghost snaps *centred* on the reference the two boxes coincide, so a
 * guide spanning only their union is a stub the length of the solid itself —
 * geometrically correct, buried under the solid, and invisible in practice. A
 * guide has to run visibly *past* what it aligns to read as a guide at all,
 * which is what every drafting and design tool draws.
 *
 * A multiple of the tolerance rather than a fixed millimetre length, so the
 * overhang is the same length on screen at every zoom level — the same reasoning
 * as {@link SNAP_TOLERANCE_PX} itself. One tolerance's worth: the line extends
 * by exactly the distance that counts as "close enough".
 */
const GUIDE_OVERHANG_RATIO = 1

/**
 * The gap between two extents on one axis, in millimetres — `0` when they
 * overlap (or merely touch), otherwise how far apart they are.
 *
 * This is what makes the assistance a *radius* rather than an infinite ruler.
 * See {@link updateSnap} for why that distinction is the whole design of it.
 *
 * @param {number} aMinMm
 * @param {number} aMaxMm
 * @param {number} bMinMm
 * @param {number} bMaxMm
 * @returns {number} Zero or positive.
 */
export function gapMm(aMinMm, aMaxMm, bMinMm, bMaxMm) {
  if (aMinMm > bMaxMm) return aMinMm - bMaxMm
  if (bMinMm > aMaxMm) return bMinMm - aMaxMm
  return 0
}

/**
 * Reset a snap state to "nothing to snap to".
 *
 * Called on an empty scene and at the end of every gesture — a guide left
 * standing after the drag that produced it would be pointing at an alignment
 * nothing is being aligned to any more.
 *
 * @param {SnapState} out Mutated in place.
 * @returns {SnapState} `out`
 */
export function clearSnap(out) {
  out.snapped = false
  out.dxMm = 0
  out.dyMm = 0
  for (const guide of out.guides) guide.visible = false
  return out
}

/**
 * Pull a dragged ghost into line with the nearest existing body, and describe
 * the guides that say why (`TODO/ui-013`, `Initial design.md` §7a).
 *
 * Each working-plane axis is decided **independently**: the ghost can snap in X
 * while staying wherever the pointer put it in Y, which is what makes the
 * assistance feel like guides rather than a magnet. Per axis, the five
 * {@link SNAP_ALIGNMENTS} are scored by how far they would move the ghost and
 * the smallest wins, provided it is within `toleranceMm` — inclusive at the
 * boundary, so "exactly at tolerance" snaps.
 *
 * ## The proximity gate, and why it is not optional
 *
 * An axis only snaps when the ghost is *also* within tolerance of the reference
 * on the **other** axis ({@link gapMm}). Without that gate, two solids at
 * opposite corners of the grid still share a Y coordinate to within a
 * millimetre or two whenever the drag happened to travel along X, and the drop
 * would be silently shifted by an alignment to something 400 mm away that the
 * user never had in mind. §7a asks for a snap "within a tolerance **radius** on
 * approach", and a radius is what this makes it: the assistance appears when the
 * ghost is genuinely near the item, not merely somewhere on one of its axes.
 *
 * The trade is deliberate and worth naming: this does **not** offer the
 * long-range "line these two up across the whole canvas" guide a 2D design tool
 * shows. Aligning two solids that are nowhere near each other is a precise,
 * deliberate operation with an operand order and an undo entry — `ui-026`'s
 * `group.snap`/`group.align` — not something a drag should do behind the user's
 * back.
 *
 * Z is deliberately not snapped: a placement drag projects onto the working
 * plane and carries no height information at all, so a ghost always rests on the
 * plane and there is nothing for a Z alignment to be measured against. Stacking
 * one solid on another is a *reposition*, which is `ui-026`'s
 * `group.snap`/`group.align` operation, not this drag's business.
 *
 * Allocation-free: everything is written into `out`, because this runs on every
 * `pointermove` of a drag (CLAUDE.md's Performance rule).
 *
 * @param {BoxMm} movingBox The ghost's box at the raw pointer position.
 * @param {BoxMm} referenceBox The nearest existing body's world bounding box.
 * @param {number} toleranceMm From {@link snapToleranceMm}; `0` disables snapping.
 * @param {SnapState} out Mutated in place.
 * @returns {SnapState} `out`
 */
export function updateSnap(movingBox, referenceBox, toleranceMm, out) {
  clearSnap(out)
  if (!(toleranceMm > 0)) return out

  for (let axis = 0; axis < 2; axis += 1) {
    const guide = out.guides[axis]
    // The proximity gate, measured on the *other* working-plane axis and against
    // the ghost's raw position — see this function's own note on why.
    const other = axis === 0 ? 1 : 0
    if (
      gapMm(
        movingBox.minMm[other],
        movingBox.maxMm[other],
        referenceBox.minMm[other],
        referenceBox.maxMm[other]
      ) > toleranceMm
    ) {
      continue
    }
    let bestOffset = 0
    let bestIndex = -1
    for (let index = 0; index < SNAP_ALIGNMENTS.length; index += 1) {
      const offset = alignmentOffsetMm(
        index,
        movingBox.minMm[axis],
        movingBox.maxMm[axis],
        referenceBox.minMm[axis],
        referenceBox.maxMm[axis]
      )
      // Strictly less, so an exact tie keeps the earlier — higher-preference —
      // alignment rather than whichever happened to be checked last.
      if (bestIndex !== -1 && !(Math.abs(offset) < Math.abs(bestOffset))) continue
      bestOffset = offset
      bestIndex = index
    }
    if (bestIndex === -1 || Math.abs(bestOffset) > toleranceMm) continue

    out.snapped = true
    guide.visible = true
    guide.kind = SNAP_ALIGNMENTS[bestIndex].kind
    const coordMm = alignmentCoordMm(
      bestIndex,
      referenceBox.minMm[axis],
      referenceBox.maxMm[axis]
    )
    if (axis === 0) {
      out.dxMm = bestOffset
      guide.x1Mm = coordMm
      guide.x2Mm = coordMm
    } else {
      out.dyMm = bestOffset
      guide.y1Mm = coordMm
      guide.y2Mm = coordMm
    }
  }

  // Spans are written after both axes are decided, because a guide runs along
  // the *other* axis and has to reach the ghost's snapped position, not its raw
  // one — otherwise the line stops short of the thing it is aligning.
  const overhangMm = toleranceMm * GUIDE_OVERHANG_RATIO
  for (let axis = 0; axis < 2; axis += 1) {
    const guide = out.guides[axis]
    if (!guide.visible) continue
    const along = axis === 0 ? 1 : 0
    const shift = along === 0 ? out.dxMm : out.dyMm
    const spanMin =
      Math.min(referenceBox.minMm[along], movingBox.minMm[along] + shift) - overhangMm
    const spanMax =
      Math.max(referenceBox.maxMm[along], movingBox.maxMm[along] + shift) + overhangMm
    if (axis === 0) {
      guide.y1Mm = spanMin
      guide.y2Mm = spanMax
    } else {
      guide.x1Mm = spanMin
      guide.x2Mm = spanMax
    }
    guide.zMm = referenceBox.minMm[2]
  }

  return out
}

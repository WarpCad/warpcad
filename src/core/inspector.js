/**
 * What the Inspector panel shows for the current selection.
 *
 * ## Why this is not inside `Inspector.vue`
 *
 * CLAUDE.md's registry-driven rule, the same one `src/core/library.js` answers
 * for the Library panel's rows: "read the registry, don't hardcode a list" is
 * the right instinct, and it produces a broken UI unless the registry itself
 * encodes what the UI needs to act on. A panel with one hand-written form per
 * primitive type would go stale the moment an eighth primitive is registered —
 * so the fields come from the op's own `ui.defaults` schema in the kernel
 * registry, plus whatever extra params the record actually carries, and the
 * component only lays out pixels.
 *
 * Framework-free (CLAUDE.md's Project Structure): no Vue, no DOM, no three.js.
 * `src/composables/useSelectedBody.js` is the thin reactive wrapper.
 *
 * ## Scope
 *
 * `TODO/ui-011` is display-only: this describes what a body currently *is*. It
 * deliberately provides no writer — editing a field and pushing a new record
 * back into the document is `ui-012`'s contract, and building half of it here
 * would leave two half-owners of the same behaviour.
 *
 * @module core/inspector
 */

import { recipeColorOf } from './colorOverride.js'
import { boundsOf, hiddenNamesOf, isGroup, localBoundsOf } from './kernel/group.js'
import { registry as defaultRegistry } from './kernel/registry.js'

/** @typedef {import('./document.js').Body} Body */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('./kernel/registry.js').RegistryEntry} RegistryEntry */
/** @typedef {[number, number, number]} Vec3Mm */

/**
 * Which named part **inside** a body the selection currently points at
 * (`TODO/ui-016`), as `src/stores/selection.js` holds it.
 *
 * @typedef {object} SubPartRef
 * @property {string} bodyId The body the depth belongs to. Checked against the
 *   actual selection before it is honoured, so a depth left behind by a
 *   multi-select describes nothing rather than the wrong thing.
 * @property {string} partName
 */

/**
 * @typedef {object} FieldComponent
 * @property {string} label Component name, e.g. `"X"` or `"A"`.
 * @property {number} value
 */

/**
 * @typedef {object} ParamField
 * @property {string} key Param name as the record stores it, e.g. `"innerDiameter"`.
 * @property {string} label Human label, e.g. `"Inner diameter"`.
 * @property {'number' | 'vector' | 'text'} kind
 * @property {string} unit `"mm"` for lengths, `""` for anything unitless.
 * @property {number | string} [value] Present on `number` and `text` fields.
 * @property {FieldComponent[]} [components] Present on `vector` fields.
 */

/**
 * @typedef {object} BodyDescription
 * @property {string} id The body's own id — the **group's** id even when this
 *   describes one part inside it, because that is still the only thing the
 *   document can be asked about. See {@link BodyDescription.subPart} for why
 *   nothing may write through it in that state.
 * @property {string} name
 * @property {string} op
 * @property {string} opLabel Registry `ui.label` where there is one, else the op.
 * @property {boolean} isRecipe True for a composite recipe — a ready-made
 *   catalogue part (`hardware.*`) rather than a primitive or an operation's
 *   result. `TODO/ui-030`: what the panel needs to explain *why* such a part's
 *   parameters are read-only, which is a different reason from a fillet having
 *   frozen them.
 * @property {ParamField[]} params The op's own schema — never position/rotation.
 * @property {Vec3Mm} positionMm Bounding-box centre of the **evaluated** solid.
 * @property {Vec3Mm} rotationDeg Degrees, per axis.
 * @property {Vec3Mm} sizeMm Overall **world-axis** bounding-box size — the
 *   solid's shadow on the grid. Equal to {@link BodyDescription.localSizeMm}
 *   until the body is rotated; after that it is the larger box the tilted part
 *   fits inside, which is what the gizmo sizes itself to clear.
 * @property {[Vec3Mm, Vec3Mm]} boundsMm `[min, max]`, world-axis-aligned.
 * @property {Vec3Mm} localSizeMm The part's **own** size, measured on its own
 *   axes — the numbers the dimension lines quote (`TODO/ui-023`).
 * @property {[Vec3Mm, Vec3Mm]} localBoundsMm `[min, max]` in the body's local
 *   frame, anchored at {@link BodyDescription.positionMm}: a local point maps
 *   back to world as `positionMm + R(rotationDeg)·(local − positionMm)`.
 * @property {string[]} hiddenParts Names of parts that exist in the body's group
 *   but are not drawn by default (`TODO/ui-047`) — a bolt's `tap`/`tap-*`, a
 *   washer's `clearance` — in the group's own `parts` insertion order, the exact
 *   same set `src/stores/document.js`'s `hiddenPartNames` already lists for the
 *   Objects list's ▸ disclosure. `[]` for a bare solid or a group with nothing
 *   hidden — the Inspector's **Hidden parts** section is absent, not disabled,
 *   whenever this is empty. Always `[]` on a description built by
 *   {@link describeSubPart}: drilling into one part already froze Transform and
 *   Parameters for the same reason (no record to target), and a part has no
 *   parts of its own to hide.
 * @property {string[]} visibleParts The mirror image of
 *   {@link BodyDescription.hiddenParts}: names of parts the group **does**
 *   draw by default, in the same group-order — literally the group's own
 *   `names` list (`TODO/ui-050`), not a re-derived one, so it can never drift
 *   from what `combine()`/`boundsOf()` actually union. Feeds the Inspector's
 *   Align-to-origin **Reference** dropdown, which offers one option per entry
 *   here plus "Whole object" — a hidden part is never offered, because
 *   `boundsOf()` already ignores it and nobody means "put the invisible
 *   clearance on the floor". `[]` for a bare solid (the select is hidden
 *   rather than showing a one-option dropdown) and always `[]` on a
 *   description built by {@link describeSubPart}, for the same reason
 *   {@link BodyDescription.hiddenParts} is.
 * @property {{ color: number, colorAlpha?: number }} [recipeColor] The recipe's
 *   own baked-in colour for whatever this description is *of* (`TODO/render-003`):
 *   the drilled-into part's colour from `describeSubPart`, or, from `describeBody`,
 *   the single visible part's colour when the body has exactly one — a group with
 *   more than one differently-coloured visible part (a bolt's gray head and
 *   silver thread) has no single "whole body" answer, so this is absent there.
 *   Absent whenever the recipe never coloured the part, or the body is not a
 *   composite recipe at all. This is what the Inspector's Color control shows as
 *   the swatch's un-overridden default, in place of the theme palette.
 * @property {{ groupName: string, partName: string }} [subPart] Present only
 *   while the selection is drilled into one named part of a group
 *   (`TODO/ui-016`). Its presence is the signal that **everything here is
 *   display-only**: `document.bodies()` exposes group-level ids only, so there
 *   is no record a `transform.*` op could target that means "just this part".
 *   A gizmo attached in this state would either throw on drag or silently move
 *   the whole group — breaking CLAUDE.md's "gizmo and numeric fields drive the
 *   same underlying transform" contract — so the UI hides the gizmo and freezes
 *   the Transform fields whenever this is set.
 */

/**
 * @typedef {object} SelectionDescription
 * @property {'empty' | 'single' | 'multi'} state
 * @property {number} count
 * @property {BodyDescription | null} body Only ever set in the `single` state.
 */

/**
 * Params that are never rendered as editable dimensions of the part.
 *
 * `center` is the body's *position* — it belongs to the Transform section, and
 * showing it twice under two different names would let a user edit one and
 * wonder why the other disagreed. `segments` is a tessellation detail: changing
 * it alters how finely a curve is approximated, not how big the part is.
 */
const HIDDEN_PARAMS = Object.freeze(new Set(['center', 'segments']))

/**
 * Component labels for vector params, keyed by param name rather than by op — so
 * a new op reusing `size` gets axis labels for free, and one reusing `sides`
 * gets edge labels.
 *
 * `size` really is an X/Y/Z extent. `sides` is a triangle's three edge lengths,
 * which are *not* axes: labelling them X/Y/Z would be a lie on screen.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
const VECTOR_COMPONENT_LABELS = Object.freeze({
  size: Object.freeze(['X', 'Y', 'Z']),
  sides: Object.freeze(['A', 'B', 'C']),
})

/** Fallback component labels for a vector param nothing knows the shape of. */
const NUMBERED_COMPONENT_LABELS = Object.freeze(['1', '2', '3', '4'])

/**
 * Param names whose plain camel-case split reads wrong.
 * @type {Readonly<Record<string, string>>}
 */
const PARAM_LABEL_OVERRIDES = Object.freeze({
  sides: 'Side lengths',
})

/** Params measured in millimetres. Anything else carries no unit. */
const MM_PARAMS = Object.freeze(
  new Set(['size', 'sides', 'diameter', 'innerDiameter', 'topDiameter', 'height', 'length'])
)

/**
 * `innerDiameter` → `"Inner diameter"`. One capital word, the rest lower case —
 * sentence case, which is what every other label in this UI uses.
 *
 * @param {string} key
 * @returns {string}
 */
export function labelForParam(key) {
  if (PARAM_LABEL_OVERRIDES[key]) return PARAM_LABEL_OVERRIDES[key]
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Turn one param value into a field descriptor.
 *
 * @param {string} key
 * @param {unknown} value
 * @returns {ParamField | null} `null` for a value with no sensible field —
 *   an object, a nested array — rather than rendering `[object Object]`.
 */
function fieldFor(key, value) {
  const unit = MM_PARAMS.has(key) ? 'mm' : ''
  const label = labelForParam(key)

  if (Array.isArray(value)) {
    const labels = VECTOR_COMPONENT_LABELS[key] ?? NUMBERED_COMPONENT_LABELS
    const components = value.map((entry, index) => ({
      label: labels[index] ?? String(index + 1),
      value: typeof entry === 'number' ? entry : Number.NaN,
    }))
    if (components.some((component) => !Number.isFinite(component.value))) return null
    return { key, label, kind: 'vector', unit, components }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { key, label, kind: 'number', unit, value }
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return { key, label, kind: 'text', unit: '', value: String(value) }
  }
  return null
}

/**
 * The op's field list: the registry schema's own key order first — that is the
 * order a user of the op expects to read them in, and it is stable — then any
 * extra param the record actually carries.
 *
 * The second half matters: a cone with a `topDiameter` is a frustum, and the
 * registry's `defaults` do not mention `topDiameter` at all. A schema read from
 * `defaults` alone would silently hide a value that is genuinely shaping the
 * solid on screen.
 *
 * @param {Record<string, any>} params The record's own params.
 * @param {RegistryEntry | undefined} entry
 * @returns {ParamField[]}
 */
function fieldsFor(params, entry) {
  const schemaKeys = entry?.ui?.defaults ? Object.keys(entry.ui.defaults) : []
  /** @type {string[]} */
  const keys = []
  for (const key of schemaKeys) {
    if (!HIDDEN_PARAMS.has(key) && !keys.includes(key)) keys.push(key)
  }
  for (const key of Object.keys(params)) {
    if (!HIDDEN_PARAMS.has(key) && !keys.includes(key)) keys.push(key)
  }

  /** @type {ParamField[]} */
  const fields = []
  for (const key of keys) {
    const value = params[key] ?? entry?.ui?.defaults?.[key]
    const field = fieldFor(key, value)
    if (field) fields.push(field)
  }
  return fields
}

/**
 * Rotation currently applied to a body, in degrees.
 *
 * `ui-011` built this as a seam returning `[0, 0, 0]` — a real measurement at the
 * time, since nothing in the registry could rotate a solid. `ui-012` made it
 * real: a rotated solid's polygons carry no memory of the angle that produced
 * them, so the absolute rotation rides along on each transform record's params
 * and `document.js` surfaces the terminal record's copy as `Body.rotationDeg`.
 * See `src/core/transform.js` for why it is carried rather than re-derived.
 *
 * The `params.rotation` fallback stays for a body whose *creation* record carried
 * a rotation directly — a composite recipe's output, or a loaded document.
 *
 * @param {Body} body
 * @returns {Vec3Mm} Degrees per axis.
 */
export function rotationOf(body) {
  const carried = body.rotationDeg
  if (Array.isArray(carried) && carried.length === 3 && carried.every(Number.isFinite)) {
    return [carried[0], carried[1], carried[2]]
  }
  const rotation = body.params?.rotation
  if (Array.isArray(rotation) && rotation.length === 3 && rotation.every(Number.isFinite)) {
    return [rotation[0], rotation[1], rotation[2]]
  }
  return [0, 0, 0]
}

/**
 * Describe one body for the Inspector and the viewport's dimension lines.
 *
 * Position and size come off the **evaluated geometry**, not off the record's
 * `center` param, and the difference is visible: a cylinder dropped on the grid
 * has `center.z` equal to half its height, and a body moved by a later
 * `transform.translate` record has a `center` param that no longer says where it
 * is at all. The Transform section has to show where the solid actually is.
 *
 * @param {Body} body From `document.bodies()`.
 * @param {Readonly<Record<string, RegistryEntry>>} [ops] Catalogue; the real one
 *   by default. A test passes a fake (CLAUDE.md: "always mock at the boundary").
 * @returns {BodyDescription}
 */
export function describeBody(body, ops = defaultRegistry) {
  const entry = ops[body.op]
  const [min, max] = boundsOf(body.geometry)
  /** @type {Vec3Mm} */
  const positionMm = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const rotationDeg = rotationOf(body)
  // The part's own size, on its own axes (`TODO/ui-023`). Anchored at
  // `positionMm` so the dimension lines can map a local corner straight back
  // into world space without needing a second pivot from anywhere else.
  const [localMin, localMax] = localBoundsOf(body.geometry, rotationDeg, positionMm)
  // Whole-body recipe colour (`TODO/render-003`): only defensible when there is
  // exactly one visible part, since that is the only case where "the whole
  // body's colour" and "that one part's colour" are the same claim.
  const geometry = body.geometry
  const recipeColor =
    isGroup(geometry) && geometry.names.length === 1
      ? recipeColorOf(geometry.colors, geometry.names[0])
      : undefined
  const hiddenParts = isGroup(geometry) ? [...hiddenNamesOf(geometry)] : []
  // The exact list `boundsOf()`/`combine()` union by default — see this
  // field's own doc comment on why it is that list itself, not a re-derived
  // one (`TODO/ui-050`).
  const visibleParts = isGroup(geometry) ? [...geometry.names] : []

  return {
    id: body.id,
    name: body.name,
    op: body.op,
    opLabel: entry?.ui?.label ?? body.op,
    isRecipe: entry?.kind === 'composite',
    params: fieldsFor(body.params ?? {}, entry),
    positionMm,
    rotationDeg,
    hiddenParts,
    visibleParts,
    sizeMm: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    boundsMm: [
      [min[0], min[1], min[2]],
      [max[0], max[1], max[2]],
    ],
    localSizeMm: [
      localMax[0] - localMin[0],
      localMax[1] - localMin[1],
      localMax[2] - localMin[2],
    ],
    localBoundsMm: [
      [localMin[0], localMin[1], localMin[2]],
      [localMax[0], localMax[1], localMax[2]],
    ],
    ...(recipeColor ? { recipeColor } : {}),
  }
}

/**
 * Walk a record id back to the **creation** record of its lineage.
 *
 * A grouping record's `consumes` names each operand by its *current* id, which
 * for a body that has been moved is a `transform.translate` record — whose op
 * and params describe the move, not the part. Following `supersedes` back to the
 * record that started the lineage is what recovers "this was a 40 mm cube",
 * which is the only thing worth showing in a sub-part's Parameters section.
 *
 * Defensive against a cycle it should never see: a malformed document must
 * degrade to a bounds-only description, not hang the panel.
 *
 * @param {string} id
 * @param {Map<string, OpRecord>} byId
 * @returns {OpRecord | undefined}
 */
function creationRecordOf(id, byId) {
  let record = byId.get(id)
  const visited = new Set()
  while (record?.supersedes !== undefined && !visited.has(record.supersedes)) {
    visited.add(record.supersedes)
    const previous = byId.get(record.supersedes)
    if (!previous) break
    record = previous
  }
  return record
}

/**
 * `partName → the record that built it`, for a group produced by
 * `group.assemble` — **case 1** of this task's two param-recovery cases.
 *
 * `group.assemble` writes `consumes: [id, …]` and `params.names: [name, …]` in
 * the same order (`OperationsToolbar.vue`'s `run()`), and `document.js` keeps
 * every consumed record in `entries` even though `bodies()` stops reporting it —
 * so zipping the two and walking each id back to its creation record recovers
 * each part's real op and params.
 *
 * **Case 2** — a group whose parts came from a composite recipe's own internal
 * expansion (`kit.board`, `kit.boardFrame`, `kit.anchor`, and any future one) —
 * has no `consumes` to zip, because nothing top-level was consumed to build it.
 * This returns an empty map there, and the caller falls back to describing the
 * part by name and measurement alone. That mirrors `group.assemble`'s own stated
 * scope limit on nested composite operands, one layer further out.
 *
 * @param {Body} body
 * @param {readonly OpRecord[]} records The document's records, in order.
 * @returns {Map<string, OpRecord>}
 */
function partRecordsFor(body, records) {
  /** @type {Map<string, OpRecord>} */
  const byPart = new Map()
  if (records.length === 0) return byPart

  /** @type {Map<string, OpRecord>} */
  const byId = new Map()
  for (const record of records) {
    if (record.id !== undefined) byId.set(record.id, record)
  }

  const root = byId.get(body.id)
  const consumed = root?.consumes
  const names = root?.params?.names
  if (!Array.isArray(consumed) || !Array.isArray(names)) return byPart
  for (let index = 0; index < names.length && index < consumed.length; index += 1) {
    const record = creationRecordOf(consumed[index], byId)
    if (record) byPart.set(String(names[index]), record)
  }
  return byPart
}

/**
 * Describe one named part inside a Group-valued body (`TODO/ui-016`).
 *
 * Measured off the part's own solid rather than the group's combined one, which
 * is the entire visible point: the dimension lines and the Size row have to
 * shrink to the part a user just clicked, not keep quoting the assembly.
 *
 * @param {Body} body A body whose `geometry` is a Group.
 * @param {string} partName
 * @param {readonly OpRecord[]} records
 * @param {Readonly<Record<string, RegistryEntry>>} ops
 * @returns {BodyDescription}
 * @throws {Error} When the group has no such part — the same contract
 *   `group.js`'s own `pick()` has, and for the same reason: a silent empty
 *   description would read on screen as a body that lost its geometry.
 */
export function describeSubPart(body, partName, records, ops = defaultRegistry) {
  const group = body.geometry
  if (!isGroup(group)) {
    throw new Error(`describeSubPart: body "${body.id}" is not a group, it has no part "${partName}"`)
  }
  const part = group.parts[partName]
  if (!part) {
    throw new Error(
      `describeSubPart: no part named "${partName}" in body "${body.id}" ` +
        `(parts: ${Object.keys(group.parts).join(',') || 'none'})`
    )
  }

  const record = partRecordsFor(body, records).get(partName)
  const entry = record ? ops[record.op] : undefined
  const [min, max] = boundsOf(part)
  /** @type {Vec3Mm} */
  const positionMm = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  // The whole group's carried rotation: every part was turned with it, so the
  // part's own local frame is the group's frame (`core-004`'s composed triple).
  const rotationDeg = rotationOf(body)
  const [localMin, localMax] = localBoundsOf(part, rotationDeg, positionMm)
  const recipeColor = recipeColorOf(group.colors, partName)

  return {
    id: body.id,
    name: partName,
    // Case 2 leaves both blank rather than borrowing the group's own op, which
    // would claim on screen that this part *is* a `kit.board`.
    op: record?.op ?? '',
    opLabel: entry?.ui?.label ?? (record ? record.op : 'Part'),
    // A sub-part is a primitive inside a recipe's expansion, never a recipe
    // itself — and its params are frozen for `ui-016`'s own reason (no record of
    // its own to target), not for `ui-030`'s.
    isRecipe: false,
    params: record ? fieldsFor(record.params ?? {}, entry) : [],
    positionMm,
    rotationDeg,
    hiddenParts: [],
    visibleParts: [],
    sizeMm: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    boundsMm: [
      [min[0], min[1], min[2]],
      [max[0], max[1], max[2]],
    ],
    localSizeMm: [
      localMax[0] - localMin[0],
      localMax[1] - localMin[1],
      localMax[2] - localMin[2],
    ],
    localBoundsMm: [
      [localMin[0], localMin[1], localMin[2]],
      [localMax[0], localMax[1], localMax[2]],
    ],
    subPart: { groupName: body.name, partName },
    ...(recipeColor ? { recipeColor } : {}),
  }
}

/**
 * Describe a whole selection — the state machine
 * `docs/decisions/interaction-model-qa.md` control 3 Q15 specifies.
 *
 * - **0 selected** → the Inspector's empty state.
 * - **exactly 1** → the full contract: params, transform, gizmo, dimension lines.
 * - **2+** → no per-item fields. There is no single object to describe, and
 *   CLAUDE.md gates single-object tools on selection *count*, not presence. The
 *   `body` is `null` rather than left at the previous single selection, which is
 *   what stops a stale set of fields describing something the user is no longer
 *   looking at.
 *
 * A selected id the document no longer holds resolves to the empty state rather
 * than throwing: a panel that crashes on a stale id takes the whole app with it.
 *
 * A `subPart` narrows the `single` state to one named part of a Group-valued
 * body (`TODO/ui-016`) — but only one whose `bodyId` really is the single
 * selected body. A depth left pointing somewhere else (a Shift-click grew the
 * selection and shrank it back, a stale id) falls straight back to the
 * whole-body description rather than throwing or describing a part of something
 * the user is no longer looking at.
 *
 * @param {readonly Body[]} bodies Every body currently in the document.
 * @param {readonly string[]} selectedIds
 * @param {object} [options]
 * @param {SubPartRef | null} [options.subPart] Active pick depth, if any.
 * @param {readonly OpRecord[]} [options.records] The document's records, needed
 *   only to recover a sub-part's own op/params (case 1). Without them a
 *   sub-part is still described, by name and measurement alone.
 * @param {Readonly<Record<string, RegistryEntry>>} [options.ops] Catalogue; the
 *   real one by default. A test passes a fake (CLAUDE.md: "mock at the boundary").
 * @returns {SelectionDescription}
 */
export function describeSelection(bodies, selectedIds, options = {}) {
  const ops = options.ops ?? defaultRegistry
  if (selectedIds.length >= 2) {
    return { state: 'multi', count: selectedIds.length, body: null }
  }
  if (selectedIds.length === 1) {
    const body = bodies.find((candidate) => candidate.id === selectedIds[0])
    if (body) {
      const subPart = options.subPart
      if (subPart && subPart.bodyId === body.id) {
        return {
          state: 'single',
          count: 1,
          body: describeSubPart(body, subPart.partName, options.records ?? [], ops),
        }
      }
      return { state: 'single', count: 1, body: describeBody(body, ops) }
    }
  }
  return { state: 'empty', count: 0, body: null }
}

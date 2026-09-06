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

import { boundsOf } from './kernel/group.js'
import { registry as defaultRegistry } from './kernel/registry.js'

/** @typedef {import('./document.js').Body} Body */
/** @typedef {import('./kernel/registry.js').RegistryEntry} RegistryEntry */
/** @typedef {[number, number, number]} Vec3Mm */

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
 * @property {string} id
 * @property {string} name
 * @property {string} op
 * @property {string} opLabel Registry `ui.label` where there is one, else the op.
 * @property {ParamField[]} params The op's own schema — never position/rotation.
 * @property {Vec3Mm} positionMm Bounding-box centre of the **evaluated** solid.
 * @property {Vec3Mm} rotationDeg Degrees, per axis.
 * @property {Vec3Mm} sizeMm Overall bounding-box size.
 * @property {[Vec3Mm, Vec3Mm]} boundsMm `[min, max]`, what the dimension lines measure.
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
 * Zero for every body today, and that is a real measurement rather than a
 * placeholder: nothing in the registry can rotate a solid yet
 * (`transform.rotate` does not exist), so every placed body genuinely is
 * unrotated. It is a named function rather than a literal so `ui-012` — which
 * introduces the rotate op and the gizmo drag that drives it — has one place to
 * make it real, instead of hunting for a `[0, 0, 0]` buried in a component.
 *
 * @param {Body} body
 * @returns {Vec3Mm} Degrees per axis.
 */
export function rotationOf(body) {
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

  return {
    id: body.id,
    name: body.name,
    op: body.op,
    opLabel: entry?.ui?.label ?? body.op,
    params: fieldsFor(body.params ?? {}, entry),
    positionMm: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    rotationDeg: rotationOf(body),
    sizeMm: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    boundsMm: [
      [min[0], min[1], min[2]],
      [max[0], max[1], max[2]],
    ],
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
 * @param {readonly Body[]} bodies Every body currently in the document.
 * @param {readonly string[]} selectedIds
 * @param {Readonly<Record<string, RegistryEntry>>} [ops]
 * @returns {SelectionDescription}
 */
export function describeSelection(bodies, selectedIds, ops = defaultRegistry) {
  if (selectedIds.length >= 2) {
    return { state: 'multi', count: selectedIds.length, body: null }
  }
  if (selectedIds.length === 1) {
    const body = bodies.find((candidate) => candidate.id === selectedIds[0])
    if (body) return { state: 'single', count: 1, body: describeBody(body, ops) }
  }
  return { state: 'empty', count: 0, body: null }
}

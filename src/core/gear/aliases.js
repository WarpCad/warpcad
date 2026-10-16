// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The gear param alias table — how a record written in V1's vocabulary (or the TODO's
 * `module` shorthand) becomes WarpCad's canonical gear params (TODO/core-041).
 *
 * `docs/decisions/gears.md` Decision 2 fixes the canonical names (`teeth`, `moduleMm`,
 * `pressureAngleDeg`, `profileShift`, `clearanceMm`, `backlashMm`); this module is the one
 * place another spelling is accepted, so `gear.spur` and the later gear recipes never
 * re-derive it. It converts **values** where the meaning differs, not only names:
 *
 * | V1 name | Becomes | Conversion |
 * |---|---|---|
 * | `toothCount` | `teeth` | V1's sign was the kind (Decision 5, defect 3): positive on `gear.spur`, negative on `gear.ring` (`teeth = −toothCount`), 0 on `gear.rack` (`teeth = 41`, the count V1 always built); the wrong sign for the op is refused by name (TODO/core-043) |
 * | `circularPitch` | `moduleMm` | `cp / π` |
 * | `diametralPitch` | `moduleMm` | `1 / dp` — V1's value is 1/module in 1/mm, **not** teeth per inch (defect 7) |
 * | `centerHoleDiameter` | `boreMm` | as is |
 * | `clearance` | `clearanceMm` | as is; **0 when omitted** from a V1-vocabulary record, V1's own default (call 5) |
 * | `backlash` | `backlashMm` | `2 · b / cos α` (call 4), α the record's `pressureAngleDeg`, default 20 — on a rack `b / cos α`, since V1's rack thinned by half what its gears did (defect 8) |
 * | `profileShift` | `profileShift` | as is — the same name and meaning in both |
 *
 * Two non-V1 spellings name a helical gear's module explicitly (TODO/core-042), because
 * `moduleMm` on a helical gear is the **normal** module (`./helix.js`):
 *
 * | Name | Becomes | Conversion |
 * |---|---|---|
 * | `normalModuleMm` | `moduleMm` | as is |
 * | `transverseModuleMm` | `moduleMm` | `mₜ · cos β`, β the record's `helixAngleDeg` (default 0) |
 *
 * Refused or dropped, each by a stated reason rather than as "unknown":
 *
 * - **`pressureAngle`** (V1) — refused. V1 really cuts at `atan(sin α)`, and whether an
 *   import keeps V1's number or converts it to reproduce the printed shape is a decision
 *   `docs/decisions/gears.md`'s core-040 addendum leaves to the importer task. Mapping it
 *   either way here would take that decision silently; write `pressureAngleDeg` instead.
 * - **`qualitySettings`** (V1) — dropped with a note: resolution belongs to the document
 *   (Decision 4).
 * - **`center`** — refused: a composite is placed by the Library's trailing
 *   `transform.translate` (`src/core/library.js`'s `recordsForDrop`).
 * - **`connectedGear`** (V1) — refused: V1's ring could not exist without the pinion that
 *   cut it (defect 10); a WarpCad ring is defined by its own params (TODO/core-043).
 *
 * Framework-free and kernel-free: no Vue, no DOM, no `@jscad/modeling`.
 *
 * @module core/gear/aliases
 */

import {
  GearParameterError,
  circularPitchMmToModuleMm,
  v1BacklashToBacklashMm,
  v1DiametralPitchToModuleMm,
  v1RackBacklashToBacklashMm,
} from './dimensions.js'
import { normalModuleMm } from './helix.js'

/**
 * Why a param could not be read.
 *
 * @typedef {'not-an-object' | 'unknown-param' | 'center' | 'pressure-angle-undecided'
 *   | 'conflict' | 'external-gear' | 'internal-gear' | 'rack' | 'connected-gear' | 'not-finite'} GearAliasErrorCode
 */

/** @typedef {'external' | 'internal' | 'rack'} GearKind */

/** A param a gear op cannot accept under any spelling, with a message safe to show as-is. */
export class GearAliasError extends GearParameterError {
  /**
   * @param {string} message
   * @param {GearAliasErrorCode} code
   * @param {string} [param] The param as the record spelled it.
   */
  constructor(message, code, param) {
    super(message)
    this.name = 'GearAliasError'
    /** @type {GearAliasErrorCode} */
    this.code = code
    /** @type {string | undefined} */
    this.param = param
  }
}

/**
 * @typedef {object} GearAlias
 * @property {string} to The canonical param it becomes.
 * @property {string} note What changes on the way, for a reader of the table.
 */

/**
 * V1's names (`@jwc/jscad-gears` 2.0.0's `Gear` options) and what each becomes. See the
 * module doc for the conversions; the code below applies them.
 *
 * @type {Readonly<Record<'toothCount' | 'circularPitch' | 'diametralPitch' | 'centerHoleDiameter' | 'clearance' | 'backlash' | 'profileShift', Readonly<GearAlias>>>}
 */
export const V1_GEAR_ALIASES = Object.freeze({
  toothCount: Object.freeze({ to: 'teeth', note: 'its sign is the kind: positive spur, negative ring (teeth = −toothCount), 0 rack (teeth = 41)' }),
  circularPitch: Object.freeze({ to: 'moduleMm', note: 'circularPitch / π' }),
  diametralPitch: Object.freeze({ to: 'moduleMm', note: '1 / diametralPitch — V1’s value is per mm, not per inch' }),
  centerHoleDiameter: Object.freeze({ to: 'boreMm', note: 'as is' }),
  clearance: Object.freeze({ to: 'clearanceMm', note: 'as is; 0 when a V1 record omits it' }),
  backlash: Object.freeze({ to: 'backlashMm', note: '2 · backlash / cos(pressureAngleDeg); backlash / cos(pressureAngleDeg) on a rack' }),
  profileShift: Object.freeze({ to: 'profileShift', note: 'as is — the same name in both vocabularies' }),
})

/**
 * Non-V1 spellings accepted for convenience — the TODO's own `module`, and a helical
 * gear's two named modules (TODO/core-042).
 *
 * @type {Readonly<Record<'module' | 'normalModuleMm' | 'transverseModuleMm', Readonly<GearAlias>>>}
 */
export const SHORTHAND_GEAR_ALIASES = Object.freeze({
  module: Object.freeze({ to: 'moduleMm', note: 'as is' }),
  normalModuleMm: Object.freeze({ to: 'moduleMm', note: 'as is — a helical gear’s moduleMm is its normal module' }),
  transverseModuleMm: Object.freeze({ to: 'moduleMm', note: 'transverseModuleMm · cos(helixAngleDeg)' }),
})

/** V1 names whose presence marks a record as V1 vocabulary (`profileShift` is shared). */
const V1_ONLY = new Set(['toothCount', 'circularPitch', 'diametralPitch', 'centerHoleDiameter', 'clearance', 'backlash'])

const V1_DEFAULT_PRESSURE_ANGLE_DEG = 20

/** V1's rack always had this many teeth (`_createRackShape`, defect 2). */
const V1_RACK_TEETH = 41

/**
 * What each V1 `toothCount` sign meant, the code a wrong one is refused with, and the op
 * that does take it.
 *
 * @type {Readonly<Record<GearKind, Readonly<{ code: GearAliasErrorCode, what: string, op: string }>>>}
 */
const V1_KINDS = Object.freeze({
  external: Object.freeze({ code: /** @type {GearAliasErrorCode} */ ('external-gear'), what: 'a positive toothCount was V1’s external gear', op: 'gear.spur' }),
  internal: Object.freeze({ code: /** @type {GearAliasErrorCode} */ ('internal-gear'), what: 'a negative toothCount was V1’s internal gear', op: 'gear.ring' }),
  rack: Object.freeze({ code: /** @type {GearAliasErrorCode} */ ('rack'), what: 'toothCount 0 was V1’s rack', op: 'gear.rack' }),
})

/**
 * @param {Record<string, unknown>} params
 * @param {string} key
 */
const own = (params, key) => Object.prototype.hasOwnProperty.call(params, key)

/**
 * @param {unknown} value
 * @param {string} name
 * @param {string} op
 * @returns {number}
 */
function finiteAlias(value, name, op) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GearAliasError(`${op}: ${name} must be a finite number, got ${String(value)}`, 'not-finite', name)
  }
  return value
}

/**
 * Rewrite a gear record's params into canonical names, applying the alias table.
 *
 * Canonical params pass through unchanged (their values are checked later, by
 * `./limits.js`); an alias is converted; anything else is a {@link GearAliasError}.
 * Two spellings of one param (`module` and `moduleMm`) are refused, never resolved.
 *
 * @param {Record<string, unknown>} params The record's `params`; never mutated.
 * @param {{ op: string, canonical: readonly string[], kind?: GearKind }} options `op`
 *   prefixes every message; `canonical` is the op's own param list; `kind` (default
 *   `'external'`) is which V1 `toothCount` sign the op takes.
 * @returns {{ params: Record<string, unknown>, notes: string[] }} `notes` says what was
 *   dropped or defaulted on the way, for an importer to show.
 * @throws {GearAliasError}
 */
export function resolveGearAliases(params, { op, canonical, kind = 'external' }) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new GearAliasError(`${op}: params must be an object`, 'not-an-object')
  }
  // Before anything else: a V1 ring record would otherwise be refused for its toothCount
  // sign first, and the real reason — it names the pinion that cut it — never shown.
  if (own(params, 'connectedGear')) {
    throw new GearAliasError(
      `${op}: connectedGear is not a gear param — a gear is defined by its own params and meshes with any ` +
        `gear of the same module; place the mating gear as its own part`,
      'connected-gear',
      'connectedGear'
    )
  }
  const accepted = new Set(canonical)
  /** @type {Record<string, unknown>} */
  const out = {}
  /** @type {Record<string, string>} where each canonical param came from */
  const source = {}
  /** @type {string[]} */
  const notes = []
  let v1 = false

  /**
   * @param {string} to
   * @param {unknown} value
   * @param {string} from
   */
  const put = (to, value, from) => {
    if (own(source, to)) {
      throw new GearAliasError(
        `${op}: ${from} and ${source[to]} both set ${to} — give one of them`,
        'conflict',
        from
      )
    }
    source[to] = from
    out[to] = value
  }

  /** @type {[string, unknown][]} V1 backlash and a transverse module wait for their angle */
  const deferred = []
  for (const key of Object.keys(params)) {
    const value = params[key]
    if (accepted.has(key)) {
      put(key, value, key)
      continue
    }
    if (key === 'center') {
      throw new GearAliasError(
        `${op}: center is not a gear param — a composite is placed by a trailing transform.translate`,
        'center',
        key
      )
    }
    if (key === 'pressureAngle') {
      throw new GearAliasError(
        `${op}: V1 pressureAngle is not mapped yet — V1 cuts at atan(sin α), and whether an import ` +
          `keeps the number or converts it is the importer’s decision; write pressureAngleDeg instead`,
        'pressure-angle-undecided',
        key
      )
    }
    if (key === 'qualitySettings') {
      notes.push('qualitySettings was dropped: resolution comes from the document, not the gear')
      continue
    }
    if ((key === 'module' || key === 'normalModuleMm') && accepted.has('moduleMm')) {
      put('moduleMm', value, key)
      continue
    }
    if (key === 'transverseModuleMm' && accepted.has('moduleMm')) {
      deferred.push([key, finiteAlias(value, key, op)])
      continue
    }
    if (!own(V1_GEAR_ALIASES, key) || !accepted.has(V1_GEAR_ALIASES[/** @type {keyof typeof V1_GEAR_ALIASES} */ (key)].to)) {
      throw new GearAliasError(
        `${op}: unknown param ${key} — expected ${[...canonical].join(', ')} ` +
          `(or V1’s ${Object.keys(V1_GEAR_ALIASES).join(', ')})`,
        'unknown-param',
        key
      )
    }
    if (V1_ONLY.has(key)) v1 = true
    switch (key) {
      case 'toothCount': {
        const n = finiteAlias(value, key, op)
        /** @type {GearKind} */
        const v1Kind = n < 0 ? 'internal' : n === 0 ? 'rack' : 'external'
        if (v1Kind !== kind) {
          const { code, what, op: takes } = V1_KINDS[v1Kind]
          throw new GearAliasError(`${op}: ${what} — that is ${takes}, not ${op}`, code, key)
        }
        if (v1Kind === 'rack') {
          put('teeth', V1_RACK_TEETH, key)
          notes.push(`toothCount 0 was V1’s rack, which always had ${V1_RACK_TEETH} teeth, so teeth is ${V1_RACK_TEETH}`)
        } else {
          put('teeth', Math.abs(n), key)
        }
        break
      }
      case 'circularPitch':
        put('moduleMm', circularPitchMmToModuleMm(finiteAlias(value, key, op)), key)
        break
      case 'diametralPitch':
        put('moduleMm', v1DiametralPitchToModuleMm(finiteAlias(value, key, op)), key)
        break
      case 'centerHoleDiameter':
        put('boreMm', finiteAlias(value, key, op), key)
        break
      case 'clearance':
        put('clearanceMm', finiteAlias(value, key, op), key)
        break
      case 'backlash':
        deferred.push([key, finiteAlias(value, key, op)])
        break
      default:
        // profileShift: same name, same meaning — only reachable if an op leaves it out of
        // its canonical list, which none does.
        put(V1_GEAR_ALIASES[/** @type {keyof typeof V1_GEAR_ALIASES} */ (key)].to, value, key)
    }
  }

  for (const [key, value] of deferred) {
    if (key === 'transverseModuleMm') {
      // A hostile helix angle is left for `./limits.js` to name; converting through 0 here
      // only keeps this step from producing a NaN first.
      const helix = out.helixAngleDeg
      const helixDeg = typeof helix === 'number' && Number.isFinite(helix) ? helix : 0
      put('moduleMm', normalModuleMm(/** @type {number} */ (value), helixDeg), key)
      continue
    }
    const angle = out.pressureAngleDeg ?? V1_DEFAULT_PRESSURE_ANGLE_DEG
    const angleDeg = typeof angle === 'number' && Number.isFinite(angle) ? angle : V1_DEFAULT_PRESSURE_ANGLE_DEG
    const convert = kind === 'rack' ? v1RackBacklashToBacklashMm : v1BacklashToBacklashMm
    put('backlashMm', convert(/** @type {number} */ (value), angleDeg), key)
  }

  if (v1 && accepted.has('clearanceMm') && !own(out, 'clearanceMm')) {
    out.clearanceMm = 0
    notes.push('clearance was omitted, so it is 0 as in V1 (not the ISO 0.25 module a new gear gets)')
  }

  return { params: out, notes }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the Library remembers about a part between drags (`TODO/ui-068`): the params the user
 * last committed for each parametric row, validated every time they are read.
 *
 * Pure and framework-free. This module owns the *rules* — which params count, how a stored
 * set is merged over a row's registry defaults, and what happens when a stored value has gone
 * stale — and knows nothing about storage. `src/stores/libraryDefaults.js` owns the
 * `localStorage` boundary and the Reset button's state; `LibraryPanel.vue` only renders.
 *
 * ## Why validated on every read
 *
 * A stored set can go stale without anyone touching it: a size is removed from a table, a
 * user part is deleted or loses an exposed param, a dependent option list changes (a bolt's
 * Fit comes from its Type and Size). A remembered set is therefore never handed to
 * `placement.begin` as stored. {@link effectiveDefaultsFor} merges it over the row's defaults,
 * reconciles the dependent values through the registry (`reconcileParamEdit`, the same path a
 * Type change in the Inspector takes), checks the result against `paramOptions` — the check
 * `paramEdit.js` applies to an edit — and discards the whole set if it still does not hold.
 * Nothing is ever dragged in that `evaluateOp` would refuse.
 *
 * @module core/libraryDefaults
 */

import { normalizedParams, paramOptions, reconcileParamEdit } from './kernel/registry.js'
import { isBinding, resolveParams } from './variables.js'

/**
 * @typedef {object} DefaultsOptions
 * @property {(op: string, params: Record<string, any>) => Readonly<Record<string, import('./kernel/registry.js').ParamSchema>>} [schemaFn]
 *   The op's Inspector schema; a spec passes a fake (CLAUDE.md: mock at the boundary).
 * @property {(op: string, params: Record<string, any>, changedKeys: readonly string[]) => Record<string, any>} [reconcileFn]
 *   Brings dependent values back in line; a spec passes the identity.
 */

/**
 * Whether `value` is acceptable for `field`.
 *
 * @param {import('./kernel/registry.js').ParamSchema} field
 * @param {unknown} value
 * @returns {boolean}
 */
function fieldAccepts(field, value) {
  if (field.kind === 'enum') return field.options.some((option) => Object.is(option.value, value))
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  if (field.exclusiveMin !== undefined && !(value > field.exclusiveMin)) return false
  if (field.min !== undefined && value < field.min) return false
  if (field.max !== undefined && value > field.max) return false
  return true
}

/**
 * The keys of `params` that the schema describes but whose value it would refuse.
 *
 * @param {string} op
 * @param {Record<string, any>} params
 * @param {NonNullable<DefaultsOptions['schemaFn']>} schemaFn
 * @returns {string[]}
 */
function invalidKeys(op, params, schemaFn) {
  const schema = schemaFn(op, params)
  return Object.keys(schema).filter((key) => key in params && !fieldAccepts(schema[key], params[key]))
}

/**
 * The params a drag from `row` starts with: the row's registry defaults, with whatever the
 * user last committed laid over them where it is still valid.
 *
 * - a key the schema does not describe is dropped;
 * - a dependent value the remembered Type/Size no longer supports is reconciled through the
 *   registry (a stranded Size becomes that Type's default size);
 * - a value still invalid after that falls back to the row's own default for that key;
 * - if the result still does not validate, the whole remembered set is discarded.
 *
 * Returns `row.defaults` itself (no allocation) when there is nothing to lay over it.
 *
 * @param {Pick<import('./library.js').LibraryRow, 'op' | 'defaults' | 'remembersParams'>} row
 * @param {Record<string, any> | undefined | null} remembered
 * @param {DefaultsOptions} [options]
 * @returns {Record<string, any>}
 */
export function effectiveDefaultsFor(row, remembered, options = {}) {
  if (!row.remembersParams || remembered === undefined || remembered === null) return row.defaults
  const schemaFn = options.schemaFn ?? paramOptions
  const reconcileFn = options.reconcileFn ?? reconcileParamEdit
  const defaults = row.defaults

  let known = /** @type {Record<string, any>} */ ({})
  try {
    const schema = schemaFn(row.op, { ...defaults, ...remembered })
    for (const key of Object.keys(remembered)) {
      if (key in schema && remembered[key] !== undefined) known[key] = remembered[key]
    }
    if (Object.keys(known).length === 0) return defaults

    let candidate = reconcileFn(row.op, { ...defaults, ...known }, [])
    for (const key of invalidKeys(row.op, candidate, schemaFn)) {
      if (key in defaults) candidate = { ...candidate, [key]: defaults[key] }
      else {
        const { [key]: _stale, ...rest } = candidate
        candidate = rest
      }
    }
    candidate = reconcileFn(row.op, candidate, [])
    if (invalidKeys(row.op, candidate, schemaFn).length > 0) return defaults
    return candidate
  } catch {
    // A schema that throws (a user part whose definition changed under the memory) means the
    // memory cannot be trusted: the row uses its defaults.
    return defaults
  }
}

/**
 * Whether the effective params differ from the row's registry defaults — what decides if the
 * summary line and **↺ Reset** are shown.
 *
 * @param {Pick<import('./library.js').LibraryRow, 'op' | 'defaults' | 'remembersParams'>} row
 * @param {Record<string, any> | undefined | null} remembered
 * @param {DefaultsOptions} [options]
 * @returns {boolean}
 */
export function differsFromDefaults(row, remembered, options = {}) {
  const effective = effectiveDefaultsFor(row, remembered, options)
  if (effective === row.defaults) return false
  const keys = new Set([...Object.keys(effective), ...Object.keys(row.defaults)])
  for (const key of keys) {
    if (!Object.is(effective[key], row.defaults[key]) && JSON.stringify(effective[key]) !== JSON.stringify(row.defaults[key])) return true
  }
  return false
}

/**
 * What to remember from a placed body's params after a committed edit: only the keys the
 * Inspector's schema exposes for the op (so a bolt's `clearLength`, a position, a colour and
 * a name are never stored), read in the op's current shape, with variable bindings replaced
 * by the value they resolved to — the memory is not tied to a project, and the next one may
 * have no such variable. A binding that cannot be resolved is left out.
 *
 * @param {string} op
 * @param {Record<string, any> | undefined} params The edited record's params.
 * @param {{ schemaFn?: DefaultsOptions['schemaFn'], variables?: ReadonlyMap<string, any> }} [options]
 * @returns {Record<string, any> | null} `null` when nothing is rememberable.
 */
export function rememberedFrom(op, params, options = {}) {
  const schemaFn = options.schemaFn ?? paramOptions
  let source = params ?? {}
  if (options.variables !== undefined) source = resolveParams(source, options.variables).params
  source = normalizedParams(op, source)
  const kept = /** @type {Record<string, any>} */ ({})
  for (const key of Object.keys(schemaFn(op, source))) {
    const value = source[key]
    if (value === undefined || isBinding(value)) continue
    kept[key] = value
  }
  return Object.keys(kept).length === 0 ? null : kept
}

/**
 * The params worth spelling out in the row's summary line: everything except what the row's
 * own dropdowns already show (a Bolt / screw's Type and Size; a Pi's Model).
 *
 * @param {Pick<import('./library.js').LibraryRow, 'choice' | 'extraChoices'>} row
 * @param {Record<string, any>} params
 * @returns {Record<string, any>}
 */
export function summaryParamsFor(row, params) {
  const shown = new Set([...(row.choice ? [row.choice.param] : []), ...row.extraChoices.map((extra) => extra.param)])
  return Object.fromEntries(Object.entries(params).filter(([key]) => !shown.has(key)))
}

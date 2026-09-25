/**
 * Reading a body's user colour overrides (`TODO/data-005`) the way the Inspector's
 * Color control and the viewport both need to (`TODO/ui-037`). Framework-free on
 * purpose: "which colour is this part?" is a rule, and a rule that lived in both a
 * component and the render loop would sooner or later answer differently in each.
 *
 * ## The precedence rule, stated once
 *
 * `Body.colorOverrides` holds at most one whole-body entry (no `subPart`) and one
 * entry per distinct `subPart`. For a given part:
 *
 * 1. that part's **own** entry, if it has one, wins;
 * 2. otherwise the **whole-body** entry applies;
 * 3. otherwise there is no override and the part draws in the theme palette.
 *
 * So recolouring a Pi board red after its `usbc` was set blue leaves `usbc` blue:
 * the render reads as "the whole board is red, and that one part is different",
 * which is what a user who deliberately picked the part asked for. The two entries
 * are independent keys in the document (`colorOverridesOf`), and this rule is only
 * how they combine on screen — neither overwrites the other.
 *
 * @module core/colorOverride
 */

/** @typedef {import('./document.js').ColorOverride} ColorOverride */

/**
 * A `0xRRGGBB` integer as the `#rrggbb` string an `<input type="color">` takes.
 * Named for its boundary (CLAUDE.md: "name every conversion at its boundary"):
 * the document stores integers, the DOM speaks CSS hex, and this is the one
 * crossing.
 *
 * @param {number} color `0xRRGGBB`.
 * @returns {string} Lower-case `#rrggbb`.
 */
export function colorIntToCssHex(color) {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`
}

/**
 * The inverse of {@link colorIntToCssHex}. Only the exact `#rrggbb` form a native
 * colour input produces is accepted — anything else is `null`, never a guess.
 *
 * @param {string} hex
 * @returns {number | null}
 */
export function cssHexToColorInt(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null
  return Number.parseInt(hex.slice(1), 16)
}

/**
 * The entry that targets exactly this key — `partName`'s own override, or the
 * whole-body one when `partName` is undefined. Never falls back: a part that is
 * merely *inheriting* the whole-body colour has no override of its own, which is
 * what decides whether the Inspector's Reset button has anything to reset.
 *
 * @param {readonly ColorOverride[] | undefined} overrides
 * @param {string | undefined} partName
 * @returns {ColorOverride | undefined}
 */
export function ownOverrideOf(overrides, partName) {
  if (!overrides) return undefined
  for (const entry of overrides) {
    if (entry.subPart === partName) return entry
  }
  return undefined
}

/**
 * The override that actually paints `partName` — see the module doc's precedence
 * rule. With `partName` undefined (a bare body, or the whole-body swatch) this is
 * just the whole-body entry.
 *
 * @param {readonly ColorOverride[] | undefined} overrides
 * @param {string | undefined} partName
 * @returns {ColorOverride | undefined}
 */
export function effectiveOverrideOf(overrides, partName) {
  if (!overrides) return undefined
  if (partName !== undefined) {
    const own = ownOverrideOf(overrides, partName)
    if (own) return own
  }
  return ownOverrideOf(overrides, undefined)
}

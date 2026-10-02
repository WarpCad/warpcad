// SPDX-License-Identifier: AGPL-3.0-or-later
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
 * 3. otherwise there is no *user* override and the part draws in the theme palette.
 *
 * So recolouring a Pi board red after its `usbc` was set blue leaves `usbc` blue:
 * the render reads as "the whole board is red, and that one part is different",
 * which is what a user who deliberately picked the part asked for. The two entries
 * are independent keys in the document (`colorOverridesOf`), and this rule is only
 * how they combine on screen — neither overwrites the other.
 *
 * ## The recipe tier (`TODO/render-003`)
 *
 * A composite recipe can bake its own colour into a part (`TODO/core-026`'s
 * `Group.colors`, e.g. a washer's `gray` or a Pi board's translucent `green`).
 * That is a **fourth** tier, sitting *beneath* both user-override tiers above and
 * *above* the theme palette — a user's pick, whole-body or per-part, always beats
 * a recipe's own default, but a recipe's own default beats the generic palette.
 * {@link paintColorOf} is the one function that folds all four tiers into a
 * single answer; {@link effectiveOverrideOf} alone answers only the top two, which
 * is what `ownColor`/`Reset` in the Inspector still need to know (resetting clears
 * a *user* override and falls through to whatever is beneath it, recipe colour
 * included — it does not, itself, need to know what that colour is).
 *
 * @module core/colorOverride
 */

/** @typedef {import('./document.js').ColorOverride} ColorOverride */
/** @typedef {import('./kernel/group.js').PartColor} PartColor */

/**
 * A colour to paint with, normalised to the same `{ color, colorAlpha }` shape a
 * user override reports (`colorAlpha` omitted at full opacity) — the shape
 * `src/render/mesh.js`'s colour-keyed material cache already takes.
 *
 * @typedef {object} PaintColor
 * @property {number} color `0xRRGGBB`.
 * @property {number} [colorAlpha] `(0, 1]`. Omitted when 1.
 */

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

/**
 * A recipe's own baked-in colour for `partName` (`TODO/core-026`'s
 * `Group.colors`), normalised to {@link PaintColor}'s shape — the recipe layer
 * names its alpha field `alpha`, not `colorAlpha`, and always materialises it
 * (`1` when the record left it out), so this is also where that gets converted
 * to the `colorAlpha`-omitted-at-1 convention every other tier already uses.
 *
 * `partName` undefined (a bare solid, or "the whole body" when nothing is
 * drilled in) always answers undefined: a recipe's colours are per-part, and
 * there is no single colour to report for a body with more than one visible
 * part (a bolt's gray head and silver thread do not average into one answer).
 * A caller that wants a defensible "whole body" colour for a single-part group
 * passes that one part's own name, not `undefined`.
 *
 * @param {Readonly<Record<string, PartColor>> | undefined} recipeColors
 * @param {string | undefined} partName
 * @returns {PaintColor | undefined}
 */
export function recipeColorOf(recipeColors, partName) {
  if (partName === undefined || !recipeColors) return undefined
  const entry = recipeColors[partName]
  if (!entry) return undefined
  return entry.alpha === 1 ? { color: entry.color } : { color: entry.color, colorAlpha: entry.alpha }
}

/**
 * The colour that actually paints `partName` once a recipe's own colour is
 * folded in as the tier beneath both user-override tiers and above the theme
 * palette — see the module doc's precedence rule. Returns `undefined` when none
 * of the four tiers apply, which means "draw the theme palette", exactly as
 * {@link effectiveOverrideOf} alone already meant before `TODO/render-003`.
 *
 * @param {readonly ColorOverride[] | undefined} overrides
 * @param {Readonly<Record<string, PartColor>> | undefined} recipeColors
 * @param {string | undefined} partName
 * @returns {PaintColor | undefined}
 */
export function paintColorOf(overrides, recipeColors, partName) {
  const override = effectiveOverrideOf(overrides, partName)
  if (override) return { color: override.color, colorAlpha: override.colorAlpha }
  return recipeColorOf(recipeColors, partName)
}

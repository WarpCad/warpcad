// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The models the assistant can use (`TODO/ai-004`, `docs/decisions/ai-partner.md` decision 9).
 *
 * The model id is **data**: this list and the one `ai.model` setting
 * (`stores/settings.js`) are the only places an id is written down. `client.js` reads the
 * current id at call time, so changing it applies to the next request.
 *
 * Haiku 4.5 is deliberately absent: it takes a different thinking configuration
 * (`budget_tokens`, not adaptive) and a 4,096-token cache minimum, so it would need a second
 * request shape (decision 9).
 *
 * @module ai/models
 */

/**
 * @typedef {object} ModelInfo
 * @property {string} id The exact Messages API model id.
 * @property {string} label What the key sheet and chat header show.
 */

/** The out-of-the-box model: the target prompts are long-horizon spatial builds with vision. */
export const DEFAULT_MODEL = 'claude-opus-5-5'

/** @type {ReadonlyArray<ModelInfo>} */
export const MODELS = Object.freeze([
  Object.freeze({ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' }),
  Object.freeze({ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' }),
])

/**
 * @param {unknown} id
 * @returns {id is string} Whether `id` is one of {@link MODELS}.
 */
export function isKnownModel(id) {
  return typeof id === 'string' && MODELS.some((model) => model.id === id)
}

/**
 * @param {string} id
 * @returns {string} The display label, or the raw id for one this build does not know.
 */
export function modelLabel(id) {
  return MODELS.find((model) => model.id === id)?.label ?? id
}

/**
 * `TODO/ai-013`: what a request costs, **an estimate**. Prices are USD per million tokens, read
 * from the `claude-api` skill's model table on {@link PRICES_AS_OF} (`docs/decisions/ai-partner.md`
 * decision 9). Cache writes are 1.25× input on the 5-minute TTL. A price that has drifted from
 * Anthropic's is why the readout says "≈" and the key sheet's model list is the only way a model
 * gets here; update this table and its date together.
 *
 * @type {Readonly<Record<string, Readonly<{ input: number, cacheRead: number, cacheWrite: number, output: number }>>>}
 */
const PRICES = Object.freeze({
  'claude-opus-5-5': Object.freeze({ input: 4, cacheRead: 0.2, cacheWrite: 5, output: 20 }),
  'claude-sonnet-5-5': Object.freeze({ input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10 }),
})

/** When {@link PRICES} was last read from the published table. */
export const PRICES_AS_OF = '2026-09-25'

/**
 * @param {string} modelId
 * @param {import('./client.js').TokenUsage | undefined} usage
 * @returns {number | null} Estimated US dollars, or `null` when the model has no price or the
 *   usage is not a set of finite counts — never `NaN`, so the readout can simply omit it.
 */
export function estimateCost(modelId, usage) {
  const price = Object.hasOwn(PRICES, modelId) ? PRICES[modelId] : undefined
  if (price === undefined || usage === undefined || usage === null) return null
  const counts = [usage.input, usage.cacheRead, usage.cacheWrite, usage.output]
  if (!counts.every((count) => Number.isFinite(count) && count >= 0)) return null
  return (
    (usage.input * price.input + usage.cacheRead * price.cacheRead + usage.cacheWrite * price.cacheWrite + usage.output * price.output) /
    1_000_000
  )
}

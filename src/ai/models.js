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

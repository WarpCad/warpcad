// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Which standing instructions this browser trusts (`TODO/ai-003`,
 * `docs/decisions/ai-partner.md` decision 7 and the user's item 4).
 *
 * Standing instructions are instructions *by intent*, yet they travel inside project files and
 * gists anyone can write. The accepted v1 rule:
 *
 * - instructions the user **typed in this browser** (File ▾ → Project settings… → Save) are
 *   trusted;
 * - instructions that **arrived with a loaded file** are data — shown with a "Use this
 *   project's instructions" confirm — until the user confirms them; then they are trusted for
 *   that project in this browser.
 *
 * Trust is kept per **exact text**, so a file that edits the wording has to be confirmed again,
 * and a file can never borrow trust by claiming a project name. The list lives in
 * `localStorage` (a per-viewer convenience — losing it only means confirming again), is
 * bounded, and every read and write is guarded: a private window or blocked storage degrades
 * to "trusted for this session only", never to an exception.
 *
 * Framework-free: the storage is injected (`CLAUDE.md`: mock at the boundary).
 *
 * @module ai/instructionTrust
 */

/** The `localStorage` key. */
export const TRUST_STORAGE_KEY = 'warpcad:trusted-instructions'

/** How many distinct trusted texts are remembered; the oldest is dropped first. */
const DEFAULT_LIMIT = 50

/**
 * @typedef {object} TrustStorage The slice of `Storage` this needs.
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 */

/**
 * @typedef {object} InstructionTrust
 * @property {(text: string) => boolean} isTrusted Empty text is trivially trusted.
 * @property {(text: string) => void} trust Never throws.
 */

/**
 * @param {object} options
 * @param {TrustStorage | null} options.storage `window.localStorage`, a fake, or `null` for
 *   in-memory only.
 * @param {number} [options.limit]
 * @returns {InstructionTrust}
 */
export function createInstructionTrust({ storage, limit = DEFAULT_LIMIT }) {
  /** @type {string[]} */
  let texts = read()

  /** @returns {string[]} */
  function read() {
    if (!storage) return []
    try {
      const raw = storage.getItem(TRUST_STORAGE_KEY)
      if (raw === null) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string').slice(-limit) : []
    } catch {
      return []
    }
  }

  return {
    isTrusted(text) {
      if (typeof text !== 'string' || text.trim() === '') return true
      return texts.includes(text)
    },
    trust(text) {
      if (typeof text !== 'string' || text.trim() === '') return
      // Re-read first so two tabs do not erase each other's confirmations.
      const stored = read()
      texts = [...new Set([...stored, ...texts].filter((item) => item !== text)), text].slice(-limit)
      if (!storage) return
      try {
        storage.setItem(TRUST_STORAGE_KEY, JSON.stringify(texts))
      } catch {
        /* storage blocked or full: trusted for this session only */
      }
    },
  }
}

/**
 * `window.localStorage` when it can be reached, otherwise `null` (in-memory trust). Accessing
 * the property itself throws in some locked-down contexts, hence the guard.
 *
 * @returns {TrustStorage | null}
 */
export function browserTrustStorage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

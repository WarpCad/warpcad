// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Asking the browser to keep our data (`TODO/io-028`).
 *
 * Everything the hosted app keeps lives in IndexedDB: the autosave, My parts and the stored keys.
 * Origin storage is "best effort" — the browser may clear it under pressure, and Safari clears a
 * site not used for seven days unless it is installed. An evicted database reads as empty, with no
 * message. This module is the framework-free half of the answer: ask for persistence, read the
 * estimate, and remember that this browser has saved a project before so an empty database can be
 * recognised as cleared rather than new.
 *
 * `navigator.storage` and `localStorage` are injected (defaulting to the globals), so a unit test
 * needs neither. Nothing here throws.
 *
 * @module storage/persistentStorage
 */

/** What the status chip says when a browser that held a saved project now holds nothing. */
export const CLEARED_DATA_MESSAGE = "Your browser cleared WarpCad's saved data. Open a project file to carry on."

/** The `localStorage` key that remembers this browser has autosaved a project before. */
export const SAVED_BEFORE_KEY = 'warpcad.savedBefore'

/**
 * @typedef {{ persist?: () => Promise<boolean>, estimate?: () => Promise<{ usage?: number, quota?: number }> }} StorageManagerLike
 * @typedef {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} FlagStorage
 * @typedef {{ usageBytes: number, quotaBytes: number }} StorageEstimate
 */

/** @returns {StorageManagerLike | undefined} */
function defaultManager() {
  try {
    return /** @type {StorageManagerLike | undefined} */ (globalThis.navigator?.storage)
  } catch {
    return undefined
  }
}

/** @returns {FlagStorage | undefined} */
function defaultFlagStorage() {
  try {
    return globalThis.localStorage ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Ask the browser not to evict this origin's storage. Never throws.
 *
 * @param {StorageManagerLike | null | undefined} [manager] `navigator.storage`
 * @returns {Promise<'granted' | 'denied' | 'unsupported'>}
 */
export async function requestPersistence(manager = defaultManager()) {
  if (!manager || typeof manager.persist !== 'function') return 'unsupported'
  try {
    return (await manager.persist()) === true ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

/**
 * How much of the origin's quota is in use, or `null` when the browser will not say. Never throws.
 *
 * @param {StorageManagerLike | null | undefined} [manager] `navigator.storage`
 * @returns {Promise<StorageEstimate | null>}
 */
export async function storageEstimate(manager = defaultManager()) {
  if (!manager || typeof manager.estimate !== 'function') return null
  try {
    const { usage, quota } = (await manager.estimate()) ?? {}
    if (typeof usage !== 'number' || typeof quota !== 'number' || !Number.isFinite(usage) || !Number.isFinite(quota)) return null
    return { usageBytes: usage, quotaBytes: quota }
  } catch {
    return null
  }
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function size(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  return `${Math.round(bytes / 1024)} KB`
}

/**
 * @param {StorageEstimate} estimate
 * @returns {string} e.g. `using 480 MB of 500 MB`
 */
export function formatEstimate(estimate) {
  return `using ${size(estimate.usageBytes)} of ${size(estimate.quotaBytes)}`
}

/**
 * Whether this browser has autosaved a project before. `false` when `localStorage` is unreadable.
 *
 * @param {FlagStorage | null | undefined} [flagStorage]
 * @returns {boolean}
 */
export function hasSavedBefore(flagStorage = defaultFlagStorage()) {
  try {
    return flagStorage?.getItem(SAVED_BEFORE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Remember that this browser has autosaved a project. Best effort.
 *
 * @param {FlagStorage | null | undefined} [flagStorage]
 * @returns {void}
 */
export function markSavedBefore(flagStorage = defaultFlagStorage()) {
  try {
    flagStorage?.setItem(SAVED_BEFORE_KEY, '1')
  } catch {
    /* a blocked store means the notice cannot fire later; never a failure now */
  }
}

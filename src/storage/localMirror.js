// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A synchronous safety copy of the autosave, in `localStorage` (`TODO/io-001`).
 *
 * **Why it exists — a defect found by driving real Chromium, not by reading
 * code.** Place a solid and reload within the debounce window: the solid is gone.
 * The autosave scheduler flushes on `visibilitychange → hidden` and `pagehide`
 * exactly as `docs/decisions/interaction-model-qa.md` §8 specifies, and both
 * events do fire — but an IndexedDB transaction *started* inside them is not
 * committed before the renderer is torn down (measured: the `put` is issued, the
 * transaction neither completes nor aborts, and the next load finds nothing).
 * IndexedDB is asynchronous by design; a page that is dying cannot wait for it.
 *
 * `localStorage.setItem` is synchronous and is durable by the time the handler
 * returns, so it is the one write a dying page can still complete. This module is
 * that write and nothing more:
 *
 * - the autosaver writes here **only** from its synchronous flush, and only when
 *   something is actually unsaved (so a tab switch with nothing pending writes
 *   nothing);
 * - IndexedDB stays the durable store and the source of truth — this is a
 *   one-entry lifeboat that is **cleared as soon as IndexedDB has the same text**,
 *   and consulted at startup only to be compared against IndexedDB by timestamp;
 * - it is best effort in the same way `src/stores/settings.js` is: a full quota, a
 *   blocked store or no `localStorage` at all is swallowed, because losing the
 *   lifeboat must never be worse than not having one.
 *
 * The size ceiling (~5 MB of UTF-16 in the worst engine) is far above an action
 * log of a few dozen text records; a document large enough to exceed it simply
 * falls back to IndexedDB-only, which is the pre-existing behaviour.
 *
 * @module storage/localMirror
 */

export const MIRROR_KEY = 'warpcad.autosave.pending'

/** @typedef {import('./autosave.js').StoredProject} StoredProject */

/**
 * @typedef {object} SyncMirror
 * @property {(record: StoredProject) => void} write
 * @property {() => StoredProject | null} read
 * @property {() => void} clear
 */

/**
 * @param {object} [options]
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null} [options.storage]
 *   Injected in tests. Left `undefined`, `globalThis.localStorage` is read
 *   lazily *inside* the try/catch — merely touching it throws in a locked-down
 *   browser, so it must not be read at import time.
 * @returns {SyncMirror}
 */
export function createLocalStorageMirror(options = {}) {
  /** @returns {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null} */
  function storage() {
    if (options.storage !== undefined) return options.storage
    return globalThis.localStorage ?? null
  }

  return {
    write(record) {
      try {
        storage()?.setItem(MIRROR_KEY, JSON.stringify({ text: record.text, savedAt: record.savedAt }))
      } catch {
        /* quota or blocked: the lifeboat is best effort */
      }
    },

    read() {
      try {
        const raw = storage()?.getItem(MIRROR_KEY)
        if (!raw) return null
        const value = JSON.parse(raw)
        if (typeof value?.text !== 'string' || !Number.isFinite(value?.savedAt)) return null
        return { text: value.text, savedAt: value.savedAt }
      } catch {
        return null
      }
    },

    clear() {
      try {
        storage()?.removeItem(MIRROR_KEY)
      } catch {
        /* nothing to do */
      }
    },
  }
}

/**
 * Boot the storage layer, in the one order that is correct (`TODO/ui-033`).
 *
 * `io-002` deliberately did **not** call `hosted.start()` — with no UI, a restored connection
 * with auto-push on would have pushed with nothing on screen to say so. The File menu's dot is
 * that indicator, so booting the hosted store is this task's job.
 *
 * **Order matters.** `hosted.start()` asks "is the restored document ahead of what was last
 * pushed?" by hashing the document (`data-002` §11 rule 3), and until the local restore has
 * landed the document is the empty scene — the answer would be wrong in both directions. It
 * also installs the document-version watcher that schedules pushes, which must not see the
 * restore itself as an edit. So: local restore first, hosted second.
 *
 * Never rejects: a blocked IndexedDB or credential store must degrade to "not connected"
 * rather than break first paint. Both stores already report their own failures on the chip.
 *
 * @module composables/useStorageBoot
 */

/**
 * @param {{
 *   persistence: { start: () => Promise<void> },
 *   hosted: { start: () => Promise<void> },
 * }} stores
 * @returns {Promise<void>}
 */
export async function bootStorage({ persistence, hosted }) {
  try {
    await persistence.start()
  } catch {
    /* the local store reports its own failure on the chip; hosted must still start */
  }
  try {
    await hosted.start()
  } catch {
    /* a credential store that will not open means "not connected", not a broken app */
  }
}

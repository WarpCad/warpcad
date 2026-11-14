// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The toast queue (`TODO/ui-117`) — **UI state only**. One list of the pills on screen; the one
 * host (`layout/ToastHost.vue`, mounted by `AppView.vue`) draws them stacked, so two toasts fired
 * together sit one above the other instead of at the same spot.
 *
 * - {@link show} queues a toast and returns its id. Each toast runs its own clock; `lingerMs`
 *   defaults to {@link DEFAULT_LINGER_MS}, and `null` keeps it until {@link dismiss}.
 * - A `key` names the *source* of a toast ("share", "library"). A second toast with the same key
 *   replaces the first in place, which is what a source that fires again means (a second *Link
 *   copied* is the same message, not a second pill). Toasts with different keys never replace
 *   each other.
 * - `tone: 'danger'` toasts are announced as alerts; the rest as polite status.
 * - `action` is a button the toast carries (`{ label, testid, run }`); `link` is a read-only field
 *   (`{ value, label, testid }`) for a link the user must copy by hand. {@link update} patches a
 *   keyed toast, which is how a Copy link button turns into "Gist link copied".
 *
 * Never document state, and never persisted.
 *
 * @module stores/toasts
 */

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** How long a toast stays when it does not say, ms. One time for every source. */
export const DEFAULT_LINGER_MS = 5000

/**
 * @typedef {object} ToastAction
 * @property {string} label the button's text
 * @property {string} [testid] its `data-testid`
 * @property {() => void} run what a tap does
 */

/**
 * @typedef {object} ToastLink
 * @property {string} value the text to copy by hand
 * @property {string} label its accessible name
 * @property {string} [testid] its `data-testid`
 */

/**
 * @typedef {object} Toast
 * @property {number} id
 * @property {string} key the source; a repeat of the same key replaces this toast
 * @property {string} text
 * @property {'neutral' | 'danger'} tone
 * @property {string} testid the `data-testid` on the toast
 * @property {number | null} lingerMs null keeps it until dismissed
 * @property {ToastAction | null} action
 * @property {ToastLink | null} link
 */

/**
 * @typedef {object} ToastInput
 * @property {string} text
 * @property {string} [key] defaults to a key of its own, so it never replaces another toast
 * @property {'neutral' | 'danger'} [tone]
 * @property {string} [testid]
 * @property {number | null} [lingerMs]
 * @property {ToastAction | null} [action]
 * @property {ToastLink | null} [link]
 */

export const useToastsStore = defineStore('toasts', () => {
  /** @type {import('vue').ShallowRef<Toast[]>} */
  const items = shallowRef([])
  let nextId = 1
  /** @type {Map<number, ReturnType<typeof setTimeout>>} */
  const timers = new Map()

  /** @param {number} id */
  function stopClock(id) {
    const timer = timers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(id)
  }

  /**
   * @param {number} id
   * @param {number | null} lingerMs
   */
  function startClock(id, lingerMs) {
    stopClock(id)
    if (lingerMs === null) return
    timers.set(id, setTimeout(() => dismiss(id), lingerMs))
  }

  /**
   * Queue a toast.
   *
   * @param {ToastInput} input
   * @returns {number} the toast's id
   */
  function show(input) {
    const existing = input.key === undefined ? undefined : items.value.find((t) => t.key === input.key)
    const id = existing ? existing.id : nextId++
    /** @type {Toast} */
    const toast = {
      id,
      key: input.key ?? `toast-${id}`,
      text: input.text,
      tone: input.tone ?? 'neutral',
      testid: input.testid ?? 'toast',
      lingerMs: input.lingerMs === undefined ? DEFAULT_LINGER_MS : input.lingerMs,
      action: input.action ?? null,
      link: input.link ?? null,
    }
    items.value = existing ? items.value.map((t) => (t.id === id ? toast : t)) : [...items.value, toast]
    startClock(id, toast.lingerMs)
    return id
  }

  /**
   * Patch a toast by key or id and restart its clock.
   *
   * @param {string | number} keyOrId
   * @param {Partial<Omit<ToastInput, 'key'>>} patch
   */
  function update(keyOrId, patch) {
    const current = items.value.find((t) => t.key === keyOrId || t.id === keyOrId)
    if (!current) return
    /** @type {Toast} */
    const next = {
      ...current,
      ...(patch.text !== undefined && { text: patch.text }),
      ...(patch.tone !== undefined && { tone: patch.tone }),
      ...(patch.testid !== undefined && { testid: patch.testid }),
      ...(patch.action !== undefined && { action: patch.action }),
      ...(patch.link !== undefined && { link: patch.link }),
      ...(patch.lingerMs !== undefined && { lingerMs: patch.lingerMs }),
    }
    items.value = items.value.map((t) => (t.id === current.id ? next : t))
    startClock(current.id, next.lingerMs)
  }

  /** @param {string | number} keyOrId the toast's id, or its key */
  function dismiss(keyOrId) {
    const toast = items.value.find((t) => t.id === keyOrId || t.key === keyOrId)
    if (!toast) return
    stopClock(toast.id)
    items.value = items.value.filter((t) => t.id !== toast.id)
  }

  function clear() {
    for (const id of [...timers.keys()]) stopClock(id)
    items.value = []
  }

  return { items, show, update, dismiss, clear }
})

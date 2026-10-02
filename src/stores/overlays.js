// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Which popovers and dialogs the app has open right now — **UI state only**
 * (`TODO/ui-033`).
 *
 * The hosted conflict dialog must never land under a finger: `data-002` §11 rule 5 defers it
 * "until no drag is in progress and no other popover or dialog is open". Each popover keeps
 * its own open flag (the Operations toolbar's is a local ref), so nothing could answer "is
 * *anything* open?" without this registry. A component reports itself with
 * {@link setOpen} under a stable key; {@link anyOpen} is the one question asked of it.
 *
 * Deliberately a set of keys rather than a counter: a component that reports "open" twice, or
 * "closed" without ever having opened, cannot skew it.
 *
 * @module stores/overlays
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useOverlaysStore = defineStore('overlays', () => {
  /** @type {import('vue').Ref<string[]>} */
  const openKeys = ref([])

  /**
   * @param {string} key A stable name for the popover, e.g. `ops-popover`.
   * @param {boolean} open
   */
  function setOpen(key, open) {
    const has = openKeys.value.includes(key)
    if (open && !has) openKeys.value = [...openKeys.value, key]
    else if (!open && has) openKeys.value = openKeys.value.filter((existing) => existing !== key)
  }

  const anyOpen = computed(() => openKeys.value.length > 0)

  return { openKeys, anyOpen, setOpen }
})

/**
 * What is currently selected — UI state, exactly the kind CLAUDE.md says Pinia is
 * for (selection, active tool, panel layout).
 *
 * `TODO/ui-010` only needs to *set* this: a freshly dropped body becomes the
 * current selection so `ui-011` has something to react to. The inspector, the
 * dimension lines and the transform gizmo are `ui-011`'s job and deliberately are
 * not built here.
 *
 * `count` exists from the start because CLAUDE.md gates tool enablement on
 * selection **count**, not selection presence — a store that only answered "is
 * something selected?" would push every tool into re-deriving the count itself.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useSelectionStore = defineStore('selection', () => {
  /** @type {import('vue').Ref<string[]>} */
  const ids = ref([])

  /**
   * Replace the selection with a single id, or clear it when given nothing.
   *
   * @param {string | null | undefined} id
   * @returns {void}
   */
  function select(id) {
    ids.value = id ? [id] : []
  }

  function clear() {
    ids.value = []
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    return ids.value.includes(id)
  }

  return {
    ids,
    count: computed(() => ids.value.length),
    onlyId: computed(() => (ids.value.length === 1 ? ids.value[0] : null)),
    select,
    clear,
    has,
  }
})

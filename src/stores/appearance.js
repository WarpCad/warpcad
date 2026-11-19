// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Appearance sheet's state (`TODO/ui-151`) — **UI state only**: whether **File ▾ → Appearance…**
 * has the sheet open. What it shows is `ThemePicker.vue`; what a choice does is `useTheme`.
 *
 * Opening and closing it changes **nothing else**: not the selection, not the active tool, not a
 * pop-up's fields. That holds by construction, since this store imports no other store.
 *
 * @module stores/appearance
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppearanceStore = defineStore('appearance', () => {
  const isOpen = ref(false)

  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  function toggle() {
    isOpen.value = !isOpen.value
  }

  return { isOpen, open, close, toggle }
})

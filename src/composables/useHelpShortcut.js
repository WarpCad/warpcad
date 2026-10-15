// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `?` and F1 toggle the Help sheet (`TODO/ui-061`) — a window-level listener mounted once from
 * the root view. Additive to the on-screen routes (the **?** buttons, **File ▾ → Help**), which
 * are the primary ones: a phone has no F1.
 *
 * Ignored when focus is in a text field (the shared `isTextEntry` guard, so typing a `?` in a
 * name or an instruction is typing), with Ctrl/Cmd/Alt held, and on auto-repeat.
 *
 * @module composables/useHelpShortcut
 */

import { onBeforeUnmount, onMounted } from 'vue'

import { useHelpStore } from '../stores/help.js'
import { isTextEntry } from './textEntry.js'

export function useHelpShortcut() {
  const help = useHelpStore()

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.key !== '?' && event.key !== 'F1') return
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.defaultPrevented) return
    if (event.key === '?' && isTextEntry(event.target)) return
    // F1 is the browser's own help key; claim it even from a field, where it is never typing.
    event.preventDefault()
    help.toggle()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}

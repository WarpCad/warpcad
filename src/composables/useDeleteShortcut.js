/**
 * Delete and Backspace delete the selection (`TODO/ui-051`) — a window-level listener,
 * mounted once from the root view rather than from the Inspector, because it has to
 * work while the Inspector sheet is collapsed (a tablet with a keyboard).
 *
 * Ignored when focus is in a text field (the shared `isTextEntry` guard Ctrl/Cmd+Z
 * uses): without it, Backspace while correcting a Position digit would delete the
 * body. Ignored with any modifier held, and on key auto-repeat, so holding the key
 * does one delete. A phone has no Delete key, which is why the Inspector's button is
 * the primary route and this is additive to it.
 *
 * @module composables/useDeleteShortcut
 */

import { onBeforeUnmount, onMounted } from 'vue'

import { isTextEntry } from './textEntry.js'
import { useDeleteCommands } from './useDeleteCommands.js'

export function useDeleteShortcut() {
  const commands = useDeleteCommands()

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (event.repeat || event.defaultPrevented) return
    if (isTextEntry(event.target)) return
    if (!commands.enabled.value) return
    event.preventDefault()
    commands.run()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
  return commands
}

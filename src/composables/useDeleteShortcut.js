// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Delete and Backspace delete the selection (`TODO/ui-051`) — a window-level listener,
 * mounted once from the root view rather than from the Inspector, because it has to
 * work while the Inspector sheet is collapsed (a tablet with a keyboard).
 *
 * Inside the sketch editor they delete the selected outline instead (`TODO/sketch-005`),
 * or its picked point when one is picked (`TODO/sketch-002`).
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

import { useSketchEditorStore } from '../stores/sketchEditor.js'
import { isTextEntry } from './textEntry.js'
import { useDeleteCommands } from './useDeleteCommands.js'

export function useDeleteShortcut() {
  const commands = useDeleteCommands()
  const sketchEditor = useSketchEditorStore()

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (event.repeat || event.defaultPrevented) return
    if (isTextEntry(event.target)) return
    // While the sketch editor is open the keys belong to it (`TODO/sketch-005`): they remove
    // the selected *outline* from the draft, and never fall through to the body underneath —
    // `useDeleteCommands` is disabled in the editor, but a future reader should not have to
    // rely on that to know a stray Backspace cannot delete a part.
    if (sketchEditor.active) {
      if (!sketchEditor.selectedProfileId) return
      event.preventDefault()
      // A picked point goes first; one refused ("needs at least 3 points") does nothing, and
      // never falls through to the whole outline.
      sketchEditor.deleteSelection()
      return
    }
    if (!commands.enabled.value) return
    event.preventDefault()
    commands.run()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
  return commands
}

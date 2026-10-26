// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `H` hides the selection in the view, or shows it when it is all hidden already; `Shift+H` is
 * **Show all** (`TODO/ui-089`). A window-level listener mounted once from the root view, like
 * `useDeleteShortcut`, so it works with the Inspector sheet collapsed.
 *
 * Secondary on purpose: a phone has no keyboard, so the Objects list's eyes are the primary
 * route and this only mirrors them (`stores/objectList.js`'s `toggleSelectionVisibility` and
 * `showAll`, which also refuse while History previews). "The selection" is each selected body,
 * or the part it is drilled into.
 *
 * Inactive while the sketch editor is open and while a text field has focus (the shared
 * `isTextEntry` guard): typing an `h` into a name must not hide the body. Ignored with
 * Ctrl/Cmd/Alt held and on key auto-repeat, so holding the key does not flicker the body.
 *
 * @module composables/useVisibilityShortcut
 */

import { onBeforeUnmount, onMounted } from 'vue'

import { useObjectListStore } from '../stores/objectList.js'
import { useSketchEditorStore } from '../stores/sketchEditor.js'
import { isTextEntry } from './textEntry.js'

export function useVisibilityShortcut() {
  const objects = useObjectListStore()
  const sketchEditor = useSketchEditorStore()

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.key !== 'h' && event.key !== 'H') return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.repeat || event.defaultPrevented) return
    if (isTextEntry(event.target)) return
    if (sketchEditor.active) return
    const changed = event.shiftKey
      ? objects.hiddenCount > 0 && objects.showAll()
      : objects.toggleSelectionVisibility()
    if (changed) event.preventDefault()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}

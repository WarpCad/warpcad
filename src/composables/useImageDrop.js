// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Drop an image file onto the viewport to attach it to the Assistant (`TODO/ai-008`, desktop).
 *
 * The same attach as the composer's **Attach** (`useAgent().attach`, which sanitises it through
 * `sketch-003` first) — this only routes the drop there and opens the chat so the attachment is
 * in view. Only a drag that carries **files** is taken: a Library row's drag-to-place is pointer
 * events, not HTML drag and drop, so it never reaches here. A dropped file that is not an image
 * is still handed to `attach`, which says why it was refused in the composer.
 *
 * **Except a model file** (`TODO/ui-107`): a dropped `.stl` or `.3mf` is File → Import model… with
 * the position already chosen, so it goes to `stores/modelImport.js` and commits at the drop point
 * in the project (no placement session, no chat). The model is named by its extension, the same
 * test the importer itself starts from (`formatForName`).
 *
 * @module composables/useImageDrop
 */

import { ref } from 'vue'

import { formatForName } from '../io/meshFormats/index.js'
import { useAgent } from './useAgent.js'
import { useAssistantStore } from '../stores/assistant.js'
import { useModelImportStore } from '../stores/modelImport.js'

/**
 * @param {DragEvent} event
 * @returns {boolean}
 */
function carriesFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

/**
 * @returns {{ dropActive: import('vue').Ref<boolean>, onDragOver: (event: DragEvent) => void, onDragLeave: (event: DragEvent) => void, onDrop: (event: DragEvent) => Promise<void> }}
 */
export function useImageDrop() {
  const assistant = useAssistantStore()
  const agent = useAgent()
  const modelImport = useModelImportStore()
  /** A file is being dragged over the viewport — for `data-image-drop`. */
  const dropActive = ref(false)

  /** @param {DragEvent} event */
  function onDragOver(event) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    dropActive.value = true
  }

  /** @param {DragEvent} event */
  function onDragLeave(event) {
    if (!carriesFiles(event)) return
    dropActive.value = false
  }

  /** @param {DragEvent} event */
  async function onDrop(event) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    dropActive.value = false
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length === 0) return
    const at = { clientX: event.clientX, clientY: event.clientY }
    const models = files.filter((file) => formatForName(file.name) !== null)
    const images = files.filter((file) => formatForName(file.name) === null)
    // Each model is its own placed body at the drop point, read in turn.
    for (const file of models) await modelImport.importFile(file, { at })
    if (images.length === 0) return
    assistant.open()
    for (const file of images) await agent.attach(file)
  }

  return { dropActive, onDragOver, onDragLeave, onDrop }
}

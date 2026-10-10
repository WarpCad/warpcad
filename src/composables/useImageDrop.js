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
 * @module composables/useImageDrop
 */

import { ref } from 'vue'

import { useAgent } from './useAgent.js'
import { useAssistantStore } from '../stores/assistant.js'

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
    assistant.open()
    for (const file of files) await agent.attach(file)
  }

  return { dropActive, onDragOver, onDragLeave, onDrop }
}

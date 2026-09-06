/**
 * The current selection, described for the UI.
 *
 * The thin reactive wrapper over `src/core/inspector.js`, and the one place the
 * selection store and the document meet. Both the Inspector panel and the
 * viewport's overlays consume it, so there is a single answer to "what is
 * selected and how big is it" rather than two that can disagree — the same
 * reason `render-001` kept one camera model behind two input paths.
 *
 * Deliberately *not* deep-reactive over geometry: the description carries plain
 * numbers only (bounds, size, position, param values). CLAUDE.md's Performance
 * section calls Vue deep-reactivity over a kernel solid's vertex arrays a
 * performance bug, so `document.raw` is read imperatively here and only the
 * summary crosses into reactive land.
 *
 * @module composables/useSelectedBody
 */

import { computed } from 'vue'

import { describeSelection } from '../core/inspector.js'
import { useDocumentStore } from '../stores/document.js'
import { useSelectionStore } from '../stores/selection.js'

/**
 * @returns {import('vue').ComputedRef<import('../core/inspector.js').SelectionDescription>}
 *   Recomputed when the selection changes or the document mutates — **not** per
 *   frame. The viewport re-projects this description every frame; it does not
 *   re-derive it.
 */
export function useSelectedBody() {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()

  return computed(() => {
    // Read the version so a document mutation invalidates the description: the
    // bodies themselves live outside Vue's reactivity on purpose.
    void documentStore.version
    return describeSelection(documentStore.raw.bodies(), selection.ids)
  })
}

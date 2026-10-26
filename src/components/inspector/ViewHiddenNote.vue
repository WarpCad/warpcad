<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector's one-line note for a selection the user has hidden in the view
 * (`TODO/ui-089`, rule 5): **"Hidden in the view · Show"**. A hidden body or part can still be
 * selected from the Objects list (a cutter hidden to see the target, then ticked as Subtract's
 * operand), and then the viewport draws no outline and no gizmo — this line is what says why.
 * `Show` does what the row's eye does: for a drilled part, it brings back the part and, if the
 * body is hidden too, the body, so the thing the Inspector names is on screen afterwards.
 *
 * Reads the body's summary from the document store and the rule from `core/visibility.js`.
 *
 * @module components/inspector/ViewHiddenNote
 */
import { computed } from 'vue'

import { isBodyDrawn, isPartDrawn } from '../../core/visibility.js'
import { useDocumentStore } from '../../stores/document.js'

const props = defineProps({
  /** The Inspector's `BodyDescription` — `id`, and `subPart` while drilled into one part. */
  body: { type: Object, required: true },
})

const documentStore = useDocumentStore()

/** The body's summary, which carries its Hide switches — or `undefined` (a previewed body). */
const summary = computed(() => documentStore.bodies.find((candidate) => candidate.id === props.body.id))

/** The drilled part's name, or `null` for the whole body. */
const partName = computed(() => /** @type {string | null} */ (props.body.subPart?.partName ?? null))

const hidden = computed(() => {
  const view = summary.value
  if (view === undefined) return false
  return partName.value === null ? !isBodyDrawn(view) : !isPartDrawn(view, partName.value)
})

function onShow() {
  const view = summary.value
  if (view === undefined) return
  if (!isBodyDrawn(view)) documentStore.setViewHidden(props.body.id, { hidden: false })
  if (partName.value !== null && (view.viewHiddenParts ?? []).includes(partName.value)) {
    documentStore.setViewHidden(props.body.id, { subPart: partName.value, hidden: false })
  }
}
</script>

<template>
  <p v-if="hidden" class="note" data-testid="inspector-view-hidden" role="status">
    Hidden in the view ·
    <button type="button" class="note__show" data-testid="inspector-view-hidden-show" @click="onShow">Show</button>
  </p>
</template>

<style scoped>
.note {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-2);
}

.note__show {
  min-height: var(--tap);
  padding: 0 4px;
  border: none;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}

.note__show:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>

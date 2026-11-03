<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **Hidden by default** checkbox (`TODO/ui-093`): shown while the Inspector is drilled into
 * one named part of a group, directly below the Color row. Ticked, the part behaves like a
 * bolt's `tap`: not drawn, carrying the `hidden` chip, left out of Size, Export and whole-body
 * cuts, still there to pick and cut with. Unticked, it is an ordinary part again.
 *
 * It is one undoable step (`group.setPartHidden`), unlike the row's eye, which only hides the
 * part from view. The last shown part cannot be hidden, so the box is disabled with the reason
 * beside it. Absent, not disabled, for a whole-body selection, a Repeat's member or a body with
 * no named parts.
 *
 * @module components/inspector/PartDefaultHidden
 */
import { computed } from 'vue'

import { useDocumentStore } from '../../stores/document.js'

const props = defineProps({
  /** The Inspector's `BodyDescription` — `id`, `repeat` and `subPart` while drilled in. */
  body: { type: Object, required: true },
})

const documentStore = useDocumentStore()

/** The body's summary, which carries its visible and hidden part names. */
const summary = computed(() => documentStore.bodies.find((candidate) => candidate.id === props.body.id))

/** The drilled part's name, or `null` for a whole-body selection. */
const partName = computed(() => /** @type {string | null} */ (props.body.subPart?.partName ?? null))

const isShownPart = computed(() => partName.value !== null && (summary.value?.partNames ?? []).includes(partName.value))
const isHiddenPart = computed(() => partName.value !== null && (summary.value?.hiddenPartNames ?? []).includes(partName.value))

/** Offered only for a named part of a non-Repeat group. */
const present = computed(() => props.body.repeat === undefined && (isShownPart.value || isHiddenPart.value))

const checked = computed(() => isHiddenPart.value)

/** The last shown part cannot be hidden: a group with nothing shown cannot be drawn. */
const lastShown = computed(() => isShownPart.value && (summary.value?.partNames ?? []).length === 1)

function onChange(/** @type {Event} */ event) {
  if (partName.value === null) return
  const input = /** @type {HTMLInputElement} */ (event.target)
  try {
    documentStore.setPartHidden(props.body.id, partName.value, input.checked)
  } catch {
    input.checked = checked.value
  }
}
</script>

<template>
  <section v-if="present" class="default-hidden" data-testid="inspector-default-hidden-section">
    <label class="default-hidden__toggle">
      <input
        type="checkbox"
        data-testid="inspector-default-hidden"
        :checked="checked"
        :disabled="lastShown"
        @change="onChange"
      />
      Hidden by default
    </label>
    <p v-if="lastShown" class="default-hidden__note" data-testid="inspector-default-hidden-reason">
      Last shown part: it needs one shown part.
    </p>
    <p v-else class="default-hidden__note" data-testid="inspector-default-hidden-note">
      Left out of this shape's size, Export and whole-shape cuts. The eye only hides it from view.
    </p>
  </section>
</template>

<style scoped>
.default-hidden {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.default-hidden__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  font-size: 12px;
  color: var(--text-1);
  cursor: pointer;
}

.default-hidden__toggle input {
  width: 20px;
  height: 20px;
  flex: none;
  accent-color: var(--accent);
}

.default-hidden__note {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
  overflow-wrap: anywhere;
}
</style>

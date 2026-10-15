<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector header's name, editable in place (`TODO/ui-056`).
 *
 * - **Trigger**: tap/click the name or its pencil (always visible — no hover-only
 *   affordance, this is a touch target), or press **F2**.
 * - **Commit**: Enter or blur (the phone keyboard's Done key blurs). **Escape** reverts and
 *   stops there: it is swallowed so nothing else listening for Escape (an armed placement,
 *   the timeline preview) reacts to a key that was only abandoning a rename.
 * - **Blank** restores the generated name; the helper line says so. **Duplicate** names
 *   commit anyway, with a non-blocking hint (`isDuplicateName`: two `Screw`s are fine).
 * - One commit is one `style.rename` record via `useRenameSelected`; an unchanged name
 *   appends nothing, so it is never an empty Undo step. The selection is left alone — the
 *   record rebuilds the body but the selection holds its lineage-root id.
 *
 * Untrusted text (a name can come from any opened file): `{{ }}` interpolation only.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { isDuplicateName, MAX_NAME_LENGTH } from '../../core/naming.js'
import { useRenameSelected } from '../../composables/useSelectedBody.js'
import { isTextEntry } from '../../composables/textEntry.js'
import { useDocumentStore } from '../../stores/document.js'

const props = defineProps({
  /** The selected body's id (its lineage root). */
  bodyId: { type: String, required: true },
})

const documentStore = useDocumentStore()
const renamer = useRenameSelected()

const editing = ref(false)
const draft = ref('')
const notice = ref('')
const inputEl = ref(/** @type {HTMLInputElement | null} */ (null))
const rootEl = ref(/** @type {HTMLElement | null} */ (null))

const currentName = computed(() => {
  void documentStore.version
  return documentStore.bodies.find((body) => body.id === props.bodyId)?.name ?? props.bodyId
})

const duplicate = computed(
  () => editing.value && isDuplicateName(draft.value, documentStore.bodies, props.bodyId),
)

async function start() {
  if (editing.value) return
  draft.value = currentName.value
  notice.value = ''
  editing.value = true
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
}

function commit() {
  if (!editing.value) return
  editing.value = false
  const wasBlank = draft.value.trim().length === 0
  const outcome = renamer.rename(props.bodyId, draft.value)
  if (outcome.refused) notice.value = `Not renamed: ${outcome.refused}`
  else if (wasBlank) notice.value = `Name cleared — back to ${renamer.genericNameOf(props.bodyId)}`
  else notice.value = ''
}

/**
 * A tap on plain, non-focusable content does not blur a focused input on touch browsers
 * (iOS Safari, Android Chrome), so "tap away" would leave the keyboard up and the draft
 * uncommitted. While editing, a pointerdown outside the field commits it.
 *
 * @param {PointerEvent} event
 */
function onWindowPointerdown(event) {
  if (!editing.value) return
  if (rootEl.value && event.target instanceof Node && rootEl.value.contains(event.target)) return
  commit()
}

function revert() {
  editing.value = false
  notice.value = ''
}

/** @param {KeyboardEvent} event */
function onInputKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    revert()
  }
}

/** @param {KeyboardEvent} event */
function onWindowKeydown(event) {
  if (event.key !== 'F2' || event.defaultPrevented) return
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
  if (isTextEntry(event.target)) return
  const el = rootEl.value
  if (!el || !el.isConnected) return
  event.preventDefault()
  start()
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('pointerdown', onWindowPointerdown, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('pointerdown', onWindowPointerdown, true)
})

// A different body starts fresh.
watch(
  () => props.bodyId,
  () => {
    editing.value = false
    notice.value = ''
  },
)
</script>

<template>
  <div ref="rootEl" class="name" data-testid="inspector-name-field">
    <div v-if="!editing" class="name__row">
      <p
        class="name__text"
        data-testid="inspector-name"
        :title="currentName"
        @click="start"
      >{{ currentName }}</p>
      <button
        type="button"
        class="name__edit"
        data-testid="inspector-name-edit"
        :aria-label="`Rename ${currentName}`"
        title="Rename (F2)"
        @click="start"
      >
        <span aria-hidden="true">✎</span>
      </button>
    </div>
    <input
      v-else
      ref="inputEl"
      v-model="draft"
      class="name__input"
      type="text"
      enterkeyhint="done"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      :maxlength="MAX_NAME_LENGTH"
      aria-label="Part name"
      data-testid="inspector-name-input"
      @keydown="onInputKeydown"
      @blur="commit"
    />
    <p v-if="duplicate" class="name__note name__note--hint" data-testid="inspector-name-hint">
      Another part is already called this
    </p>
    <p v-else-if="notice" class="name__note" data-testid="inspector-name-help">{{ notice }}</p>
  </div>
</template>

<style scoped>
.name {
  flex-shrink: 0;
  width: 100%;
}

.name__row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: var(--tap);
}

.name__text {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 650;
  color: var(--text-1);
  cursor: text;
}

.name__edit {
  flex: 0 0 auto;
  width: var(--tap);
  height: var(--tap);
  border: 0;
  background: transparent;
  color: var(--text-2);
  font-size: 16px;
  cursor: pointer;
  touch-action: manipulation;
}

.name__edit:hover,
.name__edit:focus-visible {
  color: var(--text-1);
}

.name__input {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--tap);
  padding: 0 8px;
  /* 16px: below it iOS zooms the page on focus and pushes the viewport off-screen. */
  font-size: 16px;
  font-family: inherit;
  color: var(--text-1);
  background: var(--surface-2, transparent);
  border: 1px solid var(--accent, currentColor);
  border-radius: 4px;
}

.name__note {
  margin: 2px 0 4px;
  font-size: 12px;
  color: var(--text-2);
}

.name__note--hint {
  color: var(--text-1);
}
</style>

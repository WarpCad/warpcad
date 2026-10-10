<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A My parts row's ⋯ menu (`TODO/ui-055`): **Rename**, **Duplicate**, **Export part file** and
 * **Delete**, with the two follow-up dialogs (a name field; the delete confirmation).
 *
 * - **Small screens**: the menu and both dialogs are bottom action sheets (full width, 48 px
 *   items) so a thumb reaches them; from 641 px the menu is a popover beside the row and the
 *   dialogs centre. Every target is 44 px or taller.
 * - **Rules are the store's** (`stores/library.js`): this file lays things out and forwards
 *   events. It never decides what a name may be or what Delete means.
 * - **Delete never deletes placed geometry.** With placed instances the only action offered is
 *   "Keep a copy in the project" (the part leaves My parts, the project keeps its copy) or
 *   Cancel — the store's `deletePrompt` carries the wording.
 * - A part that exists only in the open project (it arrived in a file or a gist) has no library
 *   copy to rename or delete; those two items are disabled with the reason, and **Duplicate**
 *   is how it is kept in My parts.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useLibraryStore } from '../../stores/library.js'

const props = defineProps({
  row: {
    type: /** @type {import('vue').PropType<import('../../stores/library.js').UserPartRow>} */ (Object),
    required: true,
  },
})

const library = useLibraryStore()
const trigger = ref(/** @type {HTMLButtonElement | null} */ (null))
const renameInput = ref(/** @type {HTMLInputElement | null} */ (null))
const deleteConfirm = ref(/** @type {HTMLButtonElement | null} */ (null))
const firstItem = ref(/** @type {HTMLButtonElement | null} */ (null))
const menuEl = ref(/** @type {HTMLElement | null} */ (null))
const place = ref({ top: 0, left: 0 })

const menuOpen = computed(() => library.menuOp === props.row.op)
const renaming = computed(() => library.renameOp === props.row.op)
const deleting = computed(() => library.deleteOp === props.row.op)
const projectOnlyReason = 'Only in this project — Duplicate it to keep a copy in My parts'

watch(menuOpen, async (open) => {
  if (!open) return
  const rect = trigger.value?.getBoundingClientRect()
  if (rect) place.value = { top: Math.round(rect.bottom + 4), left: Math.max(8, Math.round(rect.right - 200)) }
  await nextTick()
  // A row near the bottom of the column would put the popover below the window: slide it up
  // until it fits (the phone's bottom sheet ignores these numbers).
  const height = menuEl.value?.offsetHeight ?? 0
  if (rect && height > 0) place.value = { ...place.value, top: Math.max(8, Math.min(place.value.top, window.innerHeight - height - 8)) }
  firstItem.value?.focus()
})

watch(renaming, async (open) => {
  if (!open) return
  await nextTick()
  renameInput.value?.select()
})

watch(deleting, async (open) => {
  if (!open) return
  await nextTick()
  deleteConfirm.value?.focus()
})

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key !== 'Escape') return
  if (menuOpen.value) {
    event.preventDefault()
    library.closeMenu()
    trigger.value?.focus()
  } else if (renaming.value) {
    event.preventDefault()
    library.cancelRename()
  } else if (deleting.value) {
    event.preventDefault()
    library.cancelDelete()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="umenu__trigger"
    :data-testid="`user-part-menu-${row.op}`"
    aria-haspopup="menu"
    :aria-expanded="menuOpen"
    :aria-label="`${row.label}: more actions`"
    @click="menuOpen ? library.closeMenu() : library.openMenu(row.op)"
  >
    <span aria-hidden="true">⋯</span>
  </button>

  <Teleport to="body">
    <template v-if="menuOpen">
      <div class="umenu__backdrop" data-testid="user-part-menu-backdrop" @click="library.closeMenu()" />
      <div
        ref="menuEl"
        class="umenu"
        role="menu"
        :aria-label="`${row.label} actions`"
        data-testid="user-part-menu"
        :style="{ '--umenu-top': `${place.top}px`, '--umenu-left': `${place.left}px` }"
      >
        <p class="umenu__title">{{ row.label }}</p>
        <button
          ref="firstItem"
          type="button"
          role="menuitem"
          class="umenu__item"
          data-testid="user-part-rename"
          :disabled="!row.inLibrary"
          :title="row.inLibrary ? undefined : projectOnlyReason"
          @click="library.beginRename(row.op)"
        >
          Rename
        </button>
        <button type="button" role="menuitem" class="umenu__item" data-testid="user-part-duplicate" @click="library.duplicate(row.op)">
          Duplicate
        </button>
        <button type="button" role="menuitem" class="umenu__item" data-testid="user-part-export" @click="library.exportPart(row.op)">
          Export part file
        </button>
        <button
          type="button"
          role="menuitem"
          class="umenu__item umenu__item--danger"
          data-testid="user-part-delete"
          :disabled="!row.inLibrary"
          :title="row.inLibrary ? undefined : projectOnlyReason"
          @click="library.beginDelete(row.op)"
        >
          Delete…
        </button>
        <button type="button" class="umenu__item umenu__item--close" data-testid="user-part-menu-close" @click="library.closeMenu()">
          Close
        </button>
      </div>
    </template>

    <template v-if="renaming">
      <div class="umenu__backdrop umenu__backdrop--dim" @click="library.cancelRename()" />
      <form
        class="udialog"
        role="dialog"
        :aria-label="`Rename ${row.label}`"
        data-testid="user-part-rename-dialog"
        novalidate
        @submit.prevent="library.commitRename()"
      >
        <p class="udialog__title">Rename part</p>
        <label class="udialog__field">
          Name
          <input
            ref="renameInput"
            v-model="library.renameName"
            class="udialog__input"
            type="text"
            maxlength="200"
            autocomplete="off"
            data-testid="user-part-rename-input"
          />
        </label>
        <p v-if="library.renameProblem" class="udialog__problem" data-testid="user-part-rename-problem">{{ library.renameProblem }}</p>
        <p v-if="library.renameError" class="udialog__problem" role="alert">{{ library.renameError }}</p>
        <div class="udialog__actions">
          <button type="button" class="udialog__button" data-testid="user-part-rename-cancel" @click="library.cancelRename()">Cancel</button>
          <button
            type="submit"
            class="udialog__button udialog__button--primary"
            :disabled="library.renameProblem !== ''"
            data-testid="user-part-rename-save"
          >
            Rename
          </button>
        </div>
      </form>
    </template>

    <template v-if="deleting && library.deletePrompt">
      <div class="umenu__backdrop umenu__backdrop--dim" @click="library.cancelDelete()" />
      <div class="udialog" role="alertdialog" :aria-label="`Delete ${row.label}`" data-testid="user-part-delete-dialog">
        <p class="udialog__title">Delete {{ library.deletePrompt.name }}?</p>
        <p class="udialog__text" data-testid="user-part-delete-message">{{ library.deletePrompt.message }}</p>
        <div class="udialog__actions">
          <button type="button" class="udialog__button" data-testid="user-part-delete-cancel" @click="library.cancelDelete()">Cancel</button>
          <button
            ref="deleteConfirm"
            type="button"
            class="udialog__button udialog__button--primary"
            data-testid="user-part-delete-confirm"
            @click="library.confirmDelete()"
          >
            {{ library.deletePrompt.confirmLabel }}
          </button>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.umenu__trigger {
  /* 44 px square: the row's own height, and the minimum touch target. */
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.umenu__trigger:hover,
.umenu__trigger[aria-expanded='true'] {
  border-color: var(--border-strong);
}

.umenu__backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.umenu__backdrop--dim {
  background: rgb(0 0 0 / 0.35);
}

.umenu,
.udialog {
  position: fixed;
  z-index: 41;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text-1);
  font-family: var(--font);
  box-shadow: var(--shadow-overlay);
}

/* Phone first: a bottom action sheet. */
.umenu,
.udialog {
  right: 0;
  bottom: 0;
  left: 0;
  max-height: 80dvh;
  overflow-y: auto;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
}

.umenu__title,
.udialog__title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.umenu__item,
.udialog__button {
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.umenu__item:disabled,
.udialog__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.umenu__item--danger {
  color: var(--danger);
}

.umenu__item--close {
  margin-top: 4px;
  text-align: center;
}

.udialog__text,
.udialog__problem {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.udialog__problem {
  color: var(--danger);
}

.udialog__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}

.udialog__input {
  box-sizing: border-box;
  min-height: 48px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16 px: iOS Safari zooms the page on focus of anything smaller. */
  font-size: 16px;
}

.udialog__actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.udialog__actions .udialog__button {
  flex: 1;
  text-align: center;
}

.udialog__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast, #fff);
}

@media (min-width: 641px) {
  .umenu {
    top: var(--umenu-top);
    left: var(--umenu-left);
    right: auto;
    bottom: auto;
    width: 200px;
    border-radius: var(--radius-lg);
    padding-bottom: 10px;
  }

  .umenu__item--close {
    display: none;
  }

  .umenu__item {
    min-height: 44px;
  }

  .udialog {
    top: 50%;
    left: 50%;
    right: auto;
    bottom: auto;
    width: min(340px, calc(100vw - 32px));
    transform: translate(-50%, -50%);
    border-radius: var(--radius-lg);
    padding-bottom: 10px;
  }
}
</style>

<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Stays its own component (ui-122): one file owns a menu plus two dialogs that are bottom action sheets with 48px items below 641px and have a clear and a dimmed backdrop; BaseDialog/BaseSheet carry none of that. -->
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
 *   copy to rename, so **Rename** is disabled. The menu says, in a visible note, why the part is
 *   listed; **Delete…** is enabled and opens a dialog that names what keeps it there (only
 *   Cancel), and **Duplicate** is how it is kept in My parts (`TODO/ui-096`).
 */
import { computed, nextTick, ref, watch } from 'vue'

import { useOverlayStack } from '../../composables/useOverlayStack.js'
import { useLibraryStore } from '../../stores/library.js'
import BaseButton from '../controls/BaseButton.vue'

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
const deleteItem = ref(/** @type {HTMLButtonElement | null} */ (null))
const menuEl = ref(/** @type {HTMLElement | null} */ (null))
const place = ref({ top: 0, left: 0 })

const menuOpen = computed(() => library.menuOp === props.row.op)
const renaming = computed(() => library.renameOp === props.row.op)
const deleting = computed(() => library.deleteOp === props.row.op)
/** A broken row (`TODO/ui-095`) offers Delete and nothing else; an ordinary row may still be broken in storage. */
const isBroken = computed(() => /** @type {any} */ (props.row).broken === true)
const storedBroken = computed(() => /** @type {any} */ (props.row).storedBroken === true)
const brokenReason = "This part can't be loaded, so it can't be renamed — delete it"
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
  ;(firstItem.value ?? deleteItem.value)?.focus()
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

// One overlay with three states; Escape unwinds the innermost one open.
useOverlayStack(
  () => menuOpen.value || renaming.value || deleting.value,
  () => {
    if (menuOpen.value) {
      library.closeMenu()
      trigger.value?.focus()
    } else if (renaming.value) library.cancelRename()
    else if (deleting.value) library.cancelDelete()
  },
)
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
        :style="{ '--layout-umenu-top': `${place.top}px`, '--layout-umenu-left': `${place.left}px` }"
      >
        <p class="umenu__title">{{ row.label }}</p>
        <!-- TODO/ui-096: the reason a project-only part is listed, as text (a title never shows on touch). -->
        <p v-if="row.projectOnlyNote" class="umenu__note" data-testid="user-part-project-only-note">{{ row.projectOnlyNote }}</p>
        <button
          v-if="!isBroken"
          ref="firstItem"
          type="button"
          role="menuitem"
          class="umenu__item"
          data-testid="user-part-rename"
          :disabled="!row.inLibrary || storedBroken"
          :title="storedBroken ? brokenReason : row.inLibrary ? undefined : projectOnlyReason"
          @click="library.beginRename(row.op)"
        >
          Rename
        </button>
        <button v-if="!isBroken" type="button" role="menuitem" class="umenu__item" data-testid="user-part-duplicate" @click="library.duplicate(row.op)">
          Duplicate
        </button>
        <button v-if="!isBroken" type="button" role="menuitem" class="umenu__item" data-testid="user-part-export" @click="library.exportPart(row.op)">
          Export part file
        </button>
        <button
          ref="deleteItem"
          type="button"
          role="menuitem"
          class="umenu__item umenu__item--danger"
          data-testid="user-part-delete"
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
          <BaseButton size="large" fill data-testid="user-part-rename-cancel" @click="library.cancelRename()">Cancel</BaseButton>
          <BaseButton
            type="submit"
            variant="primary"
            size="large"
            fill
            :disabled="library.renameProblem !== ''"
            data-testid="user-part-rename-save"
          >
            Rename
          </BaseButton>
        </div>
      </form>
    </template>

    <template v-if="deleting && library.deletePrompt">
      <div class="umenu__backdrop umenu__backdrop--dim" @click="library.cancelDelete()" />
      <div class="udialog" role="alertdialog" :aria-label="`Delete ${row.label}`" data-testid="user-part-delete-dialog">
        <p class="udialog__title">Delete {{ library.deletePrompt.name }}?</p>
        <p class="udialog__text" data-testid="user-part-delete-message">{{ library.deletePrompt.message }}</p>
        <div class="udialog__actions">
          <BaseButton size="large" fill data-testid="user-part-delete-cancel" @click="library.cancelDelete()">Cancel</BaseButton>
          <BaseButton
            v-if="library.deletePrompt.confirmLabel"
            ref="deleteConfirm"
            variant="primary"
            size="large"
            fill
            data-testid="user-part-delete-confirm"
            @click="library.confirmDelete()"
          >
            {{ library.deletePrompt.confirmLabel }}
          </BaseButton>
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
  font-size: var(--text-size-2xl);
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
  z-index: var(--z-modal);
}

.umenu__backdrop--dim {
  background: var(--scrim);
}

.umenu,
.udialog {
  position: fixed;
  z-index: var(--z-modal-frame);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4h);
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
  padding-bottom: calc(var(--space-4h) + var(--layout-safe-bottom));
}

.umenu__title,
.udialog__title {
  margin: 0 0 4px;
  font-size: var(--text-size-md);
  font-weight: var(--weight-medium);
  overflow-wrap: anywhere;
}

.umenu__note {
  margin: 0 0 4px;
  font-size: var(--text-size-sm);
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.umenu__item:disabled {
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
  font-size: var(--text-size-md);
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
  gap: var(--space-2);
  font-size: var(--text-size-sm);
  color: var(--text-2);
}

.udialog__input {
  box-sizing: border-box;
  min-height: 48px;
  padding: 0 var(--space-4h);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16 px: iOS Safari zooms the page on focus of anything smaller. */
  font-size: var(--text-size-xl);
}

.udialog__actions {
  display: flex;
  gap: var(--space-4);
  margin-top: 6px;
}

@media (min-width: 641px) {
  .umenu {
    top: var(--layout-umenu-top);
    left: var(--layout-umenu-left);
    right: auto;
    bottom: auto;
    width: 200px;
    border-radius: var(--radius-lg);
    padding-bottom: var(--space-4h);
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
    padding-bottom: var(--space-4h);
  }
}
</style>

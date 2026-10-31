<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **About popup** (`TODO/ui-091`): what a person who opened a share or gist link first sees
 * over the model — the project's description (`TODO/io-023`), written by its author for exactly
 * this reader. One button, **View the model**, dismisses it; so do Esc and the backdrop. The Shared
 * view's header **About** button opens it again.
 *
 * The text arrived in a link: untrusted. It is rendered by `DescriptionText.vue` — the Markdown
 * subset (paragraphs, bullets, bold, italic, code) as elements with text content, no `v-html`, no
 * link, no image; anything else is characters on screen.
 *
 * Built on `ModalShell` (labelled `role="dialog"`, `aria-modal`, scrolls inside itself, top-anchored
 * at phone width). Focus moves to **View the model** when it opens; the owner of the popup
 * (`SharedView.vue`) puts focus back on the Shared view when it closes.
 */
import { nextTick, ref, watch } from 'vue'

import DescriptionText from '../display/DescriptionText.vue'
import ModalShell from '../storage/ModalShell.vue'
import { useEscapeToClose } from '../../composables/useEscapeToClose.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The description as stored; untrusted. */
  text: { type: String, default: '' },
})
const emit = defineEmits(['close'])

useEscapeToClose(
  () => props.open,
  () => emit('close'),
)

/** @type {import('vue').Ref<HTMLButtonElement | null>} */
const button = ref(null)
watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    button.value?.focus()
  },
  { immediate: true },
)
</script>

<template>
  <ModalShell :open="open" testid="shared-about" title="About this project" help-topic="shared-link" @backdrop="emit('close')">
    <div class="about__body" data-testid="shared-about-body">
      <DescriptionText :text="text" testid="shared-about-text" />
    </div>
    <button ref="button" type="button" class="about__button" data-testid="shared-about-close" @click="emit('close')">
      View the model
    </button>
  </ModalShell>
</template>

<style scoped>
.about__body {
  min-width: 0;
}

.about__button {
  min-height: 48px;
  padding: 0 16px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--accent-contrast);
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}
</style>

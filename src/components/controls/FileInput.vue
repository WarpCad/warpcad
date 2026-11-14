<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The visually hidden `<input type="file">` three components each hand-wrote (`TODO/ui-115`). It is
 * opened from a visible button via the exposed `open()`. It stays in the accessibility tree
 * (a screen reader can still reach it) and out of the layout. `accept`, `multiple` and
 * `data-testid` pass through; `change` is emitted with the chosen `File[]`, and the input is
 * cleared so choosing the same file twice fires again.
 */
import { ref } from 'vue'

const emit = defineEmits(['change'])

const input = ref(/** @type {HTMLInputElement | null} */ (null))

/** @param {Event} event */
function onChange(event) {
  const el = /** @type {HTMLInputElement} */ (event.target)
  const files = Array.from(el.files ?? [])
  emit('change', files)
  el.value = ''
}

/** Open the file chooser. Call from a user gesture. */
function open() {
  input.value?.click()
}

defineExpose({ open })
</script>

<template>
  <input ref="input" class="file-input" type="file" tabindex="-1" @change="onChange" />
</template>

<style scoped>
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>

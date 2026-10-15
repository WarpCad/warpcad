<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The header's **Help** entry (`TODO/ui-061`): the always-visible route into the docs, beside
 * **File ▾**. Hidden at phone width, where the header has no room for another 44px control; there
 * **File ▾ → Help** (`file-help`) is the entry, and `?` / F1 on a keyboard. It opens the Getting
 * started page and changes neither the selection nor the active tool.
 */
import { useHelpStore } from '../../stores/help.js'

const help = useHelpStore()
</script>

<template>
  <button
    type="button"
    class="help-entry"
    data-testid="help-open"
    aria-label="Help"
    title="Help (?)"
    :aria-expanded="help.isOpen"
    @click="help.toggle()"
  >
    <span class="help-entry__glyph" aria-hidden="true">?</span>
  </button>
</template>

<style scoped>
.help-entry {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: var(--tap);
  height: var(--tap);
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-family: inherit;
  cursor: pointer;
  touch-action: manipulation;
}

.help-entry:hover,
.help-entry[aria-expanded='true'] {
  border-color: var(--accent);
  color: var(--accent);
}

.help-entry__glyph {
  font-size: 15px;
  font-weight: 650;
  line-height: 1;
}

/* The File menu's Help row is the phone-width route. */
@media (max-width: 640px) {
  .help-entry {
    display: none;
  }
}
</style>

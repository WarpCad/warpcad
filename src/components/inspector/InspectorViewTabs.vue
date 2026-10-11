<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The phone-width sheet's two views (`TODO/ui-059`): **Inspector** and **Variables**, in the
 * one bottom sheet the Inspector already is — not a new surface. Hidden at tablet and laptop
 * width, where the Variables section simply stacks in the column.
 */
import { useVariablesUiStore } from '../../stores/variablesUi.js'

const ui = useVariablesUiStore()
</script>

<template>
  <div class="views" role="tablist" aria-label="Sheet view" data-testid="inspector-views">
    <button type="button" role="tab" class="views__tab" :aria-selected="ui.view === 'inspector'" data-testid="inspector-view-inspector" @click="ui.view = 'inspector'">Inspector</button>
    <button type="button" role="tab" class="views__tab" :aria-selected="ui.view === 'variables'" data-testid="inspector-view-variables" @click="ui.view = 'variables'">Variables</button>
  </div>
</template>

<style scoped>
.views {
  display: none;
}

@media (max-width: 640px) {
  .views {
    display: flex;
    gap: 6px;
    margin-bottom: 6px;
  }

  .views__tab {
    flex: 1;
    min-height: 44px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-2);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .views__tab[aria-selected='true'] {
    border-color: var(--accent);
    color: var(--text-1);
  }

  .views__tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
}
</style>

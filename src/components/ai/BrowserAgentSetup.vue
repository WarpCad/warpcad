<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Copy setup for a browser agent** (`TODO/ui-156`): copies `STARTER_BROWSER_AGENT`, the setup a
 * browser agent such as Claude in Chrome needs before the user's own request. Shown only while the
 * **Browser agents** switch is on (the tools exist to be called). The line beside the button says
 * the request goes after the paste; the text itself ends with a labelled slot for it. The text is
 * also shown under a disclosure, so it can be selected when the clipboard is blocked.
 */
import { BROWSER_AGENT_SETUP_HINT, STARTER_BROWSER_AGENT } from '../../ai/mcpPrompts.js'
import StarterCopy from './StarterCopy.vue'
</script>

<template>
  <div class="setup" data-testid="ai-webmcp-setup">
    <StarterCopy :text="STARTER_BROWSER_AGENT" label="Copy setup for a browser agent" testid="ai-webmcp-copy-setup" />
    <p class="setup__hint" data-testid="ai-webmcp-setup-hint">{{ BROWSER_AGENT_SETUP_HINT }}</p>
    <details class="setup__text">
      <summary>Show the text</summary>
      <p data-testid="ai-webmcp-setup-text">{{ STARTER_BROWSER_AGENT }}</p>
    </details>
  </div>
</template>

<style scoped>
.setup {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
}

.setup__hint,
.setup__text {
  margin: 0;
  font-size: var(--text-size-sm);
  color: var(--text-2);
}

.setup__text summary {
  min-height: 44px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
</style>

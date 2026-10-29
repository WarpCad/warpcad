<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **"Use my Claude subscription…"** (`TODO/ai-013`, `docs/decisions/ai-partner.md` decision 10).
 *
 * A Claude Pro/Max subscription does not include API access, and its sign-in token may not be
 * used by a third-party app, so the in-app Assistant cannot run on it. What can: Claude Code,
 * which a subscription does cover, driving WarpCad through its MCP server (`docs/mcp.md`). This
 * dialog says that plainly and hands over the one command that sets it up.
 *
 * Nothing here reads, stores or sends a credential. It is `ModalShell`'s top-anchored frame, so
 * at phone width it is full width and the command wraps instead of scrolling sideways.
 */
import { computed, ref, watch } from 'vue'

import { STARTER_CLAUDE_CODE } from '../../ai/mcpPrompts.js'
import { MCP_ADD_COMMAND } from '../../ai/subscriptionRoute.js'
import { useEscapeToClose } from '../../composables/useEscapeToClose.js'
import { useAssistantStore } from '../../stores/assistant.js'
import ModalShell from '../storage/ModalShell.vue'
import StarterCopy from './StarterCopy.vue'

const assistant = useAssistantStore()
const open = computed(() => assistant.view === 'subscription')

/** @type {import('vue').Ref<'' | 'copied' | 'failed'>} */
const copied = ref('')
watch(open, () => {
  copied.value = ''
})

useEscapeToClose(() => open.value, () => back())

async function copy() {
  try {
    await navigator.clipboard.writeText(MCP_ADD_COMMAND)
    copied.value = 'copied'
  } catch {
    // Clipboard blocked (an insecure origin, a denied permission): the command is selectable.
    copied.value = 'failed'
  }
}

/** Back to the key sheet — the other choice — rather than out of the Assistant altogether. */
function back() {
  assistant.openKeySheet()
}
</script>

<template>
  <ModalShell :open="open" testid="ai-subscription-sheet" title="Use your Claude subscription" help-topic="assistant-subscription" @backdrop="back()">
    <p class="route__text">
      The in-app Assistant needs an <strong>API key</strong>, which is billed separately from a Claude
      Pro or Max subscription. A subscription can't be used by the app directly.
    </p>
    <p class="route__text">
      What a subscription does cover is <strong>Claude Code</strong>. Run this once in a terminal,
      from the folder you cloned WarpCad into, then ask Claude Code to change your project file:
    </p>
    <pre class="route__command" data-testid="ai-subscription-command">{{ MCP_ADD_COMMAND }}</pre>
    <p class="route__note">
      <code>my-part.ndjson</code> is the project file: use any name, and it is created if it doesn't
      exist. Then type <code>/mcp</code> in Claude Code to see <em>warpcad</em> connected. The steps
      it adds appear in History marked <em>via mcp</em>. The full walk-through is
      <code>docs/mcp.md</code>.
    </p>
    <p class="route__text">Then, in Claude Code:</p>
    <pre class="route__command" data-testid="ai-subscription-starter">{{ STARTER_CLAUDE_CODE }}</pre>
    <StarterCopy :text="STARTER_CLAUDE_CODE" label="Copy starter for Claude Code" testid="ai-subscription-copy-starter" />
    <p class="route__status" role="status" data-testid="ai-subscription-status">
      <template v-if="copied === 'copied'">Copied</template>
      <template v-else-if="copied === 'failed'">Couldn't copy. Select the command above and copy it by hand.</template>
    </p>
    <div class="route__actions">
      <button type="button" class="route__button" data-testid="ai-subscription-back" @click="back()">
        Use an API key instead
      </button>
      <button type="button" class="route__button route__button--primary" data-testid="ai-subscription-copy" @click="copy()">
        Copy
      </button>
    </div>
  </ModalShell>
</template>

<style scoped>
.route__text,
.route__note {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.route__note {
  font-size: 12px;
  color: var(--text-2);
}

.route__command {
  margin: 0;
  padding: 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-size: 12px;
  line-height: 1.5;
  /* Wraps rather than scrolls sideways, at any width. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: all;
}

.route__status {
  margin: 0;
  min-height: 1.4em;
  font-size: 12px;
  color: var(--text-2);
}

.route__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.route__button {
  min-width: 80px;
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.route__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}
</style>

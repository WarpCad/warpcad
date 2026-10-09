<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Assistant's connection dot (`TODO/ai-004`), in `HostedDot`'s pattern: **each state
 * distinct by shape, not colour alone**.
 *
 * | `state` | Shape |
 * |---|---|
 * | `saved` | `◌` hollow ring — a key is stored, not yet tested this session |
 * | `ok` | `●` solid disc — the last test succeeded |
 * | `failed` | red `✕` — the last test failed (the words are beside it) |
 *
 * `none` (no key) renders nothing: an empty slot would read as a status. Read-only — it shows
 * what `stores/assistant.js` computed — and `aria-hidden`, because the words for each state sit
 * next to it.
 */
defineProps({
  state: {
    type: /** @type {import('vue').PropType<'none' | 'saved' | 'ok' | 'failed'>} */ (String),
    default: 'none',
  },
  testid: { type: String, default: 'assistant-dot' },
})
</script>

<template>
  <span
    v-if="state !== 'none'"
    class="connection-dot"
    :class="`connection-dot--${state}`"
    :data-dot-state="state"
    aria-hidden="true"
    :data-testid="testid"
  >
    <template v-if="state === 'failed'">✕</template>
  </span>
</template>

<style scoped>
.connection-dot {
  box-sizing: border-box;
  flex: none;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.connection-dot--saved {
  background: transparent;
  border: 2px solid var(--accent);
}

.connection-dot--ok {
  background: var(--accent-secondary);
}

.connection-dot--failed {
  background: var(--danger);
  color: var(--accent-contrast);
}
</style>

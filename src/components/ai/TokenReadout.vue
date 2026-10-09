<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The per-turn token readout (`TODO/ai-006`): what the running or last turn has used so far.
 * Tokens, not a price — the app holds no price table, and a figure that drifts from the real
 * bill is worse than none. Renders nothing before the first request returns.
 */
import { computed } from 'vue'

import { formatUsage } from '../../ai/transcript.js'

const props = defineProps({
  usage: { type: /** @type {import('vue').PropType<import('../../ai/client.js').TokenUsage>} */ (Object), required: true },
})
const text = computed(() => formatUsage(props.usage))
</script>

<template>
  <span v-if="text" class="usage" data-testid="ai-usage" title="Tokens used by this turn">{{ text }}</span>
</template>

<style scoped>
.usage {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
</style>

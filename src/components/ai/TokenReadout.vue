<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The per-turn readout (`TODO/ai-006`, cost added by `TODO/ai-013`): what the running or last
 * turn has used so far, its estimated cost and the session's. The cost is "≈" and comes from the
 * dated price table in `ai/models.js`; for a model with no price only the tokens show. Renders
 * nothing before the first request returns.
 */
import { computed } from 'vue'

import { formatReadout } from '../../ai/transcript.js'

const props = defineProps({
  usage: { type: /** @type {import('vue').PropType<import('../../ai/client.js').TokenUsage>} */ (Object), required: true },
  /** The turn's estimated dollars, or `null` when it could not be priced. */
  cost: { type: /** @type {import('vue').PropType<number | null>} */ (Number), default: null },
  /** The session's estimated dollars. */
  session: { type: Number, default: 0 },
})
const text = computed(() => formatReadout(props.usage, props.cost, props.session))
</script>

<template>
  <span v-if="text" class="usage" data-testid="ai-usage" title="Tokens used by this turn, and an estimate of what they cost. The estimate is not your bill.">{{ text }}</span>
</template>

<style scoped>
.usage {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
</style>

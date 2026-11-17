<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **?** button every tool pop-up carries in its header (`TODO/ui-061`).
 *
 * - **Precondition**: none. It is never disabled — "why can't I use this tool?" is the commonest
 *   question, and it is asked of tools that are currently disabled.
 * - **Trigger**: this button. **Feedback**: the Help sheet (`HelpSheet.vue`, mounted once in
 *   `AppView.vue`) opens on the page and heading for `topic`, over the pop-up, which stays open
 *   with its fields as they were.
 *
 * A 44px tap target (`--tap`), with the `?` kept visually small. It names a **topic id**, never a
 * URL — `src/help/topics.js` owns where a topic lives.
 */
import { computed } from 'vue'

import { topicTitle } from '../../help/topics.js'
import { useHelpStore } from '../../stores/help.js'
import IconButton from './IconButton.vue'

const props = defineProps({
  /** A key of `TOPICS` in `src/help/topics.js`. */
  topic: { type: String, required: true },
  /** The tool's name when the topic's title is not what this surface calls itself. */
  label: { type: String, default: '' },
})

const help = useHelpStore()
const toolName = computed(() => props.label || topicTitle(props.topic))
</script>

<template>
  <IconButton
    class="help-button"
    :data-testid="`help-${topic}`"
    :label="`Help: ${toolName}`"
    @click="help.open(topic)"
  >
    <span class="help-button__glyph" aria-hidden="true">?</span>
  </IconButton>
</template>

<style scoped>
.help-button__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  box-sizing: border-box;
  border: 1.5px solid currentColor;
  border-radius: var(--radius-round);
  font-size: var(--text-size-md);
  font-weight: var(--weight-bold);
  line-height: 1;
}

.help-button.icon-button:hover:not(:disabled),
.help-button.icon-button:focus-visible {
  color: var(--accent);
}
</style>

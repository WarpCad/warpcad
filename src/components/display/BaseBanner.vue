<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The one banner / strip (`TODO/ui-117`): a sentence, and the buttons that act on it. The merge
 * banner and toast, the Repeat and native-restore toasts, the app-update strip, the Inspector's
 * dependents banner and its hidden-in-view note all draw through this, and keep their own logic.
 *
 * - **`tone`**: `info` (accent tint, the default), `warn`, `danger`.
 * - **`layout`** (the deliberate differences, kept as a prop):
 *   - `strip`, full width, in flow under the header, a bottom rule (the merge, Repeat and restore strips). `warn`
 *     adds the 4 px warning edge on the left.
 *   - `dock`, the same strip with its rule on top and the safe-area inset below (the update strip,
 *     the last row of the app column).
 *   - `box`, an inline bordered, rounded box at 12 px (the Inspector's banners). `truncate` shortens it to
 *     one line at phone width.
 *   - `note`, no box: one muted 12 px line, the action inline in the text (the hidden-in-view note).
 * - **Default slot** the text. **`actions` slot** the buttons, right-aligned. **`footer` slot** a full-width second row
 *   (the merge strip's undo refusal). **`textTestid`** puts a `data-testid` on the text paragraph.
 * - Every other attribute (`data-testid`, `role`, `data-tone`) falls through to the banner.
 */
defineProps({
  /** `info | warn | danger` */
  tone: { type: String, default: 'info', validator: (/** @type {string} */ v) => ['info', 'warn', 'danger'].includes(v) },
  /** `strip | dock | box | note` */
  layout: { type: String, default: 'strip', validator: (/** @type {string} */ v) => ['strip', 'dock', 'box', 'note'].includes(v) },
  /** At phone width, keep the text to one line with an ellipsis (the `box` layout's one-line collapse). */
  truncate: { type: Boolean, default: false },
  /** `data-testid` of the text paragraph. */
  textTestid: { type: String, default: undefined },
})
</script>

<template>
  <div class="base-banner" :class="[`base-banner--${layout}`, `base-banner--${tone}`, { 'base-banner--truncate': truncate }]">
    <p class="base-banner__text" :data-testid="textTestid"><slot /></p>
    <div v-if="$slots.actions" class="base-banner__actions"><slot name="actions" /></div>
    <div v-if="$slots.footer" class="base-banner__footer"><slot name="footer" /></div>
  </div>
</template>

<style scoped>
.base-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  color: var(--text-1);
}

.base-banner__text {
  flex: 1 1 12em;
  min-width: 0;
  margin: 0;
  font-size: var(--text-size-md);
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.base-banner__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.base-banner__footer {
  flex: 1 0 100%;
}

/* strip and dock: full width, in flow */
.base-banner--strip,
.base-banner--dock {
  padding: 2px 8px 2px 14px;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-1));
}

.base-banner--strip {
  border-bottom: 1px solid var(--border);
}

.base-banner--dock {
  padding-top: 4px;
  padding-bottom: max(4px, var(--layout-safe-bottom));
  border-top: 1px solid var(--border);
}

.base-banner--dock .base-banner__text {
  flex-basis: 14em;
}

.base-banner--strip.base-banner--warn {
  border-left: 4px solid var(--warn);
  background: color-mix(in srgb, var(--warn) 16%, var(--surface-1));
}

.base-banner--strip.base-banner--danger,
.base-banner--dock.base-banner--danger {
  background: color-mix(in srgb, var(--danger) 14%, var(--surface-1));
}

@media (max-width: 480px) {
  .base-banner--strip {
    padding-left: 10px;
  }
}

/* box: the Inspector's inline banner */
.base-banner--box {
  flex-wrap: nowrap;
  gap: 8px;
  margin: 8px 0 0;
  padding: 6px 8px;
  border: 1px solid var(--warn);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 12%, transparent);
}

.base-banner--box.base-banner--danger {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.base-banner--box.base-banner--info {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.base-banner--box .base-banner__text {
  flex: 1;
  font-size: var(--text-size-sm);
  line-height: 1.4;
}

.base-banner--box .base-banner__actions {
  flex-shrink: 0;
  margin-left: 0;
}

@media (max-width: 640px) {
  .base-banner--truncate .base-banner__text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

/* note: one muted line, no box */
.base-banner--note {
  display: block;
  margin: 6px 0 0;
}

.base-banner--note .base-banner__text {
  font-size: var(--text-size-sm);
  line-height: normal;
  color: var(--text-2);
}
</style>

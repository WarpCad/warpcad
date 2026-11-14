<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A square tap target holding an inline SVG (`TODO/ui-114`). The icon goes in the default slot and
 * is drawn in `currentColor`, so the variant colours it. `label` is required: it becomes the
 * `aria-label` and, unless `title` says otherwise, the tooltip.
 *
 * Variants and sizes match `BaseButton`. `pressed` sets `aria-pressed` and the active look.
 */
import { onMounted, ref } from 'vue'

const props = defineProps({
  /** What the button does, for a screen reader and the tooltip. Required. */
  label: { type: String, default: '' },
  /** A longer tooltip (a shortcut, say) when `label` is not what hovering should show. */
  title: { type: String, default: '' },
  /** `default | primary | danger | quiet` */
  variant: { type: String, default: 'default', validator: (/** @type {string} */ v) => ['default', 'primary', 'danger', 'quiet'].includes(v) },
  /** `tap | compact` */
  size: { type: String, default: 'tap', validator: (/** @type {string} */ v) => ['tap', 'compact'].includes(v) },
  pressed: { type: Boolean, default: undefined },
  disabled: { type: Boolean, default: false },
})

const button = /** @type {import('vue').Ref<HTMLButtonElement | null>} */ (ref(null))

/** A caller's `ref` on this component reaches the button's `focus()` and the element itself. */
defineExpose({ focus: (/** @type {FocusOptions} */ options = {}) => button.value?.focus(options), el: button })

onMounted(() => {
  if (!props.label) console.warn('[IconButton] the label prop is required: an icon-only button needs an accessible name.')
})
</script>

<template>
  <button
    ref="button"
    type="button"
    class="icon-button"
    :class="[`icon-button--${variant}`, `icon-button--${size}`, { 'icon-button--active': pressed }]"
    :aria-label="label || undefined"
    :title="title || label || undefined"
    :aria-pressed="pressed"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.icon-button {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  cursor: pointer;
  touch-action: manipulation;
}

.icon-button--tap {
  width: var(--tap);
  height: var(--tap);
}

.icon-button--compact {
  width: var(--tap-compact);
  height: var(--tap-compact);
}

.icon-button:hover:not(:disabled) {
  color: var(--text-1);
}

.icon-button:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
}

.icon-button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.icon-button--danger {
  color: var(--danger);
}

.icon-button--quiet {
  color: var(--text-3);
}

.icon-button--active {
  color: var(--accent);
}

.icon-button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>

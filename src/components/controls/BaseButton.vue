<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The one text button (`TODO/ui-114`). Dialogs, strips, panels and popovers all draw their
 * buttons with this instead of a per-component `<style>` rule.
 *
 * - **Variants**: `default`, `primary` (the filled accent action), `danger`, `quiet` (no border, text only).
 * - **Sizes**: `tap` (the 44 px `--tap` target, the default), `compact` (`--tap-compact`, for dense panels) and
 *   `large` (48 px with the larger `--radius-md`, for the sheets and menus that were drawn that way).
 * - **`align="start"`** left-aligns the label (option-style buttons). **`narrow`** drops the 80 px minimum to a `--tap` square-ish target (strip and toast buttons). **`fill`** makes the button take an equal share of
 *   its flex row. **`variant="link"`** is the underlined accent text link with a full tap-height target.
 * - **`pressed`**: `true` or `false` sets `aria-pressed` and the active look; leave it unset for a plain button.
 * - Everything else (`data-testid`, `type="submit"`, `aria-*`, listeners) falls through to the `<button>`.
 *
 * Owns the focus ring (`--focus-ring`) and `touch-action: manipulation`. Every value is a token.
 * The one width is `min-width: 80px` for `tap` buttons (the AI dialogs said 80 and the storage
 * dialogs 96; `git log` gave no reason for the difference, so TODO/ui-114 unified them). `compact`
 * and `quiet` buttons size to their content.
 */
import { ref } from 'vue'

defineProps({
  /** `default | primary | danger | quiet | link | link-danger` */
  variant: { type: String, default: 'default', validator: (/** @type {string} */ v) => ['default', 'primary', 'danger', 'quiet', 'link', 'link-danger'].includes(v) },
  /** `tap | compact | large` */
  size: { type: String, default: 'tap', validator: (/** @type {string} */ v) => ['tap', 'compact', 'large'].includes(v) },
  /** `center | start`: where the label sits. */
  align: { type: String, default: 'center', validator: (/** @type {string} */ v) => ['center', 'start'].includes(v) },
  /** Shrink to a `--tap` wide target instead of 80 px (a toast's `Undo`, a banner's `✕`). */
  narrow: { type: Boolean, default: false },
  /** Take an equal share of the flex row. */
  fill: { type: Boolean, default: false },
  /** Sets `aria-pressed` and the active look. Unset leaves `aria-pressed` off. */
  pressed: { type: Boolean, default: undefined },
  disabled: { type: Boolean, default: false },
})

const button = /** @type {import('vue').Ref<HTMLButtonElement | null>} */ (ref(null))

/** A caller's `ref` on this component reaches the button's `focus()` and the element itself. */
defineExpose({ focus: (/** @type {FocusOptions} */ options = {}) => button.value?.focus(options), el: button })
</script>

<template>
  <button
    ref="button"
    type="button"
    class="base-button"
    :class="[`base-button--${variant}`, `base-button--${size}`, { 'base-button--active': pressed, 'base-button--start': align === 'start', 'base-button--fill': fill, 'base-button--narrow': narrow }]"
    :aria-pressed="pressed"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.base-button {
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: var(--text-size-lg);
  cursor: pointer;
  touch-action: manipulation;
}

.base-button--tap {
  min-width: 80px;
}

.base-button--compact {
  min-height: var(--tap-compact);
  padding: 0 10px;
  font-size: var(--text-size-sm);
}

.base-button--large {
  min-width: 80px;
  min-height: 48px;
  border-radius: var(--radius-md);
}

.base-button--start {
  text-align: left;
}

.base-button--narrow {
  min-width: var(--tap);
}

.base-button--fill {
  flex: 1;
  min-width: 0;
}

.base-button:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
}

.base-button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.base-button--danger {
  border-color: var(--danger);
  color: var(--danger);
}

.base-button--quiet {
  min-width: 0;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--text-2);
}

.base-button--link,
.base-button--link-danger {
  min-width: 0;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: var(--text-size-md);
  text-decoration: underline;
  text-underline-offset: 3px;
  overflow-wrap: anywhere;
  text-align: left;
}

.base-button--link-danger {
  color: var(--danger);
}

.base-button--quiet.base-button--narrow {
  min-width: var(--tap);
}

.base-button--active {
  border-color: var(--accent);
  color: var(--accent);
}

.base-button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>

<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The one pill chip (`TODO/ui-117`): a short status or switch label with an optional leading dot.
 * The Assistant-working chip, the MCP bridge and browser-agent chips, the Share sheet's gist chip and
 * the History row's chips draw through this.
 *
 * - **`tone`**: `plain` (outline, muted text; the History row's chips), `quiet` (the same, dimmer),
 *   `neutral` (filled `--surface-2`, full-strength text; a header chip that is a button), `accent`
 *   (accent-tinted), `secondary` (the gist chip's second accent), `warn`, `danger`.
 * - **`size`**: `sm` (10 px, the History rows), `md` (12 px, content-sized), `lg` (12 px, 28 px tall) and
 *   `tap` (12 px, the 44 px `--tap` target, for a chip that is a button).
 * - **`dot`** adds the leading dot, coloured by **`dotTone`** (`muted | accent | secondary | warn`);
 *   **`pulse`** animates it (off under `prefers-reduced-motion`). The `leading` slot replaces the dot
 *   (the browser-agent chip's switch track).
 * - **`dashed`** draws a dashed border (the History row's condition chip).
 * - **`as="button"`** makes it a real `<button type="button">` with the focus ring and touch handling.
 * - Everything else (`data-testid`, `role`, `title`, listeners) falls through to the chip.
 */
defineProps({
  /** `plain | quiet | neutral | accent | secondary | warn | danger` */
  tone: {
    type: String,
    default: 'plain',
    validator: (/** @type {string} */ v) => ['plain', 'quiet', 'neutral', 'accent', 'secondary', 'warn', 'danger'].includes(v),
  },
  /** `sm | md | lg | tap` */
  size: { type: String, default: 'md', validator: (/** @type {string} */ v) => ['sm', 'md', 'lg', 'tap'].includes(v) },
  /** `span | button` */
  as: { type: String, default: 'span', validator: (/** @type {string} */ v) => ['span', 'button'].includes(v) },
  /** A leading dot. */
  dot: { type: Boolean, default: false },
  /** `muted | accent | secondary | warn` */
  dotTone: { type: String, default: 'muted', validator: (/** @type {string} */ v) => ['muted', 'accent', 'secondary', 'warn'].includes(v) },
  /** Pulse the dot. */
  pulse: { type: Boolean, default: false },
  dashed: { type: Boolean, default: false },
})
</script>

<template>
  <component
    :is="as"
    :type="as === 'button' ? 'button' : undefined"
    class="base-chip"
    :class="[`base-chip--${tone}`, `base-chip--${size}`, { 'base-chip--button': as === 'button', 'base-chip--dashed': dashed }]"
  >
    <slot name="leading">
      <span v-if="dot" class="base-chip__dot" :class="[`base-chip__dot--${dotTone}`, { 'base-chip__dot--pulse': pulse }]" aria-hidden="true" />
    </slot>
    <slot />
  </component>
</template>

<style scoped>
.base-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  color: var(--text-2);
  font-family: inherit;
  white-space: nowrap;
}

/* sizes */
.base-chip--sm {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-size-2xs);
}

.base-chip--md {
  gap: var(--space-3);
  padding: var(--space-1) var(--space-4);
  font-size: var(--text-size-sm);
}

.base-chip--lg {
  min-height: 28px;
  padding: 0 var(--space-4h);
  font-size: var(--text-size-sm);
}

.base-chip--tap {
  min-height: var(--tap);
  padding: 0 var(--space-4h);
  font-size: var(--text-size-sm);
}

/* tones */
.base-chip--quiet {
  color: var(--text-3);
}

.base-chip--neutral,
.base-chip--warn {
  background: var(--surface-2);
  color: var(--text-1);
}

.base-chip--warn {
  border-color: var(--warn);
}

.base-chip--accent {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-1));
  color: var(--text-1);
}

.base-chip--secondary {
  border-color: var(--accent-secondary);
}

.base-chip--danger {
  border-color: var(--danger);
  color: var(--danger);
}

.base-chip--dashed {
  border-style: dashed;
}

/* a chip that is a button */
.base-chip--button {
  cursor: pointer;
  touch-action: manipulation;
}

.base-chip--button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* the dot */
.base-chip__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-round);
  background: var(--text-2);
}

.base-chip--md .base-chip__dot {
  width: 7px;
  height: 7px;
}

.base-chip__dot--accent {
  background: var(--accent);
}

.base-chip__dot--secondary {
  background: var(--accent-secondary);
}

.base-chip__dot--warn {
  background: var(--warn);
}

.base-chip__dot--pulse {
  animation: base-chip-pulse 1.4s ease-in-out infinite;
}

@keyframes base-chip-pulse {
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .base-chip__dot--pulse {
    animation: none;
  }
}
</style>

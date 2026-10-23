<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * An Operations group pop-out (`TODO/ui-082`): what a tap on a group launcher opens in the
 * toolbar's groups tier. A vertical list of the group's members **with labels**, each carrying the
 * toolbar's own gate for it (enabled/disabled, `title`), and its reason shown when it cannot run.
 * The members keep their `data-testid`s (`operation-union`, `op-repeat`, …).
 *
 * It owns no gating and runs nothing: the toolbar hands it each member already resolved and runs
 * the member when this emits `run`, closing the pop-out first — so a member that opens its own
 * popover (Align, Fillet, Split, …) opens it exactly as from the flat row.
 *
 * - **Anchored under its launcher**, inside `.ops` (absolute, not teleported): it belongs to the
 *   launcher and moves with it, and the toolbar lifts itself while it is open (`data-group-open`).
 * - **It may cover the Library** while open, the reverse of `LibrarySectionPopout`'s note: that is
 *   acceptable only because opening it takes the shared `openPopout` slot, which closes any Library
 *   pop-out, and a press on the Library is "outside" and closes this one.
 * - Closing is the toolbar's: a second tap on the launcher, a press outside, Escape, another
 *   pop-out claiming the slot, a tier change, or no member left that can run.
 */

/**
 * @typedef {object} GroupMember
 * @property {string} key The member key (`core/operationGroups.js`).
 * @property {string} testid The member button's own test id, the same as on the flat row.
 * @property {string} op The member's `data-op`.
 * @property {string} label
 * @property {string} glyph
 * @property {boolean} disabled
 * @property {string} title The member's own title: its reason when disabled.
 * @property {boolean | undefined} expanded `aria-expanded` for members that open a surface.
 */

defineProps({
  /** The group's id, for the test id hooks and `aria-controls`. */
  groupId: { type: String, required: true },
  /** The group's label, the pop-out's accessible name. */
  label: { type: String, required: true },
  /** The members, in order, resolved by the toolbar. */
  members: { type: /** @type {import('vue').PropType<GroupMember[]>} */ (Array), required: true },
})

const emit = defineEmits({
  /** @param {string} key */
  run: (key) => typeof key === 'string',
})
</script>

<template>
  <div
    :id="`ops-group-popover-${groupId}`"
    class="ops-group"
    data-testid="ops-group-popover"
    role="dialog"
    :aria-label="label"
    :data-group="groupId"
  >
    <p class="ops-group__heading">{{ label }}</p>
    <ul class="ops-group__list">
      <li v-for="member in members" :key="member.key">
        <button
          type="button"
          class="ops-group__member"
          :disabled="member.disabled"
          :data-testid="member.testid"
          :data-op="member.op"
          :aria-expanded="member.expanded"
          :title="member.title"
          :aria-label="member.title"
          @click="emit('run', member.key)"
        >
          <span class="ops-group__glyph" aria-hidden="true">{{ member.glyph }}</span>
          <span class="ops-group__text">
            <span class="ops-group__label">{{ member.label }}</span>
            <span v-if="member.disabled" class="ops-group__reason">{{ member.title }}</span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ops-group {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  /* Above the launcher row's siblings inside `.ops`; `.ops` itself is lifted while this is open. */
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  width: max-content;
  min-width: 168px;
  max-width: 232px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  /* Opaque, no blur: `.ops` already has a `backdrop-filter`, and a nested one renders
     inconsistently across engines. */
  background: var(--surface-1);
  box-shadow: var(--shadow-overlay);
  animation: ops-group-in 120ms ease-out;
}

@keyframes ops-group-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ops-group {
    animation: none;
  }
}

.ops-group__heading {
  margin: 0;
  padding: 0 4px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.ops-group__list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ops-group__member {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: var(--tap-compact);
  padding: 4px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.ops-group__glyph {
  flex: none;
  width: 16px;
  font-size: 14px;
  line-height: 1;
  text-align: center;
}

.ops-group__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.ops-group__reason {
  font-size: 10px;
  line-height: 1.3;
  color: var(--text-3);
  overflow-wrap: anywhere;
}

.ops-group__member:hover:not(:disabled),
.ops-group__member:focus-visible:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

.ops-group__member:active:not(:disabled) {
  background: var(--accent);
  color: var(--accent-contrast);
}

.ops-group__member:disabled {
  /* Dimmed, not hidden, as on the flat row: the member exists, it just cannot run yet. */
  opacity: 0.55;
  cursor: not-allowed;
  color: var(--text-3);
}
</style>

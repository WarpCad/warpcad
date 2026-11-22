<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The tag over the 3D view that names a shown clearance (`TODO/ui-153`, from `ui-145`'s cold read): the
 * translucent red body a body's **Show hidden parts** draws (a bolt's tap hole, a Pi's connector room)
 * is a keep-out zone, not a part, and the Objects row says so far from where the eye is. This says it
 * in the view, in plain words, for as long as any body shows its hidden parts, selected or not.
 *
 * A status line, not a control: the switch that turns the ghost off stays on the Objects row and in the
 * Inspector. Pointer-transparent, so a press meant for the canvas passes through it. It sits in the upper
 * part of the view, clear of the phone's bottom sheets and the toolbar row.
 */
import { computed } from 'vue'
import { useHiddenPartVisibilityStore } from '../../stores/hiddenPartVisibility.js'
import { useObjectListStore } from '../../stores/objectList.js'

const objects = useObjectListStore()
const hiddenPartVisibility = useHiddenPartVisibilityStore()

/** Names of the bodies that have hidden parts and show them right now. */
const names = computed(() =>
  objects.rows.filter((row) => hiddenPartVisibility.isShown(row.id) && row.parts.some((part) => part.hidden)).map((row) => row.name),
)

const subject = computed(() => (names.value.length === 1 ? names.value[0] : `${names.value.length} objects`))
</script>

<template>
  <p v-if="names.length > 0" class="clearance-tag" role="status" data-testid="viewport-clearance-tag">
    <span class="clearance-tag__dot" aria-hidden="true"></span>
    <span>Red ghost: room kept clear around {{ subject }}, not a part</span>
  </p>
</template>

<style scoped>
.clearance-tag {
  position: absolute;
  top: 28%;
  left: 50%;
  z-index: calc(var(--z-panel) + 1);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  box-sizing: border-box;
  width: max-content;
  max-width: min(360px, calc(100% - 32px));
  margin: 0;
  padding: var(--space-3) var(--space-5);
  transform: translateX(-50%);
  border: 1px solid var(--danger);
  border-radius: var(--radius-pill);
  background: var(--surface-glass);
  color: var(--text-1);
  font-size: var(--text-size-sm);
  line-height: 1.3;
  overflow-wrap: anywhere;
  pointer-events: none;
}

.clearance-tag__dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--danger);
  opacity: 0.6;
}
</style>

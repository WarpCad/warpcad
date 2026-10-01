<script setup>
/**
 * The Bill of Materials readout (`TODO/ui-038`) — placed hardware, kit and Raspberry Pi
 * parts tallied by spec (`M4 × 12 mm  ×3`), live.
 *
 * Read-only and selection-independent, so it lives in `display/` and the Inspector mounts
 * it as a section: at phone width the Inspector's sheet is the one panel already there,
 * and a fourth independent panel would be competing for the single bottom-sheet slot.
 * Renders nothing while no parts are placed — a primitives-only scene has no BOM to show.
 */
import { ref } from 'vue'

import { useBillOfMaterials } from '../../composables/useBillOfMaterials.js'

const { rows, total } = useBillOfMaterials()

/** Open by default: it is small, and a collapsed tally would hide the very thing it is for. */
const open = ref(true)
</script>

<template>
  <section v-if="rows.length > 0" class="bom" data-testid="bom" :data-open="open ? 'true' : 'false'">
    <button
      type="button"
      class="bom__bar"
      data-testid="bom-header"
      :aria-expanded="open"
      aria-controls="bom-list"
      @click="open = !open"
    >
      <span>Bill of materials</span>
      <span class="bom__total" data-testid="bom-total">({{ total }})</span>
      <span class="bom__chevron" :class="{ 'bom__chevron--open': open }" aria-hidden="true">▸</span>
    </button>
    <ul v-if="open" id="bom-list" class="bom__list">
      <li v-for="row in rows" :key="row.key" class="bom__row" data-testid="bom-row" :data-op="row.op">
        <span class="bom__name">
          {{ row.label }} <span v-if="row.detail" class="bom__detail">{{ row.detail }}</span>
        </span>
        <span class="bom__count" data-testid="bom-count">× {{ row.count }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.bom {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.bom__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: var(--tap, 44px);
  padding: 0;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  font-family: inherit;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-align: left;
  text-transform: uppercase;
  color: var(--text-3);
  cursor: pointer;
  touch-action: manipulation;
}

.bom__bar:hover {
  color: var(--text-1);
}

.bom__bar:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.bom__total {
  font-weight: 500;
  letter-spacing: 0;
}

.bom__chevron {
  margin-left: auto;
  transition: transform 0.12s;
}

.bom__chevron--open {
  transform: rotate(90deg);
}

.bom__list {
  margin: 0;
  padding: 4px 0;
  list-style: none;
}

.bom__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
  font-size: 13px;
  color: var(--text-1);
}

.bom__detail {
  color: var(--text-2);
}

.bom__count {
  flex: none;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
}
</style>

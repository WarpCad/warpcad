<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The selected body's size and whether it fits the printer (`TODO/io-007`): part of the
 * Inspector's selection response, so selecting a body answers "can I print this?" without
 * opening anything.
 *
 * - **Bounds**: the body's bounding box, X × Y × Z mm.
 * - **Fit badge**: green `fits`, amber `fits with its X axis vertical` (it fits once turned onto
 *   another face), or red `too large by 84 mm`. Judged **per print piece** — a split body fits
 *   when every piece does (`src/core/printPrep.js`'s `bodyFit`) — against the project's build
 *   volume (File ▾ → Project settings…), which the line under the badge names.
 * - Axis-aligned orientations only, and it says so in its tooltip; a diagonal placement can fit
 *   a part this calls too large.
 *
 * Reads the evaluated body from the document store's non-reactive `raw` — geometry never enters
 * reactive state — and recomputes when the document version or the build volume changes.
 */
import { computed } from 'vue'

import { bodyFit } from '../../core/printPrep.js'
import { useDocumentStore } from '../../stores/document.js'

const props = defineProps({
  /** The selected body's id (its lineage root). */
  bodyId: { type: String, required: true },
})

const documentStore = useDocumentStore()

const fit = computed(() => {
  void documentStore.version
  const body = documentStore.raw.bodies().find((candidate) => candidate.id === props.bodyId)
  return body ? bodyFit(body, documentStore.buildVolume) : null
})

/** @param {readonly number[]} size */
const sizeText = (size) => `${size.map((mm) => Number(mm.toFixed(1))).join(' × ')} mm`

const volumeText = computed(() => {
  const volume = documentStore.buildVolume
  return `${volume.widthMm} × ${volume.depthMm} × ${volume.heightMm} mm`
})
</script>

<template>
  <section v-if="fit" class="fit" data-testid="inspector-fit">
    <p class="fit__bounds" data-testid="inspector-fit-bounds">Bounds {{ sizeText(fit.sizeMm) }}</p>
    <p class="fit__row">
      <span
        class="fit__badge"
        data-testid="inspector-fit-badge"
        :data-fit="fit.verdict"
        title="Checked by bounding box on the six axis-aligned orientations; a diagonal placement is not tried."
      >
        {{ fit.label }}
      </span>
      <span class="fit__volume">build volume {{ volumeText }}</span>
    </p>
  </section>
</template>

<style scoped>
.fit {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fit__bounds,
.fit__row {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}

.fit__bounds {
  font-family: var(--font-mono);
}

.fit__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.fit__badge {
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 11px;
  white-space: nowrap;
}

.fit__badge[data-fit='fits'] {
  color: var(--accent-secondary);
}

.fit__badge[data-fit='fits-rotated'] {
  color: var(--warn);
}

.fit__badge[data-fit='too-large'] {
  color: var(--danger);
}

.fit__volume {
  color: var(--text-3);
}
</style>

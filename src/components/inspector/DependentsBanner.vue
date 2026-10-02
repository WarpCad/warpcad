<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector's warning banner for a breakage committed with **Leave broken**
 * (`TODO/ui-052`), in two voices:
 *
 * - on the body whose parts went missing (the Pi): *"1 item refers to parts this Pi 5
 *   doesn't have."*
 * - on the dependent (the cube): *"Snapped to Raspberry Pi 1 ▸ avjack, which no longer
 *   exists."*
 *
 * Both carry **Resolve…** (`dependents-resolve`), which reopens the repair dialog on the
 * breakages against the body whose parts are missing. The banner wraps; at phone width it
 * collapses to one line plus Resolve…, so it cannot push the Parameters section's first
 * field below the Inspector sheet's peek height.
 */
import { computed } from 'vue'

import { useParamCommands } from '../../composables/useParamCommands.js'
import { useRepairDialogStore } from '../../stores/repairDialog.js'

const props = defineProps({
  body: {
    type: /** @type {import('vue').PropType<import('../../core/inspector.js').BodyDescription>} */ (Object),
    required: true,
  },
})

const paramCommands = useParamCommands()
const repairDialog = useRepairDialogStore()

const dependents = computed(() => props.body.brokenDependents ?? [])
const references = computed(() => props.body.brokenReferences ?? [])

/** The body's current variant label — `Pi 5` — off its first enum param. */
const variant = computed(() => {
  const field = props.body.params.find((candidate) => candidate.kind === 'enum')
  const option = field?.options?.find((candidate) => Object.is(candidate.value, field.value))
  return option?.label ?? props.body.name
})

const dependentsText = computed(() => {
  const count = dependents.value.length
  const missing = dependents.value.some((breakage) => breakage.missingPieces.length > 0)
  const items = `${count} item${count === 1 ? ' refers' : 's refer'}`
  return missing
    ? `${items} to parts this ${variant.value} doesn't have.`
    : `${count} item${count === 1 ? '' : 's'} built on ${props.body.name} no longer build${count === 1 ? 's' : ''}.`
})

/** Past-tense verb per relationship, for the dependent's own sentence. */
const VERBS = Object.freeze({ Snap: 'Snapped to', Align: 'Aligned to' })

/**
 * @param {import('../../core/dependents.js').BrokenReference} reference
 * @returns {string}
 */
function referenceText(reference) {
  const verb = reference.relationship.split(' ')[0]
  const lead = /** @type {Record<string, string>} */ (VERBS)[verb] ?? 'Uses'
  if (reference.pieces.length === 0) return `${lead} ${reference.refBodyName}: ${reference.reason}`
  return `${lead} ${reference.refBodyName} ▸ ${reference.pieces.join(', ')}, which no longer exists.`
}

/** @param {string} bodyId The body whose parts the broken rows refer to. */
function resolve(bodyId) {
  const { edit, breakages } = paramCommands.resolveTargets(bodyId)
  if (breakages.length === 0) return
  repairDialog.show({ edit, breakages })
}
</script>

<template>
  <div v-if="dependents.length > 0" class="banner" role="status" data-testid="dependents-banner">
    <p class="banner__text">{{ dependentsText }}</p>
    <button type="button" class="banner__btn" data-testid="dependents-resolve" @click="resolve(body.id)">Resolve…</button>
  </div>
  <div
    v-for="reference in references"
    :key="reference.recordId"
    class="banner"
    role="status"
    data-testid="references-banner"
  >
    <p class="banner__text">{{ referenceText(reference) }}</p>
    <button type="button" class="banner__btn" data-testid="dependents-resolve" @click="resolve(reference.refBodyId)">
      Resolve…
    </button>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  padding: 6px 8px;
  border: 1px solid var(--warn, var(--danger));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn, var(--danger)) 12%, transparent);
}

.banner__text {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.banner__btn {
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.banner__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

/* Phone: one line plus Resolve…, so the Parameters section's first field stays within
   the sheet's peek height. The full sentence is still the element's text for a reader. */
@media (max-width: 640px) {
  .banner__text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}
</style>

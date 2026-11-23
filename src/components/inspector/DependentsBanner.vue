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
 * Both carry **Re-link** (or **Re-link…** where a dialog can open; `dependents-resolve`; one name, one words and one primary button with the History row's **Re-link**, `TODO/ui-146`, `TODO/ui-154`), which reopens the repair dialog on the
 * breakages against the body whose parts are missing. The banner wraps; at phone width it
 * collapses to one line plus Resolve… (`BaseBanner`'s `truncate`), so it cannot push the Parameters section's first
 * field below the Inspector sheet's peek height.
 */
import { computed } from 'vue'

import { useParamCommands } from '../../composables/useParamCommands.js'
import { useTimelineCommands } from '../../composables/useTimelineCommands.js'
import { useRepairDialogStore } from '../../stores/repairDialog.js'
import { useTimelineStore } from '../../stores/timeline.js'
import BaseButton from '../controls/BaseButton.vue'
import BaseBanner from '../display/BaseBanner.vue'
import BaseChip from '../display/BaseChip.vue'

const props = defineProps({
  body: {
    type: /** @type {import('vue').PropType<import('../../core/inspector.js').BodyDescription>} */ (Object),
    required: true,
  },
})

const paramCommands = useParamCommands()
const repairDialog = useRepairDialogStore()
const timeline = useTimelineStore()
const timelineCommands = useTimelineCommands()

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
  const missing = missingParts.value
  const items = `${count} item${count === 1 ? ' refers' : 's refer'}`
  return missing
    ? `${items} to parts this ${variant.value} doesn't have.`
    : brokenText(count)
})

/**
 * `TODO/ui-154`, `TODO/ui-155`: which step, led by its number (the number the History row shows), so a
 * phone's one-line collapse cuts only the tail: `Step 3: Chamfer Top (+Z) 5 mm, built on Cube 1.` The
 * word *broken* is the chip drawn before it (the History row's own chip). At most two steps are named;
 * the rest are counted.
 *
 * @param {number} count
 * @returns {string}
 */
function brokenText(count) {
  const suffix = ` on ${props.body.name}`
  const named = dependents.value.slice(0, 2).map((breakage) => {
    const text = timeline.rows.find((row) => row.id === breakage.dependentRecordId)?.text
    const short = text?.endsWith(suffix) ? text.slice(0, -suffix.length) : text
    return short ? `Step ${breakage.step}: ${short}` : `Step ${breakage.step}`
  })
  const more = count - named.length
  const list = named.join('; ') + (more > 0 ? ` and ${more} more` : '')
  return `${list}, built on ${props.body.name}.`
}

/** True when the Parts-missing voice applies (the repair dialog is the real choice, not a re-link). */
const missingParts = computed(() => dependents.value.some((breakage) => breakage.missingPieces.length > 0))

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

/**
 * `TODO/ui-155`: **Re-link** when pressing re-links on the spot (the History row's own label), and
 * **Re-link…** only where a dialog can open, so the ellipsis stays honest.
 *
 * @param {string} bodyId
 * @returns {string}
 */
function resolveLabel(bodyId) {
  const { breakages } = paramCommands.resolveTargets(bodyId)
  const offered = (/** @type {string} */ id) => timeline.rows.find((row) => row.id === id)?.relinkTo != null
  return breakages.length > 0 && breakages.every((breakage) => offered(breakage.dependentRecordId)) ? 'Re-link' : 'Re-link…'
}

/**
 * **Re-link…**, one name with the History row's **Re-link** (`TODO/ui-146`). When every broken
 * row has the History offer (a step inserted while rolled back moved the body it builds on),
 * it is the same action: each row is re-linked on the spot, one Undo step per row, and nothing
 * opens. Otherwise (parts a Pi variant does not have, a snap to a part that is gone) there is a
 * real choice per row, so the repair dialog opens.
 *
 * @param {string} bodyId The body whose parts the broken rows refer to.
 */
function resolve(bodyId) {
  const { edit, breakages } = paramCommands.resolveTargets(bodyId)
  if (breakages.length === 0) return
  const offered = (/** @type {string} */ id) => timeline.rows.find((row) => row.id === id)?.relinkTo != null
  if (breakages.every((breakage) => offered(breakage.dependentRecordId))) {
    for (const breakage of breakages) {
      if (!timelineCommands.relinkStep(breakage.dependentRecordId).ok) break
    }
    return
  }
  repairDialog.show({ edit, breakages })
}
</script>

<template>
  <BaseBanner
    v-if="dependents.length > 0"
    tone="warn"
    layout="box"
    truncate
    role="status"
    text-testid="dependents-banner-text"
    data-testid="dependents-banner"
  >
    <BaseChip v-if="!missingParts" class="banner__chip" tone="warn" size="sm" data-testid="dependents-broken-chip">broken</BaseChip>
    {{ dependentsText }}
    <template #actions>
      <BaseButton variant="primary" narrow data-testid="dependents-resolve" @click="resolve(body.id)">{{ resolveLabel(body.id) }}</BaseButton>
    </template>
  </BaseBanner>
  <BaseBanner
    v-for="reference in references"
    :key="reference.recordId"
    tone="warn"
    layout="box"
    truncate
    role="status"
    data-testid="references-banner"
  >
    {{ referenceText(reference) }}
    <template #actions>
      <BaseButton variant="primary" narrow data-testid="dependents-resolve" @click="resolve(reference.refBodyId)">{{ resolveLabel(reference.refBodyId) }}</BaseButton>
    </template>
  </BaseBanner>
</template>

<style scoped>
.banner__chip {
  margin-right: var(--space-2);
}
</style>

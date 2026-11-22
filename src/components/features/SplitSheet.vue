<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Its connector-kind radiogroup stays hand-built (ui-122): each option holds an SVG glyph and an aria-label, which SegmentedToggle's text-only options cannot carry. -->
<script setup>
/**
 * The Split sheet (`TODO/io-007`) — **Split…** in the Operations toolbar opens it on the one
 * selected body. Layout and fields only; every rule (defaults, what Apply writes, what is a
 * problem, what is a warning, each piece's fit) is `stores/splitSheet.js`'s.
 *
 * - **Fields**: Axis (X/Y/Z), Offset from the minimum face (mm), Joint — a grouped list
 *   written out in the store (`JOINT_CHOICES`, `TODO/core-075`), a native `<select>` with
 *   `<optgroup>`s so iOS shows it as a wheel with headings — with its one-line use under it and
 *   its own fields (a dowel's diameter; what bought dowels are; butterfly keys' Keys, Side,
 *   Depth and Cut right through, `TODO/core-075` stage 2; a tenon's width and thickness, a magnet's
 *   size — Auto, a common size or Custom — stage 3; a seam profile's sizes — rail height and neck, tabs
 *   and neck, lap length, fingers and depth — stage 4, `PROFILE_FIELDS`), Clearance (mm, per side).
 *   A whole-seam profile cannot be placed by hand, so the Place connectors toggle is disabled with
 *   the reason under it; a Half lap keeps it, with only Dowel and Magnet in the kind row. The offset is also the cut plane in
 *   the viewport (`CutPlaneOverlay.vue`) — drag its handle and this number follows.
 * - **Feedback before Apply**: each piece's name and fit verdict against the project's build
 *   volume, then any key parts the joint makes (`Dowel × 2`, `Tenon × 2`) with theirs, and **You'll also
 *   need** for bought hardware (`4 × magnets 6 × 3 mm`); a problem that would make Apply fail (Apply disabled, the reason shown); a warning
 *   that would not (zero clearance).
 * - **After Apply**: the sheet closes, the body is still selected, and the Inspector lists the
 *   two new parts and its fit badge. A kernel refusal (no room for a pin, not watertight)
 *   stays here in a `role="alert"`, and nothing is written.
 * - **No backdrop**, unlike the toolbar's popovers: the plane's handle in the viewport has to
 *   stay draggable while the sheet is open. Escape closes it.
 * - **Small screens**: a bottom sheet at phone width, every control a 44 px (`--tap`) target,
 *   16 px inputs so iOS does not zoom on focus.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import BaseButton from '../controls/BaseButton.vue'
import HelpButton from '../controls/HelpButton.vue'
import NumberField from '../controls/NumberField.vue'
import BaseSheet from '../layout/BaseSheet.vue'
import { useOverlaysStore } from '../../stores/overlays.js'
import {
  CONNECTOR_LABELS,
  JOINT_CHOICES,
  MAGNET_CHOICES,
  NO_JOINT_CHOICE,
  PROFILE_FIELDS,
  SPLIT_AXES,
  STOCK_LABELS,
  useSplitSheetStore,
} from '../../stores/splitSheet.js'

const sheet = useSplitSheetStore()
const overlays = useOverlaysStore()

watch(
  () => sheet.isOpen,
  (open) => overlays.setOpen('split-sheet', open),
  { immediate: true },
)
onBeforeUnmount(() => overlays.setOpen('split-sheet', false))

/** The kind row and its caption (`TODO/ui-153`). */
const kindGroup = ref(/** @type {HTMLElement | null} */ (null))

// Turning "Place connectors by hand" on adds the kind row near the foot of the scrolling phone sheet: scroll
// the sheet so the row and its caption are at the top, in view and clear of the Apply bar.
watch(
  () => sheet.manual,
  async (manual) => {
    if (!manual) return
    await nextTick()
    const group = kindGroup.value
    const scroller = /** @type {HTMLElement | null} */ (group?.closest('.sheet') ?? null)
    if (!group || !scroller || scroller.scrollHeight <= scroller.clientHeight) return
    const offset = group.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    scroller.scrollTop += offset - 8
  },
)

/** One short phrase per connector kind, shown under the kind row beside its name (`TODO/ui-145`). */
const CONNECTOR_BLURBS = Object.freeze({
  pins: 'a printed round post and hole',
  wedge: 'a printed diamond key',
  screwBoss: 'a ring boss that takes a screw',
  dowel: 'a hole for a bought dowel',
  butterfly: 'a bow-tie key across the seam',
  tenon: 'a printed slot and tab',
  magnet: 'a pocket for a bought magnet',
})

/** Whether the Magnet size field shows: for the Magnets joint, or while placing magnets by hand. */
const showMagnetSize = computed(
  () =>
    (!sheet.manual && sheet.joint === 'magnets') ||
    (sheet.manual && (sheet.connectorKind === 'magnet' || sheet.markers.some((marker) => marker.kind === 'magnet')))
)

/** The current seam profile's own fields (stage 4), or none. */
const profileFields = computed(() => PROFILE_FIELDS[sheet.joint] ?? [])

/**
 * One profile field's value, and setting it — blank is Auto.
 *
 * @param {string} field
 * @returns {number | null}
 */
const profileValue = (field) => /** @type {any} */ (sheet)[field] ?? null
/** @param {string} field @param {number | null} value */
function setProfileValue(field, value) {
  /** @type {any} */ (sheet)[field] = value
}

/** @param {readonly number[]} size */
const sizeText = (size) => `${size.map((mm) => Number(mm.toFixed(1))).join(' × ')} mm`
</script>

<template>
  <BaseSheet
    :open="sheet.isOpen"
    as="form"
    card
    width="300px"
    class="split"
    testid="split-sheet"
    title="Split into printable pieces"
    novalidate
    @submit.prevent="sheet.apply()"
    @escape="sheet.close()"
  >
      <div class="split__head">
        <p class="split__title">Split into printable pieces</p>
        <HelpButton topic="split" class="split__help" />
      </div>
      <p class="split__note">
        Cuts the body in two across a plane and adds a joint so the pieces fit back together. Drag the plane in
        the view, or type where to cut.
      </p>

      <label class="split__field">
        Axis
        <select
          class="split__input"
          data-testid="split-axis"
          :value="sheet.axis"
          @change="sheet.chooseAxis(/** @type {HTMLSelectElement} */ ($event.target).value)"
        >
          <option v-for="axis in SPLIT_AXES" :key="axis" :value="axis">{{ axis.toUpperCase() }}</option>
        </select>
      </label>

      <label class="split__field">
        Offset from the minimum face (mm)
        <NumberField
          v-model="sheet.offsetMm"
          class="split__input"
          unit="mm"
          :step="0.5"
          live
          data-testid="split-offset"
        />
      </label>

      <label v-if="!sheet.manual" class="split__field">
        Joint
        <select v-model="sheet.jointChoice" class="split__input" data-testid="split-joint">
          <optgroup v-for="group in JOINT_CHOICES" :key="group.heading" :label="group.heading">
            <option v-for="choice in group.choices" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
          </optgroup>
          <option :value="NO_JOINT_CHOICE.value">{{ NO_JOINT_CHOICE.label }}</option>
        </select>
      </label>
      <p v-if="!sheet.manual" class="split__hint" data-testid="split-joint-use">{{ sheet.jointUse }}</p>

      <label v-if="!sheet.manual && sheet.jointChoice === 'dowel-stock'" class="split__field">
        Dowels are
        <select v-model="sheet.stock" class="split__input" data-testid="split-dowel-stock">
          <option value="steel">{{ STOCK_LABELS.steel }}</option>
          <option value="filament">{{ STOCK_LABELS.filament }}</option>
        </select>
      </label>
      <label v-if="!sheet.manual && sheet.joint === 'dowel' && sheet.stock !== 'filament'" class="split__field">
        Dowel diameter (mm)
        <NumberField
          class="split__input"
          unit="mm"
          :step="0.5"
          :min="2"
          :max="10"
          nullable
          placeholder="Auto"
          data-testid="split-dowel-size"
          v-model="sheet.dowelSizeMm"
        />
      </label>

      <template v-if="!sheet.manual && sheet.joint === 'butterfly'">
        <label class="split__field">
          Keys
          <NumberField
            class="split__input"
            integer
            :step="1"
            :min="1"
            :max="16"
            nullable
            placeholder="Auto"
            data-testid="split-butterfly-count"
            v-model="sheet.butterflyCount"
          />
        </label>
        <label class="split__field">
          Side
          <select
            class="split__input"
            data-testid="split-butterfly-side"
            :value="sheet.butterflySide ?? ''"
            @change="sheet.butterflySide = /** @type {any} */ (/** @type {HTMLSelectElement} */ ($event.target).value || null)"
          >
            <option value="">Auto</option>
            <option v-for="side in sheet.butterflySides" :key="side.value" :value="side.value">{{ side.label }}</option>
          </select>
        </label>
        <label class="split__field">
          Depth (mm)
          <NumberField
            class="split__input"
            unit="mm"
            :step="0.5"
            :min="1"
            nullable
            placeholder="Auto"
            data-testid="split-butterfly-depth"
            :disabled="sheet.butterflyThrough"
            v-model="sheet.butterflyDepthMm"
          />
        </label>
        <label class="split__toggle">
          <input v-model="sheet.butterflyThrough" type="checkbox" data-testid="split-butterfly-through" />
          Cut right through
        </label>
      </template>

      <template v-if="!sheet.manual && sheet.joint === 'tenon'">
        <label class="split__field">
          Tenon width (mm)
          <NumberField
            class="split__input"
            unit="mm"
            :step="0.5"
            :min="6"
            :max="30"
            nullable
            placeholder="Auto"
            data-testid="split-tenon-width"
            v-model="sheet.tenonWidthMm"
          />
        </label>
        <label class="split__field">
          Tenon thickness (mm)
          <NumberField
            class="split__input"
            unit="mm"
            :step="0.5"
            :min="3"
            :max="8"
            nullable
            placeholder="Auto"
            data-testid="split-tenon-thickness"
            v-model="sheet.tenonThicknessMm"
          />
        </label>
      </template>
      <template v-if="!sheet.manual && showMagnetSize">
        <label class="split__field">
          Magnet size
          <select v-model="sheet.magnetSize" class="split__input" data-testid="split-magnet-size">
            <option v-for="choice in MAGNET_CHOICES" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
          </select>
        </label>
        <template v-if="sheet.magnetSize === 'custom'">
          <label class="split__field">
            Magnet diameter (mm)
            <NumberField
              class="split__input"
              unit="mm"
              :step="0.5"
              :min="2"
              :max="25"
              nullable
              data-testid="split-magnet-diameter"
              v-model="sheet.magnetDiameterMm"
            />
          </label>
          <label class="split__field">
            Magnet thickness (mm)
            <NumberField
              class="split__input"
              unit="mm"
              :step="0.5"
              :min="1"
              :max="10"
              nullable
              data-testid="split-magnet-thickness"
              v-model="sheet.magnetThicknessMm"
            />
          </label>
        </template>
      </template>

      <label
        v-for="profile in profileFields"
        v-show="!sheet.manual || sheet.joint === 'lap'"
        :key="profile.field"
        class="split__field"
      >
        {{ profile.label }}
        <NumberField
          class="split__input"
          :unit="profile.step === 1 ? '' : 'mm'"
          :integer="profile.step === 1"
          :step="profile.step"
          :min="profile.min"
          :max="profile.max"
          nullable
          placeholder="Auto"
          :data-testid="profile.testid"
          :model-value="profileValue(profile.field)"
          @update:model-value="setProfileValue(profile.field, $event)"
        />
      </label>

      <label class="split__toggle">
        <input
          type="checkbox"
          :checked="sheet.manual"
          :disabled="(sheet.joint === 'none' || sheet.manualBlocked !== '') && !sheet.manual"
          data-testid="split-manual-joints"
          @change="sheet.setManual(/** @type {HTMLInputElement} */ ($event.target).checked)"
        />
        Place connectors by hand
      </label>
      <p v-if="sheet.manualBlocked" class="split__hint" data-testid="split-manual-blocked">{{ sheet.manualBlocked }}</p>

      <!-- TODO/ui-153: the kind row and its caption are one group, pinned to the top of the scrolling phone
           sheet, so the pressed kind's name is never below the fold or behind the Apply bar. -->
      <div v-if="sheet.manual" ref="kindGroup" class="split__kind-group" data-testid="split-kind-group">
      <div
        class="split__kinds"
        role="radiogroup"
        aria-label="Connector kind"
        data-testid="split-connector-kind"
      >
        <button
          v-for="kind in sheet.connectorKinds"
          :key="kind"
          type="button"
          role="radio"
          class="split__kind"
          :aria-checked="sheet.connectorKind === kind"
          :aria-label="CONNECTOR_LABELS[kind]"
          :data-testid="`split-connector-kind-${kind}`"
          :data-active="sheet.connectorKind === kind"
          @click="sheet.chooseKind(kind)"
        >
          <svg class="split__kind-glyph" viewBox="-10 -10 20 20" aria-hidden="true">
            <circle v-if="kind === 'pins'" r="6" class="split__glyph--solid" />
            <path v-else-if="kind === 'wedge'" d="M0 -8 L8 0 L0 8 L-8 0 Z" class="split__glyph--solid" />
            <g v-else-if="kind === 'dowel'">
              <circle r="6" class="split__glyph--ring" />
              <circle r="2.5" class="split__glyph--solid" />
            </g>
            <path v-else-if="kind === 'butterfly'" d="M-8 -6 L0 -2 L8 -6 L8 6 L0 2 L-8 6 Z" class="split__glyph--solid" />
            <rect v-else-if="kind === 'tenon'" x="-8" y="-4" width="16" height="8" rx="4" class="split__glyph--ring" />
            <g v-else-if="kind === 'magnet'">
              <circle r="6" class="split__glyph--ring" />
              <path d="M-6 0 A6 6 0 0 1 6 0 Z" class="split__glyph--solid" />
            </g>
            <circle v-else r="6" class="split__glyph--ring" />
          </svg>
          <span class="split__kind-label">{{ CONNECTOR_LABELS[kind] }}</span>
        </button>
      </div>
      <!-- TODO/ui-145: icon-only on a phone, so the pressed kind is named under the row. -->
      <p class="split__kind-caption" role="status" data-testid="split-connector-kind-caption">
        <strong>{{ CONNECTOR_LABELS[sheet.connectorKind] }}</strong> · {{ CONNECTOR_BLURBS[sheet.connectorKind] }}
      </p>
      </div>
      <p
        v-if="sheet.manual"
        class="split__hint"
        data-testid="split-manual-hint"
        :data-face-view="sheet.faceViewUsable ? 'usable' : 'edge-on'"
      >
        <template v-if="!sheet.faceViewUsable">
          Turn the view to face the cut plane to place connectors.
        </template>
        <template v-else>
          <template v-if="sheet.joint === 'lap'">
            With the half lap: tap the half of the cut plane where the two pieces meet to drop a
            {{ CONNECTOR_LABELS[sheet.connectorKind].toLowerCase() }}; the other half is piece A's lap.
          </template>
          <template v-else-if="sheet.connectorKind === 'butterfly'">
            Tap near an edge of the cut plane to drop a butterfly key on that face; it snaps to the edge.
          </template>
          <template v-else>
            Tap the cut plane to drop a {{ CONNECTOR_LABELS[sheet.connectorKind].toLowerCase() }}; drag a marker to move
            it. Red areas have no room.
          </template>
        </template>
      </p>
      <label v-if="sheet.manual && (sheet.connectorKind === 'dowel' || sheet.markers.some((m) => m.kind === 'dowel'))" class="split__field">
        Dowels are
        <select v-model="sheet.stock" class="split__input" data-testid="split-dowel-stock">
          <option v-for="(label, value) in STOCK_LABELS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <template v-if="sheet.manual && showMagnetSize">
        <label class="split__field">
          Magnet size
          <select v-model="sheet.magnetSize" class="split__input" data-testid="split-magnet-size">
            <option v-for="choice in MAGNET_CHOICES" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
          </select>
        </label>
        <template v-if="sheet.magnetSize === 'custom'">
          <label class="split__field">
            Magnet diameter (mm)
            <NumberField
              class="split__input"
              unit="mm"
              :step="0.5"
              :min="2"
              :max="25"
              nullable
              data-testid="split-magnet-diameter"
              v-model="sheet.magnetDiameterMm"
            />
          </label>
          <label class="split__field">
            Magnet thickness (mm)
            <NumberField
              class="split__input"
              unit="mm"
              :step="0.5"
              :min="1"
              :max="10"
              nullable
              data-testid="split-magnet-thickness"
              v-model="sheet.magnetThicknessMm"
            />
          </label>
        </template>
      </template>
      <p v-if="sheet.manual && sheet.notice" class="split__problem" role="status" data-testid="split-notice">
        {{ sheet.notice }}
      </p>

      <label v-if="sheet.manual || sheet.joint !== 'none'" class="split__field">
        Clearance per side (mm)
        <NumberField
          v-model="sheet.clearanceMm"
          class="split__input"
          unit="mm"
          :step="0.05"
          :min="0"
          live
          data-testid="split-clearance"
        />
      </label>

      <ul class="split__pieces" aria-label="Pieces">
        <li
          v-for="piece in sheet.pieceFits"
          :key="piece.name"
          class="split__piece"
          data-testid="split-piece-fit"
          :data-fit="piece.verdict"
        >
          <span class="split__piece-name">{{ piece.name }}</span>
          <span class="split__piece-size">{{ sizeText(piece.sizeMm) }}</span>
          <span class="split__badge" :data-fit="piece.verdict">{{ piece.label }}</span>
        </li>
        <li
          v-for="key in sheet.keyRows"
          :key="key.title"
          class="split__piece"
          data-testid="split-key-fit"
          :data-fit="key.verdict"
          :data-count="key.count"
          :title="key.title"
        >
          <span class="split__piece-name">{{ key.name }} × {{ key.count }}</span>
          <span class="split__piece-size">{{ sizeText(key.sizeMm) }}</span>
          <span class="split__badge" :data-fit="key.verdict">{{ key.label }}</span>
        </li>
      </ul>
      <p v-if="sheet.hardwareRows.length > 0" class="split__hint" data-testid="split-hardware">
        You'll also need: {{ sheet.hardwareRows.join('; ') }}
      </p>

      <p v-if="sheet.problem" class="split__problem" data-testid="split-problem">{{ sheet.problem }}</p>
      <p v-for="warning in sheet.warnings" :key="warning" class="split__warning" data-testid="split-warning">
        {{ warning }}
      </p>
      <p v-if="sheet.error" class="split__problem" role="alert" data-testid="split-error">{{ sheet.error }}</p>

      <div class="split__actions">
        <BaseButton data-testid="split-cancel" @click="sheet.close()">Cancel</BaseButton>
        <BaseButton
          type="submit"
          variant="primary"
          :disabled="!sheet.canApply"
          data-testid="split-apply"
        >
          Apply
        </BaseButton>
      </div>
  </BaseSheet>
</template>

<style scoped>
/* The frame is `BaseSheet` (a non-modal card); what stays here is this sheet's own glass look and its
   phone grid. `body` lifts the rules over the frame's own scoped ones. */
body :global(.sheet.split) {
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
}

.split__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

/* The 44px target overhangs the title line rather than growing the header (`TODO/ui-061`). */
.split__help {
  margin: -12px -8px -12px 0;
}

.split__title {
  margin: 0;
  font-size: var(--text-size-lg);
  font-weight: var(--weight-medium);
}

.split__note {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.4;
  color: var(--text-2);
}

.split__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-size-sm);
  color: var(--text-2);
}

.split__input {
  box-sizing: border-box;
  min-height: var(--tap);
  padding: 0 var(--space-4h);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16px: iOS Safari zooms the page on focus of anything smaller. */
  font-size: var(--text-size-xl);
}

.split__pieces {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.split__piece {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-1) var(--space-4);
  font-size: var(--text-size-sm);
}

.split__piece-name {
  font-weight: var(--weight-medium);
  overflow-wrap: anywhere;
}

.split__piece-size {
  grid-column: 1;
  color: var(--text-2);
  font-family: var(--font-mono);
}

.split__badge {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  padding: var(--space-1) var(--space-4);
  border-radius: var(--radius-pill);
  border: 1px solid currentColor;
  font-size: var(--text-size-xs);
  white-space: nowrap;
}

.split__badge[data-fit='fits'] {
  color: var(--accent-secondary);
}

.split__badge[data-fit='fits-rotated'] {
  color: var(--warn);
}

.split__badge[data-fit='too-large'] {
  color: var(--danger);
}

.split__problem,
.split__warning {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.split__problem {
  color: var(--danger);
}

.split__warning {
  color: var(--warn);
}

.split__actions {
  display: flex;
  gap: var(--space-4);
  justify-content: flex-end;
}

.split__toggle {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: var(--tap);
  font-size: var(--text-size-md);
  color: var(--text-1);
}

.split__toggle input {
  width: 20px;
  height: 20px;
  margin: 0;
}

.split__kind-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.split__kinds {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.split__kind {
  flex: 1 1 auto;
  /* Seven kinds (stage 3): the row wraps rather than squeezing a button below its own content. */
  min-width: max-content;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: var(--tap);
  padding: 0 var(--space-4);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: var(--text-size-md);
  cursor: pointer;
  touch-action: manipulation;
}

.split__kind[data-active='true'] {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.split__kind-glyph {
  width: 18px;
  height: 18px;
  flex: none;
}

.split__glyph--solid {
  fill: var(--accent);
}

.split__glyph--ring {
  fill: none;
  stroke: var(--accent);
  stroke-width: 3;
}

.split__kind-caption {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.4;
  color: var(--text-2);
}

.split__hint {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.4;
  color: var(--text-2);
}

/* Phone: a bottom sheet, so the viewport — and the cut plane — stay visible above it. */
@media (max-width: 640px) {
  body :global(.sheet.split) {
    /* Two fields per row and no intro paragraph: the sheet stays under half the screen, so the
       cut plane's handle (at the middle of the body) is not hidden behind it. */
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3) var(--space-4h);
  }

  .split > .split__title,
  .split > .split__toggle,
  .split > .split__kind-group,
  .split > .split__hint,
  .split > .split__pieces,
  .split > .split__problem,
  .split > .split__warning,
  .split > .split__actions {
    grid-column: 1 / -1;
  }

  .split__note {
    display: none;
  }

  /* The cut plane and its connector markers sit just above the middle of the screen, and the
     sheet has grown (Place connectors toggle, picker, hint) — so it is capped lower, scrolls
     inside, and keeps Apply in reach, rather than burying them (the `io-007` finding, again). */
  body :global(.sheet.split) {
    max-height: 42dvh;
  }

  /* The kind row and its caption stay at the top of the scrolling sheet (`TODO/ui-153`). */
  .split > .split__kind-group {
    position: sticky;
    top: -12px;
    z-index: calc(var(--z-panel) + 1);
    margin: 0 -12px;
    padding: var(--space-3) var(--space-5);
    background: var(--surface-glass);
    backdrop-filter: blur(6px);
  }

  .split > .split__actions {
    position: sticky;
    bottom: calc(-12px - var(--layout-safe-bottom));
    margin: 0 -12px calc(-12px - var(--layout-safe-bottom));
    padding: var(--space-3) var(--space-5) calc(var(--space-5) + var(--layout-safe-bottom));
    background: var(--surface-glass);
  }

  /* Place connectors: the kind picker is a horizontal icon row beneath the two-column grid. */
  .split__kind-label {
    display: none;
  }

  .split__hint {
    font-size: var(--text-size-xs);
  }

  .split__field,
  .split__input {
    min-width: 0;
    width: 100%;
  }
}
</style>

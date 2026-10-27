<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
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
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'

import HelpButton from '../controls/HelpButton.vue'
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

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key !== 'Escape' || !sheet.isOpen) return
  event.preventDefault()
  sheet.close()
}
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))

/**
 * The dowel diameter field: blank is the search's own size.
 *
 * @param {Event} event
 */
function onDowelSize(event) {
  const text = /** @type {HTMLInputElement} */ (event.target).value.trim()
  const value = Number(text)
  sheet.dowelSizeMm = text === '' || !Number.isFinite(value) ? null : value
}

/**
 * A whole-number or decimal field where blank means Auto.
 *
 * @param {Event} event
 * @returns {number | null}
 */
function autoNumber(event) {
  const text = /** @type {HTMLInputElement} */ (event.target).value.trim()
  const value = Number(text)
  return text === '' || !Number.isFinite(value) ? null : value
}

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
/** @param {string} field @param {Event} event */
function setProfileValue(field, event) {
  /** @type {any} */ (sheet)[field] = autoNumber(event)
}

/** @param {readonly number[]} size */
const sizeText = (size) => `${size.map((mm) => Number(mm.toFixed(1))).join(' × ')} mm`
</script>

<template>
  <Teleport to="body">
    <form
      v-if="sheet.isOpen"
      class="split"
      role="dialog"
      aria-label="Split into printable pieces"
      data-testid="split-sheet"
      novalidate
      @submit.prevent="sheet.apply()"
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
        <input
          v-model.number="sheet.offsetMm"
          class="split__input"
          type="number"
          step="0.5"
          inputmode="decimal"
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
        <input
          class="split__input"
          type="number"
          step="0.5"
          min="2"
          max="10"
          inputmode="decimal"
          placeholder="Auto"
          data-testid="split-dowel-size"
          :value="sheet.dowelSizeMm ?? ''"
          @change="onDowelSize"
        />
      </label>

      <template v-if="!sheet.manual && sheet.joint === 'butterfly'">
        <label class="split__field">
          Keys
          <input
            class="split__input"
            type="number"
            step="1"
            min="1"
            max="16"
            inputmode="numeric"
            placeholder="Auto"
            data-testid="split-butterfly-count"
            :value="sheet.butterflyCount ?? ''"
            @change="sheet.butterflyCount = autoNumber($event)"
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
          <input
            class="split__input"
            type="number"
            step="0.5"
            min="1"
            inputmode="decimal"
            placeholder="Auto"
            data-testid="split-butterfly-depth"
            :disabled="sheet.butterflyThrough"
            :value="sheet.butterflyDepthMm ?? ''"
            @change="sheet.butterflyDepthMm = autoNumber($event)"
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
          <input
            class="split__input"
            type="number"
            step="0.5"
            min="6"
            max="30"
            inputmode="decimal"
            placeholder="Auto"
            data-testid="split-tenon-width"
            :value="sheet.tenonWidthMm ?? ''"
            @change="sheet.tenonWidthMm = autoNumber($event)"
          />
        </label>
        <label class="split__field">
          Tenon thickness (mm)
          <input
            class="split__input"
            type="number"
            step="0.5"
            min="3"
            max="8"
            inputmode="decimal"
            placeholder="Auto"
            data-testid="split-tenon-thickness"
            :value="sheet.tenonThicknessMm ?? ''"
            @change="sheet.tenonThicknessMm = autoNumber($event)"
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
            <input
              class="split__input"
              type="number"
              step="0.5"
              min="2"
              max="25"
              inputmode="decimal"
              data-testid="split-magnet-diameter"
              :value="sheet.magnetDiameterMm ?? ''"
              @change="sheet.magnetDiameterMm = autoNumber($event)"
            />
          </label>
          <label class="split__field">
            Magnet thickness (mm)
            <input
              class="split__input"
              type="number"
              step="0.5"
              min="1"
              max="10"
              inputmode="decimal"
              data-testid="split-magnet-thickness"
              :value="sheet.magnetThicknessMm ?? ''"
              @change="sheet.magnetThicknessMm = autoNumber($event)"
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
        <input
          class="split__input"
          type="number"
          :step="profile.step"
          :min="profile.min"
          :max="profile.max"
          :inputmode="profile.step === 1 ? 'numeric' : 'decimal'"
          placeholder="Auto"
          :data-testid="profile.testid"
          :value="profileValue(profile.field) ?? ''"
          @change="setProfileValue(profile.field, $event)"
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

      <div
        v-if="sheet.manual"
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
            <input
              class="split__input"
              type="number"
              step="0.5"
              min="2"
              max="25"
              inputmode="decimal"
              data-testid="split-magnet-diameter"
              :value="sheet.magnetDiameterMm ?? ''"
              @change="sheet.magnetDiameterMm = autoNumber($event)"
            />
          </label>
          <label class="split__field">
            Magnet thickness (mm)
            <input
              class="split__input"
              type="number"
              step="0.5"
              min="1"
              max="10"
              inputmode="decimal"
              data-testid="split-magnet-thickness"
              :value="sheet.magnetThicknessMm ?? ''"
              @change="sheet.magnetThicknessMm = autoNumber($event)"
            />
          </label>
        </template>
      </template>
      <p v-if="sheet.manual && sheet.notice" class="split__problem" role="status" data-testid="split-notice">
        {{ sheet.notice }}
      </p>

      <label v-if="sheet.manual || sheet.joint !== 'none'" class="split__field">
        Clearance per side (mm)
        <input
          v-model.number="sheet.clearanceMm"
          class="split__input"
          type="number"
          step="0.05"
          min="0"
          inputmode="decimal"
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
        <button type="button" class="split__button" data-testid="split-cancel" @click="sheet.close()">Cancel</button>
        <button
          type="submit"
          class="split__button split__button--primary"
          :disabled="!sheet.canApply"
          data-testid="split-apply"
        >
          Apply
        </button>
      </div>
    </form>
  </Teleport>
</template>

<style scoped>
.split {
  position: fixed;
  top: 64px;
  right: 16px;
  z-index: 31;
  box-sizing: border-box;
  width: min(300px, calc(100vw - 32px));
  max-height: calc(100dvh - 96px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
  color: var(--text-1);
  font-family: var(--font);
}

.split__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* The 44px target overhangs the title line rather than growing the header (`TODO/ui-061`). */
.split__help {
  margin: -12px -8px -12px 0;
}

.split__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.split__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-2);
}

.split__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}

.split__input {
  box-sizing: border-box;
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16px: iOS Safari zooms the page on focus of anything smaller. */
  font-size: 16px;
}

.split__pieces {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.split__piece {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 8px;
  font-size: 12px;
}

.split__piece-name {
  font-weight: 600;
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
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid currentColor;
  font-size: 11px;
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
  font-size: 12px;
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
  gap: 8px;
  justify-content: flex-end;
}

.split__button {
  min-width: 88px;
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.split__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.split__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.split__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--tap);
  font-size: 13px;
  color: var(--text-1);
}

.split__toggle input {
  width: 20px;
  height: 20px;
  margin: 0;
}

.split__kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.split__kind {
  flex: 1 1 auto;
  /* Seven kinds (stage 3): the row wraps rather than squeezing a button below its own content. */
  min-width: max-content;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--tap);
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
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

.split__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-2);
}

/* Phone: a bottom sheet, so the viewport — and the cut plane — stay visible above it. */
@media (max-width: 640px) {
  .split {
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    /* Two fields per row and no intro paragraph: the sheet stays under half the screen, so the
       cut plane's handle (at the middle of the body) is not hidden behind it. */
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 10px;
  }

  .split > .split__title,
  .split > .split__toggle,
  .split > .split__kinds,
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
  .split {
    max-height: 42dvh;
  }

  .split > .split__actions {
    position: sticky;
    bottom: calc(-12px - env(safe-area-inset-bottom, 0px));
    margin: 0 -12px calc(-12px - env(safe-area-inset-bottom, 0px));
    padding: 6px 12px calc(12px + env(safe-area-inset-bottom, 0px));
    background: var(--surface-glass);
  }

  /* Place connectors: the kind picker is a horizontal icon row beneath the two-column grid. */
  .split__kind-label {
    display: none;
  }

  .split__hint {
    font-size: 11px;
  }

  .split__field,
  .split__input {
    min-width: 0;
    width: 100%;
  }
}
</style>
